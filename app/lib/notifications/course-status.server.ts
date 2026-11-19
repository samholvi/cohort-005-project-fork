import { eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { CourseStatus, UserRole } from "~/db/schema";
import {
  getPeople,
  getPerson,
  notifyInBackground,
  sendWithRetries,
  type Db,
} from "./deliver.server";
import type {
  CoursePublishedData,
  CourseStatusChangedData,
} from "./descriptions/course-status";
import { NotificationKind } from "./kinds";
import { defaultProvider, type NotificationProvider } from "./provider.server";

/**
 * Course published / Course status changed. Call after a course's status was
 * saved, with the status it had before, without awaiting; it never rejects.
 *
 * - The course's Instructor publishes it: Course published to every Platform
 *   Admin (minus the Instructor, should they be one).
 * - Anyone else (only Platform Admins may) publishes or archives it: Course
 *   status changed to the Instructor.
 *
 * Nothing is sent when the status didn't actually change, or for a move back
 * to draft.
 */
export function notifyCourseStatusChange(
  db: Db,
  courseId: number,
  previousStatus: CourseStatus,
  actorId: number,
  now: Date,
  provider: NotificationProvider = defaultProvider()
): Promise<void> {
  return notifyInBackground("course status change", now, async () => {
    const course = db
      .select({
        id: schema.courses.id,
        title: schema.courses.title,
        slug: schema.courses.slug,
        status: schema.courses.status,
        instructorId: schema.courses.instructorId,
      })
      .from(schema.courses)
      .where(eq(schema.courses.id, courseId))
      .get();
    if (!course || course.status === previousStatus) return;

    const actor = getPerson(db, actorId);
    if (!actor) return;

    const status = course.status;
    if (status === CourseStatus.Draft) return;

    if (actorId === course.instructorId) {
      if (status !== CourseStatus.Published) return;
      const data: CoursePublishedData = {
        actorName: actor.name,
        courseTitle: course.title,
        courseSlug: course.slug,
      };
      await sendWithRetries(
        provider,
        NotificationKind.CoursePublished,
        getPlatformAdmins(db),
        data,
        actor
      );
      return;
    }

    const instructor = getPerson(db, course.instructorId);
    if (!instructor) return;
    const data: CourseStatusChangedData = {
      status,
      courseTitle: course.title,
      courseId: course.id,
    };
    await sendWithRetries(
      provider,
      NotificationKind.CourseStatusChanged,
      [instructor],
      data,
      actor
    );
  });
}

function getPlatformAdmins(db: Db) {
  const ids = db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.role, UserRole.Admin))
    .all()
    .map((user) => user.id);
  return getPeople(db, ids);
}
