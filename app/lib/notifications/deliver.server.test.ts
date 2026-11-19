import { describe, expect, it } from "vitest";
import { notifyInBackground } from "./deliver.server";

describe("notifyInBackground", () => {
  it("starts the work after the caller's synchronous code has finished", async () => {
    let started = false;

    const done = notifyInBackground("test", new Date(), async () => {
      started = true;
    });

    expect(started).toBe(false);
    await done;
    expect(started).toBe(true);
  });
});
