import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NOTIFICATION_KIND_LABELS } from "./kinds";

// The Knock adapter triggers the workflow whose key is the kind, so every
// kind needs a workflow in knock/workflows/ (pushed with the Knock CLI), and
// a workflow no kind uses is dead.

const WORKFLOWS = join(__dirname, "..", "..", "..", "knock", "workflows");

describe("Knock workflows", () => {
  it("has exactly one workflow per kind", () => {
    expect(readdirSync(WORKFLOWS).sort()).toEqual(
      Object.keys(NOTIFICATION_KIND_LABELS).sort()
    );
  });

  it("delivers every workflow to the in-app feed only", () => {
    for (const key of readdirSync(WORKFLOWS)) {
      const workflow = JSON.parse(
        readFileSync(join(WORKFLOWS, key, "workflow.json"), "utf8")
      );
      expect(workflow.steps, key).toEqual([
        expect.objectContaining({ type: "channel", channel_key: "in-app" }),
      ]);
    }
  });
});
