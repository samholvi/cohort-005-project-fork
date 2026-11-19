import { eq, inArray } from "drizzle-orm";
import * as schema from "~/db/schema";
import { RefundStatus, UserRole } from "~/db/schema";
import { getPurchaseKind } from "~/lib/refunds.server";
import {
  getPerson,
  markReadWithRetries,
  notifyInBackground,
  sendWithRetries,
  type Db,
} from "./deliver.server";
import type {
  RefundApprovedOnYourCourseData,
  RefundDecision,
  RefundRequestApprovedData,
  RefundRequestDeclinedData,
  RefundRequestToDecideData,
} from "./descriptions/refunds";
import { NotificationKind } from "./kinds";
import {
  defaultProvider,
  type NotificationData,
  type NotificationPerson,
  type NotificationProvider,
} from "./provider.server";

// ─── Refund Request Notifications ───
// Raising a Refund Request tells every Platform Admin; deciding one tells the
// buyer (and, on approval, the course's Instructor) and marks the Platform
// Admins' Notifications about it Read. Who decided is not stored with the
// Notification: the list looks it up from the Refund Request when rendered
// (`getRefundDecisions`), because a provider can't change a sent
// Notification.

/**
 * Refund Request to decide: tells every Platform Admin, except the buyer if
 * they are one. Call after the Refund Request is saved, without awaiting; it
 * never rejects.
 */
export function notifyRefundRequestRaised(
  db: Db,
  refundRequestId: number,
  actorId: number,
  now: Date,
  provider: NotificationProvider = defaultProvider()
): Promise<void> {
  return notifyInBackground(
    NotificationKind.RefundRequestToDecide,
    now,
    async () => {
      const refundRequest = getRefundRequest(db, refundRequestId);
      const actor = getPerson(db, actorId);
      if (!refundRequest || !actor) return;

      const data: RefundRequestToDecideData = {
        key: String(refundRequestId),
        refundRequestId,
        buyerName: refundRequest.buyer.name,
        courseTitle: refundRequest.courseTitle,
      };

      await sendWithRetries(
        provider,
        NotificationKind.RefundRequestToDecide,
        getPlatformAdmins(db),
        data,
        actor
      );
    }
  );
}

/**
 * After a Platform Admin decides a Refund Request: tells the buyer how it was
 * decided, tells the course's Instructor about an approval, and marks every
 * Platform Admin's Refund Request to decide about it Read. The actor (the
 * deciding Platform Admin) is never told about their own decision. Each part
 * is delivered on its own, so one failing doesn't stop the others. Call after
 * the decision is saved, without awaiting; it never rejects.
 */
export function notifyRefundRequestDecided(
  db: Db,
  refundRequestId: number,
  actorId: number,
  now: Date,
  provider: NotificationProvider = defaultProvider()
): Promise<void> {
  return notifyInBackground("refund request decision", now, async () => {
    const refundRequest = getRefundRequest(db, refundRequestId);
    const actor = getPerson(db, actorId);
    if (!refundRequest || !actor) return;
    if (refundRequest.status === RefundStatus.Open) return;

    const { buyer, courseTitle, courseSlug } = refundRequest;
    const purchaseKind = getPurchaseKind(db, refundRequest.purchaseId);

    const send = (
      kind: NotificationKind,
      recipients: NotificationPerson[],
      data: NotificationData
    ) =>
      notifyInBackground(kind, now, () =>
        sendWithRetries(provider, kind, recipients, data, actor)
      );

    const parts: Promise<void>[] = [
      notifyInBackground(
        `${NotificationKind.RefundRequestToDecide} read`,
        now,
        () =>
          markReadWithRetries(
            provider,
            NotificationKind.RefundRequestToDecide,
            String(refundRequestId),
            getPlatformAdmins(db).map((admin) => admin.id)
          )
      ),
    ];

    if (refundRequest.status === RefundStatus.Approved) {
      const approved: RefundRequestApprovedData = {
        courseTitle,
        courseSlug,
        amountRefunded:
          refundRequest.amountRefunded ?? refundRequest.amountPaid,
        purchaseKind,
      };
      parts.push(
        send(NotificationKind.RefundRequestApproved, [buyer], approved)
      );

      const instructor = getPerson(db, refundRequest.instructorId);
      if (instructor) {
        const onYourCourse: RefundApprovedOnYourCourseData = {
          courseTitle,
          buyerName: buyer.name,
        };
        parts.push(
          send(
            NotificationKind.RefundApprovedOnYourCourse,
            [instructor],
            onYourCourse
          )
        );
      }
    } else {
      const declined: RefundRequestDeclinedData = {
        courseTitle,
        courseSlug,
        note: refundRequest.decisionNote ?? "",
        purchaseKind,
      };
      parts.push(
        send(NotificationKind.RefundRequestDeclined, [buyer], declined)
      );
    }

    await Promise.all(parts);
  });
}

/**
 * How each decided Refund Request among `keys` (Refund Request ids, as the
 * Notifications' `key`) was decided and by whom, for describing Refund
 * Request to decide. Open, unknown and malformed keys are left out.
 */
export function getRefundDecisions(
  db: Db,
  keys: string[]
): Record<string, RefundDecision> {
  const ids = keys.filter((key) => /^\d+$/.test(key)).map((key) => Number(key));
  if (ids.length === 0) return {};

  const rows = db
    .select({
      id: schema.refunds.id,
      status: schema.refunds.status,
      decidedByName: schema.users.name,
    })
    .from(schema.refunds)
    .innerJoin(
      schema.users,
      eq(schema.refunds.resolvedByUserId, schema.users.id)
    )
    .where(inArray(schema.refunds.id, ids))
    .all();

  const decisions: Record<string, RefundDecision> = {};
  for (const row of rows) {
    if (row.status === RefundStatus.Open) continue;
    decisions[String(row.id)] = {
      status: row.status,
      decidedByName: row.decidedByName,
    };
  }
  return decisions;
}

function getRefundRequest(db: Db, refundRequestId: number) {
  const row = db
    .select({
      status: schema.refunds.status,
      decisionNote: schema.refunds.decisionNote,
      amountRefunded: schema.refunds.amountRefunded,
      purchaseId: schema.purchases.id,
      amountPaid: schema.purchases.amountPaid,
      buyerId: schema.purchases.userId,
      courseTitle: schema.courses.title,
      courseSlug: schema.courses.slug,
      instructorId: schema.courses.instructorId,
    })
    .from(schema.refunds)
    .innerJoin(
      schema.purchases,
      eq(schema.refunds.purchaseId, schema.purchases.id)
    )
    .innerJoin(schema.courses, eq(schema.purchases.courseId, schema.courses.id))
    .where(eq(schema.refunds.id, refundRequestId))
    .get();
  if (!row) return null;

  const buyer = getPerson(db, row.buyerId);
  if (!buyer) return null;

  return { ...row, buyer };
}

function getPlatformAdmins(db: Db): NotificationPerson[] {
  return db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
    })
    .from(schema.users)
    .where(eq(schema.users.role, UserRole.Admin))
    .all();
}
