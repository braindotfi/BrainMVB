import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCurrency } from "@/lib/currencyContext";
import { useAuth } from "@/lib/authContext";
import { BrainBillsInbox } from "@/components/BrainBillsInbox";
import { TransactionDetailPopup } from "@/components/TransactionDetailPopup";
import { AccountDetailPopup } from "@/components/AccountDetailPopup";
import { Info, ChevronRight } from "lucide-react";

function timeAgo(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 10) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  return `${diffD}d ago`;
}

import { ICONS } from "@/assets/figma-icons";
const IMG_DOT = ICONS.activity_dot;

// ─── brain-core Ledger accounts (via the BFF proxy) ──────────────────────────
// Shape mirrors brain-core's Account schema (subset we render).
type AccountKind = "bank_checking" | "bank_savings" | "card" | "loan" | "line_of_credit" | "onchain" | "payment_processor";
interface BrainAccountDTO {
  id: string;
  name: string;
  account_type: AccountKind;
  currency: string;
  institution?: string | null;
  current_balance?: string | null;
}
interface BrainAccountsResponse {
  accounts: BrainAccountDTO[];
  next_cursor?: string | null;
}

const KIND_LABEL: Record<AccountKind, string> = {
  bank_checking: "Bank checking",
  bank_savings: "Savings",
  card: "Card",
  loan: "Loan",
  line_of_credit: "Line of credit",
  onchain: "On-chain balance",
  payment_processor: "Payment processor",
};

type AccountRow = { id?: string; name: string; sub: string; sub2: string; balance: string | number; currency?: string };

/** Render a balance honestly: USD (and other fiat) through the currency
 *  formatter; a non-fiat token balance (ETH) in its native units. Never run a
 *  token amount through the USD→display-currency converter. Mirrors
 *  AccountDetailPopup.balanceLabel. Rows with no currency (e.g. the mixed
 *  totals row) fall back to the formatter. */
function rowBalanceLabel(row: AccountRow, format: (n: string | number) => string): string {
  if (!row.currency || row.currency === "USD") return format(row.balance);
  const value = Number(row.balance);
  const trimmed = Number.isFinite(value) ? String(value) : String(row.balance);
  return `${trimmed} ${row.currency}`;
}

/** Map brain-core Ledger accounts to the widget's row shape, appending a totals row.
 *  Balances are treated as USD (the demo tenant's source currency); useCurrency().format
 *  converts to the active display currency. */
function mapBrainAccounts(list: BrainAccountDTO[]): AccountRow[] {
  const rows: AccountRow[] = list.map((a) => {
    const label = KIND_LABEL[a.account_type] ?? a.account_type;
    const value = a.current_balance != null ? Number(a.current_balance) : 0;
    return {
      id: a.id,
      name: a.name,
      sub: a.institution ?? label,
      sub2: a.institution ? label : "",
      balance: Number.isFinite(value) ? value : 0,
      currency: a.currency,
    };
  });
  const total = list.reduce((sum, a) => sum + (a.current_balance != null ? Number(a.current_balance) || 0 : 0), 0);
  rows.push({ name: "Account Totals", sub: "Across bank, crypto and agents", sub2: "", balance: total });
  return rows;
}

// ─── brain-core Ledger transactions (via the BFF proxy) ─────────────────────
interface BrainTransactionDTO {
  id: string;
  amount: string;
  currency: string;
  direction: "inflow" | "outflow" | "transfer" | "adjustment";
  transaction_date: string;
  counterparty_id?: string | null;
  description_normalized?: string | null;
  description_raw?: string | null;
}
interface BrainTransactionsResponse {
  transactions: BrainTransactionDTO[];
  next_cursor?: string | null;
}

type TxRow = { id: string; label: string; date: string; amount: number; positive: boolean };

function formatTxDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function mapBrainTransactions(list: BrainTransactionDTO[]): TxRow[] {
  return list.map((t) => {
    const positive = t.direction === "inflow";
    const value = Number(t.amount);
    return {
      id: t.id,
      label: t.description_normalized ?? t.description_raw ?? (positive ? "Incoming payment" : "Outgoing payment"),
      date: formatTxDate(t.transaction_date),
      amount: Number.isFinite(value) ? Math.abs(value) : 0,
      positive,
    };
  });
}

const Divider = () => (
  <div className="h-px shrink-0 w-full" style={{ background: "#1d2132" }} />
);

const WidgetHeader = ({ title, count }: { title: string; count?: number }) => (
  <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
    <div className="flex flex-1 gap-[8px] items-center min-w-px relative">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px] whitespace-nowrap">{title}</p>
      {typeof count === "number" && (
        <div className="bg-[#414965] flex flex-col items-center justify-center min-w-[16px] p-[2px] relative rounded-[4px] shrink-0">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[12px] text-[#a8b9f4] text-[12px] text-center whitespace-nowrap">{count}</p>
        </div>
      )}
    </div>
  </div>
);

const WidgetCard = ({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) => (
  <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
    <WidgetHeader title={title} count={count} />
    <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
      <div className="flex flex-col gap-[8px] items-start relative shrink-0 w-full">
        {children}
      </div>
    </div>
  </div>
);

// ─── Overdue receivables (live) - replaces the static "2 Invoices are late" banner ──
// Money owed TO the business that is past due. Excludes AP payables (those are the
// "Bills, let Brain decide" inbox). Renders nothing when nothing is overdue.
interface InvoiceLite {
  id: string;
  counterparty_id: string;
  amount_due: string;
  due_date?: string | null;
  status: string;
  metadata?: { scenario?: string } | null;
}
interface InvoicesLiteResponse { invoices: InvoiceLite[] }
interface CounterpartyLite { id: string; name?: string | null }
interface CounterpartiesLiteResponse { counterparties: CounterpartyLite[] }

function daysLate(due?: string | null): number {
  if (!due) return 0;
  const t = new Date(due).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

const OverdueInvoicesBanner = ({ format }: { format: (a: string | number) => string }) => {
  const { data: invData } = useQuery<InvoicesLiteResponse>({
    queryKey: ["/api/brain/ledger/invoices"],
    retry: false,
  });
  const { data: cpData } = useQuery<CounterpartiesLiteResponse>({
    queryKey: ["/api/brain/ledger/counterparties"],
    retry: false,
  });

  const overdue = (invData?.invoices ?? []).filter(
    (i) => i.status === "overdue" && i.metadata?.scenario !== "ap",
  );
  if (overdue.length === 0) return null;

  const nameOf = (id: string) => cpData?.counterparties.find((c) => c.id === id)?.name ?? "a customer";
  const detail = overdue
    .slice(0, 3)
    .map((i) => `${format(Number(i.amount_due))} from ${nameOf(i.counterparty_id)} (${daysLate(i.due_date)} days late)`)
    .join(" and ");

  return (
    <div className="bg-[#4a2300] border border-[rgba(255,148,0,0.2)] border-solid content-stretch flex items-center p-[8px] relative rounded-[12px] shrink-0 w-full">
      <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-start min-w-px relative">
        <Info className="relative shrink-0 size-[16px] text-[#ff9400]" />
        <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start justify-center leading-[16px] min-w-px not-italic relative text-[#ff9400] text-[14px]">
          <p className="[font-family:'Gilroy',sans-serif] font-bold relative shrink-0 uppercase w-full">
            {overdue.length} invoice{overdue.length === 1 ? "" : "s"} overdue!
          </p>
          <p className="[font-family:'Gilroy',sans-serif] font-medium relative shrink-0 w-full">
            {detail}.
          </p>
        </div>
      </div>
    </div>
  );
};

// ─── Income summary (live) - monthly inflow + top customers from the Ledger ──
// Derived from brain-core ledger inflow transactions + counterparties for names.
// Falls back to static copy only when no transaction data is reachable at all.
function summarizeIncome(
  txs: BrainTransactionDTO[],
): { monthly: number; count: number; topCpIds: string[]; share: number } | null {
  const inflows = txs.filter((t) => t.direction === "inflow");
  if (inflows.length === 0) return null;
  const months = new Set<string>();
  const byCp = new Map<string, number>();
  let total = 0;
  for (const t of inflows) {
    const amt = Number(t.amount);
    if (!Number.isFinite(amt)) continue;
    total += amt;
    months.add(t.transaction_date.slice(0, 7)); // YYYY-MM
    const cp = t.counterparty_id ?? "-";
    byCp.set(cp, (byCp.get(cp) ?? 0) + amt);
  }
  const ranked = Array.from(byCp.entries()).sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, 3);
  const share = total > 0 ? Math.round((top.reduce((s, [, v]) => s + v, 0) / total) * 100) : 0;
  return { monthly: total / Math.max(1, months.size), count: byCp.size, topCpIds: top.map(([id]) => id), share };
}

const INCOME_FALLBACK =
  "No income recorded yet. This populates from your ledger as money comes in.";

const IncomeSummary = ({ format, onCount }: { format: (a: string | number) => string; onCount?: (n: number) => void }) => {
  const { data: txData } = useQuery<BrainTransactionsResponse>({
    queryKey: ["/api/brain/ledger/transactions"],
    retry: false,
  });
  const { data: cpData } = useQuery<CounterpartiesLiteResponse>({
    queryKey: ["/api/brain/ledger/counterparties"],
    retry: false,
  });

  const s = txData?.transactions ? summarizeIncome(txData.transactions) : null;
  const count = s ? s.count : 0;
  const text = (() => {
    if (!s) return INCOME_FALLBACK;
    const nameOf = (id: string) => cpData?.counterparties.find((c) => c.id === id)?.name ?? "a customer";
    const names = s.topCpIds.map(nameOf);
    const joined =
      names.length <= 1
        ? names[0] ?? "one customer"
        : names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
    const verb = names.length > 1 ? "are" : "is";
    const tail = s.share >= 99 ? ", essentially all your revenue" : `, together about ${s.share}% of your revenue`;
    return `About ${format(Math.round(s.monthly))} a month from ${s.count} customer${s.count === 1 ? "" : "s"}. Your biggest ${verb} ${joined}${tail}.`;
  })();

  useEffect(() => {
    onCount?.(count);
  }, [count, onCount]);

  return (
    <div className="border border-[#1d2132] border-solid content-stretch flex items-center p-[8px] relative rounded-[12px] shrink-0 w-full">
      <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-start min-w-px relative">
        <Info className="relative shrink-0 size-[16px] text-[#6c779d]" />
        <p className="[word-break:break-word] flex-[1_0_0] [font-family:'Gilroy',sans-serif] font-medium leading-[16px] min-w-px not-italic relative text-[#6c779d] text-[14px]">
          {text}
        </p>
      </div>
    </div>
  );
};

// ─── Income drill-down (live) - the actual inflow transactions ───────────────
// The "filtered transaction list" behind the Income summary: real inflow rows
// from the Ledger, each opening the shared transaction detail. No popup, an
// inline list, honest to what's recorded.
const IncomeTxList = ({
  format,
  onOpen,
}: {
  format: (a: string | number) => string;
  onOpen: (txId: string) => void;
}) => {
  const { data: txData } = useQuery<BrainTransactionsResponse>({
    queryKey: ["/api/brain/ledger/transactions"],
    retry: false,
  });
  const { data: cpData } = useQuery<CounterpartiesLiteResponse>({
    queryKey: ["/api/brain/ledger/counterparties"],
    retry: false,
  });
  const inflows = (txData?.transactions ?? [])
    .filter((t) => t.direction === "inflow")
    .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());
  if (inflows.length === 0) return null;
  const nameOf = (id?: string | null) =>
    (id && cpData?.counterparties.find((c) => c.id === id)?.name) || null;
  const shortDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <>
      {inflows.map((t, idx) => {
        const label = nameOf(t.counterparty_id) ?? t.description_normalized ?? "Incoming payment";
        const amt = Number(t.amount);
        return (
          <div key={t.id} className="flex flex-col gap-[8px] w-full">
            <div
              role="button"
              tabIndex={0}
              data-testid={`income-tx-${t.id}`}
              onClick={() => onOpen(t.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(t.id); } }}
              className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
            >
              <div className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px]">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] truncate">{label}</p>
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px] whitespace-nowrap">{shortDate(t.transaction_date)}</p>
              </div>
              <div className="flex flex-col items-end justify-center relative shrink-0">
                <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#42bf23] text-[18px] text-right whitespace-nowrap">
                  +{format(Math.abs(Number.isFinite(amt) ? amt : 0))}
                </p>
              </div>
            </div>
            {idx < inflows.length - 1 && <Divider />}
          </div>
        );
      })}
    </>
  );
};

// ─── Expenses (live) - outflow transactions grouped from the Ledger ──────────
// Derived from brain-core ledger outflow transactions. The demo seed currently
// carries only inflows, so this renders an honest empty state today and will
// populate automatically when real money-out data lands. Never faked.
// See deliverables/DATA-LIMITATIONS.md.
type ExpenseRow = { category: string; amount: number };

function summarizeExpenses(
  txs: BrainTransactionDTO[],
  nameOf: (id: string) => string,
): ExpenseRow[] {
  const byKey = new Map<string, number>();
  for (const t of txs) {
    if (t.direction !== "outflow") continue;
    const amt = Number(t.amount);
    if (!Number.isFinite(amt)) continue;
    const key = t.description_normalized || (t.counterparty_id ? nameOf(t.counterparty_id) : "Other");
    byKey.set(key, (byKey.get(key) ?? 0) + amt);
  }
  return Array.from(byKey.entries()).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
}

const ExpensesWidget = ({ format }: { format: (a: string | number) => string }) => {
  const { data: txData } = useQuery<BrainTransactionsResponse>({
    queryKey: ["/api/brain/ledger/transactions"],
    retry: false,
  });
  const { data: cpData } = useQuery<CounterpartiesLiteResponse>({
    queryKey: ["/api/brain/ledger/counterparties"],
    retry: false,
  });

  const nameOf = (id: string) => cpData?.counterparties.find((c) => c.id === id)?.name ?? "a vendor";
  const rows = txData?.transactions ? summarizeExpenses(txData.transactions, nameOf) : [];
  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <WidgetCard title="Expenses" count={rows.length}>
      {rows.length === 0 ? (
        <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10]">
          <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">No expenses recorded yet. This populates from your ledger as money goes out.</p>
        </div>
      ) : (
        <>
          {rows.map((item, idx) => (
            <div key={item.category} className="flex flex-col gap-[8px] w-full">
              <div
                data-testid={`row-expense-${idx}`}
                className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer"
              >
                <div className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px]">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">{item.category}</p>
                </div>
                <div className="flex flex-col items-end justify-center relative shrink-0">
                  <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#a8b9f4] text-[18px] text-right whitespace-nowrap">{format(item.amount)}</p>
                </div>
              </div>
              <Divider />
            </div>
          ))}
          <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10]">
            <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">Total</p>
            </div>
            <div className="flex flex-col items-end justify-center relative shrink-0 w-[140px]">
              <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#d20344] text-[18px] text-right whitespace-nowrap">-{format(total)}</p>
            </div>
          </div>
        </>
      )}
    </WidgetCard>
  );
};

// ─── Liabilities (live) - outstanding accounts-payable from the Ledger ───────
// "What we owe": sum of unpaid AP invoices (metadata.scenario === "ap"). The demo
// tenant has no loan/line_of_credit accounts, so AP is the real liabilities figure.
// Falls back to static copy only when no AP data is reachable at all.
function shortDate(iso?: string | null): string {
  if (!iso) return "soon";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "soon" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const LIABILITIES_FALLBACK =
  "No outstanding liabilities. You're all caught up.";

const LiabilitiesSummary = ({ format, onCount }: { format: (a: string | number) => string; onCount?: (n: number) => void }) => {
  const { data: invData } = useQuery<InvoicesLiteResponse>({
    queryKey: ["/api/brain/ledger/invoices"],
    retry: false,
  });
  const { data: cpData } = useQuery<CounterpartiesLiteResponse>({
    queryKey: ["/api/brain/ledger/counterparties"],
    retry: false,
  });

  const ap = (invData?.invoices ?? []).filter((i) => i.metadata?.scenario === "ap" && i.status !== "paid");
  const count = ap.length;
  const text = (() => {
    if (ap.length === 0) return LIABILITIES_FALLBACK;
    const nameOf = (id: string) => cpData?.counterparties.find((c) => c.id === id)?.name ?? "a vendor";
    const total = ap.reduce((s, i) => s + (Number(i.amount_due) || 0), 0);
    const overdue = ap.filter((i) => i.status === "overdue");
    const next = [...ap]
      .sort((a, b) => new Date(a.due_date ?? 0).getTime() - new Date(b.due_date ?? 0).getTime())
      .find((i) => i.status !== "overdue");
    const owe = `You owe ${format(Math.round(total))} across ${ap.length} bill${ap.length === 1 ? "" : "s"}.`;
    const od =
      overdue.length > 0
        ? ` ${nameOf(overdue[0].counterparty_id)} for ${format(Number(overdue[0].amount_due))} is overdue.`
        : "";
    const nx = next
      ? ` Your next is ${nameOf(next.counterparty_id)} for ${format(Number(next.amount_due))}, due ${shortDate(next.due_date)}.`
      : "";
    return `${owe}${od}${nx} Brain can pay these from the Bills inbox above.`;
  })();

  useEffect(() => {
    onCount?.(count);
  }, [count, onCount]);

  return (
    <div className="flex flex-col gap-[8px] items-start justify-center p-[8px] relative shrink-0 w-full">
      <p className="[word-break:break-word] [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-full not-italic relative shrink-0 text-[#6c779d] text-[16px]">
        {text}
      </p>
    </div>
  );
};

export function FinancesPage() {
  const { format } = useCurrency();
  const { user } = useAuth();
  const [incomeCount, setIncomeCount] = useState<number>(0);
  const [liabilitiesCount, setLiabilitiesCount] = useState<number>(0);

  // Real accounts from brain-core's Ledger (via the BFF proxy at /api/brain/*).
  // The browser never sees a brain-core JWT. The BFF mints it server-side.
  const { data: brainData, isLoading: accountsLoading } = useQuery<BrainAccountsResponse>({
    queryKey: ["/api/brain/ledger/accounts"],
    retry: false,
  });

  // Accounts come straight from the live brain-core Ledger. No static fallback:
  // fabricated accounts (the old $86,993 Chase list) contradicted the real ledger,
  // so an empty/unreachable ledger honestly renders an empty state instead.
  const accounts: AccountRow[] =
    brainData?.accounts && brainData.accounts.length > 0
      ? mapBrainAccounts(brainData.accounts)
      : [];

  // Recent transactions from brain-core's Ledger (empty until provisioning seeds them).
  const { data: brainTx } = useQuery<BrainTransactionsResponse>({
    queryKey: ["/api/brain/ledger/transactions"],
    retry: false,
  });
  const transactions: TxRow[] = brainTx?.transactions ? mapBrainTransactions(brainTx.transactions.slice(0, 6)) : [];

  // Which transaction the detail popup is showing (null = closed).
  const [openTxId, setOpenTxId] = useState<string | null>(null);
  // Which account the detail popup is showing (null = closed).
  const [openAccountId, setOpenAccountId] = useState<string | null>(null);

  type FinanceTab = "Accounts" | "Recent" | "Bills" | "Income" | "Expenses" | "Liabilities";
  const FINANCE_TABS: FinanceTab[] = ["Accounts", "Recent", "Bills", "Income", "Expenses", "Liabilities"];
  const [activeTab, setActiveTab] = useState<FinanceTab>("Accounts");

  // Dynamic "last updated" timestamp. Refreshes every 10s
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setLastUpdated(Date.now()), 10000);
    return () => window.clearInterval(id);
  }, []);
  const updatedLabel = useMemo(() => timeAgo(lastUpdated), [lastUpdated]);

  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[40px] items-start pb-[16px] pt-[40px] px-[16px] w-full">

          {/* Header */}
          <div className="flex flex-col items-start gap-[4px] relative shrink-0 w-full">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#6c779d] text-[20px] whitespace-nowrap">Your Finances</p>
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] text-[#a8b9f4] text-[32px] whitespace-nowrap">Here's your financial snapshot right now.</p>
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[22px] text-[#414965] text-[16px] whitespace-nowrap">Updated {updatedLabel}</p>
          </div>

          <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">

            {/* Tab bar: active tab is ORANGE */}
            <div className="bg-[#06070a] flex gap-[2px] items-center overflow-clip p-[2px] relative rounded-[400px] shrink-0 flex-wrap">
              {FINANCE_TABS.map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="flex items-center justify-center px-[14px] py-[8px] relative rounded-[100px] shrink-0 transition-colors"
                    style={{ background: isActive ? "#4a2300" : "transparent" }}
                    data-testid={`tab-finance-${tab.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <p
                      className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[14px] whitespace-nowrap"
                      style={{ color: isActive ? "#ff9500" : "#414965" }}
                    >
                      {tab}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* ACCOUNTS */}
            {activeTab === "Accounts" && (
              <WidgetCard title="Accounts" count={accounts.length}>
                {accounts.map((acc, idx) => {
                  const clickable = !!acc.id;
                  return (
                  <div key={acc.name} className="flex flex-col gap-[8px] w-full">
                    <div
                      data-testid={`row-account-${idx}`}
                      {...(clickable
                        ? {
                            role: "button",
                            tabIndex: 0,
                            onClick: () => setOpenAccountId(acc.id!),
                            onKeyDown: (e: React.KeyboardEvent) => {
                              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenAccountId(acc.id!); }
                            },
                          }
                        : {})}
                      className={`flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors ${clickable ? "hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]" : ""}`}
                    >
                      <div className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px]">
                        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">{acc.name}</p>
                        <div className="flex gap-[4px] items-center relative shrink-0">
                          <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px] whitespace-nowrap">{acc.sub}</p>
                          {acc.sub2 && (
                            <>
                              <div className="relative shrink-0 size-[4px]"><img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_DOT} /></div>
                              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px] whitespace-nowrap">{acc.sub2}</p>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end justify-center relative shrink-0">
                        <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#a8b9f4] text-[18px] text-right whitespace-nowrap">{rowBalanceLabel(acc, format)}</p>
                      </div>
                    </div>
                    {idx < accounts.length - 1 && <Divider />}
                  </div>
                  );
                })}
                {accounts.length === 0 && (
                  <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">
                    {accountsLoading
                      ? "Loading your accounts from the ledger…"
                      : "No connected accounts yet. Link an account to see your balances here."}
                  </p>
                )}
              </WidgetCard>
            )}

            {/* RECENT */}
            {activeTab === "Recent" && (
              <WidgetCard title="Recent Transactions" count={transactions.length}>
                {transactions.length > 0 ? (
                  transactions.map((t, idx) => (
                    <div key={t.id} className="flex flex-col gap-[8px] w-full">
                      <div
                        data-testid={`row-tx-${idx}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setOpenTxId(t.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setOpenTxId(t.id);
                          }
                        }}
                        className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer"
                      >
                        <div className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px]">
                          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">{t.label}</p>
                          <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px] whitespace-nowrap">{t.date}</p>
                        </div>
                        <div className="flex flex-col items-end justify-center relative shrink-0">
                          <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#a8b9f4] text-[18px] text-right whitespace-nowrap">{t.positive ? "+" : "-"}{format(t.amount)}</p>
                        </div>
                      </div>
                      {idx < transactions.length - 1 && <Divider />}
                    </div>
                  ))
                ) : (
                  <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10]">
                    <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">No transactions yet. Activity will appear here once money starts moving.</p>
                  </div>
                )}
              </WidgetCard>
            )}

            {/* BILLS */}
            {activeTab === "Bills" && <BrainBillsInbox />}

            {/* INCOME */}
            {activeTab === "Income" && (
              <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">
                <OverdueInvoicesBanner format={format} />
                <IncomeSummary format={format} onCount={setIncomeCount} />
                <WidgetCard title="Income" count={incomeCount}>
                  <IncomeTxList format={format} onOpen={setOpenTxId} />
                </WidgetCard>
              </div>
            )}

            {/* EXPENSES */}
            {activeTab === "Expenses" && <ExpensesWidget format={format} />}

            {/* LIABILITIES */}
            {activeTab === "Liabilities" && (
              <WidgetCard title="Liabilities" count={liabilitiesCount}>
                <LiabilitiesSummary format={format} onCount={setLiabilitiesCount} />
                <button
                  type="button"
                  data-testid="link-liabilities-bills"
                  onClick={() => setActiveTab("Bills")}
                  className="bg-[#240757] content-stretch flex gap-[4px] items-center justify-center px-[12px] py-[8px] relative rounded-[100px] shrink-0 [font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#7631ee] text-[12px] whitespace-nowrap hover:bg-[#2e0a6e] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                >
                  View Bills to Pay
                  <ChevronRight className="relative shrink-0 size-[16px] text-[#7631ee]" />
                </button>
              </WidgetCard>
            )}

          </div>
        </div>
      </ScrollArea>
      <TransactionDetailPopup txId={openTxId} onClose={() => setOpenTxId(null)} onSelectTransaction={(id) => setOpenTxId(id)} />
      <AccountDetailPopup
        accountId={openAccountId}
        onClose={() => setOpenAccountId(null)}
        onOpenTransaction={(id) => { setOpenAccountId(null); setOpenTxId(id); }}
        onSelectAccount={(id) => setOpenAccountId(id)}
      />
    </div>
  );
}
