import { useState, useEffect, useRef } from "react";
import { Link, useFetcher, useBlocker } from "react-router";
import { toast } from "sonner";
import type { Route } from "./+types/instructor.$courseId.lessons.$lessonId";
import { getCurrentUserId } from "~/lib/session";
import {
  CourseStatus,
  UserRole,
  users,
  courses,
  modules,
  lessons,
  quizzes,
} from "~/db/schema";
import { db } from "~/db";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { MonacoMarkdownEditor } from "~/components/monaco-markdown-editor";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ClipboardList,
  ExternalLink,
  Github,
  Megaphone,
  Save,
} from "lucide-react";
import { data, isRouteErrorResponse } from "react-router";
import { z } from "zod";
import { parseFormData, parseParams } from "~/lib/validation";
import { notifyEnrolledStudents } from "~/lib/notifications/new-lesson.server";
import { newLessonText } from "~/lib/notifications/descriptions/new-lesson";

const instructorLessonParamsSchema = z.object({
  courseId: z.coerce.number().int(),
  lessonId: z.coerce.number().int(),
});

const lessonActionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("update-lesson"),
    content: z.string().optional(),
    videoUrl: z.string().trim().optional(),
    durationMinutes: z.string().optional(),
    githubRepoUrl: z.string().trim().optional(),
  }),
  z.object({ intent: z.literal("notify-students") }),
]);

const NOTIFY_FAILED = "Couldn't notify Students, try again";

function getUserById(id: number) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

function getCourseById(id: number) {
  return db.select().from(courses).where(eq(courses.id, id)).get();
}

function getModuleById(id: number) {
  return db.select().from(modules).where(eq(modules.id, id)).get();
}

function getLessonById(id: number) {
  return db.select().from(lessons).where(eq(lessons.id, id)).get();
}

function getQuizByLessonId(lessonId: number) {
  return db.select().from(quizzes).where(eq(quizzes.lessonId, lessonId)).get();
}

function updateLesson(
  id: number,
  title: string | null,
  content: string | null,
  videoUrl: string | null,
  durationMinutes: number | null,
  githubRepoUrl: string | null = null
) {
  const updates: Record<string, unknown> = {};
  if (title !== null) updates.title = title;
  if (content !== null) updates.content = content;
  if (videoUrl !== null) updates.videoUrl = videoUrl;
  if (durationMinutes !== null) updates.durationMinutes = durationMinutes;
  if (githubRepoUrl !== null) updates.githubRepoUrl = githubRepoUrl;

  if (Object.keys(updates).length === 0) {
    return getLessonById(id);
  }

  return db
    .update(lessons)
    .set(updates)
    .where(eq(lessons.id, id))
    .returning()
    .get();
}

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.lesson?.title ?? "Edit Lesson";
  return [
    { title: `Edit: ${title} — Cadence` },
    { name: "description", content: `Edit lesson: ${title}` },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to manage lessons.", {
      status: 401,
    });
  }

  const user = getUserById(currentUserId);

  if (
    !user ||
    (user.role !== UserRole.Instructor && user.role !== UserRole.Admin)
  ) {
    throw data("Only instructors and admins can access this page.", {
      status: 403,
    });
  }

  const courseId = parseInt(params.courseId, 10);
  if (isNaN(courseId)) {
    throw data("Invalid course ID.", { status: 400 });
  }

  const course = getCourseById(courseId);

  if (!course) {
    throw data("Course not found.", { status: 404 });
  }

  if (course.instructorId !== currentUserId && user.role !== UserRole.Admin) {
    throw data("You can only edit your own courses.", { status: 403 });
  }

  const lessonId = parseInt(params.lessonId, 10);
  if (isNaN(lessonId)) {
    throw data("Invalid lesson ID.", { status: 400 });
  }

  const lesson = getLessonById(lessonId);
  if (!lesson) {
    throw data("Lesson not found.", { status: 404 });
  }

  const mod = getModuleById(lesson.moduleId);
  if (!mod || mod.courseId !== courseId) {
    throw data("Lesson not found in this course.", { status: 404 });
  }

  const quiz = getQuizByLessonId(lessonId);

  return { course, lesson, module: mod, quiz };
}

export async function action({ params, request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("You must be logged in.", { status: 401 });
  }

  const user = getUserById(currentUserId);
  if (
    !user ||
    (user.role !== UserRole.Instructor && user.role !== UserRole.Admin)
  ) {
    throw data("Only instructors and admins can edit lessons.", {
      status: 403,
    });
  }

  const { courseId, lessonId } = parseParams(
    params,
    instructorLessonParamsSchema
  );

  const course = getCourseById(courseId);
  if (!course) {
    throw data("Course not found.", { status: 404 });
  }

  if (course.instructorId !== currentUserId && user.role !== UserRole.Admin) {
    throw data("You can only edit your own courses.", { status: 403 });
  }

  const lesson = getLessonById(lessonId);
  if (!lesson) {
    throw data("Lesson not found.", { status: 404 });
  }

  const mod = getModuleById(lesson.moduleId);
  if (!mod || mod.courseId !== courseId) {
    throw data("Lesson not found in this course.", { status: 404 });
  }

  const formData = await request.formData();
  const parsed = parseFormData(formData, lessonActionSchema);

  if (!parsed.success) {
    return data(
      { error: Object.values(parsed.errors)[0] ?? "Invalid input." },
      { status: 400 }
    );
  }

  if (parsed.data.intent === "update-lesson") {
    const {
      content,
      videoUrl,
      durationMinutes: durationStr,
      githubRepoUrl,
    } = parsed.data;
    const durationMinutes = durationStr ? parseInt(durationStr, 10) : null;

    if (
      durationMinutes !== null &&
      (isNaN(durationMinutes) || durationMinutes < 0)
    ) {
      return data(
        { error: "Duration must be a positive number." },
        { status: 400 }
      );
    }

    updateLesson(
      lessonId,
      null,
      content ?? null,
      videoUrl || null,
      durationMinutes,
      githubRepoUrl || null
    );
    return { success: true };
  }

  if (parsed.data.intent === "notify-students") {
    const result = await notifyEnrolledStudents(
      db,
      lessonId,
      currentUserId,
      new Date()
    );
    if (result.ok) return { notified: true };
    if (result.reason === "course-not-published") {
      throw data("Publish the course to notify Students.", { status: 409 });
    }
    if (result.reason === "already-notified") {
      throw data("Students were already notified about this lesson.", {
        status: 409,
      });
    }
    return data({ notifyError: NOTIFY_FAILED }, { status: 502 });
  }

  throw data("Invalid action.", { status: 400 });
}

export default function InstructorLessonEditor({
  loaderData,
}: Route.ComponentProps) {
  const { course, lesson, module: mod, quiz } = loaderData;
  const fetcher = useFetcher();

  const [content, setContent] = useState(lesson.content ?? "");
  const [videoUrl, setVideoUrl] = useState(lesson.videoUrl ?? "");
  const [durationMinutes, setDurationMinutes] = useState(
    lesson.durationMinutes?.toString() ?? ""
  );
  const [githubRepoUrl, setGithubRepoUrl] = useState(
    lesson.githubRepoUrl ?? ""
  );

  const hasChanges =
    content !== (lesson.content ?? "") ||
    videoUrl !== (lesson.videoUrl ?? "") ||
    durationMinutes !== (lesson.durationMinutes?.toString() ?? "") ||
    githubRepoUrl !== (lesson.githubRepoUrl ?? "");

  const blocker = useBlocker(hasChanges);

  useEffect(() => {
    if (!hasChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasChanges]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      toast.success("Lesson saved.");
    }
    if (fetcher.state === "idle" && fetcher.data?.error) {
      toast.error(fetcher.data.error);
    }
  }, [fetcher.state, fetcher.data]);

  function handleSave() {
    fetcher.submit(
      {
        intent: "update-lesson",
        content,
        videoUrl,
        durationMinutes,
        githubRepoUrl,
      },
      { method: "post" }
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      {/* Unsaved changes blocker dialog */}
      {blocker.state === "blocked" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="mx-4 w-full max-w-md">
            <CardHeader>
              <h2 className="text-lg font-semibold">Unsaved Changes</h2>
              <p className="text-sm text-muted-foreground">
                You have unsaved changes that will be lost if you leave this
                page.
              </p>
            </CardHeader>
            <CardContent className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => blocker.reset()}>
                Stay on Page
              </Button>
              <Button variant="destructive" onClick={() => blocker.proceed()}>
                Leave Page
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/instructor" className="hover:text-foreground">
          My Courses
        </Link>
        <span className="mx-2">/</span>
        <Link to={`/instructor/${course.id}`} className="hover:text-foreground">
          {course.title}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{lesson.title}</span>
      </nav>

      <Link
        to={`/instructor/${course.id}`}
        className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 size-4" />
        Back to Course Editor
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">{lesson.title}</h1>
          <Link to={`/courses/${course.slug}/lessons/${lesson.id}`}>
            <Button variant="outline" size="sm">
              <ExternalLink className="mr-1.5 size-4" />
              View Lesson
            </Button>
          </Link>
          <NotifyStudentsButton
            courseTitle={course.title}
            lessonTitle={lesson.title}
            isPublished={course.status === CourseStatus.Published}
            studentsNotifiedAt={lesson.studentsNotifiedAt}
          />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Module: {mod.title}
        </p>
      </div>

      <div className="space-y-6">
        {/* Content */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Lesson Content</h2>
            <p className="text-sm text-muted-foreground">
              Write lesson content in Markdown. Press Ctrl+S to format and save.
            </p>
          </CardHeader>
          <CardContent>
            <MonacoMarkdownEditor
              value={content}
              onChange={setContent}
              onSave={handleSave}
            />
          </CardContent>
        </Card>

        {/* Video URL */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Video</h2>
            <p className="text-sm text-muted-foreground">
              Paste a YouTube video URL to embed in this lesson.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="videoUrl">YouTube URL</Label>
              <Input
                id="videoUrl"
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Duration */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Duration</h2>
            <p className="text-sm text-muted-foreground">
              Set the estimated time to complete this lesson.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (minutes)</Label>
              <Input
                id="duration"
                type="number"
                min="0"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                placeholder="e.g. 15"
                className="max-w-32"
              />
            </div>
          </CardContent>
        </Card>

        {/* GitHub Repo */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">GitHub Repository</h2>
            <p className="text-sm text-muted-foreground">
              Link to a GitHub repository for this lesson's code.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="githubRepoUrl">Repository URL</Label>
              <Input
                id="githubRepoUrl"
                type="url"
                value={githubRepoUrl}
                onChange={(e) => setGithubRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
              />
            </div>
          </CardContent>
        </Card>

        {/* Quiz */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Quiz</h2>
            <p className="text-sm text-muted-foreground">
              {quiz
                ? `This lesson has a quiz: "${quiz.title}"`
                : "No quiz attached to this lesson yet."}
            </p>
          </CardHeader>
          <CardContent>
            <Link to={`/instructor/${course.id}/lessons/${lesson.id}/quiz`}>
              <Button variant="outline">
                <ClipboardList className="mr-1.5 size-4" />
                {quiz ? "Edit Quiz" : "Create Quiz"}
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex items-center gap-4">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || fetcher.state !== "idle"}
          >
            <Save className="mr-1.5 size-4" />
            {fetcher.state !== "idle" ? "Saving..." : "Save Changes"}
          </Button>
          {hasChanges && (
            <span className="text-sm text-muted-foreground">
              You have unsaved changes.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function NotifyStudentsButton({
  courseTitle,
  lessonTitle,
  isPublished,
  studentsNotifiedAt,
}: {
  courseTitle: string;
  lessonTitle: string;
  isPublished: boolean;
  studentsNotifiedAt: string | null;
}) {
  const fetcher = useFetcher<typeof action>();
  const [confirming, setConfirming] = useState(false);
  const wasSubmitting = useRef(false);
  const sending = fetcher.state !== "idle";
  const notifyError =
    !sending && fetcher.data && "notifyError" in fetcher.data
      ? fetcher.data.notifyError
      : null;

  useEffect(() => {
    if (sending) {
      wasSubmitting.current = true;
      return;
    }
    if (!wasSubmitting.current) return;
    wasSubmitting.current = false;
    setConfirming(false);
    if (fetcher.data && "notified" in fetcher.data) {
      toast.success("Enrolled Students notified.");
    }
  }, [sending, fetcher.data]);

  if (studentsNotifiedAt) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm text-muted-foreground">
        <Check className="size-4" />
        Students notified on{" "}
        {new Date(studentsNotifiedAt).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </span>
    );
  }

  if (!isPublished) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        title="Publish the course to notify Students"
      >
        <Megaphone className="mr-1.5 size-4" />
        Notify enrolled Students
      </Button>
    );
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setConfirming((open) => !open)}
        disabled={sending}
      >
        <Megaphone className="mr-1.5 size-4" />
        Notify enrolled Students
      </Button>
      {notifyError && !confirming && (
        <p
          role="alert"
          className="absolute top-full left-0 mt-1 w-max text-sm text-destructive"
        >
          {notifyError}
        </p>
      )}
      {confirming && (
        <div
          role="dialog"
          aria-label="Notify enrolled Students?"
          className="absolute top-full left-0 z-50 mt-2 w-80 rounded-lg border bg-popover p-4 text-sm shadow-xl"
        >
          <p className="font-semibold">Notify enrolled Students?</p>
          <p className="mt-2 text-muted-foreground">
            Every Student with an Enrollment on{" "}
            <strong className="text-foreground">{courseTitle}</strong> gets: "
            {newLessonText(courseTitle, lessonTitle)}". You can only do this
            once for this lesson.
          </p>
          {notifyError && (
            <p role="alert" className="mt-2 text-destructive">
              {notifyError}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={sending}
              onClick={() =>
                fetcher.submit(
                  { intent: "notify-students" },
                  { method: "post" }
                )
              }
            >
              {sending ? "Notifying..." : "Notify"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading the lesson editor.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = "Lesson not found";
      message =
        "The lesson you're looking for doesn't exist or may have been removed.";
    } else if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Access denied";
      message =
        typeof error.data === "string"
          ? error.data
          : "You don't have permission to edit this lesson.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/instructor">
            <Button variant="outline">My Courses</Button>
          </Link>
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
