import { Bell, CheckCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { describeNotification } from "~/lib/notifications/descriptions";
import { useNotificationFeed } from "~/lib/notifications/feed";
import { kindLabel, type Notification } from "~/lib/notifications/kinds";
import { timeAgo } from "~/lib/notifications/time-ago";
import { cn } from "~/lib/utils";

/**
 * The bell in the sidebar header: a count of Unread Notifications and a
 * dropdown of all of them. Hidden when there's no feed.
 */
export function NotificationBell() {
  const feed = useNotificationFeed();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutsideClose(open, close);

  if (!feed) return null;
  const { notifications, unreadCount, markRead, markAllRead } = feed;

  function openNotification(notification: Notification, href: string | null) {
    setOpen(false);
    markRead(notification.id);
    if (href) navigate(href);
  }

  const now = new Date();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent"
        title="Notifications"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} Unread`
            : "Notifications"
        }
      >
        <Bell className="size-5" />
        <UnreadBadge count={unreadCount} />
      </button>
      {open && (
        <div className="absolute top-0 left-full z-50 ml-3 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="font-semibold">Notifications</span>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <CheckCheck className="size-3.5" /> Mark all as Read
            </button>
          </div>
          <div className="max-h-[28rem] divide-y overflow-y-auto">
            {notifications.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No Notifications yet.
              </p>
            )}
            {notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                now={now}
                onOpen={openNotification}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  notification,
  now,
  onOpen,
}: {
  notification: Notification;
  now: Date;
  onOpen: (notification: Notification, href: string | null) => void;
}) {
  const { text, href } = describeNotification(notification);
  const unread = !notification.read;

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent",
        unread ? "bg-primary/5" : "text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          unread ? "bg-primary" : "bg-transparent"
        )}
      />
      <button
        type="button"
        onClick={() => onOpen(notification, href)}
        className="flex-1 text-left"
      >
        <div className={cn(unread && "text-foreground")}>{text}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {kindLabel(notification.kind)} ·{" "}
          {timeAgo(notification.createdAt, now)}
        </div>
      </button>
    </div>
  );
}

function UnreadBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
      {count > 9 ? "9+" : count}
    </span>
  );
}

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onMouseDown(event: MouseEvent) {
      if (
        ref.current &&
        event.target instanceof Node &&
        !ref.current.contains(event.target)
      ) {
        close();
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open, close]);
  return ref;
}
