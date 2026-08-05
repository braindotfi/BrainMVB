/**
 * Receivable detail popup — one AR invoice, i.e. money owed TO the tenant.
 *
 * This renders the same shell as the Bill and Payable popups (shared via
 * components/detailPopup.tsx, not copied) so a row on Receivables opens the same
 * kind of surface as a row on Payables.
 *
 * It is a separate component rather than a reuse of BillDetailPopup for one reason:
 * that popup is titled "Bill Details" and is built around a bill the tenant has to
 * pay — it offers the payment-approval path and reads payment intents. A receivable
 * is the opposite direction of money. Presenting one inside the bill popup would
 * label income as a bill and imply an approval step that does not exist for it.
 */

import { useCurrency } from "@/lib/useCurrency";
import { statusChip } from "@/lib/obligationRows";
import type { Receivable } from "@/lib/receivables";
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

export function ReceivableDetailPopup({
  receivable,
  counterpartyName,
  receivables,
  onSelectReceivable,
  onClose,
}: {
  /** `null` closes the popup, matching the other detail popups' contract. */
  receivable: Receivable | null;
  /** Resolved counterparty name, or null when the id did not resolve. */
  counterpartyName: string | null;
  receivables?: Receivable[];
  onSelectReceivable?: (receivable: Receivable) => void;
  onClose: () => void;
}) {
  const { format } = useCurrency();

  const open = receivable != null;
  /* Part-paid invoices exist, so the header shows what is STILL OWED — the figure
     this row contributes to the running total. The full billed amount is listed
     below it, rather than being the headline, so the two can never be confused. */
  const partPaid = receivable != null && receivable.amount_paid > 0;
  const list = receivables ?? [];
  const currentIdx = receivable ? list.findIndex((r) => r.id === receivable.id) : -1;

  return (
    <DetailPopupShell
      title="Receivable Details"
      open={open}
      onClose={onClose}
      closeTestId="button-close-receivable-popup"
    >
      {receivable ? (
        <>
          <DetailPopupHeader
            /* Same wording the row uses, so opening a row never renames what it
               was pointing at. */
            name={counterpartyName ?? "Unidentified counterparty"}
            /* brain-core's own status, NOT a chip derived from the due date — the
               row that opened this popup shows exactly this, and the two must agree. */
            chip={statusChip(receivable.status)}
            amount={format(receivable.outstanding)}
            currency={receivable.currency}
            nameTestId="text-receivable-counterparty"
            chipTestId="receivable-due-chip"
            amountTestId="text-receivable-amount"
          />

          <DetailPopupBody testId="receivable-detail-popup-content">
            <div className="flex flex-col gap-[16px] items-start w-full">
              <SectionLabel>Details</SectionLabel>
              <DetailTable>
                {/* Omitted rather than emptied when brain-core sent no number. */}
                {receivable.invoice_number && (
                  <Row label="Invoice" value={receivable.invoice_number} />
                )}
                <Row label="Outstanding" value={format(receivable.outstanding)} />
                {/* Billed and Paid appear only when they add a fact. On a wholly
                    unpaid invoice they would just restate Outstanding twice. */}
                {partPaid && <Row label="Billed" value={format(receivable.amount_due)} />}
                {partPaid && <Row label="Paid" value={format(receivable.amount_paid)} />}
                <Row label="Due" value={fmtDue(receivable.due_date)} />
                {/* No Status row: the header chip already carries it. */}
                <Row label="Source" value={receivable.id} />
              </DetailTable>
            </div>

            <div className="flex flex-col gap-[16px] items-start w-full">
              <SectionLabel>What Happens Next</SectionLabel>
              {/* Deliberately flat. Brain has no collections, chasing or reminder
                  capability on this tenant — there is no endpoint behind any of it —
                  so this says what is true (it is tracked and counted) and promises
                  nothing about being chased. */}
              <p
                className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[16px] w-full"
                data-testid="text-receivable-next"
              >
                This is money owed to you. Brain counts it in your receivables total
                and tracks it against its due date.
              </p>
            </div>
          </DetailPopupBody>
          <div className="border-t border-[#1d2132] border-solid flex items-center justify-between p-[16px] w-full">
            <RecordPager
              onPrev={() => currentIdx > 0 && onSelectReceivable?.(list[currentIdx - 1])}
              onNext={() => currentIdx >= 0 && currentIdx < list.length - 1 && onSelectReceivable?.(list[currentIdx + 1])}
              disabledPrev={currentIdx <= 0}
              disabledNext={currentIdx < 0 || currentIdx >= list.length - 1}
              testIdPrefix="receivable"
            />
          </div>
        </>
      ) : null}
    </DetailPopupShell>
  );
}
