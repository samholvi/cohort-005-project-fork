import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { notifyNewQuestion, notifyNewRating } from "./engagement.server";
import { fakeProvider } from "./fake-provider.server";

const NOW = new Date(2026, 9, 6, 12, 0, 0);

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

function person(user: typeof schema.users.$inferSelect) {
  return { id: user.id, name: user.name, email: user.email };
}

function instructor() {
  return person(base.instructor);
}

function student() {
  return person(base.user);
}

function comment(userId: number, parentId: number | null) {
  return db
    .insert(schema.comments)
    .values({ userId, lessonId: lesson.id, parentId, body: "Why?" })
    .returning()
    .get();
}

describe("notifyNewQuestion", () => {
  it("tells the course's Instructor who asked, on which lesson", async () => {
    const question = comment(base.user.id, null);
    const provider = fakeProvider();

    await notifyNewQuestion(db, question.id, base.user.id, NOW, provider);

    expect(provider.sent).toEqual([
      {
        kind: "new-question",
        recipients: [instructor()],
        data: {
          actorName: "Test User",
          lessonTitle: "Closures",
          commentId: question.id,
        },
        actor: student(),
      },
    ]);
  });

  it("sends nothing when the Instructor asks on their own lesson", async () => {
    const question = comment(base.instructor.id, null);
    const provider = fakeProvider();

    await notifyNewQuestion(db, question.id, base.instructor.id, NOW, provider);

    expect(provider.sent).toEqual([]);
  });

  it("sends nothing for a reply", async () => {
    const question = comment(base.instructor.id, null);
    const reply = comment(base.user.id, question.id);
    const provider = fakeProvider();

    await notifyNewQuestion(db, reply.id, base.user.id, NOW, provider);

    expect(provider.sent).toEqual([]);
  });

  it("retries a failing provider, then logs and gives up without throwing", async () => {
    const question = comment(base.user.id, null);
    const provider = fakeProvider({ failing: true });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      notifyNewQuestion(db, question.id, base.user.id, NOW, provider)
    ).resolves.toBeUndefined();

    expect(provider.attempts).toBe(3);
    expect(log).toHaveBeenCalledOnce();
  });
});

describe("notifyNewRating", () => {
  function rate(userId: number, rating: number) {
    return db
      .insert(schema.courseRatings)
      .values({ userId, courseId: base.course.id, rating })
      .returning()
      .get();
  }

  function rerate(ratingId: number, rating: number) {
    return db
      .update(schema.courseRatings)
      .set({ rating })
      .where(eq(schema.courseRatings.id, ratingId))
      .returning()
      .get();
  }

  it("tells the course's Instructor who rated it and the stars", async () => {
    const rating = rate(base.user.id, 4);
    const provider = fakeProvider();

    await notifyNewRating(db, rating.id, base.user.id, NOW, provider);

    expect(provider.sent).toEqual([
      {
        kind: "new-rating",
        recipients: [instructor()],
        data: {
          actorName: "Test User",
          courseTitle: "Test Course",
          courseSlug: "test-course",
          rating: 4,
        },
        actor: student(),
      },
    ]);
  });

  it("notifies again with the new stars when a Student re-rates", async () => {
    const rating = rate(base.user.id, 4);
    rerate(rating.id, 2);
    const provider = fakeProvider();

    await notifyNewRating(db, rating.id, base.user.id, NOW, provider);

    expect(provider.sent.map((s) => s.data)).toEqual([
      expect.objectContaining({ rating: 2 }),
    ]);
  });

  it("retries a failing provider, then logs and gives up without throwing", async () => {
    const rating = rate(base.user.id, 5);
    const provider = fakeProvider({ failing: true });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      notifyNewRating(db, rating.id, base.user.id, NOW, provider)
    ).resolves.toBeUndefined();

    expect(provider.attempts).toBe(3);
    expect(log).toHaveBeenCalledOnce();
  });
});
