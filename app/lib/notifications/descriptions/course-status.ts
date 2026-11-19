import { z } from "zod";
import { defineKind, type KindDescribers } from "./define";

// Course published, Course status changed (#27).

export const coursePublishedData = z.object({
  actorName: z.string(),
  courseTitle: z.string(),
  courseSlug: z.string(),
});

export type CoursePublishedData = z.infer<typeof coursePublishedData>;

export const courseStatusChangedData = z.object({
  status: z.enum(["published", "archived"]),
  courseTitle: z.string(),
  courseId: z.number().int(),
});

export type CourseStatusChangedData = z.infer<typeof courseStatusChangedData>;

export const courseStatusDescribers: KindDescribers = {
  "course-published": defineKind(coursePublishedData, (data) => ({
    text: `${data.actorName} published ${data.courseTitle}`,
    href: `/courses/${data.courseSlug}`,
  })),
  "course-status-changed": defineKind(courseStatusChangedData, (data) => ({
    text: `A Platform Admin ${data.status} ${data.courseTitle}`,
    href: `/instructor/${data.courseId}`,
  })),
};
