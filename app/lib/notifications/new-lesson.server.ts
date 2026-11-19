import { and, eq, isNull } from "drizzle-orm";
import * as schema from "~/db/schema";
import {
  getPeople,
  getPerson,
  sendWithRetries,
  type Db,
} from "./deliver.server";
import type { NewLessonData } from "./descriptions/new-lesson";
import { NotificationKind } from "./kinds";
import { defaultProvider, type NotificationProvider } from "./provider.server";

export type NotifyEnrolledStudentsResult =
  | { ok: true; notifiedAt: string }
  | {
      ok: false;
      reason: "course-not-published" | "already-notified" | "delivery-failed";
    };

/**
 * New lesson: announces the lesson to every Student with an Enrollment on its
 * course. Unlike other kinds this is awaited, retries included, and the lesson
 * ends up marked notified only once the provider accepts.
 *
 * Once-only is atomic: the lesson is claimed (marked) with a conditional
 * update before the send, so an overlapping press is refused as already
 * notified. If the provider gives up, the claim is released and the lesson is
 * unmarked again.
 */
export async function notifyEnrolledStudents(
  db: Db,
  lessonId: number,
  actorId: number,
  now: Date,
  provider: NotificationProvider = defaultProvider()
): Promise<NotifyEnrolledStudentsResult> {
  const lesson = db
    .select({
      lessonTitle: schema.lessons.title,
      courseId: schema.courses.id,
      instructorId: schema.courses.instructorId,
      courseTitle: schema.courses.title,
      courseSlug: schema.courses.slug,
      courseStatus: schema.courses.status,
    })
    .from(schema.lessons)
    .innerJoin(schema.modules, eq(schema.lessons.moduleId, schema.modules.id))
    .innerJoin(schema.courses, eq(schema.modules.courseId, schema.courses.id))
    .where(eq(schema.lessons.id, lessonId))
    .get();
  if (!lesson) throw new Error(`Lesson ${lessonId} not found`);
  if (lesson.courseStatus !== schema.CourseStatus.Published) {
    return { ok: false, reason: "course-not-published" };
  }

  const notifiedAt = now.toISOString();
  const claim = db
    .update(schema.lessons)
    .set({ studentsNotifiedAt: notifiedAt })
    .where(
      and(
        eq(schema.lessons.id, lessonId),
        isNull(schema.lessons.studentsNotifiedAt)
      )
    )
    .run();
  if (claim.changes === 0) {
    return { ok: false, reason: "already-notified" };
  }

  const studentIds = db
    .select({ userId: schema.enrollments.userId })
    .from(schema.enrollments)
    .where(eq(schema.enrollments.courseId, lesson.courseId))
    .all()
    .map((enrollment) => enrollment.userId)
    .filter((userId) => userId !== lesson.instructorId);

  const data: NewLessonData = {
    courseTitle: lesson.courseTitle,
    lessonTitle: lesson.lessonTitle,
    lessonId,
    courseSlug: lesson.courseSlug,
  };

  try {
    await sendWithRetries(
      provider,
      NotificationKind.NewLesson,
      getPeople(db, studentIds),
      data,
      getPerson(db, actorId) ?? undefined
    );
  } catch (error) {
    console.error(
      `[notifications] gave up on ${NotificationKind.NewLesson} for lesson ${lessonId} (triggered ${now.toISOString()})`,
      error
    );
    db.update(schema.lessons)
      .set({ studentsNotifiedAt: null })
      .where(
        and(
          eq(schema.lessons.id, lessonId),
          eq(schema.lessons.studentsNotifiedAt, notifiedAt)
        )
      )
      .run();
    return { ok: false, reason: "delivery-failed" };
  }

  return { ok: true, notifiedAt };
}
