import { z } from "zod";
import { MAX_RATING, MIN_RATING } from "~/lib/ratings";
import { defineKind, type KindDescribers } from "./define";

export const newQuestionData = z.object({
  actorName: z.string(),
  lessonTitle: z.string(),
  commentId: z.number().int(),
});

export type NewQuestionData = z.infer<typeof newQuestionData>;

export const newRatingData = z.object({
  actorName: z.string(),
  courseTitle: z.string(),
  courseSlug: z.string(),
  rating: z.number().int().min(MIN_RATING).max(MAX_RATING),
});

export type NewRatingData = z.infer<typeof newRatingData>;

export const engagementDescribers: KindDescribers = {
  "new-question": defineKind(newQuestionData, (data) => ({
    text: `${data.actorName} asked a question on ${data.lessonTitle}`,
    href: `/instructor/questions#question-${data.commentId}`,
  })),
  "new-rating": defineKind(newRatingData, (data) => ({
    text: `${data.actorName} rated ${data.courseTitle} ★${data.rating}`,
    href: `/courses/${data.courseSlug}`,
  })),
};
