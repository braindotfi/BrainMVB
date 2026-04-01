import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { agents, AgentData, AgentStatus } from "@/lib/agentsData";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type Period = "1H" | "1D" | "1W" | "1M" | "1Y" | "ALL";

/* ── Chart data generation ── */
type ChartPt = { t: string; v: number };

const PERIOD_LABELS: Record<Period, string[]> = {
  "1H":  ["00:00","10m","20m","30m","40m","50m","60m"],
  "1D":  ["03:00","05:00","07:00","09:00","11:00","13:00","15:00","17:00","19:00","21:00","23:00","01:00"],
  "1W":  ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
  "1M":  ["Mar 1","Mar 5","Mar 10","Mar 15","Mar 20","Mar 25","Mar 30"],
  "1Y":  ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
  "ALL": ["2022","2023","2024","2025"],
};

const PERIOD_RATIOS: Record<Period, number> = {
  "1H": 0.004, "1D": 0.012, "1W": 0.055, "1M": 0.21, "1Y": 0.52, "ALL": 1.0,
};

const PERIOD_DELTA_RATIOS: Record<Period, number> = {
  "1H": 0.011, "1D": 0.022, "1W": 0.041, "1M": 0.091, "1Y": 0.198, "ALL": 0.32,
};

function buildChartData(agent: AgentData, period: Period): ChartPt[] {
  const raw = parseFloat(agent.earnings.replace(/[^0-9.]/g, "")) || 1000;
  const target = raw * PERIOD_RATIOS[period];
  const labels = PERIOD_LABELS[period];
  const n = labels.length;
  // Risk level drives volatility
  const vol = agent.riskLevel === "high" ? 0.18 : agent.riskLevel === "medium" ? 0.09 : 0.04;
  // Seed from agent id so data is deterministic per agent
  const seed = agent.id.charCodeAt(0) + agent.id.charCodeAt(1);

  return labels.map((t, i) => {
    const progress = i / (n - 1);
    // Slight dip at start then climb
    const trend = progress < 0.15
      ? 0.55 + progress * 1.2
      : 0.55 + 0.18 + (progress - 0.15) * 1.05;
    const noise = vol * Math.sin(i * 2.3 + seed * 0.7) * (1 - progress * 0.4);
    const v = Math.max(0, target * (trend + noise));
    return { t, v: parseFloat(v.toFixed(2)) };
  });
}

function periodEarnings(agent: AgentData, period: Period): string {
  const raw = parseFloat(agent.earnings.replace(/[^0-9.]/g, "")) || 1000;
  const v = raw * PERIOD_RATIOS[period];
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function periodDelta(agent: AgentData, period: Period): { text: string; positive: boolean } {
  const raw = parseFloat(agent.earnings.replace(/[^0-9.]/g, "")) || 1000;
  const v = raw * PERIOD_RATIOS[period] * PERIOD_DELTA_RATIOS[period];
  const pct = PERIOD_DELTA_RATIOS[period] * 100;
  return {
    text: `+$${v.toFixed(2)} (+${pct.toFixed(2)}%)`,
    positive: true,
  };
}

/* ── Agent chart color ── */
function agentColor(agent: AgentData): string {
  if (agent.status !== "active") return "#6c779d";
  if (agent.riskLevel === "high")   return "#d20344";
  if (agent.riskLevel === "medium") return "#7631ee";
  return "#42bf23";
}

/* ── Chart custom tooltip ── */
const ChartTip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const v: number = payload[0]?.value ?? 0;
  return (
    <div className="px-[10px] py-[8px] rounded-[8px]" style={{ background: "#0d101a", border: "1px solid #1d2132" }}>
      <span style={{ fontFamily: "'Gilroy-SemiBold',Helvetica", fontSize: "12px", color: "#ffffff" }}>
        ${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  );
};

/* ── Thin horizontal divider ── */
const HDivider = () => <div className="h-px w-full flex-shrink-0" style={{ background: "#1d2132" }} />;

/* ── Vertical divider between stat columns ── */
const VDivider = () => (
  <div className="flex-shrink-0 self-stretch" style={{ width: "1px", background: "#1d2132" }} />
);

/* ── One stat column ── */
const StatCol = ({ label, value, accent }: { label: string; value: string; accent?: string }) => (
  <div className="flex flex-col gap-[3px] items-center justify-center flex-1 min-w-0">
    <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#414965] text-[13px] leading-[14px] whitespace-nowrap">{label}</span>
    <span className="[font-family:'Gilroy-Bold',Helvetica] text-[16px] leading-[20px] whitespace-nowrap" style={{ color: accent ?? "#a8b9f4" }}>{value}</span>
  </div>
);

/* ── Pencil icon ── */
const PencilIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M11.333 2a1.886 1.886 0 0 1 2.667 2.667L5.167 13.5l-3.5.833.833-3.5L11.333 2Z" stroke="#ff9500" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* ── Edit hint pill ── */
const EditHintPill = () => (
  <div className="flex gap-[4px] items-center pl-[4px] pr-[8px] py-[4px] rounded-[40px] flex-shrink-0" style={{ background: "#11141b" }}>
    <div className="w-[16px] h-[16px] flex items-center justify-center">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M8.5 1.5a1.414 1.414 0 0 1 2 2L3.875 10.125l-2.625.625.625-2.625L8.5 1.5Z" stroke="#414965" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
    <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#414965] text-[13px] leading-[14px] whitespace-nowrap">Hover over an option to edit</span>
  </div>
);

/* ── Config row ── */
const ConfigRow = ({ label, value, hasDivider }: { label: string; value: string; hasDivider: boolean }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <>
      <div className="flex gap-[8px] items-center w-full transition-colors"
        style={{ background: hovered ? "rgba(74,35,0,0.06)" : "transparent" }}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <div className="flex flex-col gap-[8px] items-start flex-1 min-w-0">
          <p className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[16px] leading-[20px]">{label}</p>
          <p className="[font-family:'Gilroy-Medium',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">{value}</p>
        </div>
        <button className="flex-shrink-0 flex gap-[4px] items-center justify-center px-[12px] py-[8px] rounded-[100px] transition-all"
          style={{ background: "#4a2300", opacity: hovered ? 1 : 0, pointerEvents: hovered ? "auto" : "none" }}>
          <PencilIcon />
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#ff9500] text-[12px] leading-[16px] whitespace-nowrap">Edit</span>
        </button>
      </div>
      {hasDivider && <HDivider />}
    </>
  );
};

/* ── Rule row ── */
const RuleRow = ({ index, label, value, hasDivider }: { index: number; label: string; value: string; hasDivider: boolean }) => {
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
          <button data-testid={`button-edit-rule-${index}`}
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

/* ── Start / Stop button ── */
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

/* ── Activity dot ── */
const ActivityDot = ({ kind }: { kind: "success" | "info" | "warn" }) => {
  const colors = { success: "#42bf23", info: "#a8b9f4", warn: "#d20344" } as const;
  return (
    <div className="flex-shrink-0 flex items-start pt-[4px]">
      <div className="w-[8px] h-[8px] rounded-full" style={{ background: colors[kind] }} />
    </div>
  );
};

const eventColors = { success: "#42bf23", info: "#a8b9f4", warn: "#d20344" } as const;

/* ══════════════════════════════════════════
   Main page
══════════════════════════════════════════ */
export const AgentDetailPage = (): JSX.Element => {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [chartPeriod, setChartPeriod] = useState<Period>("1D");

  const agent = agents.find((a) => a.id === params.id);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>(agent?.status ?? "inactive");

  const chartData  = useMemo(() => agent ? buildChartData(agent, chartPeriod)    : [], [agent, chartPeriod]);
  const earnings   = useMemo(() => agent ? periodEarnings(agent, chartPeriod)     : "$0.00",  [agent, chartPeriod]);
  const delta      = useMemo(() => agent ? periodDelta(agent, chartPeriod)         : { text: "", positive: true }, [agent, chartPeriod]);
  const color      = useMemo(() => agent ? agentColor(agent)                       : "#42bf23", [agent]);
  const gradientId = `perf-grad-${agent?.id ?? "none"}`;

  if (!agent) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-[#11141b] rounded-[16px] border border-[#1d2132]">
        <span className="text-4xl">🤖</span>
        <p className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#414965] text-[14px]">Agent not found</p>
        <button onClick={() => navigate("/marketplace")}
          className="px-4 py-2 rounded-full text-sm transition-opacity hover:opacity-80"
          style={{ background: "#4a2300", color: "#ff9500", fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif" }}>
          Back to Marketplace
        </button>
      </div>
    );
  }

  const isActive = agentStatus === "active";
  const handleToggle = () => setAgentStatus((p) => (p === "active" ? "inactive" : "active"));
  const truncatedWallet = agent.walletAddress && agent.walletAddress !== "N/A" ? agent.walletAddress : "0x0000...0000";

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

          {/* ════════════════════════════════
              1. Identity card
          ════════════════════════════════ */}
          <div className="rounded-[16px] overflow-hidden flex flex-col gap-[16px] p-[16px]"
            style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>

            {/* Avatar + name row */}
            <div className="flex gap-[8px] items-center w-full">
              <div className="overflow-hidden relative flex-shrink-0 w-[64px] h-[64px] rounded-[12px]">
                <img src={agent.avatar} alt={agent.name} className="absolute inset-0 w-full h-full object-cover" />
              </div>
              <div className="flex flex-1 min-w-0 gap-[16px] items-center">
                <div className="flex flex-col gap-[4px] flex-1 min-w-0">
                  <div className="flex items-center gap-[4px]">
                    <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-white text-[16px] leading-[20px] whitespace-nowrap">{agent.name}</span>
                    <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[16px] leading-[20px] whitespace-nowrap">{agent.ticker}</span>
                  </div>
                  <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[14px] leading-[20px] whitespace-nowrap">Deployed: {agent.deployedAt}</span>
                </div>
                <StartStopBtn isActive={isActive} onToggle={handleToggle} />
              </div>
            </div>

            {/* Description */}
            <p className="[font-family:'Gilroy-Medium',Helvetica] text-[#a8b9f4] text-[14px] leading-[20px]">{agent.description}</p>

            <HDivider />

            {/* Stats row 1 */}
            <div className="flex items-center gap-[6px]">
              <StatCol label="Total Actions" value={agent.trades.toLocaleString()} />
              <VDivider />
              <StatCol label="Total Earnings" value={agent.earnings} accent={agent.earnings.startsWith("+") ? "#a8b9f4" : "#d20344"} />
              <VDivider />
              <StatCol label="Success Rate" value={agent.successRate} accent="#42bf23" />
            </div>

            <HDivider />

            {/* Stats row 2 */}
            <div className="flex items-center gap-[6px]">
              <StatCol label="Creator" value={truncatedWallet} />
              <VDivider />
              <StatCol label="Category" value={agent.category} />
              <VDivider />
              <StatCol label="Last Active" value={agent.lastActive} />
            </div>
          </div>

          {/* ════════════════════════════════
              2. Performance chart card
          ════════════════════════════════ */}
          <div className="rounded-[16px] overflow-hidden"
            style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>

            {/* Chart header: price + delta pill | period tabs (Figma 3277:28057) */}
            <div className="flex items-center justify-between px-[16px] py-[10px]"
              style={{ borderBottom: "1px solid #1d2132", background: "#0a0c10" }}>

              {/* Left: price + delta pill in a row */}
              <div className="flex items-center gap-[8px] flex-shrink-0">
                <p style={{ lineHeight: 0 }}>
                  <span style={{ fontFamily: "'Gilroy-Medium', Helvetica, sans-serif", fontSize: "16px", lineHeight: "28px", color: "#a8b9f4" }}>$</span>
                  <span style={{ fontFamily: "'Gilroy-Medium', Helvetica, sans-serif", fontSize: "24px", lineHeight: "28px", color: "#a8b9f4" }}>
                    {earnings.replace("$", "").replace(",", "")}
                  </span>
                </p>
                <div
                  className="flex items-center justify-center px-[8px] py-[4px] rounded-[40px] flex-shrink-0"
                  style={{ background: delta.positive ? "#123509" : "#350011" }}
                >
                  <span style={{ fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif", fontSize: "14px", lineHeight: "16px", color: delta.positive ? "#42bf23" : "#d20344", whiteSpace: "nowrap" }}>
                    {delta.text}
                  </span>
                </div>
              </div>

              {/* Right: period tab picker */}
              <div className="flex items-center gap-[2px] p-[2px] rounded-[400px] flex-shrink-0"
                style={{ background: "#06070a" }}>
                {(["1H","1D","1W","1M","1Y","ALL"] as Period[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setChartPeriod(p)}
                    data-testid={`button-chart-period-${p}`}
                    className="flex items-center justify-center px-[12px] py-[4px] rounded-[100px] transition-all flex-shrink-0"
                    style={chartPeriod === p
                      ? { background: "#4a2300" }
                      : { background: "#06070a" }}
                  >
                    <span style={{ fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif", fontSize: "12px", lineHeight: "16px", color: chartPeriod === p ? "#ff9500" : "#414965", whiteSpace: "nowrap" }}>
                      {p}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Area chart — 310px tall, Y-axis on right, X-axis time labels, grid line */}
            <div style={{ height: "310px", background: "#0a0c10" }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 56, left: 0, bottom: 10 }}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={color} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={color} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    horizontal={true}
                    vertical={false}
                    stroke="#1d2132"
                    strokeWidth={1}
                  />
                  <XAxis
                    dataKey="t"
                    tick={{ fontFamily: "'Gilroy-SemiBold',Helvetica", fontSize: 10, fill: "#6c779d" }}
                    tickLine={false}
                    axisLine={{ stroke: "#1d2132", strokeWidth: 1 }}
                    dy={6}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    orientation="right"
                    tick={{ fontFamily: "'Gilroy-SemiBold',Helvetica", fontSize: 10, fill: "#6c779d" }}
                    tickLine={false}
                    axisLine={false}
                    tickCount={7}
                    width={52}
                    tickFormatter={(v: number) =>
                      v >= 1000
                        ? `$${(v / 1000).toFixed(1)}k`
                        : `$${v.toFixed(v < 1 ? 4 : 2)}`
                    }
                  />
                  <Tooltip
                    content={<ChartTip />}
                    cursor={{ stroke: "#6c779d", strokeWidth: 1, strokeDasharray: "4 4" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke={color}
                    strokeWidth={2}
                    fill={`url(#${gradientId})`}
                    dot={false}
                    activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
                    isAnimationActive={true}
                    animationDuration={400}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ════════════════════════════════
              3. Configuration card
          ════════════════════════════════ */}
          <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
            <div className="flex items-center justify-between px-[16px] py-[12px]" style={{ borderBottom: "1px solid #1d2132" }}>
              <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">Configuration</span>
              <EditHintPill />
            </div>
            <div className="flex flex-col gap-[16px] p-[16px]">
              <ConfigRow label="Budget / Spend Limit" value={agent.budget}     hasDivider />
              <ConfigRow label="Execution Schedule"   value={agent.schedule}   hasDivider />
              <ConfigRow label="Deployed"             value={agent.deployedAt} hasDivider={false} />
            </div>
          </div>

          {/* ════════════════════════════════
              4. Rulebook card
          ════════════════════════════════ */}
          <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
            <div className="flex items-center justify-between px-[16px] py-[12px]" style={{ borderBottom: "1px solid #1d2132" }}>
              <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">Rulebook</span>
              <EditHintPill />
            </div>
            <div className="flex flex-col gap-[16px] p-[16px]">
              {agent.rules.map((rule, i) => (
                <RuleRow key={rule.id} index={i} label={rule.label} value={rule.value} hasDivider={i < agent.rules.length - 1} />
              ))}
            </div>
          </div>

          {/* ════════════════════════════════
              5. Recent Activity card
          ════════════════════════════════ */}
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
