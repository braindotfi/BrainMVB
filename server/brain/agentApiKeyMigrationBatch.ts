/** Phase 3 tenants that require an individually approved migration. */
export const PROTECTED_AGENT_API_KEY_MIGRATION_TENANT_IDS: readonly string[] = [
  "tnt_01M0KHRVY3RT3EXN7WT2SPDFMZ", // Northstar
  "tnt_00000000010000000000000000", // golden demo
  "tnt_01KYAT7A1QRKHTYW9H4RAR2SEX", // Continue with Demo shared tenant
  "tnt_01M1GTBQN8R8PB6X6PN73YB6NP", // RFC 0008 acceptance tenant
];

/**
 * Individually approved Northstar migration. This tenant stays protected from
 * every ordinary batch; the values below only fence the separate manual path.
 * Dubai is UTC+04:00 on this date, so 12:00-15:00 is 08:00-11:00 UTC.
 */
export const NORTHSTAR_AGENT_API_KEY_MIGRATION_TENANT_ID =
  "tnt_01M0KHRVY3RT3EXN7WT2SPDFMZ";
export const NORTHSTAR_AGENT_API_KEY_MIGRATION_WINDOW_START_ISO =
  "2026-09-12T08:00:00Z";
export const NORTHSTAR_AGENT_API_KEY_MIGRATION_WINDOW_END_ISO =
  "2026-09-12T11:00:00Z";
export const NORTHSTAR_AGENT_API_KEY_MIGRATION_AUTHORIZATION =
  "APPROVE_NORTHSTAR_2026_09_12_NO_LEGACY_ROLLBACK";

/**
 * The instant the legacy agent JWTs backing this migration's rollback path stop
 * working (2026-09-16T23:59:59Z).
 *
 * This mirrors brain-core's `LEGACY_AGENT_JWT_NOT_AFTER`, which is enforced in
 * production. It is not a date this repo chose or can move. At and after that
 * boundary brain-core:
 *  - rejects any agent JWT that carries no `credential_id` - which is every
 *    legacy agent JWT, since `credential_id` is what the exchange-only API keys
 *    introduced; and
 *  - answers 410 Gone on POST /v1/tenants/{id}/agent-token, so a fresh legacy
 *    JWT cannot be minted either.
 *
 * Both halves matter to rollback. Restoring a legacy JWT past the boundary hands
 * the tenant a credential brain-core will reject, and re-minting is not a way
 * out. So this BFF refuses to START a migration whose rollback would fall at or
 * after the boundary (assertLegacyRollbackWindowOpen), and rollback re-checks it
 * rather than trusting that pre-flight decision.
 *
 * Note for anyone reading this after the boundary: the same enforcement retires
 * the agent-token mint that server/brain/auth.ts uses as a backfill. That path
 * will start returning 410 and needs its own follow-up; it is not part of this
 * migration.
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
