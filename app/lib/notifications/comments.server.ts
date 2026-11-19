import { eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import {
  getPerson,
  notifyInBackground,
  sendWithRetries,
  type Db,
} from "./deliver.server";
import type { CommentReplyData } from "./descriptions/comments";
import { NotificationKind } from "./kinds";
import { defaultProvider, type NotificationProvider } from "./provider.server";

/**
 * Reply to your comment: tells the parent comment's author, whatever their
 * role, that `actorId` replied. Call after the reply is saved, without
 * awaiting; it never rejects.
 */
export function notifyCommentReply(
  db: Db,
  replyId: number,
  actorId: number,
  now: Date,
  provider: NotificationProvider = defaultProvider()
): Promise<void> {
  return notifyInBackground(NotificationKind.CommentReply, now, async () => {
    const reply = db
      .select({
        parentId: schema.comments.parentId,
        lessonId: schema.lessons.id,
        lessonTitle: schema.lessons.title,
        courseSlug: schema.courses.slug,
      })
      .from(schema.comments)
      .innerJoin(schema.lessons, eq(schema.comments.lessonId, schema.lessons.id))
      .innerJoin(schema.modules, eq(schema.lessons.moduleId, schema.modules.id))
      .innerJoin(schema.courses, eq(schema.modules.courseId, schema.courses.id))
      .where(eq(schema.comments.id, replyId))
      .get();
    if (!reply || reply.parentId === null) return;

    const parent = db
      .select({ userId: schema.comments.userId })
      .from(schema.comments)
      .where(eq(schema.comments.id, reply.parentId))
      .get();
    const actor = getPerson(db, actorId);
    if (!parent || !actor) return;

    const author = getPerson(db, parent.userId);
    if (!author) return;

    const data: CommentReplyData = {
      actorName: actor.name,
      lessonTitle: reply.lessonTitle,
      lessonId: reply.lessonId,
      courseSlug: reply.courseSlug,
      commentId: replyId,
    };

    await sendWithRetries(
      provider,
      NotificationKind.CommentReply,
      [author],
      data,
      actor
    );
  });
}
