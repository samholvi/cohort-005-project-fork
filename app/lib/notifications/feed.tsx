import { createContext, useContext, type ReactNode } from "react";
import type { Notification } from "./kinds";
import { useKnockFeed } from "./knock-feed";
import type { FeedSession } from "./provider.server";

// ─── Notification feed (browser) ───
// The signed-in user's Notifications as the bell sees them, whatever provider
// stores them. Components read it with `useNotificationFeed()` and never see
// the provider; only the adapter behind it does. Null means there is no feed
// (signed out, or a provider without one such as the local folder), and the
// bell isn't shown.

export interface NotificationFeed {
  /** Newest first. */
  notifications: Notification[];
  unreadCount: number;
  markRead(id: string): void;
  markAllRead(): void;
}

const NotificationFeedContext = createContext<NotificationFeed | null>(null);

export function useNotificationFeed(): NotificationFeed | null {
  return useContext(NotificationFeedContext);
}

/**
 * Opens the feed a FeedSession describes for everything inside. A different
 * user's session opens a fresh feed, so switching users never shows the
 * previous user's Notifications.
 */
export function NotificationFeedProvider({
  session,
  children,
}: {
  session: FeedSession | null;
  children: ReactNode;
}) {
  if (session?.provider === "knock") {
    return (
      <KnockFeed key={session.settings.userId} settings={session.settings}>
        {children}
      </KnockFeed>
    );
  }
  return <>{children}</>;
}

function KnockFeed({
  settings,
  children,
}: {
  settings: Record<string, string>;
  children: ReactNode;
}) {
  const feed = useKnockFeed(settings);
  return (
    <NotificationFeedContext.Provider value={feed}>
      {children}
    </NotificationFeedContext.Provider>
  );
}
