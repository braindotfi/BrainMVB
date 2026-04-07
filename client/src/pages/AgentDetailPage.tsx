import { useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { agents, AgentData, AgentStatus, AgentRule } from "@/lib/agentsData";
import { AgentPerfChart } from "@/components/AgentPerfChart";
import { apiRequest } from "@/lib/queryClient";
import { useNav, AgentPrefillData } from "@/lib/navContext";

/* ────────────────────────────────────────────────────────
   Wallet display helpers
──────────────────────────────────────────────────────── */

/** Show first 6 + …… + last 6 characters */
const formatWallet = (addr: string): string => {
  if (!addr || addr === "N/A") return addr;
  // If it's a full hex address (42 chars with 0x)
  if (/^0x[0-9a-fA-F]{40}$/.test(addr)) {
    return addr.slice(0, 6) + "......" + addr.slice(-6);
  }
  // If already partially truncated (contains dots)
  if (addr.includes("...")) {
    // Rebuild: try first/last 6 from the raw abbreviated parts
    const firstPart = addr.split("...")[0];
    const lastPart = addr.split("...").slice(-1)[0];
    return `${firstPart.slice(0, 6)}......${lastPart.slice(-4)}`;
  }
  if (addr.length > 12) return addr.slice(0, 6) + "......" + addr.slice(-6);
  return addr;
};

/* ────────────────────────────────────────────────────────
   Convert AgentData (or raw API agent) → AgentPrefillData
──────────────────────────────────────────────────────── */

function buildPrefill(agent: AgentData, rawPolicy?: any): AgentPrefillData {
  const p = rawPolicy ?? {};

  // Extract numeric capital from budget string like "$10,000" or "$25,000 USDC"
  const parseBudget = (b: string) => {
    const match = b.replace(/,/g, "").match(/[\d.]+/);
    return match ? match[0] : "";
  };

  const execModeFromSchedule = (s: string): string => {
    const lower = s.toLowerCase();
    if (lower.includes("manual")) return "manual_approval";
    if (lower.includes("supervised")) return "supervised";
    return "automatic";
  };

  return {
    type:           (p.uiType   ?? agent.type   ?? "trading").toLowerCase(),
    name:           p.uiName    ?? agent.name   ?? "",
    description:    agent.description ?? "",
    avatar:         p.uiAvatar  ?? agent.avatar ?? "",
    capital:        p.uiCapitalAmount != null
                      ? String(p.uiCapitalAmount)
                      : parseBudget(agent.budget ?? ""),
    capitalAsset:   p.uiCapitalAsset  ?? "USDC",
    riskLevel:      p.uiRiskLevel     ?? agent.riskLevel ?? "moderate",
    maxDrawdown:    String(p.maxDrawdown  ?? 20),
    stopLoss:       String(p.stopLoss     ?? 10),
    executionMode:  p.uiExecutionMode ?? execModeFromSchedule(agent.schedule ?? ""),
    allowedAssets:  p.uiAllowedAssets ?? [],
    maxAlloc:       String(p.maxAllocationPct ?? 80),
    maxPosition:    String(p.maxPositionPct   ?? 25),
    maxTrades:      String(p.maxTradesPerDay  ?? 10),
    maxLTV:              String(p.maxLTV ?? 75),
    liquidationThreshold: String(p.liquidationThreshold ?? 85),
    targetAPY:      String(p.targetAPY  ?? 8),
    minAPY:         String(p.minAPY     ?? 4),
    rebalanceFreq:  p.rebalanceFreq  ?? "Every 24h",
    yieldProtocols: p.yieldProtocols ?? [],
    maxSinglePayment:       String(p.maxSinglePayment       ?? 500),
    monthlyBudgetCap:       String(p.monthlyBudgetCap       ?? 2000),
    autoApprovalThreshold:  String(p.autoApprovalThreshold  ?? 50),
  };
}

/** Map rule ID → step number in CreateAgentModal */
const ruleIdToStep = (ruleId: string): number => {
  if (ruleId === "r-capital")                               return 2;
  if (["r-drawdown", "r-stoploss", "r-approval", "r-auto"].includes(ruleId)) return 3;
  if (["r-allocation", "r-position", "r-trades", "r-assets"].includes(ruleId)) return 4;
  return 3;
};

/* ────────────────────────────────────────────────────────
   Convert raw API agent → AgentData
──────────────────────────────────────────────────────── */

function apiAgentToData(a: any): AgentData {
  const p = a.policy ?? {};
  const type = (p.uiType ?? a.category ?? "custom") as string;
  const capitalAmt: number = p.uiCapitalAmount ?? 0;
  const capitalAsset: string = p.uiCapitalAsset ?? "USDC";
  const riskLevel: "low" | "medium" | "high" =
    p.uiRiskLevel === "conservative" ? "low"
    : p.uiRiskLevel === "aggressive" ? "high"
    : "medium";

  const rules: AgentRule[] = buildRulesFromPolicy(p, type, capitalAmt, capitalAsset);

  const fmtDate = (d: string | Date | undefined) =>
    d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : undefined;

  const fmtDateTime = (d: string | Date | undefined) =>
    d ? new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : undefined;

  const deployedAt   = fmtDate(a.createdAt) ?? "Just now";

  // Show "Last Updated" if lastActiveAt is more than 60 seconds after createdAt
  const createdMs    = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const updatedMs    = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
  const wasEdited    = updatedMs - createdMs > 60_000;
  const lastUpdated  = wasEdited ? fmtDateTime(a.lastActiveAt) : undefined;

  return {
    id: a.id,
    name: a.name,
    ticker: p.uiTicker ? `$${p.uiTicker.toUpperCase()}` : `$${a.name.replace(/\s+/g, "").slice(0, 6).toUpperCase()}`,
    description: a.description || `${type} AI agent`,
    avatar: p.uiAvatar ?? a.avatarUrl ?? "/figmaAssets/avatars.svg",
    status: (["active", "inactive", "paused"].includes(a.status) ? a.status : "active") as AgentStatus,
    type: type.charAt(0).toUpperCase() + type.slice(1),
    earnings: "$0",
    trades: a.totalPaymentsExecuted ?? 0,
    successRate: "–",
    lastActive: "Just now",
    category: type.charAt(0).toUpperCase() + type.slice(1),
    rules,
    budget: capitalAmt > 0 ? `$${capitalAmt.toLocaleString()} ${capitalAsset}` : "Not set",
    riskLevel,
    schedule: executionModeLabel(p.uiExecutionMode),
    walletAddress: a.brainAccountAddress ?? "0x0000000000000000000000000000000000000000",
    deployedAt,
    lastUpdated,
    createdByUser: true,
    activityLog: [
      { time: "Just now", event: "Agent deployed", detail: `${a.name} activated and ready to execute.`, kind: "success" as const },
    ],
  };
}

function executionModeLabel(mode: string | undefined): string {
  switch (mode) {
    case "automatic":       return "Continuous (automatic)";
    case "manual_approval": return "Manual approval required";
    case "scheduled":       return "Scheduled";
    default:                return "Continuous (automatic)";
  }
}

function buildRulesFromPolicy(p: any, type: string, capitalAmt: number, capitalAsset: string): AgentRule[] {
  const rules: AgentRule[] = [];
  const t = (type ?? "").toLowerCase();

  if (capitalAmt > 0)
    rules.push({ id: "r-capital", label: "Capital allocation", value: `Deploy up to $${capitalAmt.toLocaleString()} ${capitalAsset} as working capital.` });
  if (p.maxDrawdown != null && p.maxDrawdown > 0)
    rules.push({ id: "r-drawdown", label: "Maximum drawdown", value: `Pause all activity if portfolio value drops more than ${p.maxDrawdown}% from its peak.` });
  if (p.stopLoss != null && p.stopLoss > 0)
    rules.push({ id: "r-stoploss", label: "Stop-loss", value: `Auto-close any position that drops more than ${p.stopLoss}% from entry price.` });
  if (p.maxAllocationPct != null && p.maxAllocationPct < 100)
    rules.push({ id: "r-allocation", label: "Max capital allocation", value: `Never deploy more than ${p.maxAllocationPct}% of total capital at once.` });
  if (p.maxPositionPct != null && p.maxPositionPct > 0 && (t === "trading" || t === "yield" || t === "lending"))
    rules.push({ id: "r-position", label: "Max position size", value: `No single position may exceed ${p.maxPositionPct}% of total portfolio.` });
  if (p.maxTradesPerDay != null && p.maxTradesPerDay > 0 && t === "trading")
    rules.push({ id: "r-trades", label: "Daily trade limit", value: `Execute no more than ${p.maxTradesPerDay} trades per 24-hour period.` });
  if (Array.isArray(p.uiAllowedAssets) && p.uiAllowedAssets.length > 0)
    rules.push({ id: "r-assets", label: "Allowed assets", value: `Only interact with the following assets: ${p.uiAllowedAssets.join(", ")}.` });
  if (p.uiExecutionMode === "manual_approval")
    rules.push({ id: "r-approval", label: "Execution approval", value: "Every action requires manual confirmation before execution." });
  else
    rules.push({ id: "r-auto", label: "Autonomous execution", value: "Agent may execute actions automatically without per-action approval." });

  if (rules.length <= 1) {
    if (t === "trading") {
      rules.push(
        { id: "r1", label: "Max position size", value: "Never exceed 5% of total portfolio in a single trade." },
        { id: "r2", label: "Stop-loss", value: "Auto-close any position that drops more than 8% from entry." },
      );
    } else if (t === "payments") {
      rules.push({ id: "r1", label: "Payment whitelist", value: "Only pay to pre-approved recipients." });
    } else {
      rules.push({ id: "r1", label: "Autonomous execution", value: "Agent executes tasks autonomously within defined parameters." });
    }
  }

  return rules;
}

/* ────────────────────────────────────────────────────────
   Sub-components
──────────────────────────────────────────────────────── */

const HDivider = () => <div className="h-px w-full flex-shrink-0" style={{ background: "#1d2132" }} />;

const VDivider = () => (
  <div className="flex-shrink-0 self-stretch" style={{ width: "1px", background: "#1d2132" }} />
);

const StatCol = ({ label, value, accent }: { label: string; value: string; accent?: string }) => (
  <div className="flex flex-col gap-[3px] items-center justify-center flex-1 min-w-0">
    <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#414965] text-[13px] leading-[14px] whitespace-nowrap">{label}</span>
    <span className="[font-family:'Gilroy-Bold',Helvetica] text-[16px] leading-[20px] whitespace-nowrap" style={{ color: accent ?? "#a8b9f4" }}>{value}</span>
  </div>
);

const PencilIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M11.333 2a1.886 1.886 0 0 1 2.667 2.667L5.167 13.5l-3.5.833.833-3.5L11.333 2Z" stroke="#ff9500" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const EditHintPill = () => (
  <div className="flex gap-[4px] items-center pl-[4px] pr-[8px] py-[4px] rounded-[40px] flex-shrink-0" style={{ background: "#11141b" }}>
    <div className="w-[16px] h-[16px] flex items-center justify-center">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M8.5 1.5a1.414 1.414 0 0 1 2 2L3.875 10.125l-2.625.625.625-2.625L8.5 1.5Z" stroke="#414965" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
    <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#414965] text-[13px] leading-[14px] whitespace-nowrap">Click Edit to modify</span>
  </div>
);

const ConfigRow = ({
  label, value, hasDivider, onEdit,
}: { label: string; value: string; hasDivider: boolean; onEdit?: () => void }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <>
      <div className="flex gap-[8px] items-center w-full transition-colors"
        style={{ background: onEdit && hovered ? "rgba(74,35,0,0.06)" : "transparent" }}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <div className="flex flex-col gap-[8px] items-start flex-1 min-w-0">
          <p className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[16px] leading-[20px]">{label}</p>
          <p className="[font-family:'Gilroy-Medium',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">{value}</p>
        </div>
        {onEdit && (
          <button
            onClick={onEdit}
            className="flex-shrink-0 flex gap-[4px] items-center justify-center px-[12px] py-[8px] rounded-[100px] transition-all"
            style={{ background: "#4a2300", opacity: hovered ? 1 : 0, pointerEvents: hovered ? "auto" : "none" }}>
            <PencilIcon />
            <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#ff9500] text-[12px] leading-[16px] whitespace-nowrap">Edit</span>
          </button>
        )}
      </div>
      {hasDivider && <HDivider />}
    </>
  );
};

const RuleRow = ({
  index, label, value, hasDivider, onEdit,
}: { index: number; label: string; value: string; hasDivider: boolean; onEdit?: () => void }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <>
      <div className="flex gap-[12px] items-start transition-colors"
        style={{ background: hovered ? "rgba(74,35,0,0.06)" : "transparent" }}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        data-testid={`rule-row-${index}`}>
        <div className="flex items-center justify-center flex-shrink-0 px-[12px] py-[4px] rounded-[40px]" style={{ background: "#11141b", minWidth: "24px" }}>
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[13px] leading-[16px]">{index + 1}</span>
        </div>
        <div className="flex flex-1 min-w-0 gap-[8px] items-start">
          <div className="flex flex-col gap-[8px] flex-1 min-w-0">
            <p className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[16px] leading-[24px]">{label}</p>
            <p className="[font-family:'Gilroy-Medium',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">{value}</p>
          </div>
          <button
            data-testid={`button-edit-rule-${index}`}
            onClick={onEdit}
            className="flex-shrink-0 flex gap-[4px] items-center justify-center px-[12px] py-[8px] rounded-[100px] transition-all"
            style={{ background: "#4a2300", opacity: hovered ? 1 : 0, pointerEvents: hovered ? "auto" : "none" }}>
            <PencilIcon />
            <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#ff9500] text-[12px] leading-[16px] whitespace-nowrap">Edit</span>
          </button>
        </div>
      </div>
      {hasDivider && <HDivider />}
    </>
  );
};

const StartStopBtn = ({ isActive, onToggle }: { isActive: boolean; onToggle: () => void }) => {
  if (isActive) {
    return (
      <button data-testid="button-stop-agent" onClick={onToggle}
        className="flex gap-[4px] items-center justify-center px-[12px] py-[8px] rounded-[100px] flex-shrink-0 transition-colors hover:opacity-80"
        style={{ background: "#350011" }}>
        <div className="w-[12px] h-[12px] rounded-[2px] flex-shrink-0" style={{ background: "#d20344" }} />
        <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#d20344] text-[12px] leading-[16px] whitespace-nowrap">Stop</span>
      </button>
    );
  }
  return (
    <button data-testid="button-start-agent" onClick={onToggle}
      className="flex gap-[4px] items-center justify-center px-[12px] py-[8px] rounded-[100px] flex-shrink-0 transition-colors hover:opacity-80"
      style={{ background: "#123509" }}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 2L10 6L3 10V2Z" fill="#42bf23" /></svg>
      <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#42bf23] text-[12px] leading-[16px] whitespace-nowrap">Start</span>
    </button>
  );
};

const ActivityDot = ({ kind }: { kind: "success" | "info" | "warn" }) => {
  const colors = { success: "#42bf23", info: "#a8b9f4", warn: "#d20344" } as const;
  return (
    <div className="flex-shrink-0 flex items-start pt-[4px]">
      <div className="w-[8px] h-[8px] rounded-full" style={{ background: colors[kind] }} />
    </div>
  );
};

const eventColors = { success: "#42bf23", info: "#a8b9f4", warn: "#d20344" } as const;

const Skeleton = ({ className }: { className?: string }) => (
  <div className={`animate-pulse rounded-[8px] ${className ?? ""}`} style={{ background: "#1d2132" }} />
);

/* ════════════════════════════════════════════════════════
   Main page
════════════════════════════════════════════════════════ */
export const AgentDetailPage = (): JSX.Element => {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { openCreateAgentAtStep } = useNav();

  // 1. Try static lookup first
  const staticAgent = agents.find((a) => a.id === params.id);

  // 2. If not in static list, fetch from the API
  const { data: apiAgent, isLoading } = useQuery<any>({
    queryKey: ["/api/agents", params.id],
    queryFn: () => apiRequest("GET", `/api/agents/${params.id}`).then((r) => r.json()),
    enabled: !staticAgent && !!params.id,
    retry: false,
  });

  const agent: AgentData | null = staticAgent ?? (apiAgent ? apiAgentToData(apiAgent) : null);
  const rawPolicy = apiAgent?.policy ?? null;

  const qc = useQueryClient();
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const effectiveStatus: AgentStatus = agentStatus ?? agent?.status ?? "inactive";
  const isActive = effectiveStatus === "active";

  const statusMutation = useMutation({
    mutationFn: async (newStatus: AgentStatus) => {
      if (!apiAgent) return;
      const res = await apiRequest("PATCH", `/api/agents/${params.id}/status`, { status: newStatus });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/agents", params.id] });
      qc.invalidateQueries({ queryKey: ["/api/agents"] });
    },
  });

  const handleToggle = () => {
    const current = agentStatus ?? agent?.status ?? "inactive";
    const next: AgentStatus = current === "active" ? "inactive" : "active";
    setAgentStatus(next);
    statusMutation.mutate(next);
  };

  // Build prefill once (stable reference)
  const getPrefill = useCallback((): AgentPrefillData | undefined => {
    if (!agent) return undefined;
    return buildPrefill(agent, rawPolicy);
  }, [agent, rawPolicy]);

  // Only user-created agents (those with keccak256-style IDs) can be edited via PATCH
  const editableId = agent?.createdByUser && apiAgent ? params.id : undefined;

  const openEdit = useCallback((step: number) => {
    const prefill = getPrefill();
    openCreateAgentAtStep(step, prefill, editableId);
  }, [getPrefill, openCreateAgentAtStep, editableId]);

  /* ── Loading state ── */
  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-[#11141b] rounded-[16px] border border-solid border-[#1d2132] overflow-hidden">
        <div className="flex items-center gap-[8px] px-[16px] flex-shrink-0" style={{ height: "64px", borderBottom: "1px solid #1d2132" }}>
          <div className="w-[32px] h-[32px] rounded-[100px]" style={{ background: "#1d2132" }} />
        </div>
        <div className="flex flex-col gap-[16px] p-[16px]">
          <div className="rounded-[16px] p-[16px] flex flex-col gap-[16px]" style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
            <div className="flex gap-[8px] items-center">
              <Skeleton className="w-[64px] h-[64px] rounded-[12px]" />
              <div className="flex flex-col gap-[8px] flex-1">
                <Skeleton className="h-[20px] w-[140px]" />
                <Skeleton className="h-[16px] w-[100px]" />
              </div>
            </div>
            <Skeleton className="h-[16px] w-full" />
            <Skeleton className="h-[16px] w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  /* ── Not found ── */
  if (!agent) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-[#11141b] rounded-[16px] border border-[#1d2132]">
        <span className="text-4xl">🤖</span>
        <p className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#414965] text-[14px]">Agent not found</p>
        <button onClick={() => navigate("/agents")}
          className="px-4 py-2 rounded-full text-sm transition-opacity hover:opacity-80"
          style={{ background: "#4a2300", color: "#ff9500", fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif" }}>
          Back to Agents
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#11141b] rounded-[16px] border border-solid border-[#1d2132] overflow-hidden">

      {/* Top nav bar */}
      <div className="flex items-center gap-[8px] px-[16px] flex-shrink-0"
        style={{ height: "64px", borderBottom: "1px solid #1d2132", background: "#11141b" }}>
        <button data-testid="button-back" onClick={() => window.history.back()}
          className="w-[32px] h-[32px] rounded-[100px] flex items-center justify-center flex-shrink-0 transition-colors hover:bg-[#1d2132]"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #1d2132" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7L9 11" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[16px] p-[16px] pb-8">

          {/* 1. Identity card */}
          <div className="rounded-[16px] overflow-hidden flex flex-col gap-[16px] p-[16px]"
            style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
            <div className="flex gap-[8px] items-center w-full">
              <div className="overflow-hidden relative flex-shrink-0 w-[64px] h-[64px] rounded-[12px]">
                <img src={agent.avatar} alt={agent.name} className="absolute inset-0 w-full h-full object-cover" />
              </div>
              <div className="flex flex-1 min-w-0 gap-[16px] items-center">
                <div className="flex flex-col gap-[4px] flex-1 min-w-0">
                  <div className="flex items-center gap-[4px]">
                    <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-white text-[16px] leading-[20px] whitespace-nowrap">{agent.name}</span>
                  </div>
                  <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[14px] leading-[20px] whitespace-nowrap">Deployed: {agent.deployedAt}</span>
                </div>
                <StartStopBtn isActive={isActive} onToggle={handleToggle} />
              </div>
            </div>

            <p className="[font-family:'Gilroy-Medium',Helvetica] text-[#a8b9f4] text-[14px] leading-[20px]">{agent.description}</p>
            <HDivider />

            <div className="flex items-center gap-[6px]">
              <StatCol label="Total Actions" value={agent.trades.toLocaleString()} />
              <VDivider />
              <StatCol label="Total Earnings" value={agent.earnings}
                accent={agent.earnings.startsWith("+") ? "#a8b9f4" : agent.earnings === "$0" ? "#a8b9f4" : "#d20344"} />
              <VDivider />
              <StatCol label="Success Rate" value={agent.successRate} accent="#42bf23" />
            </div>

            <HDivider />

            <div className="flex items-center gap-[6px]">
              <StatCol label="Creator" value={formatWallet(agent.walletAddress)} />
              <VDivider />
              <StatCol label="Category" value={agent.category} />
              <VDivider />
              <StatCol label="Last Active" value={agent.lastActive} />
            </div>
          </div>

          {/* 2. Performance chart */}
          <AgentPerfChart agent={agent} />

          {/* 3. Configuration card */}
          <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
            <div className="flex items-center justify-between px-[16px] py-[12px]" style={{ borderBottom: "1px solid #1d2132" }}>
              <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">Configuration</span>
              <EditHintPill />
            </div>
            <div className="flex flex-col gap-[16px] p-[16px]">
              <ConfigRow
                label="Budget / Spend Limit"
                value={agent.budget}
                hasDivider
                onEdit={() => openEdit(2)}
              />
              <ConfigRow
                label="Execution Schedule"
                value={agent.schedule}
                hasDivider
                onEdit={() => openEdit(3)}
              />
              <ConfigRow
                label="Deployed"
                value={agent.deployedAt}
                hasDivider={!!agent.lastUpdated}
              />
              {agent.lastUpdated && (
                <ConfigRow
                  label="Last Updated"
                  value={agent.lastUpdated}
                  hasDivider={false}
                />
              )}
            </div>
          </div>

          {/* 4. Rulebook card */}
          <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
            <div className="flex items-center justify-between px-[16px] py-[12px]" style={{ borderBottom: "1px solid #1d2132" }}>
              <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">Rulebook</span>
              <EditHintPill />
            </div>
            <div className="flex flex-col gap-[16px] p-[16px]">
              {agent.rules.length > 0 ? (
                agent.rules.map((rule, i) => (
                  <RuleRow
                    key={rule.id}
                    index={i}
                    label={rule.label}
                    value={rule.value}
                    hasDivider={i < agent.rules.length - 1}
                    onEdit={() => openEdit(ruleIdToStep(rule.id))}
                  />
                ))
              ) : (
                <p className="[font-family:'Gilroy-Medium',Helvetica] text-[#414965] text-[14px] leading-[20px]">No rules configured.</p>
              )}
            </div>
          </div>

          {/* 5. Recent Activity card */}
          <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
            <div className="flex items-center justify-between px-[16px] py-[12px]" style={{ borderBottom: "1px solid #1d2132" }}>
              <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">Recent Activity</span>
            </div>
            <div className="flex flex-col gap-[16px] p-[16px]">
              {agent.activityLog.map((log, i) => (
                <div key={i}>
                  <div className="flex gap-[12px] items-start">
                    <ActivityDot kind={log.kind} />
                    <div className="flex flex-col flex-1 min-w-0">
                      <div className="flex gap-[16px] items-start whitespace-nowrap">
                        <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[16px] leading-[24px] flex-shrink-0" style={{ color: eventColors[log.kind] }}>
                          {log.event}
                        </span>
                        <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[14px] leading-[24px] flex-shrink-0">{log.time}</span>
                      </div>
                      <p className="[font-family:'Gilroy-Medium',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">{log.detail}</p>
                    </div>
                  </div>
                  {i < agent.activityLog.length - 1 && <div className="mt-[16px]"><HDivider /></div>}
                </div>
              ))}
            </div>
          </div>

        </div>
      </ScrollArea>
    </div>
  );
};
