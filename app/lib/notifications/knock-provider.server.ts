import { Knock, signUserToken } from "@knocklabs/node";
import type { NotificationKind } from "./kinds";
import type {
  NotificationPerson,
  NotificationProvider,
} from "./provider.server";

// ─── Knock adapter ───
// The only server module that knows Knock exists; its browser counterpart is
// the only other one. Cadence kinds are Knock workflow keys as-is: each kind
// has its own workflow in `knock/workflows/`, with an in-app feed channel
// only. Knock recipient ids are Cadence user ids behind `recipientPrefix`, so
// several checkouts can share one Knock environment without seeing each
// other's Notifications. Callers never see a Knock id.

export type KnockConfig = {
  secretApiKey: string;
  publicApiKey: string;
  /** The RS256 private key, as PEM or as the base64 PEM the dashboard shows. */
  signingKey: string;
  feedChannelId: string;
  recipientPrefix: string;
};

/**
 * The KnockConfig the `KNOCK_*` variables describe, or null when any of the
 * four required ones is missing. The recipient prefix may be empty.
 */
export function knockConfigFromEnv(
  env: Record<string, string | undefined>
): KnockConfig | null {
  const secretApiKey = env.KNOCK_SECRET_API_KEY;
  const publicApiKey = env.KNOCK_PUBLIC_API_KEY;
  const signingKey = env.KNOCK_SIGNING_KEY;
  const feedChannelId = env.KNOCK_FEED_CHANNEL_ID;
  if (!secretApiKey || !publicApiKey || !signingKey || !feedChannelId) {
    return null;
  }
  return {
    secretApiKey,
    publicApiKey,
    signingKey,
    feedChannelId,
    recipientPrefix: env.KNOCK_RECIPIENT_PREFIX ?? "",
  };
}

type KnockRecipient = { id: string; name: string; email: string };

/** The few Knock calls the adapter makes. Tests replace it with a recorder. */
export type KnockApi = {
  trigger(
    workflowKey: NotificationKind,
    params: {
      recipients: KnockRecipient[];
      actor?: KnockRecipient;
      data: Record<string, unknown>;
    }
  ): Promise<void>;
  listUnreadMessageIds(
    recipientId: string,
    query: { workflowKey: NotificationKind; feedChannelId: string; key: string }
  ): Promise<string[]>;
  markMessagesRead(messageIds: string[]): Promise<void>;
};

const TOKEN_LIFETIME_SECONDS = 60 * 60;

export function knockProvider(
  config: KnockConfig,
  api: KnockApi = knockApi(config.secretApiKey)
): NotificationProvider {
  function recipientId(userId: number): string {
    return `${config.recipientPrefix}${userId}`;
  }

  function recipient(person: NotificationPerson): KnockRecipient {
    return {
      id: recipientId(person.id),
      name: person.name,
      email: person.email,
    };
  }

  return {
    async send(kind, recipients, data, actor) {
      await api.trigger(kind, {
        recipients: recipients.map(recipient),
        ...(actor ? { actor: recipient(actor) } : {}),
        data,
      });
    },

    async markRead(kind, key, recipientIds) {
      const query = {
        workflowKey: kind,
        feedChannelId: config.feedChannelId,
        key,
      };
      const perRecipient = await Promise.all(
        recipientIds.map((userId) =>
          api.listUnreadMessageIds(recipientId(userId), query)
        )
      );
      const messageIds = perRecipient.flat();
      if (messageIds.length > 0) await api.markMessagesRead(messageIds);
    },

    async createFeedSession(user) {
      const userId = recipientId(user.id);
      const userToken = await signUserToken(userId, {
        signingKey: config.signingKey,
        expiresInSeconds: TOKEN_LIFETIME_SECONDS,
      });
      return {
        provider: "knock",
        settings: {
          publicApiKey: config.publicApiKey,
          feedChannelId: config.feedChannelId,
          userId,
          userToken,
        },
      };
    },
  };
}

function knockApi(secretApiKey: string): KnockApi {
  const knock = new Knock({ apiKey: secretApiKey });

  return {
    async trigger(workflowKey, params) {
      await knock.workflows.trigger(workflowKey, params);
    },

    async listUnreadMessageIds(recipientId, query) {
      const ids: string[] = [];
      const messages = knock.users.listMessages(recipientId, {
        source: query.workflowKey,
        channel_id: query.feedChannelId,
        engagement_status: ["unread"],
        trigger_data: JSON.stringify({ key: query.key }),
      });
      for await (const message of messages) {
        if (message.id) ids.push(message.id);
      }
      return ids;
    },

    async markMessagesRead(messageIds) {
      await knock.messages.batch.markAsRead({ message_ids: messageIds });
    },
  };
}
