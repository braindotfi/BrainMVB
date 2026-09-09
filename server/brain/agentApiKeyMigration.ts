import { randomUUID } from "node:crypto";
import { storage } from "../storage";
import { brainConfig } from "./config";
import {
  BFF_SERVICE_AGENT_SCOPES,
  fetchWithAgentAccessTokenRetry,
  getAgentAccessToken,
  isAgentApiKeyCredential,
  type AgentAccessTokenClaims,
} from "./agentApiKey";
import {
  AGENT_API_KEY_MIGRATION_BATCH,
  PROTECTED_AGENT_API_KEY_MIGRATION_TENANT_IDS,
} from "./agentApiKeyMigrationBatch";
import { BUILD_COMMIT } from "../buildInfo";
import {
  BrainApiError,
  getPaymentIntent,
  listAuditEvents,
  listLedgerInvoices,
  proposeInvoicePayment,
} from "./client";
import { issueBffAgentApiKey, listAgentApiKeys, revokeAgentApiKey } from "./tenancy";

interface LegacyAgentClaims {
  sub: string;
  tenant_id: string;
  principal_type: string;
}

interface VerificationReceipt {
  tenant_id: string;
  credential_id: string;
  agent_id: string;
  profile: "bff_service_v1";
  scopes: string[];
  audience: string;
  ttl_seconds: number;
  direct_key_status: number;
  out_of_scope_status: number;
  payment_intent_id: string;
  payment_intent_status: string;
  lifecycle: "completed";
  rollback_marker: false;
}

const SETTLED_INVOICE_STATUSES = new Set([
  "paid",
  "settled",
  "cancelled",
  "canceled",
  "void",
  "voided",
  "written_off",
]);

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
    !claims.tenant_id.startsWith("tnt_")
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

function outputMatchesPaymentIntent(outputs: unknown, paymentIntentId: string): boolean {
  return (
    typeof outputs === "object" &&
    outputs !== null &&
    (outputs as Record<string, unknown>).payment_intent_id === paymentIntentId
  );
}

async function verifyLifecycle(
  tenantId: string,
  agentApiKey: string,
  claims: AgentAccessTokenClaims,
): Promise<VerificationReceipt> {
  const resource = resourceUrl();
  const direct = await fetch(`${brainConfig.baseUrl}/ledger/accounts`, {
    headers: { Authorization: `Bearer ${agentApiKey}`, Accept: "application/json" },
  });
  if (direct.status !== 401) {
    throw new Error(`direct agent API key use returned HTTP ${direct.status}, expected 401`);
  }

  const invoices = await listLedgerInvoices(claimsToken(claims), { limit: 100 });
  const invoice = invoices.invoices.find(
    (candidate) =>
      candidate.metadata?.scenario !== "ar" &&
      !SETTLED_INVOICE_STATUSES.has(candidate.status.trim().toLowerCase()),
  );
  if (invoice === undefined) {
    throw new Error(`tenant ${tenantId} has no payable invoice for the BFF lifecycle probe`);
  }

  const idempotencyKey = `phase3-bff-verify-${claims.credential_id}`;
  const intent = await proposeInvoicePayment(claimsToken(claims), invoice.id, idempotencyKey);
  const fetched = await getPaymentIntent(claimsToken(claims), intent.id);
  if (fetched.id !== intent.id) {
    throw new Error("BFF lifecycle probe could not read back its payment intent");
  }

  const approve = await fetchWithAgentAccessTokenRetry(
    `${brainConfig.baseUrl}/payment-intents/${encodeURIComponent(intent.id)}/approve`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `phase3-bff-deny-${claims.credential_id}`,
        "X-Request-Id": randomUUID(),
      },
      body: "{}",
    },
    claimsToken(claims),
  );
  if (approve.status !== 403) {
    throw new Error(`out-of-scope approval returned HTTP ${approve.status}, expected 403`);
  }

  const events = await listAuditEvents(claimsToken(claims), { limit: 100 });
  const createdEvent = events.events.find(
    (event) =>
      event.actor === claims.sub &&
      event.action === "payment_intent.created" &&
      outputMatchesPaymentIntent(event.outputs, intent.id),
  );
  if (createdEvent === undefined) {
    throw new Error("BFF lifecycle probe did not find its attributed creation audit event");
  }

  const keys = await listAgentApiKeys(tenantId);
  const key = keys.keys.find((candidate) => candidate.id === claims.credential_id);
  if (
    key === undefined ||
    key.profile !== "bff_service_v1" ||
    key.agent_id !== claims.sub ||
    key.tenant_id !== tenantId ||
    key.environment !== "live" ||
    key.revoked_at != null ||
    key.last_used_at == null ||
    key.scopes.length !== BFF_SERVICE_AGENT_SCOPES.length ||
    !BFF_SERVICE_AGENT_SCOPES.every((scope) => key.scopes.includes(scope))
  ) {
    throw new Error("effective BFF agent API key profile does not match the required binding");
  }

  const stored = await storage.getBrainAgentToken(tenantId);
  if (stored === undefined || !isAgentApiKeyCredential(stored.token)) {
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
    out_of_scope_status: approve.status,
    payment_intent_id: intent.id,
    payment_intent_status: fetched.status,
    lifecycle: "completed",
    rollback_marker: false,
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

  let agentApiKey = row.token;
  if (!isAgentApiKeyCredential(agentApiKey)) {
    const legacy = decodeLegacyAgentClaims(row.token);
    if (legacy.tenant_id !== tenantId) {
      throw new Error(`stored BFF agent JWT for ${tenantId} is bound to another tenant`);
    }
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
