import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import Anthropic from "@anthropic-ai/sdk";
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

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

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

  // DELETE /api/account — permanently delete the user account and all associated records.
  // Body: { userId?, email?, walletAddress? } — at least one is required.
  app.delete("/api/account", async (req, res) => {
    try {
      const { userId, email, walletAddress } = (req.body ?? {}) as {
        userId?: string; email?: string; walletAddress?: string;
      };
      if (!userId && !email && !walletAddress) {
        return res.status(400).json({ error: "userId, email, or walletAddress required" });
      }
      const result = await storage.deleteUserAccount({ userId, email, walletAddress });
      return res.json({ success: true, deleted: result });
    } catch (error: any) {
      console.error("Delete account error:", error);
      return res.status(500).json({ error: error?.message || "Failed to delete account" });
    }
  });

  // DELETE /api/account/data — purge all user-owned records (agents, memories,
  // transactions, notifications) but KEEP the user account itself so the user
  // remains logged in and can rebuild their data from scratch.
  // Body: { userId?, email?, walletAddress? } — at least one is required.
  app.delete("/api/account/data", async (req, res) => {
    try {
      const { userId, email, walletAddress } = (req.body ?? {}) as {
        userId?: string; email?: string; walletAddress?: string;
      };
      if (!userId && !email && !walletAddress) {
        return res.status(400).json({ error: "userId, email, or walletAddress required" });
      }
      const result = await storage.deleteUserData({ userId, email, walletAddress });
      return res.json({ success: true, deleted: result });
    } catch (error: any) {
      console.error("Delete data error:", error);
      return res.status(500).json({ error: error?.message || "Failed to delete data" });
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
      crossmintApiKey: process.env.CROSSMINT_CLIENT_API_KEY || "",
    });
  });

  // ─────────────────────────────────────────────────────────────
  // CROSSMINT WALLET LOOKUP
  // ─────────────────────────────────────────────────────────────

  // GET /api/crossmint/wallet?userId=... — look up a user's embedded wallet address
  const crossmintWalletCache = new Map<string, { address: string | null; expiresAt: number }>();

  app.get("/api/crossmint/wallet", async (req, res) => {
    const { userId } = req.query as { userId?: string };
    if (!userId) return res.status(400).json({ error: "userId required" });

    const { email } = req.query as { email?: string };
    const cacheKey = `${userId}:${email ?? ""}`;
    const cached = crossmintWalletCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json({ address: cached.address, cached: true });
    }

    // Prefer the server-side key (required by Crossmint REST API); fall back to client key
    const apiKey = process.env.CROSSMINT_SERVER_API_KEY || process.env.CROSSMINT_CLIENT_API_KEY;
    if (!apiKey) return res.json({ address: null });

    // Crossmint staging REST API — try both v1 and v2 locator patterns
    const baseUrl = apiKey.startsWith("ck_staging_") || apiKey.startsWith("sk_staging_")
      ? "https://staging.crossmint.com"
      : "https://www.crossmint.com";

    const headers = { "X-API-Key": apiKey, "Content-Type": "application/json" };

    // Wallet locator format: userId:<id>:<walletType>
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
          if (address) {
            crossmintWalletCache.set(cacheKey, { address, expiresAt: Date.now() + 5 * 60 * 1000 });
            return res.json({ address });
          }
        }
      } catch (e: any) {
        console.error("[Crossmint] Wallet lookup error:", e.message);
      }
    }

    crossmintWalletCache.set(cacheKey, { address: null, expiresAt: Date.now() + 2 * 60 * 1000 });
    return res.json({ address: null });
  });

  // ─────────────────────────────────────────────────────────────
  // WIREX INTEGRATION
  // ─────────────────────────────────────────────────────────────

  // POST /api/wirex/onboard — called after Crossmint login to provision WireX accounts
  app.post("/api/wirex/onboard", async (req, res) => {
    try {
      const { userId, email } = req.body;
      let { walletAddress } = req.body;
      console.log("[Onboard] userId:", userId, "email:", email, "walletAddress:", walletAddress);
      if (!email) return res.status(400).json({ error: "email required" });

      // If wallet address not provided by client, fetch it from Crossmint API server-side
      if (!walletAddress && email) {
        try {
          const crossmintKey = process.env.CROSSMINT_SERVER_API_KEY || process.env.CROSSMINT_CLIENT_API_KEY;
          const baseUrl = "https://staging.crossmint.com";
          const locator = encodeURIComponent(`email:${email}:evm-smart-wallet`);
          const walletResp = await fetch(`${baseUrl}/api/v1-alpha2/wallets/${locator}`, {
            headers: { "x-api-key": crossmintKey || "", "Content-Type": "application/json" },
          });
          if (walletResp.ok) {
            const walletData = await walletResp.json();
            walletAddress = walletData?.address ?? walletData?.publicKey ?? undefined;
            console.log("[Onboard] Crossmint wallet fetch:", walletAddress);
          } else {
            console.log("[Onboard] Crossmint wallet fetch status:", walletResp.status);
          }
        } catch (walletErr: any) {
          console.log("[Onboard] Crossmint wallet fetch error:", walletErr?.message);
        }
      }

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

  // GET /api/wirex/accounts — refresh accounts for logged-in user
  app.get("/api/wirex/accounts", async (req, res) => {
    try {
      const email = req.query.email as string;
      if (!email) return res.status(400).json({ error: "email required" });

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

  app.post("/api/integrations/:toolId/disconnect", async (req, res) => {
    try {
      const ok = await storage.removeToolConnection(DEMO_USER, req.params.toolId);
      res.json({ success: ok });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return httpServer;
}
