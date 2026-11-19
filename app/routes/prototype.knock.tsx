// PROTOTYPE — throwaway spike for "Does Knock hold up against Cadence?" (#18).
// Lives only on branch prototype/knock-spike. Never merge.
import { useEffect, useRef, useState } from "react";
import { data, useFetcher } from "react-router";
import Knock, { type Feed, type FeedStoreState } from "@knocklabs/client";
import type { Route } from "./+types/prototype.knock";
import { getCurrentUserId } from "~/lib/session";
import {
  allUsers,
  clearPreferences,
  getPreferences,
  identify,
  knockConfig,
  markAllReadFromServer,
  recentMessages,
  setCategory,
  tokenFor,
  triggerDiscussionReply,
  triggerNewEnrollment,
} from "~/lib/knock-prototype.server";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await getCurrentUserId(request);
  if (!userId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }
  const user = await identify(userId);
  const others = allUsers().filter((u) => u.id !== userId);
  const [config, token, wrongUserToken, preferences, messages] =
    await Promise.all([
      knockConfig(),
      tokenFor(userId),
      // a validly signed token, but for someone else
      tokenFor(others[0]?.id ?? userId),
      getPreferences(userId).catch((e) => ({ error: String(e) })),
      recentMessages(userId).catch((e) => [{ error: String(e) }]),
    ]);
  return {
    user,
    others,
    ...config,
    token,
    wrongUserToken,
    preferences,
    messages,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const userId = await getCurrentUserId(request);
  if (!userId) throw data("No user", { status: 401 });
  const form = await request.formData();
  const intent = String(form.get("intent"));
  try {
    switch (intent) {
      case "trigger-reply":
        return { intent, result: await triggerDiscussionReply(userId) };
      case "trigger-enrollment":
        return { intent, result: await triggerNewEnrollment(userId) };
      case "category-on":
      case "category-off":
        return {
          intent,
          result: await setCategory(
            userId,
            String(form.get("category")),
            intent === "category-on"
          ),
        };
      case "clear-prefs":
        await clearPreferences(userId);
        return { intent, result: "preference set deleted" };
      case "server-mark-read":
        return {
          intent,
          result: await markAllReadFromServer(Number(form.get("targetUserId"))),
        };
    }
  } catch (e) {
    return { intent, error: String(e) };
  }
  return { intent, error: "unknown intent" };
}

type Probe = { label: string; outcome: string };

export default function KnockPrototype({ loaderData }: Route.ComponentProps) {
  const { user, others, publicKey, feedChannelId, token, wrongUserToken } =
    loaderData;
  const fetcher = useFetcher<typeof action>();
  const feedRef = useRef<Feed | null>(null);
  const [state, setState] = useState<Pick<
    FeedStoreState,
    "items" | "metadata" | "loading"
  > | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [probes, setProbes] = useState<Probe[]>([]);
  const log = (line: string) =>
    setEvents((e) => [`${new Date().toLocaleTimeString()} ${line}`, ...e].slice(0, 20));

  // Question 1 + 3: authenticate with the signed token and run the headless feed.
  useEffect(() => {
    const knock = new Knock(publicKey);
    knock.authenticate(String(user.id), token);
    const feed = knock.feeds.initialize(feedChannelId, { page_size: 20 });
    feedRef.current = feed;
    const unsubscribe = feed.store.subscribe((s) =>
      setState({ items: s.items, metadata: s.metadata, loading: s.loading })
    );
    feed.on("items.received.realtime", ({ items }: { items: unknown[] }) =>
      log(`realtime: ${items.length} new item(s) arrived`)
    );
    feed.listenForUpdates();
    feed.fetch().then(() => log(`fetched feed for user ${user.id}`));
    return () => {
      unsubscribe();
      feed.teardown();
      knock.teardown();
    };
  }, [publicKey, feedChannelId, user.id, token]);

  // Enhanced security check: can a client read this user's feed WITHOUT a
  // valid token for them?
  async function runSecurityProbes() {
    const url = `https://api.knock.app/v1/users/${user.id}/feeds/${feedChannelId}`;
    const attempt = async (label: string, bearer?: string) => {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${publicKey}`,
          ...(bearer ? { "X-Knock-User-Token": bearer } : {}),
        },
      });
      return { label, outcome: `HTTP ${res.status}` };
    };
    const results = await Promise.all([
      attempt("signed token for this user (should be 200)", token),
      attempt("no token at all (should be rejected)"),
      attempt(
        `validly signed token for user ${others[0]?.id} (should be rejected)`,
        wrongUserToken
      ),
      attempt("forged token (should be rejected)", token.slice(0, -8) + "AAAAAAAA"),
    ]);
    setProbes(results);
  }

  const feed = feedRef.current;
  const busy = fetcher.state !== "idle";

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 text-sm">
      <div className="rounded border border-amber-400 bg-amber-50 p-3 text-amber-900">
        <strong>PROTOTYPE</strong> — throwaway spike against the real Knock
        Development environment. Answers "Does Knock hold up against Cadence?".
        Switch users in the DevUI panel: the feed below follows.
      </div>

      <section className="grid grid-cols-2 gap-4">
        <div className="space-y-2 rounded border p-4">
          <h2 className="font-semibold">1. Signed user token</h2>
          <p>
            Viewing as <b>{user.name}</b> ({user.role}) · recipient id{" "}
            <code>{user.id}</code>
          </p>
          <p className="break-all font-mono text-xs text-gray-500">
            {token.slice(0, 60)}…
          </p>
          <button className="rounded bg-gray-900 px-3 py-1 text-white" onClick={runSecurityProbes}>
            Run security probes
          </button>
          <ul className="space-y-1">
            {probes.map((p) => (
              <li key={p.label}>
                <code>{p.outcome}</code> — {p.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2 rounded border p-4">
          <h2 className="font-semibold">2. Trigger a real Notification</h2>
          <fetcher.Form method="post" className="flex flex-wrap gap-2">
            <button name="intent" value="trigger-reply" disabled={busy} className="rounded bg-blue-600 px-3 py-1 text-white">
              Reply to someone's question (as {user.name})
            </button>
            <button name="intent" value="trigger-enrollment" disabled={busy} className="rounded bg-blue-600 px-3 py-1 text-white">
              Enroll in a course (as {user.name}) → its Instructor
            </button>
          </fetcher.Form>
          {fetcher.data && (
            <pre className="max-h-40 overflow-auto rounded bg-gray-100 p-2 text-xs">
              {JSON.stringify(fetcher.data, null, 2)}
            </pre>
          )}
        </div>
      </section>

      <section className="space-y-2 rounded border p-4">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">3. Headless feed</h2>
          <span className="rounded-full bg-red-600 px-2 text-white">
            unread {state?.metadata.unread_count ?? "…"}
          </span>
          <span className="rounded-full bg-gray-500 px-2 text-white">
            unseen {state?.metadata.unseen_count ?? "…"}
          </span>
          <span>total {state?.metadata.total_count ?? "…"}</span>
          <button className="ml-auto rounded border px-2" onClick={() => feed?.fetch()}>Refetch</button>
          <button className="rounded border px-2" onClick={() => feed?.markAllAsSeen()}>Mark all seen</button>
          <button className="rounded border px-2" onClick={() => feed?.markAllAsRead()}>Mark all read</button>
        </div>
        <table className="w-full">
          <thead className="text-left text-gray-500">
            <tr><th>text</th><th>category</th><th>seen</th><th>read</th><th>at</th><th /></tr>
          </thead>
          <tbody>
            {state?.items.map((item) => {
              const block = item.blocks.find((b) => b.name === "body");
              return (
                <tr key={item.id} className={item.read_at ? "" : "bg-blue-50"}>
                  <td>{block && "rendered" in block ? block.rendered.replace(/<[^>]+>/g, "") : "?"}</td>
                  <td>{item.source.categories?.join(", ")}</td>
                  <td>{item.seen_at ? "✓" : ""}</td>
                  <td>{item.read_at ? "✓" : ""}</td>
                  <td>{new Date(item.inserted_at).toLocaleTimeString()}</td>
                  <td className="space-x-1 text-right">
                    <button className="rounded border px-1" onClick={() => feed?.markAsSeen(item)}>seen</button>
                    <button className="rounded border px-1" onClick={() => feed?.markAsRead(item)}>read</button>
                    <button className="rounded border px-1" onClick={() => feed?.markAsUnread(item)}>unread</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <fetcher.Form method="post" className="flex items-center gap-2 pt-2">
          <span>Server marks all unread items Read for</span>
          <select name="targetUserId" className="rounded border px-1">
            {[user, ...others].map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
            ))}
          </select>
          <button name="intent" value="server-mark-read" className="rounded border px-2">Mark read from server</button>
        </fetcher.Form>
        <ul className="text-xs text-gray-500">
          {events.map((e) => <li key={e}>{e}</li>)}
        </ul>
      </section>

      <section className="space-y-2 rounded border p-4">
        <h2 className="font-semibold">4. Preferences ({user.name})</h2>
        <fetcher.Form method="post" className="flex flex-wrap gap-2">
          <input type="hidden" name="category" value="new-enrollment" />
          <button name="intent" value="category-on" className="rounded border px-2">Opt in to new-enrollment</button>
          <button name="intent" value="category-off" className="rounded border px-2">Opt out of new-enrollment</button>
          <button name="intent" value="clear-prefs" className="rounded border px-2">Delete my preference set (back to defaults)</button>
        </fetcher.Form>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="text-gray-500">Preference set (reload to refresh)</h3>
            <pre className="max-h-64 overflow-auto rounded bg-gray-100 p-2 text-xs">
              {JSON.stringify(loaderData.preferences, null, 2)}
            </pre>
          </div>
          <div>
            <h3 className="text-gray-500">Last 10 messages Knock made for me (all statuses)</h3>
            <pre className="max-h-64 overflow-auto rounded bg-gray-100 p-2 text-xs">
              {JSON.stringify(loaderData.messages, null, 2)}
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
}
