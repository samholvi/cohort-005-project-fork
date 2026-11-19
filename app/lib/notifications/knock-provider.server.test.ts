import { generateKeyPairSync, verify } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  knockProvider,
  type KnockApi,
  type KnockConfig,
} from "./knock-provider.server";

// Tests never call Knock: the adapter's calls go to a recording KnockApi.

const jo = { id: 2, name: "Jo Park", email: "jo@example.com" };
const sam = { id: 3, name: "Sam Lee", email: "sam@example.com" };

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const signingKeyPem = privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();

const config: KnockConfig = {
  secretApiKey: "sk_test_secret",
  publicApiKey: "pk_test_public",
  signingKey: Buffer.from(signingKeyPem).toString("base64"),
  feedChannelId: "feed-channel",
  recipientPrefix: "dev-",
};

type Call = { method: string; args: unknown[] };

function recordingApi(unread: Record<string, string[]> = {}) {
  const calls: Call[] = [];
  const api: KnockApi = {
    async trigger(...args) {
      calls.push({ method: "trigger", args });
    },
    async listUnreadMessageIds(...args) {
      calls.push({ method: "listUnreadMessageIds", args });
      return unread[args[0]] ?? [];
    },
    async markMessagesRead(...args) {
      calls.push({ method: "markMessagesRead", args });
    },
  };
  return { api, calls };
}

function decodeJwt(token: string) {
  const [header, payload, signature] = token.split(".");
  const signed = verify(
    "RSA-SHA256",
    Buffer.from(`${header}.${payload}`),
    publicKey,
    Buffer.from(signature, "base64url")
  );
  return {
    signed,
    header: JSON.parse(Buffer.from(header, "base64url").toString()),
    payload: JSON.parse(Buffer.from(payload, "base64url").toString()),
  };
}

describe("knockProvider", () => {
  let recording: ReturnType<typeof recordingApi>;

  beforeEach(() => {
    recording = recordingApi();
  });

  describe("createFeedSession", () => {
    it("signs an RS256 user token for the prefixed recipient", async () => {
      const provider = knockProvider(config, recording.api);

      const session = await provider.createFeedSession(jo);

      expect(session?.settings).toMatchObject({
        publicApiKey: "pk_test_public",
        feedChannelId: "feed-channel",
        userId: "dev-2",
      });
      const token = decodeJwt(session?.settings.userToken ?? "");
      expect(token.signed).toBe(true);
      expect(token.header.alg).toBe("RS256");
      expect(token.payload.sub).toBe("dev-2");
    });

    it("accepts the signing key as plain PEM too", async () => {
      const provider = knockProvider(
        { ...config, signingKey: signingKeyPem },
        recording.api
      );

      const session = await provider.createFeedSession(jo);

      expect(decodeJwt(session?.settings.userToken ?? "").signed).toBe(true);
    });
  });

  describe("send", () => {
    it("triggers the kind's workflow for prefixed, named recipients", async () => {
      const provider = knockProvider(config, recording.api);

      await provider.send(
        "comment-reply",
        [sam],
        { key: "7", lessonId: 12 },
        jo
      );

      expect(recording.calls).toEqual([
        {
          method: "trigger",
          args: [
            "comment-reply",
            {
              recipients: [
                { id: "dev-3", name: "Sam Lee", email: "sam@example.com" },
              ],
              actor: { id: "dev-2", name: "Jo Park", email: "jo@example.com" },
              data: { key: "7", lessonId: 12 },
            },
          ],
        },
      ]);
    });

    it("sends without an actor when there is none", async () => {
      const provider = knockProvider(config, recording.api);

      await provider.send("new-lesson", [sam, jo], { lessonId: 12 });

      expect(recording.calls).toEqual([
        {
          method: "trigger",
          args: [
            "new-lesson",
            {
              recipients: [
                { id: "dev-3", name: "Sam Lee", email: "sam@example.com" },
                { id: "dev-2", name: "Jo Park", email: "jo@example.com" },
              ],
              data: { lessonId: 12 },
            },
          ],
        },
      ]);
    });
  });

  describe("markRead", () => {
    it("marks each recipient's unread messages of that kind and key as Read", async () => {
      recording = recordingApi({ "dev-2": ["m1"], "dev-3": ["m2", "m3"] });
      const provider = knockProvider(config, recording.api);

      await provider.markRead("refund-request-to-decide", "41", [2, 3]);

      const query = {
        workflowKey: "refund-request-to-decide",
        feedChannelId: "feed-channel",
        key: "41",
      };
      expect(recording.calls).toEqual([
        { method: "listUnreadMessageIds", args: ["dev-2", query] },
        { method: "listUnreadMessageIds", args: ["dev-3", query] },
        { method: "markMessagesRead", args: [["m1", "m2", "m3"]] },
      ]);
    });

    it("marks nothing when no message matches", async () => {
      const provider = knockProvider(config, recording.api);

      await provider.markRead("refund-request-to-decide", "41", [2]);

      expect(
        recording.calls.filter((call) => call.method === "markMessagesRead")
      ).toEqual([]);
    });
  });
});
