import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { NotificationProvider } from "./provider.server";

// Used when no provider is configured (a fresh checkout, no KNOCK_* variables).
// Each send and markRead becomes a JSON file in a git-ignored folder, so you
// can see what would have been sent. It serves no feed, so the bell stays
// hidden.

let sequence = 0;

export function localFolderProvider(directory: string): NotificationProvider {
  function write(name: string, body: unknown) {
    mkdirSync(directory, { recursive: true });
    sequence += 1;
    const file = join(directory, `${Date.now()}-${sequence}-${name}.json`);
    writeFileSync(file, JSON.stringify(body, null, 2));
  }

  return {
    async send(kind, recipients, data, actor) {
      write(kind, { action: "send", kind, recipients, data, actor });
    },
    async markRead(kind, key, recipientIds) {
      write(`${kind}-read`, { action: "markRead", kind, key, recipientIds });
    },
    async createFeedSession() {
      return null;
    },
  };
}
