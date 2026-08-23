import { afterEach, describe, expect, it } from "vitest";
import { passwordResetUrl } from "./auth";

const ENV_KEYS = ["APP_BASE_URL", "REPLIT_DEV_DOMAIN"] as const;

// Snapshot the original values before any test mutates them.
const originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
for (const key of ENV_KEYS) {
  originalEnv[key] = process.env[key];
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const saved = originalEnv[key];
    if (saved === undefined) delete process.env[key];
    else process.env[key] = saved;
  }
}

afterEach(() => {
  restoreEnv();
});

describe("passwordResetUrl", () => {
  it("uses the Replit preview domain when REPLIT_DEV_DOMAIN is set", () => {
    delete process.env.APP_BASE_URL;
    process.env.REPLIT_DEV_DOMAIN = "abc123.replit.dev";

    const url = passwordResetUrl("tok123");

    expect(url).toMatch(/^https:\/\/abc123\.replit\.dev\//);
    expect(url).toContain("/reset-password/");
    expect(url).toContain("tok123");
    expect(url).not.toContain("app.brain.fi");
  });

  it("falls back to app.brain.fi when REPLIT_DEV_DOMAIN is absent", () => {
    delete process.env.APP_BASE_URL;
    delete process.env.REPLIT_DEV_DOMAIN;

    const url = passwordResetUrl("tok456");

    expect(url).toMatch(/^https:\/\/app\.brain\.fi\//);
    expect(url).toContain("/reset-password/");
    expect(url).toContain("tok456");
  });

  it("prefers APP_BASE_URL over REPLIT_DEV_DOMAIN when both are set", () => {
    process.env.APP_BASE_URL = "https://custom.example.com";
    process.env.REPLIT_DEV_DOMAIN = "abc123.replit.dev";

    const url = passwordResetUrl("tok789");

    expect(url).toMatch(/^https:\/\/custom\.example\.com\//);
    expect(url).not.toContain("replit.dev");
    expect(url).not.toContain("app.brain.fi");
  });

  it("prefers APP_BASE_URL over the production default when REPLIT_DEV_DOMAIN is absent", () => {
    process.env.APP_BASE_URL = "https://staging.example.com";
    delete process.env.REPLIT_DEV_DOMAIN;

    const url = passwordResetUrl("tokABC");

    expect(url).toMatch(/^https:\/\/staging\.example\.com\//);
    expect(url).not.toContain("app.brain.fi");
  });

  it("appends return_to as a query parameter when provided", () => {
    delete process.env.APP_BASE_URL;
    delete process.env.REPLIT_DEV_DOMAIN;

    const url = passwordResetUrl("tokRET", "/dashboard");

    expect(url).toContain("return_to=%2Fdashboard");
  });

  it("omits return_to when not provided", () => {
    delete process.env.APP_BASE_URL;
    delete process.env.REPLIT_DEV_DOMAIN;

    const url = passwordResetUrl("tokNORET");

    expect(url).not.toContain("return_to");
  });
});
