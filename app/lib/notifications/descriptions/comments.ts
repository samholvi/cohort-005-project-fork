import { z } from "zod";
import { defineKind, type KindDescribers } from "./define";

export const commentReplyData = z.object({
  actorName: z.string(),
  lessonTitle: z.string(),
  lessonId: z.number().int(),
  courseSlug: z.string(),
  commentId: z.number().int(),
});

export type CommentReplyData = z.infer<typeof commentReplyData>;

export const commentDescribers: KindDescribers = {
  "comment-reply": defineKind(commentReplyData, (data) => ({
    text: `${data.actorName} replied to your comment on ${data.lessonTitle}`,
    href: `/courses/${data.courseSlug}/lessons/${data.lessonId}#comment-${data.commentId}`,
  })),
};
