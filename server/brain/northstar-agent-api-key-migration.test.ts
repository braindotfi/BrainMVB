import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { TEST_BUILD_SHA } = vi.hoisted(() => ({
  TEST_BUILD_SHA: "0123456789abcdef0123456789abcdef01234567",
}));

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

let exchangeMock: (...args: unknown[]) => unknown;

vi.mock("../storage", () => ({ storage }));
vi.mock("../buildInfo", () => ({ BUILD_COMMIT: TEST_BUILD_SHA }));
vi.mock("./tenancy", () => tenancy);
vi.mock("./agentApiKey", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./agentApiKey")>();
  return { ...actual, getAgentAccessToken: (...args: unknown[]) => exchangeMock(...args) };
});

const {
  migrateAuthorizedNorthstarAgentApiKey,
  validateAgentApiKeyMigrationBatch,
} = await import("./agentApiKeyMigration");
const { BFF_SERVICE_AGENT_SCOPES } = await import("./agentApiKey");
const {
  NORTHSTAR_AGENT_API_KEY_MIGRATION_AUTHORIZATION,
  NORTHSTAR_AGENT_API_KEY_MIGRATION_TENANT_ID,
  NORTHSTAR_AGENT_API_KEY_MIGRATION_WINDOW_END_ISO,
  NORTHSTAR_AGENT_API_KEY_MIGRATION_WINDOW_START_ISO,
  PROTECTED_AGENT_API_KEY_MIGRATION_TENANT_IDS,
} = await import("./agentApiKeyMigrationBatch");

const AGENT_ID = "agent_01M0KHRVY3RT3EXN7WT2SPDFMZ";
const CREDENTIAL_ID = "agkey_01M0KHRVY3RT3EXN7WT2SPDFMZ";
const NEW_KEY = "brain_ak_live_northstartestkey";
const RESOURCE = "https://api.brain.fi/";
const LEGACY_EXPIRY = new Date("2026-08-29T00:00:00Z");

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.sig`;
}

function legacyJwt(): string {
  return jwt({
    sub: AGENT_ID,
    tenant_id: NORTHSTAR_AGENT_API_KEY_MIGRATION_TENANT_ID,
    principal_type: "agent",
    exp: Math.floor(LEGACY_EXPIRY.getTime() / 1000),
  });
}

function exchangedToken(): string {
  const iat = Math.floor(Date.now() / 1000);
  return jwt({
    aud: RESOURCE,
    sub: AGENT_ID,
    principal_type: "agent",
    tenant_id: NORTHSTAR_AGENT_API_KEY_MIGRATION_TENANT_ID,
    scopes: [...BFF_SERVICE_AGENT_SCOPES],
    credential_id: CREDENTIAL_ID,
    jti: "token_01M0KHRVY3RT3EXN7WT2SPDFMZ",
    iat,
    exp: iat + 300,
    iss: "https://auth.brain.fi/",
  });
}

function northstarProvenance(overrides: Record<string, unknown> = {}) {
  return {
    tenant_id: NORTHSTAR_AGENT_API_KEY_MIGRATION_TENANT_ID,
    kind: "production",
    provisioning_state: null,
    data_profile: null,
    access_stage: null,
    ...overrides,
  };
}

function keyRecord() {
  return {
    id: CREDENTIAL_ID,
    agent_id: AGENT_ID,
    tenant_id: NORTHSTAR_AGENT_API_KEY_MIGRATION_TENANT_ID,
    profile: "bff_service_v1",
    environment: "live",
    scopes: [...BFF_SERVICE_AGENT_SCOPES],
    key_prefix: "brain_ak_live",
    key_last4: "tkey",
    expires_at: "2026-12-10T00:00:00Z",
    last_used_at: new Date().toISOString(),
    revoked_at: null,
  };
}

function armNorthstar(overrides: Record<string, string> = {}): void {
  const values = {
    NODE_ENV: "production",
    NORTHSTAR_AGENT_API_KEY_MIGRATION_TENANT_ID:
      NORTHSTAR_AGENT_API_KEY_MIGRATION_TENANT_ID,
    NORTHSTAR_AGENT_API_KEY_MIGRATION_APPROVED_SHA: TEST_BUILD_SHA,
    NORTHSTAR_AGENT_API_KEY_MIGRATION_WINDOW_START:
      NORTHSTAR_AGENT_API_KEY_MIGRATION_WINDOW_START_ISO,
    NORTHSTAR_AGENT_API_KEY_MIGRATION_WINDOW_END:
      NORTHSTAR_AGENT_API_KEY_MIGRATION_WINDOW_END_ISO,
    NORTHSTAR_AGENT_API_KEY_MIGRATION_AUTHORIZATION:
      NORTHSTAR_AGENT_API_KEY_MIGRATION_AUTHORIZATION,
    ...overrides,
  };
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
}

function wireNorthstar(options: { directStatus?: number } = {}): string {
  const legacy = legacyJwt();
  storage.rows.set(NORTHSTAR_AGENT_API_KEY_MIGRATION_TENANT_ID, {
    tenantId: NORTHSTAR_AGENT_API_KEY_MIGRATION_TENANT_ID,
    token: legacy,
    expiresAt: LEGACY_EXPIRY,
  });
  tenancy.getTenantProvenance.mockResolvedValue(northstarProvenance());
  tenancy.issueBffAgentApiKey.mockResolvedValue({ ...keyRecord(), api_key: NEW_KEY });
  tenancy.listAgentApiKeys
    .mockResolvedValueOnce({ keys: [] })
    .mockResolvedValue({ keys: [keyRecord()] });
  exchangeMock = () => {
    const token = exchangedToken();
    const claims = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    );
    return Promise.resolve({ token, claims });
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const auth = String(
        (init?.headers as Record<string, string> | undefined)?.Authorization ?? "",
      );
      if (auth === `Bearer ${NEW_KEY}`) {
        return new Response("{}", { status: options.directStatus ?? 401 });
      }
      if (url.includes("/authz/probes/payment-intent-approve")) {
        return new Response(
          JSON.stringify({ error: { code: "auth_scope_insufficient" } }),
          { status: 403 },
        );
      }
      return new Response("{}", { status: 200 });
    }),
  );
  return legacy;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.parse("2026-09-12T15:00:00Z"));
  storage.rows.clear();
  vi.clearAllMocks();
  exchangeMock = () => Promise.reject(new Error("exchange not wired"));
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
  tenancy.revokeAgentApiKey.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Northstar-only migration authorization", () => {
  it("continues rejecting every protected tenant from the ordinary batch path", () => {
    for (const tenantId of PROTECTED_AGENT_API_KEY_MIGRATION_TENANT_IDS) {
      expect(() => validateAgentApiKeyMigrationBatch([tenantId])).toThrow(
        `protected tenant id ${tenantId}`,
      );
    }
  });

  it("is dormant when no Northstar authorization fields are configured", async () => {
    await expect(migrateAuthorizedNorthstarAgentApiKey()).resolves.toBeUndefined();
    expect(tenancy.getTenantProvenance).not.toHaveBeenCalled();
    expect(tenancy.issueBffAgentApiKey).not.toHaveBeenCalled();
  });

  it("rejects an incomplete authorization instead of silently staying dormant", async () => {
    vi.stubEnv(
      "NORTHSTAR_AGENT_API_KEY_MIGRATION_AUTHORIZATION",
      NORTHSTAR_AGENT_API_KEY_MIGRATION_AUTHORIZATION,
    );
    vi.stubEnv("NODE_ENV", "production");
    await expect(migrateAuthorizedNorthstarAgentApiKey()).rejects.toThrow(/incomplete/);
    expect(tenancy.issueBffAgentApiKey).not.toHaveBeenCalled();
  });

  it("rejects any tenant other than the exact Northstar id", async () => {
    armNorthstar({
      NORTHSTAR_AGENT_API_KEY_MIGRATION_TENANT_ID:
        "tnt_01M1MDWXR5K5NBQYF089D4ZKAA",
    });
    await expect(migrateAuthorizedNorthstarAgentApiKey()).rejects.toThrow(
      /tenant id does not match/,
    );
    expect(tenancy.getTenantProvenance).not.toHaveBeenCalled();
    expect(tenancy.issueBffAgentApiKey).not.toHaveBeenCalled();
  });

  it("rejects a mismatched manual authorization phrase", async () => {
    armNorthstar({ NORTHSTAR_AGENT_API_KEY_MIGRATION_AUTHORIZATION: "yes" });
    await expect(migrateAuthorizedNorthstarAgentApiKey()).rejects.toThrow(
      /authorization phrase does not match/,
    );
    expect(tenancy.issueBffAgentApiKey).not.toHaveBeenCalled();
  });

  it("requires the full deployed commit to equal the approved SHA", async () => {
    armNorthstar({
      NORTHSTAR_AGENT_API_KEY_MIGRATION_APPROVED_SHA:
        "abcdef0123456789abcdef0123456789abcdef01",
    });
    await expect(migrateAuthorizedNorthstarAgentApiKey()).rejects.toThrow(
      /approved SHA does not exactly match/,
    );
    expect(tenancy.issueBffAgentApiKey).not.toHaveBeenCalled();
  });

  it("requires the exact approved window values", async () => {
    armNorthstar({
      NORTHSTAR_AGENT_API_KEY_MIGRATION_WINDOW_END: "2026-09-12T17:01:00Z",
    });
    await expect(migrateAuthorizedNorthstarAgentApiKey()).rejects.toThrow(
      /window does not match/,
    );
    expect(tenancy.issueBffAgentApiKey).not.toHaveBeenCalled();
  });

  it("refuses before the window and exactly at its exclusive end", async () => {
    armNorthstar();
    vi.setSystemTime(Date.parse(NORTHSTAR_AGENT_API_KEY_MIGRATION_WINDOW_START_ISO) - 1);
    await expect(migrateAuthorizedNorthstarAgentApiKey()).rejects.toThrow(/outside/);
    vi.setSystemTime(Date.parse(NORTHSTAR_AGENT_API_KEY_MIGRATION_WINDOW_END_ISO));
    await expect(migrateAuthorizedNorthstarAgentApiKey()).rejects.toThrow(/outside/);
    expect(tenancy.issueBffAgentApiKey).not.toHaveBeenCalled();
  });

  it("accepts authorization during the newly approved window", async () => {
    armNorthstar();
    wireNorthstar();
    vi.setSystemTime(Date.parse("2026-09-12T14:00:00Z"));
    await expect(migrateAuthorizedNorthstarAgentApiKey()).resolves.toMatchObject({
      tenant_id: NORTHSTAR_AGENT_API_KEY_MIGRATION_TENANT_ID,
      runtime_binding_verified: true,
    });
  });
});

describe("Northstar-only provenance exception", () => {
  it("accepts the exact all-null Northstar shape and an expired legacy JWT", async () => {
    armNorthstar();
    wireNorthstar();
    const receipt = await migrateAuthorizedNorthstarAgentApiKey();
    expect(receipt).toMatchObject({
      tenant_id: NORTHSTAR_AGENT_API_KEY_MIGRATION_TENANT_ID,
      credential_id: CREDENTIAL_ID,
      agent_id: AGENT_ID,
      profile: "bff_service_v1",
      audience: RESOURCE,
      ttl_seconds: 300,
      direct_key_status: 401,
      in_scope_read_status: 200,
      out_of_scope_status: 403,
      exchange_verified: true,
      scope_denial_verified: true,
      key_lifecycle_verified: true,
      runtime_binding_verified: true,
    });
    expect(storage.rows.get(NORTHSTAR_AGENT_API_KEY_MIGRATION_TENANT_ID)?.token).toBe(
      NEW_KEY,
    );
  });

  for (const [field, marker] of [
    ["provisioning_state", "ready_demo"],
    ["data_profile", "synthetic_brightline_v1"],
    ["access_stage", "demo"],
  ] as const) {
    it(`rejects a ${field} demo marker for Northstar`, async () => {
      armNorthstar();
      wireNorthstar();
      tenancy.getTenantProvenance.mockResolvedValue(northstarProvenance({ [field]: marker }));
      await expect(migrateAuthorizedNorthstarAgentApiKey()).rejects.toThrow(/demo marker/);
      expect(tenancy.issueBffAgentApiKey).not.toHaveBeenCalled();
    });
  }

  it("rejects demo_seed true and kind demo", async () => {
    armNorthstar();
    wireNorthstar();
    tenancy.getTenantProvenance.mockResolvedValue(northstarProvenance({ demo_seed: true }));
    await expect(migrateAuthorizedNorthstarAgentApiKey()).rejects.toThrow(/demo_seed marker/);
    tenancy.getTenantProvenance.mockResolvedValue(northstarProvenance({ kind: "demo" }));
    await expect(migrateAuthorizedNorthstarAgentApiKey()).rejects.toThrow(/not production/);
    expect(tenancy.issueBffAgentApiKey).not.toHaveBeenCalled();
  });

  it("rejects identical null provenance when the response names any other tenant", async () => {
    armNorthstar();
    wireNorthstar();
    tenancy.getTenantProvenance.mockResolvedValue(
      northstarProvenance({ tenant_id: "tnt_01M1MDWXR5K5NBQYF089D4ZKAA" }),
    );
    await expect(migrateAuthorizedNorthstarAgentApiKey()).rejects.toThrow(
      /not the individually approved tenant/,
    );
    expect(tenancy.issueBffAgentApiKey).not.toHaveBeenCalled();
  });

  it("rejects any non-null classification drift even when it is not a demo marker", async () => {
    armNorthstar();
    wireNorthstar();
    tenancy.getTenantProvenance.mockResolvedValue(
      northstarProvenance({ data_profile: "customer" }),
    );
    await expect(migrateAuthorizedNorthstarAgentApiKey()).rejects.toThrow(
      /differs from the individually approved null legacy shape/,
    );
    expect(tenancy.issueBffAgentApiKey).not.toHaveBeenCalled();
  });
});

describe("Northstar no-legacy-rollback cleanup", () => {
  it("revokes an unused key when exchange verification fails and leaves the dead JWT", async () => {
    armNorthstar();
    const legacy = wireNorthstar();
    exchangeMock = () => Promise.reject(new Error("exchange failed"));
    await expect(migrateAuthorizedNorthstarAgentApiKey()).rejects.toThrow(/exchange failed/);
    expect(tenancy.revokeAgentApiKey).toHaveBeenCalledWith(CREDENTIAL_ID);
    expect(storage.rows.get(NORTHSTAR_AGENT_API_KEY_MIGRATION_TENANT_ID)?.token).toBe(legacy);
    expect(storage.upsertBrainAgentToken).not.toHaveBeenCalled();
  });

  it("does not restore the dead JWT or revoke a key already referenced at runtime", async () => {
    armNorthstar();
    wireNorthstar({ directStatus: 200 });
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((message: unknown) => {
      errors.push(String(message));
    });
    await expect(migrateAuthorizedNorthstarAgentApiKey()).rejects.toThrow(/expected 401/);
    expect(storage.rows.get(NORTHSTAR_AGENT_API_KEY_MIGRATION_TENANT_ID)?.token).toBe(
      NEW_KEY,
    );
    expect(storage.upsertBrainAgentToken).toHaveBeenCalledTimes(1);
    expect(tenancy.revokeAgentApiKey).not.toHaveBeenCalled();
    expect(errors.join("\n")).toMatch(/MANUAL REPAIR REQUIRED/);
    expect(errors.join("\n")).toMatch(/expired legacy JWT was NOT restored/);
  });

  it("finds and revokes a newly created key after an ambiguous issuance failure", async () => {
    armNorthstar();
    const legacy = wireNorthstar();
    tenancy.issueBffAgentApiKey.mockRejectedValue(new Error("connection reset"));
    tenancy.listAgentApiKeys
      .mockReset()
      .mockResolvedValueOnce({ keys: [] })
      .mockResolvedValueOnce({ keys: [keyRecord()] });
    await expect(migrateAuthorizedNorthstarAgentApiKey()).rejects.toThrow(/connection reset/);
    expect(tenancy.revokeAgentApiKey).toHaveBeenCalledWith(CREDENTIAL_ID);
    expect(storage.rows.get(NORTHSTAR_AGENT_API_KEY_MIGRATION_TENANT_ID)?.token).toBe(legacy);
    expect(storage.upsertBrainAgentToken).not.toHaveBeenCalled();
  });
});
