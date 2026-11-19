import type { NotificationKind } from "./kinds";
import { knockConfigFromEnv, knockProvider } from "./knock-provider.server";
import { localFolderProvider } from "./local-folder-provider.server";

// ─── Notification provider ───
// The only server boundary that knows a notification service exists. It is
// written in Cadence's terms: kinds are Cadence kind keys, recipients are
// Cadence users. Retries, waiting and the standing rule (never notify the
// actor) are not the provider's job; the notifications module does those, so
// every adapter gets them for free. Mirrors the mailer's MailTransport.

/** A Cadence user a Notification is for or about. `id` is the user id. */
export type NotificationPerson = { id: number; name: string; email: string };

/**
 * Everything a kind's description needs, as plain JSON. When a Notification
 * must later be marked Read from the server, put what it is about in `key`
 * (e.g. a Refund Request id as a string); `markRead` matches on it.
 */
export type NotificationData = { key?: string } & Record<string, unknown>;

/**
 * What the browser needs to open the signed-in user's Notification feed.
 * Opaque: only the adapter that created it, and its browser counterpart,
 * read `settings`.
 */
export type FeedSession = { provider: string; settings: Record<string, string> };

export interface NotificationProvider {
  /** Deliver one Notification of `kind` to each recipient. */
  send(
    kind: NotificationKind,
    recipients: NotificationPerson[],
    data: NotificationData,
    actor?: NotificationPerson
  ): Promise<void>;

  /** Mark the recipients' Notifications of `kind` about `key` as Read. */
  markRead(
    kind: NotificationKind,
    key: string,
    recipientIds: number[]
  ): Promise<void>;

  /** The user's FeedSession, or null when this provider can't serve a feed. */
  createFeedSession(user: NotificationPerson): Promise<FeedSession | null>;
}

const LOCAL_FOLDER = ".notifications";

type Env = Record<string, string | undefined>;

/**
 * Picks the adapter: Knock when the four Knock keys are set (the recipient
 * prefix may be empty), otherwise the local folder. Reads the environment at
 * call time, like the mailer.
 */
export function defaultProvider(env: Env = loadEnv()): NotificationProvider {
  const knock = knockConfigFromEnv(env);
  return knock ? knockProvider(knock) : localFolderProvider(LOCAL_FOLDER);
}

let envLoaded = false;

/**
 * `process.env` with the checkout's `.env` merged in, once. Neither Vite nor
 * react-router-serve puts `.env` into `process.env` for server code.
 * Variables already set in the real environment win.
 */
function loadEnv(): Env {
  if (!envLoaded) {
    envLoaded = true;
    try {
      process.loadEnvFile(".env");
    } catch {
      // No .env: the real environment is all there is.
    }
  }
  return process.env;
}
