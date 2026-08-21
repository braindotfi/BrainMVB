import express, { type Express } from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SHARED_DEMO_EMAIL } from "./demoUsers";

/**
 * Google OAuth must never resolve to a demo account.
 *
 * The callback adopts an existing user by verified email. Demo rows (demo@brain.fi and
 * demo-fresh-*@brain.fi) hold shared, synthetic data and have no real owner, so adopting one
 * would hand the caller that tenant — the same exposure as the deleted shared demo login,
 * reached through a different door. /api/auth/register blocks the whole @brain.fi domain, but
 * the OAuth callback never went through it.
 *
 * Environment constraints, both handled in beforeAll BEFORE the dynamic import (static imports
 * are hoisted above assignments, which is why the import cannot be at the top of the file):
 *
 * 1. `googleEnabled` is a module-load-time const, so the credentials must already be set.
 * 2. DATABASE_URL is unset here so both the session store and `storage` resolve to their
 *    in-memory implementations. Otherwise this file writes real rows to the dev database, and
 *    the Postgres session store loses a race against the immediately-following callback
 *    request — the begin request's session is not readable yet, so every assertion collapses
 *    into a spurious `google_state` failure. The guard under test reads an email off the
 *    profile and the user row; nothing about it is storage-specific.
 */

let server: Server;
let baseUrl: string;
let storage: typeof import("./storage").storage;

const realFetch = globalThis.fetch;
/** Snapshotted so the env this file forces cannot leak if workers are ever reused. */
const envSnapshot = {
  DATABASE_URL: process.env.DATABASE_URL,
  BRAIN_TENANCY_MODE: process.env.BRAIN_TENANCY_MODE,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
};

/** Stand in for Google's token + userinfo endpoints; everything else hits the real server. */
function mockGoogle(profile: {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "test-access-token" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.startsWith("https://openidconnect.googleapis.com/v1/userinfo")) {
      return new Response(JSON.stringify(profile), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return realFetch(input as RequestInfo, init);
  });
}

/** Walks the real OAuth entry point so the callback sees a session state it will accept. */
async function runCallback(returnTo?: string): Promise<{ location: string; cookie: string }> {
  const beginUrl = new URL("/api/auth/google", baseUrl);
  if (returnTo) beginUrl.searchParams.set("return_to", returnTo);
  const begin = await realFetch(beginUrl, { redirect: "manual" });
  const cookie = (begin.headers.get("set-cookie") ?? "").split(";")[0];
  const authorizationUrl = new URL(begin.headers.get("location") ?? "");
  expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
    "https://app.brain.fi/api/auth/google/callback",
  );
  const state = authorizationUrl.searchParams.get("state");
  expect(state).toBeTruthy();

  const cb = await realFetch(
    `${baseUrl}/api/auth/google/callback?code=test-code&state=${encodeURIComponent(state!)}`,
    { redirect: "manual", headers: { cookie } },
  );
  return { location: cb.headers.get("location") ?? "", cookie };
}

/** Asserts the callback refused and, decisively, minted no session for the demo row. */
async function expectRefused(result: { location: string; cookie: string }) {
  expect(result.location).toBe("/?auth_error=google_demo_account");
  const after = await realFetch(`${baseUrl}/api/auth/user`, { headers: { cookie: result.cookie } });
  expect(after.status).toBe(401);
}

beforeAll(async () => {
  process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
  delete process.env.DATABASE_URL;
  delete process.env.BRAIN_TENANCY_MODE;

  const [{ registerRoutes }, storageModule] = await Promise.all([
    import("./routes"),
    import("./storage"),
  ]);
  storage = storageModule.storage;

  const app: Express = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  await new Promise<void>((resolve) => {
    server = httpServer.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  server?.close();
  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Google OAuth cannot resolve to a demo account", () => {
  it("refuses to adopt the shared demo row by verified email", async () => {
    // The orphaned row left behind by the deleted shared demo login.
    await storage.createUser({
      username: SHARED_DEMO_EMAIL,
      email: SHARED_DEMO_EMAIL,
      password: null,
      name: "ACME Inc.",
    });

    mockGoogle({ sub: "google-sub-shared", email: SHARED_DEMO_EMAIL, email_verified: true });
    await expectRefused(await runCallback());
  });

  it("refuses to adopt a per-visitor demo row", async () => {
    const email = "demo-fresh-1a2b3c4d@brain.fi";
    await storage.createUser({ username: email, email, password: null, name: "Demo Business" });

    mockGoogle({ sub: "google-sub-fresh", email, email_verified: true });
    await expectRefused(await runCallback());
  });

  it("does not create a demo-addressed account when no row exists yet", async () => {
    const email = "demo-fresh-99887766@brain.fi";
    expect(await storage.getUserByEmail(email)).toBeUndefined();

    mockGoogle({ sub: "google-sub-new", email, email_verified: true });
    await expectRefused(await runCallback());

    // Refusing must not leave a half-made row behind.
    expect(await storage.getUserByEmail(email)).toBeUndefined();
  });

  it("still signs in a normal Google user", async () => {
    // Proves the guard discriminates rather than blocking OAuth outright.
    const email = "real.person@example.com";
    mockGoogle({ sub: "google-sub-real", email, email_verified: true, name: "Real Person" });
    const { location, cookie } = await runCallback();

    expect(location).toBe("/");
    const after = await realFetch(`${baseUrl}/api/auth/user`, { headers: { cookie } });
    expect(after.status).toBe(200);
    const body = (await after.json()) as { user: { email: string; isDemo: boolean } };
    expect(body.user.email).toBe(email);
    expect(body.user.isDemo).toBe(false);
  });

  it("returns a Google-authenticated invitee to the original invite URL", async () => {
    const email = "invited.google@example.com";
    const invitePath = "/invite/invite-token_123";
    mockGoogle({ sub: "google-sub-invite", email, email_verified: true, name: "Invited Google User" });
    const { location, cookie } = await runCallback(invitePath);

    expect(location).toBe(invitePath);
    const after = await realFetch(`${baseUrl}/api/auth/user`, { headers: { cookie } });
    expect(after.status).toBe(200);
  });
});
