import { randomUUID } from "node:crypto";
import { storage } from "../storage";
import { brainConfig } from "./config";
import {
  BFF_SERVICE_AGENT_SCOPES,
  fetchWithAgentAccessTokenRetry,
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
  /** HTTP status of the out-of-scope approve probe (must be 403). */
  out_of_scope_status: number;
  /** The unassigned PaymentIntent id the denial probe targeted. */
  scope_denial_probe_id: string;
  exchange_verified: boolean;
  scope_denial_verified: boolean;
  key_lifecycle_verified: boolean;
  runtime_binding_verified: boolean;
}

/**
 * An all-zero ULID. Syntactically valid, so brain-core routes and authorizes the
 * request normally, but it addresses no PaymentIntent, so approving it can move no
 * money and mutate nothing whatever the answer is.
 */
const UNASSIGNED_PAYMENT_INTENT_ID = "pi_00000000000000000000000000";

/** data_profile values that mark a tenant's data as fixture-generated. */
const SYNTHETIC_DATA_PROFILE_PREFIX = "synthetic";

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

/**
 * Refuse to issue a production BFF credential for a demo or fixture-seeded tenant.
 *
 * Authority is brain-core's own provenance record, never a local id allowlist: a
 * hardcoded exclusion list only knows the demo tenants somebody remembered. Every
 * unknown answer - read unavailable, field absent, field not a boolean - is a
 * refusal, because "we could not tell" and "it is a real tenant" must never
 * produce the same outcome.
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
  if (typeof provenance.demo_seed !== "boolean") {
    throw new Error(
      `brain-core provenance for ${tenantId} carries no demo_seed flag, so demo status is unknown. ` +
        `Refusing to migrate.`,
    );
  }
  if (provenance.demo_seed) {
    throw new Error(`tenant ${tenantId} was created with demo_seed:true and must not be migrated`);
  }
  if (
    typeof provenance.data_profile === "string" &&
    provenance.data_profile.startsWith(SYNTHETIC_DATA_PROFILE_PREFIX)
  ) {
    throw new Error(
      `tenant ${tenantId} carries synthetic data profile ${provenance.data_profile} and must not be migrated`,
    );
  }
  if (provenance.access_stage === "demo") {
    throw new Error(`tenant ${tenantId} is at access_stage=demo and must not be migrated`);
  }
}

/**
 * A legacy-JWT tenant may only be migrated while its rollback is real: the legacy
 * JWT has to still be valid AND the revocation deadline still ahead. After the
 * deadline brain-core revokes these JWTs, so restoring one would hand the tenant a
 * dead credential - a rollback that looks like it worked and does not.
 */
function assertLegacyRollbackWindowOpen(
  tenantId: string,
  legacy: LegacyAgentClaims,
  now: number,
): void {
  if (now >= LEGACY_ROLLBACK_JWT_REVOCATION_DEADLINE_MS) {
    throw new Error(
      `legacy agent JWT rollback closed at ${LEGACY_ROLLBACK_JWT_REVOCATION_DEADLINE_ISO}; ` +
        `tenant ${tenantId} cannot be migrated through the legacy path any more`,
    );
  }
  if (legacy.exp * 1000 <= now) {
    throw new Error(
      `stored legacy agent JWT for ${tenantId} expired at ${new Date(legacy.exp * 1000).toISOString()}, ` +
        `so the migration has no working rollback`,
    );
  }
}

async function verifyLifecycle(
  tenantId: string,
  agentApiKey: string,
  claims: AgentAccessTokenClaims,
): Promise<VerificationReceipt> {
  const resource = resourceUrl();
  const accessToken = claimsToken(claims);

  // 1. The raw API key is exchange-only: it must not authenticate an API call.
  const direct = await fetch(`${brainConfig.baseUrl}/ledger/accounts`, {
    headers: { Authorization: `Bearer ${agentApiKey}`, Accept: "application/json" },
  });
  if (direct.status !== 401) {
    throw new Error(`direct agent API key use returned HTTP ${direct.status}, expected 401`);
  }

  // 2. The exchanged access token carries exactly the BFF binding we asked for.
  //    parseAgentAccessTokenClaims re-validates audience, subject, tenant, scope
  //    set, credential id, and lifetime, and throws on any mismatch.
  const revalidated = parseAgentAccessTokenClaims(accessToken, { tenantId, resource });
  const exchangeVerified =
    revalidated.credential_id === claims.credential_id &&
    revalidated.sub === claims.sub &&
    revalidated.tenant_id === tenantId &&
    revalidated.aud === resource;
  if (!exchangeVerified) {
    throw new Error("exchanged access token does not match the credential under verification");
  }

  // 3. Scope denial, proved without creating anything: approving an unassigned
  //    PaymentIntent id must be refused for lack of scope (403). A 404 would mean
  //    core resolved the intent before authorizing, which leaves scope denial
  //    unproven - we report that instead of falling back to a real payment.
  const denial = await fetchWithAgentAccessTokenRetry(
    `${brainConfig.baseUrl}/payment-intents/${encodeURIComponent(UNASSIGNED_PAYMENT_INTENT_ID)}/approve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-Id": randomUUID() },
      body: "{}",
    },
    accessToken,
  );
  const scopeDenialVerified = denial.status === 403;
  if (!scopeDenialVerified) {
    throw new Error(
      `out-of-scope approval probe returned HTTP ${denial.status}, expected 403. ` +
        `Scope denial is unproven for ${tenantId}; do not substitute a mutating probe.`,
    );
  }

  // 4. The issued key record itself is a live, unrevoked, correctly scoped BFF key.
  const keys = await listAgentApiKeys(tenantId);
  const key = keys.keys.find((candidate) => candidate.id === claims.credential_id);
  const keyLifecycleVerified =
    key !== undefined &&
    key.profile === "bff_service_v1" &&
    key.agent_id === claims.sub &&
    key.tenant_id === tenantId &&
    key.environment === "live" &&
    key.revoked_at == null &&
    key.last_used_at != null &&
    key.scopes.length === BFF_SERVICE_AGENT_SCOPES.length &&
    BFF_SERVICE_AGENT_SCOPES.every((scope) => key.scopes.includes(scope));
  if (!keyLifecycleVerified) {
    throw new Error("effective BFF agent API key profile does not match the required binding");
  }

  // 5. The runtime row the app will actually read holds the migrated key.
  const stored = await storage.getBrainAgentToken(tenantId);
  const runtimeBindingVerified = stored !== undefined && isAgentApiKeyCredential(stored.token);
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
    out_of_scope_status: denial.status,
    scope_denial_probe_id: UNASSIGNED_PAYMENT_INTENT_ID,
    exchange_verified: exchangeVerified,
    scope_denial_verified: scopeDenialVerified,
    key_lifecycle_verified: keyLifecycleVerified,
    runtime_binding_verified: runtimeBindingVerified,
  };
}

const tokenByCredentialId = new Map<string, string>();

function claimsToken(claims: AgentAccessTokenClaims): string {
  const token = tokenByCredentialId.get(claims.credential_id);
  if (token === undefined) throw new Error("agent access token is not registered for verification");
  return token;
}

async function migrateTenant(tenantId: string): Promise<VerificationReceipt> {
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
    tokenByCredentialId.set(exchanged.claims.credential_id, exchanged.token);
    try {
      return await verifyLifecycle(tenantId, agentApiKey, exchanged.claims);
    } catch (error) {
      await storage.upsertBrainAgentToken(tenantId, row.token, row.expiresAt);
      await revokeAgentApiKey(issued.id).catch(() => undefined);
      console.error(
        `[brain-agent-migration] rollback tenant_id=${tenantId} credential_id=${issued.id}`,
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
  tokenByCredentialId.set(exchanged.claims.credential_id, exchanged.token);
  return verifyLifecycle(tenantId, agentApiKey, exchanged.claims);
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
