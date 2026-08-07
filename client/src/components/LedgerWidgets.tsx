/**
 * Shared Ledger chrome.
 *
 * Extracted from FinancesPage when the six tabs collapsed to four: the Accounts
 * tab and the new Cash Flow tab both need the same card and divider, and a second
 * copy would have drifted the moment one of them was restyled.
 */

import { CountPill } from "@/components/CountPill";

export const Divider = (): JSX.Element => (
  <div className="h-px shrink-0 w-full" style={{ background: "#1d2132" }} />
);

export const WidgetHeader = ({ title, count }: { title: string; count?: number }): JSX.Element => (
  <div className="flex items-center gap-[8px] min-h-[16px] w-full">
    <div className="size-[6px] rounded-full shrink-0 bg-brain-v1baby-blue-60" />
    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-brain-v1baby-blue-60 text-[12px] uppercase tracking-[0.4px] whitespace-nowrap">{title}</p>
    {typeof count === "number" && <CountPill>{count}</CountPill>}
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
    <div className="bg-brain-v1highlight-dropdown-bg border border-solid border-brain-v1stroke-2 flex flex-col overflow-hidden relative rounded-panel w-full">
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
