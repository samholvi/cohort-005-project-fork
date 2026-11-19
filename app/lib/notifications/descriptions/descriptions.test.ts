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

      expect(result).toEqual({
        text: "You have a new Notification",
        href: null,
      });
    });
  });

  describe("New lesson", () => {
    it("names the course and the lesson, and links to the lesson", () => {
      const result = describeNotification(
        notification("new-lesson", {
          courseTitle: "JavaScript Basics",
          lessonTitle: "Closures",
          lessonId: 12,
          courseSlug: "javascript-basics",
        })
      );

      expect(result).toEqual({
        text: "New lesson in JavaScript Basics: Closures",
        href: "/courses/javascript-basics/lessons/12",
      });
    });

    it("gives the generic row when the data is malformed", () => {
      const result = describeNotification(
        notification("new-lesson", { courseTitle: "JavaScript Basics" })
      );

      expect(result).toEqual({
        text: "You have a new Notification",
        href: null,
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
