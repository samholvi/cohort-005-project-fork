import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { CourseStatus, UserRole } from "~/db/schema";
import { notifyCourseStatusChange } from "./course-status.server";
import { fakeProvider } from "./fake-provider.server";

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;
let admins: (typeof schema.users.$inferSelect)[];

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  admins = ["Alex Admin", "Pat Admin", "Sam Admin"].map((name) =>
    db
      .insert(schema.users)
      .values({
        name,
        email: `${name.split(" ")[0].toLowerCase()}@example.com`,
        role: UserRole.Admin,
      })
      .returning()
      .get()
  );
  setStatus(CourseStatus.Draft);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function setStatus(status: CourseStatus) {
  db.update(schema.courses)
    .set({ status })
    .where(eq(schema.courses.id, base.course.id))
    .run();
}

function person(user: typeof schema.users.$inferSelect) {
  return { id: user.id, name: user.name, email: user.email };
}

describe("notifyCourseStatusChange", () => {
  describe("Instructor publishes their course", () => {
    it("tells every Platform Admin who published which course", async () => {
      setStatus(CourseStatus.Published);
      const provider = fakeProvider();

      await notifyCourseStatusChange(
        db,
        base.course.id,
        CourseStatus.Draft,
        base.instructor.id,
        NOW,
        provider
      );

      expect(provider.sent).toEqual([
        {
          kind: "course-published",
          recipients: admins.map(person),
          data: {
            actorName: "Test Instructor",
            courseTitle: "Test Course",
            courseSlug: "test-course",
          },
          actor: person(base.instructor),
        },
      ]);
    });

    it("leaves out a Platform Admin who published their own course", async () => {
      const [ownerAdmin, ...otherAdmins] = admins;
      db.update(schema.courses)
        .set({ instructorId: ownerAdmin.id, status: CourseStatus.Published })
        .where(eq(schema.courses.id, base.course.id))
        .run();
      const provider = fakeProvider();

      await notifyCourseStatusChange(
        db,
        base.course.id,
        CourseStatus.Draft,
        ownerAdmin.id,
        NOW,
        provider
      );

      expect(provider.sent.map((s) => [s.kind, s.recipients])).toEqual([
        ["course-published", otherAdmins.map(person)],
      ]);
    });

    it("announces republishing an archived course", async () => {
      setStatus(CourseStatus.Published);
      const provider = fakeProvider();

      await notifyCourseStatusChange(
        db,
        base.course.id,
        CourseStatus.Archived,
        base.instructor.id,
        NOW,
        provider
      );

      expect(provider.sent.map((s) => s.kind)).toEqual(["course-published"]);
    });

    it("sends nothing when the Instructor archives their own course", async () => {
      setStatus(CourseStatus.Archived);
      const provider = fakeProvider();

      await notifyCourseStatusChange(
        db,
        base.course.id,
        CourseStatus.Published,
        base.instructor.id,
        NOW,
        provider
      );

      expect(provider.sent).toEqual([]);
    });
  });

  describe("Platform Admin publishes or archives a course", () => {
    it("tells the Instructor a Platform Admin published their course", async () => {
      setStatus(CourseStatus.Published);
      const provider = fakeProvider();

      await notifyCourseStatusChange(
        db,
        base.course.id,
        CourseStatus.Draft,
        admins[1].id,
        NOW,
        provider
      );

      expect(provider.sent).toEqual([
        {
          kind: "course-status-changed",
          recipients: [person(base.instructor)],
          data: {
            status: "published",
            courseTitle: "Test Course",
            courseId: base.course.id,
          },
          actor: person(admins[1]),
        },
      ]);
    });

    it("tells the Instructor a Platform Admin archived their course, and no Platform Admin", async () => {
      setStatus(CourseStatus.Archived);
      const provider = fakeProvider();

      await notifyCourseStatusChange(
        db,
        base.course.id,
        CourseStatus.Published,
        admins[0].id,
        NOW,
        provider
      );

      expect(provider.sent.map((s) => [s.kind, s.recipients, s.data])).toEqual(
        [
          [
            "course-status-changed",
            [person(base.instructor)],
            {
              status: "archived",
              courseTitle: "Test Course",
              courseId: base.course.id,
            },
          ],
        ]
      );
    });

    it("sends nothing when a Platform Admin moves a course back to draft", async () => {
      setStatus(CourseStatus.Draft);
      const provider = fakeProvider();

      await notifyCourseStatusChange(
        db,
        base.course.id,
        CourseStatus.Published,
        admins[0].id,
        NOW,
        provider
      );

      expect(provider.sent).toEqual([]);
    });
  });

  it("sends nothing when the status didn't change", async () => {
    setStatus(CourseStatus.Published);
    const provider = fakeProvider();

    await notifyCourseStatusChange(
      db,
      base.course.id,
      CourseStatus.Published,
      admins[0].id,
      NOW,
      provider
    );
    await notifyCourseStatusChange(
      db,
      base.course.id,
      CourseStatus.Published,
      base.instructor.id,
      NOW,
      provider
    );

    expect(provider.sent).toEqual([]);
  });

  it("retries a failing provider, then logs and gives up without throwing", async () => {
    setStatus(CourseStatus.Archived);
    const provider = fakeProvider({ failing: true });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      notifyCourseStatusChange(
        db,
        base.course.id,
        CourseStatus.Published,
        admins[0].id,
        NOW,
        provider
      )
    ).resolves.toBeUndefined();

    expect(provider.attempts).toBe(3);
    expect(provider.sent).toEqual([]);
    expect(log).toHaveBeenCalledOnce();
  });
});
