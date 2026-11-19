import { data } from "react-router";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/api.notifications.lookups";
import { db } from "~/db";
import { UserRole, users } from "~/db/schema";
import { getCurrentUserId } from "~/lib/session";
import type { NotificationLookups } from "~/lib/notifications/descriptions";
import { getRefundDecisions } from "~/lib/notifications/refunds.server";

// What has happened since a Notification was sent, which a provider can't
// add to it afterwards. The Notification list calls this with the `key`s of
// the items that need it and passes the result to `describeNotification`:
//
//   GET /api/notifications/lookups?refundRequest=7&refundRequest=9

const lookupsQuerySchema = z.object({
  refundRequest: z.array(z.string().regex(/^\d+$/)).max(100),
});

export async function loader({
  request,
  url,
}: Route.LoaderArgs): Promise<NotificationLookups> {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }

  const parsed = lookupsQuerySchema.safeParse({
    refundRequest: url.searchParams.getAll("refundRequest"),
  });
  if (!parsed.success) {
    throw data("Invalid lookup.", { status: 400 });
  }

  const user = db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();

  // Only Platform Admins get Refund Request to decide.
  if (user?.role !== UserRole.Admin) return {};

  return {
    refundDecisions: getRefundDecisions(db, parsed.data.refundRequest),
  };
}
