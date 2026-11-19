import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import { fakeProvider } from "./fake-provider.server";
import { feedSessionFor } from "./feed-session.server";
import type { NotificationPerson } from "./provider.server";

let db: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function providerWithFeed() {
  const opened: NotificationPerson[] = [];
  const provider = {
    ...fakeProvider(),
    async createFeedSession(user: NotificationPerson) {
      opened.push(user);
      return { provider: "test", settings: { userId: String(user.id) } };
    },
  };
  return { provider, opened };
}

describe("feedSessionFor", () => {
  it("opens the signed-in user's feed", async () => {
    const { provider, opened } = providerWithFeed();

    const session = await feedSessionFor(db, base.user.id, provider);

    expect(session).toEqual({
      provider: "test",
      settings: { userId: String(base.user.id) },
    });
    expect(opened).toEqual([
      { id: base.user.id, name: "Test User", email: base.user.email },
    ]);
  });

  it("has no feed when no one is signed in", async () => {
    const { provider, opened } = providerWithFeed();

    expect(await feedSessionFor(db, null, provider)).toBeNull();
    expect(opened).toEqual([]);
  });

  it("has no feed for a user that doesn't exist", async () => {
    const { provider } = providerWithFeed();

    expect(await feedSessionFor(db, 9999, provider)).toBeNull();
  });

  it("has no feed when the provider can't serve one", async () => {
    expect(await feedSessionFor(db, base.user.id, fakeProvider())).toBeNull();
  });

  it("logs and gives no feed when opening it fails, so the page still loads", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const provider = {
      ...fakeProvider(),
      async createFeedSession(): Promise<never> {
        throw new Error("bad signing key");
      },
    };

    expect(await feedSessionFor(db, base.user.id, provider)).toBeNull();
    expect(logged).toHaveBeenCalled();
  });
});
