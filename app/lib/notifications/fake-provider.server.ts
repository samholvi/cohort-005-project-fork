import type { NotificationKind } from "./kinds";
import type {
  NotificationData,
  NotificationPerson,
  NotificationProvider,
} from "./provider.server";

// For tests: records every accepted call in memory. `failing: true` makes
// every call throw; `failing: n` makes the first n calls throw, then recovers.

export type SentNotification = {
  kind: NotificationKind;
  recipients: NotificationPerson[];
  data: NotificationData;
  actor?: NotificationPerson;
};

export type MarkedRead = {
  kind: NotificationKind;
  key: string;
  recipientIds: number[];
};

export type FakeProvider = NotificationProvider & {
  sent: SentNotification[];
  markedRead: MarkedRead[];
  /** Every call to send or markRead, including the ones that failed. */
  attempts: number;
};

export function fakeProvider(
  options: { failing?: boolean | number } = {}
): FakeProvider {
  const failing = options.failing ?? false;

  const provider: FakeProvider = {
    sent: [],
    markedRead: [],
    attempts: 0,
    async send(kind, recipients, data, actor) {
      attempt();
      provider.sent.push(
        actor ? { kind, recipients, data, actor } : { kind, recipients, data }
      );
    },
    async markRead(kind, key, recipientIds) {
      attempt();
      provider.markedRead.push({ kind, key, recipientIds });
    },
    async createFeedSession() {
      return null;
    },
  };

  function attempt() {
    provider.attempts += 1;
    const fails =
      failing === true ||
      (typeof failing === "number" && provider.attempts <= failing);
    if (fails) throw new Error("Notification provider is unavailable");
  }

  return provider;
}
