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

  // Knock rejects an in-app template without exactly one of action_url and
  // action_buttons. Cadence builds each row's link from the data (ADR 0013),
  // so the URL is a placeholder the bell never reads.
  it("gives every in-app template the action_url Knock requires", () => {
    for (const key of readdirSync(WORKFLOWS)) {
      const workflow = JSON.parse(
        readFileSync(join(WORKFLOWS, key, "workflow.json"), "utf8")
      );
      const template = workflow.steps[0].template;
      expect(typeof template.action_url, key).toBe("string");
      expect(template.action_buttons, key).toBeUndefined();
    }
  });

  // Knock rejects a category that isn't already in the environment's
  // preference category catalog, and Cadence has no Notification preferences,
  // so workflows carry no categories and need no dashboard setup.
  it("gives no workflow a category", () => {
    for (const key of readdirSync(WORKFLOWS)) {
      const workflow = JSON.parse(
        readFileSync(join(WORKFLOWS, key, "workflow.json"), "utf8")
      );
      expect(workflow.categories, key).toBeUndefined();
    }
  });
});
