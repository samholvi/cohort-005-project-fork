import { getPerson, type Db } from "./deliver.server";
import {
  defaultProvider,
  type FeedSession,
  type NotificationProvider,
} from "./provider.server";

/**
 * The FeedSession the app layout hands the browser, or null when there's no
 * feed to show: no one signed in, a provider without a feed, or a provider
 * that failed. A failure is logged and never breaks the page.
 */
export async function feedSessionFor(
  db: Db,
  userId: number | null,
  provider: NotificationProvider = defaultProvider()
): Promise<FeedSession | null> {
  if (userId === null) return null;
  const person = getPerson(db, userId);
  if (!person) return null;

  try {
    return await provider.createFeedSession(person);
  } catch (error) {
    console.error(
      `[notifications] could not open the feed for user ${userId}`,
      error
    );
    return null;
  }
}
