/**
 * PROTOTYPE — throwaway. Ticket: "What should notifications look like and do in the app?"
 *
 * Three variants of in-app Notifications, mounted in the real app layout
 * (`layout.app.tsx`), switchable via `?variant=A|B|C` and the floating bar.
 * All state is in memory (React context in the layout, so it survives
 * navigation and resets on reload). No provider, no DB.
 *
 *   A  Bell + dropdown         — read = you clicked it (or "Mark all as read")
 *   B  Inbox panel             — read = clicked, or toggled read/unread by hand
 *   C  Toasts + seen-on-open   — opening the bell clears the count (seen);
 *                                still bold until clicked (read)
 */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import {
  Bell,
  BellRing,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Megaphone,
  X,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";

// ─── Mock content (kinds, wording, link targets from the "Which notifications…" ticket) ───

type Audience = "student" | "instructor" | "admin" | "teamAdmin";

interface ProtoNotification {
  id: string;
  kind: string;
  text: string; // **bold** segments
  href: string;
  minutesAgo: number;
  read: boolean;
  seen: boolean;
  note?: string; // e.g. "Decided by another Platform Admin"
}

type Seed = Omit<ProtoNotification, "read" | "seen"> & { read?: boolean };

const SEEDS: Record<Audience, Seed[]> = {
  student: [
    {
      id: "s1",
      kind: "Reply to your comment",
      text: "**Sarah Chen** replied to your comment on **Union and Intersection Types**",
      href: "/courses/introduction-to-typescript/lessons/7#comments",
      minutesAgo: 12,
    },
    {
      id: "s2",
      kind: "New lesson",
      text: "New lesson in **Building REST APIs with Node.js**: **HTTP Methods and Status Codes**",
      href: "/courses/building-rest-apis-with-nodejs/lessons/22",
      minutesAgo: 95,
    },
    {
      id: "s3",
      kind: "Inactive on a course",
      text: "You're **40%** through **Design Systems with Tailwind**. Pick up at **Spacing and Type Scales**.",
      href: "/courses/design-systems-with-tailwind/lessons/42",
      minutesAgo: 60 * 26,
    },
    {
      id: "s4",
      kind: "Refund Request declined",
      text: 'Your Refund Request for **Practical Data Visualisation** was declined: "More than half the course was watched."',
      href: "/courses/practical-data-visualisation",
      minutesAgo: 60 * 24 * 3,
      read: true,
    },
    {
      id: "s5",
      kind: "Reply to your comment",
      text: "**James Park** replied to your comment on **Primitive Types**",
      href: "/courses/introduction-to-typescript/lessons/4#comments",
      minutesAgo: 60 * 24 * 6,
      read: true,
    },
  ],
  instructor: [
    {
      id: "i1",
      kind: "New question",
      text: "**Emma Wilson** asked a question on **Type Aliases and Interfaces**",
      href: "/instructor/questions",
      minutesAgo: 4,
    },
    {
      id: "i2",
      kind: "New sale",
      text: "**Team Northwind** bought **10 Seats** on **Introduction to TypeScript**",
      href: "/instructor/analytics",
      minutesAgo: 40,
    },
    {
      id: "i3",
      kind: "Seat claimed",
      text: "**Liam Thompson** joined **Introduction to TypeScript** through **Team Northwind**",
      href: "/instructor/1/students",
      minutesAgo: 38,
    },
    {
      id: "i4",
      kind: "New rating",
      text: "**Olivia Martinez** rated **Design Systems with Tailwind** ★4",
      href: "/courses/design-systems-with-tailwind",
      minutesAgo: 60 * 5,
    },
    {
      id: "i5",
      kind: "Course status changed",
      text: "A Platform Admin **archived** **Design Systems with Tailwind**",
      href: "/instructor/3",
      minutesAgo: 60 * 30,
    },
    {
      id: "i6",
      kind: "Refund approved on your course",
      text: "A refund of **Introduction to TypeScript** for **Sophia Davis** was approved",
      href: "/instructor/analytics",
      minutesAgo: 60 * 24 * 2,
      read: true,
    },
    {
      id: "i7",
      kind: "New sale",
      text: "**James Park** bought **Introduction to TypeScript**",
      href: "/instructor/analytics",
      minutesAgo: 60 * 24 * 4,
      read: true,
    },
  ],
  admin: [
    {
      id: "a1",
      kind: "Refund Request to decide",
      text: "**Sophia Davis** requested a refund for **Building REST APIs with Node.js**",
      href: "/admin/refunds",
      minutesAgo: 18,
    },
    {
      id: "a2",
      kind: "Refund Request to decide",
      text: "**Team Northwind** requested a refund for **Introduction to TypeScript**",
      href: "/admin/refunds",
      minutesAgo: 60 * 3,
    },
    {
      id: "a3",
      kind: "Course published",
      text: "**Marcus Johnson** published **Practical Data Visualisation**",
      href: "/courses/practical-data-visualisation",
      minutesAgo: 60 * 22,
    },
    {
      id: "a4",
      kind: "Refund Request to decide",
      text: "**Noah Blackwood** requested a refund for **Design Systems with Tailwind**",
      href: "/admin/refunds",
      minutesAgo: 60 * 24 * 2,
      read: true,
      note: "Approved by Dana (another Platform Admin)",
    },
  ],
  teamAdmin: [
    {
      id: "t1",
      kind: "Seat claimed",
      text: "**Sam Okafor** claimed a Seat on **Introduction to TypeScript**: **7 of 10** left",
      href: "/team",
      minutesAgo: 25,
    },
    {
      id: "t2",
      kind: "Refund Request approved",
      text: "Your Refund Request for **Building REST APIs with Node.js** was approved. A full refund of **€490** is on its way.",
      href: "/team",
      minutesAgo: 60 * 8,
    },
    {
      id: "t3",
      kind: "Seat claimed",
      text: "**Ava Kim** claimed **the last Seat** on **Practical Data Visualisation**",
      href: "/team",
      minutesAgo: 60 * 24 * 2,
      read: true,
    },
    {
      id: "s1",
      kind: "Reply to your comment",
      text: "**Sarah Chen** replied to your comment on **Union and Intersection Types**",
      href: "/courses/introduction-to-typescript/lessons/7#comments",
      minutesAgo: 60 * 24 * 3,
      read: true,
    },
  ],
};

const ARRIVALS: Record<Audience, Seed[]> = {
  student: [
    {
      id: "s-new1",
      kind: "New lesson",
      text: "New lesson in **Introduction to TypeScript**: **Function Types**",
      href: "/courses/introduction-to-typescript/lessons/8",
      minutesAgo: 0,
    },
    {
      id: "s-new2",
      kind: "Refund Request approved",
      text: "Your Refund Request for **Practical Data Visualisation** was approved. A full refund of **€49** is on its way.",
      href: "/courses/practical-data-visualisation",
      minutesAgo: 0,
    },
  ],
  instructor: [
    {
      id: "i-new1",
      kind: "New question",
      text: "**Ava Nakamura** asked a question on **Design Tokens**",
      href: "/instructor/questions",
      minutesAgo: 0,
    },
    {
      id: "i-new2",
      kind: "Reply to your comment",
      text: "**Emma Wilson** replied to your comment on **What is TypeScript?**",
      href: "/courses/introduction-to-typescript/lessons/1#comments",
      minutesAgo: 0,
    },
  ],
  admin: [
    {
      id: "a-new1",
      kind: "Refund Request to decide",
      text: "**Liam Thompson** requested a refund for **Practical Data Visualisation**",
      href: "/admin/refunds",
      minutesAgo: 0,
    },
  ],
  teamAdmin: [
    {
      id: "t-new1",
      kind: "Seat claimed",
      text: "**Priya Shah** claimed a Seat on **Introduction to TypeScript**: **6 of 10** left",
      href: "/team",
      minutesAgo: 0,
    },
  ],
};

function hydrate(seeds: Seed[]): ProtoNotification[] {
  return seeds.map((s) => ({
    ...s,
    read: s.read ?? false,
    seen: s.read ?? false,
  }));
}

function ago(m: number) {
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 60 / 24)}d ago`;
}

function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") ? (
          <strong key={i} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

// ─── Store ───

interface Store {
  audience: Audience;
  items: ProtoNotification[];
  open: (n: ProtoNotification) => void;
  setRead: (id: string, read: boolean) => void;
  markAllRead: () => void;
  markAllSeen: () => void;
  arrive: () => void;
  otherAdminDecides: () => void;
  notifiedLessons: Record<number, string>;
  notifyLesson: (lessonId: number) => void;
}

const Ctx = createContext<Store | null>(null);

export function useNotificationsPrototype() {
  return useContext(Ctx);
}

export function NotificationsPrototypeProvider({
  role,
  isTeamAdmin,
  children,
}: {
  role: string | null;
  isTeamAdmin: boolean;
  children: ReactNode;
}) {
  const audience: Audience =
    role === "admin"
      ? "admin"
      : role === "instructor"
        ? "instructor"
        : isTeamAdmin
          ? "teamAdmin"
          : "student";
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const variant = params.get("variant") ?? "A";
  const [items, setItems] = useState(() => hydrate(SEEDS[audience]));
  const [arrivalIdx, setArrivalIdx] = useState(0);
  const [notifiedLessons, setNotified] = useState<Record<number, string>>({});

  useEffect(() => {
    setItems(hydrate(SEEDS[audience]));
    setArrivalIdx(0);
  }, [audience]);

  const store: Store = {
    audience,
    items,
    open: (n) => {
      setItems((xs) =>
        xs.map((x) => (x.id === n.id ? { ...x, read: true, seen: true } : x))
      );
      const [path, hash] = n.href.split("#");
      navigate(`${path}?variant=${variant}${hash ? `#${hash}` : ""}`);
    },
    setRead: (id, read) =>
      setItems((xs) =>
        xs.map((x) => (x.id === id ? { ...x, read, seen: true } : x))
      ),
    markAllRead: () =>
      setItems((xs) => xs.map((x) => ({ ...x, read: true, seen: true }))),
    markAllSeen: () => setItems((xs) => xs.map((x) => ({ ...x, seen: true }))),
    arrive: () => {
      const pool = ARRIVALS[audience];
      const seed = pool[arrivalIdx % pool.length];
      const n: ProtoNotification = {
        ...seed,
        id: `${seed.id}-${arrivalIdx}`,
        read: false,
        seen: false,
      };
      setArrivalIdx((i) => i + 1);
      setItems((xs) => [n, ...xs]);
      if (variant === "C") {
        toast(<Rich text={n.text} />, {
          icon: <BellRing className="size-4" />,
          action: { label: "Open", onClick: () => store.open(n) },
        });
      }
    },
    otherAdminDecides: () =>
      setItems((xs) => {
        const target = xs.find(
          (x) => x.kind === "Refund Request to decide" && !x.note
        );
        if (!target) return xs;
        return xs.map((x) =>
          x.id === target.id
            ? {
                ...x,
                read: true,
                seen: true,
                note: "Declined by Dana (another Platform Admin) just now",
              }
            : x
        );
      }),
    notifiedLessons,
    notifyLesson: (lessonId) =>
      setNotified((m) => ({
        ...m,
        [lessonId]: new Date().toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
      })),
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

// ─── Shared row ───

function Row({
  n,
  boldWhen,
  showToggle,
}: {
  n: ProtoNotification;
  boldWhen: "unread";
  showToggle?: boolean;
}) {
  const s = useNotificationsPrototype()!;
  const unread = boldWhen === "unread" && !n.read;
  return (
    <div
      className={cn(
        "group flex items-start gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent",
        unread ? "bg-primary/5" : "text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          unread ? "bg-primary" : "bg-transparent"
        )}
      />
      <button onClick={() => s.open(n)} className="flex-1 text-left">
        <div className={cn(unread && "text-foreground")}>
          <Rich text={n.text} />
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {n.kind} · {ago(n.minutesAgo)}
        </div>
        {n.note && (
          <div className="mt-1 inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs">
            <Check className="size-3" /> {n.note}
          </div>
        )}
      </button>
      {showToggle && (
        <button
          onClick={() => s.setRead(n.id, !n.read)}
          title={n.read ? "Mark as unread" : "Mark as read"}
          className="invisible shrink-0 rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground group-hover:visible"
        >
          {n.read ? <Bell className="size-4" /> : <Check className="size-4" />}
        </button>
      )}
    </div>
  );
}

function Badge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
      {count > 9 ? "9+" : count}
    </span>
  );
}

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, close]);
  return ref;
}

// ─── Variant A: Bell + dropdown, read = clicked ───

export function VariantABell() {
  const s = useNotificationsPrototype()!;
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  const unread = s.items.filter((n) => !n.read).length;
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent"
        title="Notifications"
      >
        <Bell className="size-5" />
        <Badge count={unread} />
      </button>
      {open && (
        <div className="absolute top-0 left-full z-50 ml-3 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="font-semibold">Notifications</span>
            <button
              onClick={s.markAllRead}
              disabled={unread === 0}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <CheckCheck className="size-3.5" /> Mark all as read
            </button>
          </div>
          <div className="max-h-[28rem] divide-y overflow-y-auto">
            {s.items.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Nothing yet.
              </p>
            )}
            {s.items.map((n) => (
              <div key={n.id} onClick={() => setOpen(false)}>
                <Row n={n} boldWhen="unread" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Variant B: Inbox panel (nav item + slide-over), Unread/All tabs, manual toggle ───

export function VariantBNavItem() {
  const s = useNotificationsPrototype()!;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const unread = s.items.filter((n) => !n.read).length;
  const shown = tab === "unread" ? s.items.filter((n) => !n.read) : s.items;
  const today = shown.filter((n) => n.minutesAgo < 60 * 24);
  const earlier = shown.filter((n) => n.minutesAgo >= 60 * 24);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Inbox className="size-4" />
        Notifications
        {unread > 0 && (
          <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-black/20"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex h-full w-[28rem] flex-col border-l bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-lg font-semibold">Notifications</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 hover:bg-accent"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="flex items-center gap-1 border-b px-5 py-2">
              {(["unread", "all"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm capitalize",
                    tab === t
                      ? "bg-accent font-medium"
                      : "text-muted-foreground"
                  )}
                >
                  {t === "unread" ? `Unread (${unread})` : "All"}
                </button>
              ))}
              <button
                onClick={s.markAllRead}
                disabled={unread === 0}
                className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <CheckCheck className="size-3.5" /> Mark all as read
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {shown.length === 0 && (
                <p className="p-10 text-center text-sm text-muted-foreground">
                  You're all caught up.
                </p>
              )}
              {[
                ["Today", today],
                ["Earlier", earlier],
              ].map(([label, list]) =>
                (list as ProtoNotification[]).length ? (
                  <div key={label as string}>
                    <div className="bg-muted/50 px-5 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {label as string}
                    </div>
                    <div className="divide-y">
                      {(list as ProtoNotification[]).map((n) => (
                        <div key={n.id} onClick={() => setOpen(false)}>
                          <Row n={n} boldWhen="unread" showToggle />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Variant C: arrivals toast; bell count = unseen; opening marks seen; bold until clicked ───

export function VariantCBell() {
  const s = useNotificationsPrototype()!;
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  const unseen = s.items.filter((n) => !n.seen).length;
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o);
          s.markAllSeen();
        }}
        className="relative rounded-md p-1 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        title="Notifications"
      >
        <Bell className="size-4" />
        <Badge count={unseen} />
      </button>
      {open && (
        <div className="absolute bottom-0 left-full z-50 ml-6 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
          <div className="border-b px-4 py-2.5 text-sm font-semibold">
            Notifications
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              count cleared on open; still bold until you click
            </span>
          </div>
          <div className="max-h-[28rem] divide-y overflow-y-auto">
            {s.items.map((n) => (
              <div key={n.id} onClick={() => setOpen(false)}>
                <Row n={n} boldWhen="unread" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Instructor: per-lesson "Notify enrolled Students" (same in every variant) ───

export function NotifyStudentsPrototypeButton({
  lessonId,
  lessonTitle,
  courseTitle,
  coursePublished,
}: {
  lessonId: number;
  lessonTitle: string;
  courseTitle: string;
  coursePublished: boolean;
}) {
  const s = useNotificationsPrototype();
  const [confirming, setConfirming] = useState(false);
  if (!s) return null;
  const notifiedOn = s.notifiedLessons[lessonId];
  if (notifiedOn) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm text-muted-foreground">
        <Check className="size-4" /> Students notified on {notifiedOn}
      </span>
    );
  }
  if (!coursePublished) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        title="Publish the course to notify Students"
      >
        <Megaphone className="mr-1.5 size-4" /> Notify enrolled Students
      </Button>
    );
  }
  return (
    <span className="relative inline-block">
      <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
        <Megaphone className="mr-1.5 size-4" /> Notify enrolled Students
      </Button>
      {confirming && (
        <div className="absolute top-full left-0 z-50 mt-2 w-80 rounded-lg border bg-popover p-4 text-sm shadow-xl">
          <p className="font-medium">Notify enrolled Students?</p>
          <p className="mt-1 text-muted-foreground">
            Every Student with an Enrollment on <strong>{courseTitle}</strong>{" "}
            gets: "New lesson in {courseTitle}: {lessonTitle}". You can only do
            this once for this lesson.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                s.notifyLesson(lessonId);
                setConfirming(false);
                toast.success("Enrolled Students notified");
              }}
            >
              Notify
            </Button>
          </div>
        </div>
      )}
    </span>
  );
}

// ─── Floating switcher ───

const VARIANTS = [
  { key: "A", name: "Bell + dropdown · read = clicked" },
  { key: "B", name: "Inbox panel · read = clicked or toggled" },
  { key: "C", name: "Toasts + bell · open = seen, click = read" },
];

export function PrototypeSwitcher() {
  const s = useNotificationsPrototype();
  const [params, setParams] = useSearchParams();
  const current = params.get("variant") ?? "A";
  const idx = Math.max(
    0,
    VARIANTS.findIndex((v) => v.key === current)
  );

  function go(delta: number) {
    const next = VARIANTS[(idx + delta + VARIANTS.length) % VARIANTS.length];
    const p = new URLSearchParams(params);
    p.set("variant", next.key);
    setParams(p, { replace: true });
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable], .monaco-editor"))
        return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  if (!import.meta.env.DEV || !s) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-zinc-900 px-3 py-1.5 text-sm text-white shadow-2xl ring-2 ring-fuchsia-500">
      <span className="text-xs font-bold text-fuchsia-300">PROTOTYPE</span>
      <button
        onClick={() => go(-1)}
        className="rounded-full p-1 hover:bg-white/10"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-72 text-center">
        <strong>{VARIANTS[idx].key}</strong> ({VARIANTS[idx].name})
      </span>
      <button
        onClick={() => go(1)}
        className="rounded-full p-1 hover:bg-white/10"
      >
        <ChevronRight className="size-4" />
      </button>
      <span className="mx-1 h-4 w-px bg-white/30" />
      <button
        onClick={s.arrive}
        className="rounded-full px-2 py-0.5 hover:bg-white/10"
      >
        + New arrives
      </button>
      {s.audience === "admin" && (
        <button
          onClick={s.otherAdminDecides}
          className="rounded-full px-2 py-0.5 hover:bg-white/10"
        >
          Another admin decides
        </button>
      )}
    </div>
  );
}
