/**
 * Payable detail popup — Figma node 6625:28266 ("Payable").
 *
 * WHAT THIS RECORD IS
 *
 * A payable is one *observation* of something owed: brain-core read a document and
 * recorded a party, an amount and a due date. It is not a bill (no invoice number, no
 * PO, no payment terms) and it is not an agent recommendation (nothing is proposed and
 * nothing can be approved from here). Payroll and tax are owed exactly the way a bill
 * is, but they arrive as extractions rather than invoices, which is why they need their
 * own surface instead of the bill popup with blanks where the invoice fields go.
 *
 * FIELDS THE FRAME ASKED FOR THAT ARE NOT HERE
 *
 * The frame carried an "External Ref" row. The obligations payload carries no external
 * reference on this entity — checked against a live tenant, key by key — so the row was
 * removed from the design rather than filled with the record id dressed up as a
 * vendor-side reference. Three more rows (Minimum Due, Recurrence, GL Account) exist
 * upstream but are null for every obligation this tenant has today; those render only
 * when a value is actually present. A row that cannot apply is omitted, never emptied
 * to "-", because "-" reads as "the vendor set no minimum" rather than "nobody said".
 *
 * TWO READS, NOT ONE
 *
 * Amount Coherence and GL Account come from `/ledger/obligations/{id}/resolved`, a
 * second endpoint that reports where the linked observations disagree. It is fetched
 * only while the popup is open. When that read FAILS the two sections say so rather
 * than disappearing: a hidden conflict section and an agreeing one look identical, and
 * only one of them is a promise the numbers line up.
 */

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { capitalCase } from "@/lib/displayLabels";
import { statusChip, sourceAmountLabel, glanceAmountLabel } from "@/lib/obligationRows";
import type { Obligation } from "@/lib/brainObligations";
import { recordCurrency } from "@/lib/liabilities";
import {
  fetchResolvedObligation,
  resolvedObligationQueryKey,
  type ObligationConflict,
} from "@/lib/brainObligationResolved";
import {
  DetailPopupShell,
  DetailPopupBody,
  DetailTable,
  LinkedEvidenceRow,
  Row,
  SectionLabel,
} from "@/components/detailPopup";
import { calendarDaysToDue, relativeDueLabel } from "@/lib/dueDates";
import { AlertCallout, MutedCallout } from "@/components/Callout";
import { RecordPager } from "@/components/RecordPager";
import { Button } from "@/components/ui/button";
import { DocumentViewerPopup } from "@/components/DocumentViewerPopup";
import { resolveDocument } from "@/lib/openDocumentDetail";
import type { DocumentRecord } from "@/lib/documentTypes";

/**
 * How the record came to exist, in words.
 *
 * Only values we have actually seen from brain-core are phrased; anything else falls
 * back to the raw value in title case rather than being described. Inventing a
 * sentence for an unknown provenance would be asserting something about where the
 * tenant's money data came from.
 */
const PROVENANCE_LABEL: Record<string, string> = {
  extracted: "Read from an uploaded document",
  agent_contributed: "Recorded by a RobotMoney agent",
  manual: "Entered by hand",
};

function provenanceLabel(p: string | null): string | null {
  if (!p || !p.trim()) return null;
  return PROVENANCE_LABEL[p.trim().toLowerCase()] ?? capitalCase(p);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Aug 30, 2026". UTC-based, like `dueLabel`: a bare `YYYY-MM-DD` parses to UTC
 *  midnight, and reading it back in a negative-offset timezone shifts it a day early. */
function fmtShortDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** "Aug 30, 2026, 14:22 UTC" — an ingest timestamp is a moment, not a day, and the
 *  hour is the part that distinguishes two runs of the same import. */
function fmtTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

/* The relative clause and the calendar-day count both come from `lib/dueDates`, which
   is where this popup's corrected arithmetic now lives so the bill popup's chip
   answers the same question about the same record. */

/** Row from GET /api/integrations/documents, narrowed to what the evidence rows need. */
type SourceDocRow = { id: string; name: string; rawId: string | null };

/** One conflict, in words. Never summarised to "values differ" — the whole point of
 *  brain-core listing every value instead of overwriting is that the user sees them. */
function conflictSentence(c: ObligationConflict, currency: string | null): string {
  const field = c.field === "amount_due" ? "amount" : c.field === "due_date" ? "due date" : c.field;

  /* A conflict brain-core reported but whose values we cannot render is still a
     conflict. Saying nothing here would turn "these sources disagree and we can't
     show you how" into an apparently clean record. */
  if (c.values.length < 2) {
    return `Sources disagree on the ${field}, but the conflicting values could not be read.`;
  }

  const shown = c.values.map((v) => {
    const pretty =
      c.field === "amount_due"
        ? /* Each observation is quoted in the obligation's own currency. brain-core
             does not stamp a currency on the individual conflict values, so this is
             an assumption — but it is the same assumption the record itself makes,
             and converting them instead would compare two numbers on a rate neither
             source agreed to. */
          sourceAmountLabel(v.value, currency)
        : c.field === "due_date"
          ? (fmtShortDate(v.value) ?? v.value)
          : v.value;
    return v.provenance ? `${pretty} (${v.provenance})` : pretty;
  });
  return `Sources disagree on the ${field}: ${shown.join(" vs ")}.`;
}

export function PayableDetailPopup({
  payable,
  counterpartyName,
  payables,
  onSelectPayable,
  invoicesUnknown,
  hidePager,
  onOpenTransaction,
  onClose,
}: {
  /** `null` closes the popup, matching BillDetailPopup's contract. */
  payable: Obligation | null;
  /** Resolved counterparty name, or null when the id did not resolve. */
  counterpartyName: string | null;
  payables?: Obligation[];
  onSelectPayable?: (payable: Obligation) => void;
  /**
   * True when the invoice feed could not be read, so "no invoice backs this" is an
   * unknown rather than a fact. Without this the popup would state a bill has no
   * invoice on file whenever the invoice endpoint happened to be down.
   */
  invoicesUnknown?: boolean;
  /**
   * Hides Previous/Next. Set by surfaces whose list is not the payables list —
   * Overview's cash strip interleaves payables with customer invoices, so paging
   * within one type there would silently skip the events shown either side.
   */
  hidePager?: boolean;
  /**
   * Makes matched-transaction evidence rows tappable. Only surfaces that already own
   * a transaction popup pass it; elsewhere the row still renders (the link is real
   * data) but does not pretend to be actionable.
   */
  onOpenTransaction?: (txId: string) => void;
  onClose: () => void;
}) {
  const [, navigate] = useLocation();
  const [viewingDocument, setViewingDocument] = useState<DocumentRecord | null>(null);
  /* The evidence row that opened the document viewer. A controlled Radix dialog has no
     Trigger to restore focus to, so without this every close path — Esc, the X, the
     overlay — drops focus on <body> and a keyboard user restarts at the top of the
     page instead of on the row they just came from. */
  const docTriggerRef = useRef<HTMLElement | null>(null);

  const open = payable != null;
  const kind = payable?.kind?.trim() ? capitalCase(payable.kind) : null;
  const provenance = provenanceLabel(payable?.provenance ?? null);
  const list = payables ?? [];
  const currentIdx = payable ? list.findIndex((p) => p.id === payable.id) : -1;

  /* The resolved view. `retry: false` because a 404 here is a real answer, not a blip
     — but unlike most reads in this app the error is NOT swallowed into an empty
     default: `resolvedError` drives an explicit "couldn't check" line below. */
  const {
    data: resolved,
    isError: resolvedError,
    isLoading: resolvedLoading,
  } = useQuery({
    queryKey: payable ? resolvedObligationQueryKey(payable.id) : ["resolved-idle"],
    queryFn: () => fetchResolvedObligation(payable!.id),
    enabled: open && payable != null,
    retry: false,
  });

  /* Source documents, for turning a `raw_*` id into the filename the user uploaded.
     Shares the app-wide query key, so it is already warm on most surfaces. */
  const { data: sourceDocs, isError: docsError } = useQuery<SourceDocRow[]>({
    queryKey: ["/api/integrations/documents"],
    enabled: open,
    retry: false,
  });

  const docByRawId = new Map(
    (sourceDocs ?? []).filter((d) => d.rawId).map((d) => [d.rawId as string, d]),
  );

  const sourceIds = payable?.source_ids ?? [];
  const txIds = payable?.linked_transaction_ids ?? [];
  const hasEvidence = sourceIds.length > 0 || txIds.length > 0;

  const dd = calendarDaysToDue(payable?.due_date ?? null);
  const dueDate = fmtShortDate(payable?.due_date ?? null);
  const relative = relativeDueLabel(dd);
  /* The record's own currency, unconverted — see sourceAmountLabel. `glanceAmountLabel`
     drops the code from this one-line summary when the record is in USD, because the
     frame's subtitle is a glance line and "$8,894.63 USD" is noise; it is always kept
     in the Amount row below, and always shown here for anything that is NOT USD, where
     the symbol alone would let a reader assume dollars. The Payables ROW this popup
     opens from renders through the same helper, so the two cannot disagree. */
  /* Normalized, not read raw: a record that omits the code is a USD record in this
     ledger (the same default the join and the totals apply), and quoting it as a
     currency-less number here would disagree with the row that opened this. */
  const currency = payable ? recordCurrency(payable) : null;
  const headlineAmount = payable ? glanceAmountLabel(payable.amount_due, currency) : null;
  /* Built from parts so a record missing a due date reads "$8,894.63" rather than
     "$8,894.63 · Due - · ". */
  const subtitle = [headlineAmount, dueDate ? `Due ${dueDate}` : null, relative]
    .filter(Boolean)
    .join(" · ");

  const chip = payable ? statusChip(payable.status) : null;
  const glAccounts = resolved?.glAccounts ?? null;
  const conflicts = resolved?.conflicts ?? [];
  /* Four outcomes, not two. The read can be in flight, have failed, have come back
     with no resolved view at all (404), or have landed. Only the last one licenses
     silence: a hidden coherence section reads as "the sources agree", and neither an
     outage nor a missing cross-check supports that. A 404 is folded in with the error
     because the user-visible claim is identical — nobody checked. */
  const coherenceUnknown = !resolvedLoading && (resolvedError || resolved == null);
  const showCoherence = !!payable && !resolvedLoading && (coherenceUnknown || conflicts.length > 0);

  /* Receivables reach this popup through the same Obligation type. The whole surface
     has to follow, not just the link: a customer invoice titled "Payable" over a list
     of things the tenant owes states the debt runs the wrong way. */
  const isReceivable = payable?.direction === "receivable";
  const ledgerTab = isReceivable ? "receivables" : "payables";

  return (
    <>
      <DetailPopupShell
        title={isReceivable ? "Receivable" : "Payable"}
        open={open}
        onClose={onClose}
        closeTestId="button-close-payable-popup"
      >
        {payable ? (
          <>
            {/* Header — status pill over the counterparty name over the money/date line.
                Not DetailPopupHeader: that shell leads with a 32px amount and a currency
                pill, and this frame leads with the party. */}
            <div className="border-b border-brain-v1stroke-2 border-solid flex flex-col gap-[8px] items-start p-[24px] shrink-0 w-full">
              {chip && (
                <div
                  className="flex items-center justify-center px-[10px] py-[4px] rounded-pill shrink-0 border border-solid"
                  style={{ background: chip.bg, borderColor: chip.border }}
                  data-testid="payable-due-chip"
                >
                  <p
                    className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[14px] text-center whitespace-nowrap"
                    style={{ color: chip.color }}
                  >
                    {chip.text}
                  </p>
                </div>
              )}
              <p
                className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-brain-v1baby-blue-100 text-[20px] w-full"
                data-testid="text-payable-counterparty"
              >
                {/* Same wording the row uses, so opening a row never renames what it
                    was pointing at. */}
                {counterpartyName ?? "Unidentified counterparty"}
              </p>
              <p
                className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-brain-v1baby-blue-60 text-[16px] w-full"
                data-testid="text-payable-summary"
              >
                {subtitle}
              </p>
            </div>

            <DetailPopupBody testId="payable-detail-popup-content">
              <div className="flex flex-col gap-[16px] items-start w-full">
                <SectionLabel>What RobotMoney Extracted</SectionLabel>
                <DetailTable>
                  <Row
                    label="Party"
                    value={counterpartyName ?? payable.counterparty_id ?? "Unidentified"}
                  />
                  {/* `kind` and not `direction`: direction folds the payable/receivable
                      axis in and would read "Payable" where this wants "Payroll". */}
                  {kind && <Row label="Type" value={kind} />}
                  <Row label="Amount" value={sourceAmountLabel(payable.amount_due, currency)} />
                  {payable.minimum_due && (
                    <Row
                      label="Minimum Due"
                      value={sourceAmountLabel(payable.minimum_due, currency)}
                    />
                  )}
                  {dueDate && <Row label="Due" value={dueDate} />}
                  {payable.recurrence && (
                    <Row label="Recurrence" value={capitalCase(payable.recurrence)} />
                  )}
                  {glAccounts && <Row label="GL Account" value={glAccounts.join(", ")} />}
                </DetailTable>
              </div>

              {showCoherence && (
                <div
                  className="flex flex-col gap-[16px] items-start w-full"
                  data-testid="payable-coherence"
                >
                  <SectionLabel>Amount Coherence</SectionLabel>
                  <AlertCallout testId="payable-coherence-callout">
                    {coherenceUnknown
                      ? "Couldn't check this against RobotMoney's other records of the same debt, so whether the sources agree — and how it's coded to your GL — is unknown."
                      : conflicts.map((c) => conflictSentence(c, currency)).join(" ")}
                  </AlertCallout>
                </div>
              )}

              {hasEvidence && (
                <div className="flex flex-col gap-[8px] items-start w-full">
                  <SectionLabel>Linked Evidence</SectionLabel>
                  {sourceIds.map((rawId, i) => {
                    const doc = docByRawId.get(rawId);
                    /* The raw-artifact endpoint carries no filename, so an id with no
                       matching upload shows the id. It is not pretty, but it is the
                       handle that identifies the artifact — inventing "document.pdf"
                       would name a file the tenant never uploaded.

                       `resolveDocument` reads a separate store from the query that
                       decided this row was tappable, so it can still come back empty.
                       Rather than a row that highlights and then does nothing, that
                       case falls through to the same honest note as a failed read. */
                    return (
                      <LinkedEvidenceRow
                        key={rawId}
                        kind="Document"
                        label={doc?.name ?? rawId}
                        testId={`payable-evidence-document-${i}`}
                        onClick={
                          doc
                            ? (e) => {
                                const record = resolveDocument(doc.id);
                                if (!record) return;
                                docTriggerRef.current = e.currentTarget as HTMLElement;
                                setViewingDocument(record);
                              }
                            : undefined
                        }
                      />
                    );
                  })}
                  {txIds.map((txId, i) => (
                    <LinkedEvidenceRow
                      key={txId}
                      kind="Transaction"
                      label={txId}
                      testId={`payable-evidence-transaction-${i}`}
                      onClick={
                        onOpenTransaction
                          ? () => {
                              /* Close first. The transaction popup belongs to the host
                                 screen, so leaving this one mounted stacks two dialogs
                                 and the Esc key then closes the wrong one. */
                              onClose();
                              onOpenTransaction(txId);
                            }
                          : undefined
                      }
                    />
                  ))}
                  {/* An unreadable document list makes every source look like a bare id
                      that nobody ever uploaded a file for. Those two states look
                      identical on screen, so the outage has to say its own name. */}
                  {docsError && sourceIds.length > 0 && (
                    <p
                      className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-brain-v1baby-blue-60 text-[12px]"
                      data-testid="text-payable-evidence-names-unavailable"
                    >
                      Couldn't load your document list, so these are shown by id and can't
                      be opened.
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-[16px] items-start w-full">
                <SectionLabel>Provenance</SectionLabel>
                <DetailTable>
                  {provenance && <Row label="Source" value={provenance} />}
                  {fmtTimestamp(payable.created_at) && (
                    <Row label="Ingested" value={fmtTimestamp(payable.created_at)} />
                  )}
                  {payable.confidence !== null && (
                    <Row label="Confidence" value={`${Math.round(payable.confidence * 100)}%`} />
                  )}
                  {/* The bill popup calls the invoice id "Source". This record's own id
                      is the equivalent handle — it is what support would ask for — but
                      it is not a source, and labelling it one would point at an invoice
                      that does not exist. */}
                  <Row label="Record ID" value={payable.id} />
                </DetailTable>
              </div>

              {/* Deliberately not the bill popup's "Brain hasn't proposed this yet. When
                  it does, you'll approve before any money moves." A payment intent
                  carries an invoiceId, so a payable with no invoice cannot currently be
                  proposed at all — promising a future approval step would invent a
                  workflow that does not exist for this record.

                  The frame's wording was "Brain reads this invoice", which is wrong for
                  the payroll and tax records that make up most of this surface. */}
              {/* The closing clause used to be "— your accounting system owns the
                  payment." Nothing in this product establishes that the tenant even
                  has an accounting system, let alone that it is the thing that pays.
                  What IS true is the negative: no payment can be made or scheduled
                  from this record. The sentence stops where the evidence does. */}
              <MutedCallout title="A viewer, not an AP system" testId="text-payable-next">
                {invoicesUnknown
                  ? "RobotMoney reads this record and tracks what it costs you and when it falls due. Nothing is paid or scheduled from here. Your invoice feed couldn't be read, so whether an invoice also backs this is unknown."
                  : "RobotMoney reads this record and tracks what it costs you and when it falls due. Nothing is paid or scheduled from here."}
              </MutedCallout>

              <Button
                variant="primary"
                className="w-full text-[16px] leading-[20px]"
                data-testid="button-payable-open-in-ledger"
                onClick={() => {
                  onClose();
                  navigate(`/ledger?tab=${ledgerTab}`);
                }}
              >
                Open in Ledger
              </Button>
            </DetailPopupBody>

            {!hidePager && (
              <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-t border-brain-v1stroke-2 border-solid flex items-center justify-between p-[24px] shrink-0 w-full">
                <RecordPager
                  onPrev={() => currentIdx > 0 && onSelectPayable?.(list[currentIdx - 1])}
                  onNext={() =>
                    currentIdx >= 0 &&
                    currentIdx < list.length - 1 &&
                    onSelectPayable?.(list[currentIdx + 1])
                  }
                  disabledPrev={currentIdx <= 0}
                  disabledNext={currentIdx < 0 || currentIdx >= list.length - 1}
                  testIdPrefix="payable"
                />
              </div>
            )}
          </>
        ) : null}
      </DetailPopupShell>

      <DocumentViewerPopup
        document={viewingDocument}
        open={viewingDocument !== null}
        restoreFocusTo={docTriggerRef}
        onOpenChange={(o) => {
          if (!o) setViewingDocument(null);
        }}
      />
    </>
  );
}
