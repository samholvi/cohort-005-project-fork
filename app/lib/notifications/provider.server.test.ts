import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { defaultProvider } from "./provider.server";

const jo = { id: 2, name: "Jo Park", email: "jo@example.com" };

function knockEnv() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return {
    KNOCK_SECRET_API_KEY: "sk_test_secret",
    KNOCK_PUBLIC_API_KEY: "pk_test_public",
    KNOCK_SIGNING_KEY: Buffer.from(pem).toString("base64"),
    KNOCK_FEED_CHANNEL_ID: "feed-channel",
    KNOCK_RECIPIENT_PREFIX: "dev-",
  };
}

describe("defaultProvider", () => {
  it("uses the local folder, which serves no feed, when Knock isn't configured", async () => {
    const provider = defaultProvider({});

    expect(await provider.createFeedSession(jo)).toBeNull();
  });

  it("uses the local folder when a Knock variable is missing", async () => {
    const { KNOCK_SIGNING_KEY: _missing, ...env } = knockEnv();

    expect(await defaultProvider(env).createFeedSession(jo)).toBeNull();
  });

  it("uses Knock, which serves a feed, when every Knock variable is set", async () => {
    const provider = defaultProvider(knockEnv());

    expect(await provider.createFeedSession(jo)).toMatchObject({
      provider: "knock",
    });
  });
});
