/**
 * Behavioural tests for the Phase 3 BFF agent API key migration.
 *
 * The companion source-scan suite pins the SHAPE of the guards; it cannot tell
 * whether they actually refuse. These tests drive migrateTenant() against mocked
 * brain-core, storage and network so every refusal path is witnessed: each guard
 * here has been checked to fail when the guard it covers is removed.
 *
 * Nothing here contacts production. The verifier under test is read-only by
 * design, and these tests assert that too - no test allows a mutating call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storage = {
  rows: new Map<string, { tenantId: string; token: string; expiresAt: Date }>(),
  getBrainAgentToken: vi.fn(async (tenantId: string) => storage.rows.get(tenantId)),
  upsertBrainAgentToken: vi.fn(async (tenantId: string, token: string, expiresAt: Date) => {
    const row = { tenantId, token, expiresAt };
    storage.rows.set(tenantId, row);
    return row;
  }),
};

const tenancy = {
  getTenantProvenance: vi.fn(),
  issueBffAgentApiKey: vi.fn(),
  listAgentApiKeys: vi.fn(),
  revokeAgentApiKey: vi.fn(async () => undefined),
};

vi.mock("../storage", () => ({ storage }));
vi.mock("./tenancy", () => tenancy);
vi.mock("./agentApiKey", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./agentApiKey")>();
  return { ...actual, getAgentAccessToken: (...args: unknown[]) => exchangeMock(...args) };
});

const { migrateTenant } = await import("./agentApiKeyMigration");
const { BFF_SERVICE_AGENT_SCOPES } = await import("./agentApiKey");
const { LEGACY_ROLLBACK_JWT_REVOCATION_DEADLINE_MS } = await import("./agentApiKeyMigrationBatch");

const TENANT = "tnt_01M1MDWXR5K5NBQYF089D4ZKAA";
const AGENT = "agent_01M1MDWXR5K5NBQYF089D4ZKAA";
const RESOURCE = "https://api.brain.fi/";
const NEW_KEY = "brain_ak_live_phase3testkey";
/** brain-core's side-effect-free authorization probe. */
const PROBE_PATH = "/authz/probes/payment-intent-approve";

let exchangeMock: (...args: unknown[]) => unknown;
/** Every HTTP request the verifier makes, so a test can assert it mutated nothing. */
let requests: Array<{ method: string; url: string }> = [];
/** Runs before each recorded request; lets a test move the clock mid-migration. */
let onRequest: (method: string, url: string) => void = () => {};

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.sig`;
}

function legacyJwt(overrides: Record<string, unknown> = {}): string {
  return jwt({
    sub: AGENT,
    tenant_id: TENANT,
    principal_type: "agent",
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
    ...overrides,
  });
}

function accessToken(credentialId: string): string {
  const iat = Math.floor(Date.now() / 1000);
  return jwt({
    aud: RESOURCE,
    sub: AGENT,
    principal_type: "agent",
    tenant_id: TENANT,
    scopes: [...BFF_SERVICE_AGENT_SCOPES],
    credential_id: credentialId,
    jti: "token_01M1MDWXR5K5NBQYF089D4ZKAA",
    iat,
    exp: iat + 300,
    iss: "https://auth.brain.fi/",
  });
}

/**
 * A brain-core provenance record for an ordinary production tenant, in the shape
 * GET /tenants/{id}/provenance actually returns - which does NOT include
 * demo_seed.
 */
function goodProvenance(overrides: Record<string, unknown> = {}) {
  return {
    tenant_id: TENANT,
    kind: "production",
    provisioning_state: "ready",
    data_profile: "customer",
    access_stage: "production",
    ...overrides,
  };
}

/**
 * The record production returns for Northstar today, copied from a live read on
 * 2026-09-09. Classification never happened for this tenant, so all three fields
 * are null.
 */
function northstarProvenance() {
  return {
    tenant_id: TENANT,
    kind: "production",
    provisioning_state: null,
    data_profile: null,
    access_stage: null,
  };
}

function goodKeyRecord(credentialId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: credentialId,
    agent_id: AGENT,
    tenant_id: TENANT,
    profile: "bff_service_v1",
    environment: "live",
    scopes: [...BFF_SERVICE_AGENT_SCOPES],
    key_prefix: "brain_ak_live",
    key_last4: "3key",
    expires_at: new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString(),
    last_used_at: new Date().toISOString(),
    revoked_at: null,
    ...overrides,
  };
}

interface Wiring {
  denialStatus?: number;
  denialBody?: unknown;
  inScopeReadStatus?: number;
  directStatus?: number;
}

/** Wire up a tenant whose migration succeeds, then let each test break one thing. */
function wireHappyPath(wiring: Wiring = {}): void {
  const credentialId = "agkey_01M1MDWXR5K5NBQYF089D4ZKAA";
  storage.rows.set(TENANT, {
    tenantId: TENANT,
    token: legacyJwt(),
    expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
  });
  tenancy.getTenantProvenance.mockResolvedValue(goodProvenance());
  tenancy.issueBffAgentApiKey.mockResolvedValue({
    ...goodKeyRecord(credentialId),
    api_key: NEW_KEY,
  });
  tenancy.listAgentApiKeys.mockResolvedValue({ keys: [goodKeyRecord(credentialId)] });
  exchangeMock = () => {
    const token = accessToken(credentialId);
    const claims = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    );
    return Promise.resolve({ token, claims });
  };
  // One stub for every request the verifier makes, so the inventory below is
  // complete: a mutating call added to the verifier cannot avoid being recorded.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      onRequest(method, url);
      requests.push({ method, url });
      const auth = String(
        (init?.headers as Record<string, string> | undefined)?.Authorization ?? "",
      );
      if (auth === `Bearer ${NEW_KEY}`) {
        // The raw API key is exchange-only, so brain-core rejects it as a bearer.
        return new Response("{}", { status: wiring.directStatus ?? 401 });
      }
      if (url.includes(PROBE_PATH)) {
        const status = wiring.denialStatus ?? 403;
        return status === 204
          ? new Response(null, { status })
          : new Response(
              JSON.stringify(
                wiring.denialBody ?? { error: { code: "auth_scope_insufficient" } },
              ),
              { status },
            );
      }
      return new Response("{}", { status: wiring.inScopeReadStatus ?? 200 });
    }),
  );
}

/** Collect the greppable escalation lines a rollback path is required to log. */
function captureEscalations(): string[] {
  const lines: string[] = [];
  vi.spyOn(console, "error").mockImplementation((message: unknown) => {
    lines.push(String(message));
  });
  return lines;
}

beforeEach(() => {
  storage.rows.clear();
  requests = [];
  onRequest = () => {};
  vi.clearAllMocks();
  // clearAllMocks keeps implementations, so a test that overrides one would leak
  // into the next. Re-establish the real in-memory storage behaviour every time.
  storage.getBrainAgentToken.mockImplementation(async (tenantId: string) =>
    storage.rows.get(tenantId),
  );
  storage.upsertBrainAgentToken.mockImplementation(
    async (tenantId: string, token: string, expiresAt: Date) => {
      const row = { tenantId, token, expiresAt };
      storage.rows.set(tenantId, row);
      return row;
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("migrateTenant refuses before issuing a credential", () => {
  const expectNoKeyIssued = () => expect(tenancy.issueBffAgentApiKey).not.toHaveBeenCalled();

  it("refuses when brain-core's provenance read fails", async () => {
    wireHappyPath();
    tenancy.getTenantProvenance.mockRejectedValue(new Error("HTTP 404"));
    await expect(migrateTenant(TENANT)).rejects.toThrow(/cannot confirm .* is not demo-seeded/);
    expectNoKeyIssued();
  });

  // The live provenance contract does not publish demo_seed, so it cannot be
  // required - but a record that still carries it must still be honoured, and
  // anything other than an explicit false is an unknown.
  it("refuses a demo-seeded tenant", async () => {
    wireHappyPath();
    tenancy.getTenantProvenance.mockResolvedValue(goodProvenance({ demo_seed: true }));
    await expect(migrateTenant(TENANT)).rejects.toThrow(/demo_seed:true/);
    expectNoKeyIssued();
  });

  it("refuses a non-boolean demo_seed rather than reading it as false", async () => {
    wireHappyPath();
    tenancy.getTenantProvenance.mockResolvedValue(goodProvenance({ demo_seed: "false" }));
    await expect(migrateTenant(TENANT)).rejects.toThrow(/demo_seed/);
    expectNoKeyIssued();
  });

  // The case that decides Northstar: production returns all-null classification
  // for tenants provisioned before it existed. Null is "nobody classified this",
  // not "confirmed safe", so it must be held.
  it("refuses an all-null provenance record instead of treating null as passing", async () => {
    wireHappyPath();
    tenancy.getTenantProvenance.mockResolvedValue(northstarProvenance());
    await expect(migrateTenant(TENANT)).rejects.toThrow(
      /data_profile=null \(unclassified\).*Refusing to migrate/s,
    );
    expectNoKeyIssued();
  });

  it("refuses a null access_stage even when data_profile is classified", async () => {
    wireHappyPath();
    tenancy.getTenantProvenance.mockResolvedValue(goodProvenance({ access_stage: null }));
    await expect(migrateTenant(TENANT)).rejects.toThrow(/access_stage=null \(unclassified\)/);
    expectNoKeyIssued();
  });

  it("refuses a tenant brain-core classifies as kind=demo", async () => {
    wireHappyPath();
    tenancy.getTenantProvenance.mockResolvedValue(goodProvenance({ kind: "demo" }));
    await expect(migrateTenant(TENANT)).rejects.toThrow(/kind=demo, not production/);
    expectNoKeyIssued();
  });

  it("refuses a tenant with no kind at all", async () => {
    wireHappyPath();
    tenancy.getTenantProvenance.mockResolvedValue(goodProvenance({ kind: null }));
    await expect(migrateTenant(TENANT)).rejects.toThrow(/kind=null \(unclassified\)/);
    expectNoKeyIssued();
  });

  it("refuses a tenant provisioned down the demo path", async () => {
    wireHappyPath();
    tenancy.getTenantProvenance.mockResolvedValue(
      goodProvenance({ provisioning_state: "ready_demo" }),
    );
    await expect(migrateTenant(TENANT)).rejects.toThrow(/provisioning_state=ready_demo/);
    expectNoKeyIssued();
  });

  it("refuses an access_stage nobody has defined as production", async () => {
    wireHappyPath();
    tenancy.getTenantProvenance.mockResolvedValue(goodProvenance({ access_stage: "pilot" }));
    await expect(migrateTenant(TENANT)).rejects.toThrow(
      /access_stage=pilot, which is not a recognised production stage/,
    );
    expectNoKeyIssued();
  });

  it("refuses access_stage=demo", async () => {
    wireHappyPath();
    tenancy.getTenantProvenance.mockResolvedValue(goodProvenance({ access_stage: "demo" }));
    await expect(migrateTenant(TENANT)).rejects.toThrow(/access_stage=demo/);
    expectNoKeyIssued();
  });

  it("refuses a provenance record about a different tenant", async () => {
    wireHappyPath();
    tenancy.getTenantProvenance.mockResolvedValue(
      goodProvenance({ tenant_id: "tnt_01M0KHRVY3RT3EXN7WT2SPDFMZ" }),
    );
    await expect(migrateTenant(TENANT)).rejects.toThrow(/identifies tnt_01M0KHRVY3RT3EXN7WT2SPDFMZ/);
    expectNoKeyIssued();
  });

  it("refuses when data_profile is absent", async () => {
    wireHappyPath();
    const { data_profile: _omitted, ...withoutProfile } = goodProvenance();
    tenancy.getTenantProvenance.mockResolvedValue(withoutProfile);
    await expect(migrateTenant(TENANT)).rejects.toThrow(/data_profile=absent/);
    expectNoKeyIssued();
  });

  it("refuses a malformed data_profile, because malformed is as unknown as absent", async () => {
    wireHappyPath();
    tenancy.getTenantProvenance.mockResolvedValue(goodProvenance({ data_profile: 7 }));
    await expect(migrateTenant(TENANT)).rejects.toThrow(/data_profile=number \(malformed\)/);
    expectNoKeyIssued();
  });

  it("refuses an empty data_profile", async () => {
    wireHappyPath();
    tenancy.getTenantProvenance.mockResolvedValue(goodProvenance({ data_profile: "" }));
    await expect(migrateTenant(TENANT)).rejects.toThrow(/data_profile="" \(empty\)/);
    expectNoKeyIssued();
  });

  it("refuses a synthetic data profile", async () => {
    wireHappyPath();
    tenancy.getTenantProvenance.mockResolvedValue(
      goodProvenance({ data_profile: "synthetic_brightline_v1" }),
    );
    await expect(migrateTenant(TENANT)).rejects.toThrow(/synthetic data profile/);
    expectNoKeyIssued();
  });

  it("refuses when access_stage is absent", async () => {
    wireHappyPath();
    const { access_stage: _omitted, ...withoutStage } = goodProvenance();
    tenancy.getTenantProvenance.mockResolvedValue(withoutStage);
    await expect(migrateTenant(TENANT)).rejects.toThrow(/access_stage=absent/);
    expectNoKeyIssued();
  });

  it("refuses a tenant still at access_stage=demo", async () => {
    wireHappyPath();
    tenancy.getTenantProvenance.mockResolvedValue(goodProvenance({ access_stage: "demo" }));
    await expect(migrateTenant(TENANT)).rejects.toThrow(/access_stage=demo/);
    expectNoKeyIssued();
  });

  it("refuses the legacy path once the revocation deadline is reached", async () => {
    wireHappyPath();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(LEGACY_ROLLBACK_JWT_REVOCATION_DEADLINE_MS + 1000);
    await expect(migrateTenant(TENANT)).rejects.toThrow(/rollback window closes/);
    expectNoKeyIssued();
  });

  it("refuses when the stored legacy JWT expires inside the safety margin", async () => {
    wireHappyPath();
    storage.rows.set(TENANT, {
      tenantId: TENANT,
      token: legacyJwt({ exp: Math.floor(Date.now() / 1000) + 60 }),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(migrateTenant(TENANT)).rejects.toThrow(/legacy agent JWT expires at/);
    expectNoKeyIssued();
  });

  it("refuses an already-expired legacy JWT", async () => {
    wireHappyPath();
    storage.rows.set(TENANT, {
      tenantId: TENANT,
      token: legacyJwt({ exp: Math.floor(Date.now() / 1000) - 3600 }),
      expiresAt: new Date(Date.now() - 3_600_000),
    });
    await expect(migrateTenant(TENANT)).rejects.toThrow(/legacy agent JWT expires at/);
    expectNoKeyIssued();
  });
});

describe("migrateTenant refuses on unproven verification evidence", () => {
  it("rejects a bare 403 that does not name a scope failure", async () => {
    wireHappyPath({ denialBody: { reason: "policy_denied" } });
    await expect(migrateTenant(TENANT)).rejects.toThrow(/recognised insufficient-scope reason/);
  });

  it("rejects a tenant restriction that merely contains the word scope", async () => {
    wireHappyPath({ denialBody: { reason: "tenant_scope_denied" } });
    await expect(migrateTenant(TENANT)).rejects.toThrow(/recognised insufficient-scope reason/);
  });

  it("rejects a 404 on the denial probe rather than falling back to a mutating probe", async () => {
    wireHappyPath({ denialStatus: 404, denialBody: { reason: "not_found" } });
    await expect(migrateTenant(TENANT)).rejects.toThrow(
      /probe surface is not deployed here.*Scope denial is unproven/s,
    );
  });

  // 204 is the probe's "yes, you hold this scope" answer. For a BFF service key
  // that is the worst possible result, so it must never be read as a pass.
  it("rejects a 204 from the probe, because it means the key CAN approve payments", async () => {
    wireHappyPath({ denialStatus: 204 });
    await expect(migrateTenant(TENANT)).rejects.toThrow(
      /HOLDS payment-intent approval scope/,
    );
  });

  it("accepts the probe's documented insufficient-scope code", async () => {
    wireHappyPath({ denialBody: { error: { code: "auth_scope_insufficient" } } });
    const receipt = await migrateTenant(TENANT);
    expect(receipt.out_of_scope_reason).toBe("auth_scope_insufficient");
    expect(receipt.scope_denial_verified).toBe(true);
  });

  it("rejects an access token the resource server will not accept", async () => {
    wireHappyPath({ inScopeReadStatus: 401 });
    await expect(migrateTenant(TENANT)).rejects.toThrow(/in-scope read returned HTTP 401/);
  });

  it("rejects a raw API key that authenticates a call directly", async () => {
    wireHappyPath({ directStatus: 200 });
    await expect(migrateTenant(TENANT)).rejects.toThrow(/expected 401/);
  });

  it("rejects a key record with no revoked_at field, because unknown is not unrevoked", async () => {
    wireHappyPath();
    const credentialId = "agkey_01M1MDWXR5K5NBQYF089D4ZKAA";
    const { revoked_at: _omitted, ...withoutRevokedAt } = goodKeyRecord(credentialId);
    tenancy.listAgentApiKeys.mockResolvedValue({ keys: [withoutRevokedAt] });
    await expect(migrateTenant(TENANT)).rejects.toThrow(/does not match the required binding/);
  });

  it("rejects a key record that was never used", async () => {
    wireHappyPath();
    const credentialId = "agkey_01M1MDWXR5K5NBQYF089D4ZKAA";
    tenancy.listAgentApiKeys.mockResolvedValue({
      keys: [goodKeyRecord(credentialId, { last_used_at: null })],
    });
    await expect(migrateTenant(TENANT)).rejects.toThrow(/does not match the required binding/);
  });

  it("rejects a last_used_at that is a string but not a timestamp", async () => {
    wireHappyPath();
    const credentialId = "agkey_01M1MDWXR5K5NBQYF089D4ZKAA";
    tenancy.listAgentApiKeys.mockResolvedValue({
      keys: [goodKeyRecord(credentialId, { last_used_at: "" })],
    });
    await expect(migrateTenant(TENANT)).rejects.toThrow(/does not match the required binding/);
  });

  it("rejects an already-expired key record", async () => {
    wireHappyPath();
    const credentialId = "agkey_01M1MDWXR5K5NBQYF089D4ZKAA";
    tenancy.listAgentApiKeys.mockResolvedValue({
      keys: [
        goodKeyRecord(credentialId, {
          expires_at: new Date(Date.now() - 1000).toISOString(),
        }),
      ],
    });
    await expect(migrateTenant(TENANT)).rejects.toThrow(/does not match the required binding/);
  });

  it("rejects a runtime row holding a different API key", async () => {
    wireHappyPath();
    storage.upsertBrainAgentToken.mockImplementation(async (tenantId: string) => {
      const row = {
        tenantId,
        token: "brain_ak_live_someoneelseskey",
        expiresAt: new Date(Date.now() + 3600_000),
      };
      storage.rows.set(tenantId, row);
      return row;
    });
    await expect(migrateTenant(TENANT)).rejects.toThrow(/runtime credential row does not contain/);
  });
});

describe("migrateTenant cleans up after itself", () => {
  it("restores the legacy JWT and revokes the issued key when verification fails", async () => {
    wireHappyPath({ denialBody: { reason: "policy_denied" } });
    const legacy = storage.rows.get(TENANT)!.token;
    await expect(migrateTenant(TENANT)).rejects.toThrow();
    expect(tenancy.revokeAgentApiKey).toHaveBeenCalledWith("agkey_01M1MDWXR5K5NBQYF089D4ZKAA");
    expect(storage.rows.get(TENANT)?.token).toBe(legacy);
  });

  it("revokes the issued key when the exchange fails after issuance", async () => {
    wireHappyPath();
    const legacy = storage.rows.get(TENANT)!.token;
    exchangeMock = () => Promise.reject(new Error("token endpoint unavailable"));
    await expect(migrateTenant(TENANT)).rejects.toThrow(/token endpoint unavailable/);
    expect(tenancy.revokeAgentApiKey).toHaveBeenCalledWith("agkey_01M1MDWXR5K5NBQYF089D4ZKAA");
    // The row was never repointed, so there is nothing to restore.
    expect(storage.rows.get(TENANT)?.token).toBe(legacy);
  });

  it("still revokes an unreferenced key after the rollback window has closed", async () => {
    // The row was never repointed at the issued key, so the closed window is
    // irrelevant: leaving the key live would orphan it for nothing.
    wireHappyPath();
    exchangeMock = () => {
      vi.setSystemTime(LEGACY_ROLLBACK_JWT_REVOCATION_DEADLINE_MS + 1000);
      return Promise.reject(new Error("token endpoint unavailable"));
    };
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(LEGACY_ROLLBACK_JWT_REVOCATION_DEADLINE_MS - 60 * 60 * 1000);
    storage.rows.set(TENANT, {
      tenantId: TENANT,
      token: legacyJwt(),
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    });
    await expect(migrateTenant(TENANT)).rejects.toThrow(/token endpoint unavailable/);
    expect(tenancy.revokeAgentApiKey).toHaveBeenCalledWith("agkey_01M1MDWXR5K5NBQYF089D4ZKAA");
  });

  it("escalates loudly when revoking the issued key fails", async () => {
    wireHappyPath();
    const escalations = captureEscalations();
    exchangeMock = () => Promise.reject(new Error("token endpoint unavailable"));
    tenancy.revokeAgentApiKey.mockRejectedValue(new Error("brain-core unreachable"));
    await expect(migrateTenant(TENANT)).rejects.toThrow(/token endpoint unavailable/);
    expect(escalations.join("\n")).toContain("ORPHANED CREDENTIAL");
  });

  it("does not revoke a key the runtime row still points at when restoring fails", async () => {
    wireHappyPath({ denialBody: { reason: "policy_denied" } });
    const escalations = captureEscalations();
    let writes = 0;
    storage.upsertBrainAgentToken.mockImplementation(
      async (tenantId: string, token: string, expiresAt: Date) => {
        writes += 1;
        if (writes > 1) throw new Error("database unavailable");
        const row = { tenantId, token, expiresAt };
        storage.rows.set(tenantId, row);
        return row;
      },
    );
    await expect(migrateTenant(TENANT)).rejects.toThrow();
    expect(tenancy.revokeAgentApiKey).not.toHaveBeenCalled();
    expect(storage.rows.get(TENANT)?.token).toBe(NEW_KEY);
    expect(escalations.join("\n")).toContain("MANUAL REPAIR REQUIRED");
  });

  // A database write can commit and THEN fail to acknowledge. A rejected upsert
  // therefore does not mean the row is unchanged, and guessing either way breaks
  // a tenant: revoking a referenced key takes it offline, and leaving an
  // unreferenced one orphans a live credential.
  it("reads the row back when the repoint commits but its acknowledgement is lost", async () => {
    wireHappyPath({ denialBody: { reason: "policy_denied" } });
    const legacy = storage.rows.get(TENANT)!.token;
    storage.upsertBrainAgentToken.mockImplementation(
      async (tenantId: string, token: string, expiresAt: Date) => {
        storage.rows.set(tenantId, { tenantId, token, expiresAt });
        throw new Error("connection reset after commit");
      },
    );
    await expect(migrateTenant(TENANT)).rejects.toThrow();
    // The row really does hold the issued key, so it must be restored, not revoked
    // blindly - and the restore itself is subject to the same ambiguity, so the
    // row is read back again before anything is revoked.
    expect(storage.rows.get(TENANT)?.token).toBe(legacy);
    expect(tenancy.revokeAgentApiKey).toHaveBeenCalledWith("agkey_01M1MDWXR5K5NBQYF089D4ZKAA");
  });

  it("revokes when a lost acknowledgement turns out to have written nothing", async () => {
    wireHappyPath({ denialBody: { reason: "policy_denied" } });
    const legacy = storage.rows.get(TENANT)!.token;
    storage.upsertBrainAgentToken.mockRejectedValue(new Error("connection reset before commit"));
    await expect(migrateTenant(TENANT)).rejects.toThrow();
    expect(storage.rows.get(TENANT)?.token).toBe(legacy);
    expect(tenancy.revokeAgentApiKey).toHaveBeenCalledWith("agkey_01M1MDWXR5K5NBQYF089D4ZKAA");
  });

  it("revokes nothing when the row cannot be read back at all", async () => {
    wireHappyPath({ denialBody: { reason: "policy_denied" } });
    const escalations = captureEscalations();
    storage.upsertBrainAgentToken.mockRejectedValue(new Error("connection reset"));
    let reads = 0;
    storage.getBrainAgentToken.mockImplementation(async (tenantId: string) => {
      reads += 1;
      if (reads > 1) throw new Error("database unavailable");
      return storage.rows.get(tenantId);
    });
    await expect(migrateTenant(TENANT)).rejects.toThrow();
    expect(tenancy.revokeAgentApiKey).not.toHaveBeenCalled();
    expect(escalations.join("\n")).toContain("MANUAL REPAIR REQUIRED");
  });

  it("revokes the issued key when brain-core returns an invalid binding", async () => {
    wireHappyPath();
    tenancy.issueBffAgentApiKey.mockResolvedValue({
      ...goodKeyRecord("agkey_01M1MDWXR5K5NBQYF089D4ZKAA"),
      api_key: NEW_KEY,
      environment: "test",
    });
    await expect(migrateTenant(TENANT)).rejects.toThrow(/invalid BFF binding/);
    expect(tenancy.revokeAgentApiKey).toHaveBeenCalledWith("agkey_01M1MDWXR5K5NBQYF089D4ZKAA");
  });

  it("does not restore a legacy JWT that died mid-migration, and escalates instead", async () => {
    wireHappyPath({ denialBody: { reason: "policy_denied" } });
    const legacy = storage.rows.get(TENANT)!.token;
    const escalations = captureEscalations();
    // The migration starts inside the window, then the deadline passes before the
    // rollback runs. Restoring the revoked JWT would be a rollback that only
    // looks like it worked.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(LEGACY_ROLLBACK_JWT_REVOCATION_DEADLINE_MS - 60 * 60 * 1000);
    storage.rows.set(TENANT, {
      tenantId: TENANT,
      token: legacy,
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    });
    onRequest = (_method, url) => {
      if (url.includes(PROBE_PATH)) {
        vi.setSystemTime(LEGACY_ROLLBACK_JWT_REVOCATION_DEADLINE_MS + 1000);
      }
    };
    await expect(migrateTenant(TENANT)).rejects.toThrow();
    expect(tenancy.revokeAgentApiKey).not.toHaveBeenCalled();
    expect(storage.rows.get(TENANT)?.token).toBe(NEW_KEY);
    expect(escalations.join("\n")).toContain("MANUAL REPAIR REQUIRED");
  });
});

describe("migrateTenant receipt", () => {
  it("reports every check it actually observed, and never proposes a payment", async () => {
    wireHappyPath();
    const receipt = await migrateTenant(TENANT);
    expect(receipt).toMatchObject({
      tenant_id: TENANT,
      agent_id: AGENT,
      profile: "bff_service_v1",
      direct_key_status: 401,
      in_scope_read_status: 200,
      out_of_scope_status: 403,
      out_of_scope_reason: "auth_scope_insufficient",
      scope_denial_probe: `GET ${PROBE_PATH}`,
      exchange_verified: true,
      scope_denial_verified: true,
      key_lifecycle_verified: true,
      runtime_binding_verified: true,
    });
    expect(receipt.ttl_seconds).toBe(300);
    expect(storage.rows.get(TENANT)?.token).toBe(NEW_KEY);
    expect(tenancy.revokeAgentApiKey).not.toHaveBeenCalled();
    // Service calls are mocked, so the fetch inventory below cannot see them.
    // Pin their counts too, or a second issuance would create an extra live
    // production credential without changing a single recorded request.
    expect(tenancy.issueBffAgentApiKey).toHaveBeenCalledTimes(1);
    expect(tenancy.listAgentApiKeys).toHaveBeenCalledTimes(1);
    expect(tenancy.getTenantProvenance).toHaveBeenCalledTimes(1);
    expect(storage.upsertBrainAgentToken).toHaveBeenCalledTimes(1);
    // Full request inventory, not a spot check: every request the verifier makes
    // is a GET, so there is no request in this list that could change anything.
    // A mutating call added later shows up here as a non-GET entry. (This covers
    // direct fetches only; the brain-core service helpers above are mocked and
    // counted separately.)
    expect(requests).toEqual([
      { method: "GET", url: "https://api.brain.fi/v1/ledger/accounts" },
      { method: "GET", url: "https://api.brain.fi/v1/ledger/accounts" },
      { method: "GET", url: `https://api.brain.fi/v1${PROBE_PATH}` },
    ]);
    expect(requests.every((request) => request.method === "GET")).toBe(true);
  });
});
