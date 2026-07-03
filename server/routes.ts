import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import Anthropic from "@anthropic-ai/sdk";
import { setupAuth, googleEnabled, requireAuth } from "./auth";
import { storage } from "./storage";
import { z } from "zod";
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
import { verifyMessage } from "viem";
import { createBrainProxyRouter } from "./brain/proxy";
import { getBrainSession } from "./brain/auth";
import {
  listLedgerAccounts,
  listLedgerTransactions,
  listLedgerCounterparties,
  type WikiEvidence,
} from "./brain/client";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
  // GOAL RECOMMENDATIONS (brain-grounded, Claude-phrased)
  // For the "New Goal" modal — given a category the user picks in
  // the "What's it for?" tabs, returns a 1–2 sentence personalised
  // recommendation grounded in the user's live brain-core Ledger
  // (via Wiki Q&A) and phrased by Claude. Falls back to a curated,
  // category-specific line when brain-core / Claude are unavailable.
  // ─────────────────────────────────────────────────────────────
  const goalRecCache = new Map<string, { text: string; at: number }>();
  const GOAL_REC_TTL_MS = 30 * 60 * 1000; // 30 minutes

  const GOAL_REC_SYSTEM = `You are Brain AI, the financial brain embedded in a neobank for businesses.
The user is creating a new goal and just picked a CATEGORY in the "What's it for?" tabs.
Given the user's real financial figures, return ONE concrete, numeric recommendation
(1–2 short sentences, max ~220 chars) tailored to that category — what target to
set and why, grounded in those actual numbers.

Rules:
- Plain prose, no markdown, no bullet points, no leading label.
- Reference only the real numbers provided (dollars, percentages, months); do not invent figures.
- Do not greet, do not restate the category. Just the recommendation.`;

  app.get("/api/goals/recommendation", async (req, res) => {
    const category = String(req.query.category ?? "").slice(0, 64);
    if (!category) return res.status(400).json({ error: "category required" });

    const cached = goalRecCache.get(category);
    if (cached && Date.now() - cached.at < GOAL_REC_TTL_MS) {
      return res.json({ text: cached.text, cached: true });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      // No LLM to phrase — prefer the curated, category-specific line (reads better
      // than a raw figure dump). Skip the grounding fetch since it would go unused.
      return res.json({ text: GOAL_REC_FALLBACK[category] ?? GOAL_REC_FALLBACK_DEFAULT, cached: false, fallback: true });
    }

    // Best-effort: ground the recommendation in the user's real brain-core Ledger
    // account balances (replaces the old hardcoded mock snapshot). Read directly
    // from /ledger/accounts — deterministic and correct, unlike a broad Wiki Q&A
    // which misreads "accounts". Silently ungrounded on failure so the
    // recommendation never breaks on the integration.
    let grounding = "";
    try {
      const { token } = await getBrainSession(req.session.userId!);
      const { accounts } = await listLedgerAccounts(token, { limit: 50 });
      if (accounts.length > 0) {
        const lines = accounts.map(
          (a) => `- ${a.name} (${a.account_type}): ${a.current_balance ?? "?"} ${a.currency}`,
        );
        const usdTotal = accounts
          .filter((a) => a.currency === "USD" && a.current_balance != null)
          .reduce((sum, a) => sum + (Number(a.current_balance) || 0), 0);
        grounding =
          `Real account balances from Brain:\n${lines.join("\n")}\n` +
          `Total USD cash ≈ ${usdTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD.`;
      }
    } catch (e) {
      console.warn("[GoalRec] ledger grounding skipped:", (e as Error)?.message);
    }

    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const context = grounding
        ? `The user's real financial figures from Brain (source of truth — use only these, do not invent):\n${grounding}`
        : "No live financial figures are available; give general but actionable guidance for the category.";
      const message = await anthropic.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 220,
        system: GOAL_REC_SYSTEM,
        messages: [
          {
            role: "user",
            content: `${context}\n\nCategory the user picked: "${category}".\n\nReturn the recommendation as plain text.`,
          },
        ],
      });
      const text = (message.content[0]?.type === "text" ? message.content[0].text : "").trim();
      const clean = text.replace(/^["'`]+|["'`]+$/g, "").trim();
      if (!clean) throw new Error("empty recommendation");
      goalRecCache.set(category, { text: clean, at: Date.now() });
      return res.json({ text: clean, cached: false, grounded: !!grounding });
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

  /**
   * Build deterministic grounding from the ledger (accounts, recent txs,
   * counterparties).  This replaces the fuzzy Wiki Q&A which misread "accounts"
   * and caused hallucinated balances.  Falls back to Wiki only for purely conceptual
   * questions where no ledger data is expected.
   */
  async function buildGrounding(token: string, _question: string): Promise<{ text: string; sources: WikiEvidence[]; available: boolean }> {
    // Run all ledger reads in parallel — deterministic, same source the UI uses.
    const [accounts, txs, cps] = await Promise.allSettled([
      listLedgerAccounts(token, { limit: 50 }),
      listLedgerTransactions(token, { limit: 20 }),
      listLedgerCounterparties(token),
    ]);

    let text = "";
    const sources: WikiEvidence[] = [];

    // ─── Accounts (deterministic) ───
    if (accounts.status === "fulfilled" && accounts.value.accounts.length > 0) {
      const lines = accounts.value.accounts.map((a) => {
        const bal = a.current_balance != null ? Number(a.current_balance).toLocaleString("en-US", { minimumFractionDigits: 2 }) : "unknown";
        return `  • ${a.name} (${a.currency}) — balance ${bal} — status: ${a.status} — id: ${a.id}`;
      });
      const usdTotal = accounts.value.accounts
        .filter((a) => a.currency === "USD" && a.current_balance != null)
        .reduce((s, a) => s + (Number(a.current_balance) || 0), 0);
      text += `Accounts (source of truth):\n${lines.join("\n")}\nTotal USD cash ≈ ${usdTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD.\n\n`;
      for (const a of accounts.value.accounts) {
        sources.push({ entityId: a.id, entityType: "account", excerpt: `${a.name} — ${a.currency} ${a.current_balance ?? "n/a"}` });
      }
    }

    // ─── Transactions (deterministic) ───
    if (txs.status === "fulfilled" && txs.value.transactions.length > 0) {
      const recent = txs.value.transactions.slice(0, 10);
      const lines = recent.map((t) => {
        const dir = t.direction;
        const amt = Number(t.amount).toLocaleString("en-US", { minimumFractionDigits: 2 });
        const date = t.transaction_date;
        return `  • ${dir} ${t.currency} ${amt} on ${date}${t.description_normalized ? ` — ${t.description_normalized}` : ""} — id: ${t.id}`;
      });
      text += `Recent transactions (last ${recent.length}):\n${lines.join("\n")}\n\n`;
      for (const t of recent) {
        sources.push({ entityId: t.id, entityType: "transaction", excerpt: `${t.direction} ${t.currency} ${t.amount}` });
      }
    }

    // ─── Counterparties (for name resolution in answers) ───
    if (cps.status === "fulfilled" && cps.value.counterparties.length > 0) {
      const lines = cps.value.counterparties.slice(0, 20).map((c) => `  • ${c.name} — id: ${c.id}`);
      text += `Counterparties:\n${lines.join("\n")}\n\n`;
    }

    const hasLedgerData = text.trim().length > 0;
    if (!hasLedgerData) {
      return { text: "", sources: [], available: false };
    }

    return { text: text.trim(), sources, available: true };
  }

  /**
   * Returns true if the question is about concrete financial data (balances,
   * accounts, transactions, amounts).  When no ledger data is available the
   * assistant must refuse rather than hallucinate.
   */
  function isDataQuestion(q: string): boolean {
    const dataWords = /\b(balance|account|transaction|how much|spending|income|revenue|expense|cash|usd|crypto|btc|eth|wire|transfer|paid|received|deposit|withdraw)\b/i;
    return dataWords.test(q);
  }

  app.post("/api/assistant/chat", requireAuth, async (req, res) => {
    const parsed = assistantChatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_messages" });
    }

    // ─── Deterministic ledger grounding (no more fuzzy Wiki for balances) ───
    let grounding = "";
    let sources: WikiEvidence[] = [];
    let dataAvailable = false;
    try {
      const { token } = await getBrainSession(req.session.userId!);
      const built = await buildGrounding(token, parsed.data.messages[parsed.data.messages.length - 1].content);
      grounding = built.text;
      sources = built.sources;
      dataAvailable = built.available;
    } catch (e) {
      console.warn("[Assistant] ledger grounding failed:", (e as Error)?.message);
    }

    const lastUser = [...parsed.data.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const dataUnavailable = !dataAvailable && isDataQuestion(lastUser);

    const system = grounding
      ? `${ASSISTANT_SYSTEM}\n\nGrounded financial data from Brain (the user's real accounts and transactions — treat this as the source of truth and answer from it, citing concrete figures; do not invent numbers):\n${grounding}`
      : ASSISTANT_SYSTEM;

    if (!process.env.ANTHROPIC_API_KEY) {
      if (grounding) {
        return res.json({ reply: grounding, sources, grounded: true });
      }
      return res.status(503).json({
        error: "assistant_unconfigured",
        reply:
          "I'm not connected to my brain yet — an ANTHROPIC_API_KEY needs to be configured before I can answer live.",
        sources: [],
      });
    }

    // ─── Data-specific question + no data = refuse, don't hallucinate ───
    if (dataUnavailable) {
      return res.json({
        reply: "I can't access your live account data right now. This usually means your brain-core session is still initializing or the connection is warming up. Try again in a moment, or check your Finances page to confirm your accounts are connected.",
        sources: [],
        grounded: false,
        ungrounded: true,
      });
    }

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
      return res.json({
        reply: reply || "Sorry, I couldn't generate a response. Please try again.",
        sources,
        grounded: grounding.length > 0,
      });
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
          sources: [],
        });
      }
      return res.status(500).json({
        error: "assistant_failed",
        reply: "Something went wrong reaching the assistant. Please try again.",
        sources: [],
      });
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
      // Bind the signature to the claimed address over the exact signed message (EIP-191
      // personal_sign). Without this, anyone could authenticate as any wallet address.
      let validSig = false;
      try {
        validSig = await verifyMessage({
          address: address as `0x${string}`,
          message,
          signature: signature as `0x${string}`,
        });
      } catch {
        validSig = false;
      }
      if (!validSig) return res.status(401).json({ error: "Invalid signature" });

      // Single-use nonce: the message must carry a nonce we issued, not yet consumed or expired.
      // Consume it first so a replay of the same signed message can't re-authenticate.
      const nonce = /^Nonce: (.+)$/m.exec(message)?.[1]?.trim();
      if (!nonce) return res.status(401).json({ error: "Missing nonce" });
      const [nonceRecord] = await storage.getNotifications(`nonce:${nonce}`, 1);
      if (!nonceRecord) return res.status(401).json({ error: "Unknown or already-used nonce" });
      await storage.deleteNotification(nonceRecord.id);
      if (nonceRecord.body && new Date(nonceRecord.body) < new Date()) {
        return res.status(401).json({ error: "Nonce expired" });
      }
      // Defense-in-depth: the signed message must name this address.
      if (!message.includes(address)) return res.status(401).json({ error: "Address mismatch" });

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

  /* ──────────────────────────────────────────────────────────────────────
   *  User rules — rules authored via the "New rule" creator, persisted per
   *  tenant (associated with the logged-in account via the session).
   * ────────────────────────────────────────────────────────────────────── */

  const userRulePayload = z.object({
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(256),
    summary: z.string().max(512).optional(),
    kind: z.enum(["automation", "guardrail", "always_on"]).optional(),
    policyId: z.string().min(1).max(128),
    active: z.boolean().optional(),
    agent: z.string().max(32).nullable().optional(),
    category: z.string().max(64).nullable().optional(),
    cap: z.number().int().nonnegative().nullable().optional(),
    threshold: z.number().int().nonnegative().nullable().optional(),
    thresholdEditable: z.boolean().nullable().optional(),
    allowlist: z.array(z.string().max(128)).max(64).nullable().optional(),
    scopeSummary: z.string().max(512).nullable().optional(),
    createdLabel: z.string().max(128).optional(),
  });

  app.get("/api/rules", requireAuth, async (req, res) => {
    try {
      const list = await storage.listUserRules(req.session.userId!);
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/rules", requireAuth, async (req, res) => {
    try {
      const parsed = userRulePayload.parse(req.body);
      const rule = await storage.createUserRule({ ...parsed, userId: req.session.userId! });
      res.json(rule);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid payload", details: err.errors });
      }
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete("/api/rules/:id", requireAuth, async (req, res) => {
    try {
      const ok = await storage.removeUserRule(req.session.userId!, String(req.params.id));
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

  return httpServer;
}
