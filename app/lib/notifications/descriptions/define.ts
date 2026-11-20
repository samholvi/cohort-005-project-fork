import type { z } from "zod";
import type { NotificationKind } from "../kinds";

/**
 * What a Notification row shows. `text` is plain text: render it as a React
 * text node, never as HTML (ADR 0013). `href` is null when there is nothing
 * to open.
 */
export type NotificationDescription = { text: string; href: string | null };

/**
 * How one kind is described. `data` is the kind's schema: the server builds
 * `data` of this shape (use `z.infer`), and the browser checks it before
 * describing, so malformed items fall back instead of breaking the list.
 */
export type KindDescriber<Schema extends z.ZodTypeAny = z.ZodTypeAny> = {
  data: Schema;
  describe(data: z.infer<Schema>): NotificationDescription;
};

export type KindDescribers = Partial<Record<NotificationKind, KindDescriber>>;

export function defineKind<Schema extends z.ZodTypeAny>(
  data: Schema,
  describe: (data: z.infer<Schema>) => NotificationDescription
): KindDescriber<Schema> {
  return { data, describe };
}
