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
import { AlertCallout, MutedCallout, InfoIcon } from "@/components/Callout";
import { useAuth } from "@/lib/authContext";
import { Button } from "@/components/ui/button";
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_FORMAT_LABEL,
  isSupportedDocumentFile,
  sourceTypeForDocument,
  DOCUMENT_OBJECT_TYPES,
  documentObjectTypeSpec,
  defaultObjectTypeForCategory,
  type DocumentObjectType,
} from "@/lib/documentUpload";
import { SettingsDropdown } from "@/components/settings/SettingsDropdown";

/* ──────────────────────────────────────────────────────────────────────────
 *  Source connect screens - the mechanisms for attaching a data source to Brain.
 *
 *  Aligned with the Brain data-ingestion architecture: source-agnostic
 *  connectors organised by capability (bank / accounting / payroll / tax /
 *  payments / documents). Plaid is one connector, not the centre.
 *
 *  Each screen owns one connect mechanism and nothing else - no shell, no step
 *  machinery, no list of what is already connected. Settings → Sources is now
 *  their only host, and it already supplies the heading, the reassurance copy
 *  and the list of what is connected, so nothing here repeats them. (The
 *  first-run walkthrough used to render these full-size; it now explains rules
 *  instead of connecting sources, which retired the second presentation.) The
 *  list of connected sources lives in components/settings/SourcesSection.tsx,
 *  which is its permanent home.
 *
 * ────────────────────────────────────────────────────────────────────────── */

export type { CategoryId };

type CounterpartyLite = { id: string; display_name?: string; name?: string };

/* ─── Catalog ─── */
type Provider = { id: string; name: string; logo: string; bg: string; light?: boolean; live?: boolean };

const CATEGORY_META: Record<CategoryId, { label: string; sub: string; accent: string }> = {
  bank:       { label: "Bank Accounts",  sub: "Checking, savings and credit via Plaid",      accent: "#22c55e" },
  crypto:     { label: "Crypto Wallets", sub: "MetaMask, WalletConnect", accent: "#ff9500" },
  accounting: { label: "Accounting",     sub: "QuickBooks, Xero, Wave",                accent: "#7631EE" },
  payroll:    { label: "Payroll",        sub: "Gusto, Rippling, ADP",                  accent: "#a8b9f4" },
  tax:        { label: "Tax",            sub: "Returns, filings and tax documents",      accent: "#ff9500" },
  payments:   { label: "Payments",       sub: "Stripe, PayPal, Square",                accent: "#635BFF" },
  documents:  { label: "Documents",      sub: "Statements, contracts, spreadsheets",   accent: "#ff9500" },
};


const PROVIDERS: Partial<Record<CategoryId, Provider[]>> = {
  crypto: [
    { id: "metamask",      name: "MetaMask",        logo: "M", bg: "#F6851B" },
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

/* ───────────────────────────── Screen: Bank (Plaid) ───────────────────────────── */
export function BankConnect({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);

  /* Demo accounts cannot link a real bank — the server refuses link-token and exchange
     (requireNonDemo). Reflected here so the button is not offered and then rejected: the
     link-token request stays unsent, and the reason is stated plainly rather than surfacing
     as a failed connection attempt. */
  const { user } = useAuth();
  const isDemoAccount = !!user?.isDemo;

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
    enabled: isConfigured && !isDemoAccount,
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

      {/* Settings → Sources lists the connected banks itself, directly below this
          form: repeating them here would show the same account twice. */}

      {error && (
        <AlertCallout testId="alert-bank-error">{error}</AlertCallout>
      )}

      {isDemoAccount ? (
        <MutedCallout testId="alert-bank-demo-account">
          Connecting a bank isn't available on a demo account. Sign up with your own email to
          link one.
        </MutedCallout>
      ) : statusQuery.isSuccess && !isConfigured ? (
        <div
          data-testid="alert-plaid-not-configured"
          className="rounded-row px-[14px] py-[12px] [font-family:'Gilroy',sans-serif] text-[13px] leading-[18px]"
          style={{ background: "rgba(118,49,238,0.08)", color: "#a8b9f4", border: "1px solid rgba(118,49,238,0.25)" }}
        >
          Bank connections require Plaid credentials. Add{" "}
          <code className="text-brain-v1purple">PLAID_CLIENT_ID</code> and{" "}
          <code className="text-brain-v1purple">PLAID_SECRET</code> to enable this.
        </div>
      ) : statusQuery.isSuccess && isConfigured ? (
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
      ) : null}


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
      <Button
        variant="cta"
        size="large"
        className="w-full"
        onClick={() => open()}
        disabled={disabled}
        data-testid="button-plaid-connect"
      >
        {isExchanging || isLoading ? (
          <span className="size-[16px] rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M3 7h18M3 12h18M3 17h12" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        )}
        {label}
      </Button>
      {loadError && !isLoading && (
        <p className="[font-family:'Gilroy',sans-serif] text-[12px] leading-[16px] text-brain-v1error-text text-center">
          {loadError.replace(/^\d+:\s*/, "")}
        </p>
      )}
      <p className="[font-family:'Gilroy',sans-serif] text-[11px] leading-[14px] text-brain-v1baby-blue-60 text-center">
        Search 12,000+ institutions · bank-grade encryption
      </p>
    </div>
  );
}

/* ───────────────────────────── Screen: Provider picker ───────────────────────────── */
export function ProviderPicker({ category }: { category: CategoryId }) {
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

      {error && (
        <AlertCallout testId="alert-provider-error">{error}</AlertCallout>
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
              className="flex items-center gap-[12px] bg-brain-v1highlight-dropdown-bg rounded-row p-[12px] transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div
                className="size-[32px] rounded-full flex items-center justify-center shrink-0"
                style={{ background: p.bg, border: p.light ? "1px solid #1d2132" : undefined }}
              >
                <span className="[font-family:'Gilroy',sans-serif] font-bold text-[12px] leading-[16px] leading-none" style={{ color: p.light ? "#11141b" : "#FFFFFF" }}>
                  {p.logo}
                </span>
              </div>
              <div className="flex-1 min-w-0 flex flex-col">
                <span className="[font-family:'Gilroy',sans-serif] font-semibold text-brain-v1baby-blue-100 text-[14px] leading-[20px] truncate">
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
                <span className="size-[14px] rounded-full border-2 border-brain-v1purple border-t-transparent animate-spin" aria-hidden />
              ) : !p.live ? (
                <span className="px-[8px] py-[3px] rounded-pill [font-family:'Gilroy',sans-serif] font-semibold text-[11px] leading-[14px] bg-brain-v1stroke-2 text-brain-v1baby-blue-60">
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

    </div>
  );
}

/* ───────────────────────────── Screen: Document upload ───────────────────────────── */
export function DocumentUpload({ category, onDone }: { category: string; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [objectType, setObjectType] = useState<DocumentObjectType | "">(
    () => defaultObjectTypeForCategory(category as CategoryId) ?? "",
  );
  const [objectTypeOpen, setObjectTypeOpen] = useState(false);

  const docsQuery = useQuery<SourceDocument[]>({ queryKey: ["/api/integrations/documents"] });
  const docs = (docsQuery.data ?? []).filter((d) => (category === "tax" ? d.category === "tax" : true));
  const selectedSpec = documentObjectTypeSpec(objectType || null);

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const params = new URLSearchParams({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        category,
        sourceType: sourceTypeForDocument(file),
      });
      if (objectType) params.set("objectType", objectType);
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
    const files = Array.from(list);
    const unsupported = files.filter((file) => !isSupportedDocumentFile(file));
    if (unsupported.length > 0) {
      setError("ZIP files and other unsupported file types can't be uploaded. Choose PDF, CSV, XLSX, DOCX, or another supported document.");
    }
    files
      .filter(isSupportedDocumentFile)
      .forEach((file) => uploadMut.mutate(file));
  }, [uploadMut]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  return (
    <div className="flex flex-col gap-[16px]">

      {/* Declared shape for CSV/XLSX uploads. brain-core only auto-detects AR
          aging and payroll register shapes by header keyword; everything else
          (a plain AP invoice ledger, a bank export, etc.) needs the caller to
          say what it is. Left on "Auto-detect" this is a no-op - identical to
          today's behavior. PDF/TXT/DOCX ignore this entirely; they already go
          through the LLM extractor regardless of shape. */}
      <div className="flex flex-col gap-[6px]">
        <label
          htmlFor="add-source-document-type"
          className="[font-family:'Gilroy',sans-serif] font-semibold text-brain-v1baby-blue-60 text-[12px] leading-[16px]"
        >
          What kind of document is this? (CSV / XLSX only)
        </label>
        <SettingsDropdown
          value={objectType}
          options={[
            { value: "", label: "Auto-Detect" },
            ...DOCUMENT_OBJECT_TYPES.map((t) => ({ value: t.id, label: t.label })),
          ]}
          onChange={(value) => setObjectType(value as DocumentObjectType | "")}
          testId="select-document-object-type"
          ariaLabel="Declared document type"
          open={objectTypeOpen}
          onOpenChange={setObjectTypeOpen}
        />
        {selectedSpec && (
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(selectedSpec.templateCsv)}`}
            download={`${selectedSpec.id}-template.csv`}
            data-testid="link-download-document-template"
            className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1purple text-[12px] leading-[16px] hover:underline w-fit"
          >
            Download a {selectedSpec.label} template (required columns: {selectedSpec.requiredHeaders.join(", ")})
          </a>
        )}
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
        className={`flex flex-col items-center justify-center gap-[8px] px-[24px] py-[40px] rounded-panel border-2 border-dashed cursor-pointer transition-colors ${
          dragOver ? "border-brain-v1purple bg-[rgba(118,49,238,0.05)]" : "border-brain-v1stroke-2 hover:border-brain-v1baby-blue-15-hover bg-brain-v1highlight-dropdown-bg"
        }`}
      >
        <p className="[font-family:'Gilroy',sans-serif] font-semibold text-brain-v1baby-blue-100 text-[16px] leading-[24px]">
          Drop files here, or <span className="text-brain-v1light-orange">click to browse</span>
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-60 text-[14px] leading-[20px]">
          {DOCUMENT_FORMAT_LABEL}
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={DOCUMENT_ACCEPT}
          className="hidden"
          onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.currentTarget.value = ""; }}
          data-testid="input-add-source-file"
        />
      </div>

      {error && (
        <AlertCallout testId="alert-doc-error">{error}</AlertCallout>
      )}

      {uploadMut.isPending && (
        <div className="flex flex-col gap-[6px]">
          {uploadMut.isPending && (
            <div className="flex items-center gap-[10px] bg-brain-v1highlight-dropdown-bg rounded-[10px] px-[12px] py-[8px]">
              <span className="size-[16px] rounded-full border-2 border-brain-v1purple border-t-transparent animate-spin shrink-0" aria-hidden />
              <span className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-60 text-[14px] leading-[20px]">Uploading…</span>
            </div>
          )}
        </div>
      )}


    </div>
  );
}

/* ───────────────────────────── Shared bits ───────────────────────────── */
function InfoNotice({ title, body, uppercase = true }: { title: string; body: React.ReactNode; uppercase?: boolean }) {
  return (
    <AlertCallout title={title}>{body}</AlertCallout>
  );
}
