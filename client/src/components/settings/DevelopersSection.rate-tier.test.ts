import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "client/src/components/settings/DevelopersSection.tsx"),
  "utf8",
);

describe("Developers server-owned rate tier", () => {
  it("renders the core entitlement and never imports the local billing plan store", () => {
    expect(source).not.toContain('from "@/lib/planStore"');
    expect(source).toContain("keyUsageQ.data?.entitlement");
    expect(source).toContain("entitlement.effectiveKeyLimit");
    expect(source).toContain("entitlement.tenantLimit");
    expect(source).toContain("entitlement.entitlementVersion");
  });
});
