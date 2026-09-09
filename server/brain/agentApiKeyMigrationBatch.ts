/** Phase 3 tenants that require an individually approved migration. */
export const PROTECTED_AGENT_API_KEY_MIGRATION_TENANT_IDS: readonly string[] = [
  "tnt_01M0KHRVY3RT3EXN7WT2SPDFMZ", // Northstar
  "tnt_00000000010000000000000000", // golden demo
  "tnt_01KYAT7A1QRKHTYW9H4RAR2SEX", // Continue with Demo shared tenant
  "tnt_01M1GTBQN8R8PB6X6PN73YB6NP", // RFC 0008 acceptance tenant
];

/**
 * Phase 3 rollout manifest. Add at most five verified tenant ids per reviewed batch.
 * Batch 1 is intentionally canary-sized because only this non-protected tenant has
 * the payable fixture required by the production lifecycle verifier.
 */
export const AGENT_API_KEY_MIGRATION_BATCH: readonly string[] = [
  "tnt_01M1MDWXR5K5NBQYF089D4ZKCN",
];
