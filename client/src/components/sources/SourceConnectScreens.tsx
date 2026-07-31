import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { categoryCounts, CATEGORY_ORDER, type CategoryId } from "@/lib/sourceCategories";
import {
  isDisconnectHidden,
  isProviderRemoveHidden,
  categoryForBrainSource,
} from "@/lib/brainSources";
import type { BankConnectionInfo, ExtractStatus, SourceDocument, ToolConnection } from "@/lib/sourceTypes";
import { useBrainSources } from "@/lib/useBrainSources";
import { formatSize } from "@/lib/sourceRows";
import { ExtractStatusBadge, extractStatusMeta } from "@/components/sources/ExtractStatusBadge";
import { fetchObligations, isReceivable, type Obligation } from "@/lib/brainObligations";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata, type PlaidLinkError } from "react-plaid-link";
import bankIcon from "@assets/bank_1783619257499.png";
import cryptoIcon from "@assets/crypto_1783619257499.png";
import accountingIcon from "@assets/accounting_1783619257498.png";
import payrollIcon from "@assets/payroll_1783619257499.png";
import taxIcon from "@assets/tax_1783619257500.png";
import paymentsIcon from "@assets/payments_1783619257499.png";
import docsIcon from "@assets/docs_1783621224017.png";

/* ──────────────────────────────────────────────────────────────────────────
 *  Source connect screens - the mechanisms for attaching a data source to Brain.
 *
 *  Aligned with the Brain data-ingestion architecture: source-agnostic
 *  connectors organised by capability (bank / accounting / payroll / tax /
 *  payments / documents). Plaid is one connector, not the centre.
 *
 *  Each screen owns one connect mechanism and nothing else - no shell, no step
 *  machinery, no list of what is already connected. Two surfaces compose them:
 *  Settings → Sources renders them inline (variant="inline", which drops the
 *  headings and notices that surface supplies itself), and the first-run
 *  walkthrough renders them full-size. The list of connected sources lives in
 *  components/settings/SourcesSection.tsx, which is its permanent home.
 *
 * ────────────────────────────────────────────────────────────────────────── */

export type { CategoryId };

/** How a connect screen is being presented.
 *
 *  "modal"  - full-size, inside the first-run walkthrough: own heading, own
 *             reassurance notice, own "Done".
 *  "inline" - inside Settings → Sources, which already supplies the heading, the
 *             reassurance copy and the list of what is connected. Repeating them
 *             here would show the same documents twice on one screen. */
export type SourceScreenVariant = "modal" | "inline";

type CounterpartyLite = { id: string; display_name?: string; name?: string };
type CounterpartiesResponse = { counterparties: CounterpartyLite[] };
type WikiAnswer = { raw: string; evidenceIds: string[]; confidence: number | null };

/** Map a file to brain-core's source_type. */
function sourceTypeForFile(file: File): "pdf_upload" | "csv_upload" {
  const n = file.name.toLowerCase();
  if (n.endsWith(".csv") || n.endsWith(".xls") || n.endsWith(".xlsx")) return "csv_upload";
  return "pdf_upload";
}

function ExtractStatusPill({ status, testId }: { status: ExtractStatus | null; testId?: string }) {
  const meta = extractStatusMeta(status);
  const spinning = meta.tone === "progress";
  const toneClass: Record<"ok" | "progress" | "warn" | "muted", string> = {
    ok: "bg-[#123509] border-[rgba(66,191,35,0.2)] text-[#42bf23]",
    progress: "bg-[#240757] border-[rgba(118,49,238,0.2)] text-[#a8b9f4]",
    warn: "bg-[#4a2300] border-[rgba(255,149,0,0.2)] text-[#ff9400]",
    muted: "bg-[#222737] border-[rgba(108,119,157,0.2)] text-[#6c779d]",
  };
  return (
    <span
      data-testid={testId}
      className={`shrink-0 flex items-center gap-[6px] px-[8px] py-[3px] rounded-[22px] border [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] whitespace-nowrap ${toneClass[meta.tone]}`}
    >
      {spinning && (
        <span className="size-[8px] rounded-full border-2 border-t-transparent animate-spin shrink-0" style={{ borderColor: "currentColor", borderTopColor: "transparent" }} aria-hidden />
      )}
      {meta.label}
    </span>
  );
}

/** A small "advisory / needs confirmation" pill for document-derived data (conf ≤0.5). */
function ConfidencePill({ confidence }: { confidence: number | null }) {
  const pct = confidence !== null ? Math.round(confidence * 100) : null;
  return (
    <span
      className="shrink-0 px-[8px] py-[2px] rounded-[22px] bg-[#4a2300] [font-family:'Gilroy',sans-serif] font-semibold text-[11px] leading-[14px] text-[#ff9500]"
      title="Brain read this from a document. Advisory only, please confirm."
    >
      {pct !== null ? `${pct}% · needs confirmation` : "Needs confirmation"}
    </span>
  );
}

/** Resolve a counterparty id → display name, falling back to a shortened id. */
function counterpartyName(id: string | null, map: Map<string, string>): string {
  if (!id) return "Unknown counterparty";
  return map.get(id) ?? id;
}

/* ─── Catalog ─── */
type Provider = { id: string; name: string; logo: string; bg: string; light?: boolean; live?: boolean };

const CATEGORY_META: Record<CategoryId, { label: string; sub: string; accent: string }> = {
  bank:       { label: "Bank Accounts",  sub: "Checking, savings and credit via Plaid",      accent: "#22c55e" },
  crypto:     { label: "Crypto Wallets", sub: "MetaMask, Coinbase Wallet, WalletConnect", accent: "#ff9500" },
  accounting: { label: "Accounting",     sub: "QuickBooks, Xero, Wave",                accent: "#7631EE" },
  payroll:    { label: "Payroll",        sub: "Gusto, Rippling, ADP",                  accent: "#a8b9f4" },
  tax:        { label: "Tax",            sub: "Returns, filings and tax documents",      accent: "#ff9500" },
  payments:   { label: "Payments",       sub: "Stripe, PayPal, Square",                accent: "#635BFF" },
  documents:  { label: "Documents",      sub: "Statements, contracts, spreadsheets",   accent: "#ff9500" },
};


const PROVIDERS: Partial<Record<CategoryId, Provider[]>> = {
  crypto: [
    { id: "metamask",      name: "MetaMask",        logo: "M", bg: "#F6851B" },
    { id: "coinbasewallet", name: "Coinbase Wallet", logo: "C", bg: "#0052FF" },
    { id: "walletconnect", name: "WalletConnect",   logo: "W", bg: "#3B99FC" },
    { id: "ledger",        name: "Ledger",          logo: "L", bg: "#000000" },
  ],
  accounting: [
    { id: "quickbooks", name: "QuickBooks", logo: "qb", bg: "#2CA01C" },
    { id: "xero",       name: "Xero",       logo: "X",  bg: "#13B5EA" },
    { id: "wave",       name: "Wave",       logo: "~",  bg: "#1F46FA" },
  ],
  payroll: [
    { id: "gusto",    name: "Gusto",    logo: "G",  bg: "#F45D48" },
    { id: "rippling", name: "Rippling", logo: "R",  bg: "#5E3FE6" },
    { id: "adp",      name: "ADP",      logo: "AD", bg: "#D0271D" },
  ],
  payments: [
    { id: "stripe", name: "Stripe", logo: "S", bg: "#635BFF", live: true },
    { id: "paypal", name: "PayPal", logo: "P", bg: "#003087" },
    { id: "square", name: "Square", logo: "□", bg: "#000000" },
  ],
};

export const TOOL_LABELS: Record<string, string> = {
  stripe: "Stripe", quickbooks: "QuickBooks", xero: "Xero", wave: "Wave",
  gusto: "Gusto", rippling: "Rippling", adp: "ADP", paypal: "PayPal", square: "Square",
};

// Reverse map: provider/tool id → its category (for counter tags).
export const TOOL_CATEGORY: Record<string, CategoryId> = Object.entries(PROVIDERS).reduce(
  (acc, [cat, list]) => {
    (list ?? []).forEach((p) => { acc[p.id] = cat as CategoryId; });
    return acc;
  },
  {} as Record<string, CategoryId>,
);

/* ─── Category icon assets (used on both the category picker and the connected-sources home screen) ─── */
const CATEGORY_ICON_SRC: Record<CategoryId, string> = {
  bank: bankIcon,
  crypto: cryptoIcon,
  accounting: accountingIcon,
  payroll: payrollIcon,
  tax: taxIcon,
  payments: paymentsIcon,
  documents: docsIcon,
};

function CategoryIcon({ cat, size = 40 }: { cat: CategoryId; size?: number }) {
  return (
    <div className="rounded-full shrink-0 overflow-hidden" style={{ width: size, height: size }}>
      <img src={CATEGORY_ICON_SRC[cat]} alt="" style={{ width: size, height: size }} />
    </div>
  );
}

/* ───────────────────────────── Screen: Category picker ───────────────────────────── */
export function CategoryPicker({ onPick, onContinue }: { onPick: (cat: CategoryId) => void; onContinue: () => void }) {
  const banksQuery = useQuery<BankConnectionInfo[]>({ queryKey: ["/api/integrations/plaid/connections"] });
  const toolsQuery = useQuery<ToolConnection[]>({ queryKey: ["/api/integrations/connections"] });
  const docsQuery = useQuery<SourceDocument[]>({ queryKey: ["/api/integrations/documents"] });

  const brainSources = useBrainSources(true).sources;

  const banks = banksQuery.data ?? [];
  const tools = toolsQuery.data ?? [];
  const docs = docsQuery.data ?? [];

  // Real, live-derived badge counts - see client/src/lib/sourceCategories.ts.
  const countableBrainSources = useMemo(
    () => brainSources.map((s) => ({ type: s.type, category: categoryForBrainSource(s) })),
    [brainSources],
  );
  const counts = categoryCounts(banks, tools, docs, TOOL_CATEGORY, countableBrainSources);

  return (
    <div className="flex flex-col gap-[20px]">
      <div className="flex flex-col gap-[8px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]">
          What Would You Like To Connect?
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
          Pick a category. Brain treats every source the same way. It reads it, structures it, and adds it to your financial memory.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-[12px]">
        {CATEGORY_ORDER.map((cat) => {
          const m = CATEGORY_META[cat];
          const count = counts[cat];
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onPick(cat)}
              data-testid={`button-category-${cat}`}
              className="flex items-center gap-[12px] bg-[#0a0c10] rounded-[16px] p-[16px] transition-colors text-left hover:bg-[#0f1219]"
            >
              <CategoryIcon cat={cat} />
              <div className="flex-1 min-w-0 flex flex-col">
                <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[15px] leading-[20px]">
                  {m.label}
                </span>
                <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[12px] leading-[16px] truncate">
                  {m.sub}
                </span>
              </div>
              {count > 0 && (
                <span
                  data-testid={`badge-category-count-${cat}`}
                  className="flex items-center gap-[5px] px-[9px] py-[4px] rounded-[22px] bg-[#240757] [font-family:'Gilroy',sans-serif] font-semibold text-[11px] leading-[12px] text-[#a78bfa] whitespace-nowrap shrink-0"
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <circle cx="8" cy="8" r="8" fill="#7631EE" />
                    <path d="M4.5 8L7 10.5L11.5 6" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {count} connected
                </span>
              )}
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
                <path d="M9 5.5L15.5 12L9 18.5" stroke="#6c779d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onContinue}
        data-testid="button-categories-continue"
        className="flex w-full items-center justify-center px-[20px] h-[44px] rounded-[100px] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[15px] bg-[#4a2300] hover:bg-[#5c2c00] text-[#ff9500]"
      >
        Continue
      </button>
    </div>
  );
}


/* ───────────────────────────── Screen: Bank (Plaid) ───────────────────────────── */
export function BankConnect({ onDone, variant = "modal" }: { onDone: () => void; variant?: SourceScreenVariant }) {
  const inline = variant === "inline";
  const [error, setError] = useState<string | null>(null);

  const statusQuery = useQuery<{ configured: boolean; env: string }>({
    queryKey: ["/api/integrations/plaid/status"],
  });
  const isConfigured = statusQuery.data?.configured ?? false;

  const connectionsQuery = useQuery<BankConnectionInfo[]>({
    queryKey: ["/api/integrations/plaid/connections"],
  });
  const connections = connectionsQuery.data ?? [];

  const linkTokenQuery = useQuery<{ link_token: string }>({
    queryKey: ["/api/integrations/plaid/link-token"],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/integrations/plaid/link-token");
      return res.json();
    },
    enabled: isConfigured,
    retry: false,
    staleTime: 25 * 60 * 1000,
  });

  const exchangeMut = useMutation({
    mutationFn: async (vars: { public_token: string; institution?: { id: string | null; name: string } }) => {
      const res = await apiRequest("POST", "/api/integrations/plaid/exchange", vars);
      return res.json();
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/plaid/connections"] });
    },
    onError: (err: Error) => setError(err.message.replace(/^\d+:\s*/, "")),
  });

  return (
    <div className="flex flex-col gap-[16px]">
      {!inline && (
        <div className="flex flex-col gap-[8px]">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]">
            Connect Your Bank
          </p>
          <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
            Brain reads your account activity to understand what&apos;s coming in and going out. Add checking, savings, and credit cards in a minute.
          </p>
        </div>
      )}

      {/* Settings → Sources lists the connected banks itself, directly below this
          form: repeating them here would show the same account twice. */}
      {!inline && connections.length > 0 && (
        <div className="flex flex-col gap-[8px]">
          {connections.map((c) => (
            <div
              key={c.itemId}
              data-testid={`card-bank-${c.itemId}`}
              className="flex items-center gap-[12px] bg-[#0a0c10] rounded-[12px] p-[12px]"
            >
              <div
                className="size-[32px] rounded-full flex items-center justify-center shrink-0 font-bold text-[12px] [font-family:'Gilroy',sans-serif]"
                style={{ background: "#22c55e", color: "#062b13" }}
              >
                {c.institutionName.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 flex flex-col">
                <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[14px] leading-[18px] truncate">
                  {c.institutionName}
                </span>
                <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#22c55e] text-[11px] leading-[14px] truncate">
                  {c.accounts.length} account{c.accounts.length === 1 ? "" : "s"} connected
                </span>
              </div>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                <circle cx="9" cy="9" r="9" fill="#22c55e" />
                <path d="M5 9l2.8 2.8L13 6.5" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div
          data-testid="alert-bank-error"
          className="rounded-[12px] px-[12px] py-[10px] [font-family:'Gilroy',sans-serif] text-[13px] leading-[18px]"
          style={{ background: "rgba(239,68,68,0.08)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.25)" }}
        >
          {error}
        </div>
      )}

      {!isConfigured ? (
        <div
          data-testid="alert-plaid-not-configured"
          className="rounded-[12px] px-[14px] py-[12px] [font-family:'Gilroy',sans-serif] text-[13px] leading-[18px]"
          style={{ background: "rgba(118,49,238,0.08)", color: "#a8b9f4", border: "1px solid rgba(118,49,238,0.25)" }}
        >
          Bank connections require Plaid credentials. Add{" "}
          <code className="text-[#7631EE]">PLAID_CLIENT_ID</code> and{" "}
          <code className="text-[#7631EE]">PLAID_SECRET</code> to enable this.
        </div>
      ) : (
        <PlaidConnectButton
          token={linkTokenQuery.data?.link_token ?? null}
          isLoading={linkTokenQuery.isLoading}
          isExchanging={exchangeMut.isPending}
          loadError={linkTokenQuery.error?.message ?? null}
          hasExisting={connections.length > 0}
          onSuccess={(public_token, metadata) => {
            exchangeMut.mutate({
              public_token,
              institution: metadata.institution
                ? { id: metadata.institution.institution_id, name: metadata.institution.name }
                : undefined,
            });
          }}
          onExit={(err) => { if (err) setError(err.display_message ?? err.error_message ?? "Bank connection cancelled"); }}
        />
      )}

      {!inline && (
        <InfoNotice
          title="Secure by Default"
          body="Brain never sees or stores your bank password. We connect through Plaid, trusted by Venmo, Robinhood, and American Express. Brain only reads with your permission."
        />
      )}

      {!inline && connections.length > 0 && (
        <button
          type="button"
          onClick={onDone}
          data-testid="button-bank-done"
          className="flex w-full items-center justify-center px-[20px] py-[12px] rounded-[100px] bg-[#222737] hover:bg-[#2c3247] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[15px]"
        >
          Done
        </button>
      )}
    </div>
  );
}

function PlaidConnectButton({
  token, isLoading, isExchanging, loadError, hasExisting, onSuccess, onExit,
}: {
  token: string | null;
  isLoading: boolean;
  isExchanging: boolean;
  loadError: string | null;
  hasExisting: boolean;
  onSuccess: (public_token: string, metadata: PlaidLinkOnSuccessMetadata) => void;
  onExit: (err: PlaidLinkError | null) => void;
}) {
  const { open, ready } = usePlaidLink({
    token: token ?? "",
    onSuccess: (public_token, metadata) => onSuccess(public_token, metadata),
    onExit: (err) => onExit(err),
  });

  const disabled = !token || !ready || isLoading || isExchanging;
  const label = isExchanging
    ? "Linking accounts…"
    : isLoading
    ? "Preparing secure connection…"
    : hasExisting
    ? "+ Connect another bank"
    : "Connect with Plaid";

  return (
    <div className="flex flex-col gap-[8px]">
      <button
        type="button"
        onClick={() => open()}
        disabled={disabled}
        data-testid="button-plaid-connect"
        className="flex items-center justify-center gap-[10px] h-[48px] rounded-[12px] [font-family:'Gilroy',sans-serif] font-semibold text-[15px] leading-[18px] transition-opacity disabled:opacity-60"
        style={{ background: "#7631EE", color: "#FFFFFF" }}
      >
        {isExchanging || isLoading ? (
          <span className="size-[16px] rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M3 7h18M3 12h18M3 17h12" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        )}
        {label}
      </button>
      {loadError && !isLoading && (
        <p className="[font-family:'Gilroy',sans-serif] text-[12px] text-[#fca5a5] text-center">
          {loadError.replace(/^\d+:\s*/, "")}
        </p>
      )}
      <p className="[font-family:'Gilroy',sans-serif] text-[11px] leading-[14px] text-[#6c779d] text-center">
        Search 12,000+ institutions · bank-grade encryption
      </p>
    </div>
  );
}

/* ───────────────────────────── Screen: Provider picker ───────────────────────────── */
export function ProviderPicker({ category, variant = "modal" }: { category: CategoryId; variant?: SourceScreenVariant }) {
  const inline = variant === "inline";
  const providers = PROVIDERS[category] ?? [];
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toolsQuery = useQuery<ToolConnection[]>({ queryKey: ["/api/integrations/connections"] });
  const connected = new Set((toolsQuery.data ?? []).map((c) => c.toolId));

  // A provider can also be connected upstream (brain-core's own connector registry).
  // Those rows may forbid disconnecting, in which case this screen must show the
  // provider as connected but offer NO "tap to remove" affordance.
  const brainSources = useBrainSources(true).sources;
  const undisconnectableTypes = useMemo(
    () => new Set(brainSources.filter(isDisconnectHidden).map((s) => s.type)),
    [brainSources],
  );
  const brainConnectedTypes = useMemo(() => new Set(brainSources.map((s) => s.type)), [brainSources]);
  const removeHiddenFor = (providerId: string) =>
    isProviderRemoveHidden(providerId, connected, undisconnectableTypes);

  const stripeConnect = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/integrations/stripe/connect");
      return res.json();
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/connections"] });
    },
    onError: (err: Error) => setError(err.message.replace(/^\d+:\s*/, "")),
    onSettled: () => setConnecting(null),
  });

  const disconnectTool = useMutation({
    mutationFn: async (toolId: string) => {
      const res = await apiRequest("POST", `/api/integrations/${toolId}/disconnect`);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/integrations/connections"] }),
  });

  const handleClick = (p: Provider) => {
    setError(null);
    // Upstream forbids severing this one - the row is inert, never a no-op click.
    if (removeHiddenFor(p.id)) return;
    if (connected.has(p.id)) {
      disconnectTool.mutate(p.id);
      return;
    }
    if (p.live && p.id === "stripe") {
      setConnecting("stripe");
      stripeConnect.mutate();
    }
  };

  return (
    <div className="flex flex-col gap-[16px]">
      {!inline && (
        <div className="flex flex-col gap-[8px]">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]">
            Connect {CATEGORY_META[category].label}
          </p>
          <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
            Brain reads from each tool you connect, and never writes back without your explicit approval.
          </p>
        </div>
      )}

      {error && (
        <div
          data-testid="alert-provider-error"
          className="rounded-[12px] px-[12px] py-[10px] [font-family:'Gilroy',sans-serif] text-[13px] leading-[18px]"
          style={{ background: "rgba(239,68,68,0.08)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.25)" }}
        >
          {error}
        </div>
      )}

      <div className="flex flex-col gap-[12px]">
        {providers.map((p) => {
          const removeHidden = removeHiddenFor(p.id);
          const isConnected = connected.has(p.id) || brainConnectedTypes.has(p.id);
          const isConnecting = connecting === p.id;
          const clickable = (isConnected && !removeHidden) || (!isConnected && p.live);
          return (
            <button
              key={p.id}
              type="button"
              disabled={isConnecting || (!clickable)}
              onClick={() => handleClick(p)}
              data-testid={`button-provider-${p.id}`}
              className="flex items-center gap-[12px] bg-[#0a0c10] rounded-[12px] p-[12px] transition-colors text-left disabled:cursor-default"
            >
              <div
                className="size-[32px] rounded-full flex items-center justify-center shrink-0"
                style={{ background: p.bg, border: p.light ? "1px solid #1d2132" : undefined }}
              >
                <span className="[font-family:'Gilroy',sans-serif] font-bold text-[12px] leading-none" style={{ color: p.light ? "#11141b" : "#FFFFFF" }}>
                  {p.logo}
                </span>
              </div>
              <div className="flex-1 min-w-0 flex flex-col">
                <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[14px] leading-[18px] truncate">
                  {p.name}
                </span>
                <span
                  className="[font-family:'Gilroy',sans-serif] font-medium text-[11px] leading-[14px] truncate"
                  style={{ color: isConnected ? "#22c55e" : "#6c779d" }}
                >
                  {isConnected
                    ? removeHidden ? "Connected" : "Connected · tap to remove"
                    : isConnecting ? "Connecting…" : p.live ? "Tap to connect" : "Coming soon"}
                </span>
              </div>
              {isConnected ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <circle cx="8" cy="8" r="8" fill="#22c55e" />
                  <path d="M4.5 8L7 10.5L11.5 6" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : isConnecting ? (
                <span className="size-[14px] rounded-full border-2 border-[#7631EE] border-t-transparent animate-spin" aria-hidden />
              ) : !p.live ? (
                <span className="px-[8px] py-[3px] rounded-[22px] [font-family:'Gilroy',sans-serif] font-semibold text-[10px] leading-[12px] bg-[#1d2132] text-[#6c779d]">
                  Soon
                </span>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M6 3.5L10.5 8L6 12.5" stroke="#6c779d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          );
        })}
      </div>

      <InfoNotice
        title="Read-only by Default"
        body="Connecting a tool lets Brain mirror its data into your ledger. Disconnect any source any time from here or Settings."
      />
    </div>
  );
}

/* ───────────────────────────── Screen: Document upload ───────────────────────────── */
export function DocumentUpload({ category, onDone, variant = "modal" }: { category: string; onDone: () => void; variant?: SourceScreenVariant }) {
  const inline = variant === "inline";
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const docsQuery = useQuery<SourceDocument[]>({ queryKey: ["/api/integrations/documents"] });
  const docs = (docsQuery.data ?? []).filter((d) => (category === "tax" ? d.category === "tax" : true));

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const params = new URLSearchParams({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        category,
        sourceType: sourceTypeForFile(file),
      });
      const res = await fetch(`/api/integrations/documents/ingest?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.message || json?.error || `Upload failed (${res.status})`);
      }
      return json;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/integrations/documents"] }),
    onError: (err: Error) => setError(err.message.replace(/^\d+:\s*/, "")),
  });

  const removeDoc = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/integrations/documents/${id}/delete`);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/integrations/documents"] }),
  });

  const addFiles = useCallback((list: FileList | File[]) => {
    setError(null);
    Array.from(list).forEach((f) => uploadMut.mutate(f));
  }, [uploadMut]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  return (
    <div className="flex flex-col gap-[16px]">
      {!inline && (
        <div className="flex flex-col gap-[8px]">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]">
            {category === "tax" ? "Upload Tax Documents" : "Upload Documents"}
          </p>
          <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
            {category === "tax"
              ? "Returns, filings, and notices. Brain reads them to keep your tax picture current."
              : "Statements, contracts, or anything that explains how your business works. The more Brain knows, the better it can help."}
          </p>
        </div>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
        data-testid="dropzone-add-source"
        className={`flex flex-col items-center justify-center gap-[8px] px-[24px] py-[40px] rounded-[16px] border-2 border-dashed cursor-pointer transition-colors ${
          dragOver ? "border-[#7631EE] bg-[rgba(118,49,238,0.05)]" : "border-[#1d2132] hover:border-[#2c3247] bg-[#0a0c10]"
        }`}
      >
        <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[16px] leading-[24px]">
          Drop files here, or <span className="text-[#ff9500]">click to browse</span>
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px] leading-[20px]">
          PDF, CSV, Excel, images, ZIPs
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.csv,.xls,.xlsx,.png,.jpg,.jpeg,.zip"
          className="hidden"
          onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.currentTarget.value = ""; }}
          data-testid="input-add-source-file"
        />
      </div>

      {error && (
        <div
          data-testid="alert-doc-error"
          className="rounded-[12px] px-[12px] py-[10px] [font-family:'Gilroy',sans-serif] text-[13px] leading-[18px]"
          style={{ background: "rgba(239,68,68,0.08)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.25)" }}
        >
          {error}
        </div>
      )}

      {(uploadMut.isPending || (!inline && docs.length > 0)) && (
        <div className="flex flex-col gap-[6px]">
          {uploadMut.isPending && (
            <div className="flex items-center gap-[10px] bg-[#0a0c10] rounded-[10px] px-[12px] py-[8px]">
              <span className="size-[16px] rounded-full border-2 border-[#7631EE] border-t-transparent animate-spin shrink-0" aria-hidden />
              <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]">Uploading…</span>
            </div>
          )}
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-[10px] bg-[#0a0c10] rounded-[10px] px-[12px] py-[8px]" data-testid={`doc-row-${d.id}`}>
              <div className="flex flex-col gap-[2px] flex-1 min-w-0">
                <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[13px] truncate">{d.name}</span>
                <ExtractStatusBadge status={d.extractStatus} testId={`doc-status-${d.id}`} />
              </div>
              <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[12px] shrink-0">{formatSize(d.size)}</span>
              <button
                type="button"
                onClick={() => removeDoc.mutate(d.id)}
                aria-label={`Remove ${d.name}`}
                data-testid={`button-remove-doc-${d.id}`}
                className="shrink-0 size-[24px] rounded-[6px] flex items-center justify-center text-[#6c779d] hover:text-[#fca5a5] hover:bg-[#1d2132] transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {!inline && (
        <InfoNotice
          title="Brain Reads but Doesn't Share"
          body="Files are used only to understand your business and never shown to anyone else. You can delete any file at any time."
        />
      )}

      {!inline && docs.length > 0 && (
        <button
          type="button"
          onClick={onDone}
          data-testid="button-docs-done"
          className="flex w-full items-center justify-center px-[20px] py-[12px] rounded-[100px] bg-[#222737] hover:bg-[#2c3247] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[15px]"
        >
          Done
        </button>
      )}
    </div>
  );
}

/* ───────────────────────────── Shared bits ───────────────────────────── */
function InfoNotice({ title, body, uppercase = true }: { title: string; body: React.ReactNode; uppercase?: boolean }) {
  return (
    <div className="flex items-start gap-[8px] rounded-[12px] border border-[rgba(255,148,0,0.2)] bg-[#4a2300] p-[8px]">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 mt-[1px]">
        <circle cx="8" cy="8" r="7" stroke="#ff9400" strokeWidth="1.3" />
        <path d="M8 7.3v4.2" stroke="#ff9400" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="8" cy="4.7" r="0.9" fill="#ff9400" />
      </svg>
      <div className="flex-1 min-w-0">
        <p className={`[font-family:'Gilroy',sans-serif] font-bold text-[#ff9400] text-[13px] leading-[18px] ${uppercase ? "uppercase" : ""}`}>{title}</p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#ff9400] text-[13px] leading-[18px] mt-[2px]">{body}</p>
      </div>
    </div>
  );
}

export function ReadingScreen({
  onViewWiki, onContinue, onAddMore,
}: { onViewWiki: () => void; onContinue: () => void; onAddMore: () => void }) {
  const docsQuery = useQuery<SourceDocument[]>({ queryKey: ["/api/integrations/documents"] });
  const docs = docsQuery.data ?? [];

  const readCount = docs.filter((d) => d.extractStatus === "extracted").length;
  const warnCount = docs.filter((d) => d.extractStatus === "unsupported" || d.extractStatus === "failed").length;

  return (
    <div className="flex flex-col gap-[20px]">
      <div className="flex flex-col gap-[8px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]">
          Reading Your Sources
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
          Brain is reviewing your uploaded documents. Anything it reads is advisory until you confirm it.
        </p>
      </div>

      {docsQuery.isLoading ? (
        <div className="flex items-center gap-[10px] bg-[#0a0c10] rounded-[12px] px-[14px] py-[12px]">
          <span className="size-[16px] rounded-full border-2 border-[#7631EE] border-t-transparent animate-spin shrink-0" aria-hidden />
          <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]">Loading your documents…</span>
        </div>
      ) : docs.length === 0 ? (
        <div className="bg-[#0a0c10] rounded-[16px] p-[20px] text-center">
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px] leading-[20px]">
            No documents uploaded yet. Add a document source and Brain will start reading it here.
          </p>
        </div>
      ) : (
        <div className="bg-[#0a0c10] rounded-[16px] overflow-hidden">
          {docs.map((d, i) => (
            <div
              key={d.id}
              data-testid={`reading-row-${d.id}`}
              className={`flex items-center gap-[12px] p-[16px] ${i > 0 ? "border-t border-[#1d2132]" : ""}`}
            >
              <div className="size-[40px] rounded-full shrink-0 overflow-hidden">
                <img src={docsIcon} alt="" className="size-[40px]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[15px] leading-[20px] truncate">{d.name}</p>
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[12px] leading-[16px]">{formatSize(d.size)}</p>
              </div>
              <ExtractStatusPill status={d.extractStatus} testId={`reading-status-${d.id}`} />
            </div>
          ))}
          <div className="flex items-center justify-between px-[16px] py-[12px] border-t border-[#1d2132] bg-[rgba(0,0,0,0.2)]">
            <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]" data-testid="text-reading-summary">
              {readCount} of {docs.length} read{warnCount ? ` · ${warnCount} need your help` : ""}
            </span>
            <button
              type="button"
              onClick={onAddMore}
              data-testid="button-reading-add-more"
              className="flex items-center justify-center gap-[4px] px-[12px] py-[6px] rounded-[100px] bg-[#222737] hover:bg-[#2c3247] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[12px]"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M6 1.5V10.5M1.5 6H10.5" stroke="#a8b9f4" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Add More
            </button>
          </div>
        </div>
      )}

      <InfoNotice
        title="Brain reads, doesn't share."
        body="Files are used only to understand your business and never shown to anyone else. Anything Brain reads from a document is advisory until you confirm it."
      />

      <div className="flex items-center gap-[16px] pt-[4px]">
        <button
          type="button"
          onClick={onViewWiki}
          data-testid="button-reading-view-wiki"
          className="flex-1 flex items-center justify-center px-[20px] h-[44px] rounded-[100px] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[15px] bg-[#222737] hover:bg-[#2c3247] text-[#6c779d]"
        >
          Close
        </button>
        <button
          type="button"
          onClick={onContinue}
          data-testid="button-reading-continue"
          className="flex-1 flex items-center justify-center px-[20px] h-[44px] rounded-[100px] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[15px] bg-[#4a2300] hover:bg-[#5c2c00] text-[#ff9500]"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────────── Screen 4: Everything Brain found ─────────────────────────────
 * Real obligations from GET /api/brain/ledger/obligations (advisory, conf ≤0.5). No pay path. */
type FoundTab = "all" | "payable" | "receivable";


function formatMoney(amount: string, currency: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${amount} ${currency}`;
  if (currency === "USD") {
    return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  }
  return `${n.toLocaleString("en-US")} ${currency}`;
}

function formatDue(due: string | null): string {
  if (!due) return "No due date";
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return due;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** How long after an upload we treat empty results as "still extracting" rather than "nothing found". */
const EXTRACTING_WINDOW_MS = 3 * 60 * 1000;

export function FoundScreen({ onFinish }: { onFinish: () => void }) {
  const [activeTab, setActiveTab] = useState<FoundTab>("all");

  const obligationsQuery = useQuery<Obligation[]>({
    queryKey: ["/api/brain/ledger/obligations"],
    queryFn: fetchObligations,
    refetchInterval: (q) => ((q.state.data?.length ?? 0) === 0 ? 15000 : false),
  });
  // No queryFn — consistent with every other consumer of this key (FinancesPage,
  // brainQueue, brainVendors, etc.), which all rely on the default fetcher and
  // access .counterparties on the result.  The Map is built defensively in a
  // useMemo below so it is always a real Map regardless of cache shape.
  const counterpartiesQuery = useQuery<CounterpartiesResponse>({
    queryKey: ["/api/brain/ledger/counterparties"],
  });
  /* Upload recency: if the newest document was uploaded within the last few
     minutes, an empty obligations list means "extraction still running", not
     "nothing found". Uses the same documents cache as the rest of the modal. */
  const docsQuery = useQuery<SourceDocument[]>({ queryKey: ["/api/integrations/documents"] });
  const latestUploadMs = useMemo(() => {
    let latest = 0;
    for (const d of docsQuery.data ?? []) {
      const t = new Date(d.uploadedAt).getTime();
      if (Number.isFinite(t) && t > latest) latest = t;
    }
    return latest;
  }, [docsQuery.data]);
  /* Ticking clock so the extracting state flips to the genuine empty state
     on its own once the window passes, without any user action. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);
  const recentlyUploaded = latestUploadMs > 0 && now - latestUploadMs < EXTRACTING_WINDOW_MS;

  const obligations = obligationsQuery.data ?? [];
  // Build a Map defensively: the raw cache can be either CounterpartyLite[] or
  // { counterparties: CounterpartyLite[] } depending on which consumer populated it.
  const cpMap = useMemo(() => {
    const raw = counterpartiesQuery.data;
    const list: CounterpartyLite[] = Array.isArray(raw)
      ? raw
      : (raw?.counterparties ?? []);
    const m = new Map<string, string>();
    for (const c of list) m.set(c.id, c.display_name ?? c.name ?? c.id);
    return m;
  }, [counterpartiesQuery.data]);

  const payables = useMemo(() => obligations.filter((o) => !isReceivable(o)), [obligations]);
  const receivables = useMemo(() => obligations.filter((o) => isReceivable(o)), [obligations]);

  const tabs: { id: FoundTab; label: string; count: number }[] = [
    { id: "all",        label: "All",      count: obligations.length },
    { id: "payable",    label: "You Pay",  count: payables.length },
    { id: "receivable", label: "Pays You", count: receivables.length },
  ];

  const visible = activeTab === "payable" ? payables : activeTab === "receivable" ? receivables : obligations;

  return (
    <div className="flex flex-col gap-[20px]">
      <div className="flex flex-col gap-[8px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]">
          Here's what Brain found.
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
          These are insights and recommendations based on your connected data.
        </p>
      </div>

      {/* Advisory banner */}
      <div className="rounded-[12px] bg-[#4a2300] border border-[rgba(255,148,0,0.2)] p-[8px] flex items-start gap-[8px]">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 mt-[1px]">
          <circle cx="8" cy="8" r="7" stroke="#ff9400" strokeWidth="1.3" />
          <path d="M8 7.3v4.2" stroke="#ff9400" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="8" cy="4.7" r="0.9" fill="#ff9400" />
        </svg>
        <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#ff9400] text-[13px] leading-[18px]">
          Everything below was extracted from documents and is advisory. Brain will never pay or act on it without your confirmation.
        </p>
      </div>

      {/* Results */}
      <div className="flex items-center gap-[10px]">
        <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[13px] leading-[16px] whitespace-nowrap">
          Results
        </span>
        <span className="flex-1 h-px bg-[#1d2132]" aria-hidden />
      </div>

      {obligationsQuery.isLoading ? (
        <div className="flex items-center gap-[10px] bg-[#0a0c10] rounded-[12px] px-[14px] py-[12px]" data-testid="status-obligations-loading">
          <span className="size-[16px] rounded-full border-2 border-[#7631EE] border-t-transparent animate-spin shrink-0" aria-hidden />
          <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]">Reading obligations from your documents…</span>
        </div>
      ) : obligationsQuery.isError ? (
        <div className="bg-[#0a0c10] rounded-[16px] p-[20px] text-center" data-testid="status-obligations-error">
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#fca5a5] text-[14px] leading-[20px]">
            Couldn't load obligations right now. You can finish and check back later.
          </p>
        </div>
      ) : obligations.length === 0 && recentlyUploaded ? (
        <div className="flex items-start gap-[10px] bg-[#0a0c10] rounded-[12px] px-[14px] py-[12px]" data-testid="status-obligations-extracting">
          <span className="size-[16px] rounded-full border-2 border-[#7631EE] border-t-transparent animate-spin shrink-0 mt-[2px]" aria-hidden />
          <p className="[font-family:'Gilroy',sans-serif] leading-[20px] text-[14px]">
            <span className="font-semibold text-[#a8b9f4]">Brain is reading your documents.</span>{" "}
            <span className="font-medium text-[#6c779d]">This usually takes 1 to 2 minutes. Check back shortly, or stay here and we'll update automatically.</span>
          </p>
        </div>
      ) : obligations.length === 0 ? (
        <div data-testid="status-obligations-empty">
          <p className="[font-family:'Gilroy',sans-serif] leading-[20px] text-[14px]">
            <span className="font-semibold text-[#a8b9f4]">Nothing to show yet.</span>{" "}
            <span className="font-medium text-[#6c779d]">Brain hasn't extracted any obligations from your documents yet. This can take a few minutes, or extraction may not be available for these files.</span>
          </p>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex items-center gap-[2px] p-[2px] rounded-[400px] bg-[#06070a]">
            {tabs.map((t) => {
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  data-testid={`tab-found-${t.id}`}
                  className={`flex-1 flex items-center justify-center gap-[4px] px-[8px] py-[6px] rounded-[100px] transition-colors ${
                    active ? "bg-[#4a2300]" : "hover:bg-[#11141b]"
                  }`}
                >
                  <span className={`[font-family:'Gilroy',sans-serif] font-semibold text-[12px] whitespace-nowrap ${active ? "text-[#ff9500]" : "text-[#414965]"}`}>
                    {t.label}
                  </span>
                  <span className={`flex items-center justify-center min-w-[16px] px-[2px] rounded-[4px] [font-family:'Gilroy',sans-serif] font-semibold text-[11px] leading-[12px] ${
                    active ? "bg-[#ff9500] text-[#4a2300]" : "bg-[#222737] text-[#6c779d]"
                  }`}>
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Obligation rows */}
          <div className="bg-[#0a0c10] rounded-[16px] overflow-hidden">
            {visible.map((o, i) => (
              <div
                key={o.id}
                data-testid={`obligation-row-${o.id}`}
                className={`flex items-start gap-[12px] p-[16px] ${i > 0 ? "border-t border-[#1d2132]" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-[8px] flex-wrap">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[15px] leading-[20px] truncate">
                      {counterpartyName(o.counterparty_id, cpMap)}
                    </p>
                    <ConfidencePill confidence={o.confidence} />
                  </div>
                  <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px] leading-[18px] mt-[2px]">
                    {isReceivable(o) ? "Owed to you" : "You owe"} · Due {formatDue(o.due_date)}{o.status ? ` · ${o.status}` : ""}
                  </p>
                </div>
                <span className="shrink-0 [font-family:'JetBrains_Mono',monospace] font-semibold text-[#a8b9f4] text-[14px]" data-testid={`obligation-amount-${o.id}`}>
                  {formatMoney(o.amount_due, o.currency)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={onFinish}
        data-testid="button-found-finish"
        className="flex w-full items-center justify-center px-[20px] h-[44px] rounded-[100px] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[15px] bg-[#123509] hover:bg-[#173f0c] text-[#42bf23]"
      >
        Finish
      </button>
    </div>
  );
}
