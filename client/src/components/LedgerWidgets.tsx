/**
 * Shared Ledger chrome.
 *
 * Extracted from FinancesPage when the six tabs collapsed to four: the Accounts
 * tab and the new Cash Flow tab both need the same card and divider, and a second
 * copy would have drifted the moment one of them was restyled.
 */

export const Divider = (): JSX.Element => (
  <div className="h-px shrink-0 w-full" style={{ background: "#1d2132" }} />
);

export const WidgetHeader = ({ title, count }: { title: string; count?: number }): JSX.Element => (
  <div className="flex items-center gap-[8px] min-h-[16px] w-full">
    <div className="size-[6px] rounded-full shrink-0 bg-[#6c779d]" />
    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#6c779d] text-[12px] uppercase tracking-[0.4px] whitespace-nowrap">{title}</p>
    {typeof count === "number" && (
      <div className="bg-[#6c779d] flex items-center justify-center min-w-[18px] px-[5px] py-[1px] rounded-[4px] shrink-0">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#0a0c10] text-[11px] text-center whitespace-nowrap">{count}</p>
      </div>
    )}
  </div>
);

export const WidgetCard = ({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}): JSX.Element => (
  <div className="flex flex-col gap-[10px] w-full">
    <WidgetHeader title={title} count={count} />
    <div className="bg-[#0a0c10] flex flex-col overflow-hidden relative rounded-[16px] w-full">
      <div className="flex flex-col items-start relative w-full overflow-x-hidden">
        <div className="flex flex-col items-start w-full">{children}</div>
      </div>
    </div>
  </div>
);

/** Row shapes shared by the Ledger's live reads. */
export interface InvoiceLite {
  id: string;
  counterparty_id: string;
  amount_due: string;
  due_date?: string | null;
  status: string;
  metadata?: { scenario?: string; flags?: string[] } | null;
  invoice_number?: string;
}
export interface InvoicesLiteResponse {
  invoices: InvoiceLite[];
}
export interface CounterpartyLite {
  id: string;
  name?: string | null;
}
export interface CounterpartiesLiteResponse {
  counterparties: CounterpartyLite[];
}
