import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AGENT_API_KEY_MIGRATION_BATCH,
  PROTECTED_AGENT_API_KEY_MIGRATION_TENANT_IDS,
} from "./agentApiKeyMigrationBatch";

const authSource = readFileSync(new URL("./agentApiKey.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("./agentApiKeyMigration.ts", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../index.ts", import.meta.url), "utf8");

describe("Phase 3 BFF migration structure", () => {
  it("limits each reviewed production batch to five unique tenant ids", () => {
    expect(AGENT_API_KEY_MIGRATION_BATCH).toEqual([
      "tnt_01M1MDWXR5K5NBQYF089D4ZKCN",
    ]);
    expect(AGENT_API_KEY_MIGRATION_BATCH.length).toBeLessThanOrEqual(5);
    expect(new Set(AGENT_API_KEY_MIGRATION_BATCH).size).toBe(
      AGENT_API_KEY_MIGRATION_BATCH.length,
    );
    for (const tenantId of AGENT_API_KEY_MIGRATION_BATCH) {
      expect(tenantId).toMatch(/^tnt_[0-9A-HJKMNP-TV-Z]{26}$/);
    }
  });

  it("excludes every protected tenant from reviewed production batches", () => {
    expect(PROTECTED_AGENT_API_KEY_MIGRATION_TENANT_IDS).toEqual([
      "tnt_01M0KHRVY3RT3EXN7WT2SPDFMZ",
      "tnt_00000000010000000000000000",
      "tnt_01KYAT7A1QRKHTYW9H4RAR2SEX",
      "tnt_01M1GTBQN8R8PB6X6PN73YB6NP",
    ]);
    const protectedTenantIds = new Set(PROTECTED_AGENT_API_KEY_MIGRATION_TENANT_IDS);
    expect(
      AGENT_API_KEY_MIGRATION_BATCH.filter((tenantId) => protectedTenantIds.has(tenantId)),
    ).toEqual([]);
    expect(migrationSource).toContain("protectedTenantIds.has(tenantId)");
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
    expect(migrationSource).toContain('candidate.metadata?.scenario !== "ar"');
    expect(migrationSource).not.toContain('candidate.metadata?.scenario === "ap"');
    expect(migrationSource).toContain("approve.status !== 403");
    expect(migrationSource).toContain('event.action === "payment_intent.created"');
    expect(migrationSource).toContain('lifecycle: "completed"');
    expect(migrationSource).toContain("rollback_marker: false");
  });
});
