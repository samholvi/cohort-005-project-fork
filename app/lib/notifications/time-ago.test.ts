import { describe, expect, it } from "vitest";
import { timeAgo } from "./time-ago";

const NOW = new Date("2026-10-06T12:00:00.000Z");

describe("timeAgo", () => {
  it("says just now under a minute", () => {
    expect(timeAgo("2026-10-06T11:59:31.000Z", NOW)).toBe("just now");
  });

  it("counts minutes under an hour", () => {
    expect(timeAgo("2026-10-06T11:15:00.000Z", NOW)).toBe("45m ago");
  });

  it("counts hours under a day", () => {
    expect(timeAgo("2026-10-06T07:00:00.000Z", NOW)).toBe("5h ago");
  });

  it("counts days after that", () => {
    expect(timeAgo("2026-10-03T12:00:00.000Z", NOW)).toBe("3d ago");
  });

  it("treats a time slightly in the future as just now", () => {
    expect(timeAgo("2026-10-06T12:00:05.000Z", NOW)).toBe("just now");
  });
});
