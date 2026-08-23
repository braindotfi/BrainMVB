import express, { type Express } from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "crypto";
import { passwordResetTokenDigest, setupAuth } from "./auth";
import {
  classifyResendFailure,
  PasswordResetEmailDeliveryError,
  setPasswordResetEmailSenderForTests,
  type PasswordResetEmail,
} from "./passwordResetEmail";
import { storage } from "./storage";

const sent: PasswordResetEmail[] = [];
let server: Server;
let baseUrl: string;

async function request(path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

class SessionClient {
  private cookie = "";

  constructor(private readonly base: string) {}

  async request(path: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.cookie) headers.cookie = this.cookie;
    const response = await fetch(`${this.base}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  }
}

async function waitFor(condition: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for asynchronous password-reset work");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function resetToken(message: PasswordResetEmail): string {
  const url = new URL(message.resetUrl);
  return url.pathname.split("/").at(-1)!;
}

async function register(email: string): Promise<{ id: string }> {
  const response = await request("/api/auth/register", {
    email,
    password: "correct-horse-battery",
    name: "Reset Test",
  });
  expect(response.status).toBe(201);
  return response.body.user as { id: string };
}

async function registerSession(client: SessionClient, email: string): Promise<{ id: string }> {
  const response = await client.request("/api/auth/register", {
    email,
    password: "correct-horse-battery",
    name: "Reset Session Test",
  });
  expect(response.status).toBe(201);
  return response.body.user as { id: string };
}

beforeAll(async () => {
  setPasswordResetEmailSenderForTests(async (message) => { sent.push(message); });
  const app: Express = express();
  app.use(express.json());
  setupAuth(app);
  const httpServer = createServer(app);
  await new Promise<void>((resolve) => {
    server = httpServer.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  setPasswordResetEmailSenderForTests(null);
  server?.close();
});

beforeEach(() => {
  sent.splice(0, sent.length);
});

describe("password reset", () => {
  it("does not reveal whether an account exists and sends a link only to the matching account", async () => {
    const email = `reset-known-${randomBytes(6).toString("hex")}@example.com`;
    await register(email);

    const known = await request("/api/auth/password-reset/request", { email });
    const unknown = await request("/api/auth/password-reset/request", { email: `missing-${email}` });
    const malformed = await request("/api/auth/password-reset/request", { email: "not-an-email" });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(malformed.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(unknown.body).toEqual(malformed.body);
    await waitFor(() => sent.length === 1);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(email);
  });

  it("carries only a validated invite continuation into a reset email", async () => {
    const email = `reset-invite-return-${randomBytes(6).toString("hex")}@example.com`;
    await register(email);
    const invitePath = "/invite/invite-token_123";

    await request("/api/auth/password-reset/request", { email, return_to: invitePath });
    await waitFor(() => sent.length === 1);
    const invitedReset = new URL(sent[0].resetUrl);
    expect(invitedReset.pathname).toMatch(/^\/reset-password\/[A-Za-z0-9_-]+$/);
    expect(invitedReset.searchParams.get("return_to")).toBe(invitePath);

    await request("/api/auth/password-reset/request", {
      email,
      return_to: "https://attacker.example/invite/steal",
    });
    await waitFor(() => sent.length === 2);
    expect(new URL(sent[1].resetUrl).searchParams.get("return_to")).toBeNull();
  });

  it("invalidates a replacement link, rejects expired links, and consumes a link once", async () => {
    const email = `reset-lifecycle-${randomBytes(6).toString("hex")}@example.com`;
    const user = await register(email);

    await request("/api/auth/password-reset/request", { email });
    await waitFor(() => sent.length === 1);
    const first = resetToken(sent[0]);
    await request("/api/auth/password-reset/request", { email });
    await waitFor(() => sent.length === 2);
    const second = resetToken(sent[1]);

    expect((await request("/api/auth/password-reset/verify", { token: first })).body).toEqual({ valid: false });
    expect((await request("/api/auth/password-reset/verify", { token: second })).body).toEqual({ valid: true });

    const expired = randomBytes(32).toString("base64url");
    await storage.createPasswordResetToken({
      userId: user.id,
      tokenHash: passwordResetTokenDigest(expired),
      expiresAt: new Date(),
    });
    expect((await request("/api/auth/password-reset/verify", { token: expired })).body).toEqual({ valid: false });

    await request("/api/auth/password-reset/request", { email });
    await waitFor(() => sent.length === 3);
    const usable = resetToken(sent.at(-1)!);
    const changed = await request("/api/auth/password-reset/confirm", {
      token: usable,
      password: "new-correct-horse-battery",
    });
    expect(changed.status).toBe(200);
    expect((await request("/api/auth/password-reset/verify", { token: usable })).body).toEqual({ valid: false });
    expect((await request("/api/auth/password-reset/confirm", {
      token: usable,
      password: "another-correct-horse",
    })).status).toBe(400);

    const signedIn = await request("/api/auth/login", {
      identifier: email,
      password: "new-correct-horse-battery",
    });
    expect(signedIn.status).toBe(200);
  });

  it("keeps reset routes anonymous and clears an unrelated ambient session at the reset boundary", async () => {
    const targetEmail = `reset-boundary-target-${randomBytes(6).toString("hex")}@example.com`;
    await register(targetEmail);
    await request("/api/auth/password-reset/request", { email: targetEmail });
    await waitFor(() => sent.length === 1);
    const token = resetToken(sent[0]);

    const otherSession = new SessionClient(baseUrl);
    const otherEmail = `reset-boundary-other-${randomBytes(6).toString("hex")}@example.com`;
    const other = await registerSession(otherSession, otherEmail);

    // The public reset API never authenticates or switches the browser to the
    // reset target, even when an unrelated session cookie is present.
    expect((await otherSession.request("/api/auth/password-reset/verify", { token })).body).toEqual({ valid: true });
    expect((await otherSession.request("/api/auth/user")).body.user).toMatchObject({ id: other.id });

    // AppLayout performs this before rendering reset content. Once it succeeds,
    // no unrelated identity remains to be restored by a reset-page exit.
    expect((await otherSession.request("/api/auth/logout", {})).status).toBe(200);
    expect((await otherSession.request("/api/auth/user")).status).toBe(401);
  });

  it("invalidates every target session after reset without touching another account", async () => {
    const targetEmail = `reset-session-target-${randomBytes(6).toString("hex")}@example.com`;
    const firstTargetSession = new SessionClient(baseUrl);
    const target = await registerSession(firstTargetSession, targetEmail);
    const secondTargetSession = new SessionClient(baseUrl);
    expect((await secondTargetSession.request("/api/auth/login", {
      identifier: targetEmail,
      password: "correct-horse-battery",
    })).status).toBe(200);

    const otherSession = new SessionClient(baseUrl);
    const other = await registerSession(
      otherSession,
      `reset-session-other-${randomBytes(6).toString("hex")}@example.com`,
    );

    await request("/api/auth/password-reset/request", { email: targetEmail });
    await waitFor(() => sent.length === 1);
    const token = resetToken(sent[0]);
    const changed = await request("/api/auth/password-reset/confirm", {
      token,
      password: "new-correct-horse-battery",
    });
    expect(changed.status).toBe(200);

    expect((await firstTargetSession.request("/api/auth/user")).status).toBe(401);
    expect((await secondTargetSession.request("/api/auth/user")).status).toBe(401);
    expect((await otherSession.request("/api/auth/user")).body.user).toMatchObject({ id: other.id });

    const freshTargetSession = new SessionClient(baseUrl);
    const relogin = await freshTargetSession.request("/api/auth/login", {
      identifier: targetEmail,
      password: "new-correct-horse-battery",
    });
    expect(relogin.status).toBe(200);
    expect(relogin.body.user).toMatchObject({ id: target.id });
  });

  it("records reset activity without writing raw emails, tokens, or session identifiers", async () => {
    const email = `reset-audit-${randomBytes(6).toString("hex")}@example.com`;
    const audit = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await register(email);

    await request("/api/auth/password-reset/request", { email });
    await waitFor(() => sent.length === 1);
    const token = resetToken(sent[0]);
    await request("/api/auth/password-reset/verify", { token });

    const output = audit.mock.calls.flat().join(" ");
    expect(output).toContain("[auth-audit]");
    expect(output).toContain("route=password-reset/request");
    expect(output).toContain("route=password-reset/verify");
    expect(output).not.toContain(email);
    expect(output).not.toContain(token);
    audit.mockRestore();
  });

  it("revokes an undeliverable link without logging reset secrets", async () => {
    const email = `reset-failure-${randomBytes(6).toString("hex")}@example.com`;
    await register(email);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const rawResetLink = `https://app.brain.fi/reset-password/${randomBytes(32).toString("base64url")}`;
    setPasswordResetEmailSenderForTests(async () => {
      throw new Error(`mail down for ${email}: ${rawResetLink}`);
    });

    const response = await request("/api/auth/password-reset/request", { email });

    expect(response.status).toBe(200);
    await waitFor(() => log.mock.calls.length > 0);
    expect(log).toHaveBeenCalledWith("[auth] password reset email delivery failed category=unknown");
    expect(log.mock.calls.flat().join(" ")).not.toContain(email);
    expect(log.mock.calls.flat().join(" ")).not.toContain(rawResetLink);
    expect(sent).toHaveLength(0);
    setPasswordResetEmailSenderForTests(async (message) => { sent.push(message); });
    log.mockRestore();
  });

  it("logs only a safe Resend status and sender classification", async () => {
    const email = `reset-provider-failure-${randomBytes(6).toString("hex")}@example.com`;
    await register(email);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    setPasswordResetEmailSenderForTests(async () => {
      throw new PasswordResetEmailDeliveryError(
        classifyResendFailure(422, {
          errors: {
            "from.email": [`Sender rejected for ${email}`],
            "to.0.email": [`Recipient ${email} was rejected`],
          },
        }),
      );
    });

    await request("/api/auth/password-reset/request", { email });

    await waitFor(() => log.mock.calls.length > 0);
    expect(log).toHaveBeenCalledWith(
      "[auth] password reset email delivery failed status=422 category=sender_rejected fields=from.email",
    );
    expect(log.mock.calls.flat().join(" ")).not.toContain(email);
    setPasswordResetEmailSenderForTests(async (message) => { sent.push(message); });
    log.mockRestore();
  });

  it("returns the generic response before a slow provider completes", async () => {
    const email = `reset-async-${randomBytes(6).toString("hex")}@example.com`;
    await register(email);
    let releaseDelivery: (() => void) | undefined;
    let deliveryStarted = false;
    const deliveryFinished = new Promise<void>((resolve) => {
      releaseDelivery = resolve;
    });
    setPasswordResetEmailSenderForTests(async () => {
      deliveryStarted = true;
      await deliveryFinished;
    });

    const response = await request("/api/auth/password-reset/request", { email });

    expect(response.status).toBe(200);
    await waitFor(() => deliveryStarted);
    releaseDelivery?.();
    setPasswordResetEmailSenderForTests(async (message) => { sent.push(message); });
  });

  it("keeps the public response generic when delivery-token cleanup fails", async () => {
    const email = `reset-revoke-failure-${randomBytes(6).toString("hex")}@example.com`;
    await register(email);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const revoke = vi.spyOn(storage, "revokePasswordResetTokens").mockRejectedValueOnce(new Error("database down"));
    setPasswordResetEmailSenderForTests(async () => {
      throw new PasswordResetEmailDeliveryError({ category: "credential_rejected", status: 401 });
    });

    const response = await request("/api/auth/password-reset/request", { email });

    expect(response.status).toBe(200);
    await waitFor(() => log.mock.calls.length > 0);
    expect(log).toHaveBeenCalledWith(
      "[auth] password reset email delivery failed status=401 category=credential_rejected revoke_failed=true",
    );
    revoke.mockRestore();
    setPasswordResetEmailSenderForTests(async (message) => { sent.push(message); });
    log.mockRestore();
  });

  it("passes a reset URL whose domain matches the runtime environment signal, not a hardcoded value", async () => {
    const email = `reset-url-domain-${randomBytes(6).toString("hex")}@example.com`;
    await register(email);

    // Snapshot and override env vars so passwordResetUrl() sees the dev signal.
    const savedDevDomain = process.env.REPLIT_DEV_DOMAIN;
    const savedAppBaseUrl = process.env.APP_BASE_URL;
    const testDomain = "test-env-signal.replit.dev";
    delete process.env.APP_BASE_URL;
    process.env.REPLIT_DEV_DOMAIN = testDomain;

    try {
      await request("/api/auth/password-reset/request", { email });
      await waitFor(() => sent.length === 1);

      const resetUrl = new URL(sent[0].resetUrl);
      expect(resetUrl.host).toBe(testDomain);
      expect(resetUrl.protocol).toBe("https:");
      expect(resetUrl.pathname).toMatch(/^\/reset-password\/[A-Za-z0-9_-]+$/);
      expect(sent[0].resetUrl).not.toContain("app.brain.fi");
    } finally {
      // Always restore env so subsequent tests see the original values.
      if (savedDevDomain === undefined) delete process.env.REPLIT_DEV_DOMAIN;
      else process.env.REPLIT_DEV_DOMAIN = savedDevDomain;
      if (savedAppBaseUrl === undefined) delete process.env.APP_BASE_URL;
      else process.env.APP_BASE_URL = savedAppBaseUrl;
    }
  });
});