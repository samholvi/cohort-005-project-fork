import { describe, expect, it } from "vitest";
import { feedSnapshot, knockFeedKey } from "./knock-feed";

type FeedItem = Parameters<typeof feedSnapshot>[0]["items"][number];

function feedItem(overrides: Partial<FeedItem>): FeedItem {
  return {
    __cursor: "cursor",
    id: "msg_1",
    actors: [],
    blocks: [],
    inserted_at: "2026-10-06T12:00:00.000Z",
    updated_at: "2026-10-06T12:00:00.000Z",
    read_at: null,
    seen_at: null,
    clicked_at: null,
    interacted_at: null,
    link_clicked_at: null,
    archived_at: null,
    total_actors: 0,
    data: null,
    source: { key: "comment-reply", version_id: "v1", categories: [] },
    tenant: null,
    ...overrides,
  };
}

const METADATA = { total_count: 0, unread_count: 0, unseen_count: 0 };

describe("feedSnapshot", () => {
  it("turns each feed item into a Notification from its data, kind and read time", () => {
    const data = { actorName: "Sarah Chen", lessonTitle: "Hooks" };

    const snapshot = feedSnapshot({
      items: [
        feedItem({
          id: "msg_2",
          source: { key: "new-lesson", version_id: "v1", categories: [] },
          data,
          read_at: "2026-10-06T13:00:00.000Z",
          inserted_at: "2026-10-06T12:30:00.000Z",
        }),
        feedItem({ id: "msg_1" }),
      ],
      metadata: METADATA,
    });

    expect(snapshot.notifications).toEqual([
      {
        id: "msg_2",
        kind: "new-lesson",
        data,
        read: true,
        createdAt: "2026-10-06T12:30:00.000Z",
      },
      {
        id: "msg_1",
        kind: "comment-reply",
        data: null,
        read: false,
        createdAt: "2026-10-06T12:00:00.000Z",
      },
    ]);
  });

  it("ignores the provider's rendered content and seen state", () => {
    const snapshot = feedSnapshot({
      items: [
        feedItem({
          blocks: [
            {
              type: "markdown",
              name: "body",
              content: "x",
              rendered: "<b>x</b>",
            },
          ],
          seen_at: "2026-10-06T12:01:00.000Z",
        }),
      ],
      metadata: METADATA,
    });

    expect(snapshot.notifications[0]).toEqual({
      id: "msg_1",
      kind: "comment-reply",
      data: null,
      read: false,
      createdAt: "2026-10-06T12:00:00.000Z",
    });
  });

  it("lists the newest Notification first", () => {
    const snapshot = feedSnapshot({
      items: [
        feedItem({ id: "old", inserted_at: "2026-10-01T00:00:00.000Z" }),
        feedItem({ id: "new", inserted_at: "2026-10-05T00:00:00.000Z" }),
      ],
      metadata: METADATA,
    });

    expect(snapshot.notifications.map((n) => n.id)).toEqual(["new", "old"]);
  });

  it("counts Unread Notifications, not unseen ones", () => {
    const snapshot = feedSnapshot({
      items: [],
      metadata: { total_count: 9, unread_count: 3, unseen_count: 7 },
    });

    expect(snapshot.unreadCount).toBe(3);
  });
});

describe("knockFeedKey", () => {
  const settings = {
    publicApiKey: "pk",
    feedChannelId: "channel",
    userId: "cadence-7",
    userToken: "token-a",
  };

  it("stays the same when only the token is refreshed", () => {
    expect(knockFeedKey({ ...settings, userToken: "token-b" })).toBe(
      knockFeedKey(settings)
    );
  });

  it("changes when the user changes, so their feed opens fresh", () => {
    expect(knockFeedKey({ ...settings, userId: "cadence-8" })).not.toBe(
      knockFeedKey(settings)
    );
  });
});
