import { useCallback, useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata, type PlaidLinkError } from "react-plaid-link";

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
 * ────────────────────────────────────────────────────────────────────────── */

type Screen = "home" | "categories" | "bank" | "providers" | "documents";

type CategoryId = "bank" | "accounting" | "payroll" | "tax" | "payments" | "documents";

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
  bank:       { label: "Bank Accounts",  sub: "Checking, savings & credit via Plaid", target: "bank",      accent: "#22c55e" },
  accounting: { label: "Accounting",     sub: "QuickBooks, Xero, Wave",                target: "providers", accent: "#7631EE" },
  payroll:    { label: "Payroll",        sub: "Gusto, Rippling, ADP",                  target: "providers", accent: "#a8b9f4" },
  tax:        { label: "Tax",            sub: "Returns, filings & tax documents",      target: "documents", accent: "#ff9500" },
  payments:   { label: "Payments",       sub: "Stripe, PayPal, Square",                target: "providers", accent: "#635BFF" },
  documents:  { label: "Documents",      sub: "Statements, contracts, spreadsheets",   target: "documents", accent: "#ff9500" },
};

const CATEGORY_ORDER: CategoryId[] = ["bank", "accounting", "payroll", "payments", "tax", "documents"];

const PROVIDERS: Partial<Record<CategoryId, Provider[]>> = {
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

            <DialogPrimitive.Title className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[16px] leading-[20px]">
              {headerTitle}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description id="add-source-description" className="sr-only">
              Connect and manage the data sources Brain reads from.
            </DialogPrimitive.Description>

            <DialogPrimitive.Close
              data-testid="button-add-source-close"
              aria-label="Close"
              className="absolute right-[11px] top-[11px] size-[32px] rounded-full bg-[#222737] flex items-center justify-center hover:bg-[#2c3247] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 1L11 11M11 1L1 11" stroke="#a8b9f4" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </DialogPrimitive.Close>
          </div>

          {/* Body */}
          <div className="w-full flex-1 min-h-0 overflow-y-auto overflow-x-hidden" data-testid="add-source-scroll">
            <div className="flex flex-col gap-[24px] p-[24px] w-full">
              {screen === "home" && <ConnectedSources open={open} onAddNew={() => push("categories")} />}
              {screen === "categories" && <CategoryPicker onPick={openCategory} />}
              {screen === "bank" && <BankConnect onDone={back} />}
              {screen === "providers" && <ProviderPicker category={activeCategory} />}
              {screen === "documents" && (
                <DocumentUpload category={activeCategory === "tax" ? "tax" : "general"} onDone={back} />
              )}
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
    <div className="flex flex-col gap-[16px]">
      <div className="flex flex-col gap-[8px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]">
          Sources Brain reads from
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
          Everything connected to your financial memory. Remove any source any time — Brain only reads, never writes without your approval.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-[32px]">
          <span className="size-[20px] rounded-full border-2 border-[#7631EE] border-t-transparent animate-spin" aria-hidden />
        </div>
      ) : total === 0 ? (
        <div className="bg-[#0a0c10] rounded-[16px] p-[20px] border border-[#1d2132]" data-testid="empty-connected-sources">
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
        Connect a new source
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
      className="flex items-center gap-[12px] bg-[#0a0c10] rounded-[12px] p-[12px] border border-[#1d2132]"
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
        className="px-[10px] py-[6px] rounded-[8px] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[14px] text-[#fca5a5] hover:bg-[rgba(239,68,68,0.1)] transition-colors disabled:opacity-50"
      >
        Remove
      </button>
    </div>
  );
}

/* ───────────────────────────── Screen: Category picker ───────────────────────────── */
function CategoryPicker({ onPick }: { onPick: (cat: CategoryId) => void }) {
  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex flex-col gap-[8px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]">
          What would you like to connect?
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
          Pick a category. Brain treats every source the same way — reads it, structures it, and adds it to your financial memory.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-[12px]">
        {CATEGORY_ORDER.map((cat) => {
          const m = CATEGORY_META[cat];
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onPick(cat)}
              data-testid={`button-category-${cat}`}
              className="flex items-center gap-[12px] bg-[#0a0c10] rounded-[12px] p-[14px] border border-[#1d2132] hover:border-[#2c3247] transition-colors text-left"
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
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M6 3.5L10.5 8L6 12.5" stroke="#6c779d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CategoryIcon({ cat, accent }: { cat: CategoryId; accent: string }) {
  const paths: Record<CategoryId, React.ReactNode> = {
    bank: <path d="M4 9h12M5 9v6m4-6v6m2-6v6m4-6v6M4 16h12M10 3l6 3H4l6-3Z" stroke={accent} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />,
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
              className="flex items-center gap-[12px] bg-[#0a0c10] rounded-[12px] p-[12px] border"
              style={{ borderColor: "#22c55e" }}
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
          Brain reads from each tool you connect — never writes back without your explicit approval.
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
              className="flex items-center gap-[12px] bg-[#0a0c10] rounded-[12px] p-[12px] border transition-colors text-left disabled:cursor-default"
              style={{ borderColor: isConnected ? "#22c55e" : "#1d2132" }}
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
            <div className="flex items-center gap-[10px] bg-[#0a0c10] rounded-[10px] px-[12px] py-[8px] border border-[#1d2132]">
              <span className="size-[16px] rounded-full border-2 border-[#7631EE] border-t-transparent animate-spin shrink-0" aria-hidden />
              <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]">Uploading…</span>
            </div>
          )}
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-[12px] bg-[#0a0c10] rounded-[10px] px-[12px] py-[8px] border border-[#1d2132]" data-testid={`doc-row-${d.id}`}>
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
