import { useCallback, useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata, type PlaidLinkError } from "react-plaid-link";
import doneIcon from "@assets/Done_1781789102202.png";
import reviewingIcon from "@assets/Reviewing_1781789102203.png";
import warningIcon from "@assets/Warning_1781789172904.png";
import closeIcon from "@assets/Close_1783293571882.png";

/* ──────────────────────────────────────────────────────────────────────────
 *  Add Source — paginated wizard for connecting data sources to Brain.
 *
 *  Aligned with the Brain data-ingestion architecture: source-agnostic
 *  connectors organised by capability (bank / accounting / payroll / tax /
 *  payments / documents). Plaid is one connector, not the centre.
 *
 *  Screen stack:
 *    home       → connected sources (remove any) + "Connect a new source"
 *    categories → choose a source category
 *    bank       → connect a bank via Plaid
 *    providers  → pick a provider within a category (Stripe live, rest soon)
 *    documents  → upload documents (registered as a document source)
 *    reading    → Brain reads the connected sources + initial reading
 *    found      → "Here's everything Brain found" insight summary
 *
 *  Header shows onboarding-style pagination dots (no titles). The four primary
 *  steps are home → categories → reading → found; the leaf connect screens
 *  (bank / providers / documents) are sub-flows of the categories step.
 * ────────────────────────────────────────────────────────────────────────── */

type Screen = "home" | "categories" | "bank" | "providers" | "documents" | "reading" | "found";

/** Primary step index per screen (leaf connect screens stay on the categories step). */
const STEP_INDEX: Record<Screen, number> = {
  home: 0,
  categories: 1,
  bank: 1,
  providers: 1,
  documents: 1,
  reading: 2,
  found: 3,
};
const TOTAL_STEPS = 4;

type CategoryId = "bank" | "crypto" | "accounting" | "payroll" | "tax" | "payments" | "documents";

interface AddSourceModalProps {
  open: boolean;
  onClose: () => void;
}

/* ─── Server types ─── */
type BankAccountInfo = {
  accountId: string;
  name: string;
  mask: string | null;
  subtype: string | null;
  type: string | null;
};
type BankConnectionInfo = {
  itemId: string;
  institutionId: string | null;
  institutionName: string;
  accounts: BankAccountInfo[];
  connectedAt: string;
};
type ToolConnection = {
  userId: string;
  toolId: string;
  status: "connected" | "error";
  accountLabel?: string;
  connectedAt: string;
};
type SourceDocument = {
  id: string;
  userId: string;
  name: string;
  size: number;
  mimeType: string | null;
  category: string | null;
  uploadedAt: string;
};

/* ─── Catalog ─── */
type Provider = { id: string; name: string; logo: string; bg: string; light?: boolean; live?: boolean };

const CATEGORY_META: Record<CategoryId, { label: string; sub: string; target: Screen; accent: string }> = {
  bank:       { label: "Bank Accounts",  sub: "Checking, savings and credit via Plaid", target: "bank",      accent: "#22c55e" },
  crypto:     { label: "Crypto Wallets", sub: "MetaMask, Coinbase Wallet, WalletConnect", target: "providers", accent: "#ff9500" },
  accounting: { label: "Accounting",     sub: "QuickBooks, Xero, Wave",                target: "providers", accent: "#7631EE" },
  payroll:    { label: "Payroll",        sub: "Gusto, Rippling, ADP",                  target: "providers", accent: "#a8b9f4" },
  tax:        { label: "Tax",            sub: "Returns, filings and tax documents",      target: "documents", accent: "#ff9500" },
  payments:   { label: "Payments",       sub: "Stripe, PayPal, Square",                target: "providers", accent: "#635BFF" },
  documents:  { label: "Documents",      sub: "Statements, contracts, spreadsheets",   target: "documents", accent: "#ff9500" },
};

const CATEGORY_ORDER: CategoryId[] = ["bank", "crypto", "accounting", "payroll", "payments", "tax", "documents"];

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

const TOOL_LABELS: Record<string, string> = {
  stripe: "Stripe", quickbooks: "QuickBooks", xero: "Xero", wave: "Wave",
  gusto: "Gusto", rippling: "Rippling", adp: "ADP", paypal: "PayPal", square: "Square",
};

// Reverse map: provider/tool id → its category (for counter tags).
const TOOL_CATEGORY: Record<string, CategoryId> = Object.entries(PROVIDERS).reduce(
  (acc, [cat, list]) => {
    (list ?? []).forEach((p) => { acc[p.id] = cat as CategoryId; });
    return acc;
  },
  {} as Record<string, CategoryId>,
);

export function AddSourceModal({ open, onClose }: AddSourceModalProps) {
  const [stack, setStack] = useState<Screen[]>(["home"]);
  const [activeCategory, setActiveCategory] = useState<CategoryId>("accounting");
  const screen = stack[stack.length - 1];

  const push = useCallback((s: Screen) => setStack((st) => [...st, s]), []);
  const back = useCallback(() => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)), []);

  // Reset to home each time the modal re-opens.
  useEffect(() => {
    if (open) {
      setStack(["home"]);
      setActiveCategory("accounting");
    }
  }, [open]);

  const headerTitle =
    screen === "home" ? "Your Sources" :
    screen === "categories" ? "Add a Source" :
    screen === "bank" ? "Connect a Bank" :
    screen === "providers" ? CATEGORY_META[activeCategory].label :
    screen === "reading" ? "Reading Your Sources" :
    screen === "found" ? "Everything Brain Found" :
    activeCategory === "tax" ? "Tax Documents" : "Upload Documents";

  const openCategory = useCallback((cat: CategoryId) => {
    setActiveCategory(cat);
    push(CATEGORY_META[cat].target);
  }, [push]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          data-testid="add-source-backdrop"
        />
        <DialogPrimitive.Content
          aria-describedby="add-source-description"
          className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] border-solid flex flex-col items-start overflow-hidden rounded-[24px] w-[480px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          data-testid="add-source-modal"
        >
          {/* Header — back, title, close */}
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-[#1d2132] border-solid h-[56px] relative shrink-0 w-full flex items-center justify-center">
            {stack.length > 1 && (
              <button
                type="button"
                onClick={back}
                aria-label="Back"
                data-testid="button-add-source-back"
                className="absolute left-[11px] top-[11px] size-[32px] rounded-full bg-[#222737] flex items-center justify-center hover:bg-[#2c3247] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M7.5 1.5L3 6L7.5 10.5" stroke="#a8b9f4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}

            <DialogPrimitive.Title className="sr-only">{headerTitle}</DialogPrimitive.Title>
            <StepDots total={TOTAL_STEPS} current={STEP_INDEX[screen]} />
            <DialogPrimitive.Description id="add-source-description" className="sr-only">
              Connect and manage the data sources Brain reads from.
            </DialogPrimitive.Description>

            <DialogPrimitive.Close
              data-testid="button-add-source-close"
              aria-label="Close"
              className="absolute right-[11px] top-[11px] size-[32px] p-0 hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
            >
              <img src={closeIcon} alt="" className="size-[32px] rounded-full" />
            </DialogPrimitive.Close>
          </div>

          {/* Body */}
          <div className="w-full flex-1 min-h-0 overflow-y-auto overflow-x-hidden" data-testid="add-source-scroll">
            <div className="flex flex-col gap-[24px] p-[24px] w-full">
              {screen === "home" && <ConnectedSources open={open} onAddNew={() => push("categories")} />}
              {screen === "categories" && <CategoryPicker onPick={openCategory} onContinue={() => push("reading")} />}
              {screen === "bank" && <BankConnect onDone={back} />}
              {screen === "providers" && <ProviderPicker category={activeCategory} />}
              {screen === "documents" && (
                <DocumentUpload category={activeCategory === "tax" ? "tax" : "general"} onDone={back} />
              )}
              {screen === "reading" && (
                <ReadingScreen onViewWiki={onClose} onContinue={() => push("found")} onAddMore={() => push("categories")} />
              )}
              {screen === "found" && <FoundScreen onFinish={onClose} />}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ───────────────────────────── Screen: Connected sources ───────────────────────────── */
function ConnectedSources({ open, onAddNew }: { open: boolean; onAddNew: () => void }) {
  const banksQuery = useQuery<BankConnectionInfo[]>({
    queryKey: ["/api/integrations/plaid/connections"],
    enabled: open,
  });
  const toolsQuery = useQuery<ToolConnection[]>({
    queryKey: ["/api/integrations/connections"],
    enabled: open,
  });
  const docsQuery = useQuery<SourceDocument[]>({
    queryKey: ["/api/integrations/documents"],
    enabled: open,
  });

  const banks = banksQuery.data ?? [];
  const tools = toolsQuery.data ?? [];
  const docs = docsQuery.data ?? [];

  const disconnectBank = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await apiRequest("POST", "/api/integrations/plaid/disconnect", { itemId });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/integrations/plaid/connections"] }),
  });
  const disconnectTool = useMutation({
    mutationFn: async (toolId: string) => {
      const res = await apiRequest("POST", `/api/integrations/${toolId}/disconnect`);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/integrations/connections"] }),
  });
  const removeDoc = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/integrations/documents/${id}/delete`);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/integrations/documents"] }),
  });

  const isLoading = banksQuery.isLoading || toolsQuery.isLoading || docsQuery.isLoading;
  const total = banks.length + tools.length + docs.length;

  return (
    <div className="flex flex-col gap-[20px]">
      <div className="flex flex-col gap-[8px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]">
          Sources Brain reads from
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
          Everything connected to your financial memory. Remove any source any time. Brain only reads, and never writes without your approval.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-[32px]">
          <span className="size-[20px] rounded-full border-2 border-[#7631EE] border-t-transparent animate-spin" aria-hidden />
        </div>
      ) : total === 0 ? (
        <div className="bg-[#0a0c10] rounded-[16px] p-[20px]" data-testid="empty-connected-sources">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[15px]">No sources yet</p>
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px] mt-[4px]">
            Connect a bank, your tools, or upload documents to give Brain its first look at your business.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-[16px]">
          {banks.length > 0 && (
            <SourceGroup label="Banks">
              {banks.map((b) => (
                <SourceRow
                  key={b.itemId}
                  testId={`source-bank-${b.itemId}`}
                  badge={b.institutionName.slice(0, 2).toUpperCase()}
                  badgeBg="#22c55e"
                  badgeColor="#062b13"
                  title={b.institutionName}
                  subtitle={`${b.accounts.length} account${b.accounts.length === 1 ? "" : "s"}${b.accounts[0]?.mask ? ` · ····${b.accounts[0].mask}` : ""}`}
                  removing={disconnectBank.isPending}
                  onRemove={() => disconnectBank.mutate(b.itemId)}
                  removeTestId={`button-remove-bank-${b.itemId}`}
                />
              ))}
            </SourceGroup>
          )}

          {tools.length > 0 && (
            <SourceGroup label="Tools">
              {tools.map((t) => (
                <SourceRow
                  key={t.toolId}
                  testId={`source-tool-${t.toolId}`}
                  badge={(TOOL_LABELS[t.toolId] ?? t.toolId).slice(0, 2).toUpperCase()}
                  badgeBg="#240757"
                  badgeColor="#a78bfa"
                  title={TOOL_LABELS[t.toolId] ?? t.toolId}
                  subtitle={t.accountLabel ? `Connected · ${t.accountLabel}` : "Connected"}
                  removing={disconnectTool.isPending}
                  onRemove={() => disconnectTool.mutate(t.toolId)}
                  removeTestId={`button-remove-tool-${t.toolId}`}
                />
              ))}
            </SourceGroup>
          )}

          {docs.length > 0 && (
            <SourceGroup label="Documents">
              {docs.map((d) => (
                <SourceRow
                  key={d.id}
                  testId={`source-doc-${d.id}`}
                  badge="DOC"
                  badgeBg="#4a2300"
                  badgeColor="#ff9500"
                  title={d.name}
                  subtitle={`${d.category ? `${capitalize(d.category)} · ` : ""}${formatSize(d.size)}`}
                  removing={removeDoc.isPending}
                  onRemove={() => removeDoc.mutate(d.id)}
                  removeTestId={`button-remove-doc-${d.id}`}
                />
              ))}
            </SourceGroup>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onAddNew}
        data-testid="button-connect-new-source"
        className="flex items-center justify-center gap-[10px] h-[48px] rounded-[12px] [font-family:'Gilroy',sans-serif] font-semibold text-[15px] leading-[18px] transition-colors bg-[#4a2300] hover:bg-[#5a2c00] text-[#ff9500]"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <path d="M9 3.75V14.25M3.75 9H14.25" stroke="#ff9500" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Add New Source
      </button>
    </div>
  );
}

function SourceGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[8px]">
      <div className="flex items-center gap-[8px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[12px] leading-[14px] uppercase tracking-[0.04em] whitespace-nowrap">
          {label}
        </p>
        <div className="flex-1 h-px bg-[#1d2132]" />
      </div>
      {children}
    </div>
  );
}

function SourceRow({
  testId, badge, badgeBg, badgeColor, title, subtitle, onRemove, removing, removeTestId,
}: {
  testId: string;
  badge: string;
  badgeBg: string;
  badgeColor: string;
  title: string;
  subtitle: string;
  onRemove: () => void;
  removing: boolean;
  removeTestId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex items-center gap-[12px] bg-[#0a0c10] rounded-[12px] p-[12px]"
    >
      <div
        className="size-[32px] rounded-full flex items-center justify-center shrink-0 font-bold text-[11px] [font-family:'Gilroy',sans-serif]"
        style={{ background: badgeBg, color: badgeColor }}
      >
        {badge}
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[14px] leading-[18px] truncate">
          {title}
        </span>
        <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[11px] leading-[14px] truncate">
          {subtitle}
        </span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        data-testid={removeTestId}
        aria-label="Remove"
        className="shrink-0 size-[36px] rounded-full bg-[#350011] hover:bg-[#4a0018] flex items-center justify-center transition-colors disabled:opacity-50"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <path d="M3 4.5h12M7 4.5V3.3c0-.44.36-.8.8-.8h2.4c.44 0 .8.36.8.8v1.2M14 4.5l-.56 9.13c-.04.6-.54 1.07-1.14 1.07H5.7c-.6 0-1.1-.47-1.14-1.07L4 4.5M7.3 7.6v4.1M10.7 7.6v4.1" stroke="#D20344" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

/* ───────────────────────────── Screen: Category picker ───────────────────────────── */
function CategoryPicker({ onPick, onContinue }: { onPick: (cat: CategoryId) => void; onContinue: () => void }) {
  const banksQuery = useQuery<BankConnectionInfo[]>({ queryKey: ["/api/integrations/plaid/connections"] });
  const toolsQuery = useQuery<ToolConnection[]>({ queryKey: ["/api/integrations/connections"] });
  const docsQuery = useQuery<SourceDocument[]>({ queryKey: ["/api/integrations/documents"] });

  const banks = banksQuery.data ?? [];
  const tools = toolsQuery.data ?? [];
  const docs = docsQuery.data ?? [];

  const counts: Record<CategoryId, number> = {
    bank: banks.length,
    crypto: tools.filter((t) => TOOL_CATEGORY[t.toolId] === "crypto").length,
    accounting: tools.filter((t) => TOOL_CATEGORY[t.toolId] === "accounting").length,
    payroll: tools.filter((t) => TOOL_CATEGORY[t.toolId] === "payroll").length,
    payments: tools.filter((t) => TOOL_CATEGORY[t.toolId] === "payments").length,
    tax: docs.filter((d) => d.category === "tax").length,
    documents: docs.filter((d) => d.category !== "tax").length,
  };

  return (
    <div className="flex flex-col gap-[20px]">
      <div className="flex flex-col gap-[8px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]">
          What would you like to connect?
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
              className="flex items-center gap-[12px] bg-[#0a0c10] rounded-[12px] p-[14px] transition-colors text-left hover:bg-[#0f1219]"
            >
              <CategoryIcon cat={cat} accent={m.accent} />
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
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
                <path d="M6 3.5L10.5 8L6 12.5" stroke="#6c779d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onContinue}
        data-testid="button-categories-continue"
        className="flex w-full items-center justify-center px-[20px] py-[14px] rounded-[100px] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[15px] bg-[#4a2300] hover:bg-[#5c2c00] text-[#ff9500]"
      >
        Continue
      </button>
    </div>
  );
}

function CategoryIcon({ cat, accent }: { cat: CategoryId; accent: string }) {
  const paths: Record<CategoryId, React.ReactNode> = {
    bank: <path d="M4 9h12M5 9v6m4-6v6m2-6v6m4-6v6M4 16h12M10 3l6 3H4l6-3Z" stroke={accent} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />,
    crypto: <g stroke={accent} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none"><circle cx="10" cy="10" r="6.5" /><path d="M8 7.5h3.2a1.6 1.6 0 010 3.2H8m0 0h3.4a1.6 1.6 0 010 3.2H8M8 6v8.5M9.8 6v1.5M9.8 13v1.5" /></g>,
    accounting: <path d="M5 4h10v12H5zM7.5 7h5M7.5 10h5M7.5 13h3" stroke={accent} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />,
    payroll: <path d="M10 5a5 5 0 100 10 5 5 0 000-10Zm0 2v6m-1.5-4.5h2.2a1.3 1.3 0 010 2.6H8.5m0 0h2.2a1.3 1.3 0 010 2.6H8.5" stroke={accent} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />,
    tax: <path d="M6 4h8v12H6zM8 7h4M8 10h4M8 13h2" stroke={accent} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />,
    payments: <path d="M3.5 6.5h13v7h-13zM3.5 9h13" stroke={accent} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />,
    documents: <path d="M6 3h5l3 3v11H6zM11 3v3h3" stroke={accent} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />,
  };
  return (
    <div className="size-[40px] rounded-[10px] flex items-center justify-center shrink-0" style={{ background: `${accent}1a` }}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>{paths[cat]}</svg>
    </div>
  );
}

/* ───────────────────────────── Screen: Bank (Plaid) ───────────────────────────── */
function BankConnect({ onDone }: { onDone: () => void }) {
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
      <div className="flex flex-col gap-[8px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]">
          Connect your bank
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
          Brain reads your account activity to understand what&apos;s coming in and going out. Add checking, savings, and credit cards in a minute.
        </p>
      </div>

      {connections.length > 0 && (
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

      <InfoNotice
        title="Secure by Default"
        body="Brain never sees or stores your bank password. We connect through Plaid — trusted by Venmo, Robinhood, and American Express. Brain only reads with your permission."
      />

      {connections.length > 0 && (
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
function ProviderPicker({ category }: { category: CategoryId }) {
  const providers = PROVIDERS[category] ?? [];
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toolsQuery = useQuery<ToolConnection[]>({ queryKey: ["/api/integrations/connections"] });
  const connected = new Set((toolsQuery.data ?? []).map((c) => c.toolId));

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
      <div className="flex flex-col gap-[8px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]">
          Connect {CATEGORY_META[category].label.toLowerCase()}
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
          Brain reads from each tool you connect, and never writes back without your explicit approval.
        </p>
      </div>

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
          const isConnected = connected.has(p.id);
          const isConnecting = connecting === p.id;
          const clickable = isConnected || p.live;
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
                  {isConnected ? "Connected · tap to remove" : isConnecting ? "Connecting…" : p.live ? "Tap to connect" : "Coming soon"}
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
function DocumentUpload({ category, onDone }: { category: string; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const docsQuery = useQuery<SourceDocument[]>({ queryKey: ["/api/integrations/documents"] });
  const docs = (docsQuery.data ?? []).filter((d) => (category === "tax" ? d.category === "tax" : true));

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const res = await apiRequest("POST", "/api/integrations/documents", {
        name: file.name,
        size: file.size,
        mimeType: file.type || null,
        category,
      });
      return res.json();
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
      <div className="flex flex-col gap-[8px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]">
          {category === "tax" ? "Upload tax documents" : "Upload documents"}
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
          {category === "tax"
            ? "Returns, filings, and notices. Brain reads them to keep your tax picture current."
            : "Statements, contracts, or anything that explains how your business works. The more Brain knows, the better it can help."}
        </p>
      </div>

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

      {(uploadMut.isPending || docs.length > 0) && (
        <div className="flex flex-col gap-[6px]">
          {uploadMut.isPending && (
            <div className="flex items-center gap-[10px] bg-[#0a0c10] rounded-[10px] px-[12px] py-[8px]">
              <span className="size-[16px] rounded-full border-2 border-[#7631EE] border-t-transparent animate-spin shrink-0" aria-hidden />
              <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]">Uploading…</span>
            </div>
          )}
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-[12px] bg-[#0a0c10] rounded-[10px] px-[12px] py-[8px]" data-testid={`doc-row-${d.id}`}>
              <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[13px] truncate flex-1 min-w-0">{d.name}</span>
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

      <InfoNotice
        title="Brain Reads but Doesn't Share"
        body="Files are used only to understand your business and never shown to anyone else. You can delete any file at any time."
      />

      {docs.length > 0 && (
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
function InfoNotice({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <div className="flex items-start gap-[10px] rounded-[12px] border border-[rgba(255,149,0,0.25)] bg-[rgba(74,35,0,0.25)] p-[14px]">
      <span className="size-[18px] rounded-full bg-[#4a2300] flex items-center justify-center shrink-0 mt-[1px]">
        <span className="[font-family:'Gilroy',sans-serif] font-bold text-[11px] text-[#ff9500] leading-none">!</span>
      </span>
      <div className="flex-1 min-w-0">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#ff9500] text-[13px] leading-[18px]">{title}</p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px] leading-[18px] mt-[2px]">{body}</p>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ───────────────────────────── Header pagination dots ───────────────────────────── */
function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div
      className="flex items-center gap-[8px] px-[12px] py-[6px] rounded-full bg-[#1a0d33]"
      data-testid="add-source-step-dots"
      aria-hidden
    >
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`block rounded-full transition-colors ${
            i === current ? "bg-[#7631EE] size-[8px]" : "bg-[rgba(118,49,238,0.3)] size-[6px]"
          }`}
        />
      ))}
    </div>
  );
}

/* ───────────────────────────── Screen 3: Reading the sources ───────────────────────────── */
type ReadStatus = "done" | "processing" | "warning";
type ReadFile = { id: string; name: string; size: string; status: ReadStatus; detail: string };

const READING_FILES: ReadFile[] = [
  { id: "f1", name: "2024_chase_statements.zip", size: "8.2 MB", status: "done",       detail: "Processed · 12 statements · 1,847 transactions · 12 vendors" },
  { id: "f2", name: "vendor_contracts.pdf",      size: "3.1 MB", status: "done",       detail: "Processed · 8 contracts, payment terms extracted" },
  { id: "f3", name: "2023_invoices_export.csv",  size: "4.2 MB", status: "processing", detail: "Finding customers and recurring patterns" },
  { id: "f4", name: "receipt_2142.jpg",          size: "1.2 MB", status: "warning",    detail: "Hard to read" },
];

const READ_STATUS_ICON: Record<ReadStatus, string> = {
  done: doneIcon,
  processing: reviewingIcon,
  warning: warningIcon,
};
const READ_STATUS_ALT: Record<ReadStatus, string> = {
  done: "Done",
  processing: "Reviewing",
  warning: "Needs your help",
};

function ReadStatusIcon({ status }: { status: ReadStatus }) {
  return (
    <img
      src={READ_STATUS_ICON[status]}
      alt={READ_STATUS_ALT[status]}
      className={`size-[28px] shrink-0${status === "processing" ? " animate-spin" : ""}`}
    />
  );
}

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-[#0a0c10] rounded-[12px] p-[14px]">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[20px] leading-[24px]">{value}</p>
      <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px] leading-[18px] mt-[2px]">{label}</p>
    </div>
  );
}

function ReadingScreen({
  onViewWiki, onContinue, onAddMore,
}: { onViewWiki: () => void; onContinue: () => void; onAddMore: () => void }) {
  const doneCount = READING_FILES.filter((f) => f.status === "done").length;
  const warningCount = READING_FILES.filter((f) => f.status === "warning").length;

  return (
    <div className="flex flex-col gap-[20px]">
      <div className="flex flex-col gap-[8px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]">
          Reading your sources
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
          Brain is reviewing your new connected sources. This usually takes a few minutes.
        </p>
      </div>

      <div className="bg-[#0a0c10] rounded-[16px] overflow-hidden">
        {READING_FILES.map((f, i) => (
          <div
            key={f.id}
            data-testid={`reading-row-${f.id}`}
            className={`flex items-start gap-[12px] p-[16px] ${i > 0 ? "border-t border-[#1d2132]" : ""}`}
          >
            <ReadStatusIcon status={f.status} />
            <div className="flex-1 min-w-0">
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[15px] leading-[20px] truncate">{f.name}</p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px] leading-[18px] mt-[2px]">{f.detail}</p>
            </div>
            <span className="shrink-0 px-[8px] py-[3px] rounded-[22px] bg-[#222737] border border-[rgba(108,119,157,0.2)] [font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[12px]">
              {f.size}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between px-[16px] py-[12px] border-t border-[#1d2132] bg-[rgba(0,0,0,0.2)]">
          <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]">
            {doneCount} of {READING_FILES.length} files done{warningCount ? ` · ${warningCount} needs your help` : ""}
          </span>
          <button
            type="button"
            onClick={onAddMore}
            data-testid="button-reading-add-more"
            className="flex items-center gap-[4px] px-[12px] py-[6px] rounded-[100px] bg-[#222737] hover:bg-[#2c3247] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[12px]"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M6 1.5V10.5M1.5 6H10.5" stroke="#a8b9f4" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Add More
          </button>
        </div>
      </div>

      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[13px] uppercase tracking-wide pt-[4px]">
        What Brain Learned So Far
      </p>
      <div className="grid grid-cols-2 gap-[8px]">
        <StatCell value="31"    label="Vendors Identified" />
        <StatCell value="14"    label="Recurring Bills Found" />
        <StatCell value="$842K" label="In Transactions Read" />
        <StatCell value="2 Years" label="History Covered" />
      </div>

      <InfoNotice
        title="Brain reads, doesn't share."
        body="Files are encrypted, used only to understand your business, and never shown to anyone else. You can delete any file at any time."
      />

      <div className="flex items-center gap-[12px] pt-[4px]">
        <button
          type="button"
          onClick={onViewWiki}
          data-testid="button-reading-view-wiki"
          className="flex-1 flex items-center justify-center px-[20px] py-[14px] rounded-[100px] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[15px] bg-[#240757] hover:bg-[#2e0a6b] text-[#7631ee]"
        >
          View Wiki
        </button>
        <button
          type="button"
          onClick={onContinue}
          data-testid="button-reading-continue"
          className="flex-1 flex items-center justify-center px-[20px] py-[14px] rounded-[100px] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[15px] bg-[#4a2300] hover:bg-[#5c2c00] text-[#ff9500]"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────────── Screen 4: Everything Brain found ───────────────────────────── */
type FoundTab = "all" | "pay" | "customers" | "onchain" | "team";
type FoundRow = { id: string; title: string; tag?: string; detail: string; defaultChecked: boolean; unknown?: boolean };
type FoundSection = { tab: Exclude<FoundTab, "all">; label: string; rows: FoundRow[]; extraRows: FoundRow[]; moreCount: number };

const FOUND_TABS: { id: FoundTab; label: string; count: number }[] = [
  { id: "all",       label: "All",      count: 67 },
  { id: "pay",       label: "You Pay",  count: 14 },
  { id: "customers", label: "Pays You", count: 38 },
  { id: "onchain",   label: "On-Chain", count: 7 },
  { id: "team",      label: "Team",     count: 8 },
];

const FOUND_SECTIONS: FoundSection[] = [
  {
    tab: "pay", label: "You Pay These Vendors", moreCount: 12,
    rows: [
      { id: "aws",       title: "Amazon Web Services", detail: "Recurring · Hosting · ~$8K/mo",   defaultChecked: true },
      { id: "anthropic", title: "Anthropic",           detail: "Recurring · API · ~$1.8K/mo",     defaultChecked: true },
    ],
    extraRows: [
      { id: "github",   title: "GitHub",   detail: "Recurring · Dev tools · ~$420/mo", defaultChecked: true },
      { id: "figma",    title: "Figma",    detail: "Recurring · Design · ~$180/mo",    defaultChecked: true },
      { id: "linear",   title: "Linear",   detail: "Recurring · Project mgmt · ~$96/mo", defaultChecked: true },
    ],
  },
  {
    tab: "customers", label: "Your Customers", moreCount: 36,
    rows: [
      { id: "peterson",  title: "Peterson Legal Group", detail: "Top Customer · ~$240K/yr · Stripe",          defaultChecked: true },
      { id: "northstar", title: "Northstar Design Co",  detail: "$72K/yr · Pays from Base 0x8c3a...1f9e",      defaultChecked: true },
    ],
    extraRows: [
      { id: "meridian", title: "Meridian Studios", detail: "$48K/yr · Stripe",                 defaultChecked: true },
      { id: "loomly",   title: "Loomly Inc",       detail: "$31K/yr · Pays from Base 0x91a2...4c7d", defaultChecked: true },
    ],
  },
  {
    tab: "onchain", label: "On-Chain", moreCount: 36,
    rows: [
      { id: "aave",     title: "Aave",          tag: "Protocol", detail: "Lending · $1M USDC Position · Earning 4.2% APY", defaultChecked: true },
      { id: "aerodrome", title: "Aerodrome DEX", tag: "Protocol", detail: "Swapping · 8 Swaps in 90d · USDC – DAI",        defaultChecked: true },
      { id: "unknown",  title: "0x4a7e...c812", tag: "Unknown",  detail: "Frequent Recipient · $4,880 Total",             defaultChecked: false, unknown: true },
    ],
    extraRows: [
      { id: "uniswap",  title: "Uniswap",       tag: "Protocol", detail: "Swapping · 3 Swaps in 90d · ETH – USDC", defaultChecked: true },
      { id: "morpho",   title: "Morpho",        tag: "Protocol", detail: "Lending · $120K USDC Position",          defaultChecked: true },
    ],
  },
  {
    tab: "team", label: "Your Team (Payroll)", moreCount: 7,
    rows: [
      { id: "jane", title: "Jane Doe", tag: "Founding Engineer", detail: "Salary · Equity · Joined Jan 2024", defaultChecked: true },
    ],
    extraRows: [
      { id: "marcus", title: "Marcus Lee", tag: "Engineer",      detail: "Salary · Joined Mar 2024", defaultChecked: true },
      { id: "priya",  title: "Priya Shah", tag: "Designer",      detail: "Salary · Joined Jun 2024", defaultChecked: true },
    ],
  },
];

function FoundCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={`size-[20px] rounded-[4px] border flex items-center justify-center shrink-0 mt-[1px] transition-colors ${
        checked ? "bg-[#240757] border-[rgba(118,49,238,0.2)]" : "bg-[#06070a] border-[#222737]"
      }`}
    >
      {checked && (
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M4 8L7 11L12 5" stroke="#7631EE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

function FoundScreen({ onFinish }: { onFinish: () => void }) {
  const [activeTab, setActiveTab] = useState<FoundTab>("all");
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    FOUND_SECTIONS.forEach((s) => [...s.rows, ...s.extraRows].forEach((r) => { init[r.id] = r.defaultChecked; }));
    return init;
  });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => setChecked((c) => ({ ...c, [id]: !c[id] }));
  const toggleExpand = (tab: string) => setExpanded((e) => ({ ...e, [tab]: !e[tab] }));
  const visibleSections = activeTab === "all" ? FOUND_SECTIONS : FOUND_SECTIONS.filter((s) => s.tab === activeTab);

  return (
    <div className="flex flex-col gap-[20px]">
      <div className="flex flex-col gap-[8px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]">
          Here's everything Brain found.
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
          Brain reviewed your connected sources, identified what was useful, and added the most relevant information to your personal financial Wiki.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-[2px] p-[2px] rounded-[400px] bg-[#06070a]">
        {FOUND_TABS.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              data-testid={`tab-found-${t.id}`}
              className={`flex-1 flex items-center justify-center gap-[4px] px-[8px] py-[4px] rounded-[100px] transition-colors ${
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

      {/* Sections */}
      {visibleSections.map((section) => {
        const isExpanded = !!expanded[section.tab];
        const rows = isExpanded ? [...section.rows, ...section.extraRows] : section.rows;
        return (
        <div key={section.tab} className="flex flex-col gap-[10px]">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[13px] uppercase tracking-wide">
            {section.label}
          </p>
          <div className="bg-[#0a0c10] rounded-[16px] overflow-hidden">
            {rows.map((r, i) => (
              <div
                key={r.id}
                className={`flex items-start gap-[12px] p-[16px] ${i > 0 ? "border-t border-[#1d2132]" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => toggle(r.id)}
                  aria-pressed={!!checked[r.id]}
                  data-testid={`checkbox-found-${r.id}`}
                  className="shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] rounded-[4px]"
                >
                  <FoundCheckbox checked={!!checked[r.id]} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-[8px]">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[15px] leading-[20px] truncate">{r.title}</p>
                    {r.tag && (
                      <span className={`shrink-0 px-[8px] py-[2px] rounded-[22px] [font-family:'Gilroy',sans-serif] font-semibold text-[11px] leading-[14px] ${
                        r.unknown ? "bg-[#4a2300] text-[#ff9500]" : "bg-[#240757] text-[#a78bfa]"
                      }`}>
                        {r.tag}
                      </span>
                    )}
                  </div>
                  <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px] leading-[18px] mt-[2px]">{r.detail}</p>
                </div>
                {r.unknown && (
                  <button
                    type="button"
                    data-testid={`button-add-label-${r.id}`}
                    className="shrink-0 px-[10px] py-[5px] rounded-[100px] bg-[#222737] hover:bg-[#2c3247] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[12px]"
                  >
                    Add Label
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => toggleExpand(section.tab)}
              aria-expanded={isExpanded}
              data-testid={`button-more-${section.tab}`}
              className="flex w-full items-center justify-center gap-[6px] px-[16px] py-[12px] border-t border-[#1d2132] bg-[rgba(0,0,0,0.2)] hover:bg-[rgba(0,0,0,0.35)] transition-colors [font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]"
            >
              {isExpanded ? "Show less" : `${section.moreCount} more`}
              <svg
                width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden
                className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
              >
                <path d="M3 4.5L6 7.5L9 4.5" stroke="#6c779d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
        );
      })}

      <div className="rounded-[12px] bg-[#240757] border border-[rgba(118,49,238,0.2)] p-[14px]">
        <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#7631ee] text-[14px] leading-[20px]">
          You're always in control. Every automatic action shows up in your activity feed with a 60-second window to reverse it. You can also freeze Brain's autonomy any time with one tap.
        </p>
      </div>

      <button
        type="button"
        onClick={onFinish}
        data-testid="button-found-finish"
        className="flex w-full items-center justify-center px-[20px] py-[14px] rounded-[100px] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[15px] bg-[#123509] hover:bg-[#173f0c] text-[#42bf23]"
      >
        Finish
      </button>
    </div>
  );
}
