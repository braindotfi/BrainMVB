/**
 * Detail card for a "Needs Your Input" row — an agent run that stopped because
 * a required fact was absent.
 *
 * Shell matches AgentProposalModal exactly: same header, hero, CardBody section
 * rhythm, CardActions footer, and optional PagerFooter. Content differs:
 *
 *   - Amber "Blocked" status pill (not a risk-level pill)
 *   - Real agent name in the header (not generic "Brain Agent")
 *   - Context subtitle under the headline (entity · ref · field)
 *   - "Status" section fills the confidence slot with an honest amber line
 *   - No confidence bar — Brain didn't produce one, so none is shown
 *   - "Why This Is Blocked" replaces "Why Brain Suggested This"
 *   - Details table omits Run ID (raw technical value, lives in audit link)
 *   - Linked Evidence keeps existing refs + amber "Missing" rows with "+Add" buttons
 *   - Footer: "Remind later" (secondary) + field-specific orange primary action
 *   - Optional Previous / Next pager matching the approval modal's footer
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
  CardText,
  KeyFactsTable,
  StatusPill,
  EvidenceLinkRow,
  TypeTag,
  ActionButton,
  ActionRow,
  PagerFooter,
} from "./ProposalCardParts";
import {
  type MissingEvidenceItem,
  humanizeField,
  refKindLabel,
  agentKeyFromAction,
  inputRowActionLabel,
  inputRowFixPath,
  buildInputRowSubtitle,
} from "@/lib/agentRunInput";
import { AGENT_DISPLAY_NAME, agentBadgeLabel } from "@/lib/agentProposals";

/* ── Amber palette (matches TAG_AGENT / the "Needs your input" section accent) */
const AMBER_PILL = {
  color: "#ff9500",
  bg: "rgba(255,149,0,0.08)",
  border: "rgba(255,149,0,0.25)",
};

/* ── Agent display name ──────────────────────────────────────────────────────
   Derives the human name from the audit event's attempted action, matching how
   the approval modal reads its agent name from proposal.type. Unknown actions
   degrade to "Brain" rather than showing a raw action string in the title. */
function agentDisplayName(item: MissingEvidenceItem): string {
  const actionKey = agentKeyFromAction(item.attemptedAction);
  const keys = [item.agentKey, actionKey].filter(Boolean) as string[];
  const upstreamName = item.agentName?.trim().replace(/\s+agent\s*$/i, "");
  if (upstreamName && !/^(brain|agent)$/i.test(upstreamName)) {
    return `${upstreamName} Agent`;
  }
  const resolvedKey = keys.find((key) => (AGENT_DISPLAY_NAME as Record<string, string>)[key]);
  return resolvedKey ? agentBadgeLabel(resolvedKey) : "Brain Agent";
}

/* ── Routing ─────────────────────────────────────────────────────────────────
   Routes to wherever the missing field is actually managed. Delegates to the
   shared inputRowFixPath helper so the row CTA and the modal CTA never drift
   apart. Label also matches the row's inputRowActionLabel for consistency. */

interface FixAction {
  label: string;
  path: string;
}

function primaryFixAction(item: MissingEvidenceItem): FixAction {
  const field = item.missingFields[0];
  return {
    label: inputRowActionLabel(field),
    path: inputRowFixPath(item),
  };
}

/** Route for a single missing field — shown on the per-row "+Add" affordance. */
function fieldFixPath(field: string, item: MissingEvidenceItem): string {
  return inputRowFixPath({ ...item, missingFields: [field] });
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
      "payment.execute":      "execute a payment",
      "payment.schedule":     "schedule a payment",
      "collections.remind":   "send a collections reminder",
      "reconciliation.match": "match a transaction",
      "treasury.sweep":       "move cash between accounts",
      "vendor_risk.assess":   "assess vendor risk",
      "fraud.review":         "review a transaction for fraud",
      "cash_forecast.project":"update the cash forecast",
    };
    return action ? (PHRASES[action] ?? `run ${action}`) : "complete this action";
  })();

  return (
    `Brain attempted to ${actionPhrase} but stopped before reaching a decision ` +
    `because it couldn't find ${fieldList}. ` +
      `This run will not retry automatically. Once the missing information is in Brain, ` +
    `the next matching trigger will proceed normally.`
  );
}

/* ── Details table ───────────────────────────────────────────────────────────
   Shows the run's human-readable facts. Run ID is intentionally excluded — it
   is a raw technical value that belongs in the audit event, not this table. */

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
  // Run ID deliberately excluded — see module header.
  return rows;
}

/* ── "Missing" evidence row ──────────────────────────────────────────────────
   Same shell as EvidenceLinkRow but with an amber "Missing" tag and a proper
   "+Add" button (not a bare text link) so the affordance reads as clearly
   actionable at the same visual weight as the tappable evidence rows above it. */

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
    className="bg-brain-v1highlight-dropdown-bg border border-solid border-brain-v1stroke-2 rounded-row px-[16px] py-[12px] flex gap-[16px] items-center w-full"
    data-testid={testId}
  >
    {/* Amber "Missing" type tag */}
    <TypeTag label="Missing" tone="agent" testId={testId ? `${testId}-kind` : undefined} />

    {/* Field name */}
    <div className="flex flex-1 items-center min-w-px">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[16px] leading-[20px] text-brain-v1baby-blue-100 truncate">
        {humanizeField(field)}
      </p>
    </div>

    {/* "+Add" — styled as a proper small button, not a bare text link */}
    <button
      type="button"
      onClick={() => onNavigate(fieldFixPath(field, item))}
      data-testid={testId ? `${testId}-add` : undefined}
      className="inline-flex items-center gap-[4px] shrink-0 [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] bg-brain-v1dark-orange text-brain-v1light-orange hover:bg-brain-v1dark-orange-hover px-[8px] py-[4px] rounded-pill transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
    >
      <Plus size={12} aria-hidden="true" />
      Add
    </button>
  </div>
);

/* ── Amber status line (fills the confidence slot) ───────────────────────────
   The approval modal has a Confidence bar with a percentage here. A blocked run
   produced no score — skipping the slot entirely reads as broken next to the
   approval card's fully-populated version, so we replace it with an honest
   amber line that explains why. No numeric value is shown. */
const StatusLine = () => (
  <div
    className="flex items-center gap-[8px] w-full bg-[rgba(255,149,0,0.06)] border border-solid border-[rgba(255,149,0,0.2)] rounded-row px-[12px] py-[8px]"
    data-testid="box-missing-evidence-status"
  >
    <div
      className="size-[8px] rounded-full shrink-0"
      style={{ background: "#ff9500" }}
      aria-hidden="true"
    />
    <p className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[18px] text-brain-v1light-orange flex-1 min-w-px">
       Brain stopped before producing a recommendation. No confidence score applies to a blocked run.
    </p>
  </div>
);

/* ── Modal ───────────────────────────────────────────────────────────────── */

export function MissingEvidenceModal({
  item,
  open,
  onOpenChange,
  vendorNameMap,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  position,
}: {
  item: MissingEvidenceItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorNameMap?: Map<string, string>;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  position?: string;
}) {
  const [, navigate] = useLocation();
  const transition = useCardTransition(open);

  if (!item) return null;

  const agentName  = agentDisplayName(item);
   /* Keep the card title aligned with the Inbox agent badge and modal header.
      The blocked action remains in the supporting context below. */
   const headline   = agentName;
  const subtitle   = buildInputRowSubtitle(item, vendorNameMap ?? new Map());
  const whyBlocked = buildWhyBlocked(item);
  const detailRows = buildDetailsRows(item);
  const fixAction  = primaryFixAction(item);
  const showPager  = Boolean(onPrev && onNext);

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

  const closeAndNavigate = (path: string) => {
    navigate(path);
    onOpenChange(false);
  };

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
          className={`fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-brain-v1baby-blue-5 border border-brain-v1stroke-2 border-solid flex flex-col items-start overflow-hidden rounded-modal w-[520px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none ${transition.card}`}
        >
          {/* Header — real agent name centered, close at right. Matches approval modal exactly. */}
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-brain-v1stroke-2 border-solid h-[56px] relative shrink-0 w-full flex items-center justify-center px-[16px]">
            <DialogPrimitive.Title
              className="[font-family:'Gilroy',sans-serif] font-semibold text-[20px] leading-[24px] text-brain-v1baby-blue-100 text-center whitespace-nowrap"
              data-testid="text-missing-evidence-title"
            >
              {agentName}
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
            {/* Hero — amber "Blocked" pill, then headline + context subtitle.
                Matches the approval modal's hero: pill, then a flex-col gap-8 group
                with a 20/28 title and a 16/20 muted subtitle beneath it. */}
            <div className="border-b border-brain-v1stroke-2 border-solid flex flex-col gap-[8px] items-start p-[24px] shrink-0 w-full">
              <StatusPill
                label="Blocked"
                color={AMBER_PILL.color}
                background={AMBER_PILL.bg}
                border={AMBER_PILL.border}
                testId="pill-missing-evidence-status"
              />
              <div className="flex flex-col gap-[8px] items-start w-full">
                <p
                  className="[font-family:'Gilroy',sans-serif] font-semibold text-[20px] leading-[28px] text-brain-v1baby-blue-100 w-full"
                  data-testid="text-missing-evidence-headline"
                >
                  {headline}
                </p>
                {subtitle && (
                  <p
                    className="[font-family:'Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-brain-v1baby-blue-60 w-full"
                    data-testid="text-missing-evidence-subtitle"
                  >
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            <CardBody>
              {/* Status — fills the confidence slot so the card reads as complete
                  next to the approval card. No numeric value — this run didn't
                  produce one, so a percentage would be fabricated. */}
              <CardSection title="Confidence" testId="section-missing-evidence-status">
                <StatusLine />
              </CardSection>

              {/* Why This Is Blocked — plain-language explanation, kept as-is */}
              <CardSection title="Why This Is Blocked" testId="section-missing-evidence-why">
                <CardText testId="text-missing-evidence-why">
                  {whyBlocked}
                </CardText>
              </CardSection>

              {/* Details — human-readable run facts only. Run ID omitted — it's a
                  raw technical id that belongs in the audit event link below, not
                  here alongside Attempted action and the missing field values. */}
              {detailRows.length > 0 && (
                <CardSection title="Details" testId="section-missing-evidence-details">
                  <KeyFactsTable rows={detailRows} testId="list-missing-evidence-details" />
                </CardSection>
              )}

              {/* Linked Evidence — existing entity refs + an amber "Missing" row for
                  each absent field. The two lists are kept separate so existing
                  evidence is never visually confused with the gap. */}
               {(item.entityRefs.length > 0 || item.missingFields.length > 0) && (
                 <CardSection title="Linked Evidence" testId="section-missing-evidence-evidence">
                  <div
                    className="flex flex-col gap-[8px] items-start w-full"
                    data-testid="list-missing-evidence-evidence"
                  >
                    {item.entityRefs.map((ref, i) => (
                      <EvidenceLinkRow
                        key={ref}
                        label={ref}
                        kind={refKindLabel(ref)}
                        kindTone="agent"
                        onClick={() => {
                          if (ref.startsWith("cp_")) {
                            closeAndNavigate(
                              `/ledger?tab=counterparties&vendor=${encodeURIComponent(ref)}`,
                            );
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
                        onNavigate={(path) => closeAndNavigate(path)}
                        testId={`tile-missing-evidence-missing-${i}`}
                      />
                    ))}
                  </div>
                </CardSection>
              )}

              {/* What Happens Next — honest: no auto-retry */}
              <CardSection title="What Happens Next" testId="section-missing-evidence-next">
                <CardText testId="text-missing-evidence-next">
                  Once the missing information is in Brain, the next matching event will
                  trigger this agent normally. Blocked runs do not re-trigger on their
                  own. Resolving the data alone will not restart this run.
                </CardText>
              </CardSection>

              {/* Raw audit event link — secondary, near the bottom. Kept here (not
                  promoted to a primary button) because it's the right place for
                  technical/raw values like Run ID and the raw event payload. */}
              <div className="flex items-center w-full">
                <button
                  type="button"
                  onClick={() => closeAndNavigate("/settings?section=audit")}
                  data-testid="link-missing-evidence-audit"
                  className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] text-brain-v1baby-blue-60 hover:text-brain-v1baby-blue-100 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple rounded-[4px]"
                >
                  View raw audit event · {auditTs}
                </button>
              </div>

              {/* Footer buttons — match the approval modal's Reject/Approve layout:
                  two full-width buttons, same size, side by side.
                  "Remind later" = secondary (grey), same shape as Reject.
                  Primary action = warning (orange), same shape as Approve, with a
                  field-specific label from inputRowActionLabel. If a destination
                  isn't confirmed for a given field type yet, inputRowFixPath falls
                  back to the audit log and the label reads "Resolve" — both honest. */}
              <CardActions testId="actions-missing-evidence">
                <ActionRow testId="row-missing-evidence-actions">
                  <ActionButton
                    label="Remind later"
                    tone="neutral"
                    onClick={() => onOpenChange(false)}
                    testId="button-missing-evidence-remind"
                  />
                  <ActionButton
                    label={fixAction.label}
                    tone="warning"
                    onClick={() => closeAndNavigate(fixAction.path)}
                    testId="button-missing-evidence-fix"
                  />
                </ActionRow>
              </CardActions>
            </CardBody>
          </div>

          {/* Previous / Next — same footer as approval modal, same position */}
          {showPager && (
            <PagerFooter
              onPrev={onPrev!}
              onNext={onNext!}
              hasPrev={hasPrev}
              hasNext={hasNext}
              position={position}
            />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
