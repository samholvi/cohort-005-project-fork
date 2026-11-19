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

  describe("New question", () => {
    it("names who asked and the lesson, and opens the Questions page at it", () => {
      const result = describeNotification(
        notification("new-question", {
          actorName: "Alex Kim",
          lessonTitle: "Closures",
          commentId: 41,
        })
      );

      expect(result).toEqual({
        text: "Alex Kim asked a question on Closures",
        href: "/instructor/questions#question-41",
      });
    });

    it("gives the generic row when the data is malformed", () => {
      const result = describeNotification(
        notification("new-question", { actorName: "Alex Kim" })
      );

      expect(result).toEqual({ text: "You have a new Notification", href: null });
    });
  });

  describe("New rating", () => {
    it("names who rated, the course and the stars, and opens the course page", () => {
      const result = describeNotification(
        notification("new-rating", {
          actorName: "Alex Kim",
          courseTitle: "JavaScript Basics",
          courseSlug: "javascript-basics",
          rating: 4,
        })
      );

      expect(result).toEqual({
        text: "Alex Kim rated JavaScript Basics ★4",
        href: "/courses/javascript-basics",
      });
    });

    it("gives the generic row when the stars are out of range", () => {
      const result = describeNotification(
        notification("new-rating", {
          actorName: "Alex Kim",
          courseTitle: "JavaScript Basics",
          courseSlug: "javascript-basics",
          rating: 9,
        })
      );

      expect(result).toEqual({ text: "You have a new Notification", href: null });
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
