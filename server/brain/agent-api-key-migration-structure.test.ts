import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AGENT_API_KEY_MIGRATION_BATCH,
  LEGACY_ROLLBACK_JWT_REVOCATION_DEADLINE_ISO,
  LEGACY_ROLLBACK_JWT_REVOCATION_DEADLINE_MS,
  PROTECTED_AGENT_API_KEY_MIGRATION_TENANT_IDS,
} from "./agentApiKeyMigrationBatch";

const authSource = readFileSync(new URL("./agentApiKey.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("./agentApiKeyMigration.ts", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
const tenancySource = readFileSync(new URL("./tenancy.ts", import.meta.url), "utf8");

describe("Phase 3 BFF migration structure", () => {
  it("limits each reviewed production batch to five unique tenant ids", () => {
    expect(AGENT_API_KEY_MIGRATION_BATCH).toEqual([]);
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

  it("keeps the withdrawn demo tenant out of the manifest", () => {
    // Withdrawn in review: access_stage=demo, data_profile=synthetic_brightline_v1,
    // and its legacy agent JWT expired 2026-09-03 so it had no working rollback.
    expect(AGENT_API_KEY_MIGRATION_BATCH).not.toContain("tnt_01M1MDWXR5K5NBQYF089D4ZKCN");
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
    expect(migrationSource).toContain("denial.status === 403");
  });

  it("verifies without mutating the tenant's ledger", () => {
    // The verifier must not create a PaymentIntent, or any other durable record,
    // to prove scope denial - there is no delete path for the evidence it leaves.
    for (const mutatingCall of [
      "proposeInvoicePayment",
      "listLedgerInvoices",
      "getPaymentIntent",
      "listAuditEvents",
      "payment_intent.created",
      "scenario",
      // The all-zero-intent approve probe was still a POST to a mutation route.
      "UNASSIGNED_PAYMENT_INTENT_ID",
      "pi_00000000000000000000000000",
      "/approve",
    ]) {
      expect(migrationSource).not.toContain(mutatingCall);
    }
    expect(migrationSource).toContain('"/authz/probes/payment-intent-approve"');
    // A 204 from the probe means the credential HOLDS the scope; it is a failure.
    expect(migrationSource).toContain("denial.status === 204");
  });

  it("reports each verification result as an observation, never a constant", () => {
    for (const field of [
      "exchange_verified: exchangeVerified",
      "scope_denial_verified: scopeDenialVerified",
      "key_lifecycle_verified: keyLifecycleVerified",
      "runtime_binding_verified: runtimeBindingVerified",
    ]) {
      expect(migrationSource).toContain(field);
    }
    // The retired receipt hardcoded its own success.
    expect(migrationSource).not.toContain('lifecycle: "completed"');
    expect(migrationSource).not.toContain("rollback_marker: false");
  });

  it("fails closed when brain-core cannot confirm a tenant is not demo-seeded", () => {
    expect(migrationSource).toContain("await assertTenantIsNotDemoSeeded(tenantId)");
    expect(migrationSource).toContain("getTenantProvenance");
    // Authority is the provenance endpoint, not the bearer-auth tenant read.
    expect(tenancySource).toContain("/provenance`");
    // Unknown must be a refusal, not a pass. Null is the live unknown: production
    // returns null classification for every pre-classification tenant.
    expect(migrationSource).toContain('provenance.kind !== "production"');
    expect(migrationSource).toContain('typeof provenance.data_profile !== "string"');
    expect(migrationSource).toContain("PRODUCTION_ACCESS_STAGES.has(provenance.access_stage)");
    expect(migrationSource).toContain("provenance.demo_seed");
    // The gate runs before any credential is issued.
    expect(migrationSource.indexOf("await assertTenantIsNotDemoSeeded(tenantId)")).toBeLessThan(
      migrationSource.indexOf("await issueBffAgentApiKey("),
    );
  });

  it("closes the legacy-JWT rollback path at the published deadline", () => {
    expect(LEGACY_ROLLBACK_JWT_REVOCATION_DEADLINE_ISO).toBe("2026-09-16T23:59:59Z");
    expect(Number.isFinite(LEGACY_ROLLBACK_JWT_REVOCATION_DEADLINE_MS)).toBe(true);
    expect(migrationSource).toContain("assertLegacyRollbackWindowOpen(tenantId, legacy, Date.now())");
    expect(
      migrationSource.indexOf("assertLegacyRollbackWindowOpen(tenantId, legacy, Date.now())"),
    ).toBeLessThan(migrationSource.indexOf("await issueBffAgentApiKey("));
    // Rollback re-checks the window instead of trusting the pre-flight decision.
    expect(migrationSource).toContain("legacyRollbackWindowClosure(legacy, Date.now(), 0)");
    // Refusals and cleanup behaviour are witnessed in agent-api-key-migration.test.ts.
  });
});
