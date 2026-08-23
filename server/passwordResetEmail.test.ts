import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatPasswordResetEmailFailure,
  sendPasswordResetEmail,
  setPasswordResetEmailSenderForTests,
} from "./passwordResetEmail";

const originalEnvironment = {
  resendApiKey: process.env.RESEND_API_KEY,
  resendFromEmail: process.env.RESEND_FROM_EMAIL,
  resendFromName: process.env.RESEND_FROM_NAME,
  mailerSendFromEmail: process.env.MAILERSEND_FROM_EMAIL,
  mailerSendFromName: process.env.MAILERSEND_FROM_NAME,
};

function restoreEnvironment() {
  for (const [key, value] of Object.entries({
    RESEND_API_KEY: originalEnvironment.resendApiKey,
    RESEND_FROM_EMAIL: originalEnvironment.resendFromEmail,
    RESEND_FROM_NAME: originalEnvironment.resendFromName,
    MAILERSEND_FROM_EMAIL: originalEnvironment.mailerSendFromEmail,
    MAILERSEND_FROM_NAME: originalEnvironment.mailerSendFromName,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  restoreEnvironment();
  setPasswordResetEmailSenderForTests(null);
});

describe("Resend password reset delivery", () => {
  it("uses Resend's email endpoint with the existing verified sender", async () => {
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "sender@example.com";
    process.env.RESEND_FROM_NAME = "Brain Finance";
    delete process.env.MAILERSEND_FROM_EMAIL;
    delete process.env.MAILERSEND_FROM_NAME;
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email_test" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await sendPasswordResetEmail({
      to: "recipient@example.com",
      resetUrl: "https://app.brain.fi/reset-password/test-token",
      expiresInMinutes: 30,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe("https://api.resend.com/emails");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer test-resend-key",
        "Content-Type": "application/json",
      },
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      from: "Brain Finance <sender@example.com>",
      to: ["recipient@example.com"],
      subject: "Reset your Brain Finance password",
    });
  });

  it("redacts a Resend provider response that includes reset-sensitive values", async () => {
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "sender@example.com";
    delete process.env.MAILERSEND_FROM_EMAIL;
    const recipient = "recipient@example.com";
    const resetUrl = "https://app.brain.fi/reset-password/test-token";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: `Rejected ${recipient} ${resetUrl}`,
    }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    })));

    const error = await sendPasswordResetEmail({
      to: recipient,
      resetUrl,
      expiresInMinutes: 30,
    }).catch((caught: unknown) => caught);

    const diagnostic = formatPasswordResetEmailFailure(error);
    expect(diagnostic).toBe("status=403 category=permission_rejected");
    expect(diagnostic).not.toContain(recipient);
    expect(diagnostic).not.toContain(resetUrl);
  });
});