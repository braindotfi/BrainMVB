/**
 * Receivables — the itemized "what we are owed", one row per outstanding AR invoice.
 *
 * The mirror of Payables, and deliberately the same list: counterparty, status,
 * due date, amount, a running total, and rows that open a detail popup.
 *
 * Where it differs from Payables is the SOURCE, and that difference is load-bearing
 * — `lib/receivables.ts` explains why this reads the invoice feed while Payables
 * reads obligations, and why summing both would double-count. The short version:
 * the receivable obligations feed carries only a subset of the tenant's AR.
 *
 * Both reads walk brain-core's cursor to the end (`fetchAllPages`). A list endpoint
 * caps its page silently, so an unpaged read would show a short list and a total
 * that looked authoritative and was simply wrong.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WidgetCard } from "@/components/LedgerWidgets";
import type { CounterpartyLite } from "@/components/LedgerWidgets";
import { UnavailableDataBox } from "@/components/Callout";
import { ReceivableDetailPopup } from "@/components/ReceivableDetailPopup";
import { LedgerRecordRow } from "@/components/LedgerRecordRow";
import { fetchAllPages } from "@/lib/brainPagination";
import { usePagedLedgerRead, ledgerFigureCaption } from "@/lib/ledgerRead";
import { receivablesView, type RawInvoice, type Receivable } from "@/lib/receivables";
import { dueLabel, statusColors } from "@/lib/obligationRows";
import { capitalCase } from "@/lib/displayLabels";
import { ICONS } from "@/assets/figma-icons";

const IMG_DOT = ICONS.activity_dot;

type Format = (a: string | number) => string;

/* ── the tab ──────────────────────────────────────────────────────────────── */

export function ReceivablesTab({ format }: { format: Format }): JSX.Element {
  /* Keyed under the plain endpoint path so the existing invalidations after an
     upload/ingest (which invalidate that prefix) refresh this too, and polled, because
     brain-core lands invoices in waves — see lib/ledgerRead.ts. */
  const arQ = usePagedLedgerRead<RawInvoice>("/api/brain/ledger/invoices", "invoices");
  const cpQ = useQuery({
    queryKey: ["/api/brain/ledger/counterparties", "all-pages"],
    queryFn: ({ signal }) =>
      fetchAllPages<CounterpartyLite>("/api/brain/ledger/counterparties", "counterparties", { signal }),
    retry: false,
  });

  const [openReceivable, setOpenReceivable] = useState<Receivable | null>(null);

  /* Five states, not two. Every collapse here has the same failure mode: a read that
     did not happen renders as the confident, calm claim that nobody owes the tenant
     anything. `receivablesView` owns the branch order (lib/receivables.ts) so the
     awkward case — zero rows because the read was cut short — is decided by tested
     code rather than by the order of ternaries in this file. */
  const { kind, rows, total, truncated, mayGrow } = receivablesView({
    failed: arQ.failed,
    read: arQ.read,
    ingesting: arQ.ingesting,
  });

  /* Counterparty names live on a different endpoint; invoices carry only the id. An
     unresolved id is shown as such rather than replaced with a plausible name. */
  const nameOf = (id: string | null): string | null =>
    (id && cpQ.data?.rows.find((c) => c.id === id)?.name) || null;

  /* One wording for "this figure is not final", shared with Payables and the two
     metric cards, so the same caveat never reads two different ways. */
  const totalCaption = ledgerFigureCaption({ truncated, mayGrow }, "Across everything you're still owed");

  return (
    <>
      <WidgetCard title="Receivables" count={kind === "loading" ? undefined : rows.length}>
        {kind === "failed" ? (
          <UnavailableDataBox testId="text-receivables-unavailable">
            Your receivables couldn't be loaded just now, so this list is empty for the wrong
            reason. It isn't a sign that nobody owes you anything.
          </UnavailableDataBox>
        ) : kind === "loading" ? (
          <div className="flex gap-[12px] items-center px-[16px] py-[12px] relative shrink-0 w-full bg-[#0a0c10]">
            <p
              className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[16px] text-[#6c779d]"
              data-testid="text-receivables-loading"
            >
              Loading what you're owed from the ledger…
            </p>
          </div>
        ) : kind === "unreadable" ? (
          /* Zero rows AND an unfinished read. Deliberately NOT the empty copy below:
             the tab did not see the whole invoice history, so it cannot say there is
             nothing outstanding — it can only say it does not know. */
          <UnavailableDataBox testId="text-receivables-partial">
            Only part of your invoice history could be read, so nothing can be shown here yet.
            It isn't a sign that nobody owes you anything.
          </UnavailableDataBox>
        ) : kind === "arriving" ? (
          /* Zero rows, read fine — but documents are still being turned into ledger
             records, and those records arrive in waves. "Nobody owes you anything"
             would be a conclusion drawn from an import that has not finished. */
          <div className="flex gap-[12px] items-center px-[16px] py-[12px] relative shrink-0 w-full bg-[#0a0c10]">
            <p
              className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[16px] text-[#6c779d]"
              data-testid="text-receivables-arriving"
            >
              Still reading your documents. Anything you're owed will appear here as it lands.
            </p>
          </div>
        ) : kind === "empty" ? (
          <div className="flex gap-[12px] items-center px-[16px] py-[12px] relative shrink-0 w-full bg-[#0a0c10]">
            <p
              className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[16px] text-[#6c779d]"
              data-testid="text-receivables-empty"
            >
              Nothing outstanding. No unpaid customer invoices on record.
            </p>
          </div>
        ) : (
          <>
            {rows.map((r, idx) => {
              const name = nameOf(r.counterparty_id);
              const open = () => setOpenReceivable(r);
              return (
                <LedgerRecordRow
                  key={r.id}
                  name={name ?? "Unidentified counterparty"}
                  pill={{ label: capitalCase(r.status), ...statusColors(r.status), testId: `badge-receivable-status-${r.status.trim().toLowerCase()}` }}
                  secondary={
                    <>
                      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[14px] whitespace-nowrap">
                        {dueLabel(r.due_date)}
                      </p>
                      {r.invoice_number && (
                        <>
                          <div className="relative shrink-0 size-[4px]">
                            <img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_DOT} />
                          </div>
                          <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[14px] truncate">
                            {r.invoice_number}
                          </p>
                        </>
                      )}
                    </>
                  }
                  amount={format(r.outstanding)}
                  sign="+"
                  amountColor="#42bf23"
                  rowTestId={`row-receivable-${idx}`}
                  nameTestId={`text-receivable-name-${idx}`}
                  amountTestId={`text-receivable-amount-${idx}`}
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

            {/* Running total — same row shape as the Payables and Accounts tabs. */}
            <div
              className="flex gap-[12px] items-center px-[16px] py-[12px] relative shrink-0 w-full bg-[#0a0c10] border-b border-solid border-[#1d2132] last:border-b-0"
              data-testid="row-receivable-totals"
            >
              <div className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px]">
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  Receivable Totals
                </p>
                <p
                  className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[14px]"
                  data-testid="text-receivable-total-caption"
                >
                  {/* Names what the figure is, or why it isn't final. A dash with no
                      explanation would read as "zero" on a list that plainly has rows,
                      and a figure that is still growing looks just like a settled one. */}
                  {totalCaption}
                </p>
              </div>
              <div className="flex flex-col items-end justify-center relative shrink-0">
                <p
                  className="[font-family:'JetBrains_Mono',monospace] font-bold leading-[20px] text-[18px] text-right whitespace-nowrap"
                  style={{ color: total === null ? "#414965" : "#d20344" }}
                  data-testid="text-receivable-total"
                >
                  {total === null ? "-" : format(total)}
                </p>
              </div>
            </div>
          </>
        )}
      </WidgetCard>

      <ReceivableDetailPopup
        receivable={openReceivable}
        counterpartyName={openReceivable ? nameOf(openReceivable.counterparty_id) : null}
        receivables={rows}
        onSelectReceivable={setOpenReceivable}
        onClose={() => setOpenReceivable(null)}
      />
    </>
  );
}
