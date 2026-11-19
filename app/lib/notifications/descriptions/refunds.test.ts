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

describe("Refund Request to decide", () => {
  const toDecide = notification("refund-request-to-decide", {
    key: "7",
    refundRequestId: 7,
    buyerName: "Alex Kim",
    courseTitle: "Intro to Rust",
  });

  it("names the buyer and course and opens admin refunds at the request", () => {
    expect(describeNotification(toDecide)).toEqual({
      text: "Alex Kim requested a refund for Intro to Rust",
      href: "/admin/refunds#refund-request-7",
    });
  });

  it("shows who declined it, and opens the declined tab", () => {
    const result = describeNotification(toDecide, {
      refundDecisions: {
        "7": { status: "declined", decidedByName: "Dana Lee" },
      },
    });

    expect(result).toEqual({
      text: "Alex Kim requested a refund for Intro to Rust",
      href: "/admin/refunds?status=declined#refund-request-7",
      note: "Declined by Dana Lee",
    });
  });

  it("shows who approved it, and opens the approved tab", () => {
    const result = describeNotification(toDecide, {
      refundDecisions: {
        "7": { status: "approved", decidedByName: "Dana Lee" },
      },
    });

    expect(result).toEqual({
      text: "Alex Kim requested a refund for Intro to Rust",
      href: "/admin/refunds?status=approved#refund-request-7",
      note: "Approved by Dana Lee",
    });
  });

  it("keeps the plain row when nothing has been decided yet", () => {
    expect(describeNotification(toDecide, { refundDecisions: {} })).toEqual({
      text: "Alex Kim requested a refund for Intro to Rust",
      href: "/admin/refunds#refund-request-7",
    });
  });

  it("ignores decisions about other Refund Requests", () => {
    const result = describeNotification(toDecide, {
      refundDecisions: {
        "8": { status: "approved", decidedByName: "Dana Lee" },
      },
    });

    expect(result).toEqual({
      text: "Alex Kim requested a refund for Intro to Rust",
      href: "/admin/refunds#refund-request-7",
    });
  });
});

describe("Refund Request approved", () => {
  it("gives the amount and opens the course page for an Individual Purchase", () => {
    const result = describeNotification(
      notification("refund-request-approved", {
        courseTitle: "Intro to Rust",
        courseSlug: "intro-to-rust",
        amountRefunded: 49000,
        purchaseKind: "individual_purchase",
      })
    );

    expect(result).toEqual({
      text: "Your Refund Request for Intro to Rust was approved. A full refund of $490.00 is on its way.",
      href: "/courses/intro-to-rust",
    });
  });

  it("opens the Team page for a Team Licence", () => {
    const result = describeNotification(
      notification("refund-request-approved", {
        courseTitle: "Intro to Rust",
        courseSlug: "intro-to-rust",
        amountRefunded: 79000,
        purchaseKind: "team_licence",
      })
    );

    expect(result).toEqual({
      text: "Your Refund Request for Intro to Rust was approved. A full refund of $790.00 is on its way.",
      href: "/team",
    });
  });

  it("never says the buyer loses access, since a Claimed Seat keeps it", () => {
    for (const purchaseKind of ["individual_purchase", "team_licence"]) {
      const { text } = describeNotification(
        notification("refund-request-approved", {
          courseTitle: "Intro to Rust",
          courseSlug: "intro-to-rust",
          amountRefunded: 49000,
          purchaseKind,
        })
      );

      expect(text).not.toMatch(/access|lose|lost|enrol/i);
    }
  });

  it("gives the generic row when the amount is not integer cents", () => {
    const result = describeNotification(
      notification("refund-request-approved", {
        courseTitle: "Intro to Rust",
        courseSlug: "intro-to-rust",
        amountRefunded: 490.5,
        purchaseKind: "individual_purchase",
      })
    );

    expect(result).toEqual({ text: "You have a new Notification", href: null });
  });
});

describe("Refund Request declined", () => {
  it("quotes the Platform Admin's note and opens the course page", () => {
    const result = describeNotification(
      notification("refund-request-declined", {
        courseTitle: "Intro to Rust",
        courseSlug: "intro-to-rust",
        note: "You completed most of the course.",
        purchaseKind: "individual_purchase",
      })
    );

    expect(result).toEqual({
      text: 'Your Refund Request for Intro to Rust was declined: "You completed most of the course."',
      href: "/courses/intro-to-rust",
    });
  });

  it("opens the Team page for a Team Licence", () => {
    const result = describeNotification(
      notification("refund-request-declined", {
        courseTitle: "Intro to Rust",
        courseSlug: "intro-to-rust",
        note: "Seats were claimed.",
        purchaseKind: "team_licence",
      })
    );

    expect(result.href).toBe("/team");
  });
});

describe("Refund approved on your course", () => {
  it("names the course and buyer and opens analytics", () => {
    const result = describeNotification(
      notification("refund-approved-on-your-course", {
        courseTitle: "Intro to Rust",
        buyerName: "Alex Kim",
      })
    );

    expect(result).toEqual({
      text: "A refund of Intro to Rust for Alex Kim was approved",
      href: "/instructor/analytics",
    });
  });
});
