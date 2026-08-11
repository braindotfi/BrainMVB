import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight } from "lucide-react";
import closeIcon from "@assets/Close_1783293571882.png";
import checkIcon from "@assets/check_1784935340999.png";
import warningIcon from "@assets/warning_1783385196939.png";
import type { AuditRecord, LinkedEntity } from "@/lib/auditTypes";
import { auditRecordLabel, auditRecordTitle, auditEventChipClass, isAssistantActivity, linkedRelationship, humanReadableActor } from "@/lib/auditTypes";
import { auditStatusPill } from "@/lib/decisionPills";
import { DecisionPill } from "./TierRowList";
import { resolveActorRole, actorIdentityTokens } from "@/lib/actors";
import { resolveMemberByTokens, openMemberDetail, useMembersCache } from "@/lib/membersStore";
import { AnchorStatus } from "./AnchorStatus";
import { DocumentViewerPopup } from "./DocumentViewerPopup";
import { useCurrency } from "@/lib/useCurrency";
import { useCardTransition } from "@/lib/cardTransition";
import { useLocation } from "wouter";
import { openRuleDetail, resolveRule } from "@/lib/openRuleDetail";
import { openVendorDetail, resolveVendor } from "@/lib/openVendorDetail";
import { openDocumentDetail, resolveDocument } from "@/lib/openDocumentDetail";
import { openProposalDetail, resolveProposal } from "@/lib/openProposalDetail";
import type { DocumentRecord } from "@/lib/documentTypes";
import { RecordPager } from "./RecordPager";
import { matchCannedPrompt } from "@shared/cannedPrompts";
import { anchorFromInclusionProof, type BrainAuditEventDetail } from "@/lib/brainAudit";
import { capitalCase } from "@/lib/displayLabels";
import { Button } from "@/components/ui/button";

export function AuditRecordPopup({
  record,
  open,
  onOpenChange,
  onPrev,
  onNext,
  pagerDisabled,
  hasPrev,
  hasNext,
  pagerStep,
  returnToBase,
}: {
  record: AuditRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrev?: () => void;
  onNext?: () => void;
  pagerDisabled?: boolean;
  /** Per-direction state, for a pager walking one shared list of mixed record
   *  kinds: at the first row Previous is dead while Next is not, and a single
   *  `pagerDisabled` cannot say that. Defaults to `pagerDisabled` for callers
   *  that still page within one uniform queue. */
  hasPrev?: boolean;
  hasNext?: boolean;
  /** True when this surface was opened by a Previous/Next step rather than by
   *  the user picking a record. Skips the entrance animation — see
   *  useCardTransition. */
  pagerStep?: boolean;
  /* Route this popup should come BACK to when the user follows a linked entity
     (vendor / proposal) and then returns. Defaults to the unified Inbox
     timeline — the old Audit Log page is retired and /audit-log is now only a
     redirect. Callers on other routes pass their own base. */
  returnToBase?: string;
}) {
  const { format, formatText } = useCurrency();
  const transition = useCardTransition(open, pagerStep);
  const [, navigate] = useLocation();
  useMembersCache();
  const [viewingDocument, setViewingDocument] = useState<DocumentRecord | null>(null);
  const [documentOpen, setDocumentOpen] = useState(false);

  /* Per-event inclusion proof — authoritative anchor state for the detail
     view. The list-level anchor (record.anchor) is derived from
     /audit/anchor/latest, which only knows the MOST RECENT anchor window and
     therefore misclassifies events covered by earlier windows as pending
     (see anchorFor() in brainAudit.ts). GET /audit/event/{id} computes the
     inclusion proof against the window that actually contains the event.
     Only real brain-core events (evt_… ids) have this endpoint — synthetic
     local records (local-question-…, review-status overrides) keep their
     list-derived state. While loading / on error we fall back to the
     list-derived value, which may under-claim but never over-claims. */
  const isBrainEvent = !!record && open && /^evt_/.test(record.id);
  const eventDetail = useQuery<BrainAuditEventDetail>({
    queryKey: [`/api/brain/audit/event/${record?.id}`],
    enabled: isBrainEvent,
    retry: false,
    staleTime: 60_000,
  });

  if (!record) return null;

  const anchor =
    isBrainEvent && eventDetail.data && record.anchor.status !== "db_only_hash_chain"
      ? anchorFromInclusionProof(
          record.id,
          eventDetail.data.inclusion_proof,
          eventDetail.data.event?.created_at,
        )
      : record.anchor;

  const isFlagged = record.eventType === "flagged" && !isAssistantActivity(record);

  const handleNavigate = (link: LinkedEntity) => {
    /* Built with URLSearchParams so a base that already carries a query (or a
       record id needing escaping) cannot produce a malformed return URL. */
    const base = returnToBase ?? "/inbox";
    const [basePath, baseQuery = ""] = base.split("?");
    const params = new URLSearchParams(baseQuery);
    params.set("record", record.id);
    const returnTo = `${basePath}?${params.toString()}`;
    if (link.kind === "rule") {
      openRuleDetail(link.refId, navigate);
    } else if (link.kind === "proposal") {
      openProposalDetail(link.refId, navigate, returnTo);
    } else if (link.kind === "vendor") {
      openVendorDetail(link.refId, navigate, returnTo);
    } else if (link.kind === "invoice") {
      openDocumentDetail(link.refId, (d) => {
        setViewingDocument(d);
        setDocumentOpen(true);
      });
    }
  };

  const isAnchored = anchor.status === "anchored" && !!anchor.baseTx;
  /* not_recorded never reached brain-core's audit log, so unlike the other
     pending states there is no future anchor window to promise — suppress
     the "opens once anchored" caption/tooltip for it (button stays disabled). */
  const isNotRecorded = anchor.status === "not_recorded";
  const isDbOnlyAnchor = anchor.status === "db_only_hash_chain";

  const handleVerify = () => {
    if (anchor.verifyHref) {
      window.open(anchor.verifyHref, "_blank", "noopener,noreferrer");
    }
  };

  /* Hero status pill — the SAME capsule the Inbox's Resolved tab renders for
     this decision. Palette and icon set come from lib/decisionPills and it is
     drawn by the shared DecisionPill, so opening a resolved row can never
     restyle its own outcome (Figma 6214-69xxx).

     The LABEL stays the record's own. The Inbox mapping folds `flagged` and
     `trust_revoked` into a generic "Rejected" pill, which reads fine in a list
     of mixed outcomes but would misstate the record in its own audit detail —
     a flagged payment was not rejected.

     Records that are not a settled decision (rule changes, trust grants,
     system / assistant activity) have no outcome pill upstream, so they keep
     the neutral event chip rather than borrowing an outcome's colour.
     auditEventChipClass supplies a border COLOUR only and no `border
     border-solid` is added, so that chip stays borderless (chip-border
     convention). */
  const statusPill = () => {
    const label = auditRecordLabel(record);
    const assistant = isAssistantActivity(record);
    const decision = assistant ? undefined : auditStatusPill(record.eventType);
    if (decision) {
      return (
        <div data-testid="status-audit-record" className="shrink-0">
          <DecisionPill pill={{ ...decision, label }} />
        </div>
      );
    }
    return (
      <div
        data-testid="status-audit-record"
        className={`content-stretch flex gap-[4px] items-center justify-center px-[12px] py-[8px] rounded-pill shrink-0 ${
          assistant ? "bg-brain-v1baby-blue-15 text-brain-v1baby-blue-60" : auditEventChipClass(record.eventType)
        }`}
      >
        <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] text-center whitespace-nowrap">
          {capitalCase(label)}
        </p>
      </div>
    );
  };

  const SectionHeader = ({ children }: { children: React.ReactNode }) => (
    <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-60 text-[14px] whitespace-nowrap">
        {children}
      </p>
      <div className="flex-[1_0_0] h-px bg-brain-v1stroke-2 min-w-px" />
    </div>
  );

  const hasPager = !!(onPrev && onNext);

  return (
    <>
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] ${transition.overlay}`} />
          <DialogPrimitive.Content className={`fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-brain-v1baby-blue-5 border border-brain-v1stroke-2 border-solid flex flex-col items-start overflow-hidden rounded-modal w-[520px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none ${transition.card}`}>

            {/* Header - close button right, title centred */}
            <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-brain-v1stroke-2 border-b border-solid h-[56px] relative shrink-0 w-full">
              <p className="-translate-x-1/2 [font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-brain-v1baby-blue-100 text-[20px] text-center whitespace-nowrap absolute left-1/2 top-[calc(50%-12px)]">
                {auditRecordTitle(record)}
              </p>
              <DialogPrimitive.Close
                className="absolute right-[11px] top-[11px] size-[32px] p-0 hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
                data-testid="button-close-audit-popup"
              >
                <img src={closeIcon} alt="" className="size-[32px] rounded-full" />
              </DialogPrimitive.Close>
            </div>

            {/* Summary — the status pill follows the title like Inbox decision rows. */}
            <div className="border-brain-v1stroke-2 border-b border-solid content-stretch flex flex-col gap-[8px] items-start p-[24px] relative shrink-0 w-full">
              {/* Figma 5734:71725 — the summary WRAPS beside a shrink-0 pill
                  (top-aligned), it does not truncate: an audit record's own
                  headline is the one string this surface must never clip. */}
              <div className="content-stretch flex items-start gap-[8px] relative shrink-0 w-full">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-brain-v1baby-blue-100 text-[20px] flex-[1_0_0] min-w-px [word-break:break-word]">
                  {formatText(record.summary)}
                </p>
                {statusPill()}
              </div>
              <div className="content-stretch flex items-center relative shrink-0 w-full">
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-brain-v1baby-blue-60 text-[16px]">
                  {record.occurredAtLabel}
                </p>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex flex-col gap-[32px] items-start p-[24px] w-full overflow-y-auto">

              {/* Decision Lifecycle */}
              {record.lifecycle.length > 0 && (
                <div className="relative shrink-0 w-full">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[16px] items-start relative size-full">
                    <SectionHeader>Decision Lifecycle</SectionHeader>
                    <div className="bg-brain-v1highlight-dropdown-bg border border-brain-v1stroke-2 border-solid content-stretch flex flex-col items-start relative rounded-row shrink-0 w-full">
                      <div className="content-stretch flex items-start p-[16px] relative shrink-0 w-full">
                        <div className="content-stretch flex flex-[1_0_0] flex-col items-start min-w-px relative">
                          {record.lifecycle.map((step, idx) => {
                            const isLast = idx === record.lifecycle.length - 1;
                            const isAlert = step.kind === "alert";
                            const actorRole = resolveActorRole(step.actor);
                            const actorMember = resolveMemberByTokens(actorIdentityTokens(step.actor));
                            return (
                              <div key={idx} className={`content-stretch flex gap-[8px] items-start relative shrink-0 w-full${!isLast ? " pb-[16px]" : ""}`}>
                                {/* Icon + solid connector - self-stretch so line spans the pb gap to the next icon */}
                                <div className="flex flex-col items-center self-stretch shrink-0 w-[16px]">
                                  <img
                                    src={isAlert ? warningIcon : checkIcon}
                                    alt={isAlert ? "Alert" : "Check"}
                                    className="size-[16px] shrink-0"
                                  />
                                  {!isLast && (
                                    <div className="mt-[4px] mb-[4px] w-[2px] flex-1 bg-brain-v1stroke-2" />
                                  )}
                                </div>
                                <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col [font-family:'Gilroy',sans-serif] font-medium gap-[8px] items-start justify-center leading-[16px] min-w-px not-italic relative text-[14px]">
                                  <p className="relative shrink-0 text-brain-v1baby-blue-100 w-full">
                                    {actorMember ? (
                                      <button
                                        type="button"
                                        onClick={() => openMemberDetail(actorMember.id)}
                                        data-testid={`link-actor-member-${idx}`}
                                        className="text-brain-v1baby-blue-100 underline decoration-brain-v1baby-blue-30 underline-offset-2 hover:decoration-brain-v1baby-blue-100 transition-colors"
                                      >
                                        {formatText(step.label)}
                                      </button>
                                    ) : (
                                      formatText(step.label)
                                    )}
                                    {actorRole && (
                                      <span data-testid={`text-actor-role-${idx}`} className="text-brain-v1baby-blue-60">
                                        {" "}· {actorRole}
                                      </span>
                                    )}
                                    {step.authority && (
                                      <span data-testid={`text-actor-authority-${idx}`} className="text-brain-v1baby-blue-60">
                                        {" "}· {formatText(step.authority)}
                                      </span>
                                    )}
                                  </p>
                                  {(() => {
                                    /* App-generated canned prompts (matched by exact text)
                                       lead with the human description; the exact prompt sent
                                       is still shown below — the audit log never hides what
                                       was actually sent, it just stops leading with it. */
                                    const canned = matchCannedPrompt(step.note);
                                    if (!canned) {
                                      return step.note ? (
                                         <p className="relative shrink-0 text-brain-v1baby-blue-30 w-full">{formatText(step.note)}</p>
                                      ) : null;
                                    }
                                    return (
                                      <>
                                        <p data-testid={`text-canned-description-${idx}`} className="relative shrink-0 text-brain-v1baby-blue-30 w-full">
                                           {formatText(canned.description)}
                                        </p>
                                        <p data-testid={`text-canned-prompt-${idx}`} className="relative shrink-0 text-brain-v1baby-blue-30 w-full">
                                           <span className="text-brain-v1baby-blue-60">Exact prompt used:</span>{" "}
                                           {formatText(canned.prompt)}
                                        </p>
                                      </>
                                    );
                                  })()}
                                  {(() => {
                                    /* Actor line — honest omission: only renders when a
                                       human-readable actor is available (raw machine ids are
                                       filtered upstream by humanReadableActor), and skipped
                                       when the step label already names the actor. */
                                    const actorName = humanReadableActor(step.actor);
                                    if (!actorName || step.label.includes(actorName)) return null;
                                    const canned = matchCannedPrompt(step.note);
                                    return (
                                      <p
                                        data-testid={`text-step-actor-${idx}`}
                                        className="relative shrink-0 text-brain-v1baby-blue-60 w-full"
                                      >
                                        {isAssistantActivity(record)
                                          ? canned
                                            ? `Run automatically on behalf of ${actorName}`
                                            : `Asked on behalf of ${actorName}`
                                          : `By ${actorName}`}
                                      </p>
                                    );
                                  })()}
                                  <p className="relative shrink-0 text-brain-v1baby-blue-60 w-full">{step.timestamp}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Linked Evidence */}
              {record.linked.length > 0 && (
                <div className="relative shrink-0 w-full">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[16px] items-start relative size-full">
                    <SectionHeader>Linked Evidence</SectionHeader>
                    <div className="content-stretch flex flex-col gap-[8px] items-start relative shrink-0 w-full">
                      {record.linked.map((link) => {
                        const ruleGone = link.kind === "rule" && !resolveRule(link.refId);
                        const vendorGone = link.kind === "vendor" && !resolveVendor(link.refId);
                        const invoiceGone = link.kind === "invoice" && !resolveDocument(link.refId);
                        const proposalGone = link.kind === "proposal" && !resolveProposal(link.refId);
                        const tappable =
                          (link.kind === "proposal" && !proposalGone) ||
                          (link.kind === "rule" && !ruleGone) ||
                          (link.kind === "vendor" && !vendorGone) ||
                          (link.kind === "invoice" && !invoiceGone);
                        const chipLabel = linkedRelationship(record, link) ?? link.kind;

                        if (!tappable) {
                          return (
                            <div
                              key={`${link.kind}-${link.refId}`}
                              data-testid={`text-linked-${link.kind}-${link.refId}`}
                              className="bg-brain-v1highlight-dropdown-bg border border-brain-v1stroke-2 border-solid content-stretch flex gap-[16px] items-center px-[16px] py-[12px] relative rounded-row shrink-0 w-full"
                            >
                              <div className="content-stretch flex flex-[1_0_0] gap-[16px] items-center min-w-px relative">
                                <div className="bg-brain-v1baby-blue-15 border border-[rgba(108,119,157,0.2)] border-solid content-stretch flex items-center justify-center px-[8px] py-[3px] relative rounded-pill shrink-0">
                                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-brain-v1baby-blue-60 text-[12px] text-center whitespace-nowrap">
                                    {capitalCase(chipLabel)}
                                  </p>
                                </div>
                                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[16px] text-brain-v1baby-blue-60">
                                  {formatText(link.label)}
                                </p>
                              </div>
                              {(ruleGone || vendorGone || invoiceGone || proposalGone) && (
                                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] text-brain-v1baby-blue-30 shrink-0">
                                  ({link.kind} unavailable)
                                </p>
                              )}
                            </div>
                          );
                        }

                        return (
                          <button
                            key={`${link.kind}-${link.refId}`}
                            type="button"
                            onClick={() => handleNavigate(link)}
                            data-testid={`button-linked-${link.kind}-${link.refId}`}
                            className="bg-brain-v1highlight-dropdown-bg border border-brain-v1stroke-2 border-solid content-stretch flex gap-[16px] items-center px-[16px] py-[12px] relative rounded-row shrink-0 w-full text-left hover:bg-brain-v1baby-blue-5 hover:border-brain-v1stroke-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
                          >
                            <div className="content-stretch flex flex-[1_0_0] gap-[16px] items-center min-w-px relative">
                              <div className="bg-brain-v1baby-blue-15 border border-[rgba(108,119,157,0.2)] border-solid content-stretch flex items-center justify-center px-[8px] py-[3px] relative rounded-pill shrink-0">
                                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-brain-v1baby-blue-60 text-[12px] text-center whitespace-nowrap">
                                  {capitalCase(chipLabel)}
                                </p>
                              </div>
                              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[16px] text-brain-v1baby-blue-100">
                                {formatText(link.label)}
                              </p>
                            </div>
                            <ChevronRight size={16} className="text-brain-v1baby-blue-60 shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Anchor Proof — hash table + status lines only; no button here.
                  The Verify On-Chain CTA lives in its own footer below (Figma 5734:71827)
                  so the border-t separator is always visible at the bottom of the card,
                  not buried inside the scrollable content. */}
              <div className="relative shrink-0 w-full">
                <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[16px] items-start relative size-full">
                  <SectionHeader>Anchor Proof</SectionHeader>
                  <AnchorStatus anchor={anchor} mode="proof" />
                </div>
              </div>

            </div>

            {/* Verify On-Chain footer — Figma 5734:71827.
                Always present so the popup has a fixed bottom shape regardless of
                anchor state. Disabled (not hidden) until a real tx hash backs it;
                the caption explains why. Sits above the pager when both exist. */}
            <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-brain-v1stroke-2 border-t border-solid flex flex-col gap-[12px] items-start p-[24px] shrink-0 w-full">
              <Button
                variant="primary"
                onClick={handleVerify}
                disabled={!isAnchored}
                title={isAnchored || isNotRecorded || isDbOnlyAnchor ? undefined : "On-chain verification opens once this record is anchored."}
                data-testid="button-verify-on-chain"
                className="w-full"
              >
                Verify On-Chain
              </Button>
              {isDbOnlyAnchor ? (
                <p data-testid="text-verify-db-only-caption" className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] text-brain-v1baby-blue-60">
                  Demo records are retained in Brain's database hash chain and are not published on-chain.
                </p>
              ) : !isAnchored && !isNotRecorded && (
                <p data-testid="text-verify-pending-caption" className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] text-brain-v1baby-blue-60">
                  On-chain verification opens once anchored.
                </p>
              )}
            </div>

            {/* Bottom pager footer - Figma 5573:97391 - two full-width pill buttons */}
            {hasPager && (
              <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-brain-v1stroke-2 border-t border-solid flex flex-col items-start p-[24px] shrink-0 w-full">
                <div className="flex gap-[16px] items-center w-full">
                  <Button
                    variant="secondary"
                    onClick={onPrev}
                    disabled={hasPrev === undefined ? pagerDisabled : !hasPrev}
                    data-testid="button-audit-record-prev"
                    className="flex-1"
                  >
                    <ChevronLeft size={24} className="text-brain-v1baby-blue-60 shrink-0" />
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={onNext}
                    disabled={hasNext === undefined ? pagerDisabled : !hasNext}
                    data-testid="button-audit-record-next"
                    className="flex-1"
                  >
                    Next
                    <ChevronRight size={24} className="text-brain-v1baby-blue-60 shrink-0" />
                  </Button>
                </div>
              </div>
            )}

          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <DocumentViewerPopup
        document={viewingDocument}
        open={documentOpen}
        onOpenChange={setDocumentOpen}
      />
    </>
  );
}
