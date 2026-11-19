// PROTOTYPE — throwaway spike for "Does Knock hold up against Cadence?" (#18).
// Lives only on branch prototype/knock-spike. Never merge.
import { Knock, signUserToken } from "@knocklabs/node";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { db } from "~/db";
import { comments, courses, lessons, users } from "~/db/schema";

// Vite doesn't put .env into process.env for server code; load it once.
let envLoaded = false;
function env(name: string): string {
  if (!envLoaded) {
    try {
      process.loadEnvFile(".env");
    } catch {
      // already in the environment
    }
    envLoaded = true;
  }
  const value = process.env[name];
  if (!value) throw new Error(`PROTOTYPE: missing ${name} in .env`);
  return value;
}

let client: Knock | undefined;
function knock() {
  client ??= new Knock({ apiKey: env("KNOCK_SECRET_API_KEY") });
  return client;
}

// Recipient id = Cadence user id as a string. No mapping table.
export const recipientId = (userId: number) => String(userId);

export async function knockConfig() {
  return {
    publicKey: env("KNOCK_PUBLIC_API_KEY"),
    feedChannelId: env("KNOCK_FEED_CHANNEL_ID"),
  };
}

// Question 1: sign an RS256 user token for the DevUI user.
// KNOCK_SIGNING_KEY is the base64 PEM straight from the dashboard.
export async function tokenFor(userId: number) {
  return signUserToken(recipientId(userId), {
    signingKey: env("KNOCK_SIGNING_KEY"),
    expiresInSeconds: 60 * 60,
  });
}

export async function identify(userId: number) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new Error(`no user ${userId}`);
  await knock().users.update(recipientId(user.id), {
    name: user.name,
    email: user.email,
  });
  return user;
}

export function allUsers() {
  return db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .all();
}

// Question 2: trigger one real Notification. The current user replies to
// someone else's question; the question's author is the recipient.
export async function triggerDiscussionReply(actorId: number) {
  const actor = await identify(actorId);
  const question = db
    .select({
      id: comments.id,
      authorId: comments.userId,
      body: comments.body,
      lessonTitle: lessons.title,
    })
    .from(comments)
    .innerJoin(lessons, eq(lessons.id, comments.lessonId))
    .where(
      and(
        isNull(comments.parentId),
        isNull(comments.deletedAt),
        ne(comments.userId, actorId)
      )
    )
    .orderBy(desc(comments.createdAt))
    .get();
  if (!question) throw new Error("no question by someone else to reply to");
  const author = await identify(question.authorId);

  const run = await knock().workflows.trigger("discussion-reply", {
    actor: recipientId(actor.id),
    recipients: [recipientId(author.id)],
    data: {
      actor_name: actor.name,
      question_title: `${question.lessonTitle}: ${question.body.slice(0, 40)}`,
    },
  });
  return {
    summary: `${actor.name} replied to ${author.name}'s question (comment ${question.id})`,
    recipient: author,
    workflowRunId: run.workflow_run_id,
  };
}

// Question 4: new Enrollment → the course's Instructor, meant to be opt-in.
export async function triggerNewEnrollment(studentId: number) {
  const student = await identify(studentId);
  const course = db
    .select({ id: courses.id, title: courses.title, instructorId: courses.instructorId })
    .from(courses)
    .where(ne(courses.instructorId, studentId))
    .get();
  if (!course) throw new Error("no course");
  const instructor = await identify(course.instructorId);
  const run = await knock().workflows.trigger("new-enrollment", {
    actor: recipientId(student.id),
    recipients: [recipientId(instructor.id)],
    data: { student_name: student.name, course_title: course.title },
  });
  return {
    summary: `${student.name} enrolled in ${course.title} → ${instructor.name}`,
    recipient: instructor,
    workflowRunId: run.workflow_run_id,
  };
}

export async function getPreferences(userId: number) {
  return knock().users.getPreferences(recipientId(userId), "default");
}

export async function setCategory(userId: number, category: string, on: boolean) {
  return knock().users.setPreferences(recipientId(userId), "default", {
    __persistence_strategy__: "merge",
    categories: { [category]: on },
  });
}

export async function clearPreferences(userId: number) {
  return knock().users.unsetPreferences(recipientId(userId), "default");
}

// Requirement from the UI ticket: mark ANOTHER recipient's Notification read
// from the server (Refund Request to decide → Read for every Platform Admin).
export async function markAllReadFromServer(userId: number) {
  const page = await knock().users.listMessages(recipientId(userId), {
    channel_id: env("KNOCK_FEED_CHANNEL_ID"),
    engagement_status: ["unread"],
  });
  const ids = page.items.map((m) => m.id);
  if (ids.length === 0) return { marked: 0 };
  await knock().messages.batch.markAsRead({ message_ids: ids });
  return { marked: ids.length };
}

// Recent message log for a user, with status, so we can see what Knock did
// (e.g. a message suppressed by preferences never shows up here).
export async function recentMessages(userId: number) {
  const page = await knock().users.listMessages(recipientId(userId), {
    page_size: 10,
  });
  return page.items.map((m) => ({
    id: m.id,
    workflow: m.source?.key,
    status: m.status,
    read_at: m.read_at,
    seen_at: m.seen_at,
    inserted_at: m.inserted_at,
  }));
}
