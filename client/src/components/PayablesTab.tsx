/**
 * Payables — the itemized "what we owe", one row per outstanding payable.
 *
 * Named to pair with Receivables. The underlying feed is still `/ledger/obligations`,
 * so the data-layer names below (RawObligation, payableObligations, the `obligations`
 * response field) deliberately keep brain-core's vocabulary: renaming those would only
 * hide which endpoint this reads.
 *
 * The totals were already on two surfaces (the Overview metric card and the Cash Flow
 * metric) but the list behind them was reachable only through the API, so nobody using
 * the product could see WHO they owed or WHEN it was due. This is that list.
 *
 * The running total comes from `lib/liabilities.ts`, the same module the two metric
 * cards read, so the figure at the bottom of this list is by construction the figure
 * on the cards that link here.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WidgetCard, type CounterpartiesLiteResponse } from "@/components/LedgerWidgets";
import { UnavailableDataBox } from "@/components/Callout";
import { BillDetailPopup, type BrainInvoiceDTO as BillDTO } from "@/components/BillDetailPopup";
import { PayableDetailPopup } from "@/components/PayableDetailPopup";
import { payableObligations, liabilitiesTotal } from "@/lib/liabilities";
import { matchObligationsToInvoices } from "@/lib/debtIdentity";
import type { RawObligation, Obligation } from "@/lib/brainObligations";
import { capitalCase } from "@/lib/displayLabels";
import { dueLabel, amountLabel, subLabel, statusColors } from "@/lib/obligationRows";
import { ICONS } from "@/assets/figma-icons";
import { RecordPill } from "@/components/RecordPill";

const IMG_DOT = ICONS.activity_dot;

type Format = (a: string | number) => string;

interface ObligationsResponse {
  obligations?: RawObligation[];
}

interface InvoicesResponse {
  invoices?: BillDTO[];
}

/* ── status badge ─────────────────────────────────────────────────────────────
   Colours come from lib/obligationRows so this badge and the detail popup's header
   chip cannot drift apart — see the note there. */
const StatusBadge = ({ status }: { status: string }) => {
  // An unrecognised status still renders — neutral and verbatim. Dropping it would
  // hide a state brain-core thinks is worth reporting.
  const c = statusColors(status);
  return (
    <RecordPill
      className=""
      style={{ background: c.bg, borderColor: c.border, color: c.fg }}
      testId={`badge-obligation-status-${status.trim().toLowerCase()}`}
    >
      {capitalCase(status)}
    </RecordPill>
  );
};

/* ── the tab ──────────────────────────────────────────────────────────────── */

export function PayablesTab({ format }: { format: Format }): JSX.Element {
  const obQ = useQuery<ObligationsResponse>({
    queryKey: ["/api/brain/ledger/obligations"],
    retry: false,
  });
  const cpQ = useQuery<CounterpartiesLiteResponse>({
    queryKey: ["/api/brain/ledger/counterparties"],
    retry: false,
  });
  /* Invoices are read only to find the bill behind a payable, never to build the
     list or the total — those come from obligations alone, which is what keeps this
     tab agreeing with the two metric cards. */
  const invQ = useQuery<InvoicesResponse>({
    queryKey: ["/api/brain/ledger/invoices"],
    retry: false,
  });

  const [openBill, setOpenBill] = useState<BillDTO | null>(null);
  const [openPayable, setOpenPayable] = useState<Obligation | null>(null);

  /* Three states, not two. `data === undefined` covers both "still loading" and
     "the request failed", and collapsing them is exactly how a failed read ends up
     rendering as a confident empty list — here, as "you owe nothing". */
  const raw = obQ.data?.obligations ?? null;
  const failed = obQ.isError || (obQ.data != null && obQ.data.obligations == null);
  const loading = raw == null && !failed;

  const rows = payableObligations(raw);
  const total = liabilitiesTotal(raw);

  /* Counterparty names live on a different endpoint; obligations carry only the id.
     An unresolved id is shown as such rather than replaced with a plausible name —
     the bulk counterparty read is capped upstream, so on a large tenant some ids
     genuinely will not resolve, and inventing a vendor name there would be worse
     than admitting it. */
  const nameOf = (id: string | null): string | null =>
    (id && cpQ.data?.counterparties.find((c) => c.id === id)?.name) || null;

  /* `null` means the invoice feed could not be read yet — loading or failed. That is
     NOT the same as "this payable has no invoice", and the two must not render alike:
     with the feed down every row would look uninvoiced, and the popup would tell the
     user a bill has no invoice on file when it simply could not look. */
  const invoices = invQ.data?.invoices ?? null;
  const invoicesUnknown = invoices == null;
  const invoiceOf = matchObligationsToInvoices(rows, invoices);

  return (
    <>

    <WidgetCard title="Payables" count={loading ? undefined : rows.length}>
      {failed ? (
        <UnavailableDataBox testId="text-obligations-unavailable">
          Your payables couldn't be loaded just now, so this list is empty for the wrong reason.
          It isn't a sign that you owe nothing.
        </UnavailableDataBox>
      ) : loading ? (
        <div className="flex gap-[12px] items-center px-[16px] py-[12px] relative shrink-0 w-full bg-[#0a0c10]">
          <p
            className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[16px] text-[#6c779d]"
            data-testid="text-obligations-loading"
          >
            Loading what you owe from the ledger…
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex gap-[12px] items-center px-[16px] py-[12px] relative shrink-0 w-full bg-[#0a0c10]">
          <p
            className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[16px] text-[#6c779d]"
            data-testid="text-obligations-empty"
          >
            Nothing outstanding. You have no unpaid bills or payroll on record.
          </p>
        </div>
      ) : (
        <>
          {rows.map((o, idx) => {
            const name = nameOf(o.counterparty_id);
            // `kind`, not `direction`: direction folds `type` in as a payable/receivable
            // fallback, so it would read "Payable" the day brain-core starts sending one.
            const sub = subLabel(o.kind, name, o.counterparty_id);
            /* Every row opens something. A payable backed by an invoice opens the
               same Bill Details popup the rest of the app uses for that invoice;
               one with no invoice behind it opens the same shell with only the
               fields it actually has. Nothing is left inert. */
            const bill = invoiceOf.get(o.id);
            const open = () => (bill ? setOpenBill(bill) : setOpenPayable(o));
            return (
              <div
                key={o.id}
                role="button"
                tabIndex={0}
                data-testid={`row-obligation-${idx}`}
                onClick={open}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    open();
                  }
                }}
                className="flex gap-[12px] items-center px-[16px] py-[12px] relative shrink-0 w-full bg-[#0a0c10] border-b border-solid border-[#1d2132] last:border-b-0 cursor-pointer transition-colors hover:bg-[#11141b] outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
              >
                <div className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px]">
                  <div className="flex gap-[8px] items-center relative shrink-0 max-w-full">
                    <p
                      className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[16px] truncate"
                      data-testid={`text-obligation-name-${idx}`}
                    >
                      {name ?? "Unidentified counterparty"}
                    </p>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="flex gap-[4px] items-center relative shrink-0 max-w-full">
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[14px] whitespace-nowrap">
                      {dueLabel(o.due_date)}
                    </p>
                    {/* Dot only when there is a second fact to separate — subLabel
                        returns "" when the kind would merely restate the name. */}
                    {sub && (
                      <>
                        <div className="relative shrink-0 size-[4px]">
                          <img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_DOT} />
                        </div>
                        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[14px] truncate">
                          {sub}
                        </p>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end justify-center relative shrink-0">
                  <p
                    className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#a8b9f4] text-[18px] text-right whitespace-nowrap"
                    data-testid={`text-obligation-amount-${idx}`}
                  >
                    {amountLabel(o.amount_due, format)}
                  </p>
                </div>
              </div>
            );
          })}

          {/* Running total — same row shape as the Accounts tab's "Account Totals". */}
          <div
            className="flex gap-[12px] items-center px-[16px] py-[12px] relative shrink-0 w-full bg-[#0a0c10] border-b border-solid border-[#1d2132] last:border-b-0"
            data-testid="row-obligation-totals"
          >
            <div className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px]">
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">
                Payable Totals
              </p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[14px] whitespace-nowrap">
                Across everything you still owe
              </p>
            </div>
            <div className="flex flex-col items-end justify-center relative shrink-0">
              <p
                className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#a8b9f4] text-[18px] text-right whitespace-nowrap"
                data-testid="text-obligation-total"
              >
                {total === null ? "-" : format(total)}
              </p>
            </div>
          </div>
        </>
      )}
      </WidgetCard>

      {/* No pager on either popup. The bill popup's Previous/Next walks a list of
          invoices, which is only ever a SUBSET of this tab — paging from it would
          silently skip every payroll and tax row, on the one screen whose whole
          purpose is that nothing owed is missing. */}
      <BillDetailPopup
        bill={openBill}
        vendorName={openBill ? (nameOf(openBill.counterparty_id) ?? "Unknown vendor") : ""}
        onClose={() => setOpenBill(null)}
        hidePager
      />
      <PayableDetailPopup
        payable={openPayable}
        counterpartyName={openPayable ? nameOf(openPayable.counterparty_id) : null}
        invoicesUnknown={invoicesUnknown}
        onClose={() => setOpenPayable(null)}
      />
    </>
  );
}
