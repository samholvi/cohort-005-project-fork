// ─── Notification kinds ───
// Cadence's own kind keys, one per row of the kinds table in the in-app
// notifications spec (#21). Providers see these keys as-is; an adapter that
// needs different names maps them itself. Shared by server and browser, so
// this file stays pure.

export const NotificationKind = {
  RefundRequestApproved: "refund-request-approved",
  RefundRequestDeclined: "refund-request-declined",
  CommentReply: "comment-reply",
  NewLesson: "new-lesson",
  InactiveOnCourse: "inactive-on-course",
  NewQuestion: "new-question",
  NewRating: "new-rating",
  CourseStatusChanged: "course-status-changed",
  NewSale: "new-sale",
  SeatClaimedInstructor: "seat-claimed-instructor",
  RefundApprovedOnYourCourse: "refund-approved-on-your-course",
  RefundRequestToDecide: "refund-request-to-decide",
  CoursePublished: "course-published",
  SeatClaimedTeamAdmin: "seat-claimed-team-admin",
} as const;

export type NotificationKind =
  (typeof NotificationKind)[keyof typeof NotificationKind];

/** The human name of each kind, shown next to a Notification's time. */
export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  "refund-request-approved": "Refund Request approved",
  "refund-request-declined": "Refund Request declined",
  "comment-reply": "Reply to your comment",
  "new-lesson": "New lesson",
  "inactive-on-course": "Inactive on a course",
  "new-question": "New question",
  "new-rating": "New rating",
  "course-status-changed": "Course status changed",
  "new-sale": "New sale",
  "seat-claimed-instructor": "Seat claimed",
  "refund-approved-on-your-course": "Refund approved on your course",
  "refund-request-to-decide": "Refund Request to decide",
  "course-published": "Course published",
  "seat-claimed-team-admin": "Seat claimed",
};

export function isNotificationKind(value: string): value is NotificationKind {
  return Object.hasOwn(NOTIFICATION_KIND_LABELS, value);
}

/**
 * A Notification as Cadence sees it, whatever provider stored it. `kind` is a
 * plain string and `data` is unknown because both come back from outside
 * Cadence and may be from a kind this build doesn't know.
 */
export type Notification = {
  id: string;
  kind: string;
  data: unknown;
  read: boolean;
  createdAt: string;
};
