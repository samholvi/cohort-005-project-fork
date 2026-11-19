import { Knock, signUserToken } from "@knocklabs/node";
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

type KnockRecipient = { id: string; name: string; email: string };

/** The few Knock calls the adapter makes. Tests replace it with a recorder. */
export type KnockApi = {
  trigger(
    workflowKey: string,
    params: {
      recipients: KnockRecipient[];
      actor?: KnockRecipient;
      data: Record<string, unknown>;
    }
  ): Promise<void>;
  listUnreadMessageIds(
    recipientId: string,
    query: { workflowKey: string; feedChannelId: string; key: string }
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
      const messageIds: string[] = [];
      for (const userId of recipientIds) {
        messageIds.push(
          ...(await api.listUnreadMessageIds(recipientId(userId), query))
        );
      }
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
