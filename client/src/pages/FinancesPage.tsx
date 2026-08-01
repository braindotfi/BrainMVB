/**
 * Ledger — four tabs: Accounts, Cash Flow, Vendors, Rules.
 *
 * Was six (Accounts, Recent, Bills, Income, Expenses, Liabilities) plus two
 * separate top-level pages (/vendors, /rules). The five money tabs collapsed into
 * Cash Flow because they were all filtered reads of the same two feeds; Vendors
 * and Rules moved in because they are part of the ledger, not neighbours of it.
 *
 * Vendors and Rules keep everything they had — the detail pager, `?vendor=` deep
 * links, the full rule builder. Only their tab bars changed: sub-tabs became a
 * filter row, so there is exactly one pill bar on screen and it always means
 * "which page am I on".
 *
 * The active tab lives in the URL rather than in state. The old page parsed
 * `?tab=` on mount, applied it, then deleted the param — which meant a refresh
 * silently dropped you back to Accounts, and a sub-panel could not put its own
 * state in the URL without a second effect racing the first. Reading the tab
 * straight off `search` removes both problems and the effect that caused them.
 */

import { useState, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useCurrency } from "@/lib/useCurrency";
import { CashFlowTab } from "@/components/CashFlowTab";
import { VendorsPanel } from "@/pages/VendorsPanel";
import { RulesPanel } from "@/pages/RulesPanel";
import { Divider, WidgetCard } from "@/components/LedgerWidgets";
import { TransactionDetailPopup } from "@/components/TransactionDetailPopup";
import { AccountDetailPopup } from "@/components/AccountDetailPopup";
import {
  ACCOUNT_KIND_LABEL as KIND_LABEL,
  type BrainAccountDTO,
  type BrainAccountsResponse,
} from "@/lib/brainAccounts";
import { ICONS } from "@/assets/figma-icons";

const IMG_DOT = ICONS.activity_dot;

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

// ─── tabs ────────────────────────────────────────────────────────────────────

export type LedgerTab = "Accounts" | "Cash Flow" | "Vendors" | "Rules";
export const LEDGER_TABS: LedgerTab[] = ["Accounts", "Cash Flow", "Vendors", "Rules"];

export const ledgerTabSlug = (tab: LedgerTab): string => tab.toLowerCase().replace(/\s+/g, "-");

/**
 * Every `?tab=` value the app has ever produced, mapped to a tab that still
 * exists.
 *
 * The five retired names are kept deliberately. Wouter has no 404 for an unknown
 * query value — an unrecognised tab would silently fall back to Accounts, so a
 * live link like the assistant's obligation citation ("show me this bill") would
 * quietly land on a list of bank balances. Every retired name was a view of cash
 * flow, so that is where each of them goes.
 */
const TAB_BY_SLUG: Record<string, LedgerTab> = {
  accounts: "Accounts",
  "cash-flow": "Cash Flow",
  cashflow: "Cash Flow",
  vendors: "Vendors",
  rules: "Rules",
  recent: "Cash Flow",
  bills: "Cash Flow",
  income: "Cash Flow",
  expenses: "Cash Flow",
  liabilities: "Cash Flow",
};

export function resolveLedgerTab(param: string | null | undefined): LedgerTab | null {
  if (!param) return null;
  return TAB_BY_SLUG[param.trim().toLowerCase().replace(/\s+/g, "-")] ?? null;
}

/** Params owned by an individual tab, cleared when leaving it so a stale
 *  `?vendor=` cannot re-open a popup on a tab that has no vendors. */
const TAB_SCOPED_PARAMS = ["vendor", "from", "rules", "create"];

const TAB_COPY: Record<LedgerTab, { heading: string; sub: string | null }> = {
  Accounts: { heading: "Every account. One source of financial truth.", sub: "See balances, cash flow, vendors, and financial rules across your business in one place." },
  "Cash Flow": {
    heading: "Everywhere your money moved.",
    sub: "Income, expenses and the bills you still owe, in one list.",
  },
  Vendors: {
    heading: "The people and businesses you pay.",
    sub: "See vendor activity, payment history, risks, and recommendations.",
  },
  Rules: {
    heading: "Your boundaries that Brain follows.",
    sub: "Manage the rules that guide Brain's reviews, recommendations, and actions.",
  },
};

// ─── brain-core Ledger accounts (via the BFF proxy) ──────────────────────────
// Shape mirrors brain-core's Account schema (subset we render).
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

// ─── page ────────────────────────────────────────────────────────────────────

export function FinancesPage() {
  const { format } = useCurrency();
  const search = useSearch();
  const [location, navigate] = useLocation();

  const tabParam = new URLSearchParams(search).get("tab");
  const activeTab: LedgerTab = resolveLedgerTab(tabParam) ?? "Accounts";

  /* Canonicalise: `/finances?tab=Bills` becomes `/ledger?tab=cash-flow` so the
     address bar agrees with what is on screen and a retired name never persists
     into a bookmark. Only fires when something is actually stale, so it cannot
     loop. */
  useEffect(() => {
    const canonicalSlug = ledgerTabSlug(activeTab);
    const pathStale = location !== "/ledger";
    const paramStale = tabParam !== null && tabParam !== canonicalSlug;
    if (!pathStale && !paramStale) return;
    const sp = new URLSearchParams(search);
    if (tabParam !== null) sp.set("tab", canonicalSlug);
    const qs = sp.toString();
    navigate(`/ledger${qs ? `?${qs}` : ""}`, { replace: true });
  }, [location, search, tabParam, activeTab, navigate]);

  const selectTab = (tab: LedgerTab) => {
    const sp = new URLSearchParams(search);
    for (const p of TAB_SCOPED_PARAMS) sp.delete(p);
    sp.set("tab", ledgerTabSlug(tab));
    navigate(`/ledger?${sp.toString()}`);
  };

  // Real accounts from brain-core's Ledger (via the BFF proxy at /api/brain/*).
  // The browser never sees a brain-core JWT. The BFF mints it server-side.
  const {
    data: brainData,
    isLoading: accountsLoading,
    isError: accountsFailed,
  } = useQuery<BrainAccountsResponse>({
    queryKey: ["/api/brain/ledger/accounts"],
    retry: false,
  });

  // Accounts come straight from the live brain-core Ledger. No static fallback:
  // fabricated accounts (the old $86,993 Chase list) contradicted the real ledger,
  // so an empty/unreachable ledger honestly renders an empty state instead.
  const accounts: AccountRow[] =
    brainData?.accounts && brainData.accounts.length > 0 ? mapBrainAccounts(brainData.accounts) : [];

  // Which transaction / account the detail popup is showing (null = closed).
  const [openTxId, setOpenTxId] = useState<string | null>(null);
  const [openAccountId, setOpenAccountId] = useState<string | null>(null);

  /* `?account=` lets another surface (global search) open a specific account.
     Read on every `search` change rather than seeded once at mount: searching
     twice in a row without leaving the page changes only the query string, and
     a mount-only initializer would ignore the second one. */
  const accountParam = new URLSearchParams(search).get("account");
  useEffect(() => {
    if (accountParam) setOpenAccountId(accountParam);
  }, [accountParam]);

  /* Closing has to drop the param too, or the effect above immediately reopens
     the popup the user just dismissed. */
  const closeAccount = () => {
    setOpenAccountId(null);
    if (!accountParam) return;
    const params = new URLSearchParams(search);
    params.delete("account");
    const qs = params.toString();
    navigate(`/ledger${qs ? `?${qs}` : ""}`, { replace: true });
  };

  // Dynamic "last updated" timestamp. Refreshes every 10s
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setLastUpdated(Date.now()), 10000);
    return () => window.clearInterval(id);
  }, []);
  const updatedLabel = useMemo(() => timeAgo(lastUpdated), [lastUpdated]);

  const copy = TAB_COPY[activeTab];

  return (
    <div className="bg-[#11141b] overflow-hidden relative size-full flex flex-col">

      {/* Static chrome: header + tab bar — never scrolls */}
      <div className="shrink-0 flex flex-col gap-[40px] items-start pt-[40px] px-[16px] pb-[16px] w-full">
        <div className="flex flex-col items-start gap-[4px] relative shrink-0 w-full">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#6c779d] text-[20px]">Your Financial Ledger</p>
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] text-[#a8b9f4] text-[32px]">{copy.heading}</p>
          <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[22px] text-[#414965] text-[16px]">
            {copy.sub ?? `Updated ${updatedLabel}`}
          </p>
        </div>
        <div className="bg-[#06070a] flex gap-[2px] items-center overflow-clip p-[2px] relative rounded-[400px] shrink-0 flex-wrap max-w-full">
          {LEDGER_TABS.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => selectTab(tab)}
                className="flex items-center justify-center px-[14px] py-[8px] relative rounded-[100px] shrink-0 transition-colors"
                style={{ background: isActive ? "#4a2300" : "transparent" }}
                data-testid={`tab-finance-${ledgerTabSlug(tab)}`}
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
      </div>

      {/* Table area: scrolls as a whole; panel headers are sticky */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-[16px] pb-[16px]">

        {activeTab === "Accounts" && (
          <WidgetCard title="Accounts" count={accounts.length}>
            {accounts.map((acc, idx) => {
              const clickable = !!acc.id;
              return (
              <div
                  key={acc.name}
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
                  className={`flex gap-[16px] items-center p-[8px] relative shrink-0 w-full bg-[#0a0c10] transition-colors border-b border-solid border-[#1d2132] last:border-b-0 ${clickable ? "hover:bg-[#11141b] cursor-pointer" : ""}`}
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
              
              );
            })}
            {accounts.length === 0 && (
              <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10]">
                {/* Three states, not two. An unreachable ledger used to render the
                    same "No connected accounts yet" as a genuinely empty one, which
                    tells someone with accounts that they have none. */}
                <p
                  className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[16px]"
                  style={{ color: accountsFailed ? "#ff9400" : "#6c779d" }}
                  data-testid={
                    accountsLoading
                      ? "text-accounts-loading"
                      : accountsFailed
                        ? "text-accounts-unavailable"
                        : "text-accounts-empty"
                  }
                >
                  {accountsLoading
                    ? "Loading your accounts from the ledger…"
                    : accountsFailed
                      ? "Your accounts couldn't be loaded just now, so this list is empty for the wrong reason. It isn't a sign that you have no accounts."
                      : "No connected accounts yet. Link an account to see your balances here."}
                </p>
              </div>
            )}
          </WidgetCard>
        )}

        {activeTab === "Cash Flow" && <CashFlowTab format={format} onOpenTx={setOpenTxId} />}

        {activeTab === "Vendors" && <VendorsPanel />}

        {activeTab === "Rules" && <RulesPanel />}

      </div>

      <TransactionDetailPopup txId={openTxId} onClose={() => setOpenTxId(null)} onSelectTransaction={(id) => setOpenTxId(id)} />
      <AccountDetailPopup
        accountId={openAccountId}
        onClose={closeAccount}
        onOpenTransaction={(id) => { closeAccount(); setOpenTxId(id); }}
        onSelectAccount={(id) => setOpenAccountId(id)}
      />
    </div>
  );
}
