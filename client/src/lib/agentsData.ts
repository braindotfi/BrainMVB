export type AgentStatus = "active" | "inactive" | "paused";

export interface AgentRule {
  id: string;
  label: string;
  value: string;
}

export interface AgentData {
  id: string;
  name: string;
  description: string;
  avatar: string;
  status: AgentStatus;
  type: string;
  earnings: string;
  trades: number;
  successRate: string;
  lastActive: string;
  category: string;
  rules: AgentRule[];
  budget: string;
  riskLevel: "low" | "medium" | "high";
  schedule: string;
  walletAddress: string;
  deployedAt: string;
  activityLog: { time: string; event: string; detail: string; kind: "success" | "info" | "warn" }[];
}

export const agents: AgentData[] = [
  {
    id: "alphaflow",
    name: "AlphaFlow",
    description: "Executes automated trading strategies across crypto markets, optimizing for volatility, momentum, and liquidity signals in real time.",
    avatar: "/figmaAssets/avatars-3.svg",
    status: "active",
    type: "Trading",
    earnings: "+$12,450",
    trades: 847,
    successRate: "73%",
    lastActive: "2 min ago",
    category: "DeFi",
    rules: [
      { id: "r1", label: "Max position size", value: "Never exceed 5% of total portfolio in a single trade." },
      { id: "r2", label: "Stop-loss", value: "Auto-close any position that drops more than 8% from entry." },
      { id: "r3", label: "Asset whitelist", value: "Only trade BTC, ETH, SOL, and top-20 DeFi tokens by market cap." },
      { id: "r4", label: "Momentum filter", value: "Only enter trades when RSI > 55 on the 1H timeframe." },
      { id: "r5", label: "Cool-down period", value: "Wait at least 10 minutes between consecutive trades on the same asset." },
    ],
    budget: "$10,000",
    riskLevel: "medium",
    schedule: "Continuous (24/7)",
    walletAddress: "0xAb34...f91C",
    deployedAt: "Mar 12, 2025",
    activityLog: [
      { time: "2m ago", event: "Trade executed", detail: "BUY 0.42 ETH @ $3,204 — momentum signal triggered", kind: "success" },
      { time: "18m ago", event: "Trade executed", detail: "SELL 1,200 SOL @ $148 — take-profit hit", kind: "success" },
      { time: "1h ago", event: "Signal skipped", detail: "RSI below threshold on BTC/USDT — no action taken", kind: "info" },
      { time: "3h ago", event: "Stop-loss triggered", detail: "AVAX position closed — -7.9% from entry", kind: "warn" },
      { time: "5h ago", event: "Trade executed", detail: "BUY 850 LINK @ $18.22 — breakout detected", kind: "success" },
    ],
  },
  {
    id: "yieldpilot",
    name: "Yield Pilot",
    description: "Manages capital allocation across DeFi protocols and yield strategies while maintaining risk-adjusted returns.",
    avatar: "/figmaAssets/avatars-9.svg",
    status: "active",
    type: "Yield",
    earnings: "+$8,201",
    trades: 312,
    successRate: "88%",
    lastActive: "5 min ago",
    category: "DeFi",
    rules: [
      { id: "r1", label: "Protocol whitelist", value: "Only deposit into Aave, Compound, Curve, Yearn, and Pendle." },
      { id: "r2", label: "Min APY threshold", value: "Do not deploy capital to any pool with less than 4% APY." },
      { id: "r3", label: "Diversification", value: "Never allocate more than 30% of capital to a single protocol." },
      { id: "r4", label: "Rebalance frequency", value: "Rebalance allocations every 24 hours or when APY deviation exceeds 2%." },
      { id: "r5", label: "Gas budget", value: "Do not execute rebalance if estimated gas cost exceeds 0.5% of yield gained." },
    ],
    budget: "$25,000",
    riskLevel: "low",
    schedule: "Every 24 hours",
    walletAddress: "0xCd78...a33E",
    deployedAt: "Jan 5, 2025",
    activityLog: [
      { time: "5m ago", event: "Rebalance", detail: "Moved $3,200 from Aave USDC (5.1%) → Pendle PT-USDC (8.4%)", kind: "success" },
      { time: "29h ago", event: "Rebalance", detail: "No action — APY deviation within tolerance", kind: "info" },
      { time: "2d ago", event: "Deposit", detail: "Added $2,000 to Curve 3pool — APY 6.2%", kind: "success" },
    ],
  },
  {
    id: "risksentinel",
    name: "Risk Sentinel",
    description: "Continuously monitors positions and transactions to detect anomalies, enforce limits, and prevent loss.",
    avatar: "/figmaAssets/avatars.svg",
    status: "active",
    type: "Risk",
    earnings: "$0",
    trades: 2103,
    successRate: "99%",
    lastActive: "Just now",
    category: "Security",
    rules: [
      { id: "r1", label: "Portfolio drawdown limit", value: "Alert and pause all agents if total portfolio drops 15% in 24h." },
      { id: "r2", label: "Unusual transaction alert", value: "Flag any single outbound transaction exceeding $5,000." },
      { id: "r3", label: "Smart contract risk", value: "Block interaction with any contract less than 30 days old or unaudited." },
      { id: "r4", label: "Wallet monitoring", value: "Watch connected wallets for unexpected approvals or drains." },
      { id: "r5", label: "Counterparty check", value: "Cross-check all counterparties against OFAC and known exploit lists." },
    ],
    budget: "N/A (monitoring only)",
    riskLevel: "low",
    schedule: "Continuous (24/7)",
    walletAddress: "0xF002...b11A",
    deployedAt: "Dec 1, 2024",
    activityLog: [
      { time: "Just now", event: "Scan complete", detail: "All positions within limits — no anomalies detected", kind: "info" },
      { time: "2h ago", event: "Alert raised", detail: "AlphaFlow AVAX stop-loss triggered — Risk Sentinel notified", kind: "warn" },
      { time: "6h ago", event: "Contract blocked", detail: "Blocked interaction with unverified token contract 0xba21...", kind: "warn" },
      { time: "1d ago", event: "Scan complete", detail: "Portfolio drawdown 4.2% — within acceptable range", kind: "info" },
    ],
  },
  {
    id: "signalseer",
    name: "Signal Seer",
    description: "Aggregates news, social signals, and on-chain data to surface actionable insights and trading signals.",
    avatar: "/figmaAssets/avatars-5.svg",
    status: "paused",
    type: "Analytics",
    earnings: "+$3,800",
    trades: 198,
    successRate: "61%",
    lastActive: "1 hour ago",
    category: "Analytics",
    rules: [
      { id: "r1", label: "Signal sources", value: "Monitor CoinTelegraph, The Block, Twitter/X crypto accounts with >50k followers, and Dune Analytics." },
      { id: "r2", label: "Sentiment threshold", value: "Only emit a bullish signal when at least 3 independent sources agree." },
      { id: "r3", label: "Signal confidence", value: "Tag signals with Low / Medium / High confidence before forwarding." },
      { id: "r4", label: "Noise filter", value: "Ignore signals related to meme coins and tokens with <$1M market cap." },
      { id: "r5", label: "Cooldown", value: "Do not emit more than 10 signals per 24-hour period." },
    ],
    budget: "$500 / month (API costs)",
    riskLevel: "low",
    schedule: "Hourly scans",
    walletAddress: "0x7e90...d44F",
    deployedAt: "Feb 20, 2025",
    activityLog: [
      { time: "1h ago", event: "Paused by user", detail: "Agent manually paused — resume when ready", kind: "warn" },
      { time: "2h ago", event: "Signal emitted", detail: "MEDIUM confidence: BTC breakout above $70k — 4/5 sources agree", kind: "success" },
      { time: "4h ago", event: "Signal skipped", detail: "Conflicting sentiment on ETH — only 2/5 sources bullish", kind: "info" },
    ],
  },
  {
    id: "inboxzero",
    name: "InboxZero",
    description: "Manages email, filters priority messages, and drafts replies automatically using AI.",
    avatar: "/figmaAssets/avatars-2.svg",
    status: "inactive",
    type: "Productivity",
    earnings: "+$240",
    trades: 0,
    successRate: "N/A",
    lastActive: "3 days ago",
    category: "Productivity",
    rules: [
      { id: "r1", label: "Priority senders", value: "Always flag emails from: team@brain.finance, investors, known VCs." },
      { id: "r2", label: "Auto-reply scope", value: "Only draft replies for meeting requests, partnership inquiries, and support tickets." },
      { id: "r3", label: "Tone", value: "Keep all drafted replies professional, concise, and under 200 words." },
      { id: "r4", label: "Exclusions", value: "Never auto-reply to marketing, newsletters, or no-reply addresses." },
      { id: "r5", label: "Human review", value: "Flag any email mentioning legal, contracts, or financial terms for human review." },
    ],
    budget: "$50 / month",
    riskLevel: "low",
    schedule: "Every 30 minutes",
    walletAddress: "N/A",
    deployedAt: "Nov 10, 2024",
    activityLog: [
      { time: "3d ago", event: "Deactivated", detail: "Agent stopped — no activity since deactivation", kind: "warn" },
      { time: "4d ago", event: "Draft created", detail: "Auto-drafted reply to partnership inquiry from 0xfund.io", kind: "success" },
      { time: "4d ago", event: "Email flagged", detail: "Legal mention detected — forwarded to human review", kind: "warn" },
    ],
  },
  {
    id: "paystream",
    name: "Pay Stream",
    description: "Executes real-time payments for APIs and services using x402 protocols and smart contracts.",
    avatar: "/figmaAssets/avatars-1.svg",
    status: "inactive",
    type: "Payments",
    earnings: "+$950",
    trades: 67,
    successRate: "94%",
    lastActive: "5 days ago",
    category: "Finance",
    rules: [
      { id: "r1", label: "Payment whitelist", value: "Only pay to pre-approved API providers: OpenAI, Anthropic, Pinecone, Infura." },
      { id: "r2", label: "Max single payment", value: "Never authorize a single payment exceeding $500 without human confirmation." },
      { id: "r3", label: "Budget cap", value: "Do not exceed monthly spend budget of $2,000 across all services." },
      { id: "r4", label: "Retry logic", value: "Retry failed payments up to 3 times with 60-second intervals." },
      { id: "r5", label: "Receipt logging", value: "Store cryptographic proof of every payment on-chain via x402 receipt." },
    ],
    budget: "$2,000 / month",
    riskLevel: "medium",
    schedule: "On-demand (event-driven)",
    walletAddress: "0x3A1b...9eC7",
    deployedAt: "Jan 28, 2025",
    activityLog: [
      { time: "5d ago", event: "Deactivated", detail: "Agent stopped — budget cycle reset pending", kind: "warn" },
      { time: "6d ago", event: "Payment sent", detail: "$149.00 to Anthropic API — monthly invoice settled", kind: "success" },
      { time: "6d ago", event: "Payment failed", detail: "Infura endpoint timeout — retrying (1/3)", kind: "warn" },
      { time: "6d ago", event: "Payment sent", detail: "$12.50 to Infura — retry successful", kind: "success" },
    ],
  },
];
