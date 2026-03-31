import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

type Period = "1D" | "7D" | "30D" | "90D";

const periodData: Record<Period, {
  totalBalance: string;
  totalSpend: string;
  totalSaved: string;
  yield: string;
  yieldPct: string;
  spendDelta: string;
  savedDelta: string;
  spendCategories: { label: string; amount: string; pct: number; color: string }[];
  subscriptions: { name: string; icon: string; cycle: string; amount: string; status: "active" | "low" | "inactive" }[];
  transactions: { icon: string; name: string; date: string; category: string; amount: string; type: "debit" | "credit"; account: string }[];
}> = {
  "1D": {
    totalBalance: "$47,832.10",
    totalSpend: "$312.40",
    totalSaved: "$80.00",
    yield: "$18.22",
    yieldPct: "+0.04%",
    spendDelta: "-$312.40",
    savedDelta: "+$80.00",
    spendCategories: [
      { label: "AI Agents", amount: "$148.20", pct: 47, color: "#7631ee" },
      { label: "Subscriptions", amount: "$89.00", pct: 28, color: "#a8b9f4" },
      { label: "Transfers", amount: "$50.00", pct: 16, color: "#42bf23" },
      { label: "Other", amount: "$25.20", pct: 9, color: "#414965" },
    ],
    subscriptions: [
      { name: "AlphaFlow Agent", icon: "🤖", cycle: "Daily", amount: "$4.80", status: "active" },
      { name: "Yield Pilot", icon: "📈", cycle: "Daily", amount: "$2.40", status: "active" },
      { name: "Risk Sentinel", icon: "🛡️", cycle: "Daily", amount: "$1.60", status: "low" },
    ],
    transactions: [
      { icon: "🤖", name: "AlphaFlow — ETH Buy", date: "Today, 11:42 AM", category: "AI Agent", amount: "-$148.20", type: "debit", account: "AI Wallet" },
      { icon: "📡", name: "Brain Premium", date: "Today, 10:15 AM", category: "Subscription", amount: "-$89.00", type: "debit", account: "Neobank" },
      { icon: "💸", name: "Yield Harvest", date: "Today, 08:00 AM", category: "Yield", amount: "+$18.22", type: "credit", account: "AI Wallet" },
      { icon: "🏦", name: "Bank Transfer", date: "Today, 07:30 AM", category: "Transfer", amount: "+$80.00", type: "credit", account: "Neobank" },
    ],
  },
  "7D": {
    totalBalance: "$47,832.10",
    totalSpend: "$2,148.60",
    totalSaved: "$560.00",
    yield: "$127.54",
    yieldPct: "+0.27%",
    spendDelta: "-$2,148.60",
    savedDelta: "+$560.00",
    spendCategories: [
      { label: "AI Agents", amount: "$1,037.00", pct: 48, color: "#7631ee" },
      { label: "Subscriptions", amount: "$623.00", pct: 29, color: "#a8b9f4" },
      { label: "Transfers", amount: "$350.00", pct: 16, color: "#42bf23" },
      { label: "Other", amount: "$138.60", pct: 7, color: "#414965" },
    ],
    subscriptions: [
      { name: "AlphaFlow Agent", icon: "🤖", cycle: "Daily", amount: "$33.60", status: "active" },
      { name: "Yield Pilot", icon: "📈", cycle: "Daily", amount: "$16.80", status: "active" },
      { name: "Risk Sentinel", icon: "🛡️", cycle: "Daily", amount: "$11.20", status: "active" },
      { name: "Brain Premium", icon: "🧠", cycle: "Monthly", amount: "$89.00", status: "low" },
      { name: "TaskForge Pro", icon: "⚙️", cycle: "Weekly", amount: "$24.00", status: "inactive" },
    ],
    transactions: [
      { icon: "🤖", name: "AlphaFlow — BTC Rebalance", date: "Today, 11:42 AM", category: "AI Agent", amount: "-$412.00", type: "debit", account: "AI Wallet" },
      { icon: "📈", name: "Yield Pilot — USDC Farm", date: "Yesterday, 09:10 AM", category: "AI Agent", amount: "-$220.00", type: "debit", account: "AI Wallet" },
      { icon: "💸", name: "Yield Harvest", date: "Yesterday, 08:00 AM", category: "Yield", amount: "+$127.54", type: "credit", account: "AI Wallet" },
      { icon: "🏦", name: "Payroll Deposit", date: "Mon, 09:00 AM", category: "Income", amount: "+$3,200.00", type: "credit", account: "Neobank" },
      { icon: "📡", name: "Brain Premium", date: "Sun, 10:00 AM", category: "Subscription", amount: "-$89.00", type: "debit", account: "Neobank" },
      { icon: "🔄", name: "Bank → Wallet Transfer", date: "Sat, 02:15 PM", category: "Transfer", amount: "-$500.00", type: "debit", account: "Neobank" },
    ],
  },
  "30D": {
    totalBalance: "$47,832.10",
    totalSpend: "$9,214.40",
    totalSaved: "$2,400.00",
    yield: "$548.30",
    yieldPct: "+1.16%",
    spendDelta: "-$9,214.40",
    savedDelta: "+$2,400.00",
    spendCategories: [
      { label: "AI Agents", amount: "$4,432.00", pct: 48, color: "#7631ee" },
      { label: "Subscriptions", amount: "$2,670.00", pct: 29, color: "#a8b9f4" },
      { label: "Transfers", amount: "$1,500.00", pct: 16, color: "#42bf23" },
      { label: "Other", amount: "$612.40", pct: 7, color: "#414965" },
    ],
    subscriptions: [
      { name: "AlphaFlow Agent", icon: "🤖", cycle: "Daily", amount: "$144.00", status: "active" },
      { name: "Yield Pilot", icon: "📈", cycle: "Daily", amount: "$72.00", status: "active" },
      { name: "Risk Sentinel", icon: "🛡️", cycle: "Daily", amount: "$48.00", status: "active" },
      { name: "Brain Premium", icon: "🧠", cycle: "Monthly", amount: "$89.00", status: "active" },
      { name: "TaskForge Pro", icon: "⚙️", cycle: "Weekly", amount: "$96.00", status: "low" },
      { name: "Signal Seer", icon: "📡", cycle: "Monthly", amount: "$29.00", status: "inactive" },
    ],
    transactions: [
      { icon: "🤖", name: "AlphaFlow — ETH Accumulate", date: "Today, 11:42 AM", category: "AI Agent", amount: "-$1,200.00", type: "debit", account: "AI Wallet" },
      { icon: "💸", name: "Monthly Yield Harvest", date: "Mar 28, 08:00 AM", category: "Yield", amount: "+$548.30", type: "credit", account: "AI Wallet" },
      { icon: "🏦", name: "Payroll Deposit", date: "Mar 25, 09:00 AM", category: "Income", amount: "+$6,400.00", type: "credit", account: "Neobank" },
      { icon: "🔄", name: "Wallet Top-Up", date: "Mar 20, 02:15 PM", category: "Transfer", amount: "-$1,500.00", type: "debit", account: "Neobank" },
      { icon: "📈", name: "Yield Pilot — Rebalance", date: "Mar 15, 10:30 AM", category: "AI Agent", amount: "-$880.00", type: "debit", account: "AI Wallet" },
      { icon: "🛡️", name: "Risk Sentinel — Hedge", date: "Mar 10, 03:00 PM", category: "AI Agent", amount: "-$640.00", type: "debit", account: "AI Wallet" },
      { icon: "📡", name: "Brain Premium", date: "Mar 1, 10:00 AM", category: "Subscription", amount: "-$89.00", type: "debit", account: "Neobank" },
    ],
  },
  "90D": {
    totalBalance: "$47,832.10",
    totalSpend: "$27,643.20",
    totalSaved: "$7,200.00",
    yield: "$1,644.90",
    yieldPct: "+3.47%",
    spendDelta: "-$27,643.20",
    savedDelta: "+$7,200.00",
    spendCategories: [
      { label: "AI Agents", amount: "$13,269.00", pct: 48, color: "#7631ee" },
      { label: "Subscriptions", amount: "$8,010.00", pct: 29, color: "#a8b9f4" },
      { label: "Transfers", amount: "$4,500.00", pct: 16, color: "#42bf23" },
      { label: "Other", amount: "$1,864.20", pct: 7, color: "#414965" },
    ],
    subscriptions: [
      { name: "AlphaFlow Agent", icon: "🤖", cycle: "Daily", amount: "$432.00", status: "active" },
      { name: "Yield Pilot", icon: "📈", cycle: "Daily", amount: "$216.00", status: "active" },
      { name: "Risk Sentinel", icon: "🛡️", cycle: "Daily", amount: "$144.00", status: "active" },
      { name: "Brain Premium", icon: "🧠", cycle: "Monthly", amount: "$267.00", status: "active" },
      { name: "TaskForge Pro", icon: "⚙️", cycle: "Weekly", amount: "$288.00", status: "active" },
      { name: "Signal Seer", icon: "📡", cycle: "Monthly", amount: "$87.00", status: "inactive" },
    ],
    transactions: [
      { icon: "🤖", name: "AlphaFlow — Q1 Rebalance", date: "Today, 11:42 AM", category: "AI Agent", amount: "-$3,600.00", type: "debit", account: "AI Wallet" },
      { icon: "💸", name: "Q1 Yield Harvest", date: "Mar 28, 08:00 AM", category: "Yield", amount: "+$1,644.90", type: "credit", account: "AI Wallet" },
      { icon: "🏦", name: "Q1 Payroll Total", date: "Mar 25", category: "Income", amount: "+$19,200.00", type: "credit", account: "Neobank" },
      { icon: "🔄", name: "Wallet Funding", date: "Mar 1", category: "Transfer", amount: "-$4,500.00", type: "debit", account: "Neobank" },
      { icon: "📈", name: "Yield Pilot — DeFi Deploy", date: "Feb 15", category: "AI Agent", amount: "-$2,640.00", type: "debit", account: "AI Wallet" },
      { icon: "🛡️", name: "Risk Sentinel — Hedge", date: "Jan 30", category: "AI Agent", amount: "-$1,920.00", type: "debit", account: "AI Wallet" },
      { icon: "⚙️", name: "TaskForge Pro — API Calls", date: "Jan 15", category: "AI Agent", amount: "-$960.00", type: "debit", account: "AI Wallet" },
      { icon: "📡", name: "Brain Premium × 3 Mo", date: "Jan 1", category: "Subscription", amount: "-$267.00", type: "debit", account: "Neobank" },
    ],
  },
};

const HDivider = () => <div className="h-px w-full flex-shrink-0" style={{ background: "#1d2132" }} />;

const StatCard = ({
  label,
  value,
  delta,
  deltaPositive,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaPositive?: boolean;
}) => (
  <div
    className="flex flex-col gap-[8px] p-[16px] rounded-[16px] flex-1 min-w-0"
    style={{ background: "#0a0c10", border: "1px solid #1d2132" }}
  >
    <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[12px] leading-[16px] uppercase tracking-widest whitespace-nowrap">
      {label}
    </span>
    <span className="[font-family:'Gilroy-Bold',Helvetica] text-white text-[22px] leading-[28px] whitespace-nowrap">
      {value}
    </span>
    {delta && (
      <span
        className="[font-family:'Gilroy-SemiBold',Helvetica] text-[12px] leading-[16px]"
        style={{ color: deltaPositive ? "#42bf23" : "#d20344" }}
      >
        {delta}
      </span>
    )}
  </div>
);

const PeriodBtn = ({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    data-testid={`button-period-${label}`}
    className="flex items-center justify-center px-[12px] py-[6px] rounded-[100px] transition-all flex-shrink-0"
    style={
      active
        ? { background: "#1d2132", border: "1px solid #414965" }
        : { background: "transparent", border: "1px solid transparent" }
    }
  >
    <span
      className="[font-family:'Gilroy-SemiBold',Helvetica] text-[13px] leading-[18px] whitespace-nowrap"
      style={{ color: active ? "#a8b9f4" : "#414965" }}
    >
      {label}
    </span>
  </button>
);

export const DashboardPage = (): JSX.Element => {
  const [period, setPeriod] = useState<Period>("30D");
  const d = periodData[period];

  const subTotal = d.subscriptions.reduce((sum, s) => {
    const n = parseFloat(s.amount.replace(/[^0-9.]/g, ""));
    return sum + n;
  }, 0);

  return (
    <div className="flex flex-col h-full bg-[#11141b] rounded-[16px] border border-solid border-[#1d2132] overflow-hidden">

      {/* ── Header bar ── */}
      <div
        className="flex items-center gap-[12px] px-[16px] flex-shrink-0"
        style={{ height: "56px", borderBottom: "1px solid #1d2132" }}
      >
        <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[18px] leading-[24px] flex-1">
          Dashboard
        </span>

        {/* Period selector */}
        <div
          className="flex items-center gap-[2px] p-[3px] rounded-[100px]"
          style={{ background: "#0a0c10", border: "1px solid #1d2132" }}
        >
          {(["1D", "7D", "30D", "90D"] as Period[]).map((p) => (
            <PeriodBtn key={p} label={p} active={period === p} onClick={() => setPeriod(p)} />
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[16px] p-[16px] pb-8">

          {/* ── Stat cards strip ── */}
          <div className="flex gap-[12px]">
            <StatCard label="Total Balance" value={d.totalBalance} />
            <StatCard label="Total Spend" value={d.totalSpend} delta={d.spendDelta} deltaPositive={false} />
            <StatCard label="Total Saved" value={d.totalSaved} delta={d.savedDelta} deltaPositive={true} />
            <StatCard label="Yield Earned" value={d.yield} delta={d.yieldPct} deltaPositive={true} />
          </div>

          {/* ── Middle three-column section ── */}
          <div className="grid gap-[12px]" style={{ gridTemplateColumns: "1fr 1fr 2fr" }}>

            {/* ── Left: Spending by Category ── */}
            <div
              className="flex flex-col rounded-[16px] overflow-hidden"
              style={{ background: "#0a0c10", border: "1px solid #1d2132" }}
            >
              <div className="flex items-center justify-between px-[16px] py-[12px]" style={{ borderBottom: "1px solid #1d2132" }}>
                <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[14px] leading-[20px]">
                  Spending by Category
                </span>
              </div>
              <div className="flex flex-col gap-[14px] p-[16px] flex-1">
                {d.spendCategories.map((cat) => (
                  <div key={cat.label} className="flex flex-col gap-[6px]">
                    <div className="flex items-center justify-between">
                      <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[12px] leading-[16px]">
                        {cat.label}
                      </span>
                      <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[12px] leading-[16px]">
                        {cat.amount}
                      </span>
                    </div>
                    <div className="w-full h-[5px] rounded-full overflow-hidden" style={{ background: "#1d2132" }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${cat.pct}%`, background: cat.color }}
                      />
                    </div>
                    <span className="[font-family:'Gilroy-Medium',Helvetica] text-[#414965] text-[11px] leading-[14px]">
                      {cat.pct}% of total
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Center: Subscriptions ── */}
            <div
              className="flex flex-col rounded-[16px] overflow-hidden"
              style={{ background: "#0a0c10", border: "1px solid #1d2132" }}
            >
              <div className="flex items-center justify-between px-[16px] py-[12px]" style={{ borderBottom: "1px solid #1d2132" }}>
                <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[14px] leading-[20px]">
                  Subscriptions
                </span>
              </div>
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex flex-col flex-1">
                  {d.subscriptions.map((sub, i) => (
                    <div key={sub.name}>
                      <div className="flex items-center gap-[10px] px-[16px] py-[10px] hover:bg-[#111822] transition-colors cursor-pointer">
                        <div
                          className="w-[32px] h-[32px] rounded-[8px] flex items-center justify-center flex-shrink-0 text-[14px]"
                          style={{ background: "#1d2132" }}
                        >
                          {sub.icon}
                        </div>
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-white text-[13px] leading-[18px] truncate">
                            {sub.name}
                          </span>
                          <span className="[font-family:'Gilroy-Medium',Helvetica] text-[#6c779d] text-[11px] leading-[14px]">
                            {sub.cycle}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-[3px] flex-shrink-0">
                          <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[12px] leading-[16px]">
                            {sub.amount}
                          </span>
                          {sub.status === "active" && (
                            <span className="text-[9px] px-[6px] py-[2px] rounded-[4px]" style={{ background: "rgba(66,191,35,0.12)", color: "#42bf23", fontFamily: "'Gilroy-SemiBold',Helvetica" }}>
                              Active
                            </span>
                          )}
                          {sub.status === "low" && (
                            <span className="text-[9px] px-[6px] py-[2px] rounded-[4px]" style={{ background: "rgba(255,149,0,0.12)", color: "#ff9500", fontFamily: "'Gilroy-SemiBold',Helvetica" }}>
                              Low
                            </span>
                          )}
                          {sub.status === "inactive" && (
                            <span className="text-[9px] px-[6px] py-[2px] rounded-[4px]" style={{ background: "rgba(108,119,157,0.12)", color: "#6c779d", fontFamily: "'Gilroy-SemiBold',Helvetica" }}>
                              Paused
                            </span>
                          )}
                        </div>
                      </div>
                      {i < d.subscriptions.length - 1 && <HDivider />}
                    </div>
                  ))}
                </div>
                {/* Total row */}
                <div style={{ borderTop: "1px solid #1d2132" }}>
                  <div className="flex items-center justify-between px-[16px] py-[10px]">
                    <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[12px] leading-[16px]">
                      Total
                    </span>
                    <span className="[font-family:'Gilroy-Bold',Helvetica] text-[#a8b9f4] text-[13px] leading-[18px]">
                      ${subTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Right: Recent Transactions ── */}
            <div
              className="flex flex-col rounded-[16px] overflow-hidden"
              style={{ background: "#0a0c10", border: "1px solid #1d2132" }}
            >
              <div className="flex items-center justify-between px-[16px] py-[12px]" style={{ borderBottom: "1px solid #1d2132" }}>
                <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[14px] leading-[20px]">
                  Recent Transactions
                </span>
                <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#414965] text-[12px] leading-[16px]">
                  {d.transactions.length} transactions
                </span>
              </div>

              {/* Column headers */}
              <div
                className="flex items-center gap-[12px] px-[16px] py-[8px]"
                style={{ borderBottom: "1px solid #1d2132" }}
              >
                <span className="flex-1 [font-family:'Gilroy-SemiBold',Helvetica] text-[#414965] text-[10px] leading-[14px] uppercase tracking-widest">
                  Transaction
                </span>
                <span className="w-[72px] text-right [font-family:'Gilroy-SemiBold',Helvetica] text-[#414965] text-[10px] leading-[14px] uppercase tracking-widest flex-shrink-0">
                  Account
                </span>
                <span className="w-[80px] text-right [font-family:'Gilroy-SemiBold',Helvetica] text-[#414965] text-[10px] leading-[14px] uppercase tracking-widest flex-shrink-0">
                  Amount
                </span>
              </div>

              <div className="flex flex-col">
                {d.transactions.map((tx, i) => (
                  <div key={i}>
                    <div
                      className="flex items-center gap-[12px] px-[16px] py-[12px] hover:bg-[#111822] transition-colors cursor-pointer"
                    >
                      {/* Icon */}
                      <div
                        className="w-[36px] h-[36px] rounded-[10px] flex items-center justify-center flex-shrink-0 text-[16px]"
                        style={{ background: "#1d2132" }}
                      >
                        {tx.icon}
                      </div>

                      {/* Name + date */}
                      <div className="flex flex-col flex-1 min-w-0">
                        <div className="flex items-center gap-[6px] min-w-0">
                          <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-white text-[13px] leading-[18px] truncate">
                            {tx.name}
                          </span>
                          <span
                            className="flex-shrink-0 text-[9px] px-[5px] py-[2px] rounded-[3px]"
                            style={{ background: "#1d2132", color: "#6c779d", fontFamily: "'Gilroy-SemiBold',Helvetica" }}
                          >
                            {tx.category}
                          </span>
                        </div>
                        <span className="[font-family:'Gilroy-Medium',Helvetica] text-[#414965] text-[11px] leading-[14px]">
                          {tx.date}
                        </span>
                      </div>

                      {/* Account */}
                      <span className="w-[72px] text-right [font-family:'Gilroy-Medium',Helvetica] text-[#6c779d] text-[12px] leading-[16px] flex-shrink-0">
                        {tx.account}
                      </span>

                      {/* Amount */}
                      <span
                        className="w-[80px] text-right [font-family:'Gilroy-SemiBold',Helvetica] text-[13px] leading-[18px] flex-shrink-0"
                        style={{ color: tx.type === "credit" ? "#42bf23" : "#d20344" }}
                      >
                        {tx.amount}
                      </span>
                    </div>
                    {i < d.transactions.length - 1 && <HDivider />}
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </ScrollArea>
    </div>
  );
};
