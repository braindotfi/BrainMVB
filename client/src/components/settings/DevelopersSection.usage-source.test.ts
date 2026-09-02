import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const component = readFileSync(
  resolve(
    process.cwd(),
    "client/src/components/settings/DevelopersSection.tsx",
  ),
  "utf8",
);
const routes = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");

describe("Developers API-key-only usage", () => {
  it("uses the core request meter instead of general audit aggregation", () => {
    const usageRoute = routes.slice(
      routes.indexOf('app.get("/api/developers/usage"'),
      routes.indexOf("// KEY-AUTHENTICATED PLATFORM API"),
    );
    expect(usageRoute).toContain("getTenantKeyUsage");
    expect(usageRoute).toContain('window: "current_month"');
    expect(usageRoute).not.toContain("listAuditEvents");
    expect(usageRoute).not.toContain("aggregateUsage");
  });

  it("renders real HTTP methods and calendar-month request totals", () => {
    expect(component).toContain("data?.totalRequests");
    expect(component).toContain("data.methods.map");
    expect(component).toContain("{a.method}");
    expect(component).toContain("current UTC month");
    expect(component).not.toContain(
      "different measurement than the tenant-wide audit events",
    );
  });

  it("renders every request-meter breakdown and shadow billable units", () => {
    expect(component).toContain('label="Requests by Scope"');
    expect(component).toContain('label="Requests by Route"');
    expect(component).toContain('label="Requests by Outcome"');
    expect(component).toContain("data?.scopes.map");
    expect(component).toContain("data?.routes.map");
    expect(component).toContain("data?.outcomes.map");
    expect(component).toContain("data?.billableUnits");
    expect(component).toContain('data-testid="metric-billable-units"');
  });

  it("describes the live gateway behavior accurately", () => {
    expect(component).toContain("authenticate at brain-core's API gateway");
    expect(component).not.toContain("gateway is rolling out");
    expect(component).not.toContain("platform endpoints only");
  });
});
