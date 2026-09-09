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
 * Every request the verification makes is a GET. It creates no PaymentIntent,
 * writes no ledger data, and leaves no policy or audit evidence behind, so a
 * failed verification needs no cleanup and a successful one changes nothing but
 * the stored credential. The first revision proved scope denial by proposing a
 * real payment against a real invoice; that evidence could not be removed
 * afterwards. The second approved an all-zero PaymentIntent id, which was a write
 * that happened to resolve to nothing. Both are gone.
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
  /** HTTP status of the out-of-scope authorization probe (must be 403, never 204). */
  out_of_scope_status: number;
  /** The denial reason brain-core gave, which must name a scope failure. */
  out_of_scope_reason: string;
  /** The authorization probe the denial was observed against. */
  scope_denial_probe: string;
  exchange_verified: boolean;
  scope_denial_verified: boolean;
  key_lifecycle_verified: boolean;
  runtime_binding_verified: boolean;
}

/**
 * brain-core's dedicated authorization probe: it answers whether the calling
 * credential could approve a PaymentIntent, WITHOUT calling the payment-intent
 * domain service and without touching a real intent.
 *
 *   403 + auth_scope_insufficient -> the credential lacks the scope (what a
 *                                    correctly bound BFF key must return)
 *   204 No Content                -> the credential HOLDS the scope, which for a
 *                                    BFF key is a failure, not a pass
 *
 * This replaces the previous probe, which approved an all-zero PaymentIntent id:
 * safe only because that id resolves to nothing, and only for as long as
 * brain-core authorized before resolving. A GET against a purpose-built probe
 * needs neither assumption.
 */
const SCOPE_DENIAL_PROBE_PATH = "/authz/probes/payment-intent-approve";

/**
 * Denial reasons that mean "this credential lacks the required SCOPE".
 *
 * An allowlist, not a substring match: `tenant_scope_denied` contains the word
 * "scope" and is a tenant restriction, which would prove nothing about the
 * credential's scopes. An unrecognised reason fails the check and is printed, so
 * a reason brain-core adds later surfaces as a verification failure to
 * investigate rather than as silent acceptance.
 *
 * `auth_scope_insufficient` is the code brain-core documents for the probe surface
 * and matches its live error-code style (`auth_token_missing`,
 * `auth_token_invalid`). The rest are retained so a differently-worded denial from
 * an older deployment is still read as a scope denial rather than as a mystery.
 */
const SCOPE_DENIAL_REASONS = new Set([
  "auth_scope_insufficient",
  "insufficient_scope",
  "missing_scope",
  "scope_denied",
  "scope_not_granted",
  "invalid_scope",
]);

/** data_profile values that mark a tenant's data as fixture-generated. */
const SYNTHETIC_DATA_PROFILE_PREFIX = "synthetic";

/**
 * Additional data_profile values that are not production data.
 *
 * A denylist here, unlike access_stage below, because the production side of this
 * field is open-ended: brain-core reports things like "synthetic_brightline_v1",
 * and there is no published set of real-customer profiles to allowlist against. A
 * profile that is neither empty nor recognised as fixture data therefore passes
 * this check, so the operator adding a tenant to the manifest must read the
 * logged provenance record rather than rely on the gate alone.
 */
const NON_PRODUCTION_DATA_PROFILES = new Set(["demo", "fixture", "sample", "seed", "test"]);

/** provisioning_state values that mean the tenant came up a demo. */
const DEMO_PROVISIONING_STATES = new Set(["ready_demo", "provisioning_demo", "demo"]);

/**
 * access_stage values that mean "a real production tenant".
 *
 * UNCONFIRMED CONTRACT: brain-core has not published this vocabulary. The only
 * value observed live is "demo". Allowlisting one value is deliberately strict -
 * it holds a tenant back rather than clearing one on a stage nobody has defined -
 * and the refusal prints what was actually returned so the set can be widened on
 * evidence.
 */
const PRODUCTION_ACCESS_STAGES = new Set(["production"]);

/** Render a provenance value for an operator: null and undefined must not read alike. */
function describeProvenanceValue(value: unknown): string {
  if (value === null) return "null (unclassified)";
  if (value === undefined) return "absent";
  if (typeof value === "string") return value.length === 0 ? '"" (empty)' : value;
  return `${typeof value} (malformed)`;
}

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
 * Refuse to issue a production BFF credential for a demo, fixture-seeded, or
 * UNCLASSIFIED tenant.
 *
 * Authority is brain-core's own provenance record, never a local id allowlist: a
 * hardcoded exclusion list only knows the demo tenants somebody remembered. Every
 * unknown answer - read unavailable, response about a different tenant, field
 * absent, field null, field the wrong type - is a refusal, because "we could not
 * tell" and "it is a real tenant" must never produce the same outcome.
 *
 * Null is the important case, not a corner case. Production returns
 * `data_profile: null, access_stage: null` for every tenant provisioned before
 * classification existed, including real customer tenants. That is unclassified
 * legacy data: nobody has established what is in it. It is held, not cleared.
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
  // demo_seed is absent from the live provenance contract, so it cannot be
  // REQUIRED - requiring it would refuse every tenant for a reason that is no
  // longer true. A record that still carries it true is still a refusal.
  if (provenance.demo_seed !== undefined && provenance.demo_seed !== false) {
    throw new Error(
      provenance.demo_seed === true
        ? `tenant ${tenantId} was created with demo_seed:true and must not be migrated`
        : `brain-core provenance for ${tenantId} reports demo_seed=` +
          `${describeProvenanceValue(provenance.demo_seed)}, which is not an explicit false. ` +
          `Refusing to migrate.`,
    );
  }
  if (provenance.kind !== "production") {
    throw new Error(
      `brain-core classifies tenant ${tenantId} as kind=${describeProvenanceValue(provenance.kind)}, ` +
        `not production. Refusing to migrate.`,
    );
  }
  if (
    typeof provenance.provisioning_state === "string" &&
    DEMO_PROVISIONING_STATES.has(provenance.provisioning_state)
  ) {
    throw new Error(
      `tenant ${tenantId} is in provisioning_state=${provenance.provisioning_state}, which is a ` +
        `demo provisioning path, and must not be migrated`,
    );
  }
  // Null, absent, malformed and "" are one answer: nobody has classified this
  // tenant's data, so synthetic content cannot be ruled out.
  if (typeof provenance.data_profile !== "string" || provenance.data_profile.length === 0) {
    throw new Error(
      `brain-core provenance for ${tenantId} reports data_profile=` +
        `${describeProvenanceValue(provenance.data_profile)}, so its data is unclassified and ` +
        `synthetic content cannot be ruled out. Refusing to migrate.`,
    );
  }
  if (
    provenance.data_profile.startsWith(SYNTHETIC_DATA_PROFILE_PREFIX) ||
    NON_PRODUCTION_DATA_PROFILES.has(provenance.data_profile)
  ) {
    throw new Error(
      `tenant ${tenantId} carries synthetic data profile ${provenance.data_profile} and must not be migrated`,
    );
  }
  // access_stage is checked against an allowlist rather than a demo denylist: its
  // values are enumerable, and an unrecognised one is an unknown. Refusing prints
  // the observed value, so a stage brain-core adds later surfaces as something to
  // widen deliberately instead of passing unnoticed.
  if (
    typeof provenance.access_stage !== "string" ||
    !PRODUCTION_ACCESS_STAGES.has(provenance.access_stage)
  ) {
    throw new Error(
      `brain-core provenance for ${tenantId} reports access_stage=` +
        `${describeProvenanceValue(provenance.access_stage)}, which is not a recognised production ` +
        `stage (${[...PRODUCTION_ACCESS_STAGES].join(", ")}). Refusing to migrate.`,
    );
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

  // 3. Scope denial, against brain-core's own authorization probe. The probe is a
  //    GET and reaches no domain service, so nothing can be created whatever the
  //    answer is. A bare 403 is still not enough - a policy or tenant refusal is
  //    also a 403 and would prove nothing about scope - so the reason has to name
  //    the scope failure.
  //
  //    204 is the probe's "you hold this scope" answer. For a BFF service key that
  //    is a hard failure, not a pass: the credential can approve payments.
  const denial = await authed(SCOPE_DENIAL_PROBE_PATH, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const denialText = await denial.text();
  let denialBody: unknown;
  try {
    denialBody = denialText ? JSON.parse(denialText) : {};
  } catch {
    denialBody = { raw: denialText };
  }
  const denialReason = denialReasonOf(denialBody) ?? "";
  if (denial.status === 204) {
    throw new Error(
      `authorization probe ${SCOPE_DENIAL_PROBE_PATH} returned 204 for ${tenantId}: the migrated ` +
        `credential HOLDS payment-intent approval scope. Revoke it - a BFF service key must not ` +
        `be able to approve payments.`,
    );
  }
  const scopeDenialVerified =
    denial.status === 403 && SCOPE_DENIAL_REASONS.has(denialReason.trim().toLowerCase());
  if (!scopeDenialVerified) {
    throw new Error(
      `authorization probe ${SCOPE_DENIAL_PROBE_PATH} returned HTTP ${denial.status} reason ` +
        `${denialReason.length > 0 ? denialReason : "(none)"}, expected 403 with a recognised ` +
        `insufficient-scope reason (${[...SCOPE_DENIAL_REASONS].join(", ")})` +
        `${denial.status === 404 ? " - a 404 means the probe surface is not deployed here" : ""}. ` +
        `Scope denial is unproven for ${tenantId}; do not substitute a mutating probe.`,
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
    scope_denial_probe: `GET ${SCOPE_DENIAL_PROBE_PATH}`,
    exchange_verified: exchangeVerified,
    scope_denial_verified: scopeDenialVerified,
    key_lifecycle_verified: keyLifecycleVerified,
    runtime_binding_verified: runtimeBindingVerified,
  };
}

/**
 * What the runtime credential row actually holds. `"unknown"` is a real answer,
 * not an error case: a write can commit and then fail to acknowledge, so a
 * rejected `upsert` does NOT mean the row is unchanged.
 */
type RuntimeRowState = "legacy" | "issued" | "unknown";

/** Which credential the row currently points at, by reading it back. */
async function readRuntimeRowState(
  tenantId: string,
  issuedKey: string,
): Promise<RuntimeRowState> {
  try {
    const row = await storage.getBrainAgentToken(tenantId);
    if (row === undefined) return "unknown";
    return row.token === issuedKey ? "issued" : "legacy";
  } catch {
    return "unknown";
  }
}

/**
 * Undo a failed migration.
 *
 * Order matters and depends on what the runtime row actually holds, which is why
 * an unacknowledged write is resolved by reading the row back rather than assumed:
 * revoking a key the row still points at takes the tenant offline.
 *
 * - Row holds the legacy JWT (the repoint never happened, e.g. issuance succeeded
 *   but the exchange failed): nothing to restore, and the issued key is
 *   unreferenced, so revoke it. This is the path that prevents an orphan.
 * - Row holds the issued key and the rollback window is still open: restore the
 *   legacy JWT first, then revoke.
 * - Row holds the issued key and the window has closed: the legacy JWT is dead, so
 *   restoring it would swap a working credential for a broken one. Leave the
 *   issued key in place *unrevoked* and escalate.
 * - Row state cannot be determined: revoking might be the thing that breaks the
 *   tenant, so nothing is revoked and a human is asked to look.
 *
 * Every path that ends with a live key logs a loud, greppable escalation, because
 * that is the state somebody has to clean up.
 */
async function rollbackTenant(
  tenantId: string,
  legacy: LegacyAgentClaims,
  legacyToken: string,
  legacyExpiresAt: Date,
  issuedKeyId: string,
  issuedKey: string,
  persistedIssuedKey: RuntimeRowState,
): Promise<void> {
  const state =
    persistedIssuedKey === "unknown"
      ? await readRuntimeRowState(tenantId, issuedKey)
      : persistedIssuedKey;

  if (state === "unknown") {
    console.error(
      `[brain-agent-migration] MANUAL REPAIR REQUIRED tenant_id=${tenantId} ` +
        `credential_id=${issuedKeyId}: cannot determine whether the runtime row points at the ` +
        `newly issued key, so it was NOT revoked - revoking a referenced key would take the ` +
        `tenant offline. Check the row and revoke by hand if it is unreferenced.`,
    );
    return;
  }

  if (state === "issued") {
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
      // The restore may still have committed, so read back before describing it.
      const after = await readRuntimeRowState(tenantId, issuedKey);
      if (after !== "legacy") {
        console.error(
          `[brain-agent-migration] MANUAL REPAIR REQUIRED tenant_id=${tenantId} ` +
            `credential_id=${issuedKeyId}: could not restore the legacy credential ` +
            `(${String(error)}); runtime row reads as ${after}. The issued key was NOT revoked.`,
        );
        return;
      }
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
      `restored_runtime_row=${state === "issued"}`,
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
    let persistedIssuedKey: RuntimeRowState = "legacy";
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
      // A rejected write can still have committed, so the outcome is unknown
      // until it resolves; rollback reads the row back rather than guessing.
      persistedIssuedKey = "unknown";
      await storage.upsertBrainAgentToken(tenantId, agentApiKey, expiry);
      persistedIssuedKey = "issued";
      return await verifyLifecycle(tenantId, agentApiKey, exchanged);
    } catch (error) {
      await rollbackTenant(
        tenantId,
        legacy,
        row.token,
        row.expiresAt,
        issued.id,
        agentApiKey,
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
