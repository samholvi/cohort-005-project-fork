import { z } from "zod";
import { formatPrice } from "~/lib/utils";
import { PURCHASE_KINDS, type PurchaseKind } from "~/lib/refund-rules";
import { defineKind, type KindDescribers, type RefundDecision } from "./define";

// Refund Request approved, Refund Request declined, Refund approved on your
// course, Refund Request to decide (#25).

export const refundRequestToDecideData = z.object({
  key: z.string(),
  refundRequestId: z.number().int(),
  buyerName: z.string(),
  courseTitle: z.string(),
});

export type RefundRequestToDecideData = z.infer<
  typeof refundRequestToDecideData
>;

const DECIDED_LABELS: Record<RefundDecision["status"], string> = {
  approved: "Approved",
  declined: "Declined",
};

const purchaseKind = z.enum(PURCHASE_KINDS);

/** Where a buyer goes to see the Purchase the Refund Request was about. */
function buyerHref(kind: PurchaseKind, courseSlug: string): string {
  return kind === "team_licence" ? "/team" : `/courses/${courseSlug}`;
}

// Never says what the buyer loses: a buyer who also holds a Claimed Seat
// keeps their Enrollment (ADR 0004).
export const refundRequestApprovedData = z.object({
  courseTitle: z.string(),
  courseSlug: z.string(),
  /** Integer cents (ADR 0005). */
  amountRefunded: z.number().int(),
  purchaseKind,
});

export type RefundRequestApprovedData = z.infer<
  typeof refundRequestApprovedData
>;

export const refundRequestDeclinedData = z.object({
  courseTitle: z.string(),
  courseSlug: z.string(),
  note: z.string(),
  purchaseKind,
});

export type RefundRequestDeclinedData = z.infer<
  typeof refundRequestDeclinedData
>;

export const refundApprovedOnYourCourseData = z.object({
  courseTitle: z.string(),
  buyerName: z.string(),
});

export type RefundApprovedOnYourCourseData = z.infer<
  typeof refundApprovedOnYourCourseData
>;

export const refundDescribers: KindDescribers = {
  "refund-request-approved": defineKind(refundRequestApprovedData, (data) => ({
    text: `Your Refund Request for ${data.courseTitle} was approved. A full refund of ${formatPrice(data.amountRefunded)} is on its way.`,
    href: buyerHref(data.purchaseKind, data.courseSlug),
  })),
  "refund-request-declined": defineKind(refundRequestDeclinedData, (data) => ({
    text: `Your Refund Request for ${data.courseTitle} was declined: "${data.note}"`,
    href: buyerHref(data.purchaseKind, data.courseSlug),
  })),
  "refund-approved-on-your-course": defineKind(
    refundApprovedOnYourCourseData,
    (data) => ({
      text: `${data.buyerName}'s Refund Request for ${data.courseTitle} was approved`,
      href: "/instructor/analytics",
    })
  ),
  "refund-request-to-decide": defineKind(
    refundRequestToDecideData,
    (data, lookups) => {
      const text = `${data.buyerName} requested a refund for ${data.courseTitle}`;
      const anchor = `#refund-request-${data.refundRequestId}`;
      const decision = lookups.refundDecisions?.[data.key];
      if (!decision) return { text, href: `/admin/refunds${anchor}` };

      return {
        text,
        href: `/admin/refunds?status=${decision.status}${anchor}`,
        note: `${DECIDED_LABELS[decision.status]} by ${decision.decidedByName}`,
      };
    }
  ),
};
