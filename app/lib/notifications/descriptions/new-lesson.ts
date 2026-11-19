import { z } from "zod";
import { defineKind, type KindDescribers } from "./define";

export const newLessonData = z.object({
  courseTitle: z.string(),
  lessonTitle: z.string(),
  lessonId: z.number().int(),
  courseSlug: z.string(),
});

export type NewLessonData = z.infer<typeof newLessonData>;

/** The fixed text Students get; the lesson editor's confirm dialog shows it too. */
export function newLessonText(courseTitle: string, lessonTitle: string) {
  return `New lesson in ${courseTitle}: ${lessonTitle}`;
}

export const newLessonDescribers: KindDescribers = {
  "new-lesson": defineKind(newLessonData, (data) => ({
    text: newLessonText(data.courseTitle, data.lessonTitle),
    href: `/courses/${data.courseSlug}/lessons/${data.lessonId}`,
  })),
};
