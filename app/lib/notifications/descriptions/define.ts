import type { z } from "zod";
import type { NotificationKind } from "../kinds";
import type { RefundDecision } from "./refunds";

/**
 * What a Notification row shows. `text` is plain text: render it as a React
 * text node, never as HTML (ADR 0013). `href` is null when there is nothing
 * to open. `note` is a short line about what has happened since, such as
 * "Declined by Dana", shown under the text.
 */
export type NotificationDescription = {
  text: string;
  href: string | null;
  note?: string;
};

/**
 * Facts Cadence looks up when the list is rendered, for what a provider
 * can't change after sending. Keyed by the Notification's `key`. Fetch them
 * from `/api/notifications/lookups`; a missing entry means nothing has
 * happened since.
 */
export type NotificationLookups = {
  refundDecisions?: Record<string, RefundDecision>;
};

/**
 * How one kind is described. `data` is the kind's schema: the server builds
 * `data` of this shape (use `z.infer`), and the browser checks it before
 * describing, so malformed items fall back instead of breaking the list.
 */
export type KindDescriber<Schema extends z.ZodTypeAny = z.ZodTypeAny> = {
  data: Schema;
  describe(
    data: z.infer<Schema>,
    lookups: NotificationLookups
  ): NotificationDescription;
};

export type KindDescribers = Partial<Record<NotificationKind, KindDescriber>>;

export function defineKind<Schema extends z.ZodTypeAny>(
  data: Schema,
  describe: (
    data: z.infer<Schema>,
    lookups: NotificationLookups
  ) => NotificationDescription
): KindDescriber<Schema> {
  return { data, describe };
}
