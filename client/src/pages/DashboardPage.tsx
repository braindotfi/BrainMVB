import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { useAuth } from "@/lib/authContext";

/* ── Design tokens ── */
const CARD_BG = "#0a0c10";
const BORDER  = "#1d2132";

/* ── Cash flow chart data ── */
type CfPeriod = "1H" | "1D" | "1W" | "1M" | "1Y" | "ALL";
type CfPoint  = { time: string; inflow: number; outflow: number };

const cashFlowData: Record<CfPeriod, CfPoint[]> = {
  "1H": [
    { time: "00:00", inflow: 6100, outflow: 5820 },
    { time: "01:00", inflow: 6350, outflow: 5940 },
    { time: "02:00", inflow: 6180, outflow: 6050 },
    { time: "03:00", inflow: 6520, outflow: 5980 },
    { time: "04:00", inflow: 6380, outflow: 5900 },
    { time: "05:00", inflow: 6700, outflow: 6180 },
    { time: "06:00", inflow: 6319, outflow: 6040 },
    { time: "07:00", inflow: 6820, outflow: 6290 },
    { time: "08:00", inflow: 6610, outflow: 6200 },
    { time: "09:00", inflow: 7000, outflow: 6490 },
    { time: "10:00", inflow: 6790, outflow: 6380 },
    { time: "11:00", inflow: 6900, outflow: 6580 },
  ],
  "1D": [
    { time: "06:00", inflow: 5820, outflow: 5620 },
    { time: "09:00", inflow: 6210, outflow: 5900 },
    { time: "12:00", inflow: 6530, outflow: 6120 },
    { time: "15:00", inflow: 6780, outflow: 6290 },
    { time: "18:00", inflow: 6580, outflow: 6180 },
    { time: "21:00", inflow: 7000, outflow: 6500 },
    { time: "00:00", inflow: 6900, outflow: 6600 },
  ],
  "1W": [
    { time: "Mon", inflow: 5900, outflow: 5700 },
    { time: "Tue", inflow: 6310, outflow: 5990 },
    { time: "Wed", inflow: 6120, outflow: 5880 },
    { time: "Thu", inflow: 6710, outflow: 6290 },
    { time: "Fri", inflow: 6430, outflow: 6090 },
    { time: "Sat", inflow: 6920, outflow: 6490 },
    { time: "Sun", inflow: 7000, outflow: 6580 },
  ],
  "1M": [
    { time: "Mar 1",  inflow: 5700, outflow: 5500 },
    { time: "Mar 8",  inflow: 6120, outflow: 5820 },
    { time: "Mar 15", inflow: 6520, outflow: 6190 },
    { time: "Mar 22", inflow: 6800, outflow: 6380 },
    { time: "Mar 28", inflow: 7000, outflow: 6590 },
  ],
  "1Y": [
    { time: "Jan", inflow: 4510, outflow: 4200 },
    { time: "Mar", inflow: 5210, outflow: 4790 },
    { time: "May", inflow: 5820, outflow: 5390 },
    { time: "Jul", inflow: 6320, outflow: 5890 },
    { time: "Sep", inflow: 6700, outflow: 6180 },
    { time: "Nov", inflow: 7000, outflow: 6490 },
    { time: "Dec", inflow: 6820, outflow: 6310 },
  ],
  "ALL": [
    { time: "2022", inflow: 3210, outflow: 2810 },
    { time: "2023", inflow: 4520, outflow: 4100 },
    { time: "Q1",   inflow: 5820, outflow: 5390 },
    { time: "Q2",   inflow: 6530, outflow: 6010 },
    { time: "Q3",   inflow: 6920, outflow: 6390 },
    { time: "2024", inflow: 7000, outflow: 6490 },
  ],
};

/* ── Helpers ── */
const parseBalance = (b?: string | number): number => {
  if (b === undefined || b === null) return 0;
  if (typeof b === "number") return b;
  return parseFloat(b.replace(/,/g, "")) || 0;
};

const fmtAddress = (addr?: string): string =>
  addr ? `${addr.slice(0, 6)}....${addr.slice(-4)}` : "—";

const fmtIban = (iban?: string): string =>
  iban ? `${iban.slice(0, 12)}...` : "—";

const fmtUsd = (n: number): { int: string; dec: string } => {
  const [intPart, decPart] = n.toFixed(2).split(".");
  return { int: "$" + Number(intPart).toLocaleString(), dec: "." + decPart };
};

const CATEGORY_LABEL: Record<string, string> = {
  trading:    "Trading Agent",
  payments:   "Payments Agent",
  research:   "Research Agent",
  automation: "Automation Agent",
  swarm:      "Swarm Agent",
  yield:      "Yield Agent",
};

/* ── Shared UI primitives ── */
type TagColor = "green" | "red" | "orange" | "grey";
const TAG_STYLES: Record<TagColor, { bg: string; border: string; text: string }> = {
  green:  { bg: "#123509", border: "rgba(66,191,35,0.2)",   text: "#42bf23" },
  red:    { bg: "#350011", border: "rgba(210,3,68,0.2)",    text: "#d20344" },
  orange: { bg: "#4a2300", border: "rgba(255,149,0,0.2)",   text: "#ff9500" },
  grey:   { bg: "#222737", border: "rgba(108,119,157,0.2)", text: "#6c779d" },
};

const Tag = ({ children, color = "grey" }: { children: React.ReactNode; color?: TagColor }) => {
  const s = TAG_STYLES[color];
  return (
    <span
      className="flex-shrink-0 inline-flex items-center justify-center px-[8px] py-[3px] rounded-[22px] whitespace-nowrap"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: "'Gilroy-SemiBold',Helvetica", fontSize: "11px", lineHeight: "14px" }}
    >{children}</span>
  );
};

const CategoryTag = ({ children }: { children: React.ReactNode }) => (
  <span
    className="flex-shrink-0 inline-flex items-center justify-center px-[4px] py-[1px] rounded-[20px] whitespace-nowrap"
    style={{ background: "#222737", border: "1px solid rgba(108,119,157,0.2)", color: "#6c779d", fontFamily: "'Gilroy-SemiBold',Helvetica", fontSize: "11px", lineHeight: "14px" }}
  >{children}</span>
);

const Divider = () => <div className="w-full flex-shrink-0" style={{ height: "1px", background: BORDER }} />;

const PanelHeader = ({ title, right }: { title: string; right?: React.ReactNode }) => (
  <div
    className="flex items-center justify-between px-[16px] flex-shrink-0"
    style={{ height: "48px", borderBottom: `1px solid ${BORDER}`, background: CARD_BG }}
  >
    <span style={{ fontFamily: "'Gilroy-SemiBold',Helvetica", fontSize: "16px", lineHeight: "24px", color: "#a8b9f4" }}>{title}</span>
    {right}
  </div>
);

/* ── Stat card ── */
const StatCard = ({
  label, mainInt, mainDec, subColor, tags,
}: {
  label: string;
  mainInt: string;
  mainDec?: string;
  subColor?: string;
  tags: React.ReactNode;
}) => (
  <div className="flex-1 flex flex-col gap-[8px] p-[16px] rounded-[16px]" style={{ background: CARD_BG }}>
    <span style={{ fontFamily: "'Gilroy-SemiBold',Helvetica", fontSize: "13px", lineHeight: "14px", color: "#414965" }}>{label}</span>
    <p style={{ fontFamily: "'Gilroy-Medium',Helvetica", fontSize: 0, lineHeight: 0, color: "#a8b9f4" }}>
      <span style={{ fontSize: "20px", lineHeight: "24px", color: "#a8b9f4" }}>{mainInt}</span>
      {mainDec && <span style={{ fontSize: "16px", lineHeight: "24px", color: subColor || "#a8b9f4" }}>{mainDec}</span>}
    </p>
    <div className="flex gap-[4px] flex-wrap items-center">{tags}</div>
  </div>
);

/* ── Cash Flow chart period button ── */
const CF_PERIODS: CfPeriod[] = ["1H", "1D", "1W", "1M", "1Y", "ALL"];

const CfBtn = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    data-testid={`button-cf-period-${label}`}
    className="flex items-center justify-center px-[8px] py-[4px] rounded-[100px] flex-shrink-0 transition-colors"
    style={{ background: active ? "#4a2300" : "transparent" }}
  >
    <span style={{ fontFamily: "'Gilroy-SemiBold',Helvetica", fontSize: "12px", lineHeight: "16px", color: active ? "#ff9500" : "#414965" }}>{label}</span>
  </button>
);

/* ── Cash Flow chart ── */
const Y_TICKS = [5600, 5800, 6000, 6200, 6400, 6600, 7000];

const CashFlowChart = ({ data }: { data: CfPoint[] }) => {
  const crosshairTime = data[Math.floor(data.length * 0.55)]?.time;
  const crosshairInflow = data[Math.floor(data.length * 0.55)]?.inflow ?? 6319;

  return (
    <div className="relative w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 16, right: 56, left: 0, bottom: 56 }}>
          <defs>
            <linearGradient id="cfInflow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#42bf23" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#42bf23" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="cfOutflow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d20344" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#d20344" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={BORDER} strokeDasharray="0" />
          <XAxis
            dataKey="time"
            tick={{ fill: "#6c779d", fontSize: 10, fontFamily: "'Gilroy-SemiBold',Helvetica" }}
            axisLine={false} tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            orientation="right"
            domain={[5600, 7000]}
            ticks={Y_TICKS}
            tick={{ fill: "#6c779d", fontSize: 10, fontFamily: "'Gilroy-SemiBold',Helvetica" }}
            tickFormatter={(v: number) => `$${v}`}
            axisLine={false} tickLine={false}
            width={48}
          />
          <ReferenceLine x={crosshairTime} stroke="#1d2132" strokeWidth={1} />
          <ReferenceLine y={crosshairInflow} stroke="#1d2132" strokeWidth={1} strokeDasharray="0" />
          <Area
            type="monotone" dataKey="inflow" stroke="#42bf23" strokeWidth={1.5}
            fill="url(#cfInflow)" dot={false} isAnimationActive={false} name="Inflow"
          />
          <Area
            type="monotone" dataKey="outflow" stroke="#d20344" strokeWidth={1.5}
            fill="url(#cfOutflow)" dot={false} isAnimationActive={false} name="Outflow"
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Crosshair price label */}
      <div
        className="absolute flex items-center justify-center px-[4px] rounded-[12px]"
        style={{ background: "#4a2300", top: "18px", right: "56px", pointerEvents: "none" }}
      >
        <span style={{ fontFamily: "'Gilroy-SemiBold',Helvetica", fontSize: "10px", lineHeight: "14px", color: "#ff9500" }}>$6319.45</span>
      </div>

      {/* Legend */}
      <div className="absolute bottom-[8px] left-[16px] flex gap-[24px] items-center">
        <div className="flex gap-[8px] items-start">
          <div className="flex-shrink-0 mt-[6px] h-[4px] w-[10px] rounded-[2px]" style={{ background: "#42bf23" }} />
          <div className="flex flex-col">
            <span style={{ fontFamily: "'Gilroy-SemiBold',Helvetica", fontSize: "12px", lineHeight: "14px", color: "#6c779d" }}>Inflow</span>
            <p style={{ fontFamily: "'Gilroy-Medium',Helvetica", fontSize: 0, lineHeight: 0, color: "#a8b9f4" }}>
              <span style={{ fontSize: "16px", lineHeight: "24px" }}>$6,245</span>
              <span style={{ fontSize: "13px", lineHeight: "24px" }}>.23</span>
            </p>
          </div>
        </div>
        <div className="flex gap-[8px] items-start">
          <div className="flex-shrink-0 mt-[6px] h-[4px] w-[10px] rounded-[2px]" style={{ background: "#d20344" }} />
          <div className="flex flex-col">
            <span style={{ fontFamily: "'Gilroy-SemiBold',Helvetica", fontSize: "12px", lineHeight: "14px", color: "#6c779d" }}>Outflow</span>
            <p style={{ fontFamily: "'Gilroy-Medium',Helvetica", fontSize: 0, lineHeight: 0, color: "#a8b9f4" }}>
              <span style={{ fontSize: "16px", lineHeight: "24px" }}>$5,982</span>
              <span style={{ fontSize: "13px", lineHeight: "24px" }}>.40</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Activity + Alert data (static demo) ── */
type RichSpan = { text: string; bold: boolean };
type ActivityItem = { spans: RichSpan[]; time: string; tag: string };

const activityItems: ActivityItem[] = [
  { spans: [{ text: "TraderPro ",  bold: true }, { text: "requested approval for $23K BTC trade", bold: false }], time: "Today, 11:42 AM",    tag: "Trading"  },
  { spans: [{ text: "PaymentBot ", bold: true }, { text: "paid CMC-API $0.0001 via x402 for API",  bold: false }], time: "Mar 28, 12:13 PM",   tag: "Payment"  },
  { spans: [{ text: "You ",        bold: true }, { text: "transferred 5K USDC to ",                bold: false }, { text: "TraderPro",    bold: true }], time: "Mar 25, 1:45 PM",  tag: "You"      },
  { spans: [{ text: "You ",        bold: true }, { text: "deposited 13K USDC to ",                 bold: false }, { text: "Your Account", bold: true }], time: "Mar 22, 7:23 AM",  tag: "You"      },
  { spans: [{ text: "Yield Pilot ",   bold: true }, { text: "staked 1K USDC to AAVE",             bold: false }], time: "Today, 11:42 AM",    tag: "Ai Agent" },
  { spans: [{ text: "Trader-Alpha ",  bold: true }, { text: "staked 1.5K USDC to AAVE",           bold: false }], time: "Today, 12:36 PM",    tag: "Ai Agent" },
];

type AlertItem = { actor?: string; message: string; time: string; requiresAction?: boolean };
const alertItems: AlertItem[] = [
  { actor: "Marketing Agent", message: " is requesting $4.24 for Google Ad spend",    time: "Today, 11:42 AM",  requiresAction: true },
  {                           message: "Monthly debit card spend exceeded 1K threshold", time: "Mar 28, 12:13 PM" },
  {                           message: "Payment Bot balance below monthly 10K threshold", time: "Mar 21, 9:46 AM" },
];

/* ── Account row component ── */
const AccountRow = ({
  name, sub, amount, tagLabel, tagColor,
}: {
  name: string; sub: string; amount: string; tagLabel: string; tagColor: TagColor;
}) => (
  <div className="flex items-start justify-between">
    <div className="flex flex-col gap-[4px] min-w-0 mr-[8px]">
      <span className="truncate" style={{ fontFamily: "'Gilroy-SemiBold',Helvetica", fontSize: "14px", lineHeight: "20px", color: "#a8b9f4" }}>{name}</span>
      <span className="truncate" style={{ fontFamily: "'Gilroy-SemiBold',Helvetica", fontSize: "13px", lineHeight: "16px", color: "#6c779d" }}>{sub}</span>
    </div>
    <div className="flex flex-col items-end gap-[3px] flex-shrink-0">
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 500, fontSize: "14px", lineHeight: "20px", color: "#a8b9f4" }}>{amount}</span>
      <Tag color={tagColor}>{tagLabel}</Tag>
    </div>
  </div>
);

/* ── Main page ── */
export const DashboardPage = (): JSX.Element => {
  const [cfPeriod, setCfPeriod] = useState<CfPeriod>("1H");
  const cfData = cashFlowData[cfPeriod];

  /* ── Real data ── */
  const { wirexAccounts, user } = useAuth();

  const { data: agentsRaw } = useQuery<any[]>({
    queryKey: ["/api/agents"],
    staleTime: 30_000,
  });
  const agents = agentsRaw ?? [];

  /* ── Derived values ── */
  const accountsTotal = useMemo(() => {
    if (wirexAccounts.length === 0) return 0;
    return wirexAccounts
      .filter(a => a.type !== "debit")
      .reduce((sum, a) => sum + parseBalance(a.balance), 0);
  }, [wirexAccounts]);

  const agentTotal = useMemo(
    () => agents.reduce((sum: number, a: any) => sum + parseBalance(a.capitalAmount), 0),
    [agents],
  );

  const totalBalance = accountsTotal + agentTotal;
  const { int: balInt, dec: balDec } = fmtUsd(totalBalance);

  const activeAgents   = agents.filter((a: any) => a.status === "active").length;
  const inactiveAgents = agents.filter((a: any) => a.status === "paused" || a.status === "inactive").length;
  const erroredAgents  = agents.filter((a: any) => a.status === "error" || a.status === "errored").length;
  const totalAgents    = agents.length;

  /* ── Account rows for panel ── */
  const walletAcc = wirexAccounts.find(a => a.type === "wallet");
  const bankAcc   = wirexAccounts.find(a => a.type === "bank");

  // Simulate a small deterministic 24h delta based on balance
  const delta24h = (bal: number) => {
    const change = (bal * 0.0003).toFixed(2);
    return `+$${change} (24h)`;
  };

  const walletBalance = parseBalance(walletAcc?.balance);
  const bankBalance   = parseBalance(bankAcc?.balance);

  /* ── Stat card sub-text for agents ── */
  const agentSubTags = (
    <>
      {inactiveAgents > 0 && <Tag color="orange">{inactiveAgents} Paused</Tag>}
      {erroredAgents  > 0 && <Tag color="red">{erroredAgents} Errored</Tag>}
      {inactiveAgents === 0 && erroredAgents === 0 && activeAgents > 0 && <Tag color="green">All Active</Tag>}
      {totalAgents === 0 && <Tag color="grey">No Agents Yet</Tag>}
    </>
  );

  const agentStatusColor = (status: string): TagColor => {
    if (status === "active")                return "green";
    if (status === "paused" || status === "inactive") return "orange";
    if (status === "graduated")             return "grey";
    return "red";
  };

  const agentStatusLabel = (status: string): string => {
    if (status === "active")                return "Active";
    if (status === "paused" || status === "inactive") return "Inactive";
    if (status === "graduated")             return "Graduated";
    return "Error";
  };

  return (
    <div
      className="flex flex-col gap-[16px] p-[15px] h-full overflow-y-auto rounded-[16px] border border-solid"
      style={{ background: "#11141b", borderColor: BORDER }}
    >

      {/* ── Row 1: Stat cards ── */}
      <div className="flex gap-[16px] flex-shrink-0">

        {/* Total Balance */}
        <StatCard
          label="Total Balance"
          mainInt={totalBalance > 0 ? balInt : "$0"}
          mainDec={totalBalance > 0 ? balDec : ".00"}
          tags={
            totalBalance > 0
              ? <Tag color="green">+$520.31 (24h)</Tag>
              : <Tag color="grey">No accounts yet</Tag>
          }
        />

        {/* Active Agents */}
        <StatCard
          label="Active Agents"
          mainInt={String(activeAgents)}
          mainDec={`/${totalAgents}`}
          subColor="#6c779d"
          tags={agentSubTags}
        />

        {/* Agent Spend */}
        <StatCard
          label="Agent Spend (24h)"
          mainInt="$6,245"
          mainDec=".23"
          tags={<Tag color="grey">21 Transactions</Tag>}
        />

        {/* Policy Alerts */}
        <StatCard
          label="Policy Alerts"
          mainInt="12"
          tags={<Tag color="grey">1 Requires Approval</Tag>}
        />
      </div>

      {/* ── Row 2a: Accounts+Agents (full width) ── */}
      <div className="w-full rounded-[16px] overflow-hidden flex flex-col flex-shrink-0" style={{ background: CARD_BG, height: "380px" }}>
          <PanelHeader title="Accounts and Agents" />
          <div className="flex-1 overflow-y-auto flex flex-col gap-[12px] px-[16px] py-[12px]">

            {/* Wallet account */}
            {walletAcc ? (
              <>
                <AccountRow
                  name="Your Stablecoin Account"
                  sub={fmtAddress(walletAcc.address || user?.walletAddress)}
                  amount={`$${walletBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  tagLabel={delta24h(walletBalance)}
                  tagColor="green"
                />
                <Divider />
              </>
            ) : user?.walletAddress ? (
              <>
                <AccountRow
                  name="Your Stablecoin Account"
                  sub={fmtAddress(user.walletAddress)}
                  amount="$0.00"
                  tagLabel="+$0.00 (24h)"
                  tagColor="grey"
                />
                <Divider />
              </>
            ) : null}

            {/* Bank account */}
            {bankAcc && (
              <>
                <AccountRow
                  name="Your Bank Account"
                  sub={fmtIban(bankAcc.iban)}
                  amount={`$${bankBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  tagLabel={`-$${(bankBalance * 0.018).toFixed(2)} (24h)`}
                  tagColor="red"
                />
                {agents.length > 0 && <Divider />}
              </>
            )}

            {/* Agent accounts */}
            {agents.map((agent: any, i: number) => {
              const cap = parseBalance(agent.capitalAmount);
              const typeKey = (agent.type ?? agent.category ?? "").toLowerCase();
              const categoryLabel = CATEGORY_LABEL[typeKey] ?? (agent.type ?? agent.category ?? "Agent");
              return (
                <div key={agent.id} className="flex flex-col gap-[12px]">
                  <AccountRow
                    name={agent.name}
                    sub={categoryLabel}
                    amount={`$${cap.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    tagLabel={agentStatusLabel(agent.status)}
                    tagColor={agentStatusColor(agent.status)}
                  />
                  {i < agents.length - 1 && <Divider />}
                </div>
              );
            })}

            {/* Empty state */}
            {!walletAcc && !user?.walletAddress && agents.length === 0 && (
              <div className="flex-1 flex items-center justify-center">
                <span style={{ fontFamily: "'Gilroy-SemiBold',Helvetica", fontSize: "13px", color: "#414965" }}>Connect your wallet to see accounts</span>
              </div>
            )}
          </div>
      </div>

      {/* ── Row 2b: Cash Flow (full width) ── */}
      <div className="w-full rounded-[16px] overflow-hidden flex flex-col flex-shrink-0" style={{ background: CARD_BG, height: "380px" }}>
        <PanelHeader
          title="Cash Flow"
          right={
            <div className="flex gap-[2px] p-[2px] rounded-[400px]" style={{ background: "#06070a" }}>
              {CF_PERIODS.map(p => <CfBtn key={p} label={p} active={cfPeriod === p} onClick={() => setCfPeriod(p)} />)}
            </div>
          }
        />
        <div className="flex-1 overflow-hidden">
          <CashFlowChart data={cfData} />
        </div>
      </div>

      {/* ── Row 3: Recent Activity | Attention Required ── */}
      <div className="flex gap-[16px] flex-shrink-0">

        {/* Recent Activity */}
        <div className="flex-1 rounded-[16px] overflow-hidden flex flex-col" style={{ background: CARD_BG, height: "380px" }}>
          <div
            className="flex items-center justify-between px-[16px] flex-shrink-0"
            style={{ height: "48px", borderBottom: `1px solid ${BORDER}`, background: "rgba(10,12,16,0.8)", backdropFilter: "blur(10px)" }}
          >
            <span style={{ fontFamily: "'Gilroy-SemiBold',Helvetica", fontSize: "16px", lineHeight: "24px", color: "#a8b9f4" }}>Recent Activity</span>
          </div>
          <div className="flex-1 overflow-y-auto flex flex-col gap-[12px] px-[16px] py-[12px]">
            {activityItems.map((item, i) => (
              <div key={i} className="flex flex-col gap-[12px]">
                <div className="flex flex-col gap-[4px]">
                  <p style={{ fontFamily: "'Gilroy-SemiBold',Helvetica", fontSize: "14px", lineHeight: "20px", color: "#a8b9f4" }}>
                    {item.spans.map((s, j) => (
                      <span key={j} style={{ color: s.bold ? "#a8b9f4" : "#6c779d" }}>{s.text}</span>
                    ))}
                  </p>
                  <div className="flex items-center gap-[8px]">
                    <span style={{ fontFamily: "'Gilroy-SemiBold',Helvetica", fontSize: "13px", lineHeight: "16px", color: "#6c779d" }}>{item.time}</span>
                    <CategoryTag>{item.tag}</CategoryTag>
                  </div>
                </div>
                {i < activityItems.length - 1 && <Divider />}
              </div>
            ))}
          </div>
        </div>

        {/* Attention Required */}
        <div className="flex-1 rounded-[16px] overflow-hidden flex flex-col" style={{ background: CARD_BG, height: "380px" }}>
          <PanelHeader
            title="Attention Required"
            right={<Tag color="grey">3 Total</Tag>}
          />
          <div className="flex-1 overflow-y-auto flex flex-col gap-[12px] px-[16px] py-[12px]">
            {alertItems.map((item, i) => (
              <div key={i} className="flex flex-col gap-[12px]">
                <div className="flex flex-col gap-[8px]">
                  <div className="flex flex-col gap-[4px]">
                    <p style={{ fontFamily: "'Gilroy-SemiBold',Helvetica", fontSize: "14px", lineHeight: "20px", color: "#a8b9f4" }}>
                      {item.actor && <span>{item.actor}</span>}
                      <span style={{ color: item.actor ? "#6c779d" : "#a8b9f4" }}>{item.message}</span>
                    </p>
                    <span style={{ fontFamily: "'Gilroy-SemiBold',Helvetica", fontSize: "13px", lineHeight: "16px", color: "#6c779d" }}>{item.time}</span>
                  </div>
                  {item.requiresAction && (
                    <div className="flex gap-[8px]">
                      <button
                        data-testid="button-approve-alert"
                        className="flex items-center gap-[4px] px-[10px] py-[4px] rounded-[100px] transition-opacity hover:opacity-80"
                        style={{ background: "#123509" }}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M3 8.5L6.5 12L13 5" stroke="#42bf23" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span style={{ fontFamily: "'Gilroy-SemiBold',Helvetica", fontSize: "12px", lineHeight: "16px", color: "#42bf23" }}>Approve</span>
                      </button>
                      <button
                        data-testid="button-deny-alert"
                        className="flex items-center gap-[4px] px-[10px] py-[4px] rounded-[100px] transition-opacity hover:opacity-80"
                        style={{ background: "#350011" }}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5" stroke="#d20344" strokeWidth="1.4" strokeLinecap="round"/>
                        </svg>
                        <span style={{ fontFamily: "'Gilroy-SemiBold',Helvetica", fontSize: "12px", lineHeight: "16px", color: "#d20344" }}>Deny</span>
                      </button>
                    </div>
                  )}
                </div>
                {i < alertItems.length - 1 && <Divider />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
