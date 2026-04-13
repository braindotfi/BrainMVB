import { useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AreaChart, Area, Tooltip, ResponsiveContainer, Customized } from "recharts";
import { agents, AgentData, AgentStatus } from "@/lib/agentsData";
import { apiRequest } from "@/lib/queryClient";
import { useNav, AgentPrefillData } from "@/lib/navContext";

/* ─── Helpers ─── */
const truncShort = (addr: string) =>
  addr?.length > 10 ? addr.slice(0, 6) + "..." + addr.slice(-4) : (addr ?? "");

const shortId = (id: string) => {
  const hex = id?.startsWith("0x") ? id.slice(2) : id ?? "";
  return "0x" + hex.slice(0, 8);
};

const fmtConfigValue = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "number") return v.toLocaleString();
  return String(v);
};

function buildPrefill(agent: AgentData, rawPolicy?: any): AgentPrefillData {
  const p = rawPolicy ?? {};
  const parseBudget = (b: string) => { const m = b?.replace(/,/g, "").match(/[\d.]+/); return m ? m[0] : ""; };
  return {
    type: (p.uiType ?? agent.type ?? "trading").toLowerCase(),
    name: p.uiName ?? agent.name ?? "",
    description: agent.description ?? "",
    avatar: p.uiAvatar ?? agent.avatar ?? "",
    capital: p.uiCapitalAmount != null ? String(p.uiCapitalAmount) : parseBudget(agent.budget ?? ""),
    capitalAsset: p.uiCapitalAsset ?? "USDC",
    riskLevel: p.uiRiskLevel ?? "moderate",
    maxDrawdown: String(p.maxDrawdown ?? 20),
    stopLoss: String(p.stopLoss ?? 10),
    executionMode: p.uiExecutionMode ?? "automatic",
    allowedAssets: p.uiAllowedAssets ?? [],
    maxAlloc: String(p.maxAllocationPct ?? 80),
    maxPosition: String(p.maxPositionPct ?? 25),
    maxTrades: String(p.maxTradesPerDay ?? 10),
    maxLTV: String(p.maxLTV ?? 75),
    liquidationThreshold: String(p.liquidationThreshold ?? 85),
    targetAPY: String(p.targetAPY ?? 8),
    minAPY: String(p.minAPY ?? 4),
    rebalanceFreq: p.rebalanceFreq ?? "Every 24h",
    yieldProtocols: p.yieldProtocols ?? [],
    maxSinglePayment: String(p.maxSinglePayment ?? 500),
    monthlyBudgetCap: String(p.monthlyBudgetCap ?? 2000),
    autoApprovalThreshold: String(p.autoApprovalThreshold ?? 50),
    typeConfig: p.typeConfig ?? {},
  };
}

function apiAgentToData(a: any): AgentData {
  const p = a.policy ?? {};
  const type = (p.uiType ?? a.category ?? "custom") as string;
  const capitalAmt: number = p.uiCapitalAmount ?? 0;
  const capitalAsset: string = p.uiCapitalAsset ?? "USDC";
  const fmtDate = (d: string | Date | undefined) =>
    d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : undefined;
  const deployedAt = fmtDate(a.createdAt) ?? "Just now";
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
    rules: [],
    budget: capitalAmt > 0 ? `$${capitalAmt.toLocaleString()} ${capitalAsset}` : "Not set",
    riskLevel: "medium",
    schedule: "Automatic",
    walletAddress: a.brainAccountAddress ?? "0x0000000000000000000000000000000000000000",
    deployedAt,
    createdByUser: true,
    activityLog: [
      { time: "Just now", event: "Agent deployed", detail: `${a.name} activated and ready to execute.`, kind: "success" as const },
    ],
  };
}

/* ═══════════════════════════════════════════════════════
   SHARED PRIMITIVE COMPONENTS
═══════════════════════════════════════════════════════ */
const HDivider = () => <div className="h-px w-full flex-shrink-0" style={{ background: "#1d2132" }} />;
const Dot = () => <div className="w-[4px] h-[4px] rounded-full flex-shrink-0" style={{ background: "#6c779d" }} />;
const Skeleton = ({ className }: { className?: string }) => (
  <div className={`animate-pulse rounded-[8px] ${className ?? ""}`} style={{ background: "#1d2132" }} />
);

/* ── Reputation Banner ── */
type RepTier = "Legendary" | "Diamond" | "Gold" | "Silver" | "Bronze" | "New" | "Unranked" | "Caution";
interface AgentRep { score: number; tier: RepTier; rankLabel: string; percentile: number; validationCount: number; totalVolumeUsd: number; ageLabel?: string; }
const REP_TC: Record<RepTier, { bg: string; border: string; text: string; shield: string }> = {
  Legendary: { bg: "#1a0840", border: "rgba(157,92,245,0.25)",  text: "#9d5cf5", shield: "#9d5cf5" },
  Diamond:   { bg: "#0a1a2e", border: "rgba(56,189,248,0.25)",  text: "#38bdf8", shield: "#38bdf8" },
  Gold:      { bg: "#1a0e00", border: "rgba(255,149,0,0.25)",   text: "#ff9500", shield: "#ff9500" },
  Silver:    { bg: "#10131a", border: "rgba(168,185,244,0.25)", text: "#a8b9f4", shield: "#a8b9f4" },
  Bronze:    { bg: "#140c00", border: "rgba(205,124,47,0.25)",  text: "#cd7c2f", shield: "#cd7c2f" },
  New:       { bg: "#001a16", border: "rgba(0,212,170,0.25)",   text: "#00d4aa", shield: "#00d4aa" },
  Unranked:  { bg: "#0d0f14", border: "rgba(65,73,101,0.25)",   text: "#6c779d", shield: "#414965" },
  Caution:   { bg: "#1a0009", border: "rgba(210,3,68,0.3)",     text: "#d20344", shield: "#d20344" },
};
const ReputationBanner = ({ agentId }: { agentId: string }) => {
  const { data: rep } = useQuery<AgentRep>({
    queryKey: ["/api/agents", agentId, "reputation"],
    queryFn: () => fetch(`/api/agents/${agentId}/reputation`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    enabled: !!agentId,
  });
  if (!rep) return null;
  const tc = REP_TC[rep.tier];

  const subtitle = rep.tier === "New"
    ? rep.ageLabel ? `${rep.ageLabel} · building reputation` : "Newly registered · building reputation"
    : rep.tier === "Unranked"
    ? `${rep.validationCount} on-chain validations · not enough activity to rank`
    : rep.tier === "Caution"
    ? `${Math.abs(rep.score)} negative score · ${rep.validationCount} failed or disputed validations`
    : `Top ${100 - rep.percentile}% · ${rep.validationCount.toLocaleString()} on-chain validations`;

  const scoreLabel = rep.tier === "Caution" ? `−${Math.abs(rep.score)}` : rep.tier === "New" || rep.tier === "Unranked" ? "—" : rep.score.toLocaleString();

  return (
    <div
      className="rounded-[16px] p-[16px] flex items-center gap-[16px]"
      style={{ background: tc.bg, border: `1px solid ${tc.border}` }}
      data-testid="card-reputation"
    >
      <div className="flex-shrink-0 w-[40px] h-[40px] rounded-full flex items-center justify-center"
        style={{ background: `${tc.shield}18` }}>
        <Shield size={20} color={tc.shield} strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-[8px] flex-wrap">
          <span className="[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-[18px] leading-[22px]" style={{ color: tc.text }}>
            {rep.tier}
          </span>
          {rep.rankLabel !== "—" && rep.rankLabel !== "Unranked" && rep.tier !== "New" && rep.tier !== "Caution" && (
            <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[13px] text-[#6c779d]">
              Rank {rep.rankLabel}
            </span>
          )}
          {rep.tier === "Caution" && (
            <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[11px] px-[8px] py-[2px] rounded-full" style={{ background: "rgba(210,3,68,0.15)", color: "#d20344" }}>
              Under review
            </span>
          )}
        </div>
        <div className="flex items-center gap-[12px] mt-[4px] flex-wrap">
          <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[11px] text-[#6c779d]">
            {subtitle}
          </span>
          {rep.tier !== "New" && rep.tier !== "Unranked" && rep.totalVolumeUsd > 0 && (
            <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[11px] text-[#414965]">
              ${rep.totalVolumeUsd.toLocaleString()} lifetime volume
            </span>
          )}
        </div>
      </div>
      <div className="flex-shrink-0 text-right">
        <div className="[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-[15px]" style={{ color: tc.text }}>
          {scoreLabel}
        </div>
        <div className="[font-family:'Plus Jakarta Sans',Helvetica] text-[10px] text-[#414965] uppercase tracking-wide mt-[2px]">
          Rep Score
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   SHARED TOP BAR  (Back ← | Edit · Stop · Delete →)
═══════════════════════════════════════════════════════ */
const AgentTopBar = ({ onBack, onEdit, isActive, onToggle, onDelete, agentName }: {
  onBack: () => void; onEdit: () => void; isActive: boolean; onToggle: () => void;
  onDelete: () => void; agentName: string;
}) => {
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <>
      <div className="relative flex-shrink-0" style={{ height: "64px", background: "#11141b" }}>
        <button onClick={onBack} data-testid="button-back"
          className="absolute left-[16px] top-[16px] w-[32px] h-[32px] rounded-[100px] flex items-center justify-center hover:opacity-70"
          style={{ background: "#1d2132" }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3.5L6 8L10 12.5" stroke="#6c779d" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="absolute right-[16px] top-[16px] flex items-center gap-[8px]">
          {/* Edit (grey) */}
          <button onClick={onEdit} data-testid="button-edit-agent"
            className="flex gap-[4px] items-center justify-center px-[12px] py-[8px] rounded-[100px] hover:opacity-80"
            style={{ background: "#222737" }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M11.333 2a1.886 1.886 0 0 1 2.667 2.667L5.167 13.5l-3.5.833.833-3.5L11.333 2Z" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[12px] leading-[16px] whitespace-nowrap">Edit</span>
          </button>
          {/* Stop / Start */}
          <button data-testid="button-stop-agent" onClick={onToggle}
            className="flex gap-[4px] items-center justify-center px-[12px] py-[8px] rounded-[100px] hover:opacity-80"
            style={{ background: "#350011" }}>
            {isActive
              ? <div className="w-[12px] h-[12px] rounded-[2px] flex-shrink-0" style={{ background: "#d20344" }} />
              : <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 2L10 6L3 10V2Z" fill="#d20344" /></svg>}
            <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#d20344] text-[12px] leading-[16px] whitespace-nowrap">
              {isActive ? "Stop" : "Start"}
            </span>
          </button>
          {/* Delete */}
          <button data-testid="button-delete-agent" onClick={() => setShowConfirm(true)}
            className="flex gap-[4px] items-center justify-center px-[12px] py-[8px] rounded-[100px] hover:opacity-80"
            style={{ background: "#350011" }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M5 4V2.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5V4M6 7v5M10 7v5M3 4l.8 9.2a.8.8 0 0 0 .8.8h6.8a.8.8 0 0 0 .8-.8L13 4" stroke="#d20344" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#d20344] text-[12px] leading-[16px] whitespace-nowrap">Delete</span>
          </button>
        </div>
      </div>

      {/* ── Delete confirmation dialog ── */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowConfirm(false); }}
        >
          <div
            className="flex flex-col gap-[20px] p-[24px] rounded-[20px] w-[320px]"
            style={{ background: "#11141b", border: "1px solid #1d2132", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}
          >
            {/* Icon */}
            <div className="w-[48px] h-[48px] rounded-full flex items-center justify-center mx-auto" style={{ background: "#350011" }}>
              <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
                <path d="M2 4h12M5 4V2.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5V4M6 7v5M10 7v5M3 4l.8 9.2a.8.8 0 0 0 .8.8h6.8a.8.8 0 0 0 .8-.8L13 4" stroke="#d20344" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            {/* Text */}
            <div className="flex flex-col gap-[8px] text-center">
              <span className="[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-white text-[16px] leading-[20px]">
                Delete Agent
              </span>
              <p className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[13px] leading-[18px]">
                Are you sure you want to delete <span className="text-[#a8b9f4] font-medium">{agentName}</span>? This action cannot be undone.
              </p>
            </div>
            {/* Buttons */}
            <div className="flex gap-[8px]">
              <button
                data-testid="button-delete-cancel"
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-[10px] rounded-[100px] [font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[13px] font-medium hover:opacity-80 transition-opacity"
                style={{ background: "#1d2132" }}
              >
                Cancel
              </button>
              <button
                data-testid="button-delete-confirm"
                onClick={() => { setShowConfirm(false); onDelete(); }}
                className="flex-1 py-[10px] rounded-[100px] [font-family:'Plus Jakarta Sans',Helvetica] text-white text-[13px] font-semibold hover:opacity-80 transition-opacity"
                style={{ background: "#d20344" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

/* ═══════════════════════════════════════════════════════
   SHARED HEADER CARD
═══════════════════════════════════════════════════════ */
const AgentHeaderCard = ({ agent, agentType, agentId }: {
  agent: AgentData; agentType: string; agentId: string;
}) => (
  <div className="rounded-[16px] overflow-hidden flex flex-col gap-[8px] p-[16px]" style={{ background: "#0a0c10" }}>
    <div className="flex gap-[8px] items-center w-full">
      <div className="overflow-hidden relative flex-shrink-0 w-[64px] h-[64px] rounded-[12px]">
        <img src={agent.avatar} alt={agent.name} className="absolute inset-0 w-full h-full object-cover" />
      </div>
      <div className="flex flex-1 min-w-0 flex-col gap-[4px]">
        <div className="flex items-center gap-[4px]">
          <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-white text-[16px] leading-[20px] whitespace-nowrap">{agent.name}</span>
          <div className="flex items-center justify-center px-[8px] py-[3px] rounded-[22px] flex-shrink-0"
            style={{ background: "#222737", border: "1px solid rgba(108,119,157,0.2)" }}>
            <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[11px] leading-[14px] capitalize">{agentType}</span>
          </div>
        </div>
        <div className="flex items-center gap-[8px] flex-wrap">
          <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[14px] leading-[20px] whitespace-nowrap">
            Deployed: {agent.deployedAt}
          </span>
          <Dot />
          <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[14px] leading-[20px] whitespace-nowrap">
            ID: {shortId(agentId)}
          </span>
          <Dot />
          <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[14px] leading-[20px] whitespace-nowrap">
            Owner: {truncShort(agent.walletAddress)}
          </span>
        </div>
      </div>
    </div>
    <p className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#a8b9f4] text-[14px] leading-[20px]">{agent.description}</p>
  </div>
);

/* ═══════════════════════════════════════════════════════
   SHARED STAT CARDS ROW
═══════════════════════════════════════════════════════ */
const StatCard = ({ label, value, sup, color }: { label: string; value: string; sup?: string; color?: string }) => (
  <div className="rounded-[16px] p-[16px] flex flex-col gap-[8px] flex-1 min-w-0" style={{ background: "#0a0c10" }}>
    <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#414965] text-[13px] leading-[14px] whitespace-nowrap">{label}</span>
    <p style={{ color: color ?? "#a8b9f4", fontSize: 0, lineHeight: 0 }}>
      <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[20px] leading-[24px]">{value}</span>
      {sup && <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[16px] leading-[24px]">{sup}</span>}
    </p>
  </div>
);

/* ═══════════════════════════════════════════════════════
   SHARED POLICIES SECTION
═══════════════════════════════════════════════════════ */
type PolicyCell = { label: string; value: string };

const PolicyGrid = ({ rows, onEdit }: { rows: PolicyCell[][]; onEdit?: () => void }) => (
  <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10" }}>
    <div className="px-[16px] py-[12px] flex items-center justify-between" style={{ borderBottom: "1px solid #1d2132" }}>
      <div className="flex items-center gap-[8px]">
        <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#a8b9f4] text-[16px] leading-[20px]">Policies</span>
        <Dot />
        <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[13px] leading-[20px]">V4</span>
        <Dot />
        <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[13px] leading-[20px]">edited on-chain 42 days ago</span>
      </div>
      {onEdit && (
        <button onClick={onEdit}
          className="flex items-center gap-[4px] px-[12px] py-[8px] rounded-[100px] hover:opacity-80 flex-shrink-0"
          style={{ background: "#222737" }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M11.333 2a1.886 1.886 0 0 1 2.667 2.667L5.167 13.5l-3.5.833.833-3.5L11.333 2Z" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[12px] leading-[16px]">Edit</span>
        </button>
      )}
    </div>
    <div className="flex flex-col gap-[8px] p-[16px]">
      {rows.map((row, ri) => (
        <div key={ri} className="grid gap-[8px]" style={{ gridTemplateColumns: `repeat(${row.length}, 1fr)` }}>
          {row.map((cell, ci) => (
            <div key={ci} className="flex flex-col gap-[4px] px-[12px] py-[10px] rounded-[8px]"
              style={{ background: "#11141b" }}>
              <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[11px] leading-[14px]">{cell.label}</span>
              <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-white text-[14px] leading-[20px]">{cell.value}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════
   SHARED SCHEMA SECTION
═══════════════════════════════════════════════════════ */
type SchemaRow = { k: string; v: string };

const SchemaSection = ({ rows }: { rows: SchemaRow[] }) => {
  const [expanded, setExpanded] = useState(false);
  const pairs: [SchemaRow, SchemaRow | null][] = [];
  for (let i = 0; i < rows.length; i += 2) {
    pairs.push([rows[i], rows[i + 1] ?? null]);
  }
  return (
    <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10" }}>
      <div className="px-[16px] py-[12px] flex items-center justify-between"
        style={{ borderBottom: expanded ? "1px solid #1d2132" : "none" }}>
        <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#a8b9f4] text-[16px] leading-[20px]">Schema</span>
        <div className="flex items-center gap-[8px]">
          <button className="flex items-center gap-[4px] px-[12px] py-[7px] rounded-[100px] hover:opacity-80"
            style={{ background: "#222737" }}>
            <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[12px] leading-[16px]">View Raw →</span>
          </button>
          <button onClick={() => setExpanded(v => !v)}
            className="w-[28px] h-[28px] rounded-full flex items-center justify-center hover:opacity-70"
            style={{ background: "#222737" }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
              style={{ transform: expanded ? "rotate(0deg)" : "rotate(180deg)", transition: "transform 0.2s" }}>
              <path d="M2 8L6 4L10 8" stroke="#6c779d" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
      {expanded && (
        <div>
          {pairs.map(([left, right], i) => (
            <div key={i} className="grid grid-cols-4 gap-[8px] px-[16px] py-[10px]"
              style={{ background: i % 2 === 0 ? "#0a0c10" : "#06070a", borderTop: "1px solid #0d1018" }}>
              <code className="[font-family:'JetBrains_Mono',Helvetica] text-[#414965] text-[11px] truncate">{left.k}</code>
              <span className="[font-family:'JetBrains_Mono',Helvetica] text-[#6c779d] text-[11px] truncate col-span-1">{left.v}</span>
              <code className="[font-family:'JetBrains_Mono',Helvetica] text-[#414965] text-[11px] truncate">{right?.k ?? ""}</code>
              <span className="[font-family:'JetBrains_Mono',Helvetica] text-[#6c779d] text-[11px] truncate">{right?.v ?? ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   SHARED TX TABLE HEADER STYLES
═══════════════════════════════════════════════════════ */
const TxSectionTitle = ({ title }: { title: string }) => (
  <div className="px-[16px] h-[48px] flex items-center flex-shrink-0" style={{ borderBottom: "1px solid #1d2132" }}>
    <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">{title}</span>
  </div>
);

const TxHeaderCell = ({ children, right }: { children: string; right?: boolean }) => (
  <span className={`[font-family:'Plus Jakarta Sans',Helvetica] text-[#414965] text-[11px] leading-[14px] ${right ? "text-right" : ""}`}>{children}</span>
);

const TxCell = ({ children, mono, muted, right }: { children: React.ReactNode; mono?: boolean; muted?: boolean; right?: boolean }) => (
  <span className={`${mono ? "[font-family:'JetBrains_Mono',Helvetica]" : "[font-family:'Plus Jakarta Sans',Helvetica]"} text-[${muted ? "#6c779d" : "#a8b9f4"}] text-[12px] leading-[16px] ${right ? "text-right" : ""} truncate`}
    style={{ color: muted ? "#6c779d" : "#a8b9f4" }}>
    {children}
  </span>
);

const StatusBadge = ({ label, color, bg }: { label: string; color: string; bg: string }) => (
  <div className="flex items-center justify-center px-[8px] py-[3px] rounded-[22px] w-fit"
    style={{ background: bg }}>
    <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[11px] leading-[14px] whitespace-nowrap" style={{ color }}>{label}</span>
  </div>
);

const statusStyle = (s: string): { color: string; bg: string } => {
  if (s === "Executed" || s === "Verified" || s === "Filled" || s === "Ok" || s === "Allowed") return { color: "#42bf23", bg: "#123509" };
  if (s === "Escalate" || s === "Policy Escalate") return { color: "#ff9500", bg: "#4a2300" };
  if (s === "Blocked" || s === "Undeclared") return { color: "#d20344", bg: "#350011" };
  if (s === "Closed") return { color: "#6c779d", bg: "#222737" };
  return { color: "#a8b9f4", bg: "#1d2132" };
};

const RailBadge = ({ rail }: { rail: string }) => {
  const colors: Record<string, { color: string; bg: string }> = {
    x402: { color: "#ff9500", bg: "#4a2300" },
    USDC: { color: "#a8b9f4", bg: "#1d2132" },
    WireX: { color: "#9d5cf5", bg: "#240757" },
  };
  const c = colors[rail] ?? { color: "#6c779d", bg: "#222737" };
  return (
    <div className="flex items-center justify-center px-[8px] py-[3px] rounded-[22px] w-fit"
      style={{ background: c.bg }}>
      <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[11px] leading-[14px] whitespace-nowrap" style={{ color: c.color }}>{rail}</span>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   STATIC DEMO DATA
═══════════════════════════════════════════════════════ */

/* TRADING */
const CHART_DATA: Record<string, { pts: { t: string; v: number }[]; xLabels: string[]; yLabels: string[] }> = {
  "1H": {
    pts: [
      { t: "03:00", v: 5680 }, { t: "04:00", v: 5760 }, { t: "05:00", v: 5920 },
      { t: "07:00", v: 6050 }, { t: "08:00", v: 6120 }, { t: "09:00", v: 6220 },
      { t: "11:00", v: 6370 }, { t: "14:00", v: 6630 }, { t: "16:00", v: 6860 },
      { t: "18:00", v: 6960 }, { t: "19:00", v: 6600 }, { t: "21:00", v: 6390 },
      { t: "22:00", v: 6300 }, { t: "23:00", v: 6270 }, { t: "03:00", v: 6240 },
    ],
    xLabels: ["03:00", "11:00", "19:00", "03:00"],
    yLabels: ["$7000", "$6600", "$6400", "$6200", "$6000", "$5800", "$5600"],
  },
  "1D": {
    pts: [
      { t: "Mon", v: 58200 }, { t: "Tue", v: 59800 }, { t: "Wed", v: 61200 },
      { t: "Thu", v: 60400 }, { t: "Fri", v: 63000 }, { t: "Sat", v: 64200 }, { t: "Sun", v: 62400 },
    ],
    xLabels: ["Mon", "Tue", "Thu", "Sat", "Sun"],
    yLabels: ["$65k", "$64k", "$62k", "$61k", "$59k", "$58k"],
  },
  "1W": {
    pts: [
      { t: "Wk1", v: 52000 }, { t: "Wk2", v: 55000 }, { t: "Wk3", v: 57200 },
      { t: "Wk4", v: 59800 }, { t: "Wk5", v: 61400 }, { t: "Wk6", v: 63200 }, { t: "Wk7", v: 62400 },
    ],
    xLabels: ["Wk1", "Wk2", "Wk4", "Wk6", "Wk7"],
    yLabels: ["$64k", "$62k", "$59k", "$57k", "$55k", "$52k"],
  },
  "1M": {
    pts: [
      { t: "Mar 4", v: 44000 }, { t: "Mar 8", v: 47200 }, { t: "Mar 12", v: 49600 },
      { t: "Mar 16", v: 51200 }, { t: "Mar 20", v: 53400 }, { t: "Mar 24", v: 55800 },
      { t: "Mar 28", v: 58400 }, { t: "Apr 1", v: 60200 }, { t: "Apr 4", v: 62400 },
    ],
    xLabels: ["Mar 4", "Mar 12", "Mar 24", "Apr 4"],
    yLabels: ["$63k", "$60k", "$56k", "$51k", "$47k", "$44k"],
  },
  "1Y": {
    pts: [
      { t: "Apr 25", v: 18000 }, { t: "Jun 25", v: 22400 }, { t: "Aug 25", v: 29800 },
      { t: "Oct 25", v: 36200 }, { t: "Dec 25", v: 44000 }, { t: "Feb 26", v: 54800 },
      { t: "Apr 26", v: 62400 },
    ],
    xLabels: ["Apr '25", "Aug '25", "Dec '25", "Apr '26"],
    yLabels: ["$63k", "$54k", "$44k", "$30k", "$22k", "$18k"],
  },
  "ALL": {
    pts: [
      { t: "2022", v: 8000 }, { t: "Q2 22", v: 11200 }, { t: "2023", v: 18400 },
      { t: "Q2 23", v: 26800 }, { t: "2024", v: 38200 }, { t: "Q2 24", v: 48600 },
      { t: "2025", v: 52400 }, { t: "Q2 25", v: 58800 }, { t: "2026", v: 62400 },
    ],
    xLabels: ["2022", "2023", "2024", "2025", "2026"],
    yLabels: ["$63k", "$52k", "$38k", "$18k", "$11k", "$8k"],
  },
};

const OPEN_POSITIONS = [
  { market: "BTC-PERP", dir: "Long",  lev: "3.2x", value: "$8,949.00", pct: "+2.92%", pos: true  },
  { market: "ETH-PERP", dir: "Short", lev: "2.0x", value: "$7,084.00", pct: "-0.4%",  pos: false },
  { market: "SOL-PERP", dir: "Long",  lev: "2.5x", value: "$3,200.00", pct: "+1.1%",  pos: true  },
  { market: "BCH-PERP", dir: "Long",  lev: "3.2x", value: "$8,949.00", pct: "+3.11%", pos: true  },
  { market: "DAI-PERP", dir: "Short", lev: "1.4x", value: "$7,084.00", pct: "-0.4%",  pos: false },
];

const TRADING_TX = [
  { time: "2m ago",  action: "Open Long",           market: "SOL-PERP",  size: "$23,000", status: "Escalate",  policy: "v4", tx: "0x3a...c2" },
  { time: "5m ago",  action: "Close Short",          market: "BTC-USD",   size: "$832",    status: "Verified",  policy: "v4", tx: "0x3a...c2" },
  { time: "10m ago", action: "Hold Position",         market: "ETH-PERP",  size: "$23,000", status: "Verified",  policy: "v4", tx: "0x1e...ab" },
  { time: "30m ago", action: "Set Stop Loss",         market: "ADA-USD",   size: "$312",    status: "Verified",  policy: "v4", tx: "0x4c...f7" },
  { time: "1h ago",  action: "Adjust Take Profit",    market: "DOGE-PERP", size: "$23,000", status: "Verified",  policy: "v4", tx: "0x8a...31" },
];

const TRADING_SCHEMA: SchemaRow[] = [
  { k: "agent_id",                v: "0x7c8af41b" },       { k: "agent Type",              v: "trading" },
  { k: "status",                  v: "deployed" },          { k: "version",                 v: "4" },
  { k: "strategy_type",           v: "perpetual_long_short" }, { k: "capital_allocation",   v: "10000_000000" },
  { k: "max_position_size_usdc",  v: "20000_000000" },      { k: "max_daily_loss_percent",  v: "5" },
  { k: "max_position_leverage",   v: "3" },                 { k: "max_slippage_bps",        v: "30" },
  { k: "cooldown_window_seconds", v: "60" },                { k: "cumulative_exposure_limit", v: "60000_000000" },
  { k: "allowed_markets",         v: "[BTC-PERP, ETH-PERP, SOL-PERP]" }, { k: "order_types", v: "[limit, stop_limit, stop_market]" },
  { k: "policy_hash",             v: "0x9f3c8a2e1b4d7f6a5c8e2d1b9f4a7c6e3d2b1a9f8e7c6d5b4a3f2e1d0c7b6a5f" }, { k: "erc8004_registry", v: "registered" },
  { k: "last_proof_nonce",        v: "0xa48f" },            { k: "proof_expiry_seconds",    v: "600" },
  { k: "sub_account_balance",     v: "98_240_000000" },     { k: "",                        v: "" },
];

/* LENDING */
const OUTSTANDING_LOANS = [
  { addr: "0xc37...043d1", protocol: "Morpho", collateral: "ETH",  ltv: 62, amount: "$2,000.00",  pct: "+7.4%",  pos: true  },
  { addr: "0xc37...043d1", protocol: "Aave",   collateral: "wBTC", ltv: 58, amount: "$4,084.00",  pct: "-0.4%",  pos: false },
  { addr: "0xc37...043d1", protocol: "Morpho", collateral: "ETH",  ltv: 74, amount: "$3,800.00",  pct: "+6.9%",  pos: true  },
  { addr: "0xc37...043d1", protocol: "Morpho", collateral: "sETH", ltv: 55, amount: "$8,200.00",  pct: "+3.11%", pos: true  },
  { addr: "0xc37...043d1", protocol: "Aave",   collateral: "USDT", ltv: 62, amount: "$7,050.00",  pct: "-0.4%",  pos: false },
];
const LTV_DISTRIBUTION = [
  { label: "0 - 50%",   loans: 4, color: "#42bf23", pct: 90 },
  { label: "50% - 65%", loans: 7, color: "#42bf23", pct: 65 },
  { label: "65% - 75%", loans: 3, color: "#ff9500", pct: 35 },
  { label: "75%+",      loans: 0, color: "#d20344", pct: 4  },
];
const ltvColor = (ltv: number) => ltv >= 75 ? "#d20344" : ltv >= 65 ? "#ff9500" : "#42bf23";
const ltvBg   = (ltv: number) => ltv >= 75 ? "#350011" : ltv >= 65 ? "#4a2300" : "#123509";

const LENDING_TX = [
  { time: "2m ago",  event: "Originated", borrower: "0xa34...1d2", amount: "$23,000", ltv: "55%", policy: "v2", tx: "0x5a...c2" },
  { time: "5m ago",  event: "Interest",   borrower: "Morpho Pool",  amount: "$1,832",  ltv: "—",  policy: "v2", tx: "0x7f...d9" },
  { time: "10m ago", event: "LTV Warn",   borrower: "0x7ab...9d2",  amount: "$23,000", ltv: "74%", policy: "v2", tx: "" },
  { time: "30m ago", event: "Originated", borrower: "0x6ad...a04f", amount: "$312",    ltv: "35%", policy: "v2", tx: "0xe4...f7" },
  { time: "1h ago",  event: "Interest",   borrower: "Morpho Pool",  amount: "$23,000", ltv: "Closed", policy: "v2", tx: "0x85...e3" },
];

const LENDING_SCHEMA: SchemaRow[] = [
  { k: "agent_id",                  v: "0x3b1e9c42" },       { k: "agent Type",              v: "lending" },
  { k: "status",                    v: "deployed" },          { k: "version",                 v: "2" },
  { k: "capital_allocation",        v: "1000000_000000" },    { k: "max_supply_usd",          v: "1000000_000000" },
  { k: "target_ltv_percent",        v: "55" },                { k: "max_ltv_percent",         v: "65" },
  { k: "rebalance_threshold_pct",   v: "8" },                 { k: "max_liquidation_risk_pct", v: "75" },
  { k: "max_protocol_exposure_pct", v: "60" },                { k: "min_apy_target_percent",  v: "5.5" },
  { k: "protocol",                  v: "[morpho, aave_v3]" }, { k: "allowed_collateral_assets", v: "[ETH, wBTC, stETH, cbBTC]" },
  { k: "allowed_borrow_assets",     v: "[USDC, USDT]" },      { k: "policy_hash",             v: "0x9f3c8a2e1b4d7f6a5c8e2d1b9f4a7c6e3d2b1a9f8e7c6d5b4a3f2e1d0c7b6a5f" },
  { k: "erc8004_registry",          v: "registered" },        { k: "last_proof_nonce",        v: "0xa48f" },
  { k: "proof_expiry_seconds",      v: "600" },               { k: "sub_account_balance",     v: "98_240_000000" },
];

/* YIELD */
const YIELD_ALLOCATIONS = [
  { protocol: "Morpho - USDC Vault", apy: "7.8%", amount: "$496,000", pct: 40, color: "#42bf23" },
  { protocol: "Aave v3 - USDC",      apy: "7.8%", amount: "$372,000", pct: 30, color: "#ff9500" },
  { protocol: "Morpho - USDC Vault", apy: "7.8%", amount: "$248,000", pct: 20, color: "#9d5cf5" },
  { protocol: "Sky - sUSDS",         apy: "7.8%", amount: "$124,000", pct: 10, color: "#a8b9f4" },
];
const YIELD_TX = [
  { time: "2m ago",  event: "Harvest",      protocol: "Morpho - USDC vault", amount: "$23,000", apy: "55%", policy: "v3", tx: "0x3a...c2" },
  { time: "5m ago",  event: "APY Drift",    protocol: "Pendle - sUSDe PT",   amount: "$1,832",  apy: "v3",  policy: "v3", tx: "0x7f...d9" },
  { time: "10m ago", event: "Rebalance In", protocol: "Morpho - USDC vault", amount: "$23,000", apy: "74%", policy: "v4", tx: "0xc4...f7" },
  { time: "30m ago", event: "Rebalance Out",protocol: "Sky - sUSDS",         amount: "$312",    apy: "35%", policy: "v3", tx: "0x3a...c2" },
  { time: "1h ago",  event: "APY Drift",    protocol: "Pendle - sUSDe PT",   amount: "$23,000", apy: "v3",  policy: "v3", tx: "0x85...03" },
];
const YIELD_SCHEMA: SchemaRow[] = [
  { k: "agent_id",                    v: "0x3b1e9c42" },        { k: "agent Type",                   v: "yield" },
  { k: "status",                      v: "deployed" },           { k: "version",                      v: "2" },
  { k: "strategy_type",               v: "stable_farming" },     { k: "capital_allocation",            v: "1000000_000000" },
  { k: "min_apy_percent",             v: "5.5" },                { k: "target_apy_percent",            v: "8.0" },
  { k: "exit_if_apy_below_pct",       v: "60" },                 { k: "max_slippage_bps",             v: "25" },
  { k: "il_tolerance_percent",        v: "2" },                  { k: "max_stable_concentration",     v: "40" },
  { k: "rebalance_frequency_hours",   v: "24" },                 { k: "max_position_size_usdc",       v: "500000_000000" },
  { k: "protocol_allowlist",          v: "[morpho, aave_v3, pendle, sky]" }, { k: "policy_hash",      v: "0x4d8a7c2e1b9f6a3d8c5e2b1f7a4c9e6d3b2a1f8e7c6d5b4a3f2e1d8c7b6a5b3e1" },
  { k: "erc8004_registry",            v: "registered" },         { k: "last_proof_nonce",             v: "0xa48f" },
  { k: "proof_expiry_seconds",        v: "600" },                { k: "sub_account_balance",          v: "98_240_000000" },
];

/* PAYMENTS */
const ALLOWLISTED_RECIPIENTS = [
  { name: "Anthropic API call",   sub: "x402 host",        rail: "x402", cap: "$58",    recur: "per call",  d30: "$24,100" },
  { name: "Linear monthly",       sub: "0x8c2a...3f10",    rail: "USDC", cap: "$200",   recur: "—",         d30: "$18,400" },
  { name: "0x4e2a...8c91",        sub: "x402 host",        rail: "x402", cap: "$50",    recur: "per call",  d30: "$14,200" },
  { name: "DMCC Office Rent",     sub: "WireX Beneficiary",rail: "WireX",cap: "$3,000", recur: "monthly",   d30: "$2,840"  },
  { name: "Maya Ruben",           sub: "0x9a3f...j81k",    rail: "USDC", cap: "$5,000", recur: "monthly",   d30: "$3,400"  },
];
const PAYMENTS_TX = [
  { time: "2m ago",  rail: "x402", recipient: "Anthropic API call", amount: "$12.40",  status: "Verified",  policy: "v3", tx: "0x3a...c2" },
  { time: "5m ago",  rail: "USDC", recipient: "Linear monthly",     amount: "$96.00",  status: "Verified",  policy: "v3", tx: "0x7f...d9" },
  { time: "10m ago", rail: "WireX",recipient: "0x4e2a...8c91",      amount: "$2840",   status: "Verified",  policy: "v3", tx: "" },
  { time: "30m ago", rail: "USDC", recipient: "DMCC Office Rent",   amount: "$4,200",  status: "Escalate",  policy: "v3", tx: "" },
  { time: "1h ago",  rail: "USDC", recipient: "Maya Ruben",         amount: "$3,400",  status: "Verified",  policy: "v3", tx: "0x85...03" },
];
const PAYMENTS_SCHEMA: SchemaRow[] = [
  { k: "agent_id",                       v: "0x3b1e9c42" },         { k: "agent Type",                      v: "payments" },
  { k: "status",                         v: "deployed" },            { k: "version",                         v: "5" },
  { k: "payment_type",                   v: "recurring_bills" },     { k: "capital_allocation",              v: "1000000_000000" },
  { k: "per_transaction_limit_usdc",     v: "10000_000000" },        { k: "daily_spend_budget_usdc",         v: "25000_000000" },
  { k: "daily_transaction_count_limit",  v: "200" },                 { k: "require_approval_above_usdc",     v: "10000_000000" },
  { k: "execution_window",               v: "24_7" },                { k: "accept_x402_payments",            v: "true" },
  { k: "x402_max_per_request_usdc",      v: "50_000000" },           { k: "velocity_per_counterparty",       v: "500000_000000" },
  { k: "x402_allowlist",                 v: "[anthropic, aws_bedrock, openai, +9]" }, { k: "allowlisted_recipients", v: "[8 entries · linked]" },
  { k: "deny_list",                      v: "[2 sanctioned addresses]" }, { k: "policy_hash",               v: "0x4d8a7c2e1b9f6a3d8c5e2b1f7a4c9e6d3b2a1f8e7c6d5b4a3f2e1d8c7b6a5b3e1" },
  { k: "erc8004_registry",               v: "registered" },          { k: "last_proof_nonce",                v: "0xa48f" },
];

/* ANALYTICS */
const ALERT_RULES = [
  { rule: "Trader Drawdown",  condition: "PnL_24h < -10% · Trader-Alpha",           action: "Pause Agent",  routing: "Slack + SMS" },
  { rule: "LTV Warning",      condition: "any_loan_LTV > 70% · Lending-Core",         action: "Notify Only",  routing: "Slack"       },
  { rule: "Yield Drift",      condition: "APY Drop > 25% · Yield-Harvester",          action: "Notify Only",  routing: "Dashboard"   },
  { rule: "Vendor Anomaly",   condition: "vendor_spend > 3x avg · Payments-Hub",      action: "Pause Agent",  routing: "Slack + SMS" },
  { rule: "Stable Depeg",     condition: "any_stable < 0.995 · 5 min sustained",      action: "Notify Only",  routing: "SMS"         },
];
const ANALYTICS_TX = [
  { time: "2m ago",  event: "Signal raised", detail: "Morpho USDC inflows up 40% · 24h", conf: "88%", routed: "dashboard", pol: "v3" },
  { time: "5m ago",  event: "Daily report",  detail: "Portfolio summary · 5 agents",      conf: "—",   routed: "dashboard", pol: "v3" },
  { time: "10m ago", event: "Auto-action",   detail: "Paused Payments-Hub · Vendor anomaly", conf: "94%", routed: "SMS + Slack", pol: "v3" },
  { time: "30m ago", event: "Critical signal", detail: "AWS billing up 280% vs monthly avg", conf: "92%", routed: "SMS",      pol: "v3" },
  { time: "1h ago",  event: "Query",         detail: "Defilama TVL Snapshot",              conf: "—",   routed: "Internal",  pol: "v3" },
];
const ANALYTICS_SCHEMA: SchemaRow[] = [
  { k: "agent_id",              v: "0x3b1e9c42" },          { k: "agent Type",            v: "analytics" },
  { k: "status",                v: "deployed" },             { k: "version",               v: "5" },
  { k: "tracked_agents",        v: "all" },                  { k: "tracked_positions",     v: "all_open" },
  { k: "report_frequency",      v: "daily_0900_gst" },       { k: "include_recommendations", v: "true" },
  { k: "allow_auto_execute",    v: "true" },                 { k: "execution_limit_usdc",  v: "5000_000000" },
  { k: "max_alerts_per_day",    v: "10" },                   { k: "compute_budget_usdc",   v: "250_000000" },
  { k: "execution_whitelist",   v: "[pause_agent]" },        { k: "report_metrics",        v: "[pnl, risk, ltv, apy, vendor_spend, peg]" },
  { k: "alert_rules",           v: "[5 rules · linked]" },  { k: "policy_hash",           v: "0x4d8a7c2e1b9f6a3d8c5e2b1f7a4c9e6d3b2a1f8e7c6d5b4a3f2e1d8c7b6a5b3e1" },
  { k: "erc8004_registry",      v: "registered" },           { k: "last_proof_nonce",      v: "0xa48f" },
  { k: "proof_expiry_seconds",  v: "600" },                  { k: "sub_account_balance",   v: "98_240_000000" },
];

/* CUSTOM */
const CUSTOM_TOOLS = [
  { name: "Read Balance",       allowed: true  },
  { name: "Read Orderbook",     allowed: true  },
  { name: "Read Orderbook",     allowed: true  },
  { name: "Cancel Order",       allowed: true  },
  { name: "Place Market Order", allowed: false },
  { name: "Open Perp",          allowed: false },
  { name: "Transfer",           allowed: false },
  { name: "Withdraw",           allowed: false },
  { name: "Contract Call",      allowed: false },
];
const CUSTOM_TX = [
  { time: "2m ago",  tool: "Place Limit Order",  args: "BTC · Buy · $42 · 63,840", check: "Allowed",   result: "Filled",    pol: "v1", tx: "0x3a...c2" },
  { time: "5m ago",  tool: "Cancel Order",        args: "ETH · ID: 8c4d",          check: "Allowed",   result: "Executed",  pol: "v1", tx: "0x7f...d9" },
  { time: "10m ago", tool: "Read Orderbook",       args: "BTC · Depth: 20",         check: "Allowed",   result: "Ok",        pol: "v1", tx: "—" },
  { time: "30m ago", tool: "Place Market Order",   args: "BTC · Buy · Attempted",   check: "Blocked",   result: "Undeclared",pol: "v1", tx: "—" },
  { time: "1h ago",  tool: "Read Balance",         args: "USDC · $5,990",           check: "Allowed",   result: "Ok",        pol: "v1", tx: "0x85...03" },
];
const CUSTOM_SCHEMA: SchemaRow[] = [
  { k: "agent_id",              v: "0x3b1e9c42" },         { k: "agent Type",              v: "custom" },
  { k: "status",                v: "draft" },               { k: "version",                 v: "1" },
  { k: "complexity_level",      v: "medium" },              { k: "capital_allocation",      v: "5000_000000" },
  { k: "primary_limit_usdc",    v: "500_000000" },          { k: "secondary_limit_usdc",    v: "25000_000000" },
  { k: "max_operations_per_hour", v: "1200" },              { k: "execution_window",        v: "24_7" },
  { k: "circuit_breaker_loss_pct", v: "8" },               { k: "sandbox_days_required",   v: "14" },
  { k: "allowed_tools",         v: "[read_balance, read_orderbook, place_limit_order, cancel_order]" }, { k: "forbidden_tools", v: "[place_market_order, open_perp, transfer, withdraw, contract_call]" },
  { k: "allowed_counterparties", v: "[hyperliquid_spot]" }, { k: "objective",               v: "\"Provide two-sided liquidity on...\"" },
  { k: "policy_hash",           v: "8x1f7d3a8c2e5b9f4a7e1e7b3d8f2a5c8e6v7d1f6a2c8e2b5d8f4a6c1e9b5d3a92" }, { k: "erc8004_registry", v: "registered" },
  { k: "last_proof_nonce",      v: "0xa48f" },              { k: "proof_expiry_seconds",    v: "600" },
];

/* ═══════════════════════════════════════════════════════
   DYNAMIC SCHEMA BUILDER
═══════════════════════════════════════════════════════ */
function buildDynamicSchema(agentId: string, agentType: string, policy: any): SchemaRow[] {
  const p = policy ?? {};
  const tc = p.typeConfig ?? {};
  const cap = p.uiCapitalAmount ? `${Number(p.uiCapitalAmount) * 1_000_000}_000000` : "0";
  const shortId = agentId?.startsWith("0x") ? agentId.slice(2, 10) : agentId?.slice(0, 8) ?? "00000000";
  const pHash = p.policyHash ?? tc.policyHash ?? "—";

  const base: SchemaRow[] = [
    { k: "agent_id",          v: `0x${shortId}` },  { k: "agent_type",            v: agentType.toLowerCase() },
    { k: "status",            v: "deployed" },       { k: "version",               v: "4" },
    { k: "capital_allocation",v: cap },              { k: "policy_hash",            v: pHash ? `${String(pHash).slice(0, 10)}...` : "—" },
    { k: "erc8004_registry",  v: "registered" },     { k: "last_proof_nonce",       v: "0xa48f" },
    { k: "proof_expiry_seconds", v: "600" },         { k: "sub_account_balance",    v: cap },
  ];

  const typeRows: SchemaRow[] = Object.entries(tc)
    .filter(([k]) => !["policyHash"].includes(k))
    .slice(0, 12)
    .map(([k, v]) => ({
      k: k.replace(/([A-Z])/g, "_$1").toLowerCase(),
      v: Array.isArray(v) ? `[${(v as unknown[]).join(", ")}]` : String(v ?? ""),
    }));

  const all = [...base, ...typeRows];
  if (all.length % 2 !== 0) all.push({ k: "", v: "" });
  return all;
}

/* ═══════════════════════════════════════════════════════
   TRADING EQUITY CURVE CROSSHAIR
═══════════════════════════════════════════════════════ */
/* Renders crosshair + dot + price pill using the chart's own y-axis scale for pixel-perfect accuracy */
const TradingCrosshair = (chartProps: any) => {
  const { activeCoordinate, activePayload, yAxisMap, width, height, margin } = chartProps;
  if (!activeCoordinate || !activePayload?.length) return null;
  const x = activeCoordinate.x;
  const dataValue = activePayload[0]?.value ?? 0;
  const yAxis = Object.values(yAxisMap ?? {})[0] as any;
  const y = typeof yAxis?.scale === "function" ? yAxis.scale(dataValue) : activeCoordinate.y;
  const mT = margin?.top ?? 0; const mL = margin?.left ?? 0;
  const mB = margin?.bottom ?? 0; const mR = margin?.right ?? 0;
  const formatted = `$${Number(dataValue).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const charW = 6.2; const padX = 8; const pillH = 18; const pillRx = 9;
  const pillW = formatted.length * charW + padX * 2;
  let pillX = x + 6; if (pillX + pillW > width - mR - 4) pillX = x - pillW - 6;
  const pillY = y - pillH / 2;
  return (
    <g>
      <line x1={x} y1={mT} x2={x} y2={height - mB} stroke="#ff9500" strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.55} />
      <line x1={mL} y1={y} x2={width - mR} y2={y} stroke="#ff9500" strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.55} />
      <circle cx={x} cy={y} r={3} fill="#42bf23" stroke="#0a0c10" strokeWidth={2} />
      <rect x={pillX} y={pillY} width={pillW} height={pillH} rx={pillRx} fill="#4a2300" />
      <text x={pillX + pillW / 2} y={pillY + pillH / 2 + 3.5} textAnchor="middle" fill="#ff9500" fontSize={10} fontFamily="'Plus Jakarta Sans', Helvetica" fontWeight="600">{formatted}</text>
    </g>
  );
};

const TIME_TABS = ["1H", "1D", "1W", "1M", "1Y", "ALL"];

/* ═══════════════════════════════════════════════════════
   TRADING AGENT VIEW  (Figma 3380-32372)
═══════════════════════════════════════════════════════ */
const TradingAgentView = ({ agent, rawPolicy, isActive, onToggle, onEdit, onBack, onDelete, agentName }: {
  agent: AgentData; rawPolicy: any; isActive: boolean; onToggle: () => void; onEdit: () => void; onBack: () => void; onDelete: () => void; agentName: string;
}) => {
  const [chartTab, setChartTab] = useState("1H");
  const p = rawPolicy ?? {};
  const chartSet = CHART_DATA[chartTab] ?? CHART_DATA["1H"];

  const capitalAmt = p.uiCapitalAmount ? `$${Number(p.uiCapitalAmount).toLocaleString()}` : "$100,000";
  const dailyLossCap = p.typeConfig?.max_daily_loss_percent ? `-${p.typeConfig.max_daily_loss_percent}%` : "-5%";
  const maxPositionSize = p.typeConfig?.max_position_size_usdc ? `$${Number(p.typeConfig.max_position_size_usdc).toLocaleString()}` : "$20,000";
  const maxLeverage = p.typeConfig?.max_position_leverage ? `${p.typeConfig.max_position_leverage}x` : "3x";
  const allowedMkts = (p.typeConfig?.allowed_markets?.length ? p.typeConfig.allowed_markets : p.uiAllowedAssets?.length ? p.uiAllowedAssets : ["BTC", "ETH", "SOL"]).join(" · ");
  const killSwitch = p.typeConfig?.kill_switch_drawdown ? `-${p.typeConfig.kill_switch_drawdown}% equity` : p.maxDrawdown ? `-${p.maxDrawdown}% equity` : "-15% equity";
  const cumulativeExposure = p.typeConfig?.cumulative_exposure_limit ? `$${Number(p.typeConfig.cumulative_exposure_limit).toLocaleString()}` : "$60,000";
  const cooldown = p.typeConfig?.cooldown_window_seconds ? `${p.typeConfig.cooldown_window_seconds}s` : "60 sec";
  const orderTypes = Array.isArray(p.typeConfig?.order_types) ? p.typeConfig.order_types.join(" · ") : "Limit · Stop";
  const maxSlippage = p.typeConfig?.max_slippage_bps ? `${p.typeConfig.max_slippage_bps} bps` : "30 bps";
  const strategyLabel = p.typeConfig?.strategy_type ? p.typeConfig.strategy_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : "Perpetual long/short";

  const policyRows: PolicyCell[][] = [
    [{ label: "Strategy", value: strategyLabel }, { label: "Max Daily Loss", value: dailyLossCap }, { label: "Max Position Size", value: maxPositionSize }],
    [{ label: "Max Leverage", value: maxLeverage }, { label: "Allowed Markets", value: allowedMkts }, { label: "Order Types", value: orderTypes }],
    [{ label: "Max Slippage", value: maxSlippage }, { label: "Cooldown", value: cooldown }, { label: "Approval Threshold", value: "> 90% of cap" }],
    [{ label: "Kill Switch Drawdown", value: killSwitch }, { label: "Cumulative Exposure", value: cumulativeExposure }, { label: "Capital Allocated", value: capitalAmt }],
  ];

  return (
    <div className="flex flex-col h-full bg-[#11141b] rounded-[16px] border border-solid border-[#1d2132] overflow-hidden">
      <AgentTopBar onBack={onBack} onEdit={onEdit} isActive={isActive} onToggle={onToggle} onDelete={onDelete} agentName={agentName} />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[16px] p-[16px] pb-8">

          {/* Header */}
          <AgentHeaderCard agent={agent} agentType="Trading" agentId={agent.id} />

          {/* Stats */}
          <div className="flex gap-[16px]">
            <StatCard label="Capital Allocated" value={capitalAmt} />
            <StatCard label="PnL (30d)"    value="+$47,832" sup=".10" color="#42bf23" />
            <StatCard label="Win Rate"     value="62"       sup="%"   />
            <StatCard label="Exchanges (30d)" value="184" />
            <StatCard label="Sharpe"       value="1.8" />
          </div>

          <ReputationBanner agentId={agent.id} />

          {/* Equity Curve + Open Positions */}
          <div className="grid grid-cols-2 gap-[16px]">
            {/* Equity Curve */}
            <div className="rounded-[16px] overflow-hidden flex flex-col" style={{ background: "#0a0c10" }}>
              <div className="flex items-center justify-between px-[16px] py-[12px] h-[48px] flex-shrink-0" style={{ borderBottom: "1px solid #1d2132" }}>
                <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">Equity Curve</span>
                <div className="flex gap-[2px] p-[2px] rounded-[400px]" style={{ background: "#06070a" }}>
                  {TIME_TABS.map((tab) => (
                    <button key={tab} onClick={() => setChartTab(tab)}
                      className="px-[8px] py-[4px] text-[12px] [font-family:'Plus Jakarta Sans',Helvetica] transition-all rounded-[100px] leading-[16px]"
                      style={{ background: chartTab === tab ? "#4a2300" : "transparent", color: chartTab === tab ? "#ff9500" : "#414965" }}>
                      {tab}
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative flex-1" style={{ minHeight: "284px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartSet.pts} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#42bf23" stopOpacity={0.32} />
                        <stop offset="100%" stopColor="#42bf23" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Tooltip content={() => null} cursor={false} isAnimationActive={false} />
                    <Area type="monotone" dataKey="v" stroke="#42bf23" strokeWidth={1.5}
                      fill="url(#greenGrad)" dot={false} isAnimationActive={false} activeDot={false} />
                    <Customized component={TradingCrosshair} />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="absolute right-[8px] top-0 bottom-0 flex flex-col justify-between pointer-events-none" style={{ paddingTop: "8px", paddingBottom: "4px" }}>
                  {chartSet.yLabels.map((lbl) => (
                    <span key={lbl} className="[font-family:'Plus Jakarta Sans',Helvetica] text-[10px] leading-[14px] text-right" style={{ color: "#6c779d" }}>{lbl}</span>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between px-[8px] py-[4px]" style={{ borderTop: "1px solid #1d2132" }}>
                {chartSet.xLabels.map((lbl, i) => (
                  <span key={i} className="[font-family:'Plus Jakarta Sans',Helvetica] text-[10px] leading-[14px]" style={{ color: "#6c779d" }}>{lbl}</span>
                ))}
              </div>
            </div>

            {/* Open Positions */}
            <div className="rounded-[16px] overflow-hidden flex flex-col" style={{ background: "#0a0c10" }}>
              <div className="px-[16px] py-[12px] h-[48px] flex items-center" style={{ borderBottom: "1px solid #1d2132" }}>
                <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">Open Positions</span>
              </div>
              <div className="flex flex-col gap-[12px] px-[16px] py-[12px]">
                {OPEN_POSITIONS.map((pos, i) => (
                  <div key={i}>
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col gap-[4px]">
                        <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#a8b9f4] text-[14px] leading-[20px]">{pos.market}</span>
                        <div className="flex items-center gap-[4px]">
                          <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[13px] leading-[16px]">{pos.dir}</span>
                          <Dot />
                          <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[13px] leading-[16px]">{pos.lev}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-[2px]">
                        <span className="[font-family:'JetBrains_Mono',Helvetica] text-[#a8b9f4] text-[14px] leading-[20px]">{pos.value}</span>
                        <StatusBadge label={pos.pct} color={pos.pos ? "#42bf23" : "#d20344"} bg={pos.pos ? "#123509" : "#350011"} />
                      </div>
                    </div>
                    {i < OPEN_POSITIONS.length - 1 && <div className="h-px w-full mt-[12px]" style={{ background: "#1d2132" }} />}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Policies */}
          <PolicyGrid rows={policyRows} onEdit={onEdit} />

          {/* Schema */}
          <SchemaSection rows={buildDynamicSchema(agent.id, "trading", rawPolicy)} />

          {/* Transaction History */}
          <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10" }}>
            <TxSectionTitle title="Transaction History" />
            <div className="px-[16px]">
              <div className="grid gap-[8px] py-[10px]"
                style={{ gridTemplateColumns: "80px 1fr 90px 80px 90px 40px 80px", borderBottom: "1px solid #1d2132" }}>
                {["Time", "Action", "Market", "Size", "Status", "Policy", "TX"].map(h => <TxHeaderCell key={h}>{h}</TxHeaderCell>)}
              </div>
              {TRADING_TX.map((tx, i) => {
                const s = statusStyle(tx.status);
                return (
                  <div key={i} className="grid gap-[8px] py-[10px]" style={{ gridTemplateColumns: "80px 1fr 90px 80px 90px 40px 80px", borderTop: "1px solid #0d1018" }}>
                    <TxCell muted>{tx.time}</TxCell>
                    <TxCell>{tx.action}</TxCell>
                    <TxCell muted>{tx.market}</TxCell>
                    <TxCell mono>{tx.size}</TxCell>
                    <div><StatusBadge label={tx.status} color={s.color} bg={s.bg} /></div>
                    <TxCell muted>{tx.policy}</TxCell>
                    <TxCell muted mono>{tx.tx}</TxCell>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </ScrollArea>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   LENDING AGENT VIEW  (Figma 3390-32625)
═══════════════════════════════════════════════════════ */
const LendingAgentView = ({ agent, rawPolicy, isActive, onToggle, onEdit, onBack, onDelete, agentName }: {
  agent: AgentData; rawPolicy: any; isActive: boolean; onToggle: () => void; onEdit: () => void; onBack: () => void; onDelete: () => void; agentName: string;
}) => {
  const p = rawPolicy ?? {};
  const capitalAmt = p.uiCapitalAmount ? `$${Number(p.uiCapitalAmount).toLocaleString()}` : "$100,000";
  const protocolRaw = p.typeConfig?.protocol ?? p.typeConfig?.protocols;
  const protocols = Array.isArray(protocolRaw) ? protocolRaw.join(" · ") : (protocolRaw ? String(protocolRaw).replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : "Morpho · Aave v3");
  const maxSupply = p.typeConfig?.max_supply_usd ? `$${Number(p.typeConfig.max_supply_usd).toLocaleString()}` : "$1,000,000";
  const collateral = (p.typeConfig?.allowed_collateral_assets?.length ? p.typeConfig.allowed_collateral_assets : p.uiAllowedAssets?.length ? p.uiAllowedAssets : ["ETH", "wBTC", "stETH", "cbBTC"]).join(" · ");
  const borrowAssets = (p.typeConfig?.allowed_borrow_assets?.length ? p.typeConfig.allowed_borrow_assets : ["USDC", "DAI"]).join(" · ");
  const targetLTV = p.typeConfig?.target_ltv_percent ? `${p.typeConfig.target_ltv_percent}%` : "55%";
  const maxLTVOrig = p.typeConfig?.max_ltv_percent ? `${p.typeConfig.max_ltv_percent}%` : "65%";
  const rebalThreshold = p.typeConfig?.rebalance_threshold_percent ? `${p.typeConfig.rebalance_threshold_percent}% from target` : "8% from target";
  const maxProtocol = (p.typeConfig?.max_protocol_exposure_percent ?? p.typeConfig?.max_protocol_exposure_pct) ? `${p.typeConfig.max_protocol_exposure_percent ?? p.typeConfig.max_protocol_exposure_pct}%` : "60%";
  const liqCeiling = (p.typeConfig?.max_liquidation_risk_percent ?? p.typeConfig?.max_liquidation_risk_pct) ? `${p.typeConfig.max_liquidation_risk_percent ?? p.typeConfig.max_liquidation_risk_pct}% LTV` : "75% LTV";
  const minAPY = p.typeConfig?.min_apy_target_percent ? `${p.typeConfig.min_apy_target_percent}%` : "5.5%";

  const policyRows: PolicyCell[][] = [
    [{ label: "Protocols", value: protocols }, { label: "Max Supply", value: maxSupply }, { label: "Collateral Assets", value: collateral }],
    [{ label: "Borrow Assets", value: borrowAssets }, { label: "Min APY Target", value: minAPY }, { label: "Target LTV", value: targetLTV }],
    [{ label: "Max LTV at Origination", value: maxLTVOrig }, { label: "Rebalance Threshold", value: rebalThreshold }, { label: "Max Protocol Exposure", value: maxProtocol }],
    [{ label: "Liquidation Risk Ceiling", value: liqCeiling }, { label: "Book LTV Breaker", value: "> 70% halt" }, { label: "Default Rate Breaker", value: "> 1.5% · 90d" }],
  ];

  return (
    <div className="flex flex-col h-full bg-[#11141b] rounded-[16px] border border-solid border-[#1d2132] overflow-hidden">
      <AgentTopBar onBack={onBack} onEdit={onEdit} isActive={isActive} onToggle={onToggle} onDelete={onDelete} agentName={agentName} />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[16px] p-[16px] pb-8">

          <AgentHeaderCard agent={agent} agentType="Lending" agentId={agent.id} />

          <div className="flex gap-[16px]">
            <StatCard label="Capital Allocated" value={capitalAmt} />
            <StatCard label="Total Supplied" value="$842,100" sup=".82" />
            <StatCard label="Avg APY"        value="7.2"    sup="%"  color="#42bf23" />
            <StatCard label="Active Loans"   value="14" />
            <StatCard label="Defaults · 90d" value="0" />
          </div>

          <ReputationBanner agentId={agent.id} />

          {/* Outstanding Loans + LTV Distribution */}
          <div className="grid grid-cols-2 gap-[16px]">
            <div className="rounded-[16px] overflow-hidden flex flex-col" style={{ background: "#0a0c10" }}>
              <div className="px-[16px] h-[48px] flex items-center" style={{ borderBottom: "1px solid #1d2132" }}>
                <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">Outstanding Loans</span>
              </div>
              <div className="flex flex-col px-[16px] py-[12px] gap-[12px]">
                {OUTSTANDING_LOANS.map((loan, i) => (
                  <div key={i} className="flex items-center gap-[8px]">
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#a8b9f4] text-[13px] leading-[18px]">{loan.addr}</span>
                      <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[12px] leading-[16px]">{loan.protocol} · {loan.collateral}</span>
                    </div>
                    <div className="flex items-center justify-center px-[8px] py-[3px] rounded-[22px] flex-shrink-0" style={{ background: ltvBg(loan.ltv) }}>
                      <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[11px] leading-[14px]" style={{ color: ltvColor(loan.ltv) }}>LTV {loan.ltv}%</span>
                    </div>
                    <div className="flex flex-col items-end flex-shrink-0">
                      <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#a8b9f4] text-[13px] leading-[18px]">{loan.amount}</span>
                      <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[12px] leading-[16px]" style={{ color: loan.pos ? "#42bf23" : "#d20344" }}>{loan.pct}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[16px] overflow-hidden flex flex-col" style={{ background: "#0a0c10" }}>
              <div className="px-[16px] h-[48px] flex items-center" style={{ borderBottom: "1px solid #1d2132" }}>
                <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">LTV Distribution</span>
              </div>
              <div className="flex flex-col px-[16px] py-[12px] gap-[16px]">
                {LTV_DISTRIBUTION.map((band) => (
                  <div key={band.label} className="flex flex-col gap-[6px]">
                    <div className="flex items-center justify-between">
                      <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[13px] leading-[16px]">{band.label}</span>
                      <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#a8b9f4] text-[13px] leading-[16px]">{band.loans} Loans</span>
                    </div>
                    <div className="h-[6px] rounded-full w-full" style={{ background: "#1d2132" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${band.pct}%`, background: band.color }} />
                    </div>
                  </div>
                ))}
                <p className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#414965] text-[12px] leading-[16px]">
                  Nearest to threshold: 74% (0xc37...043d1)
                </p>
              </div>
            </div>
          </div>

          <PolicyGrid rows={policyRows} onEdit={onEdit} />
          <SchemaSection rows={buildDynamicSchema(agent.id, "lending", rawPolicy)} />

          {/* Transaction History */}
          <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10" }}>
            <TxSectionTitle title="Transaction History" />
            <div className="px-[16px]">
              <div className="grid gap-[8px] py-[10px]"
                style={{ gridTemplateColumns: "80px 100px 110px 80px 70px 50px 80px", borderBottom: "1px solid #1d2132" }}>
                {["Time", "Event", "Borrower", "Amount", "LTV", "Policy", "TX"].map(h => <TxHeaderCell key={h}>{h}</TxHeaderCell>)}
              </div>
              {LENDING_TX.map((tx, i) => {
                const ltvS = statusStyle(tx.ltv === "Closed" ? "Closed" : "");
                return (
                  <div key={i} className="grid gap-[8px] py-[10px]" style={{ gridTemplateColumns: "80px 100px 110px 80px 70px 50px 80px", borderTop: "1px solid #0d1018" }}>
                    <TxCell muted>{tx.time}</TxCell>
                    <TxCell>{tx.event}</TxCell>
                    <TxCell muted mono>{tx.borrower}</TxCell>
                    <TxCell mono>{tx.amount}</TxCell>
                    <div>{tx.ltv === "Closed"
                      ? <StatusBadge label="Closed" color={ltvS.color} bg={ltvS.bg} />
                      : <TxCell muted>{tx.ltv}</TxCell>}</div>
                    <TxCell muted>{tx.policy}</TxCell>
                    <TxCell muted mono>{tx.tx || "—"}</TxCell>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </ScrollArea>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   YIELD AGENT VIEW  (Figma 3393-33496)
═══════════════════════════════════════════════════════ */
const YieldAgentView = ({ agent, rawPolicy, isActive, onToggle, onEdit, onBack, onDelete, agentName }: {
  agent: AgentData; rawPolicy: any; isActive: boolean; onToggle: () => void; onEdit: () => void; onBack: () => void; onDelete: () => void; agentName: string;
}) => {
  const p = rawPolicy ?? {};
  const capitalAmt = p.uiCapitalAmount ? `$${Number(p.uiCapitalAmount).toLocaleString()}` : "$1,224,000";
  const targetAPY = p.typeConfig?.target_apy_percent ?? 8;
  const minAPY = p.typeConfig?.min_apy_percent ?? 5.5;
  const maxPosition = p.typeConfig?.max_position_size_usdc ? `$${Number(p.typeConfig.max_position_size_usdc).toLocaleString()}` : "$500,000";
  const rebalanceFreq = p.typeConfig?.rebalance_frequency_hours ? `${p.typeConfig.rebalance_frequency_hours}h Cooldown` : "24h Cooldown";
  const slippage = p.typeConfig?.max_slippage_bps ?? 25;
  const maxStable = p.typeConfig?.max_stable_pair_concentration ?? 40;
  const ilTol = p.typeConfig?.impermanent_loss_tolerance_percent ?? 2;
  const exitBelow = p.typeConfig?.exit_if_apy_below_percent ? `${p.typeConfig.exit_if_apy_below_percent}% of entry` : "60% of entry";
  const protocols = Array.isArray(p.typeConfig?.protocol_allowlist)
    ? p.typeConfig.protocol_allowlist.join(", ")
    : (p.typeConfig?.protocol_allowlist ?? "morpho, aave_v3, pendle, sky");

  const strategyTypeLabel = p.typeConfig?.strategy_type ? p.typeConfig.strategy_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : "Stable farming";
  const policyRows: PolicyCell[][] = [
    [{ label: "Strategy", value: strategyTypeLabel }, { label: "Target APY", value: `${targetAPY}%` }, { label: "Min APY Floor", value: `${minAPY}%` }],
    [{ label: "Exit if APY Drops Below", value: exitBelow }, { label: "Max Position Size", value: maxPosition }, { label: "Max Per Protocol", value: `${maxStable}%` }],
    [{ label: "Max Slippage", value: `${slippage} bps` }, { label: "IL Tolerance", value: `${ilTol}%` }, { label: "Rebalance Frequency", value: rebalanceFreq }],
    [{ label: "Protocol Allowlist", value: String(protocols) }, { label: "TVL Drain Breaker", value: "- 30% · 24hr" }, { label: "Stable Peg Breaker", value: "< 0.995 · Exit" }],
  ];

  return (
    <div className="flex flex-col h-full bg-[#11141b] rounded-[16px] border border-solid border-[#1d2132] overflow-hidden">
      <AgentTopBar onBack={onBack} onEdit={onEdit} isActive={isActive} onToggle={onToggle} onDelete={onDelete} agentName={agentName} />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[16px] p-[16px] pb-8">

          <AgentHeaderCard agent={agent} agentType="Yield" agentId={agent.id} />

          <div className="flex gap-[16px]">
            <StatCard label="Capital Allocated" value={capitalAmt} />
            <StatCard label="TVL Deployed"    value="$1,000" sup=".12" />
            <StatCard label="Blended APY"     value="8.4"    sup="%"  color="#42bf23" />
            <StatCard label="Yield · 30d"     value="+$8,642" color="#42bf23" />
            <StatCard label="Rebalances · 30d" value="6" />
          </div>

          <ReputationBanner agentId={agent.id} />

          {/* Current Allocations */}
          <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10" }}>
            <div className="px-[16px] h-[48px] flex items-center" style={{ borderBottom: "1px solid #1d2132" }}>
              <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">Current Allocations</span>
            </div>
            <div className="flex flex-col px-[16px] py-[12px] gap-[16px]">
              {YIELD_ALLOCATIONS.map((alloc, i) => (
                <div key={i} className="flex flex-col gap-[6px]">
                  <div className="flex items-center justify-between">
                    <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#a8b9f4] text-[14px] leading-[20px]">{alloc.protocol}</span>
                    <div className="flex items-center gap-[16px]">
                      <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[13px] leading-[16px]">APY {alloc.apy}</span>
                      <span className="[font-family:'JetBrains_Mono',Helvetica] text-[#a8b9f4] text-[13px] leading-[16px]">{alloc.amount}</span>
                      <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[13px] leading-[16px] w-[32px] text-right">{alloc.pct}%</span>
                    </div>
                  </div>
                  <div className="h-[6px] rounded-full w-full" style={{ background: "#1d2132" }}>
                    <div className="h-full rounded-full" style={{ width: `${alloc.pct}%`, background: alloc.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <PolicyGrid rows={policyRows} onEdit={onEdit} />
          <SchemaSection rows={buildDynamicSchema(agent.id, "yield", rawPolicy)} />

          {/* Transaction History */}
          <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10" }}>
            <TxSectionTitle title="Transaction History" />
            <div className="px-[16px]">
              <div className="grid gap-[8px] py-[10px]"
                style={{ gridTemplateColumns: "80px 110px 1fr 80px 60px 50px 80px", borderBottom: "1px solid #1d2132" }}>
                {["Time", "Event", "Protocol", "Amount", "APY", "Policy", "TX"].map(h => <TxHeaderCell key={h}>{h}</TxHeaderCell>)}
              </div>
              {YIELD_TX.map((tx, i) => (
                <div key={i} className="grid gap-[8px] py-[10px]" style={{ gridTemplateColumns: "80px 110px 1fr 80px 60px 50px 80px", borderTop: "1px solid #0d1018" }}>
                  <TxCell muted>{tx.time}</TxCell>
                  <TxCell>{tx.event}</TxCell>
                  <TxCell muted>{tx.protocol}</TxCell>
                  <TxCell mono>{tx.amount}</TxCell>
                  <TxCell muted>{tx.apy}</TxCell>
                  <TxCell muted>{tx.policy}</TxCell>
                  <TxCell muted mono>{tx.tx}</TxCell>
                </div>
              ))}
            </div>
          </div>

        </div>
      </ScrollArea>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   PAYMENTS AGENT VIEW  (Figma 3437-34303)
═══════════════════════════════════════════════════════ */
const PaymentsAgentView = ({ agent, rawPolicy, isActive, onToggle, onEdit, onBack, onDelete, agentName }: {
  agent: AgentData; rawPolicy: any; isActive: boolean; onToggle: () => void; onEdit: () => void; onBack: () => void; onDelete: () => void; agentName: string;
}) => {
  const p = rawPolicy ?? {};
  const capitalAmt = p.uiCapitalAmount ? `$${Number(p.uiCapitalAmount).toLocaleString()}` : "$1,224,000";
  const perTxLimit = p.typeConfig?.per_transaction_limit_usdc ? `$${Number(p.typeConfig.per_transaction_limit_usdc).toLocaleString()}` : "$10,000";
  const dailyBudget = p.typeConfig?.daily_spend_budget_usdc ? `$${Number(p.typeConfig.daily_spend_budget_usdc).toLocaleString()}` : "$25,000";
  const approvalAbove = p.typeConfig?.require_approval_above_usdc ? `> $${Number(p.typeConfig.require_approval_above_usdc).toLocaleString()}` : "> $1,000";
  const velocityCap = p.typeConfig?.counterparty_velocity_usdc ? `$${Number(p.typeConfig.counterparty_velocity_usdc).toLocaleString()} / 24h` : "$50,000 / 24h";
  const paymentTypeLabel = p.typeConfig?.payment_type ? p.typeConfig.payment_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : "Recurring + subscriptions";

  const policyRows: PolicyCell[][] = [
    [{ label: "Payment Type", value: paymentTypeLabel }, { label: "Per-TX Limit", value: perTxLimit }, { label: "Daily Budget", value: dailyBudget }],
    [{ label: "Approval Threshold", value: approvalAbove }, { label: "Velocity / Counterparty", value: velocityCap }, { label: "Sanctions Screening", value: "OFAC + Chainalysis" }],
    [{ label: "x402 Enabled", value: "Yes" }, { label: "Volume Spike Breaker", value: "5× · 24hr · Freeze" }, { label: "Sanctions Hit", value: "Block + alert" }],
    [{ label: "Capital Allocated", value: capitalAmt }, { label: "Execution Window", value: "24/7" }, { label: "ERC-8004 Registry", value: "Registered" }],
  ];

  return (
    <div className="flex flex-col h-full bg-[#11141b] rounded-[16px] border border-solid border-[#1d2132] overflow-hidden">
      <AgentTopBar onBack={onBack} onEdit={onEdit} isActive={isActive} onToggle={onToggle} onDelete={onDelete} agentName={agentName} />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[16px] p-[16px] pb-8">

          <AgentHeaderCard agent={agent} agentType="Payments" agentId={agent.id} />

          <div className="flex gap-[16px]">
            <StatCard label="Capital Allocated" value={capitalAmt} />
            <StatCard label="Volume · 30d"    value="$284,600" />
            <StatCard label="Payments · 30d"  value="$1,084" sup=".12" />
            <StatCard label="Avg Size"        value="$154" />
            <StatCard label="Pending Review"  value="4" color="#ff9500" />
          </div>

          <ReputationBanner agentId={agent.id} />

          {/* Allowlisted Recipients */}
          <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10" }}>
            <div className="px-[16px] h-[48px] flex items-center" style={{ borderBottom: "1px solid #1d2132" }}>
              <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">Allowlisted Recipients</span>
            </div>
            <div className="px-[16px]">
              <div className="grid gap-[8px] py-[10px]"
                style={{ gridTemplateColumns: "1fr 70px 100px 90px 80px", borderBottom: "1px solid #1d2132" }}>
                {["Recipient", "Rail", "Per-Payment Cap", "Recurrence", "30D"].map(h => <TxHeaderCell key={h}>{h}</TxHeaderCell>)}
              </div>
              {ALLOWLISTED_RECIPIENTS.map((r, i) => (
                <div key={i} className="grid gap-[8px] py-[10px]" style={{ gridTemplateColumns: "1fr 70px 100px 90px 80px", borderTop: "1px solid #0d1018" }}>
                  <div className="flex flex-col">
                    <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#a8b9f4] text-[12px] leading-[16px]">{r.name}</span>
                    <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[11px] leading-[14px]">{r.sub}</span>
                  </div>
                  <div><RailBadge rail={r.rail} /></div>
                  <TxCell>{r.cap}</TxCell>
                  <TxCell muted>{r.recur}</TxCell>
                  <TxCell mono>{r.d30}</TxCell>
                </div>
              ))}
            </div>
          </div>

          <PolicyGrid rows={policyRows} onEdit={onEdit} />
          <SchemaSection rows={buildDynamicSchema(agent.id, "payments", rawPolicy)} />

          {/* Transaction History */}
          <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10" }}>
            <TxSectionTitle title="Transaction History" />
            <div className="px-[16px]">
              <div className="grid gap-[8px] py-[10px]"
                style={{ gridTemplateColumns: "80px 70px 1fr 80px 90px 50px 80px", borderBottom: "1px solid #1d2132" }}>
                {["Time", "Rail", "Recipient", "Amount", "Status", "Policy", "TX"].map(h => <TxHeaderCell key={h}>{h}</TxHeaderCell>)}
              </div>
              {PAYMENTS_TX.map((tx, i) => {
                const s = statusStyle(tx.status);
                return (
                  <div key={i} className="grid gap-[8px] py-[10px]" style={{ gridTemplateColumns: "80px 70px 1fr 80px 90px 50px 80px", borderTop: "1px solid #0d1018" }}>
                    <TxCell muted>{tx.time}</TxCell>
                    <div><RailBadge rail={tx.rail} /></div>
                    <TxCell>{tx.recipient}</TxCell>
                    <TxCell mono>{tx.amount}</TxCell>
                    <div><StatusBadge label={tx.status} color={s.color} bg={s.bg} /></div>
                    <TxCell muted>{tx.policy}</TxCell>
                    <TxCell muted mono>{tx.tx || "—"}</TxCell>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </ScrollArea>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   ANALYTICS AGENT VIEW  (Figma 3438-35039)
═══════════════════════════════════════════════════════ */
const AnalyticsAgentView = ({ agent, rawPolicy, isActive, onToggle, onEdit, onBack, onDelete, agentName }: {
  agent: AgentData; rawPolicy: any; isActive: boolean; onToggle: () => void; onEdit: () => void; onBack: () => void; onDelete: () => void; agentName: string;
}) => {
  const p = rawPolicy ?? {};
  const trackedAgentsRaw = p.typeConfig?.tracked_agents;
  const trackedAgents = trackedAgentsRaw === "all" ? "All" : (trackedAgentsRaw ?? "All");
  const maxAlerts = p.typeConfig?.max_alerts_per_day ?? 10;
  const computeCap = p.typeConfig?.compute_cap_usdc
    ? `$${Number(p.typeConfig.compute_cap_usdc).toLocaleString()} / month`
    : (p.typeConfig?.compute_budget_usdc ? `$${(Number(p.typeConfig.compute_budget_usdc) / 1_000_000).toLocaleString()} / month` : "$250 / month");
  const execCap = p.typeConfig?.execution_limit_usdc
    ? `$${(Number(p.typeConfig.execution_limit_usdc) / 1_000_000).toLocaleString()} / action`
    : "$5,000 / action";
  const criticalRouting = p.typeConfig?.critical_routing ?? "Dash + Slack + SMS";
  const reportFreq = p.typeConfig?.report_frequency ? (p.typeConfig.report_frequency.charAt(0).toUpperCase() + p.typeConfig.report_frequency.slice(1)) : "Daily";
  const allowedActionsLabel = p.typeConfig?.allowed_actions ? p.typeConfig.allowed_actions.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : "Pause agent only";
  const allowedActions = Array.isArray(p.typeConfig?.execution_whitelist)
    ? p.typeConfig.execution_whitelist.join(", ")
    : "Pause agent only";

  const policyRows: PolicyCell[][] = [
    [{ label: "Tracked Agents", value: `${trackedAgents}` }, { label: "Tracked Positions", value: "All open" }, { label: "Report Frequency", value: `${reportFreq} 09:00 GST` }],
    [{ label: "Recommendations", value: "Included" }, { label: "Critical Routing", value: criticalRouting }, { label: "Max Alerts / Day", value: String(maxAlerts) }],
    [{ label: "Compute Cap", value: computeCap }, { label: "Auto Execute", value: "Enabled · Whitelist" }, { label: "Execution Cap", value: execCap }],
    [{ label: "Allowed Actions", value: allowedActionsLabel }, { label: "Daily Action Cap", value: "3" }, { label: "Sanctions Hit", value: "Move funds · Trade" }],
  ];

  return (
    <div className="flex flex-col h-full bg-[#11141b] rounded-[16px] border border-solid border-[#1d2132] overflow-hidden">
      <AgentTopBar onBack={onBack} onEdit={onEdit} isActive={isActive} onToggle={onToggle} onDelete={onDelete} agentName={agentName} />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[16px] p-[16px] pb-8">

          <AgentHeaderCard agent={agent} agentType="Analytics" agentId={agent.id} />

          <div className="flex gap-[16px]">
            <StatCard label="Tracked Agents"  value={String(trackedAgents)} />
            <StatCard label="Reports · 30d"   value="124" />
            <StatCard label="Signals Raised"  value="18" />
            <StatCard label="Auto Actions"    value="2" />
            <StatCard label="Compute · 30d"   value="$132" />
          </div>

          <ReputationBanner agentId={agent.id} />

          {/* Alert Rules */}
          <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10" }}>
            <div className="px-[16px] h-[48px] flex items-center" style={{ borderBottom: "1px solid #1d2132" }}>
              <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">Alert Rules</span>
            </div>
            <div className="px-[16px]">
              <div className="grid gap-[8px] py-[10px]"
                style={{ gridTemplateColumns: "110px 1fr 110px 110px", borderBottom: "1px solid #1d2132" }}>
                {["Rule", "Condition", "Action", "Routing"].map(h => <TxHeaderCell key={h}>{h}</TxHeaderCell>)}
              </div>
              {ALERT_RULES.map((r, i) => (
                <div key={i} className="grid gap-[8px] py-[10px]" style={{ gridTemplateColumns: "110px 1fr 110px 110px", borderTop: "1px solid #0d1018" }}>
                  <TxCell>{r.rule}</TxCell>
                  <TxCell muted>{r.condition}</TxCell>
                  <TxCell>{r.action}</TxCell>
                  <TxCell muted>{r.routing}</TxCell>
                </div>
              ))}
            </div>
          </div>

          <PolicyGrid rows={policyRows} onEdit={onEdit} />
          <SchemaSection rows={buildDynamicSchema(agent.id, "analytics", rawPolicy)} />

          {/* Transaction History */}
          <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10" }}>
            <TxSectionTitle title="Transaction History" />
            <div className="px-[16px]">
              <div className="grid gap-[8px] py-[10px]"
                style={{ gridTemplateColumns: "80px 110px 1fr 50px 90px 50px", borderBottom: "1px solid #1d2132" }}>
                {["Time", "Event", "Detail", "Conf", "Routed", "POL"].map(h => <TxHeaderCell key={h}>{h}</TxHeaderCell>)}
              </div>
              {ANALYTICS_TX.map((tx, i) => (
                <div key={i} className="grid gap-[8px] py-[10px]" style={{ gridTemplateColumns: "80px 110px 1fr 50px 90px 50px", borderTop: "1px solid #0d1018" }}>
                  <TxCell muted>{tx.time}</TxCell>
                  <TxCell>{tx.event}</TxCell>
                  <TxCell muted>{tx.detail}</TxCell>
                  <TxCell muted>{tx.conf}</TxCell>
                  <TxCell muted>{tx.routed}</TxCell>
                  <TxCell muted>{tx.pol}</TxCell>
                </div>
              ))}
            </div>
          </div>

        </div>
      </ScrollArea>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   CUSTOM AGENT VIEW  (Figma 3498-33400)
═══════════════════════════════════════════════════════ */
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="6.5" fill="#123509" stroke="#42bf23" strokeWidth="0.5" />
    <path d="M4.5 7L6.2 8.8L9.5 5.5" stroke="#42bf23" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="6.5" fill="#350011" stroke="#d20344" strokeWidth="0.5" />
    <path d="M5 5L9 9M9 5L5 9" stroke="#d20344" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const CustomAgentView = ({ agent, rawPolicy, isActive, onToggle, onEdit, onBack, onDelete, agentName }: {
  agent: AgentData; rawPolicy: any; isActive: boolean; onToggle: () => void; onEdit: () => void; onBack: () => void; onDelete: () => void; agentName: string;
}) => {
  const p = rawPolicy ?? {};
  const capitalAmt = p.uiCapitalAmount ? `$${Number(p.uiCapitalAmount).toLocaleString()}` : "$5,000";
  const primaryLimit = p.typeConfig?.primary_limit_usdc
    ? `$${Number(p.typeConfig.primary_limit_usdc).toLocaleString()} / Order`
    : "$500 / Order";
  const secondaryLimit = (p.typeConfig?.secondary_limit_usdc ?? p.typeConfig?.secondary_limit)
    ? `$${Number(p.typeConfig.secondary_limit_usdc ?? p.typeConfig.secondary_limit).toLocaleString()} / Day`
    : "$25,000 / Day";
  const opsPerHour = p.typeConfig?.max_operations_per_hour ?? 1200;
  const execWindow = p.typeConfig?.execution_window ?? "24/7";
  const sandboxDays = p.typeConfig?.sandbox_days_required ?? 14;
  const circuitBreaker = p.typeConfig?.circuit_breaker_loss_pct ? `-${p.typeConfig.circuit_breaker_loss_pct}% PnL · Pause` : "-8% PnL · Pause";
  const objective = p.typeConfig?.objective ?? "";
  const complexityLevel = p.typeConfig?.complexity_level ? (p.typeConfig.complexity_level.charAt(0).toUpperCase() + p.typeConfig.complexity_level.slice(1)) : "Medium";
  const runtimeLabel = p.typeConfig?.runtime ?? "Node 20";
  const sourceType = p.typeConfig?.source_type ? p.typeConfig.source_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : "GitHub Repo";

  const gradDays = 4;
  const gradRequired = sandboxDays;
  const violationCount = 0;
  const graduationScore = 82;

  const allowedTools = Array.isArray(p.typeConfig?.allowed_tools)
    ? p.typeConfig.allowed_tools as string[]
    : ["read_balance", "read_orderbook", "place_limit_order", "cancel_order"];
  const forbiddenTools = Array.isArray(p.typeConfig?.forbidden_tools)
    ? p.typeConfig.forbidden_tools as string[]
    : ["place_market_order", "open_perp", "transfer", "withdraw", "contract_call"];

  const toolsGrid = CUSTOM_TOOLS.map(t => ({
    ...t,
    allowed: allowedTools.some(a => a.toLowerCase().replace(/_/g, " ") === t.name.toLowerCase())
      ? true
      : forbiddenTools.some(f => f.toLowerCase().replace(/_/g, " ") === t.name.toLowerCase())
        ? false
        : t.allowed,
  }));

  const execWindowDesc = (p.typeConfig?.allowed_counterparties ?? ["hyperliquid_spot"]).map((c: string) =>
    c.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
  ).join(", ") + " · " + (p.uiAllowedAssets?.length ? p.uiAllowedAssets.join(", ") : "BTC, ETH");

  return (
    <div className="flex flex-col h-full bg-[#11141b] rounded-[16px] border border-solid border-[#1d2132] overflow-hidden">
      <AgentTopBar onBack={onBack} onEdit={onEdit} isActive={isActive} onToggle={onToggle} onDelete={onDelete} agentName={agentName} />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[16px] p-[16px] pb-8">

          <AgentHeaderCard agent={agent} agentType="Custom" agentId={agent.id} />

          <div className="flex gap-[16px]">
            <StatCard label="Capital Allocated"  value={capitalAmt} />
            <StatCard label="Sandbox PnL"        value="+$142"         color="#42bf23" />
            <StatCard label="Days in Sandbox"    value={`${gradDays} / ${gradRequired}`} />
            <StatCard label="Policy Violations"  value={String(violationCount)} />
            <StatCard label="Graduation Score"   value={`${graduationScore}%`} />
          </div>

          <ReputationBanner agentId={agent.id} />

          {/* Objective */}
          <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10" }}>
            <div className="px-[16px] h-[48px] flex items-center" style={{ borderBottom: "1px solid #1d2132" }}>
              <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">Objective</span>
            </div>
            <div className="flex gap-[8px] p-[16px]">
              <div className="flex flex-col gap-[4px] flex-1 px-[12px] py-[10px] rounded-[8px]" style={{ background: "#11141b" }}>
                <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[11px] leading-[14px]">Target Outcome</span>
                <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-white text-[14px] leading-[20px]">
                  {objective?.slice(0, 60) || "Positive PnL · Sharpe > 1.0"}
                </span>
              </div>
              <div className="flex flex-col gap-[4px] w-[160px] px-[12px] py-[10px] rounded-[8px]" style={{ background: "#11141b" }}>
                <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[11px] leading-[14px]">Complexity</span>
                <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-white text-[14px] leading-[20px]">
                  {complexityLevel}
                </span>
              </div>
            </div>
          </div>

          {/* Policies — custom layout with subsections */}
          <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10" }}>
            <div className="px-[16px] py-[12px] flex items-center justify-between" style={{ borderBottom: "1px solid #1d2132" }}>
              <div className="flex items-center gap-[8px]">
                <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#a8b9f4] text-[16px] leading-[20px]">Policies</span>
                <Dot />
                <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[13px] leading-[20px]">V4</span>
                <Dot />
                <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[13px] leading-[20px]">edited on-chain 42 days ago</span>
              </div>
              <button onClick={onEdit}
                className="flex items-center gap-[4px] px-[12px] py-[8px] rounded-[100px] hover:opacity-80 flex-shrink-0"
                style={{ background: "#222737" }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M11.333 2a1.886 1.886 0 0 1 2.667 2.667L5.167 13.5l-3.5.833.833-3.5L11.333 2Z" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[12px] leading-[16px]">Edit</span>
              </button>
            </div>
            <div className="flex flex-col gap-[16px] p-[16px]">
              {/* Tools Allowed */}
              <div className="flex flex-col gap-[8px]">
                <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#414965] text-[11px] leading-[14px] uppercase tracking-widest">Tools Allowed</span>
                <div className="grid grid-cols-3 gap-[8px]">
                  {toolsGrid.map((tool, i) => (
                    <div key={i} className="flex items-center justify-between px-[12px] py-[10px] rounded-[8px]" style={{ background: "#11141b" }}>
                      <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#a8b9f4] text-[13px] leading-[16px]">{tool.name}</span>
                      {tool.allowed ? <CheckIcon /> : <XIcon />}
                    </div>
                  ))}
                </div>
              </div>
              {/* Numeric Limits */}
              <div className="flex flex-col gap-[8px]">
                <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#414965] text-[11px] leading-[14px] uppercase tracking-widest">Numeric Limits</span>
                <div className="grid grid-cols-3 gap-[8px]">
                  {[
                    { label: "Primary Limit", value: primaryLimit },
                    { label: "Secondary Limit", value: secondaryLimit },
                    { label: "Operations / Hour", value: String(opsPerHour) },
                  ].map((c) => (
                    <div key={c.label} className="flex flex-col gap-[4px] px-[12px] py-[10px] rounded-[8px]" style={{ background: "#11141b" }}>
                      <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[11px] leading-[14px]">{c.label}</span>
                      <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-white text-[14px] leading-[20px]">{c.value}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-[8px]">
                  <div className="flex flex-col gap-[4px] px-[12px] py-[10px] rounded-[8px]" style={{ background: "#11141b" }}>
                    <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[11px] leading-[14px]">Execution Window</span>
                    <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-white text-[14px] leading-[20px]">{execWindow}</span>
                  </div>
                  <div className="flex flex-col gap-[4px] px-[12px] py-[10px] rounded-[8px]" style={{ background: "#11141b" }}>
                    <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[11px] leading-[14px]">Runtime</span>
                    <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-white text-[14px] leading-[20px]">{runtimeLabel}</span>
                  </div>
                  <div className="flex flex-col gap-[4px] px-[12px] py-[10px] rounded-[8px]" style={{ background: "#11141b" }}>
                    <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[11px] leading-[14px]">Source Type</span>
                    <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-white text-[14px] leading-[20px]">{sourceType}</span>
                  </div>
                </div>
              </div>
              {/* Safety Circuit Breakers */}
              <div className="flex flex-col gap-[8px]">
                <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#414965] text-[11px] leading-[14px] uppercase tracking-widest">Safety Circuit Breakers</span>
                <div className="grid grid-cols-3 gap-[8px]">
                  {[
                    { label: "Graduation", value: `${gradDays} / ${gradRequired} Days Clean` },
                    { label: "Circuit Breaker", value: circuitBreaker },
                    { label: "Undeclared Tool", value: "Block + Alert" },
                  ].map((c) => (
                    <div key={c.label} className="flex flex-col gap-[4px] px-[12px] py-[10px] rounded-[8px]" style={{ background: "#11141b" }}>
                      <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[11px] leading-[14px]">{c.label}</span>
                      <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-white text-[14px] leading-[20px]">{c.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <SchemaSection rows={buildDynamicSchema(agent.id, "custom", rawPolicy)} />

          {/* Capability Invocation Log */}
          <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10" }}>
            <TxSectionTitle title="Capability Invocation Log" />
            <div className="px-[16px]">
              <div className="grid gap-[8px] py-[10px]"
                style={{ gridTemplateColumns: "80px 140px 1fr 70px 90px 40px 80px", borderBottom: "1px solid #1d2132" }}>
                {["Time", "Tool", "Args", "Check", "Result", "POL", "TX"].map(h => <TxHeaderCell key={h}>{h}</TxHeaderCell>)}
              </div>
              {CUSTOM_TX.map((tx, i) => {
                const cs = statusStyle(tx.check);
                const rs = statusStyle(tx.result);
                return (
                  <div key={i} className="grid gap-[8px] py-[10px]" style={{ gridTemplateColumns: "80px 140px 1fr 70px 90px 40px 80px", borderTop: "1px solid #0d1018" }}>
                    <TxCell muted>{tx.time}</TxCell>
                    <TxCell>{tx.tool}</TxCell>
                    <TxCell muted>{tx.args}</TxCell>
                    <div><StatusBadge label={tx.check} color={cs.color} bg={cs.bg} /></div>
                    <div><StatusBadge label={tx.result} color={rs.color} bg={rs.bg} /></div>
                    <TxCell muted>{tx.pol}</TxCell>
                    <TxCell muted mono>{tx.tx}</TxCell>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </ScrollArea>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   MAIN PAGE — routing dispatch
═══════════════════════════════════════════════════════ */
export const AgentDetailPage = (): JSX.Element => {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { openCreateAgentAtStep } = useNav();

  const staticAgent = agents.find((a) => a.id === params.id);

  const { data: apiAgent, isLoading } = useQuery<any>({
    queryKey: ["/api/agents", params.id],
    queryFn: () => apiRequest("GET", `/api/agents/${params.id}`).then((r) => r.json()),
    enabled: !staticAgent && !!params.id,
    retry: false,
  });

  const agent: AgentData | null = staticAgent ?? (apiAgent ? apiAgentToData(apiAgent) : null);
  const rawPolicy = apiAgent?.policy ?? null;
  const agentType = ((rawPolicy?.uiType ?? apiAgent?.category ?? agent?.type ?? "").toLowerCase()) as string;

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

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/agents/${params.id}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/agents"] });
    },
  });

  const handleDelete = () => {
    if (!params.id) return;
    try {
      const stored: string[] = JSON.parse(localStorage.getItem("brain-deleted-agents") || "[]");
      if (!stored.includes(params.id)) {
        localStorage.setItem("brain-deleted-agents", JSON.stringify([...stored, params.id]));
      }
    } catch {}
    qc.setQueryData<any[]>(["/api/agents"], (old) =>
      old ? old.filter((a: any) => a.id !== params.id) : old
    );
    navigate("/agents");
    if (apiAgent) {
      deleteMutation.mutate();
    }
  };

  const getPrefill = useCallback((): AgentPrefillData | undefined => {
    if (!agent) return undefined;
    return buildPrefill(agent, rawPolicy);
  }, [agent, rawPolicy]);

  const editableId = agent?.createdByUser && apiAgent ? params.id : undefined;
  const openEdit = useCallback((step: number) => {
    openCreateAgentAtStep(step, getPrefill(), editableId);
  }, [getPrefill, openCreateAgentAtStep, editableId]);

  const commonProps = {
    isActive,
    onToggle: handleToggle,
    onEdit: () => openEdit(1),
    onBack: () => window.history.back(),
    onDelete: handleDelete,
    agentName: agent?.name ?? "this agent",
  };

  /* Loading */
  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-[#11141b] rounded-[16px] border border-solid border-[#1d2132] overflow-hidden">
        <div className="flex items-center px-[16px] flex-shrink-0" style={{ height: "64px" }}>
          <Skeleton className="w-[32px] h-[32px] rounded-full" />
        </div>
        <div className="flex flex-col gap-[16px] p-[16px]">
          <div className="rounded-[16px] p-[16px] flex flex-col gap-[12px]" style={{ background: "#0a0c10" }}>
            <div className="flex gap-[8px] items-center">
              <Skeleton className="w-[64px] h-[64px] rounded-[12px]" />
              <div className="flex flex-col gap-[8px] flex-1">
                <Skeleton className="h-[20px] w-[140px]" />
                <Skeleton className="h-[16px] w-[200px]" />
              </div>
            </div>
            <Skeleton className="h-[16px] w-full" />
          </div>
        </div>
      </div>
    );
  }

  /* Not found */
  if (!agent) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-[#11141b] rounded-[16px] border border-[#1d2132]">
        <span className="text-4xl">🤖</span>
        <p className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#414965] text-[14px]">Agent not found</p>
        <button onClick={() => navigate("/agents")}
          className="px-4 py-2 rounded-full text-sm hover:opacity-80"
          style={{ background: "#4a2300", color: "#ff9500", fontFamily: "'Plus Jakarta Sans', Helvetica" }}>
          Back to Agents
        </button>
      </div>
    );
  }

  /* Type dispatch */
  if (agentType === "trading")   return <TradingAgentView   agent={agent} rawPolicy={rawPolicy} {...commonProps} />;
  if (agentType === "lending")   return <LendingAgentView   agent={agent} rawPolicy={rawPolicy} {...commonProps} />;
  if (agentType === "yield")     return <YieldAgentView     agent={agent} rawPolicy={rawPolicy} {...commonProps} />;
  if (agentType === "payments")  return <PaymentsAgentView  agent={agent} rawPolicy={rawPolicy} {...commonProps} />;
  if (agentType === "analytics") return <AnalyticsAgentView agent={agent} rawPolicy={rawPolicy} {...commonProps} />;
  if (agentType === "custom")    return <CustomAgentView    agent={agent} rawPolicy={rawPolicy} {...commonProps} />;

  /* Fallback — use Trading view for unknown types */
  return <TradingAgentView agent={agent} rawPolicy={rawPolicy} {...commonProps} />;
};
