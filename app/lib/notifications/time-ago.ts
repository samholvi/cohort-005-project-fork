const MINUTE_MS = 60 * 1000;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/** How long ago `isoTime` was, as a Notification row shows it. */
export function timeAgo(isoTime: string, now: Date): string {
  const minutes = Math.floor(
    (now.getTime() - new Date(isoTime).getTime()) / MINUTE_MS
  );
  if (minutes < 1) return "just now";
  if (minutes < MINUTES_PER_HOUR) return `${minutes}m ago`;
  if (minutes < MINUTES_PER_DAY) {
    return `${Math.floor(minutes / MINUTES_PER_HOUR)}h ago`;
  }
  return `${Math.floor(minutes / MINUTES_PER_DAY)}d ago`;
}
