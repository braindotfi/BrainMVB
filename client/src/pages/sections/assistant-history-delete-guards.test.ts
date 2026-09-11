import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./BrainAssistant.tsx", import.meta.url),
  "utf8",
);

describe("assistant history delete controls", () => {
  it("keeps Delete visible and tappable on devices without hover", () => {
    const button = source.match(
      /data-testid=\{`button-delete-session-\$\{session\.id\}`\}[\s\S]{0,1200}?<\/button>/,
    )?.[0];

    expect(button).toBeDefined();
    expect(button).toContain("[@media(hover:none)]:opacity-100");
    expect(button).toContain("[@media(hover:none)]:pointer-events-auto");
  });

  it("does not let the active-session checkmark intercept Delete", () => {
    const status = source.match(
      /<span className="([^"]*group-hover:opacity-0[^"]*)">[\s\S]{0,300}?Active conversation/,
    );

    expect(status).toBeDefined();
    expect(status![1]).toContain("pointer-events-none");
  });
});