import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { BankConnectionInfo, SourceDocument, ToolConnection } from "@/lib/sourceTypes";
import type { CategoryId } from "@/lib/sourceCategories";
import { useBrainSources } from "@/lib/useBrainSources";
import {
  categoryForBrainSource,
  brainSourceLabel,
  isDisconnectHidden,
  isSyncDisabled,
  type BrainSource,
} from "@/lib/brainSources";
import {
  readState,
  syncCaption,
  sourceCountCaption,
  formatSize,
  type ReadState,
} from "@/lib/sourceRows";
import { ExtractStatusBadge } from "@/components/sources/ExtractStatusBadge";
import {
  BankConnect,
  ProviderPicker,
  DocumentUpload,
  TOOL_CATEGORY,
  TOOL_LABELS,
} from "@/components/sources/SourceConnectScreens";

/* ── Settings → Sources ───────────────────────────────────────────────────────
   The permanent home for "what Brain reads from". This replaced a four-step
   modal wizard reachable only from a sidebar button: a list of what Brain can
   see is reference material, and reference material should not live behind a
   flow you have to finish or abandon.

   Adding a source stays inline here. The connect mechanics are NOT reimplemented
   - BankConnect, ProviderPicker and DocumentUpload are the same components the
   onboarding walkthrough uses, rendered in their inline variant so they
   contribute the provider handoff without the wizard's headings, notices and
   duplicate lists. */

/* ─── Shared primitives (matching the Settings card + label patterns) ─── */
const Card = ({ children, testId }: { children: ReactNode; testId?: string }) => (
  <div data-testid={testId} className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10" }}>
    {children}
  </div>
);

const SectionLabel = ({ children, testId }: { children: ReactNode; testId?: string }) => (
  <div className="flex items-center min-h-[36px]">
    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]" data-testid={testId}>
      {children}
    </p>
  </div>
);

/** What a connected account IS, in the user's words rather than the connector's. */
const CATEGORY_KIND_LABEL: Record<CategoryId, string> = {
  bank: "Bank account",
  crypto: "Crypto wallet",
  accounting: "Accounting",
  payroll: "Payroll",
  payments: "Payments",
  tax: "Tax",
  documents: "Documents",
};

/** The categories offered in the add form, in the order the mock lists them. */
const ADD_CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: "bank", label: "Bank account" },
  { id: "crypto", label: "Crypto wallet" },
  { id: "accounting", label: "Accounting" },
  { id: "payroll", label: "Payroll" },
  { id: "payments", label: "Payments" },
  { id: "tax", label: "Tax documents" },
  { id: "documents", label: "Document upload" },
];

/** Which connect mechanism a category hands off to. Mirrors the onboarding
    walkthrough's routing so the two cannot diverge. */
function mechanismFor(cat: CategoryId): "bank" | "providers" | "documents" {
  if (cat === "bank") return "bank";
  if (cat === "tax" || cat === "documents") return "documents";
  return "providers";
}

/* ─── Rows ─── */

interface RowProps {
  title: ReactNode;
  subtitle: string;
  onRemove?: () => void;
  removing?: boolean;
  testId: string;
  removeTestId?: string;
  last?: boolean;
}

/** One source. The remove control asks first: disconnecting is instant, silent
    and not obviously reversible, and the confirmation is also the only natural
    place to say what removal does NOT do. */
function SourceRow({ title, subtitle, onRemove, removing, testId, removeTestId, last }: RowProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      data-testid={testId}
      className={`flex flex-col gap-[8px] px-[16px] py-[12px] ${last ? "" : "border-b border-[#1d2132]"}`}
    >
      <div className="flex items-center gap-[12px]">
        <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
          <div className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[14px] leading-[18px] truncate">
            {title}
          </div>
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[12px] leading-[16px] truncate">
            {subtitle}
          </p>
        </div>
        {onRemove && !confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            data-testid={removeTestId}
            className="shrink-0 rounded-full px-[14px] py-[6px] bg-[#222737] hover:bg-[#2c3247] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[12px] leading-[16px]"
          >
            Remove
          </button>
        )}
      </div>

      {confirming && (
        <div className="flex flex-col gap-[8px] rounded-[12px] px-[12px] py-[10px]" style={{ background: "#350011" }}>
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[12px] leading-[16px]">
            Remove this source? Brain stops reading it. Decisions you already confirmed from it are not undone.
          </p>
          <div className="flex items-center gap-[8px]">
            <button
              type="button"
              disabled={removing}
              onClick={() => { onRemove?.(); setConfirming(false); }}
              data-testid={removeTestId ? `${removeTestId}-confirm` : undefined}
              className="rounded-full px-[14px] py-[6px] bg-[#d20344] hover:opacity-90 transition-opacity disabled:opacity-40 [font-family:'Gilroy',sans-serif] font-semibold text-white text-[12px] leading-[16px]"
            >
              {removing ? "Removing…" : "Remove"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-full px-[14px] py-[6px] bg-[#222737] hover:bg-[#2c3247] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[12px] leading-[16px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** What a list says when it has no rows. Three outcomes, three messages: a feed
    that failed and a feed that has not answered yet are both misreported by
    "nothing here". */
function EmptyRow({ states, emptyLabel, testId }: { states: ReadState[]; emptyLabel: string; testId: string }) {
  const failed = states.some((s) => s === "failed");
  const pending = states.some((s) => s === "pending");

  const text = failed
    ? "Brain couldn't load this list. Anything connected here is missing from the page — it has not been disconnected."
    : pending
      ? "Checking…"
      : emptyLabel;

  return (
    <div className="px-[16px] py-[14px]" data-testid={testId}>
      <p
        className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[18px]"
        style={{ color: failed ? "#ff9500" : "#6c779d" }}
      >
        {text}
      </p>
    </div>
  );
}

/* ─── The section ─── */

export function SourcesSection() {
  const nowMs = Date.now();

  const banksQuery = useQuery<BankConnectionInfo[]>({ queryKey: ["/api/integrations/plaid/connections"] });
  const toolsQuery = useQuery<ToolConnection[]>({ queryKey: ["/api/integrations/connections"] });
  const docsQuery = useQuery<SourceDocument[]>({ queryKey: ["/api/integrations/documents"] });
  const brain = useBrainSources(true);

  const [formOpen, setFormOpen] = useState(false);
  const [category, setCategory] = useState<CategoryId>("bank");
  const [removeError, setRemoveError] = useState<string | null>(null);

  const onRemoveError = (err: Error) => setRemoveError(err.message.replace(/^\d+:\s*/, ""));
  const invalidate = (key: string) => queryClient.invalidateQueries({ queryKey: [key] });

  const disconnectBank = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await apiRequest("POST", "/api/integrations/plaid/disconnect", { itemId });
      return res.json();
    },
    onSuccess: () => { setRemoveError(null); invalidate("/api/integrations/plaid/connections"); },
    onError: onRemoveError,
  });

  const disconnectSource = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/brain/sources/${id}`);
      return res.json();
    },
    onSuccess: () => { setRemoveError(null); invalidate("/api/brain/sources"); },
    onError: onRemoveError,
  });

  const disconnectTool = useMutation({
    mutationFn: async (toolId: string) => {
      const res = await apiRequest("POST", `/api/integrations/${toolId}/disconnect`);
      return res.json();
    },
    onSuccess: () => { setRemoveError(null); invalidate("/api/integrations/connections"); },
    onError: onRemoveError,
  });

  const removeDoc = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/integrations/documents/${id}/delete`);
      return res.json();
    },
    onSuccess: () => { setRemoveError(null); invalidate("/api/integrations/documents"); },
    onError: onRemoveError,
  });

  const banks = banksQuery.data ?? [];
  const tools = toolsQuery.data ?? [];
  const docs = docsQuery.data ?? [];
  const brainSources = brain.sources;

  const bankState = readState(banksQuery);
  const toolState = readState(toolsQuery);
  const docState = readState(docsQuery);
  const brainState = readState({ isError: brain.isError, isLoading: brain.isLoading, data: brain.data });

  const accountStates = [bankState, brainState, toolState];
  const allStates = [...accountStates, docState];

  /* Which feeds failed, named, so the warning says what is missing rather than
     that something is. */
  const failedFeeds = [
    bankState === "failed" ? "bank connections" : null,
    brainState === "failed" ? "connected accounts" : null,
    toolState === "failed" ? "connected tools" : null,
    docState === "failed" ? "documents" : null,
  ].filter((s): s is string => s !== null);

  const shown = banks.length + brainSources.length + tools.length + docs.length;

  const brainKind = (s: BrainSource) => CATEGORY_KIND_LABEL[categoryForBrainSource(s)];
  const toolKind = (toolId: string) => {
    const cat = TOOL_CATEGORY[toolId];
    return cat ? CATEGORY_KIND_LABEL[cat] : "Connected tool";
  };

  const accountRows = [
    ...banks.map((b) => ({
      key: `bank-${b.itemId}`,
      testId: `source-bank-${b.itemId}`,
      removeTestId: `button-remove-bank-${b.itemId}`,
      title: b.institutionName,
      subtitle: syncCaption(
        {
          kind: `${CATEGORY_KIND_LABEL.bank}${b.accounts.length > 1 ? ` · ${b.accounts.length} accounts` : ""}`,
          connectedAt: b.connectedAt,
        },
        nowMs,
      ),
      onRemove: () => disconnectBank.mutate(b.itemId),
      removing: disconnectBank.isPending,
    })),
    ...brainSources.map((s) => ({
      key: `brain-${s.id}`,
      testId: `source-brain-${s.id}`,
      removeTestId: `button-remove-source-${s.id}`,
      title: brainSourceLabel(s),
      subtitle: syncCaption(
        {
          kind: brainKind(s),
          lastSyncedAt: s.lastSyncedAt,
          freshness: s.freshness,
          syncDisabled: isSyncDisabled(s),
        },
        nowMs,
      ),
      // Seeded/upstream-restricted connections are not ours to sever: render no
      // control at all rather than one that fails.
      onRemove: isDisconnectHidden(s) ? undefined : () => disconnectSource.mutate(s.id),
      removing: disconnectSource.isPending,
    })),
    ...tools.map((t) => ({
      key: `tool-${t.toolId}`,
      testId: `source-tool-${t.toolId}`,
      removeTestId: `button-remove-tool-${t.toolId}`,
      title: TOOL_LABELS[t.toolId] ?? t.toolId,
      subtitle: syncCaption(
        { kind: t.accountLabel ? `${toolKind(t.toolId)} · ${t.accountLabel}` : toolKind(t.toolId), connectedAt: t.connectedAt },
        nowMs,
      ),
      onRemove: () => disconnectTool.mutate(t.toolId),
      removing: disconnectTool.isPending,
    })),
  ];

  const mechanism = mechanismFor(category);

  return (
    <div className="flex flex-col gap-[16px]">
      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px]" data-testid="text-sources-subhead">
        What Brain reads to build your financial picture. Adding a source never lets Brain move
        money — that still runs through Rules and Decisions.
      </p>

      {/* Toolbar: the count is a claim about completeness, so it carries its own
          qualifier whenever a feed failed or has not answered yet. */}
      <div className="flex items-center justify-between gap-[12px] min-h-[36px]">
        <p
          className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px] leading-[18px]"
          data-testid="text-source-count"
        >
          {sourceCountCaption(shown, allStates)}
        </p>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          data-testid="button-add-source"
          aria-expanded={formOpen}
          className="shrink-0 rounded-full px-[16px] py-[8px] bg-[#4a2300] hover:opacity-90 transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[#ff9500] text-[14px] leading-[20px] whitespace-nowrap"
        >
          {formOpen ? "Cancel" : "+ Add source"}
        </button>
      </div>

      {formOpen && (
        <Card testId="form-add-source">
          <div className="flex flex-col gap-[12px] p-[16px]">
            <div className="flex flex-col gap-[6px]">
              <label
                htmlFor="add-source-category"
                className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[12px] leading-[16px]"
              >
                Category
              </label>
              <select
                id="add-source-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as CategoryId)}
                data-testid="select-source-category"
                className="w-full rounded-[10px] bg-[#12151f] border border-[#1d2132] px-[12px] py-[9px] [font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[14px] leading-[20px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
              >
                {ADD_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* The connect step itself. There is no generic "Connect" button
                because there is no generic connect: a bank goes through Plaid's
                own login, a tool through that provider's authorisation, and a
                document through an upload. Each mechanism owns its own action. */}
            <div data-testid={`add-source-mechanism-${mechanism}`}>
              {mechanism === "bank" && <BankConnect variant="inline" onDone={() => setFormOpen(false)} />}
              {mechanism === "providers" && <ProviderPicker category={category} variant="inline" />}
              {mechanism === "documents" && (
                <DocumentUpload category={category} variant="inline" onDone={() => setFormOpen(false)} />
              )}
            </div>

            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[12px] leading-[16px]">
              Connecting an account hands off to that provider's own secure login — Brain never sees
              or stores your credentials. Uploaded documents are read once, and anything Brain
              extracts shows up in Decisions for you to confirm individually.
            </p>
          </div>
        </Card>
      )}

      {failedFeeds.length > 0 && (
        <div
          className="rounded-[16px] p-[16px]"
          style={{ background: "rgba(255,149,0,0.08)", border: "1px solid rgba(255,149,0,0.2)" }}
          data-testid="notice-sources-unavailable"
        >
          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#ff9500] text-[14px] leading-[20px]">
            This page is incomplete
          </p>
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px] leading-[18px] mt-[4px]">
            Brain could not load {failedFeeds.length === 1
              ? failedFeeds[0]
              : `${failedFeeds.slice(0, -1).join(", ")} and ${failedFeeds[failedFeeds.length - 1]}`}
            . Anything connected there is missing from this page — it has not been disconnected.
            Try again in a moment.
          </p>
        </div>
      )}

      {removeError && (
        <div
          className="rounded-[12px] px-[14px] py-[10px]"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}
          data-testid="alert-source-remove-error"
        >
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#fca5a5] text-[13px] leading-[18px]">
            That source could not be removed: {removeError}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-[4px]">
        <SectionLabel testId="label-connected-accounts">Connected accounts</SectionLabel>
        <Card testId="list-connected-accounts">
          {accountRows.length === 0 ? (
            <EmptyRow
              states={accountStates}
              emptyLabel="No accounts connected yet."
              testId="empty-connected-accounts"
            />
          ) : (
            accountRows.map((r, i) => (
              <SourceRow
                key={r.key}
                testId={r.testId}
                removeTestId={r.removeTestId}
                title={r.title}
                subtitle={r.subtitle}
                onRemove={r.onRemove}
                removing={r.removing}
                last={i === accountRows.length - 1}
              />
            ))
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-[4px]">
        <SectionLabel testId="label-documents">Documents</SectionLabel>
        <Card testId="list-documents">
          {docs.length === 0 ? (
            <EmptyRow
              states={[docState]}
              emptyLabel="No documents uploaded yet."
              testId="empty-documents"
            />
          ) : (
            docs.map((d, i) => (
              <SourceRow
                key={d.id}
                testId={`source-doc-${d.id}`}
                removeTestId={`button-remove-doc-${d.id}`}
                title={
                  <span className="flex items-center gap-[8px] min-w-0">
                    <span className="truncate">{d.name}</span>
                    <ExtractStatusBadge status={d.extractStatus} testId={`doc-status-${d.id}`} />
                  </span>
                }
                subtitle={`${d.category ? `${d.category.charAt(0).toUpperCase()}${d.category.slice(1)} · ` : ""}${formatSize(d.size)}`}
                onRemove={() => removeDoc.mutate(d.id)}
                removing={removeDoc.isPending}
                last={i === docs.length - 1}
              />
            ))
          )}
        </Card>
      </div>
    </div>
  );
}
