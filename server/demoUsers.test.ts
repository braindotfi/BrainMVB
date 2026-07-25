import { describe, it, expect } from "vitest";
import { isDemoEmail, SHARED_DEMO_EMAIL } from "./demoUsers";

describe("isDemoEmail", () => {
  it("accepts the shared demo account and demo-fresh accounts", () => {
    expect(isDemoEmail(SHARED_DEMO_EMAIL)).toBe(true);
    expect(isDemoEmail("demo@brain.fi")).toBe(true);
    expect(isDemoEmail("DEMO@BRAIN.FI")).toBe(true);
    expect(isDemoEmail("demo-fresh-1a2b3c4d@brain.fi")).toBe(true);
    expect(isDemoEmail("demo-fresh-1a2b3c4d-9f@brain.fi")).toBe(true);
  });

  it("rejects real accounts and near-misses", () => {
    expect(isDemoEmail(null)).toBe(false);
    expect(isDemoEmail(undefined)).toBe(false);
    expect(isDemoEmail("")).toBe(false);
    expect(isDemoEmail("founder@realco.com")).toBe(false);
    expect(isDemoEmail("demo@realco.com")).toBe(false);
    expect(isDemoEmail("notdemo@brain.fi")).toBe(false);
    expect(isDemoEmail("demo-freshx@brain.fi")).toBe(false);
    expect(isDemoEmail("demo-fresh-@brain.fi.evil.com")).toBe(false);
    expect(isDemoEmail("xdemo-fresh-abc@brain.fi")).toBe(false);
  });
});
