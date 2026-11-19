import { describe, expect, it } from "vitest";
import { describeNotification } from ".";
import type { Notification } from "../kinds";

function notification(kind: string, data: unknown): Notification {
  return {
    id: "n1",
    kind,
    data,
    read: false,
    createdAt: "2026-10-06T12:00:00.000Z",
  };
}

describe("describeNotification: course status", () => {
  describe("Course published", () => {
    it("names who published which course, and opens the course page", () => {
      const result = describeNotification(
        notification("course-published", {
          actorName: "Marcus Johnson",
          courseTitle: "JavaScript Basics",
          courseSlug: "javascript-basics",
        })
      );

      expect(result).toEqual({
        text: "Marcus Johnson published JavaScript Basics",
        href: "/courses/javascript-basics",
      });
    });

    it("gives the generic row when the data is malformed", () => {
      const result = describeNotification(
        notification("course-published", { actorName: "Marcus Johnson" })
      );

      expect(result).toEqual({ text: "You have a new Notification", href: null });
    });
  });

  describe("Course status changed", () => {
    it("says a Platform Admin published the course, and opens the course editor", () => {
      const result = describeNotification(
        notification("course-status-changed", {
          status: "published",
          courseTitle: "JavaScript Basics",
          courseId: 7,
        })
      );

      expect(result).toEqual({
        text: "A Platform Admin published JavaScript Basics",
        href: "/instructor/7",
      });
    });

    it("says a Platform Admin archived the course, and opens the course editor", () => {
      const result = describeNotification(
        notification("course-status-changed", {
          status: "archived",
          courseTitle: "JavaScript Basics",
          courseId: 7,
        })
      );

      expect(result).toEqual({
        text: "A Platform Admin archived JavaScript Basics",
        href: "/instructor/7",
      });
    });

    it("gives the generic row for a status it doesn't announce", () => {
      const result = describeNotification(
        notification("course-status-changed", {
          status: "draft",
          courseTitle: "JavaScript Basics",
          courseId: 7,
        })
      );

      expect(result).toEqual({ text: "You have a new Notification", href: null });
    });
  });
});
