import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  approveRefundRequest,
  declineRefundRequest,
  raiseRefundRequest,
} from "~/lib/refunds.server";
import { fakeProvider, type FakeProvider } from "./fake-provider.server";
import {
  getRefundDecisions,
  notifyRefundRequestDecided,
  notifyRefundRequestRaised,
} from "./refunds.server";

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;
let pat: typeof schema.users.$inferSelect;
let dana: typeof schema.users.$inferSelect;
let robin: typeof schema.users.$inferSelect;
let buyer: typeof schema.users.$inferSelect;

function addUser(name: string, role: UserRole) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.split(" ")[0].toLowerCase()}@example.com`,
      role,
    })
    .returning()
    .get();
}

function person(user: typeof schema.users.$inferSelect) {
  return { id: user.id, name: user.name, email: user.email };
}

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  // Several Platform Admins, so "every Platform Admin" means something.
  pat = addUser("Pat Admin", UserRole.Admin);
  dana = addUser("Dana Lee", UserRole.Admin);
  robin = addUser("Robin Fox", UserRole.Admin);
  buyer = addUser("Alex Kim", UserRole.Student);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function buyForSelf(userId: number, amountPaid = 49000) {
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId,
      courseId: base.course.id,
      amountPaid,
      createdAt: new Date(2026, 9, 3).toISOString(),
    })
    .returning()
    .get();
  db.insert(schema.enrollments)
    .values({ userId, courseId: base.course.id })
    .run();
  return purchase;
}

function buySeats(userId: number, seats: number) {
  const team = db.insert(schema.teams).values({}).returning().get();
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId,
      courseId: base.course.id,
      amountPaid: 7900 * seats,
      createdAt: new Date(2026, 9, 3).toISOString(),
    })
    .returning()
    .get();
  const seatRows = Array.from({ length: seats }, (_, i) =>
    db
      .insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: `SEAT-${purchase.id}-${i}`,
        purchaseId: purchase.id,
      })
      .returning()
      .get()
  );
  return { purchase, seats: seatRows };
}

function raise(purchaseId: number, buyerId: number) {
  const result = raiseRefundRequest(
    db,
    purchaseId,
    buyerId,
    "It wasn't what I expected.",
    NOW
  );
  if (!result.ok) throw new Error(result.error);
  return result.refundRequestId;
}

function approve(refundRequestId: number, adminId: number) {
  const result = approveRefundRequest(db, refundRequestId, adminId, null, NOW);
  if (!result.ok) throw new Error(result.error);
}

function decline(refundRequestId: number, adminId: number, note: string) {
  const result = declineRefundRequest(db, refundRequestId, adminId, note, NOW);
  if (!result.ok) throw new Error(result.error);
}

function sentOf(provider: FakeProvider, kind: string) {
  return provider.sent.filter((s) => s.kind === kind);
}

describe("notifyRefundRequestRaised", () => {
  it("tells every Platform Admin who wants a refund for which course", async () => {
    const purchase = buyForSelf(buyer.id);
    const refundRequestId = raise(purchase.id, buyer.id);
    const provider = fakeProvider();

    await notifyRefundRequestRaised(
      db,
      refundRequestId,
      buyer.id,
      NOW,
      provider
    );

    expect(provider.sent).toEqual([
      {
        kind: "refund-request-to-decide",
        recipients: [person(pat), person(dana), person(robin)],
        data: {
          key: String(refundRequestId),
          refundRequestId,
          buyerName: "Alex Kim",
          courseTitle: "Test Course",
        },
        actor: person(buyer),
      },
    ]);
  });

  it("leaves out a Platform Admin who raised it themselves", async () => {
    const purchase = buyForSelf(dana.id);
    const refundRequestId = raise(purchase.id, dana.id);
    const provider = fakeProvider();

    await notifyRefundRequestRaised(
      db,
      refundRequestId,
      dana.id,
      NOW,
      provider
    );

    expect(provider.sent.map((s) => s.recipients)).toEqual([
      [person(pat), person(robin)],
    ]);
  });

  it("retries a failing provider, then logs and gives up without throwing", async () => {
    const purchase = buyForSelf(buyer.id);
    const refundRequestId = raise(purchase.id, buyer.id);
    const provider = fakeProvider({ failing: true });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      notifyRefundRequestRaised(db, refundRequestId, buyer.id, NOW, provider)
    ).resolves.toBeUndefined();

    expect(provider.attempts).toBe(3);
    expect(log).toHaveBeenCalledOnce();
  });
});

describe("notifyRefundRequestDecided", () => {
  it("tells the buyer of an Individual Purchase it was approved, with the amount in cents", async () => {
    const purchase = buyForSelf(buyer.id, 49000);
    const refundRequestId = raise(purchase.id, buyer.id);
    approve(refundRequestId, dana.id);
    const provider = fakeProvider();

    await notifyRefundRequestDecided(
      db,
      refundRequestId,
      dana.id,
      NOW,
      provider
    );

    expect(sentOf(provider, "refund-request-approved")).toEqual([
      {
        kind: "refund-request-approved",
        recipients: [person(buyer)],
        data: {
          courseTitle: "Test Course",
          courseSlug: "test-course",
          amountRefunded: 49000,
          purchaseKind: "individual_purchase",
        },
        actor: person(dana),
      },
    ]);
  });

  it("tells the buyer of a Team Licence it was approved, as a Team Licence", async () => {
    const { purchase } = buySeats(buyer.id, 5);
    const refundRequestId = raise(purchase.id, buyer.id);
    approve(refundRequestId, dana.id);
    const provider = fakeProvider();

    await notifyRefundRequestDecided(
      db,
      refundRequestId,
      dana.id,
      NOW,
      provider
    );

    expect(sentOf(provider, "refund-request-approved")).toMatchObject([
      {
        recipients: [person(buyer)],
        data: { amountRefunded: 39500, purchaseKind: "team_licence" },
      },
    ]);
  });

  it("tells the buyer it was declined, with the Platform Admin's note", async () => {
    const purchase = buyForSelf(buyer.id);
    const refundRequestId = raise(purchase.id, buyer.id);
    decline(refundRequestId, dana.id, "You finished most of the course.");
    const provider = fakeProvider();

    await notifyRefundRequestDecided(
      db,
      refundRequestId,
      dana.id,
      NOW,
      provider
    );

    expect(sentOf(provider, "refund-request-declined")).toEqual([
      {
        kind: "refund-request-declined",
        recipients: [person(buyer)],
        data: {
          courseTitle: "Test Course",
          courseSlug: "test-course",
          note: "You finished most of the course.",
          purchaseKind: "individual_purchase",
        },
        actor: person(dana),
      },
    ]);
    expect(sentOf(provider, "refund-request-approved")).toEqual([]);
  });

  it("declines a Team Licence as a Team Licence", async () => {
    const { purchase } = buySeats(buyer.id, 3);
    const refundRequestId = raise(purchase.id, buyer.id);
    decline(refundRequestId, dana.id, "Outside the window.");
    const provider = fakeProvider();

    await notifyRefundRequestDecided(
      db,
      refundRequestId,
      dana.id,
      NOW,
      provider
    );

    expect(sentOf(provider, "refund-request-declined")).toMatchObject([
      { data: { purchaseKind: "team_licence" } },
    ]);
  });

  it("tells the buyer who also holds a Claimed Seat it was approved", async () => {
    // They keep their Enrollment (ADR 0004); the Notification is the same.
    const teamAdmin = addUser("Sam Okafor", UserRole.Student);
    const { seats } = buySeats(teamAdmin.id, 2);
    db.update(schema.coupons)
      .set({ redeemedByUserId: buyer.id, redeemedAt: NOW.toISOString() })
      .where(eq(schema.coupons.id, seats[0].id))
      .run();
    const purchase = buyForSelf(buyer.id);
    const refundRequestId = raise(purchase.id, buyer.id);
    approve(refundRequestId, dana.id);
    const provider = fakeProvider();

    await notifyRefundRequestDecided(
      db,
      refundRequestId,
      dana.id,
      NOW,
      provider
    );

    expect(sentOf(provider, "refund-request-approved")).toMatchObject([
      {
        recipients: [person(buyer)],
        data: { purchaseKind: "individual_purchase" },
      },
    ]);
  });

  it("tells the course's Instructor about an approval", async () => {
    const purchase = buyForSelf(buyer.id);
    const refundRequestId = raise(purchase.id, buyer.id);
    approve(refundRequestId, dana.id);
    const provider = fakeProvider();

    await notifyRefundRequestDecided(
      db,
      refundRequestId,
      dana.id,
      NOW,
      provider
    );

    expect(sentOf(provider, "refund-approved-on-your-course")).toEqual([
      {
        kind: "refund-approved-on-your-course",
        recipients: [person(base.instructor)],
        data: { courseTitle: "Test Course", buyerName: "Alex Kim" },
        actor: person(dana),
      },
    ]);
  });

  it("doesn't tell the Instructor about a decline", async () => {
    const purchase = buyForSelf(buyer.id);
    const refundRequestId = raise(purchase.id, buyer.id);
    decline(refundRequestId, dana.id, "No.");
    const provider = fakeProvider();

    await notifyRefundRequestDecided(
      db,
      refundRequestId,
      dana.id,
      NOW,
      provider
    );

    expect(sentOf(provider, "refund-approved-on-your-course")).toEqual([]);
  });

  it.each([
    ["approved", approve],
    ["declined", (id: number, adminId: number) => decline(id, adminId, "No.")],
  ])(
    "marks the Refund Request to decide Read for every Platform Admin once %s",
    async (_, decide) => {
      const purchase = buyForSelf(buyer.id);
      const refundRequestId = raise(purchase.id, buyer.id);
      decide(refundRequestId, dana.id);
      const provider = fakeProvider();

      await notifyRefundRequestDecided(
        db,
        refundRequestId,
        dana.id,
        NOW,
        provider
      );

      expect(provider.markedRead).toEqual([
        {
          kind: "refund-request-to-decide",
          key: String(refundRequestId),
          recipientIds: [pat.id, dana.id, robin.id],
        },
      ]);
    }
  );

  it("sends the deciding Platform Admin nothing about their own decision", async () => {
    const purchase = buyForSelf(buyer.id);
    const refundRequestId = raise(purchase.id, buyer.id);
    approve(refundRequestId, dana.id);
    const provider = fakeProvider();

    await notifyRefundRequestDecided(
      db,
      refundRequestId,
      dana.id,
      NOW,
      provider
    );

    const recipientIds = provider.sent.flatMap((s) =>
      s.recipients.map((r) => r.id)
    );
    expect(recipientIds).not.toContain(dana.id);
  });

  it("does nothing for a Refund Request that is still Open", async () => {
    const purchase = buyForSelf(buyer.id);
    const refundRequestId = raise(purchase.id, buyer.id);
    const provider = fakeProvider();

    await notifyRefundRequestDecided(
      db,
      refundRequestId,
      dana.id,
      NOW,
      provider
    );

    expect(provider.attempts).toBe(0);
  });

  it("never throws when the provider keeps failing, and still tries every part", async () => {
    const purchase = buyForSelf(buyer.id);
    const refundRequestId = raise(purchase.id, buyer.id);
    approve(refundRequestId, dana.id);
    const provider = fakeProvider({ failing: true });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      notifyRefundRequestDecided(db, refundRequestId, dana.id, NOW, provider)
    ).resolves.toBeUndefined();

    // Buyer, Instructor and mark-Read: three attempts each.
    expect(provider.attempts).toBe(9);
    expect(log).toHaveBeenCalledTimes(3);
  });
});

describe("getRefundDecisions", () => {
  it("says how each decided Refund Request was decided, and by whom", () => {
    const first = raise(buyForSelf(buyer.id).id, buyer.id);
    const other = addUser("Jo Park", UserRole.Student);
    const second = raise(buyForSelf(other.id).id, other.id);
    const stillOpen = raise(buySeats(other.id, 2).purchase.id, other.id);
    approve(first, dana.id);
    decline(second, robin.id, "No.");

    const decisions = getRefundDecisions(db, [
      String(first),
      String(second),
      String(stillOpen),
      "999",
      "not-a-number",
    ]);

    expect(decisions).toEqual({
      [String(first)]: { status: "approved", decidedByName: "Dana Lee" },
      [String(second)]: { status: "declined", decidedByName: "Robin Fox" },
    });
  });

  it("looks up nothing for no keys", () => {
    expect(getRefundDecisions(db, [])).toEqual({});
  });
});
