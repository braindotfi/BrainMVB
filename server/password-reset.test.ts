import express, { type Express } from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "crypto";
import { passwordResetTokenDigest, setupAuth } from "./auth";
import {
  classifyMailerSendFailure,
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
      expiresAt: new Date(Date.now() - 1),
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

  it("logs only a safe MailerSend status and sender classification", async () => {
    const email = `reset-provider-failure-${randomBytes(6).toString("hex")}@example.com`;
    await register(email);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    setPasswordResetEmailSenderForTests(async () => {
      throw new PasswordResetEmailDeliveryError(
        classifyMailerSendFailure(422, {
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
});