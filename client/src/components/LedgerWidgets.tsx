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
  <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative sticky top-0 z-10 w-full">
    <div className="flex flex-1 gap-[8px] items-center min-w-px relative">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px] whitespace-nowrap">{title}</p>
      {typeof count === "number" && (
        <div className="bg-[#414965] flex flex-col items-center justify-center min-w-[16px] p-[2px] relative rounded-[4px] shrink-0">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[12px] text-[#a8b9f4] text-[12px] text-center whitespace-nowrap">{count}</p>
        </div>
      )}
    </div>
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
  <div className="bg-[#0a0c10] flex flex-col overflow-hidden relative rounded-[16px] w-full">
    <WidgetHeader title={title} count={count} />
    <div className="flex flex-col items-start relative w-full overflow-x-hidden">
      <div className="flex flex-col items-start w-full">{children}</div>
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
