import { randomUUID } from "node:crypto";
import { storage } from "../storage";
import { brainConfig } from "./config";
import {
  BFF_SERVICE_AGENT_SCOPES,
  getAgentAccessToken,
  isAgentApiKeyCredential,
  parseAgentAccessTokenClaims,
  type AgentAccessTokenClaims,
} from "./agentApiKey";
import {
  AGENT_API_KEY_MIGRATION_BATCH,
  LEGACY_ROLLBACK_JWT_REVOCATION_DEADLINE_ISO,
  LEGACY_ROLLBACK_JWT_REVOCATION_DEADLINE_MS,
  PROTECTED_AGENT_API_KEY_MIGRATION_TENANT_IDS,
} from "./agentApiKeyMigrationBatch";
import { BUILD_COMMIT } from "../buildInfo";
import { BrainApiError } from "./client";
import {
  getTenantProvenance,
  issueBffAgentApiKey,
  listAgentApiKeys,
  revokeAgentApiKey,
  type TenantProvenanceShape,
} from "./tenancy";

interface LegacyAgentClaims {
  sub: string;
  tenant_id: string;
  principal_type: string;
  exp: number;
}

/**
 * Proof that a migrated tenant's BFF agent API key works, is correctly bound, and
 * cannot exceed its scopes.
 *
 * Every field is an OBSERVATION, not a claim: the four `*_verified` booleans are
 * set from the checks' own results, and each check throws when it does not hold,
 * so a receipt only exists for a tenant where all four were actually observed.
 * Absent evidence is never read as passing evidence - an omitted `revoked_at` or
 * an unrecognised denial reason fails the check.
 *
 * The whole verification is READ-ONLY. It creates no PaymentIntent, writes no
 * ledger data, and leaves no policy or audit evidence behind, so a failed
 * verification needs no cleanup and a successful one changes nothing but the
 * stored credential. The earlier revision proved scope denial by proposing a real
 * payment against a real invoice; that evidence could not be removed afterwards.
 */
interface VerificationReceipt {
  tenant_id: string;
  credential_id: string;
  agent_id: string;
  profile: "bff_service_v1";
  scopes: string[];
  audience: string;
  ttl_seconds: number;
  /** HTTP status of using the raw API key directly as a bearer token (must be 401). */
  direct_key_status: number;
  /** HTTP status of an in-scope read with the exchanged access token (must be 200). */
  in_scope_read_status: number;
  /** HTTP status of the out-of-scope approve probe (must be 403). */
  out_of_scope_status: number;
  /** The denial reason brain-core gave, which must name a scope failure. */
  out_of_scope_reason: string;
  /** The unassigned PaymentIntent id the denial probe targeted. */
  scope_denial_probe_id: string;
  exchange_verified: boolean;
  scope_denial_verified: boolean;
  key_lifecycle_verified: boolean;
  runtime_binding_verified: boolean;
}

/**
 * An all-zero ULID. Syntactically valid, so brain-core routes and authorizes the
 * request normally, but it is not an id brain-core hands out for a real
 * PaymentIntent.
 *
 * This makes the probe safe in practice, NOT by contract: brain-core has not
 * committed to a reserved id space, nor to authorizing before resolving. The
 * verifier therefore also requires an explicit scope denial reason (below), and
 * the runbook tracks "guaranteed side-effect-free authorization surface" as an
 * open upstream ask. Until it lands, treat the probe as unproven, not as safe.
 */
const UNASSIGNED_PAYMENT_INTENT_ID = "pi_00000000000000000000000000";

/**
 * Denial reasons that mean "this credential lacks the required SCOPE".
 *
 * An allowlist, not a substring match: `tenant_scope_denied` contains the word
 * "scope" and is a tenant restriction, which would prove nothing about the
 * credential's scopes. An unrecognised reason fails the check and is printed, so
 * a reason brain-core adds later surfaces as a verification failure to
 * investigate rather than as silent acceptance.
 *
 * UNCONFIRMED CONTRACT: brain-core has not published its reason codes. This set is
 * observed, not documented; confirming it is part of the same upstream ask as the
 * side-effect-free probe surface.
 */
const SCOPE_DENIAL_REASONS = new Set([
  "insufficient_scope",
  "missing_scope",
  "scope_denied",
  "scope_not_granted",
  "invalid_scope",
]);

/** data_profile values that mark a tenant's data as fixture-generated. */
const SYNTHETIC_DATA_PROFILE_PREFIX = "synthetic";

/**
 * A legacy-JWT migration must have a usable rollback for its whole duration, not
 * just at the instant it starts. Requiring this much headroom on both the JWT's
 * own expiry and the revocation deadline keeps a slow issuance or a hung
 * verification from crossing either boundary mid-flight.
 */
const ROLLBACK_WINDOW_MARGIN_MS = 15 * 60 * 1000;

function decodeLegacyAgentClaims(token: string): LegacyAgentClaims {
  const encoded = token.split(".")[1];
  if (token.split(".").length !== 3 || encoded === undefined) {
    throw new Error("stored legacy agent credential is not a JWT");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new Error("stored legacy agent credential has invalid claims");
  }
  const claims = parsed as Partial<LegacyAgentClaims>;
  if (
    claims.principal_type !== "agent" ||
    typeof claims.sub !== "string" ||
    !claims.sub.startsWith("agent_") ||
    typeof claims.tenant_id !== "string" ||
    !claims.tenant_id.startsWith("tnt_") ||
    typeof claims.exp !== "number" ||
    !Number.isInteger(claims.exp)
  ) {
    throw new Error("stored legacy agent credential has the wrong principal binding");
  }
  return claims as LegacyAgentClaims;
}

function validateBatch(): void {
  if (AGENT_API_KEY_MIGRATION_BATCH.length > 5) {
    throw new Error("agent API key migration batch exceeds the five-tenant safety limit");
  }
  const unique = new Set(AGENT_API_KEY_MIGRATION_BATCH);
  if (unique.size !== AGENT_API_KEY_MIGRATION_BATCH.length) {
    throw new Error("agent API key migration batch contains a duplicate tenant id");
  }
  const protectedTenantIds = new Set(PROTECTED_AGENT_API_KEY_MIGRATION_TENANT_IDS);
  for (const tenantId of unique) {
    if (!/^tnt_[0-9A-HJKMNP-TV-Z]{26}$/.test(tenantId)) {
      throw new Error(`agent API key migration batch contains invalid tenant id ${tenantId}`);
    }
    if (protectedTenantIds.has(tenantId)) {
      throw new Error(
        `agent API key migration batch contains protected tenant id ${tenantId}`,
      );
    }
  }
}

function resourceUrl(): string {
  return `${new URL(brainConfig.baseUrl).origin}/`;
}

/** Pull brain-core's rejection reason out of either error body shape it uses. */
function denialReasonOf(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const shape = body as { reason?: unknown; error?: unknown };
  if (typeof shape.reason === "string" && shape.reason.length > 0) return shape.reason;
  if (typeof shape.error === "string" && shape.error.length > 0) return shape.error;
  if (typeof shape.error === "object" && shape.error !== null) {
    const code = (shape.error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return undefined;
}

/**
 * Refuse to issue a production BFF credential for a demo or fixture-seeded tenant.
 *
 * Authority is brain-core's own provenance record, never a local id allowlist: a
 * hardcoded exclusion list only knows the demo tenants somebody remembered. Every
 * unknown answer - read unavailable, response about a different tenant, field
 * absent, field the wrong type - is a refusal, because "we could not tell" and
 * "it is a real tenant" must never produce the same outcome.
 */
async function assertTenantIsNotDemoSeeded(tenantId: string): Promise<void> {
  let provenance: TenantProvenanceShape;
  try {
    provenance = await getTenantProvenance(tenantId);
  } catch (error) {
    throw new Error(
      `cannot confirm tenant ${tenantId} is not demo-seeded: brain-core provenance read failed. ` +
        `Refusing to migrate rather than assume it is a production tenant.`,
      { cause: error },
    );
  }
  if (typeof provenance !== "object" || provenance === null) {
    throw new Error(`brain-core provenance for ${tenantId} was not an object; refusing to migrate`);
  }
  // A record about some other tenant proves nothing about this one.
  if (provenance.tenant_id !== tenantId) {
    throw new Error(
      `brain-core provenance response identifies ${String(provenance.tenant_id)}, not ${tenantId}; ` +
        `refusing to migrate`,
    );
  }
  if (typeof provenance.demo_seed !== "boolean") {
    throw new Error(
      `brain-core provenance for ${tenantId} carries no demo_seed flag, so demo status is unknown. ` +
        `Refusing to migrate.`,
    );
  }
  if (provenance.demo_seed) {
    throw new Error(`tenant ${tenantId} was created with demo_seed:true and must not be migrated`);
  }
  // Absent is unknown. Only an explicitly reported profile/stage can clear a tenant.
  // Malformed is as unknown as absent: a number, an object or "" tells us nothing
  // about whether the data is synthetic, so neither may clear the tenant.
  if (typeof provenance.data_profile !== "string" || provenance.data_profile.length === 0) {
    throw new Error(
      `brain-core provenance for ${tenantId} reports no usable data_profile, so synthetic data ` +
        `cannot be ruled out. Refusing to migrate.`,
    );
  }
  if (provenance.data_profile.startsWith(SYNTHETIC_DATA_PROFILE_PREFIX)) {
    throw new Error(
      `tenant ${tenantId} carries synthetic data profile ${provenance.data_profile} and must not be migrated`,
    );
  }
  if (typeof provenance.access_stage !== "string" || provenance.access_stage.length === 0) {
    throw new Error(
      `brain-core provenance for ${tenantId} reports no access_stage, so demo access cannot be ` +
        `ruled out. Refusing to migrate.`,
    );
  }
  if (provenance.access_stage === "demo") {
    throw new Error(`tenant ${tenantId} is at access_stage=demo and must not be migrated`);
  }
}

/**
 * Whether a legacy-JWT tenant still has a rollback worth relying on: the JWT is
 * valid and the revocation deadline is ahead, both by `marginMs`. After the
 * deadline brain-core revokes these JWTs, so restoring one would hand the tenant a
 * dead credential - a rollback that looks like it worked and does not.
 */
function legacyRollbackWindowClosure(
  legacy: LegacyAgentClaims,
  now: number,
  marginMs: number,
): string | undefined {
  if (now + marginMs >= LEGACY_ROLLBACK_JWT_REVOCATION_DEADLINE_MS) {
    return `the legacy agent JWT rollback window closes at ${LEGACY_ROLLBACK_JWT_REVOCATION_DEADLINE_ISO}`;
  }
  if (legacy.exp * 1000 <= now + marginMs) {
    return `the stored legacy agent JWT expires at ${new Date(legacy.exp * 1000).toISOString()}`;
  }
  return undefined;
}

function assertLegacyRollbackWindowOpen(
  tenantId: string,
  legacy: LegacyAgentClaims,
  now: number,
): void {
  const closure = legacyRollbackWindowClosure(legacy, now, ROLLBACK_WINDOW_MARGIN_MS);
  if (closure !== undefined) {
    throw new Error(
      `refusing to migrate ${tenantId} through the legacy path: ${closure}, which leaves no ` +
        `dependable rollback for the duration of the migration`,
    );
  }
}

async function verifyLifecycle(
  tenantId: string,
  agentApiKey: string,
  exchanged: { token: string; claims: AgentAccessTokenClaims },
): Promise<VerificationReceipt> {
  const resource = resourceUrl();
  const { token: accessToken, claims } = exchanged;
  // Verification calls fetch directly rather than going through the 401-retry
  // helper: the helper transparently swaps in a refreshed token, so a 200 would
  // not be evidence about the token under test.
  const authed = (path: string, init: RequestInit = {}): Promise<Response> =>
    fetch(`${brainConfig.baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${accessToken}`,
        "X-Request-Id": randomUUID(),
      },
    });

  // 1. The raw API key is exchange-only: it must not authenticate an API call.
  const direct = await fetch(`${brainConfig.baseUrl}/ledger/accounts`, {
    headers: { Authorization: `Bearer ${agentApiKey}`, Accept: "application/json" },
  });
  if (direct.status !== 401) {
    throw new Error(`direct agent API key use returned HTTP ${direct.status}, expected 401`);
  }

  // 2. The exchanged access token carries exactly the BFF binding we asked for AND
  //    is actually accepted by the resource server. Re-decoding the token only
  //    proves what it says about itself, so an in-scope read (ledger:read) has to
  //    succeed too. The read is a GET: it observes, it does not change anything.
  const revalidated = parseAgentAccessTokenClaims(accessToken, { tenantId, resource });
  const inScopeRead = await authed("/ledger/accounts", {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const exchangeVerified =
    revalidated.credential_id === claims.credential_id &&
    revalidated.sub === claims.sub &&
    revalidated.tenant_id === tenantId &&
    revalidated.aud === resource &&
    inScopeRead.status === 200;
  if (!exchangeVerified) {
    throw new Error(
      `exchanged access token is not usable for ${tenantId}: claims match ` +
        `${String(revalidated.credential_id === claims.credential_id)}, in-scope read returned ` +
        `HTTP ${inScopeRead.status} (expected 200)`,
    );
  }

  // 3. Scope denial, proved without creating anything: approving an unassigned
  //    PaymentIntent id must be refused FOR LACK OF SCOPE. A bare 403 is not
  //    enough - a policy or tenant refusal is also a 403 and would prove nothing
  //    about scope - so the reason has to name the scope failure. A 404 would mean
  //    core resolved the intent before authorizing, leaving denial unproven; we
  //    report that instead of falling back to a real payment.
  const denial = await authed(
    `/payment-intents/${encodeURIComponent(UNASSIGNED_PAYMENT_INTENT_ID)}/approve`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
  );
  const denialText = await denial.text();
  let denialBody: unknown;
  try {
    denialBody = denialText ? JSON.parse(denialText) : {};
  } catch {
    denialBody = { raw: denialText };
  }
  const denialReason = denialReasonOf(denialBody) ?? "";
  const scopeDenialVerified =
    denial.status === 403 && SCOPE_DENIAL_REASONS.has(denialReason.trim().toLowerCase());
  if (!scopeDenialVerified) {
    throw new Error(
      `out-of-scope approval probe returned HTTP ${denial.status} reason ` +
        `${denialReason.length > 0 ? denialReason : "(none)"}, expected 403 with a recognised ` +
        `insufficient-scope reason (${[...SCOPE_DENIAL_REASONS].join(", ")}). Scope denial is ` +
        `unproven for ${tenantId}; do not substitute a mutating probe.`,
    );
  }

  // 4. The issued key record itself is a live, unrevoked, correctly scoped BFF key.
  //    `revoked_at` and `last_used_at` must be PRESENT: an omitted field is an
  //    unknown, and an unknown revocation state is not an unrevoked key.
  const keys = await listAgentApiKeys(tenantId);
  const key = keys.keys.find((candidate) => candidate.id === claims.credential_id);
  const keyLifecycleVerified =
    key !== undefined &&
    key.profile === "bff_service_v1" &&
    key.agent_id === claims.sub &&
    key.tenant_id === tenantId &&
    key.environment === "live" &&
    "revoked_at" in key &&
    key.revoked_at === null &&
    typeof key.last_used_at === "string" &&
    Number.isFinite(Date.parse(key.last_used_at)) &&
    typeof key.expires_at === "string" &&
    Date.parse(key.expires_at) > Date.now() &&
    key.scopes.length === BFF_SERVICE_AGENT_SCOPES.length &&
    BFF_SERVICE_AGENT_SCOPES.every((scope) => key.scopes.includes(scope));
  if (!keyLifecycleVerified) {
    throw new Error("effective BFF agent API key profile does not match the required binding");
  }

  // 5. The runtime row the app will actually read holds THIS key, not merely some
  //    string that looks like an API key.
  const stored = await storage.getBrainAgentToken(tenantId);
  const runtimeBindingVerified = stored !== undefined && stored.token === agentApiKey;
  if (!runtimeBindingVerified) {
    throw new Error("runtime credential row does not contain the migrated agent API key");
  }

  return {
    tenant_id: tenantId,
    credential_id: claims.credential_id,
    agent_id: claims.sub,
    profile: "bff_service_v1",
    scopes: [...claims.scopes],
    audience: claims.aud,
    ttl_seconds: claims.exp - claims.iat,
    direct_key_status: direct.status,
    in_scope_read_status: inScopeRead.status,
    out_of_scope_status: denial.status,
    out_of_scope_reason: denialReason,
    scope_denial_probe_id: UNASSIGNED_PAYMENT_INTENT_ID,
    exchange_verified: exchangeVerified,
    scope_denial_verified: scopeDenialVerified,
    key_lifecycle_verified: keyLifecycleVerified,
    runtime_binding_verified: runtimeBindingVerified,
  };
}

/**
 * Undo a failed migration.
 *
 * The order matters and depends on what actually happened. The issued key may only
 * be revoked once the runtime row has stopped pointing at it, or the tenant is
 * left holding a revoked credential:
 *
 * - The row was never repointed (`persistedIssuedKey` false, e.g. issuance
 *   succeeded but the exchange failed): nothing to restore, and the key is
 *   unreferenced, so revoke it. This is the only path that prevents an orphan.
 * - The row was repointed and the rollback window is still open: restore the
 *   legacy JWT first, then revoke.
 * - The row was repointed and the window has closed: the legacy JWT is dead, so
 *   restoring it would swap a working credential for a broken one. Leave the
 *   issued key in place *unrevoked* and escalate.
 *
 * Every path that ends with a live unreferenced key logs a loud, greppable
 * escalation, because that is the state a human has to clean up.
 */
async function rollbackTenant(
  tenantId: string,
  legacy: LegacyAgentClaims,
  legacyToken: string,
  legacyExpiresAt: Date,
  issuedKeyId: string,
  persistedIssuedKey: boolean,
): Promise<void> {
  if (persistedIssuedKey) {
    const closure = legacyRollbackWindowClosure(legacy, Date.now(), 0);
    if (closure !== undefined) {
      console.error(
        `[brain-agent-migration] MANUAL REPAIR REQUIRED tenant_id=${tenantId} ` +
          `credential_id=${issuedKeyId}: verification failed and rollback is impossible because ` +
          `${closure}. The runtime row still points at the newly issued key, which is IN USE and ` +
          `was deliberately NOT revoked.`,
      );
      return;
    }
    try {
      await storage.upsertBrainAgentToken(tenantId, legacyToken, legacyExpiresAt);
    } catch (error) {
      console.error(
        `[brain-agent-migration] MANUAL REPAIR REQUIRED tenant_id=${tenantId} ` +
          `credential_id=${issuedKeyId}: could not restore the legacy credential (${String(error)}). ` +
          `The runtime row still points at the issued key, which is IN USE and was NOT revoked.`,
      );
      return;
    }
  }
  try {
    await revokeAgentApiKey(issuedKeyId);
  } catch (error) {
    console.error(
      `[brain-agent-migration] ORPHANED CREDENTIAL tenant_id=${tenantId} ` +
        `credential_id=${issuedKeyId}: the runtime row no longer references this key but revoking ` +
        `it failed (${String(error)}). Revoke it by hand.`,
    );
    return;
  }
  console.error(
    `[brain-agent-migration] rollback tenant_id=${tenantId} credential_id=${issuedKeyId} ` +
      `restored_runtime_row=${persistedIssuedKey}`,
  );
}

/** Exported for the behavioural tests in agent-api-key-migration.test.ts. */
export async function migrateTenant(tenantId: string): Promise<VerificationReceipt> {
  const row = await storage.getBrainAgentToken(tenantId);
  if (row === undefined) throw new Error(`tenant ${tenantId} has no stored BFF agent credential`);

  await assertTenantIsNotDemoSeeded(tenantId);

  let agentApiKey = row.token;
  if (!isAgentApiKeyCredential(agentApiKey)) {
    const legacy = decodeLegacyAgentClaims(row.token);
    if (legacy.tenant_id !== tenantId) {
      throw new Error(`stored BFF agent JWT for ${tenantId} is bound to another tenant`);
    }
    assertLegacyRollbackWindowOpen(tenantId, legacy, Date.now());
    const issued = await issueBffAgentApiKey(
      tenantId,
      legacy.sub,
      `phase3-bff-issue-${tenantId}-${BUILD_COMMIT.slice(0, 12)}`,
    );
    // From here on the key EXISTS upstream, so every failure path must clean it
    // up - including the binding, expiry and exchange checks below. Rollback needs
    // to know whether the runtime row was ever repointed at it, because that
    // decides whether revoking is safe.
    let persistedIssuedKey = false;
    try {
      if (
        !isAgentApiKeyCredential(issued.api_key) ||
        issued.tenant_id !== tenantId ||
        issued.agent_id !== legacy.sub ||
        issued.profile !== "bff_service_v1" ||
        issued.environment !== "live"
      ) {
        throw new Error("agent API key issuance returned an invalid BFF binding");
      }
      agentApiKey = issued.api_key;
      const expiry = new Date(issued.expires_at);
      if (!Number.isFinite(expiry.getTime())) {
        throw new Error("agent API key issuance returned an invalid expiry");
      }
      const exchanged = await getAgentAccessToken({
        tenantId,
        agentApiKey,
        tokenUrl: brainConfig.agentTokenUrl,
        resource: resourceUrl(),
      });
      if (exchanged.claims.sub !== legacy.sub || exchanged.claims.credential_id !== issued.id) {
        throw new Error("exchanged access token does not match the issued BFF credential");
      }
      await storage.upsertBrainAgentToken(tenantId, agentApiKey, expiry);
      persistedIssuedKey = true;
      return await verifyLifecycle(tenantId, agentApiKey, exchanged);
    } catch (error) {
      await rollbackTenant(
        tenantId,
        legacy,
        row.token,
        row.expiresAt,
        issued.id,
        persistedIssuedKey,
      );
      throw error;
    }
  }

  const exchanged = await getAgentAccessToken({
    tenantId,
    agentApiKey,
    tokenUrl: brainConfig.agentTokenUrl,
    resource: resourceUrl(),
  });
  return verifyLifecycle(tenantId, agentApiKey, exchanged);
}

export async function migrateConfiguredAgentApiKeyBatch(): Promise<VerificationReceipt[]> {
  validateBatch();
  if (AGENT_API_KEY_MIGRATION_BATCH.length === 0) return [];
  if (process.env.NODE_ENV !== "production") {
    throw new Error("agent API key migration manifest is only allowed in production");
  }
  const receipts: VerificationReceipt[] = [];
  for (const tenantId of AGENT_API_KEY_MIGRATION_BATCH) {
    try {
      const receipt = await migrateTenant(tenantId);
      receipts.push(receipt);
      console.log(`[brain-agent-migration] verified ${JSON.stringify(receipt)}`);
    } catch (error) {
      if (error instanceof BrainApiError) {
        throw new Error(
          `BFF lifecycle verification failed for ${tenantId} with HTTP ${error.status} on ${error.path}`,
          { cause: error },
        );
      }
      throw error;
    }
  }
  return receipts;
}
