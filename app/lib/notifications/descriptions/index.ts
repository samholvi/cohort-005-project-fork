// ─── Notification descriptions ───
// Turns a provider-neutral Notification into the text and link its row shows.
// Every kind's wording lives in one file per group below; this file only
// dispatches. Pure and shared: the browser calls it to render the list.

import { isNotificationKind, type Notification } from "../kinds";
import { commentDescribers } from "./comments";
import { courseStatusDescribers } from "./course-status";
import type {
  KindDescribers,
  NotificationDescription,
  NotificationLookups,
} from "./define";
import { engagementDescribers } from "./engagement";
import { inactivityDescribers } from "./inactivity";
import { newLessonDescribers } from "./new-lesson";
import { refundDescribers } from "./refunds";
import { salesDescribers } from "./sales";

export type { NotificationDescription, NotificationLookups } from "./define";

const describers: KindDescribers = {
  ...commentDescribers,
  ...courseStatusDescribers,
  ...engagementDescribers,
  ...inactivityDescribers,
  ...newLessonDescribers,
  ...refundDescribers,
  ...salesDescribers,
};

const GENERIC: NotificationDescription = {
  text: "You have a new Notification",
  href: null,
};

export function describeNotification(
  notification: Notification,
  lookups: NotificationLookups = {}
): NotificationDescription {
  const describer = isNotificationKind(notification.kind)
    ? describers[notification.kind]
    : undefined;
  if (!describer) return GENERIC;

  const parsed = describer.data.safeParse(notification.data);
  if (!parsed.success) return GENERIC;

  return describer.describe(parsed.data, lookups);
}
