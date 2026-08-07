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
 *
 * The read walks brain-core's cursor to the end and refreshes itself (see
 * `lib/ledgerRead.ts`). Both matter to what is printed at the bottom: a list endpoint
 * pages silently, and the rows behind an ingested document land in waves, so this tab
 * once showed a settled-looking $211,200.00 on a tenant that owed $287,223.39 — and
 * kept showing it until the page was reloaded by hand.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WidgetCard, type CounterpartiesLiteResponse } from "@/components/LedgerWidgets";
import { UnavailableDataBox } from "@/components/Callout";
import { BillDetailPopup, type BrainInvoiceDTO as BillDTO } from "@/components/BillDetailPopup";
import { PayableDetailPopup } from "@/components/PayableDetailPopup";
import { payablesView, unpaidApInvoices } from "@/lib/liabilities";
import { usePagedLedgerRead, ledgerFigureCaption } from "@/lib/ledgerRead";
import { matchObligationsToInvoices } from "@/lib/debtIdentity";
import type { RawObligation, Obligation } from "@/lib/brainObligations";
import { capitalCase } from "@/lib/displayLabels";
import { dueLabel, amountLabel, subLabel, statusColors } from "@/lib/obligationRows";
import { ICONS } from "@/assets/figma-icons";
import { RecordPill } from "@/components/RecordPill";
import { LedgerRecordRow } from "@/components/LedgerRecordRow";
import alertIcon from "@assets/Icons_1783274957589.png";

const IMG_DOT = ICONS.activity_dot;

type Format = (a: string | number) => string;

interface InvoicesResponse {
  invoices?: BillDTO[];
}

/* ── the tab ──────────────────────────────────────────────────────────────── */

export function PayablesTab({ format }: { format: Format }): JSX.Element {
  const obQ = usePagedLedgerRead<RawObligation>("/api/brain/ledger/obligations", "obligations");
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

  /* Six states, not two. Every collapse here has the same failure mode: a read that
     did not happen, or did not finish, renders as the confident, calm claim that the
     tenant owes nothing. `payablesView` owns the branch order (lib/liabilities.ts) so
     the awkward cases — zero rows on a cut-short read, zero rows while documents are
     still being projected — are decided by tested code rather than by the order of
     ternaries in this file. */
  const { kind, rows, total, truncated, mayGrow } = payablesView({
    failed: obQ.failed,
    read: obQ.read,
    ingesting: obQ.ingesting,
  });

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

    <WidgetCard title="Payables" count={kind === "loading" ? undefined : rows.length}>
      {kind === "failed" ? (
        <UnavailableDataBox testId="text-obligations-unavailable">
          Your payables couldn't be loaded just now, so this list is empty for the wrong reason.
          It isn't a sign that you owe nothing.
        </UnavailableDataBox>
      ) : kind === "loading" ? (
        <div className="flex gap-[12px] items-center px-[16px] py-[12px] relative shrink-0 w-full bg-[#0a0c10]">
          <p
            className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[16px] text-[#6c779d]"
            data-testid="text-obligations-loading"
          >
            Loading what you owe from the ledger…
          </p>
        </div>
      ) : kind === "unreadable" ? (
        /* Zero rows AND an unfinished read. Deliberately NOT the empty copy below:
           the tab did not see the whole ledger, so it cannot say nothing is
           outstanding — only that it does not know. */
        <UnavailableDataBox testId="text-obligations-partial">
          Only part of your ledger could be read, so nothing can be shown here yet. It isn't
          a sign that you owe nothing.
        </UnavailableDataBox>
      ) : kind === "arriving" ? (
        /* Zero rows, read fine — but documents are still being turned into ledger
           records, and those records arrive in waves. "You owe nothing" would be a
           conclusion drawn from an import that has not finished. */
        <div className="flex gap-[12px] items-center px-[16px] py-[12px] relative shrink-0 w-full bg-[#0a0c10]">
          <p
            className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[16px] text-[#6c779d]"
            data-testid="text-obligations-arriving"
          >
            Still reading your documents. Anything you owe will appear here as it lands.
          </p>
        </div>
      ) : kind === "empty" ? (
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
            /* Anomaly flags live on the invoice record, not the obligation. The
               Payables row renders the obligation, so without this lookup the flag
               is silently invisible here even though Cash Flow shows it on the same
               debt's invoice projection. Carrying it through the match keeps the
               signal consistent: a user who only checks Payables still sees it. */
            const flagged = (bill?.metadata?.flags?.length ?? 0) > 0;
            return (
              <LedgerRecordRow
                key={o.id}
                name={name ?? "Unidentified counterparty"}
                pill={{ label: capitalCase(o.status), ...statusColors(o.status), testId: `badge-obligation-status-${o.status.trim().toLowerCase()}` }}
                additionalPill={flagged ? (
                  <RecordPill
                    className="bg-[#350011] text-[#d20344] border-[rgba(210,3,68,0.2)]"
                    testId={`badge-obligation-anomaly-${idx}`}
                  >
                    <img src={alertIcon} alt="" className="size-[12px]" />
                    Anomaly
                  </RecordPill>
                ) : undefined}
                secondary={
                  <>
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[14px] whitespace-nowrap">
                      {dueLabel(o.due_date)}
                    </p>
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
                  </>
                }
                amount={amountLabel(o.amount_due, format)}
                sign="-"
                amountColor="#d20344"
                rowTestId={`row-obligation-${idx}`}
                nameTestId={`text-obligation-name-${idx}`}
                amountTestId={`text-obligation-amount-${idx}`}
                onClick={open}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    open();
                  }
                }}
              />
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
              <p
                className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[14px]"
                data-testid="text-obligation-total-caption"
              >
                {/* Names what the figure is, or why it isn't final. A total that is
                    still growing looks exactly like a settled one, so the caption is
                    the only thing standing between the two. */}
                {ledgerFigureCaption({ truncated, mayGrow }, "Across everything you still owe")}
              </p>
            </div>
            <div className="flex flex-col items-end justify-center relative shrink-0">
              <p
                className="[font-family:'JetBrains_Mono',monospace] font-bold leading-[20px] text-[18px] text-right whitespace-nowrap"
                style={{ color: total === null ? "#414965" : "#d20344" }}
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
        bills={unpaidApInvoices(invoices ?? []) as BillDTO[]}
        onSelectBill={setOpenBill}
        onClose={() => setOpenBill(null)}
      />
      <PayableDetailPopup
        payable={openPayable}
        counterpartyName={openPayable ? nameOf(openPayable.counterparty_id) : null}
        payables={rows}
        onSelectPayable={setOpenPayable}
        invoicesUnknown={invoicesUnknown}
        onClose={() => setOpenPayable(null)}
      />
    </>
  );
}
