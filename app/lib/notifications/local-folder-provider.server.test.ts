import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { localFolderProvider } from "./local-folder-provider.server";

const jo = { id: 2, name: "Jo Park", email: "jo@example.com" };
const sam = { id: 3, name: "Sam Lee", email: "sam@example.com" };

function readAll(directory: string) {
  return readdirSync(directory).map((file) =>
    JSON.parse(readFileSync(join(directory, file), "utf8"))
  );
}

describe("localFolderProvider", () => {
  it("writes each send to the folder as JSON", async () => {
    const directory = mkdtempSync(join(tmpdir(), "notifications-"));
    const provider = localFolderProvider(directory);

    await provider.send("comment-reply", [sam], { lessonId: 12 }, jo);

    expect(readAll(directory)).toEqual([
      {
        action: "send",
        kind: "comment-reply",
        recipients: [sam],
        data: { lessonId: 12 },
        actor: jo,
      },
    ]);
  });

  it("keeps every write when several land at once", async () => {
    const directory = mkdtempSync(join(tmpdir(), "notifications-"));
    const provider = localFolderProvider(directory);

    await Promise.all([
      provider.send("comment-reply", [sam], {}),
      provider.send("comment-reply", [jo], {}),
      provider.markRead("refund-request-to-decide", "7", [2, 3]),
    ]);

    expect(readAll(directory)).toHaveLength(3);
  });

  it("serves no feed", async () => {
    const directory = mkdtempSync(join(tmpdir(), "notifications-"));

    await expect(
      localFolderProvider(directory).createFeedSession(jo)
    ).resolves.toBeNull();
  });
});
