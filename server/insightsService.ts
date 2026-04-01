import Anthropic from "@anthropic-ai/sdk";
import { storage } from "./storage";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface DailyInsight {
  kind: "alert" | "opportunity" | "pattern" | "warning" | "info";
  tag: string;
  text: string;
  action: string;
}

interface InsightsState {
  insights: DailyInsight[];
  generatedAt: Date | null;
  generating: boolean;
}

const state: InsightsState = {
  insights: [],
  generatedAt: null,
  generating: false,
};

/* ── Mock account snapshot passed to Claude ── */
const ACCOUNT_CONTEXT = `
User account summary (as of today):
- Neobank balance: $47,832.10 USD
- AI Wallet (ETH/crypto): $21,333.00 (ETH 1.245, MATIC 295, BNB 1.245)
- Debit card spending this month: $9,214.40
- Active AI agents: AlphaFlow, Yield Pilot, Risk Sentinel, SwarmAlpha
- Monthly subscriptions: $662/mo total across 20 services (Netflix, Spotify, Amazon Prime, Brain Premium, etc.)
- Inactive subscriptions still billing: Signal Seer ($29/mo), Disney+ ($13.99/mo)
- Yield earned this month: $548.30 (1.16% APY)
- AlphaFlow trading volume this week: 47 trades (18% above 30-day avg)
- Idle cash in neobank: $4,200 not allocated to yield
- ETH price change: -12% in last 24h, volatility elevated
- Savings progress: $2,400 saved this month vs $1,920 last month
- Brain Premium renewal: in 3 days at $89/mo (annual = $890/yr, saves $178)
- Largest expense categories: AI Agents (48%), Subscriptions (29%), Transfers (16%)
- TaskForge Pro subscription: $96/mo, last used 9 days ago
`;

const SYSTEM_PROMPT = `You are Brain AI, a proactive financial assistant embedded in a neobank and AI agent marketplace called Brain Finance. 
Analyze the user's account data and generate exactly 6 personalized financial insights.

Return a valid JSON array only — no markdown, no explanation, just the array.
Each element must have these exact fields:
- "kind": one of "alert", "opportunity", "pattern", "warning", "info"
- "tag": short uppercase label (2-3 words max, e.g. "SPENDING ALERT", "OPPORTUNITY", "PATTERN")
- "text": 1-2 sentences of clear, specific, personalized insight. Include real numbers from the data.
- "action": short CTA phrase ending in " →" (e.g. "Review subscriptions →")

Mix the kinds across the 6 insights for variety. Be specific and data-driven.`;

export async function generateInsights(): Promise<DailyInsight[]> {
  if (state.generating) return state.insights;
  state.generating = true;

  try {
    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Here is my current account data:\n${ACCOUNT_CONTEXT}\n\nGenerate 6 personalized insights as a JSON array.`,
        },
      ],
    });

    let raw = message.content[0].type === "text" ? message.content[0].text.trim() : "[]";
    // Strip markdown code fences if Claude wraps output
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed: DailyInsight[] = JSON.parse(raw);

    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("Invalid insights format");

    state.insights = parsed.slice(0, 6);
    state.generatedAt = new Date();
    state.generating = false;
    return state.insights;
  } catch (err) {
    console.error("[Insights] Generation failed:", err);
    state.generating = false;
    // Return fallback static insights on error
    state.insights = FALLBACK_INSIGHTS;
    state.generatedAt = new Date();
    return state.insights;
  }
}

const FALLBACK_INSIGHTS: DailyInsight[] = [
  { kind: "alert",       tag: "SPENDING ALERT",  text: "Subscriptions up 38% vs last month. Signal Seer and Disney+ are inactive but still billing $42.99/mo combined.", action: "Review subscriptions →" },
  { kind: "opportunity", tag: "OPPORTUNITY",      text: "$4,200 is sitting idle in your Neobank. Moving it to the USDC yield vault earns ~$18/mo at current APY.", action: "Move to vault →" },
  { kind: "pattern",     tag: "PATTERN",          text: "AlphaFlow executed 47 trades this week — 18% above its 30-day average. Consider tightening its budget cap.", action: "Adjust budget →" },
  { kind: "warning",     tag: "MARKET ALERT",     text: "ETH is down 12% in the last 24h. Risk Sentinel recommends pausing momentum strategies until volatility drops.", action: "Review agents →" },
  { kind: "opportunity", tag: "SAVINGS",          text: "You saved $480 more than last month and are 60% toward your $3,000 Q2 savings goal — ahead of schedule.", action: "View savings goal →" },
  { kind: "info",        tag: "REMINDER",         text: "Brain Premium renews in 3 days at $89/mo. Switching to annual saves $178/yr and unlocks priority agent execution.", action: "Upgrade plan →" },
];

export function getInsightsState() {
  return {
    insights: state.insights,
    generatedAt: state.generatedAt,
    generating: state.generating,
    nextAt: state.generatedAt ? new Date(state.generatedAt.getTime() + 24 * 60 * 60 * 1000) : null,
  };
}

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function startDailyInsightsScheduler(
  broadcastFn: (userId: string, payload: object) => void
) {
  const DEMO_USER_ID = "demo-user";

  const run = async () => {
    console.log("[Insights] Starting daily insights generation...");
    const insights = await generateInsights();
    console.log(`[Insights] Generated ${insights.length} insights at ${state.generatedAt?.toISOString()}`);

    // Create notification
    const notif = await storage.createNotification({
      userId: DEMO_USER_ID,
      type: "insights",
      title: "Daily Insights Ready",
      body: `Brain AI has analysed your accounts and found ${insights.length} personalised recommendations for you today.`,
      data: { insightCount: insights.length, generatedAt: state.generatedAt?.toISOString() },
      read: false,
    });

    // Broadcast via SSE
    broadcastFn(DEMO_USER_ID, { type: "notification", notification: notif });
    broadcastFn("anonymous", { type: "notification", notification: notif });
  };

  // Run immediately on startup
  await run();

  // Schedule every 24h
  setInterval(run, INTERVAL_MS);
  console.log("[Insights] Scheduler started — runs every 24h");
}
