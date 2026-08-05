/**
 * Obligations — the itemized "what we owe", one row per outstanding obligation.
 *
 * The totals were already on two surfaces (the Overview metric card and the Cash Flow
 * metric) but the list behind them was reachable only through the API, so nobody using
 * the product could see WHO they owed or WHEN it was due. This is that list.
 *
 * The running total comes from `lib/liabilities.ts`, the same module the two metric
 * cards read, so the figure at the bottom of this list is by construction the figure
 * on the cards that link here.
 */

import { useQuery } from "@tanstack/react-query";
import { WidgetCard, type CounterpartiesLiteResponse } from "@/components/LedgerWidgets";
import { UnavailableDataBox } from "@/components/Callout";
import { payableObligations, liabilitiesTotal } from "@/lib/liabilities";
import type { RawObligation } from "@/lib/brainObligations";
import { capitalCase } from "@/lib/displayLabels";
import { dueLabel, amountLabel, subLabel } from "@/lib/obligationRows";
import { ICONS } from "@/assets/figma-icons";

const IMG_DOT = ICONS.activity_dot;

type Format = (a: string | number) => string;

interface ObligationsResponse {
  obligations?: RawObligation[];
}

/* ── status badge ─────────────────────────────────────────────────────────────
   Same three surfaces the rest of the Ledger already uses for these meanings
   (#350011 red, #4a2300 amber, #222737 neutral), so "overdue" reads the same here
   as it does on Cash Flow. Borders need an explicit `border border-solid`; a colour
   alone renders no stroke at all. */
const STATUS_BADGE: Record<string, { bg: string; border: string; fg: string }> = {
  overdue: { bg: "#350011", border: "rgba(210,3,68,0.25)", fg: "#d20344" },
  due: { bg: "#4a2300", border: "rgba(255,148,0,0.25)", fg: "#ff9400" },
  upcoming: { bg: "#222737", border: "#2c3247", fg: "#6c779d" },
};
const NEUTRAL_BADGE = { bg: "#222737", border: "#2c3247", fg: "#6c779d" };

const StatusBadge = ({ status }: { status: string }) => {
  // An unrecognised status still renders — neutral and verbatim. Dropping it would
  // hide a state brain-core thinks is worth reporting.
  const c = STATUS_BADGE[status.trim().toLowerCase()] ?? NEUTRAL_BADGE;
  return (
    <span
      className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] px-[10px] py-[4px] rounded-[22px] border border-solid shrink-0"
      style={{ background: c.bg, borderColor: c.border, color: c.fg }}
      data-testid={`badge-obligation-status-${status.trim().toLowerCase()}`}
    >
      {capitalCase(status)}
    </span>
  );
};

/* ── the tab ──────────────────────────────────────────────────────────────── */

export function ObligationsTab({ format }: { format: Format }): JSX.Element {
  const obQ = useQuery<ObligationsResponse>({
    queryKey: ["/api/brain/ledger/obligations"],
    retry: false,
  });
  const cpQ = useQuery<CounterpartiesLiteResponse>({
    queryKey: ["/api/brain/ledger/counterparties"],
    retry: false,
  });

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

  return (
    <WidgetCard title="Obligations" count={loading ? undefined : rows.length}>
      {failed ? (
        <UnavailableDataBox testId="text-obligations-unavailable">
          Your obligations couldn't be loaded just now, so this list is empty for the wrong reason.
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
            return (
              <div
                key={o.id}
                data-testid={`row-obligation-${idx}`}
                className="flex gap-[12px] items-center px-[16px] py-[12px] relative shrink-0 w-full bg-[#0a0c10] border-b border-solid border-[#1d2132] last:border-b-0"
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
                Obligation Totals
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
  );
}
