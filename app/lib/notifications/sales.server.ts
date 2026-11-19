import { and, count, eq, isNull } from "drizzle-orm";
import * as schema from "~/db/schema";
import {
  getPerson,
  notifyInBackground,
  sendWithRetries,
  type Db,
} from "./deliver.server";
import type {
  NewSaleData,
  SeatClaimedInstructorData,
  SeatClaimedTeamAdminData,
} from "./descriptions/sales";
import { NotificationKind } from "./kinds";
import { defaultProvider, type NotificationProvider } from "./provider.server";

/**
 * New sale: tells the course's Instructor about a Purchase, naming the Seat
 * count when it is a Team Licence. Call after the Purchase and its Seats are
 * saved, without awaiting; it never rejects.
 */
export function notifyNewSale(
  db: Db,
  purchaseId: number,
  now: Date,
  provider: NotificationProvider = defaultProvider()
): Promise<void> {
  return notifyInBackground(NotificationKind.NewSale, now, async () => {
    const sale = db
      .select({
        buyerId: schema.purchases.userId,
        courseTitle: schema.courses.title,
        instructorId: schema.courses.instructorId,
      })
      .from(schema.purchases)
      .innerJoin(
        schema.courses,
        eq(schema.purchases.courseId, schema.courses.id)
      )
      .where(eq(schema.purchases.id, purchaseId))
      .get();
    if (!sale) return;

    const buyer = getPerson(db, sale.buyerId);
    const instructor = getPerson(db, sale.instructorId);
    if (!buyer || !instructor) return;

    const seats = teamLicenceSeatCount(db, purchaseId);
    const data: NewSaleData = {
      buyerName: buyer.name,
      courseTitle: sale.courseTitle,
      seats: seats === 0 ? null : seats,
    };

    await sendWithRetries(
      provider,
      NotificationKind.NewSale,
      [instructor],
      data,
      buyer
    );
  });
}

/**
 * Seat claimed: tells the course's Instructor and the Team Admin who bought
 * the Team Licence that a Student claimed this Seat. Each delivery stands on
 * its own, so one failing doesn't stop the other. Call after the claim is
 * saved, without awaiting; it never rejects.
 */
export function notifySeatClaimed(
  db: Db,
  seatId: number,
  now: Date,
  provider: NotificationProvider = defaultProvider()
): Promise<void> {
  return notifyInBackground("seat-claimed", now, async () => {
    const seat = db
      .select({
        purchaseId: schema.coupons.purchaseId,
        studentId: schema.coupons.redeemedByUserId,
        courseId: schema.courses.id,
        courseTitle: schema.courses.title,
        instructorId: schema.courses.instructorId,
        teamAdminId: schema.purchases.userId,
      })
      .from(schema.coupons)
      .innerJoin(schema.courses, eq(schema.coupons.courseId, schema.courses.id))
      .innerJoin(
        schema.purchases,
        eq(schema.coupons.purchaseId, schema.purchases.id)
      )
      .where(eq(schema.coupons.id, seatId))
      .get();
    if (!seat || seat.studentId === null) return;

    const student = getPerson(db, seat.studentId);
    const instructor = getPerson(db, seat.instructorId);
    const teamAdmin = getPerson(db, seat.teamAdminId);
    if (!student) return;

    const forInstructor: SeatClaimedInstructorData = {
      studentName: student.name,
      courseTitle: seat.courseTitle,
      courseId: seat.courseId,
      teamAdminName: teamAdmin?.name ?? null,
    };
    const forTeamAdmin: SeatClaimedTeamAdminData = {
      studentName: student.name,
      courseTitle: seat.courseTitle,
      seatsLeft: unclaimedSeatCount(db, seat.purchaseId),
      seats: teamLicenceSeatCount(db, seat.purchaseId),
    };

    // Separate wrappers: a failed delivery to one never blocks the other.
    await notifyInBackground(
      NotificationKind.SeatClaimedInstructor,
      now,
      async () => {
        if (!instructor) return;
        await sendWithRetries(
          provider,
          NotificationKind.SeatClaimedInstructor,
          [instructor],
          forInstructor,
          student
        );
      }
    );
    await notifyInBackground(
      NotificationKind.SeatClaimedTeamAdmin,
      now,
      async () => {
        if (!teamAdmin) return;
        await sendWithRetries(
          provider,
          NotificationKind.SeatClaimedTeamAdmin,
          [teamAdmin],
          forTeamAdmin,
          student
        );
      }
    );
  });
}

/** How many Seats a Purchase granted: 0 for an Individual Purchase. */
function teamLicenceSeatCount(db: Db, purchaseId: number): number {
  const row = db
    .select({ seats: count() })
    .from(schema.coupons)
    .where(eq(schema.coupons.purchaseId, purchaseId))
    .get();
  return row?.seats ?? 0;
}

/** Seats on this Team Licence that can still be claimed. */
function unclaimedSeatCount(db: Db, purchaseId: number): number {
  const row = db
    .select({ seats: count() })
    .from(schema.coupons)
    .where(
      and(
        eq(schema.coupons.purchaseId, purchaseId),
        isNull(schema.coupons.redeemedAt),
        isNull(schema.coupons.refundedAt)
      )
    )
    .get();
  return row?.seats ?? 0;
}
