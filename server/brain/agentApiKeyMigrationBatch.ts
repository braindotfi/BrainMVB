/** Phase 3 tenants that require an individually approved migration. */
export const PROTECTED_AGENT_API_KEY_MIGRATION_TENANT_IDS: readonly string[] = [
  "tnt_01M0KHRVY3RT3EXN7WT2SPDFMZ", // Northstar
  "tnt_00000000010000000000000000", // golden demo
  "tnt_01KYAT7A1QRKHTYW9H4RAR2SEX", // Continue with Demo shared tenant
  "tnt_01M1GTBQN8R8PB6X6PN73YB6NP", // RFC 0008 acceptance tenant
];

/**
 * Hard deadline for revoking the legacy agent JWTs that back the migration's
 * rollback path (2026-09-16T23:59:59Z).
 *
 * Enforcement is split and neither half is optional:
 *  - brain-core revokes the legacy agent JWTs at this instant. That revocation
 *    is the only thing that actually invalidates them; nothing in this BFF can.
 *  - this BFF refuses to START a migration that would depend on a legacy-JWT
 *    rollback at or after the deadline (see assertLegacyRollbackWindowOpen).
 *    Past the deadline a rollback would restore a credential brain-core has
 *    revoked, so the migration has no recovery path and must not run.
 *
 * See docs/ops/phase3-bff-agent-key-migration.md.
 */
export const LEGACY_ROLLBACK_JWT_REVOCATION_DEADLINE_ISO = "2026-09-16T23:59:59Z";
export const LEGACY_ROLLBACK_JWT_REVOCATION_DEADLINE_MS = Date.parse(
  LEGACY_ROLLBACK_JWT_REVOCATION_DEADLINE_ISO,
);

/**
 * Phase 3 rollout manifest. Add at most five verified tenant ids per reviewed batch.
 *
 * Batch 1 is EMPTY on purpose. Its only candidate,
 * tnt_01M1MDWXR5K5NBQYF089D4ZKCN, was withdrawn after review found it is a demo
 * tenant carrying synthetic fixture data, and that its stored legacy agent JWT
 * expired on 2026-09-03 — so it had no working rollback either. A tenant may only
 * be added here once brain-core provenance confirms it is not demo-seeded; the
 * verifier re-checks that at runtime and fails closed.
 */
export const AGENT_API_KEY_MIGRATION_BATCH: readonly string[] = [];
