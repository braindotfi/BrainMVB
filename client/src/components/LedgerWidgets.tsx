/**
 * Shared Ledger chrome.
 *
 * Extracted from FinancesPage when the six tabs collapsed to four: the Accounts
 * tab and the new Cash Flow tab both need the same card and divider, and a second
 * copy would have drifted the moment one of them was restyled.
 *
 * WidgetPanel  — the canonical bordered panel shell (bg #0a0c10, border #1d2132,
 *               radius 16). Use this wherever a panel is needed without a header.
 *               Pass noBorder for Figma-intentional borderless variants.
 * WidgetHeader — the dot + uppercase title + optional count row. Accepts children
 *               for extra metadata (e.g. version/quorum text) after the count.
 * WidgetCard   — WidgetHeader + WidgetPanel composed together; used by Ledger tabs.
 * Divider      — full-width 1px separator at #1d2132.
 */

import { CountPill } from "@/components/CountPill";

export const Divider = (): JSX.Element => (
  <div className="h-px shrink-0 w-full" style={{ background: "#1d2132" }} />
);

export const WidgetHeader = ({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children?: React.ReactNode;
}): JSX.Element => (
  <div className="flex items-center gap-[8px] min-h-[16px] w-full">
    <div className="size-[6px] rounded-full shrink-0 bg-brain-v1baby-blue-60" />
    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-brain-v1baby-blue-60 text-[12px] uppercase tracking-[0.4px] whitespace-nowrap">{title}</p>
    {typeof count === "number" && <CountPill>{count}</CountPill>}
    {children}
  </div>
);

/** Canonical bordered panel shell. Use WidgetCard when a dot+title header is
 *  also needed; use WidgetPanel directly for panels with their own internal
 *  header, or for Settings surfaces where the header lives outside the panel. */
export const WidgetPanel = ({
  children,
  testId,
  noBorder,
}: {
  children: React.ReactNode;
  testId?: string;
  noBorder?: boolean;
}): JSX.Element => (
  <div
    data-testid={testId}
    className={`bg-brain-v1highlight-dropdown-bg flex flex-col overflow-hidden relative rounded-panel w-full${noBorder ? "" : " border border-solid border-brain-v1stroke-2"}`}
  >
    {children}
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
    <WidgetPanel>
      <div className="flex flex-col items-start relative w-full overflow-x-hidden">
        <div className="flex flex-col items-start w-full">{children}</div>
      </div>
    </WidgetPanel>
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
