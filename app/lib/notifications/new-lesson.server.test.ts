import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { fakeProvider } from "./fake-provider.server";
import { notifyEnrolledStudents } from "./new-lesson.server";

const NOW = new Date("2026-10-06T12:00:00.000Z");

let db: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;
let lesson: typeof schema.lessons.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  const courseModule = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();
  lesson = db
    .insert(schema.lessons)
    .values({ moduleId: courseModule.id, title: "Closures", position: 1 })
    .returning()
    .get();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function student(name: string, email: string) {
  return db
    .insert(schema.users)
    .values({ name, email, role: schema.UserRole.Student })
    .returning()
    .get();
}

function enroll(userId: number) {
  db.insert(schema.enrollments)
    .values({ userId, courseId: base.course.id })
    .run();
}

function studentsNotifiedAt() {
  return db
    .select({ at: schema.lessons.studentsNotifiedAt })
    .from(schema.lessons)
    .where(eq(schema.lessons.id, lesson.id))
    .get()?.at;
}

describe("notifyEnrolledStudents", () => {
  it("sends New lesson to every Student with an Enrollment and marks the lesson notified", async () => {
    const other = student("Other Student", "other@example.com");
    student("Not Enrolled", "not-enrolled@example.com");
    enroll(base.user.id);
    enroll(other.id);
    const provider = fakeProvider();

    const result = await notifyEnrolledStudents(
      db,
      lesson.id,
      base.instructor.id,
      NOW,
      provider
    );

    expect(result).toEqual({ ok: true, notifiedAt: NOW.toISOString() });
    expect(provider.sent).toEqual([
      {
        kind: "new-lesson",
        recipients: [
          { id: base.user.id, name: "Test User", email: "test@example.com" },
          { id: other.id, name: "Other Student", email: "other@example.com" },
        ],
        data: {
          courseTitle: "Test Course",
          lessonTitle: "Closures",
          lessonId: lesson.id,
          courseSlug: "test-course",
        },
        actor: {
          id: base.instructor.id,
          name: "Test Instructor",
          email: "instructor@example.com",
        },
      },
    ]);
    expect(studentsNotifiedAt()).toBe(NOW.toISOString());
  });

  it("never sends to the course's Instructor, even when enrolled and an Admin presses the button", async () => {
    const admin = db
      .insert(schema.users)
      .values({
        name: "Admin",
        email: "admin@example.com",
        role: schema.UserRole.Admin,
      })
      .returning()
      .get();
    enroll(base.user.id);
    enroll(base.instructor.id);
    const provider = fakeProvider();

    await notifyEnrolledStudents(db, lesson.id, admin.id, NOW, provider);

    expect(provider.sent.map((s) => s.recipients)).toEqual([
      [{ id: base.user.id, name: "Test User", email: "test@example.com" }],
    ]);
  });

  it("refuses on a draft course: nothing is sent and the lesson stays unmarked", async () => {
    db.update(schema.courses)
      .set({ status: schema.CourseStatus.Draft })
      .where(eq(schema.courses.id, base.course.id))
      .run();
    enroll(base.user.id);
    const provider = fakeProvider();

    const result = await notifyEnrolledStudents(
      db,
      lesson.id,
      base.instructor.id,
      NOW,
      provider
    );

    expect(result).toEqual({ ok: false, reason: "course-not-published" });
    expect(provider.attempts).toBe(0);
    expect(studentsNotifiedAt()).toBeNull();
  });

  it("refuses a second time: nothing more is sent and the first date stays", async () => {
    enroll(base.user.id);
    const provider = fakeProvider();
    await notifyEnrolledStudents(
      db,
      lesson.id,
      base.instructor.id,
      NOW,
      provider
    );
    const later = new Date("2026-10-07T09:00:00.000Z");

    const result = await notifyEnrolledStudents(
      db,
      lesson.id,
      base.instructor.id,
      later,
      provider
    );

    expect(result).toEqual({ ok: false, reason: "already-notified" });
    expect(provider.sent).toHaveLength(1);
    expect(studentsNotifiedAt()).toBe(NOW.toISOString());
  });

  it("retries a failing provider, then reports the failure and leaves the lesson unmarked", async () => {
    enroll(base.user.id);
    const provider = fakeProvider({ failing: true });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await notifyEnrolledStudents(
      db,
      lesson.id,
      base.instructor.id,
      NOW,
      provider
    );

    expect(result).toEqual({ ok: false, reason: "delivery-failed" });
    expect(provider.attempts).toBe(3);
    expect(studentsNotifiedAt()).toBeNull();
    expect(log).toHaveBeenCalledOnce();
  });

  it("marks the lesson notified when the provider recovers on a retry", async () => {
    enroll(base.user.id);
    const provider = fakeProvider({ failing: 2 });

    const result = await notifyEnrolledStudents(
      db,
      lesson.id,
      base.instructor.id,
      NOW,
      provider
    );

    expect(result).toEqual({ ok: true, notifiedAt: NOW.toISOString() });
    expect(provider.sent).toHaveLength(1);
    expect(studentsNotifiedAt()).toBe(NOW.toISOString());
  });
});
