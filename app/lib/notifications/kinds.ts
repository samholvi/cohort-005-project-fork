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
  [NotificationKind.RefundRequestApproved]: "Refund Request approved",
  [NotificationKind.RefundRequestDeclined]: "Refund Request declined",
  [NotificationKind.CommentReply]: "Reply to your comment",
  [NotificationKind.NewLesson]: "New lesson",
  [NotificationKind.InactiveOnCourse]: "Inactive on a course",
  [NotificationKind.NewQuestion]: "New question",
  [NotificationKind.NewRating]: "New rating",
  [NotificationKind.CourseStatusChanged]: "Course status changed",
  [NotificationKind.NewSale]: "New sale",
  [NotificationKind.SeatClaimedInstructor]: "Seat claimed",
  [NotificationKind.RefundApprovedOnYourCourse]:
    "Refund approved on your course",
  [NotificationKind.RefundRequestToDecide]: "Refund Request to decide",
  [NotificationKind.CoursePublished]: "Course published",
  [NotificationKind.SeatClaimedTeamAdmin]: "Seat claimed",
};

export function isNotificationKind(value: string): value is NotificationKind {
  return Object.hasOwn(NOTIFICATION_KIND_LABELS, value);
}

/** The human name of a kind, or "Notification" for one this build doesn't know. */
export function kindLabel(kind: string): string {
  return isNotificationKind(kind)
    ? NOTIFICATION_KIND_LABELS[kind]
    : "Notification";
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
