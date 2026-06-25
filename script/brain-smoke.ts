/**
 * brain-core integration smoke test.
 *
 *   tsx script/brain-smoke.ts
 *
 * Proves the BFF can authenticate to the live brain-core (api.brain.fi) and read
 * from it, BEFORE any UI is wired. This is the go/no-go gate for the slice.
 *
 * Requires env:
 *   BRAIN_AUTH_SIGN_KEY   private signing JWK (JSON) — the box's key
 *   BRAIN_DEV_TENANT_ID   the seeded tenant to read
 *   BRAIN_API_BASE_URL    (optional) defaults to https://api.brain.fi/v1
 *
 * A 401/403 means the JWT shape or signing key is wrong (compare against
 * brain-core/shared/src/auth/jwt.ts). A network error means BRAIN_API_BASE_URL
 * is unreachable.
 */

import { brainConfig, brainAuthConfigured } from "../server/brain/config";
import { getBrainSession } from "../server/brain/auth";
import { getWikiSchema, listLedgerAccounts, BrainApiError } from "../server/brain/client";

async function main(): Promise<void> {
  console.warn(`[smoke] target: ${brainConfig.baseUrl}`);

  if (!brainAuthConfigured()) {
    fail("no token source configured — set BRAIN_DEMO_PROVISION_SECRET (preferred) or BRAIN_AUTH_SIGN_KEY.");
  }

  console.warn("[smoke] obtaining a brain-core session...");
  const { token, tenantId } = await getBrainSession("smoke-test");
  console.warn(`[smoke] session for tenant=${tenantId}`);

  // 1) wiki/schema → a read-auth smoke: must return a non-empty schema object.
  const schema = await getWikiSchema(token);
  if (typeof schema !== "object" || schema === null || Object.keys(schema).length === 0) {
    fail("/wiki/schema returned an empty/invalid response");
  }
  console.warn("[smoke] ✓ /wiki/schema OK (authenticated read succeeded)");

  // 2) ledger/accounts → assert 200 and report count.
  const accounts = await listLedgerAccounts(token, { limit: 50 });
  console.warn(`[smoke] ✓ /ledger/accounts OK (${accounts.accounts.length} accounts)`);
  for (const a of accounts.accounts.slice(0, 8)) {
    console.warn(`         - ${a.name} [${a.account_type}] ${a.current_balance ?? "?"} ${a.currency}`);
  }

  console.warn("[smoke] PASS");
}

function fail(msg: string): never {
  console.error(`[smoke] FAIL: ${msg}`);
  process.exit(1);
}

main().catch((err: unknown) => {
  if (err instanceof BrainApiError) {
    console.error(`[smoke] FAIL: ${err.message}`);
    console.error(`        body: ${JSON.stringify(err.body)}`);
    if (err.status === 401 || err.status === 403) {
      console.error("        → signing key or JWT claims rejected. Check BRAIN_AUTH_SIGN_KEY / iss / aud.");
    }
  } else {
    console.error("[smoke] FAIL:", err instanceof Error ? err.message : err);
  }
  process.exit(1);
});
