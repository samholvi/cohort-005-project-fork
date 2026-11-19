import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { fakeProvider } from "./fake-provider.server";
import { runInactivityCheck } from "./inactivity.server";

const NOW = new Date(Date.UTC(2026, 9, 20, 12, 0, 0));
const DAY_MS = 24 * 60 * 60 * 1000;

function daysBefore(days: number, extraMs = 0) {
  return new Date(NOW.getTime() - days * DAY_MS + extraMs).toISOString();
}

let db: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;
let lessons: (typeof schema.lessons.$inferSelect)[];

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  lessons = addLessons(base.course.id, 5);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Adds `count` lessons over two modules. Module 2 is inserted first and
 * lessons are inserted in reverse, so ids don't match course order. Returns
 * them in course order.
 */
function addLessons(courseId: number, count: number) {
  const second = db
    .insert(schema.modules)
    .values({ courseId, title: "Later", position: 2 })
    .returning()
    .get();
  const first = db
    .insert(schema.modules)
    .values({ courseId, title: "Basics", position: 1 })
    .returning()
    .get();
  const firstCount = Math.ceil(count / 2);
  const inModule = (moduleId: number, n: number, prefix: string) =>
    Array.from({ length: n }, (_, i) => n - i).map((position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId, title: `${prefix} ${position}`, position })
        .returning()
        .get()
    );
  const later = inModule(second.id, count - firstCount, "Later lesson");
  const basics = inModule(first.id, firstCount, "Basics lesson");
  return [...basics.reverse(), ...later.reverse()];
}

function addCourse(slug: string, status: schema.CourseStatus) {
  return db
    .insert(schema.courses)
    .values({
      title: slug,
      slug,
      description: "Another course",
      salesCopy: "Sales copy",
      instructorId: base.instructor.id,
      categoryId: base.category.id,
      status,
    })
    .returning()
    .get();
}

function enroll(userId: number, courseId: number, enrolledDaysAgo: number) {
  return db
    .insert(schema.enrollments)
    .values({ userId, courseId, enrolledAt: daysBefore(enrolledDaysAgo) })
    .returning()
    .get();
}

function watch(userId: number, lessonId: number, at: string) {
  db.insert(schema.videoWatchEvents)
    .values({
      userId,
      lessonId,
      eventType: "progress",
      positionSeconds: 30,
      createdAt: at,
    })
    .run();
}

function complete(userId: number, lessonId: number) {
  db.insert(schema.lessonProgress)
    .values({
      userId,
      lessonId,
      status: schema.LessonProgressStatus.Completed,
      completedAt: daysBefore(20),
    })
    .run();
}

describe("runInactivityCheck", () => {
  it("nudges a Student who never watched, 7 days after enrolling, with no percentage", async () => {
    enroll(base.user.id, base.course.id, 7);
    const provider = fakeProvider();

    await runInactivityCheck(db, base.user.id, NOW, provider);

    expect(provider.sent).toEqual([
      {
        kind: "inactive-on-course",
        recipients: [
          { id: base.user.id, name: "Test User", email: "test@example.com" },
        ],
        data: {
          courseTitle: "Test Course",
          courseSlug: "test-course",
          lessonId: lessons[0].id,
          lessonTitle: "Basics lesson 1",
          percentComplete: null,
        },
      },
    ]);
  });

  it("leaves a Student alone until a full 7 days have passed", async () => {
    enroll(base.user.id, base.course.id, 30);
    watch(base.user.id, lessons[0].id, daysBefore(7, 1));
    const provider = fakeProvider();

    await runInactivityCheck(db, base.user.id, NOW, provider);

    expect(provider.sent).toEqual([]);
  });

  it("nudges exactly 7 days after the last watch, from the latest watch on the course", async () => {
    enroll(base.user.id, base.course.id, 30);
    watch(base.user.id, lessons[3].id, daysBefore(20));
    watch(base.user.id, lessons[1].id, daysBefore(7));
    const provider = fakeProvider();

    await runInactivityCheck(db, base.user.id, NOW, provider);

    expect(provider.sent).toHaveLength(1);
  });

  it("doesn't count a fresh Enrollment that was never watched as Inactive", async () => {
    enroll(base.user.id, base.course.id, 6);
    const provider = fakeProvider();

    await runInactivityCheck(db, base.user.id, NOW, provider);

    expect(provider.sent).toEqual([]);
  });

  it("gives the percentage complete and picks up at the first incomplete lesson in course order", async () => {
    enroll(base.user.id, base.course.id, 30);
    complete(base.user.id, lessons[0].id);
    complete(base.user.id, lessons[1].id);
    complete(base.user.id, lessons[3].id);
    complete(base.instructor.id, lessons[2].id);
    watch(base.user.id, lessons[3].id, daysBefore(10));
    const provider = fakeProvider();

    await runInactivityCheck(db, base.user.id, NOW, provider);

    expect(provider.sent.map((s) => s.data)).toEqual([
      {
        courseTitle: "Test Course",
        courseSlug: "test-course",
        lessonId: lessons[2].id,
        lessonTitle: "Basics lesson 3",
        percentComplete: 60,
      },
    ]);
  });

  it("never says 100% while a lesson is left", async () => {
    const big = addLessons(base.course.id, 200);
    enroll(base.user.id, base.course.id, 30);
    for (const lesson of [...lessons, ...big].slice(0, 204)) {
      complete(base.user.id, lesson.id);
    }
    const provider = fakeProvider();

    await runInactivityCheck(db, base.user.id, NOW, provider);

    expect(provider.sent.map((s) => s.data.percentComplete)).toEqual([99]);
  });

  it("leaves out a Student who has Finished the course", async () => {
    enroll(base.user.id, base.course.id, 30);
    for (const lesson of lessons) complete(base.user.id, lesson.id);
    const provider = fakeProvider();

    await runInactivityCheck(db, base.user.id, NOW, provider);

    expect(provider.sent).toEqual([]);
  });

  it("leaves out courses that aren't Published", async () => {
    for (const status of [
      schema.CourseStatus.Draft,
      schema.CourseStatus.Archived,
    ]) {
      const course = addCourse(`${status}-course`, status);
      addLessons(course.id, 2);
      enroll(base.user.id, course.id, 30);
    }
    const provider = fakeProvider();

    await runInactivityCheck(db, base.user.id, NOW, provider);

    expect(provider.sent).toEqual([]);
  });

  it("leaves out a Lapsed Student, who has progress but no Enrollment", async () => {
    complete(base.user.id, lessons[0].id);
    watch(base.user.id, lessons[0].id, daysBefore(30));
    const provider = fakeProvider();

    await runInactivityCheck(db, base.user.id, NOW, provider);

    expect(provider.sent).toEqual([]);
  });

  it("judges each course on its own watches", async () => {
    const other = addCourse("other-course", schema.CourseStatus.Published);
    const otherLessons = addLessons(other.id, 2);
    enroll(base.user.id, base.course.id, 30);
    enroll(base.user.id, other.id, 30);
    watch(base.user.id, otherLessons[0].id, daysBefore(1));
    const provider = fakeProvider();

    await runInactivityCheck(db, base.user.id, NOW, provider);

    expect(provider.sent.map((s) => s.data.courseSlug)).toEqual([
      "test-course",
    ]);
  });

  it("only nudges the Student it runs for", async () => {
    enroll(base.instructor.id, base.course.id, 30);
    const provider = fakeProvider();

    await runInactivityCheck(db, base.user.id, NOW, provider);

    expect(provider.sent).toEqual([]);
  });

  it("doesn't touch the database before the caller's next line runs", async () => {
    enroll(base.user.id, base.course.id, 30);
    const provider = fakeProvider();

    const check = runInactivityCheck(db, base.user.id, NOW, provider);
    const claimedBeforeDeferral = db
      .select({ at: schema.enrollments.inactivityNotifiedAt })
      .from(schema.enrollments)
      .get()?.at;
    await check;

    expect(claimedBeforeDeferral).toBeNull();
    expect(provider.sent).toHaveLength(1);
  });

  it("nudges once per stretch, even when the check runs twice at once", async () => {
    enroll(base.user.id, base.course.id, 30);
    const provider = fakeProvider();

    await Promise.all([
      runInactivityCheck(db, base.user.id, NOW, provider),
      runInactivityCheck(db, base.user.id, NOW, provider),
    ]);
    await runInactivityCheck(
      db,
      base.user.id,
      new Date(NOW.getTime() + 30 * DAY_MS),
      provider
    );

    expect(provider.sent).toHaveLength(1);
  });

  it("starts a new stretch once the Student watches again", async () => {
    enroll(base.user.id, base.course.id, 30);
    const provider = fakeProvider();
    await runInactivityCheck(db, base.user.id, NOW, provider);

    const later = new Date(NOW.getTime() + 2 * DAY_MS);
    watch(base.user.id, lessons[0].id, later.toISOString());
    await runInactivityCheck(
      db,
      base.user.id,
      new Date(later.getTime() + 6 * DAY_MS),
      provider
    );
    expect(provider.sent).toHaveLength(1);

    await runInactivityCheck(
      db,
      base.user.id,
      new Date(later.getTime() + 7 * DAY_MS),
      provider
    );
    expect(provider.sent).toHaveLength(2);
  });

  it("never rejects when delivery fails, and logs it", async () => {
    enroll(base.user.id, base.course.id, 30);
    const provider = fakeProvider({ failing: true });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      runInactivityCheck(db, base.user.id, NOW, provider)
    ).resolves.toBeUndefined();

    expect(provider.attempts).toBe(3);
    expect(log).toHaveBeenCalledOnce();
  });

  it("never rejects when the database fails", async () => {
    const provider = fakeProvider();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    db.$client.close();

    await expect(
      runInactivityCheck(db, base.user.id, NOW, provider)
    ).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledOnce();
  });
});
