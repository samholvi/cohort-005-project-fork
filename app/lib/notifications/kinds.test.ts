import { describe, expect, it } from "vitest";
import { kindLabel } from "./kinds";

describe("kindLabel", () => {
  it("names a known kind", () => {
    expect(kindLabel("comment-reply")).toBe("Reply to your comment");
  });

  it("falls back to Notification for a kind this build doesn't know", () => {
    expect(kindLabel("from-the-future")).toBe("Notification");
  });
});
