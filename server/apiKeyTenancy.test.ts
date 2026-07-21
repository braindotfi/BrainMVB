/**
 * API key tenancy-boundary regression suite.
 *
 * Pins the safety-critical property of the key-authed data endpoints
 * (registerKeyAuthedRead in server/routes.ts): a key reads brain-core with
 * the MEMBER session of the user who ISSUED the key — never anyone else's.
 * A regression that resolves the wrong user's session would leak another
 * tenant's financial data. Also pins scope enforcement (403
 * insufficient_scope), 401 for unknown/revoked keys, and the lastUsedAt
 * touch on authorized calls.
 *
 * Runs the real Express routes with the brain-core client, brain auth,
 * session auth, and proxy mocked out.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { storage, type IStorage } from "./storage";
import { generateApiKey } from "./developers";

// The mocked ./storage below replaces the singleton with a MemStorage
// instance, so this import IS that instance.
const memStorage: IStorage = storage;

// getBrainSession must be called with the ISSUING user's id; the token it
// returns is what the brain-core client is called with. The brain-core
// client mocks echo back which member token they were given, so the test
// can assert whose ledger a key actually read.
const { getBrainSession, listLedgerAccounts, listLedgerTransactions, listAuditEvents } =
  vi.hoisted(() => ({
    getBrainSession: vi.fn(async (userId: string) => ({
      token: `member-token-for-${userId}`,
      tenantId: `tenant-of-${userId}`,
    })),
    listLedgerAccounts: vi.fn(async (token: string) => ({
      accounts: [{ id: `acct-read-with-${token}` }],
    })),
    listLedgerTransactions: vi.fn(async (token: string) => ({
      transactions: [{ id: `txn-read-with-${token}` }],
    })),
    listAuditEvents: vi.fn(async (token: string) => ({
      events: [{ id: `evt-read-with-${token}` }],
    })),
  }));

vi.mock("./storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./storage")>();
  return { ...actual, storage: new actual.MemStorage() };
});

vi.mock("./auth", () => ({
  setupAuth: () => {},
  googleEnabled: () => false,
  requireAuth: (_req: unknown, res: any) => res.status(401).json({ error: "unauthorized" }),
}));

vi.mock("./brain/proxy", () => ({
  createBrainProxyRouter: () => express.Router(),
}));

vi.mock("./brain/config", () => ({
  brainAuthConfigured: () => true,
  platformServiceConfigured: () => false,
  brainTenancyMode: () => "demo",
}));

vi.mock("./brain/auth", () => ({
  getBrainSession: (userId: string) => getBrainSession(userId),
  getBrainSessionProvisionedAt: () => null,
}));

vi.mock("./brain/client", () => {
  class BrainApiError extends Error {
    status: number;
    constructor(status: number) {
      super(`brain ${status}`);
      this.status = status;
    }
  }
  const unused = () => Promise.reject(new Error("not under test"));
  return {
    BrainApiError,
    listLedgerAccounts: (token: string, opts: unknown) => listLedgerAccounts(token, opts as never),
    listLedgerTransactions: (token: string, opts: unknown) =>
      listLedgerTransactions(token, opts as never),
    listAuditEvents: (token: string, opts: unknown) => listAuditEvents(token, opts as never),
    listLedgerCounterparties: unused,
    listLedgerInvoices: unused,
    listObligations: unused,
    listMembers: unused,
    getApprovalPolicyFacts: unused,
    listActions: unused,
    getPaymentIntent: unused,
    ingestRawDocument: unused,
    extractRawDocument: unused,
    askWikiQuestion: unused,
  };
});

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: () => Promise.reject(new Error("not under test")) };
  },
}));

async function mintKey(
  userId: string,
  scopes: string[],
): Promise<{ plaintext: string; id: string }> {
  const generated = generateApiKey("sandbox");
  const row = await memStorage.createApiKey({
    userId,
    tenantId: null,
    name: `key of ${userId}`,
    environment: "sandbox",
    scopes,
    keyPrefix: generated.keyPrefix,
    keyLast4: generated.keyLast4,
    hashedSecret: generated.hashedSecret,
    rotatedFromId: null,
  });
  return { plaintext: generated.plaintext, id: row.id };
}

let server: Server;
let baseUrl: string;

async function get(path: string, key?: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  });
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  const { registerRoutes } = await import("./routes");
  const app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  server = await registerRoutes(httpServer, app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

describe("key-authed reads: tenancy boundary", () => {
  it("each key reads brain-core via its ISSUING user's session — never another user's", async () => {
    const alice = await mintKey("user-alice", ["ledger:read"]);
    const bob = await mintKey("user-bob", ["ledger:read"]);

    const aliceRes = await get("/api/v1/ledger/accounts", alice.plaintext);
    expect(aliceRes.status).toBe(200);
    expect(getBrainSession).toHaveBeenLastCalledWith("user-alice");
    expect(aliceRes.body.accounts[0].id).toBe("acct-read-with-member-token-for-user-alice");

    const bobRes = await get("/api/v1/ledger/accounts", bob.plaintext);
    expect(bobRes.status).toBe(200);
    expect(getBrainSession).toHaveBeenLastCalledWith("user-bob");
    expect(bobRes.body.accounts[0].id).toBe("acct-read-with-member-token-for-user-bob");

    // The data each key saw is disjoint: Bob's key never surfaced anything
    // derived from Alice's member token.
    expect(JSON.stringify(bobRes.body)).not.toContain("user-alice");
    expect(JSON.stringify(aliceRes.body)).not.toContain("user-bob");
  });

  it("all three data endpoints resolve the session from the key's own userId", async () => {
    const key = await mintKey("user-carol", ["ledger:read", "audit:read"]);
    getBrainSession.mockClear();

    const txns = await get("/api/v1/ledger/transactions", key.plaintext);
    expect(txns.status).toBe(200);
    expect(txns.body.transactions[0].id).toBe("txn-read-with-member-token-for-user-carol");

    const events = await get("/api/v1/audit/events", key.plaintext);
    expect(events.status).toBe(200);
    expect(events.body.events[0].id).toBe("evt-read-with-member-token-for-user-carol");

    expect(getBrainSession.mock.calls.every(([uid]) => uid === "user-carol")).toBe(true);
  });

  it("touches lastUsedAt on every authorized call, attributed to the issuing user", async () => {
    const key = await mintKey("user-dave", ["ledger:read"]);
    expect((await memStorage.getApiKey("user-dave", key.id))?.lastUsedAt).toBeNull();

    const res = await get("/api/v1/ledger/accounts", key.plaintext);
    expect(res.status).toBe(200);

    const touched = await memStorage.getApiKey("user-dave", key.id);
    expect(touched?.lastUsedAt).toBeInstanceOf(Date);
  });
});

describe("key-authed reads: scope enforcement", () => {
  it("a key without the needed scope gets 403 insufficient_scope and never reaches brain-core", async () => {
    const key = await mintKey("user-erin", ["audit:read"]);
    getBrainSession.mockClear();
    listLedgerAccounts.mockClear();

    const res = await get("/api/v1/ledger/accounts", key.plaintext);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("insufficient_scope");
    expect(getBrainSession).not.toHaveBeenCalled();
    expect(listLedgerAccounts).not.toHaveBeenCalled();

    // ...and lastUsedAt is NOT touched on a rejected call.
    expect((await memStorage.getApiKey("user-erin", key.id))?.lastUsedAt).toBeNull();
  });

  it("audit:read alone does not grant ledger reads, and vice versa", async () => {
    const auditOnly = await mintKey("user-frank", ["audit:read"]);
    const ledgerOnly = await mintKey("user-frank", ["ledger:read"]);

    expect((await get("/api/v1/ledger/transactions", auditOnly.plaintext)).status).toBe(403);
    expect((await get("/api/v1/audit/events", ledgerOnly.plaintext)).status).toBe(403);
    expect((await get("/api/v1/audit/events", auditOnly.plaintext)).status).toBe(200);
    expect((await get("/api/v1/ledger/transactions", ledgerOnly.plaintext)).status).toBe(200);
  });
});

describe("key-authed reads: authentication", () => {
  it("unknown key → 401, missing header → 401; brain-core is never consulted", async () => {
    getBrainSession.mockClear();

    const unknown = await get("/api/v1/ledger/accounts", generateApiKey("sandbox").plaintext);
    expect(unknown.status).toBe(401);
    expect(unknown.body.error).toBe("invalid_api_key");

    const missing = await get("/api/v1/ledger/accounts");
    expect(missing.status).toBe(401);
    expect(missing.body.error).toBe("missing_api_key");

    expect(getBrainSession).not.toHaveBeenCalled();
  });

  it("a revoked key stops working immediately with 401", async () => {
    const key = await mintKey("user-grace", ["ledger:read"]);
    expect((await get("/api/v1/ledger/accounts", key.plaintext)).status).toBe(200);

    await memStorage.revokeApiKey("user-grace", key.id);
    getBrainSession.mockClear();

    const res = await get("/api/v1/ledger/accounts", key.plaintext);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_api_key");
    expect(getBrainSession).not.toHaveBeenCalled();
  });
});
