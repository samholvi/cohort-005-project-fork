import { and, asc, eq, inArray, sql } from "drizzle-orm";
import * as schema from "~/db/schema";
import {
  getPerson,
  notifyInBackground,
  sendWithRetries,
  type Db,
} from "./deliver.server";
import type { InactiveOnCourseData } from "./descriptions/inactivity";
import { NotificationKind } from "./kinds";
import { defaultProvider, type NotificationProvider } from "./provider.server";

// ─── Inactive on a course ───
// There is no scheduler: the app layout loader calls runInactivityCheck for
// the signed-in Student on every visit, without awaiting it. An Enrollment is
// due when its course is Published, the Student hasn't Finished it, and their
// last watch on it (or enrolledAt, if they never watched) is 7 or more days
// before `now`. Each stretch of inactivity is nudged once: claiming sets
// inactivityNotifiedAt, and only a later watch starts a new stretch.

const INACTIVE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const { enrollments, courses, modules, lessons, lessonProgress } = schema;

/**
 * Nudges `userId` about every course they've become Inactive on. Call from
 * the layout loader without awaiting; it never rejects.
 */
export function runInactivityCheck(
  db: Db,
  userId: number,
  now: Date,
  provider: NotificationProvider = defaultProvider()
): Promise<void> {
  return notifyInBackground(
    NotificationKind.InactiveOnCourse,
    now,
    async () => {
      const claimed = claimDueEnrollments(db, userId, now);
      if (claimed.length === 0) return;

      const student = getPerson(db, userId);
      if (!student) return;

      await Promise.all(
        claimed.map((courseId) =>
          notifyInBackground(
            `${NotificationKind.InactiveOnCourse} course ${courseId}`,
            now,
            async () => {
              const data = describeProgress(db, userId, courseId);
              if (!data) return;
              await sendWithRetries(
                provider,
                NotificationKind.InactiveOnCourse,
                [student],
                data
              );
            }
          )
        )
      );
    }
  );
}

/**
 * Marks the Student's due Enrollments as notified in one conditional update
 * and returns their course ids. Only the caller that gets a row back sends,
 * so overlapping checks never double-send.
 */
function claimDueEnrollments(db: Db, userId: number, now: Date): number[] {
  const cutoff = new Date(now.getTime() - INACTIVE_AFTER_MS).toISOString();

  const lastWatch = sql`coalesce(
    (select max(${schema.videoWatchEvents.createdAt})
       from ${schema.videoWatchEvents}
       join ${lessons} on ${lessons.id} = ${schema.videoWatchEvents.lessonId}
       join ${modules} on ${modules.id} = ${lessons.moduleId}
      where ${modules.courseId} = ${enrollments.courseId}
        and ${schema.videoWatchEvents.userId} = ${enrollments.userId}),
    ${enrollments.enrolledAt})`;

  const published = sql`exists (
    select 1 from ${courses}
     where ${courses.id} = ${enrollments.courseId}
       and ${courses.status} = ${schema.CourseStatus.Published})`;

  // Finished means every lesson is complete, so an unfinished course has a
  // lesson without a completed progress row. A course with no lessons has
  // nothing to pick up at, so it never counts as unfinished.
  const unfinished = sql`exists (
    select 1 from ${lessons}
      join ${modules} on ${modules.id} = ${lessons.moduleId}
     where ${modules.courseId} = ${enrollments.courseId}
       and not exists (
         select 1 from ${lessonProgress}
          where ${lessonProgress.lessonId} = ${lessons.id}
            and ${lessonProgress.userId} = ${enrollments.userId}
            and ${lessonProgress.status} = ${schema.LessonProgressStatus.Completed}))`;

  return db
    .update(enrollments)
    .set({ inactivityNotifiedAt: now.toISOString() })
    .where(
      and(
        eq(enrollments.userId, userId),
        published,
        unfinished,
        sql`${lastWatch} <= ${cutoff}`,
        sql`(${enrollments.inactivityNotifiedAt} is null
             or ${enrollments.inactivityNotifiedAt} < ${lastWatch})`
      )
    )
    .returning({ courseId: enrollments.courseId })
    .all()
    .map((row) => row.courseId);
}

/**
 * The course's next lesson (first incomplete one in course order) and the
 * share of lessons complete, rounded down so an unfinished course never reads
 * 100%. Null when the course has no incomplete lesson left.
 */
function describeProgress(
  db: Db,
  userId: number,
  courseId: number
): InactiveOnCourseData | null {
  const course = db
    .select({ title: courses.title, slug: courses.slug })
    .from(courses)
    .where(eq(courses.id, courseId))
    .get();
  if (!course) return null;

  const courseLessons = db
    .select({ id: lessons.id, title: lessons.title })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .orderBy(asc(modules.position), asc(lessons.position))
    .all();
  if (courseLessons.length === 0) return null;

  const completedIds = new Set(
    db
      .select({ lessonId: lessonProgress.lessonId })
      .from(lessonProgress)
      .where(
        and(
          eq(lessonProgress.userId, userId),
          eq(lessonProgress.status, schema.LessonProgressStatus.Completed),
          inArray(
            lessonProgress.lessonId,
            courseLessons.map((lesson) => lesson.id)
          )
        )
      )
      .all()
      .map((row) => row.lessonId)
  );

  const next = courseLessons.find((lesson) => !completedIds.has(lesson.id));
  if (!next) return null;

  const completed = completedIds.size;

  return {
    courseTitle: course.title,
    courseSlug: course.slug,
    lessonId: next.id,
    lessonTitle: next.title,
    percentComplete:
      completed === 0
        ? null
        : Math.floor((completed / courseLessons.length) * 100),
  };
}
