/**
 * Payable detail popup — for a payable with NO invoice behind it.
 *
 * Payroll and tax are owed exactly the way a bill is, but brain-core derives them
 * from an ingested document rather than from an invoice, so there is no invoice
 * number, no PO and no invoice document to open. This renders the same shell as
 * BillDetailPopup (shared, not copied — see components/detailPopup.tsx) with only
 * the fields the record actually carries.
 *
 * The alternative — reusing the bill popup with blanks where the invoice fields go —
 * would present "-" as if the invoice existed and its number were missing. A field
 * that cannot apply is omitted, not emptied.
 */

import { useCurrency } from "@/lib/useCurrency";
import { capitalCase } from "@/lib/displayLabels";
import { statusChip } from "@/lib/obligationRows";
import type { Obligation } from "@/lib/brainObligations";
import {
  DetailPopupShell,
  DetailPopupHeader,
  DetailPopupBody,
  DetailTable,
  Row,
  SectionLabel,
  fmtDue,
} from "@/components/detailPopup";
import { RecordPager } from "@/components/RecordPager";

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
  agent_contributed: "Recorded by a Brain agent",
  manual: "Entered by hand",
};

function provenanceLabel(p: string | null): string | null {
  if (!p || !p.trim()) return null;
  return PROVENANCE_LABEL[p.trim().toLowerCase()] ?? capitalCase(p);
}

export function PayableDetailPopup({
  payable,
  counterpartyName,
  payables,
  onSelectPayable,
  invoicesUnknown,
  hidePager,
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
  onClose: () => void;
}) {
  const { format } = useCurrency();

  const open = payable != null;
  const kind = payable?.kind?.trim() ? capitalCase(payable.kind) : null;
  const provenance = provenanceLabel(payable?.provenance ?? null);
  const list = payables ?? [];
  const currentIdx = payable ? list.findIndex((p) => p.id === payable.id) : -1;

  return (
    <DetailPopupShell
      title="Payable Details"
      open={open}
      onClose={onClose}
      closeTestId="button-close-payable-popup"
    >
      {payable ? (
        <>
          <DetailPopupHeader
            /* Same wording the row uses, so opening a row never renames what it
               was pointing at. */
            name={counterpartyName ?? "Unidentified counterparty"}
            /* brain-core's own status, NOT a chip derived from the due date — the row
               that opened this popup shows exactly this, and the two must agree. */
            chip={statusChip(payable.status)}
            amount={format(Number(payable.amount_due))}
            currency={payable.currency}
            nameTestId="text-payable-counterparty"
            chipTestId="payable-due-chip"
            amountTestId="text-payable-amount"
          />

          <DetailPopupBody testId="payable-detail-popup-content">
            <div className="flex flex-col gap-[16px] items-start w-full">
              <SectionLabel>Details</SectionLabel>
              <DetailTable>
                {/* `kind` and not `direction`: direction folds the payable/receivable
                    axis in and would read "Payable" where this wants "Payroll". */}
                {kind && <Row label="Type" value={kind} />}
                <Row label="Amount" value={format(Number(payable.amount_due))} />
                {/* No Status row: the header chip already carries it, and repeating it
                    here rendered "Status  Due" directly under a "Due" chip. */}
                <Row label="Due" value={fmtDue(payable.due_date)} />
                {provenance && <Row label="Recorded" value={provenance} />}
                {/* The bill popup calls the invoice id "Source". This record's own id
                    is the equivalent handle — it is what support would ask for — but
                    it is not a source, and labelling it one would point at an invoice
                    that does not exist. */}
                <Row label="Record" value={payable.id} />
              </DetailTable>
            </div>

            <div className="flex flex-col gap-[16px] items-start w-full">
              <SectionLabel>What Happens Next</SectionLabel>
              {/* Deliberately not the bill popup's "Brain hasn't proposed this yet.
                  When it does, you'll approve before any money moves." A payment
                  intent carries an invoiceId, so a payable with no invoice cannot
                  currently be proposed at all — promising a future approval step
                  would be inventing a workflow that does not exist for this record. */}
              <p
                className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-brain-v1baby-blue-100 text-[16px] w-full"
                data-testid="text-payable-next"
              >
                {invoicesUnknown
                  ? "Couldn't load your invoices. Whether one backs this payable is unknown. It is still counted in what you owe and tracked for its due date."
                  : "Brain proposes payments from invoices, and this payable has none on file, so there is nothing to approve here. It is counted in what you owe and tracked for its due date."}
              </p>
            </div>
          </DetailPopupBody>
          {!hidePager && (
            <div className="border-t border-brain-v1stroke-2 border-solid flex items-center justify-between p-[16px] w-full">
              <RecordPager
                onPrev={() => currentIdx > 0 && onSelectPayable?.(list[currentIdx - 1])}
                onNext={() => currentIdx >= 0 && currentIdx < list.length - 1 && onSelectPayable?.(list[currentIdx + 1])}
                disabledPrev={currentIdx <= 0}
                disabledNext={currentIdx < 0 || currentIdx >= list.length - 1}
                testIdPrefix="payable"
              />
            </div>
          )}
        </>
      ) : null}
    </DetailPopupShell>
  );
}
