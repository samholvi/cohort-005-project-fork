import Knock, { type Feed, type FeedStoreState } from "@knocklabs/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import type { NotificationFeed } from "./feed";
import type { Notification } from "./kinds";

// ─── Knock adapter (browser) ───
// The browser counterpart of knock-provider.server.ts and the only browser
// module that knows Knock exists. It runs Knock's headless feed client with
// the FeedSession the server signed, and turns feed items into Cadence
// Notifications from their `data` alone: Knock's rendered `blocks` are never
// read (descriptions are Cadence's), and neither is its seen state, so only
// Read and Unread exist (ADR 0013). Knock is only touched inside effects, so
// nothing runs during server rendering.

const PAGE_SIZE = 50;

const knockSettings = z.object({
  publicApiKey: z.string().min(1),
  feedChannelId: z.string().min(1),
  userId: z.string().min(1),
  userToken: z.string().min(1),
});

type FeedSnapshot = Pick<NotificationFeed, "notifications" | "unreadCount">;

const EMPTY: FeedSnapshot = { notifications: [], unreadCount: 0 };

/** What the bell shows for a state of Knock's feed store. */
export function feedSnapshot(
  state: Pick<FeedStoreState, "items" | "metadata">
): FeedSnapshot {
  const notifications: Notification[] = state.items.map((item) => ({
    id: item.id,
    kind: item.source.key,
    data: item.data,
    read: item.read_at !== null,
    createdAt: item.inserted_at,
  }));
  notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { notifications, unreadCount: state.metadata.unread_count };
}

/**
 * The Knock feed for a FeedSession's settings, live. A new token for the same
 * user (each time the layout reloads) re-authenticates without reopening the
 * feed. Settings that aren't a Knock session give an empty feed.
 */
export function useKnockFeed(settings: Record<string, string>): NotificationFeed {
  const parsed = knockSettings.safeParse(settings);
  const session = parsed.success ? parsed.data : null;
  const publicApiKey = session?.publicApiKey;
  const feedChannelId = session?.feedChannelId;
  const userId = session?.userId;
  const userToken = session?.userToken;

  const [snapshot, setSnapshot] = useState<FeedSnapshot>(EMPTY);
  const knockRef = useRef<Knock | null>(null);
  const feedRef = useRef<Feed | null>(null);
  const tokenRef = useRef(userToken);

  useEffect(() => {
    if (!publicApiKey || !feedChannelId || !userId) return;

    const knock = new Knock(publicApiKey);
    knock.authenticate({ id: userId }, tokenRef.current, {
      identificationStrategy: "skip",
    });
    const feed = knock.feeds.initialize(feedChannelId, {
      page_size: PAGE_SIZE,
    });
    knockRef.current = knock;
    feedRef.current = feed;

    const unsubscribe = feed.store.subscribe((state) =>
      setSnapshot(feedSnapshot(state))
    );
    feed.listenForUpdates();
    feed.fetch().catch((error: unknown) => {
      console.error("[notifications] could not load the feed", error);
    });

    return () => {
      unsubscribe();
      feed.teardown();
      knock.teardown();
      knockRef.current = null;
      feedRef.current = null;
      setSnapshot(EMPTY);
    };
  }, [publicApiKey, feedChannelId, userId]);

  useEffect(() => {
    tokenRef.current = userToken;
    const knock = knockRef.current;
    if (!knock || !userId || knock.userToken === userToken) return;
    knock.authenticate({ id: userId }, userToken, {
      identificationStrategy: "skip",
    });
  }, [userId, userToken]);

  const markRead = useCallback((id: string) => {
    const feed = feedRef.current;
    const item = feed?.getState().items.find((each) => each.id === id);
    if (!feed || !item || item.read_at !== null) return;
    feed.markAsRead(item).catch((error: unknown) => {
      console.error("[notifications] could not mark Read", error);
    });
  }, []);

  const markAllRead = useCallback(() => {
    feedRef.current?.markAllAsRead().catch((error: unknown) => {
      console.error("[notifications] could not mark all Read", error);
    });
  }, []);

  return useMemo(
    () => ({ ...snapshot, markRead, markAllRead }),
    [snapshot, markRead, markAllRead]
  );
}
