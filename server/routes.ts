import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import Anthropic from "@anthropic-ai/sdk";
import { setupAuth, googleEnabled, requireAuth } from "./auth";
import { keccak256, toBytes } from "viem";
import { storage } from "./storage";
import { z } from "zod";
import {
  computeBrainAccountAddress,
  getDeployedAccount,
  deployBrainAccount,
  getOnChainAgentConfig,
  getAgentBalance,
  getRemainingBudget,
  getAgentPolicyHash,
  getRegistryRecord,
  getAgentReputation,
  formatUsdc,
  DEPLOYED_ADDRESSES,
  CONTRACT_MODE,
} from "./contractService";
import {
  processPaymentIntent,
  processTradeIntent,
  computePolicyHash,
  type AgentPolicy,
  type PaymentIntent,
  type TradeIntent,
} from "./policyEngine";
import {
  WirexCard,
  createWirexUser,
  getWirexUser,
  getWirexWallets,
  getWirexCards,
  issueVirtualCard,
  getWirexBankAccounts,
  getWirexTransactions,
} from "./wirex";
import { generateInsights, getInsightsState, type DailyInsight } from "./insightsService";
import { createBrainProxyRouter } from "./brain/proxy";
import { getBrainSession } from "./brain/auth";
import { askWikiQuestion, type WikiEvidence } from "./brain/client";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Safely convert a JSON-serialised numeric value to BigInt.
 * Throws a descriptive Error (caught by the route try/catch) if the value is
 * not a valid integer string, preventing server crashes from malformed input.
 */
function safeBigInt(val: unknown, field: string): bigint {
  const str = String(val ?? "0").trim();
  if (!/^-?\d+$/.test(str)) {
    throw new Error(`Invalid integer value for "${field}": ${str}`);
  }
  return BigInt(str);
}

// ─── Agent Runtime (ReAct Loop) ────────────────────────────────────────────────
const BRAIN_TOOLS: Anthropic.Tool[] = [
  {
    name: "check_balance",
    description: "Check the current USDC balance of the agent sub-account",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_policy",
    description: "Retrieve the agent's current spending policy configuration",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "record_action",
    description: "Write an observation or decision to agent memory",
    input_schema: {
      type: "object" as const,
      properties: {
        observation: { type: "string", description: "What happened or was decided" },
        actionType: { type: "string", description: "Category: trade|payment|analysis|error" },
      },
      required: ["observation"],
    },
  },
  {
    name: "pay_x402",
    description: "Execute an x402 payment to an external service URL",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "Target resource URL" },
        amount: { type: "string", description: "Amount in USDC (e.g. '1.50')" },
        merchant: { type: "string", description: "Merchant wallet address or name" },
      },
      required: ["url", "amount", "merchant"],
    },
  },
  {
    name: "analyze_market",
    description: "Analyze current market conditions for a given token or asset",
    input_schema: {
      type: "object" as const,
      properties: {
        asset: { type: "string", description: "Asset symbol e.g. ETH, USDC, BTC" },
        timeframe: { type: "string", description: "Timeframe: 1h | 4h | 1d | 1w" },
      },
      required: ["asset"],
    },
  },
];

async function runAgentLoop(
  agentId: string,
  objective: string,
  policy: object,
  memories: Array<{ content: string; actionType: string | null }>
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `You are an autonomous financial agent on Brain Finance.
Agent ID: ${agentId}
Objective: ${objective}
Policy: ${JSON.stringify(policy)}
Recent memory: ${JSON.stringify(memories.slice(-5))}

Execute the objective within your policy constraints. Use tools to act. When complete, summarize what you did.`,
    },
  ];

  let maxIterations = 8;
  let finalSummary = "Agent completed its objective.";

  while (maxIterations-- > 0) {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 2048,
      tools: BRAIN_TOOLS,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      const lastText = response.content.find(b => b.type === "text");
      if (lastText && lastText.type === "text") finalSummary = lastText.text;
      break;
    }

    if (response.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        let result: object = {};
        switch (block.name) {
          case "check_balance":
            result = { balance: "5000.00", currency: "USDC", agentId };
            break;
          case "get_policy":
            result = policy;
            break;
          case "record_action": {
            const inp = block.input as { observation: string; actionType?: string };
            await storage.addMemory({ agentId, content: inp.observation, actionType: inp.actionType ?? "observation", metadata: null });
            result = { recorded: true };
            break;
          }
          case "pay_x402": {
            const inp = block.input as { url: string; amount: string; merchant: string };
            const tx = await storage.addTransaction({
              agentId, txHash: null, intentHash: null,
              resourceUri: inp.url, amountUsdc: inp.amount,
              merchant: inp.merchant, status: "pending", blockNumber: null,
            });
            result = { success: true, txId: tx.id, status: "pending", message: `Payment of ${inp.amount} USDC to ${inp.merchant} initiated.` };
            break;
          }
          case "analyze_market": {
            const inp = block.input as { asset: string; timeframe?: string };
            result = {
              asset: inp.asset,
              price: inp.asset === "ETH" ? 3250.42 : 1.00,
              change24h: "+2.3%",
              volume24h: "$1.2B",
              sentiment: "bullish",
              recommendation: "Hold — momentum positive, await confirmation.",
            };
            break;
          }
          default:
            result = { error: "Unknown tool" };
        }
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      }
      messages.push({ role: "user", content: toolResults });
    }
  }

  return finalSummary;
}

const GOAL_REC_FALLBACK_DEFAULT =
  "Set a target tied to one of your live metrics — e.g. operating cash, monthly burn, or AR — and Brain will keep agents aligned to it.";
const GOAL_REC_FALLBACK: Record<string, string> = {
  "Pay Off Debt":
    "Target paying down the $1.2M term loan at 9.5% APR — clearing $400K this year saves ~$38K in interest and frees $9K/mo of cash flow.",
  "Build Reserve":
    "Aim for $11M in reserves to clear the 18-month runway bar against $612K monthly burn — current $4.8M leaves you ~6 months short.",
  "Hit Milestone":
    "With revenue at $1.42M last quarter and ~9% QoQ growth, $5M ARR is reachable in ~4 quarters — set it as the milestone and Brain will pace bookings.",
  "Cut Spend":
    "AI Agents and SaaS are 77% of spend. Trimming 15% off SaaS alone saves ~$8K/mo — set that as your monthly reduction target.",
  "Capital Deploy":
    "$42K is idle in operating cash. Deploy it to the USDC yield vault at 1.16% APY for ~$487/yr, or earmark it for the AlphaFlow agent at current trade cadence.",
  "Other":
    "Pick a number you want to move — runway, ARR, AR collected, burn — and Brain will translate it into agent budgets and policies.",
};

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // ─────────────────────────────────────────────────────────────
  // AUTH (session + email/password + Google OAuth)
  // ─────────────────────────────────────────────────────────────
  setupAuth(app);

  // ─────────────────────────────────────────────────────────────
  // BRAIN-CORE BFF PROXY (session → tenant JWT → api.brain.fi)
  // Reads flow through here; the browser never sees a brain-core JWT.
  // ─────────────────────────────────────────────────────────────
  app.use("/api/brain", createBrainProxyRouter());

  // ─────────────────────────────────────────────────────────────
  // ACCOUNT / BANKING
  // ─────────────────────────────────────────────────────────────
  app.get("/api/account/balance", async (req, res) => {
    // In production: query BrainAccount contract via Alchemy RPC
    return res.json({
      usdc: "5000.00",
      eth: "1.2450",
      totalUsd: "9043.13",
      currency: "USD",
    });
  });

  app.get("/api/account/assets", async (req, res) => {
    return res.json([
      { symbol: "USDC", name: "USD Coin", balance: "5000.00", usdValue: "5000.00", change24h: "0.00%", icon: "💵" },
      { symbol: "ETH", name: "Ethereum", balance: "1.2450", usdValue: "4043.13", change24h: "+2.30%", icon: "⟠" },
      { symbol: "MATIC", name: "Polygon", balance: "850.00", usdValue: "612.00", change24h: "-1.20%", icon: "⬡" },
      { symbol: "BNB", name: "BNB Chain", balance: "2.10", usdValue: "1281.00", change24h: "+0.80%", icon: "🔶" },
    ]);
  });

  app.get("/api/account/transactions", async (req, res) => {
    return res.json([
      { id: "1", type: "deposit", asset: "USDC", amount: "2500.00", status: "confirmed", timestamp: new Date(Date.now() - 3600000), description: "Deposit from Coinbase" },
      { id: "2", type: "trade", asset: "ETH", amount: "0.5", status: "confirmed", timestamp: new Date(Date.now() - 7200000), description: "Buy ETH via AlphaFlow" },
      { id: "3", type: "payment", asset: "USDC", amount: "150.00", status: "confirmed", timestamp: new Date(Date.now() - 86400000), description: "x402 payment to API service" },
    ]);
  });

  // DELETE /api/account — permanently delete the authenticated user's account and
  // all associated records. The target user is derived from the session — never the body.
  app.delete("/api/account", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const result = await storage.deleteUserAccount({ userId });
      req.session.destroy(() => {});
      return res.json({ success: true, deleted: result });
    } catch (error: any) {
      console.error("Delete account error:", error);
      return res.status(500).json({ error: error?.message || "Failed to delete account" });
    }
  });

  // DELETE /api/account/data — purge all user-owned records (memories,
  // transactions, notifications) but KEEP the user account itself so the user
  // remains logged in and can rebuild their data from scratch.
  // The target user is derived from the session — never the body.
  app.delete("/api/account/data", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const result = await storage.deleteUserData({ userId });
      return res.json({ success: true, deleted: result });
    } catch (error: any) {
      console.error("Delete data error:", error);
      return res.status(500).json({ error: error?.message || "Failed to delete data" });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // GOAL RECOMMENDATIONS (Claude-powered)
  // For the "New Goal" modal — given a category the user picks in
  // the "What's it for?" tabs, returns a 1–2 sentence personalised
  // recommendation grounded in the demo account snapshot.
  // ─────────────────────────────────────────────────────────────
  const goalRecCache = new Map<string, { text: string; at: number }>();
  const GOAL_REC_TTL_MS = 30 * 60 * 1000; // 30 minutes

  const GOAL_ACCOUNT_CONTEXT = `
ACME Inc. business snapshot (USD):
- Operating cash: $4.8M; monthly burn: $612K (runway ≈ 7.8 months)
- Revenue last quarter: $1.42M, growing ~9% QoQ
- Outstanding debt: $1.2M term loan @ 9.5% APR ($28K monthly service)
- Idle cash not earning yield: $42K in operating account
- AR overdue >30 days: $187K across 4 customers
- Treasury yield earned this month: $548 (1.16% APY on $51K)
- AlphaFlow trading volume this week: 47 trades (18% above 30-day avg)
- Largest spend categories: AI Agents 48%, SaaS 29%, Vendor payments 16%
- Active goals: "Hit $5M ARR" (priority 88), "Reach 18-month runway" (64), "Q4 marketing budget" (35)
`.trim();

  const GOAL_REC_SYSTEM = `You are Brain AI, the financial brain embedded in a neobank for businesses.
The user is creating a new goal and just picked a CATEGORY in the "What's it for?" tabs.
Given the company's account snapshot, return ONE concrete, numeric recommendation
(1–2 short sentences, max ~220 chars) tailored to that category — what target to
set and why, grounded in the snapshot's actual numbers.

Rules:
- Plain prose, no markdown, no bullet points, no leading label.
- Reference real numbers from the snapshot (dollars, percentages, months).
- Do not greet, do not restate the category. Just the recommendation.`;

  app.get("/api/goals/recommendation", async (req, res) => {
    const category = String(req.query.category ?? "").slice(0, 64);
    if (!category) return res.status(400).json({ error: "category required" });

    const cached = goalRecCache.get(category);
    if (cached && Date.now() - cached.at < GOAL_REC_TTL_MS) {
      return res.json({ text: cached.text, cached: true });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.json({ text: GOAL_REC_FALLBACK[category] ?? GOAL_REC_FALLBACK_DEFAULT, cached: false, fallback: true });
    }

    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const message = await anthropic.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 220,
        system: GOAL_REC_SYSTEM,
        messages: [
          {
            role: "user",
            content: `Snapshot:\n${GOAL_ACCOUNT_CONTEXT}\n\nCategory the user picked: "${category}".\n\nReturn the recommendation as plain text.`,
          },
        ],
      });
      const text = (message.content[0]?.type === "text" ? message.content[0].text : "").trim();
      const clean = text.replace(/^["'`]+|["'`]+$/g, "").trim();
      if (!clean) throw new Error("empty recommendation");
      goalRecCache.set(category, { text: clean, at: Date.now() });
      return res.json({ text: clean, cached: false });
    } catch (err) {
      console.error("[GoalRec] generation failed:", err);
      return res.json({
        text: GOAL_REC_FALLBACK[category] ?? GOAL_REC_FALLBACK_DEFAULT,
        cached: false,
        fallback: true,
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // BRAIN ASSISTANT CHAT (Claude-powered)
  // Powers the right-hand Brain Assistant panel. Takes the running
  // conversation and returns Claude's next reply.
  // ─────────────────────────────────────────────────────────────
  const ASSISTANT_SYSTEM = `You are Brain, the AI financial assistant inside Brain Finance — a programmable neobank for businesses on Base L2.
Help the user with their finances, accounts, transactions, crypto basics, and how to use the platform.
Be concise, warm, and practical: default to 1–4 short sentences unless the user asks for more detail.
Use plain prose (no markdown headings or bullet dumps unless genuinely helpful).
You can explain concepts and surface general guidance, but do not give regulated/individualized investment advice — instead point users to their own data and let them decide.`;

  const assistantChatSchema = z.object({
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().min(1).max(8000),
        }),
      )
      .min(1)
      .max(50),
  });

  app.post("/api/assistant/chat", requireAuth, async (req, res) => {
    const parsed = assistantChatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_messages" });
    }

    // Best-effort: ground the answer in brain-core's Wiki (the user's real
    // Ledger). If brain-core is unreachable/unconfigured we silently proceed
    // ungrounded, so the assistant never breaks on the integration.
    let grounding = "";
    let sources: WikiEvidence[] = [];
    try {
      const lastUser = [...parsed.data.messages].reverse().find((m) => m.role === "user");
      if (lastUser) {
        const { token } = await getBrainSession(req.session.userId!);
        const wiki = await askWikiQuestion(token, lastUser.content);
        if (wiki.raw) {
          grounding = wiki.raw;
          sources = wiki.evidence;
        }
      }
    } catch (e) {
      console.warn("[Assistant] wiki grounding skipped:", (e as Error)?.message);
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      // No LLM to phrase the answer — return the grounded data directly if we have it.
      if (grounding) {
        return res.json({ reply: grounding, sources });
      }
      return res.status(503).json({
        error: "assistant_unconfigured",
        reply:
          "I'm not connected to my brain yet — an ANTHROPIC_API_KEY needs to be configured before I can answer live.",
      });
    }

    const system = grounding
      ? `${ASSISTANT_SYSTEM}\n\nGrounded financial data from Brain (the user's real accounts and transactions — treat this as the source of truth and answer from it, citing concrete figures; do not invent numbers):\n${grounding}`
      : ASSISTANT_SYSTEM;

    try {
      const message = await anthropic.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 1024,
        system,
        messages: parsed.data.messages,
      });
      const reply = (message.content.find((b) => b.type === "text") as
        | Anthropic.TextBlock
        | undefined)?.text?.trim();
      return res.json({ reply: reply || "Sorry, I couldn't generate a response. Please try again.", sources });
    } catch (err) {
      console.error("[Assistant] chat failed:", err);
      const status = (err as { status?: number })?.status;
      const e = err as {
        message?: string;
        error?: { message?: string; error?: { message?: string } };
      };
      const apiMsg =
        e?.error?.error?.message ?? e?.error?.message ?? e?.message ?? "";
      if (status === 400 && /credit balance/i.test(apiMsg)) {
        return res.status(402).json({
          error: "assistant_no_credit",
          reply:
            "I can't answer right now — the Anthropic API key has no available credit. Please add credits or billing at console.anthropic.com to enable live answers.",
        });
      }
      return res.status(500).json({
        error: "assistant_failed",
        reply: "Something went wrong reaching the assistant. Please try again.",
      });
    }
  });

  app.post("/api/account/allocate", async (req, res) => {
    try {
      const { agentId, amount, asset } = req.body;
      if (!agentId || !amount) return res.status(400).json({ error: "agentId and amount required" });
      return res.json({ success: true, agentId, amount, asset: asset ?? "USDC", message: "Capital allocated to agent sub-account." });
    } catch (error) {
      return res.status(500).json({ error: "Failed to allocate capital" });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // SIWE AUTH
  // ─────────────────────────────────────────────────────────────
  app.get("/api/auth/nonce", async (req, res) => {
    try {
      const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min
      await storage.createNotification({
        userId: `nonce:${nonce}`,
        type: "NONCE",
        title: nonce,
        body: expiresAt.toISOString(),
        data: {},
        read: false,
      });
      return res.json({ nonce });
    } catch (error) {
      return res.status(500).json({ error: "Failed to generate nonce" });
    }
  });

  app.post("/api/auth/verify", async (req, res) => {
    try {
      const { address, message, signature } = req.body;
      if (!address || !message || !signature) {
        return res.status(400).json({ error: "address, message, and signature required" });
      }
      // In production: verify SIWE message with viem/siwe library
      // For now: trust the address and upsert the user
      let user = await storage.getUserByWallet(address);
      if (!user) {
        user = await storage.createUser({ username: address.slice(0, 8) + "..." + address.slice(-4), password: "", walletAddress: address });
      }
      return res.json({ success: true, user: { id: user.id, walletAddress: user.walletAddress, username: user.username } });
    } catch (error) {
      console.error("SIWE verify error:", error);
      return res.status(500).json({ error: "Authentication failed" });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // PUBLIC CONFIG — exposes non-secret public keys to the frontend
  // ─────────────────────────────────────────────────────────────
  app.get("/api/config", (_req, res) => {
    return res.json({
      googleEnabled,
    });
  });

  // ─────────────────────────────────────────────────────────────
  // WIREX INTEGRATION
  // ─────────────────────────────────────────────────────────────

  // POST /api/wirex/onboard — provision WireX accounts for the logged-in user.
  // The target user is derived from the session — body identifiers are ignored
  // so a caller can never provision/read another user's data (IDOR).
  app.post("/api/wirex/onboard", requireAuth, async (req, res) => {
    try {
      const sessionUser = await storage.getUser(req.session.userId!);
      const email = sessionUser?.email;
      const walletAddress = sessionUser?.walletAddress ?? undefined;
      console.log("[Onboard] userId:", sessionUser?.id, "email:", email, "walletAddress:", walletAddress);
      if (!email) return res.status(400).json({ error: "No email on account" });
      const userId = sessionUser?.id;

      // Check/create WireX user
      let wirexUser = await getWirexUser(email).catch((e) => { console.error("[Onboard] getUser error:", e.message); return null; });
      console.log("[Onboard] wirexUser after get:", JSON.stringify(wirexUser)?.slice(0, 200));
      if (!wirexUser) {
        await createWirexUser(email, walletAddress || userId || "").catch((e) => { console.error("[Onboard] createUser error:", e.message); });
        wirexUser = await getWirexUser(email).catch(() => null);
        console.log("[Onboard] wirexUser after create+get:", JSON.stringify(wirexUser)?.slice(0, 200));
      }

      // Fetch accounts
      const [wallets, cards, bankAccounts] = await Promise.all([
        getWirexWallets(email).catch((): never[] => []),
        getWirexCards(email).catch((): WirexCard[] => []),
        getWirexBankAccounts(email).catch((): never[] => []),
      ]);

      // If no virtual card yet, try to issue one
      if (cards.length === 0 && wirexUser) {
        const fullName = wirexUser?.personal_info
          ? `${wirexUser.personal_info.first_name} ${wirexUser.personal_info.last_name}`
          : email.split("@")[0];
        await issueVirtualCard(email, fullName).catch(() => null);
        const newCards = await getWirexCards(email).catch((): WirexCard[] => []);
        cards.push(...newCards);
      }

      const displayName = wirexUser?.personal_info
        ? `${wirexUser.personal_info.first_name} ${wirexUser.personal_info.last_name}`
        : email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

      const accounts = [
        ...wallets.map((w: any) => ({
          id: w.id,
          type: "wallet" as const,
          address: w.address || w.wallet_address,
          balance: w.balance,
          currency: w.currency,
          nameOnAccount: displayName,
        })),
        ...cards.map((c: any) => ({
          id: c.id,
          type: "debit" as const,
          cardNumber: c.card_number ? c.card_number.replace(/(.{4})/g, "$1 ").trim() : undefined,
          cardExpiry: c.expiry || c.expiry_date,
          cardCvv: c.cvv,
          nameOnAccount: c.name_on_card || displayName,
          balance: c.balance,
          currency: c.currency,
        })),
        ...bankAccounts.map((b: any) => ({
          id: b.id,
          type: "bank" as const,
          iban: b.iban || b.account_number,
          nameOnAccount: b.name || displayName,
          balance: b.balance,
          currency: b.currency,
        })),
      ];

      // If WireX API is unavailable (no real accounts), return demo placeholder accounts
      // so the UI is populated. These will be replaced by real data once WireX credentials are valid.
      if (accounts.length === 0) {
        console.log("[Onboard] WireX unavailable — returning demo placeholder accounts for:", email);
        const seed = email.charCodeAt(0) + email.charCodeAt(1);
        const demoAccounts = [
          {
            id: "demo-wallet-1",
            type: "wallet" as const,
            address: walletAddress || `0x${seed.toString(16).padStart(4, "0")}3cB5a84f9E2d1${seed.toString(16).padStart(4, "0")}486A8`,
            balance: "2,040.30",
            currency: "USD",
            nameOnAccount: displayName,
          },
          {
            id: "demo-debit-1",
            type: "debit" as const,
            cardNumber: `${1600 + (seed % 99)} 0400 3201 ${6900 + (seed % 99)}`,
            cardExpiry: "12/27",
            cardCvv: `${500 + (seed % 99)}`,
            nameOnAccount: displayName,
            balance: "865,040.30",
            currency: "USD",
          },
          {
            id: "demo-bank-1",
            type: "bank" as const,
            iban: `AE07033${seed.toString().padStart(3, "0")}34567890123456`,
            nameOnAccount: displayName,
            balance: "12,500.00",
            currency: "USD",
          },
        ];
        return res.json({ success: true, accounts: demoAccounts, wirexUser: null, demo: true });
      }

      return res.json({ success: true, accounts, wirexUser });
    } catch (error: any) {
      console.error("WireX onboard error:", error);
      return res.status(500).json({ error: error.message || "WireX onboarding failed" });
    }
  });

  // GET /api/wirex/accounts — refresh accounts for the logged-in user.
  // Email is taken from the session, not the query string (prevents IDOR).
  app.get("/api/wirex/accounts", requireAuth, async (req, res) => {
    try {
      const sessionUser = await storage.getUser(req.session.userId!);
      const email = sessionUser?.email;
      if (!email) return res.status(400).json({ error: "No email on account" });

      const [wirexUser, wallets, cards, bankAccounts] = await Promise.all([
        getWirexUser(email).catch(() => null),
        getWirexWallets(email).catch((): never[] => []),
        getWirexCards(email).catch((): WirexCard[] => []),
        getWirexBankAccounts(email).catch((): never[] => []),
      ]);

      const displayName = wirexUser?.personal_info
        ? `${wirexUser.personal_info.first_name} ${wirexUser.personal_info.last_name}`
        : email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

      const accounts = [
        ...wallets.map((w: any) => ({
          id: w.id,
          type: "wallet" as const,
          address: w.address || w.wallet_address,
          balance: w.balance,
          currency: w.currency,
          nameOnAccount: displayName,
        })),
        ...cards.map((c: any) => ({
          id: c.id,
          type: "debit" as const,
          cardNumber: c.card_number ? c.card_number.replace(/(.{4})/g, "$1 ").trim() : undefined,
          cardExpiry: c.expiry || c.expiry_date,
          cardCvv: c.cvv,
          nameOnAccount: c.name_on_card || displayName,
          balance: c.balance,
          currency: c.currency,
        })),
        ...bankAccounts.map((b: any) => ({
          id: b.id,
          type: "bank" as const,
          iban: b.iban || b.account_number,
          nameOnAccount: b.name || displayName,
          balance: b.balance,
          currency: b.currency,
        })),
      ];

      if (accounts.length === 0) {
        const seed = email.charCodeAt(0) + email.charCodeAt(1);
        const demoAccounts = [
          {
            id: "demo-wallet-1",
            type: "wallet" as const,
            address: `0x${seed.toString(16).padStart(4, "0")}3cB5a84f9E2d1${seed.toString(16).padStart(4, "0")}486A8`,
            balance: "2,040.30",
            currency: "USD",
            nameOnAccount: displayName,
          },
          {
            id: "demo-debit-1",
            type: "debit" as const,
            cardNumber: `${1600 + (seed % 99)} 0400 3201 ${6900 + (seed % 99)}`,
            cardExpiry: "12/27",
            cardCvv: `${500 + (seed % 99)}`,
            nameOnAccount: displayName,
            balance: "865,040.30",
            currency: "USD",
          },
          {
            id: "demo-bank-1",
            type: "bank" as const,
            iban: `AE07033${seed.toString().padStart(3, "0")}34567890123456`,
            nameOnAccount: displayName,
            balance: "12,500.00",
            currency: "USD",
          },
        ];
        return res.json({ accounts: demoAccounts, demo: true });
      }

      return res.json({ accounts });
    } catch (error: any) {
      console.error("WireX accounts error:", error);
      return res.status(500).json({ error: error.message || "Failed to fetch accounts" });
    }
  });

  // GET /api/wirex/transactions — transactions for the logged-in user.
  // Email comes from the session; only accountId is read from the query.
  app.get("/api/wirex/transactions", requireAuth, async (req, res) => {
    try {
      const { accountId } = req.query as { accountId?: string };
      const sessionUser = await storage.getUser(req.session.userId!);
      const email = sessionUser?.email;
      if (!email) return res.status(400).json({ error: "No email on account" });
      const txs = await getWirexTransactions(email, accountId).catch(() => []);
      return res.json({ transactions: txs });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // ── Contract / Protocol Routes ─────────────────────────────────────────────

  /**
   * GET /api/contracts/info
   * Returns deployed contract addresses and chain config.
   */
  app.get("/api/contracts/info", (_req, res) => {
    res.json({
      mode: CONTRACT_MODE,
      chainId: parseInt(process.env.CHAIN_ID ?? "84532"),
      network: parseInt(process.env.CHAIN_ID ?? "84532") === 8453 ? "base" : "base-sepolia",
      contracts: DEPLOYED_ADDRESSES,
    });
  });

  /**
   * GET /api/contracts/account/:ownerAddress
   * Returns the BrainAccount address for a wallet (deployed or counterfactual).
   */
  app.get("/api/contracts/account/:ownerAddress", async (req, res) => {
    try {
      const { ownerAddress } = req.params;
      const [deployed, computed] = await Promise.all([
        getDeployedAccount(ownerAddress as `0x${string}`),
        computeBrainAccountAddress(ownerAddress as `0x${string}`),
      ]);
      res.json({
        ownerAddress,
        brainAccountAddress: deployed ?? computed,
        deployed: !!deployed,
        counterfactual: !deployed ? computed : null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/contracts/deploy-account
   * Deploy a BrainAccount for the authenticated user via the factory.
   * Body: { ownerAddress: string }
   */
  app.post("/api/contracts/deploy-account", async (req, res) => {
    try {
      const { ownerAddress } = req.body;
      if (!ownerAddress) return res.status(400).json({ error: "ownerAddress required" });

      const result = await deployBrainAccount(ownerAddress as `0x${string}`);
      res.json({
        success: true,
        txHash: result.hash,
        brainAccountAddress: result.address,
        demo: CONTRACT_MODE === "demo",
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/contracts/agent/:brainAccountAddress/:agentId
   * Read on-chain agent config and balance.
   */
  app.get("/api/contracts/agent/:brainAccountAddress/:agentId", async (req, res) => {
    try {
      const { brainAccountAddress, agentId } = req.params;
      const [config, balance, budget, policyHash] = await Promise.all([
        getOnChainAgentConfig(brainAccountAddress as `0x${string}`, agentId as `0x${string}`),
        getAgentBalance(brainAccountAddress as `0x${string}`, agentId as `0x${string}`),
        getRemainingBudget(brainAccountAddress as `0x${string}`, agentId as `0x${string}`),
        getAgentPolicyHash(brainAccountAddress as `0x${string}`, agentId as `0x${string}`),
      ]);
      res.json({
        agentId,
        brainAccountAddress,
        config: {
          ...config,
          spendLimit: config.spendLimit.toString(),
          timeWindowSeconds: config.timeWindowSeconds.toString(),
          spentInWindow: config.spentInWindow.toString(),
          windowStart: config.windowStart.toString(),
          approvalThreshold: config.approvalThreshold.toString(),
          maxPositionSize: config.maxPositionSize.toString(),
          cumulativeExposure: config.cumulativeExposure.toString(),
          maxCumulativeExposure: config.maxCumulativeExposure.toString(),
        },
        balance: balance.toString(),
        balanceFormatted: formatUsdc(balance),
        remainingBudget: budget.toString(),
        remainingBudgetFormatted: formatUsdc(budget),
        policyHash,
        demo: CONTRACT_MODE === "demo",
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/contracts/registry/:agentId
   * Read an agent's on-chain registry record.
   */
  app.get("/api/contracts/registry/:agentId", async (req, res) => {
    try {
      const { agentId } = req.params;
      const record = await getRegistryRecord(agentId as `0x${string}`);
      if (!record) {
        return res.json({ agentId, registered: false, demo: CONTRACT_MODE === "demo" });
      }
      res.json({
        agentId,
        registered: true,
        record: {
          ...record,
          registeredAt: record.registeredAt.toString(),
          lastActiveAt: record.lastActiveAt.toString(),
          validationCount: record.validationCount.toString(),
          totalVolumeUsdc: record.totalVolumeUsdc.toString(),
          totalVolumeFormatted: formatUsdc(record.totalVolumeUsdc),
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/policy/evaluate/payment
   * Evaluate and sign a PaymentIntent through the Policy Engine.
   *
   * This is step 16 in the x402 flow: the Payment Orchestrator calls this
   * after receiving a 402 response, before assembling the UserOperation.
   *
   * Body: { intent: PaymentIntent, policy: AgentPolicy }
   * Returns: { approved, proof?, expiry?, intentHash?, reason? }
   */
  app.post("/api/policy/evaluate/payment", async (req, res) => {
    try {
      const { intent, policy } = req.body as { intent: PaymentIntent; policy: AgentPolicy };
      if (!intent || !policy) {
        return res.status(400).json({ error: "intent and policy are required" });
      }

      // Normalise bigint fields from JSON (JSON doesn't support BigInt natively)
      const normIntent: PaymentIntent = {
        ...intent,
        amount: safeBigInt(intent.amount, "amount"),
      };
      const normPolicy: AgentPolicy = {
        ...policy,
        spendLimit:          safeBigInt(policy.spendLimit, "spendLimit"),
        spentInWindow:       safeBigInt(policy.spentInWindow, "spentInWindow"),
        approvalThreshold:   safeBigInt(policy.approvalThreshold, "approvalThreshold"),
        maxPositionSize:     safeBigInt(policy.maxPositionSize, "maxPositionSize"),
        maxDailyLoss:        safeBigInt(policy.maxDailyLoss, "maxDailyLoss"),
        maxCumulativeExposure: safeBigInt(policy.maxCumulativeExposure, "maxCumulativeExposure"),
      };

      const result = await processPaymentIntent(normIntent, normPolicy);

      if (!result.approved) {
        return res.json({ approved: false, reason: result.reason });
      }

      res.json({
        approved: true,
        proof: result.proof,
        expiry: result.expiry,
        intentHash: result.intentHash,
      });
    } catch (err: unknown) {
      const isValidation = err instanceof Error && err.message.startsWith("Invalid integer");
      res.status(isValidation ? 400 : 500).json({
        error: isValidation ? err.message : "Policy evaluation failed",
      });
    }
  });

  /**
   * POST /api/policy/evaluate/trade
   * Evaluate and sign a TradeIntent through the Policy Engine.
   *
   * This is step 3 in the trading flow.
   *
   * Body: { intent: TradeIntent, policy: AgentPolicy, currentExposure?: string }
   */
  app.post("/api/policy/evaluate/trade", async (req, res) => {
    try {
      const { intent, policy, currentExposure } = req.body as {
        intent: TradeIntent;
        policy: AgentPolicy;
        currentExposure?: string;
      };
      if (!intent || !policy) {
        return res.status(400).json({ error: "intent and policy are required" });
      }

      const normIntent: TradeIntent = {
        ...intent,
        size:       safeBigInt(intent.size, "size"),
        priceLimit: intent.priceLimit ? safeBigInt(intent.priceLimit, "priceLimit") : undefined,
      };
      const normPolicy: AgentPolicy = {
        ...policy,
        spendLimit:          safeBigInt(policy.spendLimit, "spendLimit"),
        spentInWindow:       safeBigInt(policy.spentInWindow, "spentInWindow"),
        approvalThreshold:   safeBigInt(policy.approvalThreshold, "approvalThreshold"),
        maxPositionSize:     safeBigInt(policy.maxPositionSize, "maxPositionSize"),
        maxDailyLoss:        safeBigInt(policy.maxDailyLoss, "maxDailyLoss"),
        maxCumulativeExposure: safeBigInt(policy.maxCumulativeExposure, "maxCumulativeExposure"),
      };
      const exposure = currentExposure ? safeBigInt(currentExposure, "currentExposure") : BigInt(0);

      const result = await processTradeIntent(normIntent, normPolicy, exposure);

      if (!result.approved) {
        return res.json({ approved: false, reason: result.reason });
      }

      res.json({
        approved: true,
        proof: result.proof,
        expiry: result.expiry,
        intentHash: result.intentHash,
      });
    } catch (err: unknown) {
      const isValidation = err instanceof Error && err.message.startsWith("Invalid integer");
      res.status(isValidation ? 400 : 500).json({
        error: isValidation ? err.message : "Policy evaluation failed",
      });
    }
  });

  /**
   * POST /api/policy/hash
   * Compute the keccak256 policy hash for a policy config.
   * Used for BrainAccount.setPolicy() and AgentRegistry.setPolicyHash().
   *
   * Body: policy config fields
   */
  app.post("/api/policy/hash", (req, res) => {
    try {
      const policy = req.body as Parameters<typeof computePolicyHash>[0];
      if (!policy?.agentId) return res.status(400).json({ error: "agentId required" });

      const normPolicy = {
        ...policy,
        spendLimit:          safeBigInt(policy.spendLimit, "spendLimit"),
        approvalThreshold:   safeBigInt(policy.approvalThreshold, "approvalThreshold"),
        maxPositionSize:     safeBigInt(policy.maxPositionSize, "maxPositionSize"),
        maxDailyLoss:        safeBigInt(policy.maxDailyLoss, "maxDailyLoss"),
        maxCumulativeExposure: safeBigInt(policy.maxCumulativeExposure, "maxCumulativeExposure"),
      };

      const hash = computePolicyHash(normPolicy);
      res.json({ policyHash: hash });
    } catch (err: unknown) {
      const isValidation = err instanceof Error && err.message.startsWith("Invalid integer");
      res.status(isValidation ? 400 : 500).json({
        error: isValidation ? err.message : "Policy hash computation failed",
      });
    }
  });

  /* ──────────────────────────────────────────────────────────────────────
   *  Tool integrations  (Stripe wired; others coming soon)
   * ────────────────────────────────────────────────────────────────────── */

  // For this prototype every browser session is treated as the same demo
  // user.  When a real auth model is added, swap this for the session uid.
  const DEMO_USER = "demo-user";

  app.get("/api/integrations/connections", async (_req, res) => {
    try {
      const list = await storage.listToolConnections(DEMO_USER);
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/integrations/stripe/connect", async (_req, res) => {
    try {
      // Dynamic + untyped: server/stripe.ts is generated after the user
      // authorizes Stripe via the integrations flow.
      const stripeModulePath = "./stripe";
      const mod = await import(stripeModulePath).catch(() => null) as
        | { getUncachableStripeClient: () => Promise<unknown> }
        | null;
      const getUncachableStripeClient = mod?.getUncachableStripeClient;

      if (!getUncachableStripeClient) {
        return res.status(503).json({
          error: "Stripe integration is not configured yet on this Repl.",
          code: "not_configured",
        });
      }

      const stripe = (await getUncachableStripeClient()) as {
        accounts: { retrieve: () => Promise<{ id: string; business_profile?: { name?: string }; settings?: { dashboard?: { display_name?: string } }; email?: string }> };
      };
      const account = await stripe.accounts.retrieve();
      const label =
        account.business_profile?.name ||
        account.settings?.dashboard?.display_name ||
        account.email ||
        account.id;

      const conn = await storage.upsertToolConnection({
        userId: DEMO_USER,
        toolId: "stripe",
        status: "connected",
        accountLabel: label,
        connectedAt: new Date().toISOString(),
      });
      res.json(conn);
    } catch (err) {
      res.status(502).json({ error: (err as Error).message || "Stripe connection failed" });
    }
  });

  /* ──────────────────────────────────────────────────────────────────────
   *  Plaid bank connections
   *  NOTE: registered BEFORE the generic `:toolId/disconnect` so the
   *  specific `/plaid/disconnect` handler wins for plaid.
   * ────────────────────────────────────────────────────────────────────── */

  app.get("/api/integrations/plaid/status", (_req, res) => {
    res.json({
      configured: !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET),
      env: process.env.PLAID_ENV ?? "sandbox",
    });
  });

  app.get("/api/integrations/plaid/connections", async (_req, res) => {
    try {
      const list = await storage.listBankConnections(DEMO_USER);
      // Strip access_token before returning to the client
      res.json(list.map(({ accessToken: _t, ...rest }) => rest));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/integrations/plaid/link-token", async (_req, res) => {
    try {
      const { getPlaidClient, PLAID_PRODUCTS, PLAID_COUNTRIES } = await import("./plaid");
      const client = getPlaidClient();
      const result = await client.linkTokenCreate({
        user: { client_user_id: DEMO_USER },
        client_name: "Brain Finance",
        products: PLAID_PRODUCTS,
        country_codes: PLAID_COUNTRIES,
        language: "en",
      });
      res.json({ link_token: result.data.link_token, expiration: result.data.expiration });
    } catch (err) {
      const msg = (err as Error).message || "Failed to create Plaid link token";
      const isConfig = msg.includes("not configured");
      res.status(isConfig ? 503 : 502).json({
        error: msg,
        code: isConfig ? "not_configured" : "plaid_error",
      });
    }
  });

  app.post("/api/integrations/plaid/exchange", async (req, res) => {
    try {
      const schema = z.object({
        public_token: z.string().min(1),
        institution: z.object({ id: z.string().nullable().optional(), name: z.string() }).optional(),
      });
      const { public_token, institution } = schema.parse(req.body);

      const { getPlaidClient } = await import("./plaid");
      const client = getPlaidClient();

      const exch = await client.itemPublicTokenExchange({ public_token });
      const accessToken = exch.data.access_token;
      const itemId = exch.data.item_id;

      // Pull account metadata so the UI can show real names + masks
      const accountsResp = await client.accountsGet({ access_token: accessToken });
      const accounts = accountsResp.data.accounts.map(a => ({
        accountId: a.account_id,
        name: a.name,
        mask: a.mask ?? null,
        subtype: a.subtype ?? null,
        type: a.type ?? null,
      }));

      const inst = accountsResp.data.item.institution_id
        ? await client.institutionsGetById({
            institution_id: accountsResp.data.item.institution_id,
            country_codes: (await import("./plaid")).PLAID_COUNTRIES,
          }).then(r => r.data.institution).catch(() => null)
        : null;

      const conn = await storage.createBankConnection({
        userId: DEMO_USER,
        itemId,
        accessToken,
        institutionId: inst?.institution_id ?? institution?.id ?? null,
        institutionName: inst?.name ?? institution?.name ?? "Connected Bank",
        accounts,
        connectedAt: new Date().toISOString(),
      });

      const { accessToken: _t, ...safe } = conn;
      res.json(safe);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid payload", details: err.errors });
      }
      res.status(502).json({ error: (err as Error).message || "Token exchange failed" });
    }
  });

  app.post("/api/integrations/plaid/disconnect", async (req, res) => {
    try {
      const parsed = z.object({ itemId: z.string().min(1) }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "itemId required" });
      }
      const { itemId } = parsed.data;

      // Best-effort revoke at Plaid; even if it fails we still drop our copy
      try {
        const conns = await storage.listBankConnections(DEMO_USER);
        const target = conns.find(c => c.itemId === itemId);
        if (target) {
          const { getPlaidClient } = await import("./plaid");
          await getPlaidClient().itemRemove({ access_token: target.accessToken });
        }
      } catch (revokeErr) {
        console.warn("[plaid] item revoke failed:", (revokeErr as Error).message);
      }

      const ok = await storage.removeBankConnection(DEMO_USER, itemId);
      res.json({ success: ok });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /* ──────────────────────────────────────────────────────────────────────
   *  Source documents (uploaded files registered as an ingestion source)
   *  NOTE: only file metadata is persisted here — raw bytes are not stored.
   * ────────────────────────────────────────────────────────────────────── */

  app.get("/api/integrations/documents", async (_req, res) => {
    try {
      const list = await storage.listSourceDocuments(DEMO_USER);
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/integrations/documents", async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1).max(512),
        size: z.number().int().nonnegative().max(50 * 1024 * 1024 * 1024),
        mimeType: z.string().max(256).nullable().optional(),
        category: z.string().max(64).nullable().optional(),
      });
      const parsed = schema.parse(req.body);
      const doc = await storage.createSourceDocument({
        userId: DEMO_USER,
        name: parsed.name,
        size: parsed.size,
        mimeType: parsed.mimeType ?? null,
        category: parsed.category ?? null,
      });
      res.json(doc);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid payload", details: err.errors });
      }
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/integrations/documents/:id/delete", async (req, res) => {
    try {
      const ok = await storage.removeSourceDocument(DEMO_USER, req.params.id);
      res.json({ success: ok });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /* Generic tool disconnect — registered LAST so specific routes (e.g. plaid) win */
  app.post("/api/integrations/:toolId/disconnect", async (req, res) => {
    try {
      const ok = await storage.removeToolConnection(DEMO_USER, req.params.toolId);
      res.json({ success: ok });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // INSIGHTS
  // ─────────────────────────────────────────────────────────────
  app.get("/api/insights", async (_req, res) => {
    try {
      const state = getInsightsState();
      // Trigger background generation if stale (never generated or older than 24h)
      if (!state.generatedAt || Date.now() - state.generatedAt.getTime() > 24 * 60 * 60 * 1000) {
        generateInsights().catch((err) => console.error("[Insights] bg refresh failed:", err));
      }
      return res.json({ insights: state.insights, generatedAt: state.generatedAt, generating: state.generating });
    } catch (err) {
      console.error("[Insights] route error:", err);
      return res.status(500).json({ error: "Failed to fetch insights" });
    }
  });

  return httpServer;
}
