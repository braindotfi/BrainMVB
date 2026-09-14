import { afterEach, describe, expect, it } from "vitest";
import { canonicalAppOrigin, googleCallbackUrl, passwordResetUrl } from "./auth";

/**
 * The app moved from app.brain.fi to app.robotmoney.com. The old host stopped serving
 * (it answers 404), and two absolute URLs were still built from it: the Google OAuth
 * redirect_uri, which made sign-in fail with redirect_uri_mismatch, and the production
 * password-reset link, which sent users to a dead domain without any error to notice.
 *
 * These pin the shape of the fix — one canonical origin, overridable by env — so the
 * next domain move cannot leave one of the two behind again.
 */

const ENV_KEYS = ["APP_BASE_URL", "REPLIT_DEV_DOMAIN"] as const;

const originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
for (const key of ENV_KEYS) originalEnv[key] = process.env[key];

afterEach(() => {
  for (const key of ENV_KEYS) {
    const saved = originalEnv[key];
    if (saved === undefined) delete process.env[key];
    else process.env[key] = saved;
  }
});

describe("canonical app origin", () => {
  it("defaults to the host that is actually serving the app", () => {
    delete process.env.APP_BASE_URL;
    expect(canonicalAppOrigin()).toBe("https://app.robotmoney.com");
  });

  it("is overridable by env, so a domain move is config and not a code hunt", () => {
    process.env.APP_BASE_URL = "https://staging.example.com";
    expect(canonicalAppOrigin()).toBe("https://staging.example.com");
  });

  it("normalises a trailing slash instead of building a double-slash callback", () => {
    // The quiet version of the same outage: "https://host//api/auth/google/callback"
    // is not the string registered with Google, so sign-in breaks again while the
    // code looks right.
    process.env.APP_BASE_URL = "https://staging.example.com/";
    expect(canonicalAppOrigin()).toBe("https://staging.example.com");
    expect(googleCallbackUrl()).toBe("https://staging.example.com/api/auth/google/callback");
  });

  it("ignores a misconfigured value and keeps serving the known-good origin", () => {
    // Refusing to boot over a malformed OPTIONAL override would be worse than using
    // the default, but silently building a broken URL from it is worse still.
    for (const bad of [
      "http://insecure.example.com", // not https
      "https://user:pw@example.com", // credentials
      "https://example.com/some/path", // path
      "https://example.com?x=1", // query
      "https://example.com#frag", // fragment
      "not-a-url",
      "//example.com",
    ]) {
      process.env.APP_BASE_URL = bad;
      expect(canonicalAppOrigin(), `should have rejected ${bad}`).toBe(
        "https://app.robotmoney.com",
      );
    }
  });

  it("treats a blank override as absent rather than as an empty origin", () => {
    process.env.APP_BASE_URL = "   ";
    expect(canonicalAppOrigin()).toBe("https://app.robotmoney.com");
  });

  it("is read per call, not captured when the module loads", () => {
    // A module-level const would freeze whatever the env looked like at import time,
    // which is how a deploy-time config value silently fails to take effect.
    delete process.env.APP_BASE_URL;
    const before = canonicalAppOrigin();
    process.env.APP_BASE_URL = "https://later.example.com";
    expect(canonicalAppOrigin()).not.toBe(before);
    expect(canonicalAppOrigin()).toBe("https://later.example.com");
  });
});

describe("google oauth redirect_uri", () => {
  it("points at the live domain, not the retired one", () => {
    delete process.env.APP_BASE_URL;
    // The exact string that has to be registered in Google Cloud Console. Google
    // matches it byte for byte, so this doubles as the value to copy across.
    expect(googleCallbackUrl()).toBe("https://app.robotmoney.com/api/auth/google/callback");
    expect(googleCallbackUrl()).not.toContain("app.brain.fi");
  });

  it("never carries a trailing slash or a query, which Google would reject", () => {
    delete process.env.APP_BASE_URL;
    const url = new URL(googleCallbackUrl());
    expect(url.pathname).toBe("/api/auth/google/callback");
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
  });

  it("ignores the Replit preview domain even when one is present", () => {
    // The preview hostname rotates and can never be pre-registered with Google, so
    // the callback must stay pinned to the canonical domain in every environment.
    delete process.env.APP_BASE_URL;
    process.env.REPLIT_DEV_DOMAIN = "abc123.replit.dev";
    expect(googleCallbackUrl()).toBe("https://app.robotmoney.com/api/auth/google/callback");
  });

  it("follows APP_BASE_URL so the registered URI and the sent URI can move together", () => {
    process.env.APP_BASE_URL = "https://staging.example.com";
    expect(googleCallbackUrl()).toBe("https://staging.example.com/api/auth/google/callback");
  });
});

describe("the two absolute URLs stay on the same host", () => {
  it("sends reset links and OAuth callbacks to one origin in production", () => {
    // The original defect was exactly this divergence going unnoticed: OAuth failed
    // loudly while reset emails kept pointing at the dead host in silence.
    delete process.env.APP_BASE_URL;
    delete process.env.REPLIT_DEV_DOMAIN;
    expect(new URL(passwordResetUrl("tok")).origin).toBe(new URL(googleCallbackUrl()).origin);
  });
});
