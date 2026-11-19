import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Only the Knock adapters may import Knock packages (ADR 0014). An adapter is
// a non-test module in app/lib/notifications/ whose name starts with
// `knock-`: the server adapter now, its browser counterpart later. There's no
// ESLint in this repo, so this test is the restricted-imports rule.

const APP = join(__dirname, "..", "..");
const ADAPTER = /^lib\/notifications\/knock-[^/]*(?<!\.test)\.tsx?$/;
const KNOCK_IMPORT = /(?:from|import|require)\s*\(?\s*["']@knocklabs\//;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("Knock import boundary", () => {
  it("lets only the Knock adapters import Knock packages", () => {
    const offenders = sourceFiles(APP)
      .map((path) => relative(APP, path).split("\\").join("/"))
      .filter((path) => !ADAPTER.test(path))
      .filter((path) =>
        KNOCK_IMPORT.test(readFileSync(join(APP, path), "utf8"))
      );

    expect(offenders).toEqual([]);
  });

  it("recognises the server adapter as one", () => {
    expect(ADAPTER.test("lib/notifications/knock-provider.server.ts")).toBe(
      true
    );
    expect(
      ADAPTER.test("lib/notifications/knock-provider.server.test.ts")
    ).toBe(false);
  });
});
