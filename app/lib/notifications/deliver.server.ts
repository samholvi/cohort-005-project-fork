import { inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import type { NotificationKind } from "./kinds";
import type {
  NotificationData,
  NotificationPerson,
  NotificationProvider,
} from "./provider.server";

// ─── Delivery rules shared by every kind ───
// Notifications run after the domain write has committed (ADR 0014). A
// failed delivery is retried a couple of times with backoff, then logged and
// dropped: it must never fail or slow the action that caused it.
//
//   notifyInBackground   wraps a whole notify function; never rejects.
//                        Routes call notify functions without awaiting.
//   sendWithRetries      applies the standing rule and retries; rejects after
//                        the last attempt. Use it directly when the caller
//                        must know the outcome (Notify enrolled Students).
//   markReadWithRetries  the same for markRead.

export type Db = BetterSQLite3Database<typeof schema>;

const RETRY_DELAYS_MS = [100, 200];

export async function notifyInBackground(
  label: string,
  now: Date,
  work: () => Promise<void>
): Promise<void> {
  try {
    await work();
  } catch (error) {
    console.error(
      `[notifications] gave up on ${label} (triggered ${now.toISOString()})`,
      error
    );
  }
}

/**
 * Sends `kind` to every recipient except the actor (the standing rule).
 * Sends nothing when no one is left.
 */
export async function sendWithRetries(
  provider: NotificationProvider,
  kind: NotificationKind,
  recipients: NotificationPerson[],
  data: NotificationData,
  actor?: NotificationPerson
): Promise<void> {
  const others = actor
    ? recipients.filter((recipient) => recipient.id !== actor.id)
    : recipients;
  if (others.length === 0) return;

  await withRetries(() => provider.send(kind, others, data, actor));
}

export async function markReadWithRetries(
  provider: NotificationProvider,
  kind: NotificationKind,
  key: string,
  recipientIds: number[]
): Promise<void> {
  if (recipientIds.length === 0) return;
  await withRetries(() => provider.markRead(kind, key, recipientIds));
}

async function withRetries(attempt: () => Promise<void>): Promise<void> {
  for (let retry = 0; ; retry++) {
    try {
      await attempt();
      return;
    } catch (error) {
      const delay = RETRY_DELAYS_MS[retry];
      if (delay === undefined) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/** The people with these user ids, as recipients or actors. */
export function getPeople(db: Db, userIds: number[]): NotificationPerson[] {
  if (userIds.length === 0) return [];
  return db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
    })
    .from(schema.users)
    .where(inArray(schema.users.id, userIds))
    .all();
}

export function getPerson(db: Db, userId: number): NotificationPerson | null {
  return getPeople(db, [userId])[0] ?? null;
}
