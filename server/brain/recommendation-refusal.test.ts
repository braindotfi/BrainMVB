import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express, { type Express } from "express";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";

/**
 * GET /api/brain/recommendation must never hand a refusal to the dashboard.
 *
 * The Overview page renders this route's `text` as the tenant's spending insight.
 * Wiki Q&A answers a refusal with HTTP 200 and prose — "I couldn't produce a grounded
 * answer from the available evidence." — so a route that forwards `raw` unconditionally
 * prints that sentence on the dashboard, unprompted and with no question in sight.
 *
 * Mounts the real BFF router and mocks brain-core at fetch. Each test gets its own
 * router because the recommendation cache lives in the router's closure, and cache
 * behaviour is part of what is under test here.
 */

const PROVISION_SECRET = "test-provision-secret-recommendation";
const MEMBER_TOKEN = "MEMBER_TOKEN_recommendation";
const TENANT_ID = "tenant_recommendation";

process.env.BRAIN_DEMO_PROVISION_SECRET = PROVISION_SECRET;
process.env.BRAIN_API_BASE_URL = "https://api.brain.fi/v1";
delete process.env.BRAIN_AUTH_SIGN_KEY;
delete process.env.BRAIN_TENANCY_MODE;
delete process.env.BRAIN_PLATFORM_SERVICE_SECRET;
delete process.env.BRAIN_AUTH_JWT_SECRET;

const realFetch = globalThis.fetch;

let createBrainProxyRouter: typeof import("./proxy").createBrainProxyRouter;
let clearBrainTokenCache: typeof import("./auth").clearBrainTokenCache;

/** Queue of wiki payloads; each request shifts one, the last repeats. */
let wikiQueue: unknown[] = [];
let wikiCallCount = 0;

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function routeBrainCore(fullUrl: string): Response {
  const path = fullUrl.split("?")[0];
  if (path.endsWith("/demo/provision-run")) {
    return json({
      tenant_id: TENANT_ID,
      member_token: MEMBER_TOKEN,
      agent_token: "AGENT_TOKEN_recommendation",
      expires_in: 1800,
    });
  }
  if (path.endsWith("/wiki/question")) {
    wikiCallCount += 1;
    const next = wikiQueue.length > 1 ? wikiQueue.shift() : wikiQueue[0];
    return json(next ?? {});
  }
  throw new Error(`unexpected brain-core call in recommendation test: ${path}`);
}

beforeAll(async () => {
  globalThis.fetch = (async (input: unknown, init: RequestInit = {}) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    if (!url.startsWith("https://api.brain.fi")) return realFetch(input as never, init as never);
    return routeBrainCore(url);
  }) as typeof fetch;

  ({ createBrainProxyRouter } = await import("./proxy"));
  ({ clearBrainTokenCache } = await import("./auth"));
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

beforeEach(() => {
  wikiQueue = [];
  wikiCallCount = 0;
  clearBrainTokenCache();
});

/** Fresh router (and therefore a fresh recommendation cache) per test. */
async function withServer(
  fn: (get: () => Promise<{ status: number; body: Record<string, unknown> }>) => Promise<void>,
): Promise<void> {
  const app: Express = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { session: { userId: string } }).session = { userId: "user-recommendation" };
    next();
  });
  app.use("/api/brain", createBrainProxyRouter());

  let server: Server | undefined;
  try {
    await new Promise<void>((done) => {
      server = app.listen(0, done);
    });
    const { port } = server!.address() as AddressInfo;
    await fn(async () => {
      const r = await realFetch(`http://127.0.0.1:${port}/api/brain/recommendation`);
      return { status: r.status, body: (await r.json()) as Record<string, unknown> };
    });
  } finally {
    server?.close();
  }
}

const REFUSAL = "I couldn't produce a grounded answer from the available evidence.";

describe("GET /api/brain/recommendation - refusals never reach the dashboard", () => {
  it("withholds an explicit answered:false refusal instead of forwarding the prose", async () => {
    await withServer(async (get) => {
      wikiQueue = [{ answered: false, answer: REFUSAL, evidence_ids: ["txn_1"] }];
      const { status, body } = await get();

      expect(status).toBe(200);
      // `{}` is the shape the unconfigured and error paths already return, so the
      // dashboard falls through to its own neutral line.
      expect(body.text).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain("grounded answer");
    });
  });

  it("withholds legacy refusal prose that arrives with no answered field", async () => {
    // The older brain-core shape: refusal detectable only by its wording.
    await withServer(async (get) => {
      wikiQueue = [{ answer: REFUSAL, evidence_ids: ["txn_1"] }];
      const { body } = await get();

      expect(body.text).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain("grounded answer");
    });
  });

  it("withholds an answered:true response whose content is empty", async () => {
    await withServer(async (get) => {
      wikiQueue = [{ answered: true, answer: null, evidence_ids: ["txn_1"] }];
      const { body } = await get();
      expect(body.text).toBeUndefined();
    });
  });

  it("withholds refusal prose even when upstream wrongly flags it answered:true", async () => {
    /* `answered` only consults the refusal wording when the field is ABSENT, so an
       upstream that sets answered:true and returns a refusal anyway would otherwise
       sail straight through onto the dashboard. Chat can trust the flag because it
       labels a no-answer as such; this card renders bare prose as the tenant's own
       insight, so it checks the wording too. */
    await withServer(async (get) => {
      wikiQueue = [{ answered: true, answer: REFUSAL, evidence_ids: ["txn_1"] }];
      const { body } = await get();

      expect(body.text).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain("grounded answer");
    });
  });

  it("withholds the other known refusal phrasings, not just the one seen in the wild", async () => {
    const variants = [
      "I could not provide a grounded answer from the available evidence.",
      "I'm unable to produce a grounded answer.",
      "No grounded answer could be produced.",
    ];
    for (const answer of variants) {
      await withServer(async (get) => {
        wikiQueue = [{ answered: true, answer }];
        expect((await get()).body.text, answer).toBeUndefined();
      });
    }
  });

  it("does not cache a refusal, so the insight returns as soon as brain-core recovers", async () => {
    /* The reason this matters: the success path caches for 15 minutes. Caching a
       refusal too would pin that sentence to the dashboard for the full window even
       after brain-core started answering again. */
    await withServer(async (get) => {
      wikiQueue = [
        { answered: false, answer: REFUSAL },
        { answered: true, answer: "Spending is down 12% on last month." },
      ];

      const first = await get();
      expect(first.body.text).toBeUndefined();

      const second = await get();
      expect(second.body.text).toBe("Spending is down 12% on last month.");
      expect(wikiCallCount).toBe(2); // the refusal did not satisfy the second request
    });
  });

  it("still forwards a genuine grounded insight, with its evidence", async () => {
    // The guard must not swallow real answers.
    await withServer(async (get) => {
      wikiQueue = [
        {
          answered: true,
          answer: "You have 73,000.00 USD in outstanding invoices.",
          evidence_ids: ["obl_1", "obl_2"],
        },
      ];
      const { body } = await get();

      expect(body.text).toBe("You have 73,000.00 USD in outstanding invoices.");
      expect(body.evidenceIds).toEqual(["obl_1", "obl_2"]);
    });
  });

  it("caches a genuine insight rather than re-asking on every dashboard load", async () => {
    await withServer(async (get) => {
      wikiQueue = [{ answered: true, answer: "Runway is 7 months." }];

      expect((await get()).body.text).toBe("Runway is 7 months.");
      expect((await get()).body.text).toBe("Runway is 7 months.");
      expect(wikiCallCount).toBe(1);
    });
  });
});
