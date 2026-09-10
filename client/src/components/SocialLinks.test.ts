import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./SocialLinks.tsx", import.meta.url), "utf8");

describe("social links", () => {
  it("publishes only the requested X and GitHub destinations", () => {
    expect(source).toContain("https://x.com/robotmoneyos");
    expect(source).toContain("https://github.com/robotmoneyos");
    expect(source).not.toContain("SiDiscord");
    expect(source).not.toContain("SiTelegram");
  });

  it("keeps links keyboard-accessible and safe to open", () => {
    expect(source).toContain('aria-label={label}');
    expect(source).toContain('target="_blank"');
    expect(source).toContain('rel="noreferrer"');
  });
});