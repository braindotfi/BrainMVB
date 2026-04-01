import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import Anthropic from "@anthropic-ai/sdk";
import { storage } from "./storage";
import { startDailyInsightsScheduler, getInsightsState, generateInsights } from "./insightsService";
import { z } from "zod";
import {
  createWirexUser,
  getWirexUser,
  getWirexWallets,
  getWirexCards,
  issueVirtualCard,
  getWirexBankAccounts,
  getWirexTransactions,
} from "./wirex";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// SSE connections map: userId → Response[]
const sseClients = new Map<string, Response[]>();

function broadcastNotification(userId: string, payload: object) {
  const clients = sseClients.get(userId) ?? [];
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  clients.forEach(res => {
    try { res.write(data); } catch { /* client disconnected */ }
  });
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

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // ─────────────────────────────────────────────────────────────
  // AI ASSISTANT
  // ─────────────────────────────────────────────────────────────
  app.post("/api/assistant/chat", async (req, res) => {
    try {
      const { messages } = req.body;
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Messages array required" });
      }
      const response = await anthropic.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 1024,
        system: "You are Brain AI, an intelligent assistant specialized in DeFi, crypto trading, AI agents, and blockchain technology on Base L2. You help users understand AI agents, analyze market trends, and make informed decisions. Be concise, knowledgeable, and helpful.",
        messages: messages.map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      });
      const content = response.content[0];
      if (content.type === "text") return res.json({ message: content.text });
      return res.status(500).json({ error: "Unexpected response type" });
    } catch (error) {
      console.error("Claude API error:", error);
      return res.status(500).json({ error: "Failed to get AI response" });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // MARKETPLACE
  // ─────────────────────────────────────────────────────────────
  app.get("/api/marketplace", async (req, res) => {
    try {
      const { category, featured, trending } = req.query;
      const listings = await storage.listMarketplaceListings({
        category: category as string | undefined,
        featured: featured === "true" ? true : featured === "false" ? false : undefined,
        trending: trending === "true" ? true : trending === "false" ? false : undefined,
      });
      return res.json(listings);
    } catch (error) {
      return res.status(500).json({ error: "Failed to fetch marketplace" });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // AGENTS
  // ─────────────────────────────────────────────────────────────
  app.get("/api/agents", async (req, res) => {
    try {
      const { ownerId } = req.query;
      const agents = await storage.listAgents(ownerId as string | undefined);
      return res.json(agents);
    } catch (error) {
      return res.status(500).json({ error: "Failed to fetch agents" });
    }
  });

  app.get("/api/agents/:id", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
      return res.json(agent);
    } catch (error) {
      return res.status(500).json({ error: "Failed to fetch agent" });
    }
  });

  const createAgentSchema = z.object({
    id: z.string().min(1),
    ownerId: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    category: z.enum(["trading", "payments", "research", "automation", "swarm"]),
    avatarUrl: z.string().optional(),
    executionWallet: z.string().optional(),
    policy: z.object({
      spendLimit: z.string(),
      timeWindowSeconds: z.number(),
      allowedAssets: z.array(z.string()),
      approvalThreshold: z.string(),
    }).optional(),
  });

  app.post("/api/agents", async (req, res) => {
    try {
      const parsed = createAgentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
      const agent = await storage.createAgent(parsed.data);
      return res.status(201).json(agent);
    } catch (error) {
      return res.status(500).json({ error: "Failed to create agent" });
    }
  });

  app.patch("/api/agents/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      if (!["active", "inactive", "paused"].includes(status)) {
        return res.status(400).json({ error: "Valid status: active | inactive | paused" });
      }
      const updated = await storage.setAgentStatus(req.params.id, status);
      return res.json({ agentId: req.params.id, status: updated });
    } catch (error) {
      return res.status(500).json({ error: "Failed to update agent status" });
    }
  });

  app.get("/api/agents/:id/status", async (req, res) => {
    try {
      const status = await storage.getAgentStatus(req.params.id);
      return res.json({ agentId: req.params.id, status: status ?? null });
    } catch (error) {
      return res.status(500).json({ error: "Failed to get agent status" });
    }
  });

  // Run agent objective (ReAct loop)
  app.post("/api/agents/:id/run", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ error: "Agent not found" });

      const { objective } = req.body;
      if (!objective) return res.status(400).json({ error: "Objective required" });

      const memories = await storage.getMemories(req.params.id);
      const policy = agent.policy ?? { spendLimit: "1000", timeWindowSeconds: 86400, allowedAssets: ["USDC"], approvalThreshold: "100" };
      const summary = await runAgentLoop(req.params.id, objective, policy, memories);

      await storage.addMemory({ agentId: req.params.id, content: `Objective: ${objective}. Result: ${summary}`, actionType: "objective_complete", metadata: { objective } });
      await storage.updateAgent(req.params.id, { lastActiveAt: new Date() } as any);

      // Broadcast notification to agent owner
      if (agent.ownerId) {
        const notif = await storage.createNotification({
          userId: agent.ownerId,
          type: "AGENT_OBJECTIVE_COMPLETE",
          title: `${agent.name} completed its objective`,
          body: summary.slice(0, 120) + (summary.length > 120 ? "…" : ""),
          data: { agentId: agent.id, objective },
          read: false,
        });
        broadcastNotification(agent.ownerId, { type: "notification", payload: notif });
      }

      return res.json({ agentId: req.params.id, objective, summary, status: "complete" });
    } catch (error) {
      console.error("Agent run error:", error);
      return res.status(500).json({ error: "Agent execution failed" });
    }
  });

  // Agent memory
  app.get("/api/agents/:id/memory", async (req, res) => {
    try {
      const memories = await storage.getMemories(req.params.id, 30);
      return res.json(memories);
    } catch (error) {
      return res.status(500).json({ error: "Failed to fetch memory" });
    }
  });

  // Agent transactions
  app.get("/api/agents/:id/transactions", async (req, res) => {
    try {
      const txs = await storage.getTransactions(req.params.id);
      return res.json(txs);
    } catch (error) {
      return res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

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
  // NOTIFICATIONS
  // ─────────────────────────────────────────────────────────────
  app.get("/api/notifications", async (req, res) => {
    try {
      const userId = (req.query.userId as string) ?? "demo-user";
      const notifications = await storage.getNotifications(userId);
      return res.json(notifications);
    } catch (error) {
      return res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/count", async (req, res) => {
    try {
      const userId = (req.query.userId as string) ?? "demo-user";
      const count = await storage.getUnreadCount(userId);
      return res.json({ count });
    } catch (error) {
      return res.status(500).json({ error: "Failed to get count" });
    }
  });

  app.post("/api/notifications/:id/read", async (req, res) => {
    try {
      await storage.markAsRead(req.params.id);
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: "Failed to mark as read" });
    }
  });

  app.delete("/api/notifications/:id", async (req, res) => {
    try {
      await storage.deleteNotification(req.params.id);
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: "Failed to delete notification" });
    }
  });

  // SSE stream for real-time notifications
  app.get("/api/notifications/stream", (req, res) => {
    const userId = (req.query.userId as string) ?? "demo-user";

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.flushHeaders();

    // Send initial ping
    res.write(`data: ${JSON.stringify({ type: "connected", userId })}\n\n`);

    // Register this client
    const existing = sseClients.get(userId) ?? [];
    existing.push(res);
    sseClients.set(userId, existing);

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
      try { res.write(": heartbeat\n\n"); } catch { clearInterval(heartbeat); }
    }, 30000);

    req.on("close", () => {
      clearInterval(heartbeat);
      const clients = sseClients.get(userId) ?? [];
      sseClients.set(userId, clients.filter(c => c !== res));
    });
  });

  // Demo endpoint: trigger a test notification
  app.post("/api/notifications/demo", async (req, res) => {
    try {
      const { userId = "demo-user", type = "AGENT_OBJECTIVE_COMPLETE" } = req.body;
      const notif = await storage.createNotification({
        userId,
        type,
        title: "Demo Notification",
        body: "This is a live demo notification via SSE stream.",
        data: { demo: true },
        read: false,
      });
      broadcastNotification(userId, { type: "notification", payload: notif });
      return res.json({ success: true, notification: notif });
    } catch (error) {
      return res.status(500).json({ error: "Failed to create demo notification" });
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
      crossmintApiKey: process.env.CROSSMINT_CLIENT_API_KEY || "",
    });
  });

  // ─────────────────────────────────────────────────────────────
  // CROSSMINT WALLET LOOKUP
  // ─────────────────────────────────────────────────────────────

  // GET /api/crossmint/wallet?userId=... — look up a user's embedded wallet address
  app.get("/api/crossmint/wallet", async (req, res) => {
    const { userId } = req.query as { userId?: string };
    if (!userId) return res.status(400).json({ error: "userId required" });

    // Prefer the server-side key (required by Crossmint REST API); fall back to client key
    const apiKey = process.env.CROSSMINT_SERVER_API_KEY || process.env.CROSSMINT_CLIENT_API_KEY;
    if (!apiKey) return res.json({ address: null });

    // Crossmint staging REST API — try both v1 and v2 locator patterns
    const baseUrl = apiKey.startsWith("ck_staging_") || apiKey.startsWith("sk_staging_")
      ? "https://staging.crossmint.com"
      : "https://www.crossmint.com";

    const headers = { "X-API-Key": apiKey, "Content-Type": "application/json" };

    // Wallet locator format: userId:<id>:<walletType>
    // Only try the wallet type created by our CrossmintWalletProvider (evm-smart-wallet with email signer)
    const { email } = req.query as { email?: string };
    const locators: string[] = [`userId:${userId}:evm-smart-wallet`];
    if (email) locators.push(`email:${encodeURIComponent(email)}:evm-smart-wallet`);

    for (const locator of locators) {
      const url = `${baseUrl}/api/2022-06-09/wallets/${locator}`;
      try {
        console.log("[Crossmint] Looking up wallet:", locator);
        const resp = await fetch(url, { headers });
        const txt = await resp.text();
        console.log("[Crossmint] Wallet lookup:", resp.status, txt.slice(0, 200));
        if (resp.ok) {
          const data = JSON.parse(txt);
          const wallet = Array.isArray(data) ? data[0] : data;
          const address = wallet?.address ?? wallet?.publicKey ?? null;
          if (address) return res.json({ address });
        }
      } catch (e: any) {
        console.error("[Crossmint] Wallet lookup error:", e.message);
      }
    }

    return res.json({ address: null });
  });

  // ─────────────────────────────────────────────────────────────
  // WIREX INTEGRATION
  // ─────────────────────────────────────────────────────────────

  // POST /api/wirex/onboard — called after Crossmint login to provision WireX accounts
  app.post("/api/wirex/onboard", async (req, res) => {
    try {
      const { userId, email, walletAddress } = req.body;
      console.log("[Onboard] userId:", userId, "email:", email, "walletAddress:", walletAddress);
      if (!email) return res.status(400).json({ error: "email required" });

      // Check/create WireX user — prefer the real Crossmint wallet address
      let wirexUser = await getWirexUser(email).catch((e) => { console.error("[Onboard] getUser error:", e.message); return null; });
      console.log("[Onboard] wirexUser after get:", JSON.stringify(wirexUser)?.slice(0, 200));
      if (!wirexUser) {
        await createWirexUser(email, walletAddress || userId || "").catch((e) => { console.error("[Onboard] createUser error:", e.message); });
        wirexUser = await getWirexUser(email).catch(() => null);
        console.log("[Onboard] wirexUser after create+get:", JSON.stringify(wirexUser)?.slice(0, 200));
      }

      // Fetch accounts
      const [wallets, cards, bankAccounts] = await Promise.all([
        getWirexWallets(email).catch(() => []),
        getWirexCards(email).catch(() => []),
        getWirexBankAccounts(email).catch(() => []),
      ]);

      // If no virtual card yet, try to issue one
      if (cards.length === 0 && wirexUser) {
        const fullName = wirexUser?.personal_info
          ? `${wirexUser.personal_info.first_name} ${wirexUser.personal_info.last_name}`
          : email.split("@")[0];
        await issueVirtualCard(email, fullName).catch(() => null);
        const newCards = await getWirexCards(email).catch(() => []);
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

  // GET /api/wirex/accounts — refresh accounts for logged-in user
  app.get("/api/wirex/accounts", async (req, res) => {
    try {
      const email = req.query.email as string;
      if (!email) return res.status(400).json({ error: "email required" });

      const [wirexUser, wallets, cards, bankAccounts] = await Promise.all([
        getWirexUser(email).catch(() => null),
        getWirexWallets(email).catch(() => []),
        getWirexCards(email).catch(() => []),
        getWirexBankAccounts(email).catch(() => []),
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

  // GET /api/wirex/transactions — get transactions for a specific account
  app.get("/api/wirex/transactions", async (req, res) => {
    try {
      const { email, accountId } = req.query as { email: string; accountId?: string };
      if (!email) return res.status(400).json({ error: "email required" });
      const txs = await getWirexTransactions(email, accountId).catch(() => []);
      return res.json({ transactions: txs });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // DAILY INSIGHTS
  // ─────────────────────────────────────────────────────────────

  // GET /api/insights — return the latest generated insights
  app.get("/api/insights", (_req, res) => {
    try {
      const state = getInsightsState();
      return res.json(state);
    } catch (error) {
      return res.status(500).json({ error: "Failed to fetch insights" });
    }
  });

  // POST /api/insights/trigger — manually regenerate insights (dev/test)
  app.post("/api/insights/trigger", async (_req, res) => {
    try {
      const insights = await generateInsights();
      const notif = await storage.createNotification({
        userId: "demo-user",
        type: "insights",
        title: "Daily Insights Ready",
        body: `Brain AI has analysed your accounts and found ${insights.length} personalised recommendations for you today.`,
        data: { insightCount: insights.length, generatedAt: new Date().toISOString() },
        read: false,
      });
      broadcastNotification("demo-user", { type: "notification", notification: notif });
      broadcastNotification("anonymous", { type: "notification", notification: notif });
      return res.json({ success: true, count: insights.length });
    } catch (error) {
      return res.status(500).json({ error: "Failed to trigger insights" });
    }
  });

  // Start the 24-hour scheduler
  startDailyInsightsScheduler(broadcastNotification);

  return httpServer;
}
