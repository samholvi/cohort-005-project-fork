import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { fakeProvider } from "./fake-provider.server";
import { notifyNewSale, notifySeatClaimed } from "./sales.server";

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const instructor = {
  name: "Test Instructor",
  email: "instructor@example.com",
};

function addUser(name: string, email: string) {
  return db
    .insert(schema.users)
    .values({ name, email, role: schema.UserRole.Student })
    .returning()
    .get();
}

function purchase(userId: number) {
  return db
    .insert(schema.purchases)
    .values({ userId, courseId: base.course.id, amountPaid: 4900 })
    .returning()
    .get();
}

/** A Team Licence bought by `buyerId` with `seats` Unclaimed Seats. */
function teamLicence(buyerId: number, seats: number) {
  const licence = purchase(buyerId);
  const team = db.insert(schema.teams).values({}).returning().get();
  const created = [];
  for (let i = 0; i < seats; i++) {
    created.push(
      db
        .insert(schema.coupons)
        .values({
          teamId: team.id,
          courseId: base.course.id,
          code: `code-${licence.id}-${i}`,
          purchaseId: licence.id,
        })
        .returning()
        .get()
    );
  }
  return { licence, seats: created };
}

function claim(couponId: number, userId: number) {
  db.update(schema.coupons)
    .set({ redeemedByUserId: userId, redeemedAt: NOW.toISOString() })
    .where(eq(schema.coupons.id, couponId))
    .run();
}

describe("notifyNewSale", () => {
  it("tells the Instructor who bought their course in an Individual Purchase", async () => {
    const sale = purchase(base.user.id);
    const provider = fakeProvider();

    await notifyNewSale(db, sale.id, NOW, provider);

    expect(provider.sent).toEqual([
      {
        kind: "new-sale",
        recipients: [{ id: base.instructor.id, ...instructor }],
        data: {
          buyerName: "Test User",
          courseTitle: "Test Course",
          seats: null,
        },
        actor: {
          id: base.user.id,
          name: "Test User",
          email: "test@example.com",
        },
      },
    ]);
  });

  it("counts the Seats of a Team Licence", async () => {
    const { licence } = teamLicence(base.user.id, 10);
    const provider = fakeProvider();

    await notifyNewSale(db, licence.id, NOW, provider);

    expect(provider.sent.map((s) => s.data)).toEqual([
      { buyerName: "Test User", courseTitle: "Test Course", seats: 10 },
    ]);
  });

  it("sends nothing when the Instructor buys their own course", async () => {
    const sale = purchase(base.instructor.id);
    const provider = fakeProvider();

    await notifyNewSale(db, sale.id, NOW, provider);

    expect(provider.sent).toEqual([]);
  });

  it("never throws when the provider keeps failing", async () => {
    const sale = purchase(base.user.id);
    const provider = fakeProvider({ failing: true });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      notifyNewSale(db, sale.id, NOW, provider)
    ).resolves.toBeUndefined();

    expect(provider.attempts).toBe(3);
    expect(log).toHaveBeenCalledOnce();
  });
});

describe("notifySeatClaimed", () => {
  it("tells the Instructor who joined through whose Team Licence", async () => {
    const admin = addUser("Alex Rivera", "alex@example.com");
    const { seats } = teamLicence(admin.id, 10);
    claim(seats[0].id, base.user.id);
    const provider = fakeProvider();

    await notifySeatClaimed(db, seats[0].id, NOW, provider);

    expect(
      provider.sent.find((s) => s.kind === "seat-claimed-instructor")
    ).toEqual({
      kind: "seat-claimed-instructor",
      recipients: [{ id: base.instructor.id, ...instructor }],
      data: {
        studentName: "Test User",
        courseTitle: "Test Course",
        courseId: base.course.id,
        teamAdminName: "Alex Rivera",
      },
      actor: { id: base.user.id, name: "Test User", email: "test@example.com" },
    });
  });

  it("tells the Team Admin how many Seats are left", async () => {
    const admin = addUser("Alex Rivera", "alex@example.com");
    const other = addUser("Jo Park", "jo@example.com");
    const { seats } = teamLicence(admin.id, 10);
    claim(seats[0].id, other.id);
    claim(seats[1].id, base.user.id);
    const provider = fakeProvider();

    await notifySeatClaimed(db, seats[1].id, NOW, provider);

    expect(
      provider.sent.find((s) => s.kind === "seat-claimed-team-admin")
    ).toEqual({
      kind: "seat-claimed-team-admin",
      recipients: [
        { id: admin.id, name: "Alex Rivera", email: "alex@example.com" },
      ],
      data: {
        studentName: "Test User",
        courseTitle: "Test Course",
        seatsLeft: 8,
        seats: 10,
      },
      actor: { id: base.user.id, name: "Test User", email: "test@example.com" },
    });
  });

  it("reports no Seats left when the last one is claimed", async () => {
    const admin = addUser("Alex Rivera", "alex@example.com");
    const { seats } = teamLicence(admin.id, 1);
    claim(seats[0].id, base.user.id);
    const provider = fakeProvider();

    await notifySeatClaimed(db, seats[0].id, NOW, provider);

    expect(
      provider.sent.find((s) => s.kind === "seat-claimed-team-admin")?.data
    ).toEqual({
      studentName: "Test User",
      courseTitle: "Test Course",
      seatsLeft: 0,
      seats: 1,
    });
  });

  it("doesn't tell the Team Admin about a Seat they claimed themselves", async () => {
    const admin = addUser("Alex Rivera", "alex@example.com");
    const { seats } = teamLicence(admin.id, 3);
    claim(seats[0].id, admin.id);
    const provider = fakeProvider();

    await notifySeatClaimed(db, seats[0].id, NOW, provider);

    expect(provider.sent.map((s) => s.kind)).toEqual([
      "seat-claimed-instructor",
    ]);
  });

  it("sends nothing for a Seat no one has claimed", async () => {
    const admin = addUser("Alex Rivera", "alex@example.com");
    const { seats } = teamLicence(admin.id, 3);
    const provider = fakeProvider();

    await notifySeatClaimed(db, seats[0].id, NOW, provider);

    expect(provider.sent).toEqual([]);
  });

  it("never throws when the provider keeps failing", async () => {
    const admin = addUser("Alex Rivera", "alex@example.com");
    const { seats } = teamLicence(admin.id, 3);
    claim(seats[0].id, base.user.id);
    const provider = fakeProvider({ failing: true });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      notifySeatClaimed(db, seats[0].id, NOW, provider)
    ).resolves.toBeUndefined();
  });

  it("still tells the Instructor when the Team Admin is missing", async () => {
    const admin = addUser("Alex Rivera", "alex@example.com");
    const { seats } = teamLicence(admin.id, 3);
    claim(seats[0].id, base.user.id);
    db.$client.pragma("foreign_keys = OFF");
    db.delete(schema.users).where(eq(schema.users.id, admin.id)).run();
    const provider = fakeProvider();

    await notifySeatClaimed(db, seats[0].id, NOW, provider);

    expect(provider.sent).toEqual([
      {
        kind: "seat-claimed-instructor",
        recipients: [{ id: base.instructor.id, ...instructor }],
        data: {
          studentName: "Test User",
          courseTitle: "Test Course",
          courseId: base.course.id,
          teamAdminName: null,
        },
        actor: {
          id: base.user.id,
          name: "Test User",
          email: "test@example.com",
        },
      },
    ]);
  });

  it("still tells the Team Admin when the Instructor's delivery fails", async () => {
    const admin = addUser("Alex Rivera", "alex@example.com");
    const { seats } = teamLicence(admin.id, 3);
    claim(seats[0].id, base.user.id);
    const provider = fakeProvider({ failing: 3 });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await notifySeatClaimed(db, seats[0].id, NOW, provider);

    expect(provider.sent.map((s) => s.kind)).toEqual([
      "seat-claimed-team-admin",
    ]);
  });
});
