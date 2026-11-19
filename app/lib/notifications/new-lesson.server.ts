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
 * is marked notified only once the provider accepts.
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
      studentsNotifiedAt: schema.lessons.studentsNotifiedAt,
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
  if (lesson.studentsNotifiedAt !== null) {
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
    return { ok: false, reason: "delivery-failed" };
  }

  const notifiedAt = now.toISOString();
  db.update(schema.lessons)
    .set({ studentsNotifiedAt: notifiedAt })
    .where(
      and(
        eq(schema.lessons.id, lessonId),
        isNull(schema.lessons.studentsNotifiedAt)
      )
    )
    .run();
  return { ok: true, notifiedAt };
}
