import { eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import {
  getPerson,
  notifyInBackground,
  sendWithRetries,
  type Db,
} from "./deliver.server";
import type { NewQuestionData, NewRatingData } from "./descriptions/engagement";
import { NotificationKind } from "./kinds";
import { defaultProvider, type NotificationProvider } from "./provider.server";

/**
 * New question: tells the course's Instructor that `actorId` asked a
 * top-level question on one of their lessons. Replies send nothing. Call
 * after the comment is saved, without awaiting; it never rejects.
 */
export function notifyNewQuestion(
  db: Db,
  commentId: number,
  actorId: number,
  now: Date,
  provider: NotificationProvider = defaultProvider()
): Promise<void> {
  return notifyInBackground(NotificationKind.NewQuestion, now, async () => {
    const question = db
      .select({
        parentId: schema.comments.parentId,
        lessonTitle: schema.lessons.title,
        instructorId: schema.courses.instructorId,
      })
      .from(schema.comments)
      .innerJoin(schema.lessons, eq(schema.comments.lessonId, schema.lessons.id))
      .innerJoin(schema.modules, eq(schema.lessons.moduleId, schema.modules.id))
      .innerJoin(schema.courses, eq(schema.modules.courseId, schema.courses.id))
      .where(eq(schema.comments.id, commentId))
      .get();
    if (!question || question.parentId !== null) return;

    const actor = getPerson(db, actorId);
    const instructor = getPerson(db, question.instructorId);
    if (!actor || !instructor) return;

    const data: NewQuestionData = {
      actorName: actor.name,
      lessonTitle: question.lessonTitle,
      commentId,
    };

    await sendWithRetries(
      provider,
      NotificationKind.NewQuestion,
      [instructor],
      data,
      actor
    );
  });
}

/**
 * New rating: tells the course's Instructor that `actorId` rated or re-rated
 * the course, with the stars as they stand now. Call after the rating is
 * saved, without awaiting; it never rejects.
 */
export function notifyNewRating(
  db: Db,
  ratingId: number,
  actorId: number,
  now: Date,
  provider: NotificationProvider = defaultProvider()
): Promise<void> {
  return notifyInBackground(NotificationKind.NewRating, now, async () => {
    const courseRating = db
      .select({
        rating: schema.courseRatings.rating,
        courseTitle: schema.courses.title,
        courseSlug: schema.courses.slug,
        instructorId: schema.courses.instructorId,
      })
      .from(schema.courseRatings)
      .innerJoin(
        schema.courses,
        eq(schema.courseRatings.courseId, schema.courses.id)
      )
      .where(eq(schema.courseRatings.id, ratingId))
      .get();
    if (!courseRating) return;

    const actor = getPerson(db, actorId);
    const instructor = getPerson(db, courseRating.instructorId);
    if (!actor || !instructor) return;

    const data: NewRatingData = {
      actorName: actor.name,
      courseTitle: courseRating.courseTitle,
      courseSlug: courseRating.courseSlug,
      rating: courseRating.rating,
    };

    await sendWithRetries(
      provider,
      NotificationKind.NewRating,
      [instructor],
      data,
      actor
    );
  });
}
