import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AGENT_API_KEY_MIGRATION_BATCH } from "./agentApiKeyMigrationBatch";

const authSource = readFileSync(new URL("./agentApiKey.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("./agentApiKeyMigration.ts", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../index.ts", import.meta.url), "utf8");

describe("Phase 3 BFF migration structure", () => {
  it("limits each reviewed production batch to five unique tenant ids", () => {
    expect(AGENT_API_KEY_MIGRATION_BATCH.length).toBeLessThanOrEqual(5);
    expect(new Set(AGENT_API_KEY_MIGRATION_BATCH).size).toBe(
      AGENT_API_KEY_MIGRATION_BATCH.length,
    );
    for (const tenantId of AGENT_API_KEY_MIGRATION_BATCH) {
      expect(tenantId).toMatch(/^tnt_[0-9A-HJKMNP-TV-Z]{26}$/);
    }
  });

  it("keeps agent keys exchange-only and fixes the BFF scope profile", () => {
    expect(authSource).toContain("subject_token: this.binding.agentApiKey");
    expect(authSource).not.toContain("Bearer ${this.binding.agentApiKey}");
    for (const scope of [
      "ledger:read",
      "wiki:read",
      "raw:read",
      "raw:write",
      "policy:read",
      "execution:read",
      "execution:propose",
      "payment_intent:propose",
      "audit:read",
    ]) {
      expect(authSource).toContain(`"${scope}"`);
    }
    expect(authSource).not.toContain('"payment_intent:approve",');
    expect(authSource).not.toContain('"payment_intent:execute",');
  });

  it("gates readiness on migration, exchange preflight, denial, and lifecycle proof", () => {
    const migrate = indexSource.indexOf("await migrateConfiguredAgentApiKeyBatch()");
    const preflight = indexSource.indexOf("await preflightStoredAgentApiKeys()");
    const listen = indexSource.indexOf("httpServer.listen");
    expect(migrate).toBeGreaterThan(0);
    expect(preflight).toBeGreaterThan(migrate);
    expect(listen).toBeGreaterThan(preflight);
    expect(migrationSource).toContain("direct.status !== 401");
    expect(migrationSource).toContain("approve.status !== 403");
    expect(migrationSource).toContain('event.action === "payment_intent.created"');
    expect(migrationSource).toContain('lifecycle: "completed"');
    expect(migrationSource).toContain("rollback_marker: false");
  });
});
