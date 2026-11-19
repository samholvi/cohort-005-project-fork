import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { notifyCommentReply } from "./comments.server";
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

function comment(userId: number, parentId: number | null) {
  return db
    .insert(schema.comments)
    .values({ userId, lessonId: lesson.id, parentId, body: "Hello" })
    .returning()
    .get();
}

describe("notifyCommentReply", () => {
  it("tells the parent comment's author who replied, on which lesson", async () => {
    const question = comment(base.user.id, null);
    const reply = comment(base.instructor.id, question.id);
    const provider = fakeProvider();

    await notifyCommentReply(db, reply.id, base.instructor.id, NOW, provider);

    expect(provider.sent).toEqual([
      {
        kind: "comment-reply",
        recipients: [
          { id: base.user.id, name: "Test User", email: "test@example.com" },
        ],
        data: {
          actorName: "Test Instructor",
          lessonTitle: "Closures",
          lessonId: lesson.id,
          courseSlug: "test-course",
          commentId: reply.id,
        },
        actor: {
          id: base.instructor.id,
          name: "Test Instructor",
          email: "instructor@example.com",
        },
      },
    ]);
  });

  it("notifies an Instructor when someone replies to their comment", async () => {
    const instructorComment = comment(base.instructor.id, null);
    const reply = comment(base.user.id, instructorComment.id);
    const provider = fakeProvider();

    await notifyCommentReply(db, reply.id, base.user.id, NOW, provider);

    expect(provider.sent.map((s) => s.recipients)).toEqual([
      [
        {
          id: base.instructor.id,
          name: "Test Instructor",
          email: "instructor@example.com",
        },
      ],
    ]);
  });

  it("sends nothing when you reply to your own comment", async () => {
    const question = comment(base.user.id, null);
    const reply = comment(base.user.id, question.id);
    const provider = fakeProvider();

    await notifyCommentReply(db, reply.id, base.user.id, NOW, provider);

    expect(provider.sent).toEqual([]);
  });

  it("sends nothing for a top-level comment", async () => {
    const question = comment(base.user.id, null);
    const provider = fakeProvider();

    await notifyCommentReply(db, question.id, base.user.id, NOW, provider);

    expect(provider.sent).toEqual([]);
  });

  it("retries a failing provider, then logs and gives up without throwing", async () => {
    const question = comment(base.user.id, null);
    const reply = comment(base.instructor.id, question.id);
    const provider = fakeProvider({ failing: true });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      notifyCommentReply(db, reply.id, base.instructor.id, NOW, provider)
    ).resolves.toBeUndefined();

    expect(provider.attempts).toBe(3);
    expect(provider.sent).toEqual([]);
    expect(log).toHaveBeenCalledOnce();
  });

  it("sends nothing when the parent comment was deleted", async () => {
    const question = comment(base.user.id, null);
    db.update(schema.comments)
      .set({ deletedAt: NOW.toISOString() })
      .where(eq(schema.comments.id, question.id))
      .run();
    const reply = comment(base.instructor.id, question.id);
    const provider = fakeProvider();

    await notifyCommentReply(db, reply.id, base.instructor.id, NOW, provider);

    expect(provider.sent).toEqual([]);
  });

  it("delivers when the provider recovers on a retry", async () => {
    const question = comment(base.user.id, null);
    const reply = comment(base.instructor.id, question.id);
    const provider = fakeProvider({ failing: 1 });

    await notifyCommentReply(db, reply.id, base.instructor.id, NOW, provider);

    expect(provider.sent).toHaveLength(1);
  });
});
