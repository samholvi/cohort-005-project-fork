import { z } from "zod";
import { defineKind, type KindDescribers } from "./define";

export const inactiveOnCourseData = z.object({
  courseTitle: z.string(),
  courseSlug: z.string(),
  lessonId: z.number().int(),
  lessonTitle: z.string(),
  /** Completed lessons over total lessons; null when none is complete. */
  percentComplete: z.number().int().nullable(),
});

export type InactiveOnCourseData = z.infer<typeof inactiveOnCourseData>;

export const inactivityDescribers: KindDescribers = {
  "inactive-on-course": defineKind(inactiveOnCourseData, (data) => ({
    text:
      data.percentComplete === null
        ? `Pick up ${data.courseTitle} at ${data.lessonTitle}.`
        : `You're ${data.percentComplete}% through ${data.courseTitle}. Pick up at ${data.lessonTitle}.`,
    href: `/courses/${data.courseSlug}/lessons/${data.lessonId}`,
  })),
};
