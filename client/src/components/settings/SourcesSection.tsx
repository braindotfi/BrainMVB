import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { BankConnectionInfo, SourceDocument, ToolConnection } from "@/lib/sourceTypes";
import type { BrainAccountsResponse } from "@/lib/brainAccounts";
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
import { AlertCallout } from "@/components/Callout";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { AccountDetailPopup } from "@/components/AccountDetailPopup";
import { TransactionDetailPopup } from "@/components/TransactionDetailPopup";
import { SettingsDropdown } from "@/components/settings/SettingsDropdown";
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
  <div data-testid={testId} className="rounded-panel overflow-hidden" style={{ background: "#0a0c10" }}>
    {children}
  </div>
);

const TableCard = ({ children, testId }: { children: ReactNode; testId?: string }) => (
  <div
    data-testid={testId}
    className="rounded-panel overflow-hidden border border-solid border-brain-v1stroke-2"
    style={{ background: "#0a0c10" }}
  >
    {children}
  </div>
);

const SectionLabel = ({ children, testId }: { children: ReactNode; testId?: string }) => (
  <div className="flex items-center min-h-[36px]">
    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-brain-v1baby-blue-30 text-[16px] leading-[24px]" data-testid={testId}>
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
  { id: "bank", label: "Bank Account" },
  { id: "crypto", label: "Crypto Wallet" },
  { id: "accounting", label: "Accounting" },
  { id: "payroll", label: "Payroll" },
  { id: "payments", label: "Payments" },
  { id: "tax", label: "Tax Documents" },
  { id: "documents", label: "Document Upload" },
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
  accountId?: string;
  onOpenAccount?: () => void;
  onRemove?: () => void;
  removing?: boolean;
  testId: string;
  removeTestId?: string;
  last?: boolean;
}

/** One source. The remove control asks first: disconnecting is instant, silent
    and not obviously reversible, and the confirmation is also the only natural
    place to say what removal does NOT do. */
function SourceRow({
  title,
  subtitle,
  accountId,
  onOpenAccount,
  onRemove,
  removing,
  testId,
  removeTestId,
  last,
}: RowProps) {
  const [confirming, setConfirming] = useState(false);
  const clickable = Boolean(onOpenAccount && accountId);

  return (
    <div
      data-testid={testId}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onOpenAccount : undefined}
      onKeyDown={clickable ? (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenAccount?.();
        }
      } : undefined}
      className={`flex flex-col gap-[8px] px-[16px] py-[12px] ${last ? "" : "border-b border-brain-v1stroke-2"} ${clickable ? "cursor-pointer transition-colors hover:bg-brain-v1baby-blue-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple focus-visible:ring-inset" : ""}`}
    >
      <div className="flex items-center gap-[12px]">
        {/* 4px between title and subtext — the record spacing used everywhere else. */}
        <div className="flex-1 min-w-0 flex flex-col gap-[4px]">
          <div className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-100 text-[16px] leading-[20px] truncate">
            {title}
          </div>
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-60 text-[14px] leading-[16px] truncate">
            {subtitle}
          </p>
        </div>
        {onRemove && !confirming && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setConfirming(true);
            }}
            data-testid={removeTestId}
            className="shrink-0 rounded-full px-[14px] py-[6px] bg-brain-v1baby-blue-15 hover:bg-brain-v1baby-blue-15-hover transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-brain-v1baby-blue-60 text-[12px] leading-[16px]"
          >
            Remove
          </button>
        )}
      </div>

      <DeleteConfirmDialog
        open={confirming}
        onOpenChange={(open) => { if (!open) setConfirming(false); }}
        title="Remove Source"
        body="Are you sure you want to remove this source? Decisions you already confirmed from it are not undone."
        cancelLabel="Cancel"
        confirmLabel="Remove"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          onRemove?.();
          setConfirming(false);
        }}
        busy={removing}
        cancelTestId={removeTestId ? `${removeTestId}-cancel` : undefined}
        confirmTestId={removeTestId ? `${removeTestId}-confirm` : undefined}
      />
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
    ? "Brain couldn't load this list. Anything connected here is missing from the page. It has not been disconnected."
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
  const accountsQuery = useQuery<BrainAccountsResponse>({
    queryKey: ["/api/brain/ledger/accounts"],
    retry: false,
  });
  const brain = useBrainSources(true);

  const [formOpen, setFormOpen] = useState(false);
  const [category, setCategory] = useState<CategoryId>("bank");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [openAccountId, setOpenAccountId] = useState<string | null>(null);
  const [openTransactionId, setOpenTransactionId] = useState<string | null>(null);

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
  const ledgerAccounts = accountsQuery.data?.accounts ?? [];

  /* A source row may identify its ledger account directly, or through the
     account's source_ids. Keep this defensive because the BFF intentionally
     relays upstream source metadata without normalising it. */
  const accountIdFor = (sourceId: string, title: string, metadata?: Record<string, unknown>) => {
    const explicit = metadata?.ledger_account_id ?? metadata?.account_id;
    if (typeof explicit === "string" && ledgerAccounts.some((a) => a.id === explicit)) return explicit;
    const overlaps = metadata?.overlaps_with;
    if (overlaps && typeof overlaps === "object" && !Array.isArray(overlaps)) {
      const linkedIds = (overlaps as { ledger_account_ids?: unknown }).ledger_account_ids;
      if (Array.isArray(linkedIds)) {
        const linked = linkedIds.find(
          (id): id is string => typeof id === "string" && ledgerAccounts.some((a) => a.id === id),
        );
        if (linked) return linked;
      }
    }
    const bySource = ledgerAccounts.find((a) => a.source_ids?.includes(sourceId));
    if (bySource) return bySource.id;
    const byName = ledgerAccounts.find((a) => a.name.toLowerCase() === title.toLowerCase());
    if (byName) return byName.id;
    const byExternalId = ledgerAccounts.find((a) =>
      typeof a.external_account_id === "string" && a.external_account_id.includes(sourceId),
    );
    return byExternalId?.id;
  };

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
      accountId: b.accounts.length === 1
        ? accountIdFor(b.accounts[0].accountId, b.institutionName, { account_id: b.accounts[0].accountId })
        : undefined,
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
      accountId: accountIdFor(s.id, brainSourceLabel(s), s.metadata),
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
      accountId: accountIdFor(t.toolId, TOOL_LABELS[t.toolId] ?? t.toolId),
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
      {/* Toolbar: the count is a claim about completeness, so it carries its own
          qualifier whenever a feed failed or has not answered yet. */}
      <div className="flex items-center justify-between gap-[12px] min-h-[36px]">
        <p
          className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-60 text-[13px] leading-[18px]"
          data-testid="text-source-count"
        >
          {sourceCountCaption(shown, allStates)}
        </p>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          data-testid="button-add-source"
          aria-expanded={formOpen}
          className="shrink-0 rounded-full px-[16px] py-[8px] bg-brain-v1dark-orange hover:opacity-90 transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-brain-v1light-orange text-[14px] leading-[20px] whitespace-nowrap flex items-center justify-center gap-[2px]"
        >
          {!formOpen && <Plus className="relative shrink-0 size-[16px] text-brain-v1light-orange" />}
          {formOpen ? "Cancel" : "Add Source"}
        </button>
      </div>

      {formOpen && (
        <Card testId="form-add-source">
          <div className="flex flex-col gap-[12px] p-[16px]">
            <div className="flex flex-col gap-[6px]">
              <label
                htmlFor="add-source-category"
                className="[font-family:'Gilroy',sans-serif] font-semibold text-brain-v1baby-blue-60 text-[12px] leading-[16px]"
              >
                Category
              </label>
              <SettingsDropdown
                value={category}
                options={ADD_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))}
                onChange={(value) => setCategory(value as CategoryId)}
                testId="select-source-category"
                ariaLabel="Source category"
                open={categoryOpen}
                onOpenChange={setCategoryOpen}
              />
            </div>

            {/* The connect step itself. There is no generic "Connect" button
                because there is no generic connect: a bank goes through Plaid's
                own login, a tool through that provider's authorisation, and a
                document through an upload. Each mechanism owns its own action. */}
            <div data-testid={`add-source-mechanism-${mechanism}`}>
              {mechanism === "bank" && <BankConnect onDone={() => setFormOpen(false)} />}
              {mechanism === "providers" && <ProviderPicker category={category} />}
              {mechanism === "documents" && (
                <DocumentUpload category={category} onDone={() => setFormOpen(false)} />
              )}
            </div>

            <p className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-60 text-[12px] leading-[16px]">
              Connecting an account hands off to that provider's own secure login. Brain never sees
              or stores your credentials. Uploaded documents are read once, and anything Brain
              extracts shows up in Decisions for you to confirm individually.
            </p>
          </div>
        </Card>
      )}

      {failedFeeds.length > 0 && (
        <AlertCallout title="This page is incomplete" testId="notice-sources-unavailable">
          Brain could not load {failedFeeds.length === 1
            ? failedFeeds[0]
            : `${failedFeeds.slice(0, -1).join(", ")} and ${failedFeeds[failedFeeds.length - 1]}`}
          . Anything connected there is missing from this page. It has not been disconnected.
          Try again in a moment.
        </AlertCallout>
      )}

      {removeError && (
        <AlertCallout testId="alert-source-remove-error">
          That source could not be removed: {removeError}
        </AlertCallout>
      )}

      <div className="flex flex-col gap-[4px]">
        <SectionLabel testId="label-connected-accounts">Connected Accounts</SectionLabel>
        <TableCard testId="list-connected-accounts">
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
                accountId={r.accountId}
                onOpenAccount={r.accountId ? () => setOpenAccountId(r.accountId!) : undefined}
                onRemove={r.onRemove}
                removing={r.removing}
                last={i === accountRows.length - 1}
              />
            ))
          )}
        </TableCard>
      </div>

      <AccountDetailPopup
        accountId={openAccountId}
        onClose={() => setOpenAccountId(null)}
        onOpenTransaction={(id) => {
          setOpenAccountId(null);
          setOpenTransactionId(id);
        }}
        onSelectAccount={setOpenAccountId}
        hidePager
      />
      <TransactionDetailPopup
        txId={openTransactionId}
        onClose={() => setOpenTransactionId(null)}
        onSelectTransaction={setOpenTransactionId}
      />

      <div className="flex flex-col gap-[4px]">
        <SectionLabel testId="label-documents">Documents</SectionLabel>
        <TableCard testId="list-documents">
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
        </TableCard>
      </div>
    </div>
  );
}
