/**
 * Detail card for a "Needs Your Input" row — an agent run that stopped because
 * a required fact was absent. Reuses the same Radix Dialog shell and
 * ProposalCardParts primitives as AgentProposalModal, but the content is
 * specific to a blocked-run outcome:
 *
 *   - No confidence bar (Brain didn't produce a recommendation)
 *   - No message draft (nothing to approve or send)
 *   - "Why This Is Blocked" replaces "Why Brain Suggested This"
 *   - Linked Evidence carries both existing entity refs AND a "Missing" row
 *     for each absent field — same visual list, different affordance
 *   - Actions: one primary "fix" button (routes to wherever the missing data
 *     lives) and a "Dismiss" secondary that just closes the card
 *   - Small "View raw audit event" link near the bottom
 */

import { useLocation } from "wouter";
import { Plus } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useCardTransition } from "@/lib/cardTransition";
import {
  CardBody,
  CardSection,
  CardActions,
  StatusPill,
  EvidenceLinkRow,
  KeyFactsTable,
  ActionButton,
  ActionRow,
} from "./ProposalCardParts";
import {
  type MissingEvidenceItem,
  humanizeField,
  refKindLabel,
} from "@/lib/agentRunInput";

/* ── Amber palette (matches TAG_AGENT / the "Needs your input" section accent) */
const AMBER_PILL = {
  color: "#ff9500",
  bg: "rgba(255,149,0,0.08)",
  border: "rgba(255,149,0,0.25)",
};

/* ── Routing ─────────────────────────────────────────────────────────────────
   Routes to wherever the missing field is actually managed. When a
   counterparty ref is present it deep-links to that counterparty's panel so
   the tenant lands on the right record rather than a list. */

interface FixAction {
  label: string;
  path: string;
}

function primaryFixAction(item: MissingEvidenceItem): FixAction {
  const cpRef = item.entityRefs.find((r) => r.startsWith("cp_"));
  const field = item.missingFields[0];

  switch (field) {
    case "counterparty":
    case "tax_id":
    case "contact_email":
    case "payment_destination":
      return cpRef
        ? { label: "Review Counterparty", path: `/ledger?tab=counterparties&vendor=${encodeURIComponent(cpRef)}` }
        : { label: "Review Counterparties", path: "/ledger?tab=counterparties" };

    case "invoice":
      return { label: "View Payables", path: "/ledger?tab=payables" };

    case "balance":
    case "account_balance":
      return { label: "Review Accounts", path: "/ledger?tab=accounts" };

    case "bank_account":
      return { label: "Add Banking Info", path: "/settings?section=sources" };

    case "payment_method":
      return { label: "Add Payment Method", path: "/settings?section=billing" };

    case "transaction_record":
    case "transaction":
      return { label: "Find Transaction", path: "/ledger?tab=cash-flow" };

    default:
      return { label: "View Audit Log", path: "/settings?section=audit" };
  }
}

/** Route for a single missing field — shown on the per-row "Add" affordance. */
function fieldFixPath(field: string, item: MissingEvidenceItem): string {
  return primaryFixAction({ ...item, missingFields: [field] }).path;
}

/* ── Plain-language "Why" copy ───────────────────────────────────────────────
   Builds one paragraph explaining what Brain attempted, what it found missing,
   and what the tenant needs to do. Generated entirely from the parsed event
   fields — no invented specifics. */

function buildWhyBlocked(item: MissingEvidenceItem): string {
  const fieldList = item.missingFields
    .map(humanizeField)
    .reduce<string>((acc, f, i, arr) => {
      if (i === 0) return f;
      if (i === arr.length - 1) return `${acc} and ${f}`;
      return `${acc}, ${f}`;
    }, "");

  const action = item.attemptedAction;
  const actionPhrase = (() => {
    const PHRASES: Record<string, string> = {
      "payment.execute": "execute a payment",
      "payment.schedule": "schedule a payment",
      "collections.remind": "send a collections reminder",
      "reconciliation.match": "match a transaction",
      "treasury.sweep": "move cash between accounts",
      "vendor_risk.assess": "assess vendor risk",
      "fraud.review": "review a transaction for fraud",
      "cash_forecast.project": "update the cash forecast",
    };
    return action ? (PHRASES[action] ?? `run ${action}`) : "complete this action";
  })();

  return (
    `Brain attempted to ${actionPhrase} but stopped before reaching a decision ` +
    `because it couldn't find ${fieldList}. ` +
    `This run will not retry automatically — once the missing information is in Brain, ` +
    `the next matching trigger will proceed normally.`
  );
}

/* ── Details table ───────────────────────────────────────────────────────────
   Shows the run's key facts. Missing fields render with "(missing)" appended
   so they are visually distinct without relying on colour alone. */

function buildDetailsRows(
  item: MissingEvidenceItem,
): { label: string; value: string; mono?: boolean }[] {
  const rows: { label: string; value: string; mono?: boolean }[] = [];

  if (item.attemptedAction) {
    rows.push({ label: "Attempted action", value: item.attemptedAction, mono: true });
  }
  if (item.triggerEvent) {
    rows.push({ label: "Triggered by", value: item.triggerEvent, mono: true });
  }
  for (const field of item.missingFields) {
    rows.push({ label: humanizeField(field), value: "(missing)", mono: false });
  }
  if (item.runId) {
    rows.push({ label: "Run ID", value: item.runId, mono: true });
  }
  return rows;
}

/* ── "Missing" evidence row ──────────────────────────────────────────────────
   Same shell as EvidenceLinkRow but with an amber "Missing" tag and a
   "+ Add" affordance in place of the chevron. The button navigates to wherever
   that field can be supplied. */

const MissingFieldRow = ({
  field,
  item,
  onNavigate,
  testId,
}: {
  field: string;
  item: MissingEvidenceItem;
  onNavigate: (path: string) => void;
  testId?: string;
}) => (
  <div
    className="bg-brain-v1highlight-dropdown-bg border border-solid border-[rgba(255,149,0,0.25)] rounded-row px-[16px] py-[12px] flex gap-[16px] items-center w-full"
    data-testid={testId}
  >
    {/* Amber "Missing" type tag */}
    <div className="inline-flex items-center justify-center bg-[rgba(255,149,0,0.08)] border border-solid border-[rgba(255,149,0,0.25)] px-[8px] py-[2px] rounded-pill shrink-0">
      <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[14px] text-brain-v1light-orange text-center whitespace-nowrap">
        Missing
      </span>
    </div>

    {/* Field name */}
    <div className="flex flex-1 items-center min-w-px">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[16px] leading-[20px] text-brain-v1baby-blue-60 truncate">
        {humanizeField(field)}
      </p>
    </div>

    {/* Add affordance */}
    <button
      type="button"
      onClick={() => onNavigate(fieldFixPath(field, item))}
      data-testid={testId ? `${testId}-add` : undefined}
      className="inline-flex items-center gap-[4px] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] text-brain-v1light-orange hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple rounded-[4px] shrink-0"
    >
      <Plus size={12} aria-hidden="true" />
      Add
    </button>
  </div>
);

/* ── Modal ───────────────────────────────────────────────────────────────── */

export function MissingEvidenceModal({
  item,
  open,
  onOpenChange,
}: {
  item: MissingEvidenceItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [, navigate] = useLocation();
  const transition = useCardTransition(open);

  if (!item) return null;

  const whyBlocked = buildWhyBlocked(item);
  const detailRows = buildDetailsRows(item);
  const fixAction = primaryFixAction(item);

  const auditTs = (() => {
    try {
      return new Date(item.createdAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return item.createdAt;
    }
  })();

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] ${transition.overlay}`}
          data-testid="missing-evidence-backdrop"
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          data-testid="missing-evidence-modal"
          className={`fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-brain-v1baby-blue-5 border border-brain-v1stroke-2 border-solid flex flex-col items-start overflow-hidden rounded-modal w-[480px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none ${transition.card}`}
        >
          {/* Header */}
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-brain-v1stroke-2 border-solid h-[56px] relative shrink-0 w-full flex items-center justify-center px-[16px]">
            <DialogPrimitive.Title
              className="[font-family:'Gilroy',sans-serif] font-semibold text-[20px] leading-[24px] text-brain-v1baby-blue-100 text-center whitespace-nowrap"
              data-testid="text-missing-evidence-title"
            >
              Brain Agent
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close"
              data-testid="button-missing-evidence-close"
              className="absolute right-[11px] top-[11px] size-[32px] flex items-center justify-center rounded-full bg-brain-v1baby-blue-15 hover:bg-brain-v1baby-blue-15-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
            >
              <X size={16} className="text-brain-v1baby-blue-60" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex flex-col items-start w-full overflow-y-auto">
            {/* Hero — amber pill, then the blocker statement */}
            <div className="border-b border-brain-v1stroke-2 border-solid flex flex-col gap-[8px] items-start p-[24px] shrink-0 w-full">
              <StatusPill
                label="Missing Info"
                color={AMBER_PILL.color}
                background={AMBER_PILL.bg}
                border={AMBER_PILL.border}
                testId="pill-missing-evidence-status"
              />
              <p
                className="[font-family:'Gilroy',sans-serif] font-semibold text-[20px] leading-[28px] text-brain-v1baby-blue-100 w-full"
                data-testid="text-missing-evidence-headline"
              >
                {/* describeMissingEvidence is the row title; use it as the modal
                    headline too so the two surfaces always agree on what happened. */}
                {item.missingFields
                  .map(humanizeField)
                  .reduce<string>((acc, f, i, arr) => {
                    if (i === 0) return `Blocked — couldn't find ${f}`;
                    if (i === arr.length - 1) return `${acc} or ${f}`;
                    return `${acc}, ${f}`;
                  }, "Blocked")}
              </p>
            </div>

            <CardBody>
              {/* Why This Is Blocked — plain-language explanation */}
              <CardSection title="Why This Is Blocked" testId="section-missing-evidence-why">
                <p
                  className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-brain-v1baby-blue-60 w-full"
                  data-testid="text-missing-evidence-why"
                >
                  {whyBlocked}
                </p>
              </CardSection>

              {/* Details — run facts; missing fields appear with "(missing)" value */}
              {detailRows.length > 0 && (
                <CardSection title="Details" testId="section-missing-evidence-details">
                  <div
                    className="bg-brain-v1highlight-dropdown-bg border border-solid border-brain-v1stroke-2 rounded-row w-full flex flex-col overflow-hidden"
                    data-testid="list-missing-evidence-details"
                  >
                    {detailRows.map((row, i) => {
                      const isMissing = row.value === "(missing)";
                      return (
                        <div
                          key={`${row.label}-${i}`}
                          className={`flex items-start w-full ${
                            i < detailRows.length - 1
                              ? "border-b border-solid border-brain-v1stroke-2"
                              : ""
                          }`}
                          data-testid={`detail-missing-evidence-${row.label.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          <div className="flex flex-col items-start justify-center px-[12px] py-[8px] shrink-0 w-[160px]">
                            <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] text-brain-v1baby-blue-60">
                              {row.label}
                            </p>
                          </div>
                          <div className="flex flex-1 flex-col items-start justify-center min-w-px px-[12px] py-[8px]">
                            <p
                              className={`text-[14px] leading-[20px] break-words w-full ${
                                isMissing
                                   ? "[font-family:'Gilroy',sans-serif] font-semibold text-brain-v1light-orange"
                                  : row.mono
                                    ? "[font-family:'JetBrains_Mono',monospace] text-brain-v1baby-blue-100"
                                    : "[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-100"
                              }`}
                            >
                              {row.value}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardSection>
              )}

              {/* Linked Evidence — existing entity refs + a "Missing" row per
                  absent field. The two lists stay separate so existing evidence
                  is never visually confused with the gap. */}
              {(item.entityRefs.length > 0 || item.missingFields.length > 0) && (
                <CardSection title="Linked Evidence" gap={8} testId="section-missing-evidence-evidence">
                  <div
                    className="flex flex-col gap-[8px] items-start w-full"
                    data-testid="list-missing-evidence-evidence"
                  >
                    {item.entityRefs.map((ref, i) => (
                      <EvidenceLinkRow
                        key={ref}
                        label={ref}
                        kind={refKindLabel(ref)}
                        /* Navigate to the record's own panel — reuse the same
                           deep-link pattern as VendorsPanel and AuditRecordPopup. */
                        onClick={() => {
                          if (ref.startsWith("cp_")) {
                            navigate(
                              `/ledger?tab=counterparties&vendor=${encodeURIComponent(ref)}`,
                            );
                            onOpenChange(false);
                          }
                          // Other ref types (obl, inv, txn) don't yet have a
                          // by-id deep-link; tapping keeps the modal open.
                        }}
                        testId={`tile-missing-evidence-ref-${i}`}
                      />
                    ))}

                    {item.missingFields.map((field, i) => (
                      <MissingFieldRow
                        key={field}
                        field={field}
                        item={item}
                        onNavigate={(path) => {
                          navigate(path);
                          onOpenChange(false);
                        }}
                        testId={`tile-missing-evidence-missing-${i}`}
                      />
                    ))}
                  </div>
                </CardSection>
              )}

              {/* What Happens Next — honest: no auto-retry */}
              <CardSection title="What Happens Next" testId="section-missing-evidence-next">
                <p
                  className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-brain-v1baby-blue-60 w-full"
                  data-testid="text-missing-evidence-next"
                >
                  Once the missing information is in Brain, the next matching event will
                  trigger this agent normally. Blocked runs don't re-trigger on their
                  own — resolving the data alone won't restart this run.
                </p>
              </CardSection>

              {/* Raw audit event link — secondary, near the bottom */}
              <div className="flex items-center w-full">
                <button
                  type="button"
                  onClick={() => {
                    navigate("/settings?section=audit");
                    onOpenChange(false);
                  }}
                  data-testid="link-missing-evidence-audit"
                  className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] text-brain-v1baby-blue-60 hover:text-brain-v1baby-blue-100 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple rounded-[4px]"
                >
                  View raw audit event · {auditTs}
                </button>
              </div>

              <CardActions testId="actions-missing-evidence">
                <ActionRow testId="row-missing-evidence-actions">
                  <ActionButton
                    label={fixAction.label}
                    tone="neutral"
                    onClick={() => {
                      navigate(fixAction.path);
                      onOpenChange(false);
                    }}
                    testId="button-missing-evidence-fix"
                  />
                  <ActionButton
                    label="Dismiss"
                    tone="neutral"
                    size="compact"
                    onClick={() => onOpenChange(false)}
                    testId="button-missing-evidence-dismiss"
                  />
                </ActionRow>
              </CardActions>
            </CardBody>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
