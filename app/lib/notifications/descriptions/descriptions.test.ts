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

  describe("New sale", () => {
    it("names the buyer and the course for an Individual Purchase", () => {
      const result = describeNotification(
        notification("new-sale", {
          buyerName: "Alex Rivera",
          courseTitle: "JavaScript Basics",
          seats: null,
        })
      );

      expect(result).toEqual({
        text: "Alex Rivera bought JavaScript Basics",
        href: "/instructor/analytics",
      });
    });

    it("counts the Seats of a Team Licence", () => {
      const result = describeNotification(
        notification("new-sale", {
          buyerName: "Alex Rivera",
          courseTitle: "JavaScript Basics",
          seats: 10,
        })
      );

      expect(result).toEqual({
        text: "Alex Rivera bought 10 Seats on JavaScript Basics",
        href: "/instructor/analytics",
      });
    });

    it("says one Seat in the singular", () => {
      const result = describeNotification(
        notification("new-sale", {
          buyerName: "Alex Rivera",
          courseTitle: "JavaScript Basics",
          seats: 1,
        })
      );

      expect(result.text).toBe(
        "Alex Rivera bought 1 Seat on JavaScript Basics"
      );
    });
  });

  describe("Seat claimed (Instructor)", () => {
    it("names the Student and whose Team Licence, and links to the Students page", () => {
      const result = describeNotification(
        notification("seat-claimed-instructor", {
          studentName: "Sam Okafor",
          courseTitle: "JavaScript Basics",
          courseId: 7,
          teamAdminName: "Alex Rivera",
        })
      );

      expect(result).toEqual({
        text: "Sam Okafor joined JavaScript Basics through Alex Rivera's Team Licence",
        href: "/instructor/7/students",
      });
    });

    it("leaves out whose Team Licence when the Team Admin is unknown", () => {
      const result = describeNotification(
        notification("seat-claimed-instructor", {
          studentName: "Sam Okafor",
          courseTitle: "JavaScript Basics",
          courseId: 7,
          teamAdminName: null,
        })
      );

      expect(result).toEqual({
        text: "Sam Okafor joined JavaScript Basics through a Team Licence",
        href: "/instructor/7/students",
      });
    });
  });

  describe("Seat claimed (Team Admin)", () => {
    it("says how many Seats are left, and links to the Team page", () => {
      const result = describeNotification(
        notification("seat-claimed-team-admin", {
          studentName: "Sam Okafor",
          courseTitle: "JavaScript Basics",
          seatsLeft: 7,
          seats: 10,
        })
      );

      expect(result).toEqual({
        text: "Sam Okafor claimed a Seat on JavaScript Basics: 7 of 10 left",
        href: "/team",
      });
    });

    it("says when the last Seat is gone", () => {
      const result = describeNotification(
        notification("seat-claimed-team-admin", {
          studentName: "Ava Kim",
          courseTitle: "JavaScript Basics",
          seatsLeft: 0,
          seats: 10,
        })
      );

      expect(result).toEqual({
        text: "Ava Kim claimed the last Seat on JavaScript Basics",
        href: "/team",
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
