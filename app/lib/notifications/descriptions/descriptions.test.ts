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

describe("describeNotification", () => {
  describe("Reply to your comment", () => {
    it("names who replied and the lesson, and links to the reply", () => {
      const result = describeNotification(
        notification("comment-reply", {
          actorName: "Jo Park",
          lessonTitle: "Closures",
          lessonId: 12,
          courseSlug: "javascript-basics",
          commentId: 99,
        })
      );

      expect(result).toEqual({
        text: "Jo Park replied to your comment on Closures",
        href: "/courses/javascript-basics/lessons/12#comment-99",
      });
    });

    it("keeps markup in user-written values as literal text", () => {
      const result = describeNotification(
        notification("comment-reply", {
          actorName: "<b>Jo</b>",
          lessonTitle: "<script>alert(1)</script>",
          lessonId: 12,
          courseSlug: "javascript-basics",
          commentId: 99,
        })
      );

      expect(result.text).toBe(
        "<b>Jo</b> replied to your comment on <script>alert(1)</script>"
      );
    });

    it("gives the generic row when the data is malformed", () => {
      const result = describeNotification(
        notification("comment-reply", { actorName: "Jo Park" })
      );

      expect(result).toEqual({ text: "You have a new Notification", href: null });
    });
  });

  describe("Inactive on a course", () => {
    it("gives the progress and the lesson to pick up at, linking to it", () => {
      const result = describeNotification(
        notification("inactive-on-course", {
          courseTitle: "JavaScript Basics",
          courseSlug: "javascript-basics",
          lessonId: 12,
          lessonTitle: "Closures",
          percentComplete: 80,
        })
      );

      expect(result).toEqual({
        text: "You're 80% through JavaScript Basics. Pick up at Closures.",
        href: "/courses/javascript-basics/lessons/12",
      });
    });

    it("leaves out the percentage when no lesson is complete", () => {
      const result = describeNotification(
        notification("inactive-on-course", {
          courseTitle: "JavaScript Basics",
          courseSlug: "javascript-basics",
          lessonId: 3,
          lessonTitle: "Welcome",
          percentComplete: null,
        })
      );

      expect(result).toEqual({
        text: "Pick up JavaScript Basics at Welcome.",
        href: "/courses/javascript-basics/lessons/3",
      });
    });
  });

  it("gives the generic row for an unknown kind", () => {
    const result = describeNotification(
      notification("something-new", { anything: true })
    );

    expect(result).toEqual({ text: "You have a new Notification", href: null });
  });

  it("gives the generic row when data is missing entirely", () => {
    const result = describeNotification(notification("comment-reply", null));

    expect(result).toEqual({ text: "You have a new Notification", href: null });
  });
});
