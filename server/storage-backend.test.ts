import { describe, it, expect } from "vitest";
import { assertStorageBackend } from "./storage";

/**
 * The guard that keeps production off MemStorage. Without it a missing
 * DATABASE_URL is silent: the app boots, serves traffic, and drops every
 * account and session on the next restart.
 */
describe("assertStorageBackend", () => {
  it("refuses to boot in production without DATABASE_URL", () => {
    expect(() => assertStorageBackend({ NODE_ENV: "production" })).toThrow(
      /DATABASE_URL must be set in production/,
    );
  });

  it("boots in production when DATABASE_URL is set", () => {
    expect(() =>
      assertStorageBackend({ NODE_ENV: "production", DATABASE_URL: "postgres://user@host/db" }),
    ).not.toThrow();
  });

  it("still allows the in-memory fallback outside production", () => {
    expect(() => assertStorageBackend({ NODE_ENV: "development" })).not.toThrow();
    expect(() => assertStorageBackend({ NODE_ENV: "test" })).not.toThrow();
  });
});
