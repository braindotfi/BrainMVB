import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { WidgetCard, Divider } from "@/components/LedgerWidgets";
import { UnavailableDataBox } from "@/components/Callout";
import {
  CASH_EVENT_BASIS,
  formatCashProjectionDate,
  type CashEvent,
  type CashProjectionView,
} from "@/lib/cashProjection";

/**
 * Overview's cash projection.
 *
 * ## Why two tracks and not one line
 *
 * The two feeds behind this chart are not the same kind of fact. A payroll run
 * on the 15th is money that leaves; an invoice due on the 15th is money someone
 * has promised. Averaging them into a single line produces a number that is
 * confidently wrong in the one direction that matters — it says the tenant can
 * cover an obligation on the strength of a payment that has not arrived.
 *
 * So the solid track is "everything lands as expected" and the dashed track is
 * "not one invoice is paid". The gap between them is the uncertainty, drawn
 * rather than described, and the dashed track is the figure that actually
 * decides whether payroll clears.
 *
 * ## Why the basis is stated in words on the card
 *
 * Confirmed/Projected is a classification this product made, not a field
 * brain-core sends. A legend alone would imply brain-core assessed certainty
 * per event. `CASH_EVENT_BASIS` says which source each bucket came from, and it
 * lives next to the logic so the two cannot drift apart.
 */

const LINE_ALL = "rgba(118, 49, 238, 1)"; /* brain-v1purple */
const LINE_CONFIRMED = "rgba(108, 119, 157, 1)"; /* brain-v1baby-blue-60 */
const AXIS_INK = "rgba(65, 73, 101, 1)"; /* brain-v1baby-blue-30 */
const GRID_INK = "rgba(29, 33, 50, 1)"; /* brain-v1stroke-2 */
const DANGER = "rgba(210, 3, 68, 1)"; /* brain-v1pink-red */

/* "Aug 14" — shared by event chips and the chart tooltip. */
const shortDate = formatCashProjectionDate;

const LABEL = "[font-family:'Gilroy',sans-serif] font-semibold text-[12px] uppercase text-brain-v1baby-blue-60";
const BODY = "[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[18px]";
const MONO = "[font-family:'JetBrains_Mono',monospace] font-medium text-[13px]";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <WidgetCard title="Cash projection">
      <div className="flex flex-col gap-[12px] px-[16px] py-[12px] w-full">{children}</div>
    </WidgetCard>
  );
}

/**
 * One scheduled event, as a chip in the strip under the chart.
 *
 * Laid out left-to-right in date order so the strip reads along the same axis
 * as the plot above it: the third chip is the third inflection in the line. A
 * vertical list makes the reader re-derive that mapping every time.
 *
 * Certainty is drawn the way the chart draws it — solid for confirmed, dashed
 * for projected, matching the dashed floor track — but the word is printed too.
 * A border style is not a label, and "is this money actually coming?" is the
 * one thing on this card nobody should have to infer from a stroke pattern.
 */
function EventChip({
  event,
  format,
  onOpen,
}: {
  event: CashEvent;
  format: (n: number) => string;
  /**
   * Opens the record this event stands for. Absent when the record could not be
   * resolved from the loaded feeds — see below for why that is rendered as a
   * plain chip rather than a control that fails on activation.
   */
  onOpen?: () => void;
}) {
  const confirmed = event.certainty === "confirmed";
  const outflow = event.amount < 0;
  const openable = onOpen != null;

  const frame = `flex flex-col gap-[2px] w-[136px] px-[10px] py-[8px] rounded-[8px] border text-left ${
    confirmed
      ? "border-solid border-brain-v1stroke-2 bg-brain-v1baby-blue-5"
      : "border-dashed border-[rgba(255,149,0,0.3)] bg-[rgba(255,149,0,0.08)]"
  }`;

  /* Read out in the order the chip is read: when, how sure, how much, what.
     The visual chip conveys direction with a sign and a colour, neither of
     which survives into a screen reader, so the words carry it instead. */
  const spokenAmount = `${outflow ? "money out" : "money in"} ${format(Math.abs(event.amount))}`;
  const label = `${shortDate(event.date)}, ${confirmed ? "confirmed" : "projected"}, ${spokenAmount}, ${event.label}`;

  const body = (
    <>
      <div className="flex items-center gap-[6px] w-full">
        <span className={`${MONO} text-[12px] text-brain-v1baby-blue-60 shrink-0`}>{shortDate(event.date)}</span>
        <span
          className={`[font-family:'Gilroy',sans-serif] font-semibold text-[10px] leading-[14px] uppercase whitespace-nowrap ${
            confirmed ? "text-brain-v1baby-blue-60" : "text-brain-v1light-orange"
          }`}
          data-testid={`chip-cash-${event.certainty}`}
        >
          {confirmed ? "Confirmed" : "Projected"}
        </span>
      </div>
      <span className={`${MONO} ${outflow ? "text-brain-v1baby-blue-100" : "text-brain-v1green"}`}>
        {outflow ? "-" : "+"}
        {format(Math.abs(event.amount))}
      </span>
      {/* `title` because the label is the one field that genuinely can't fit —
          counterparty names run long and the chip is fixed-width by design. */}
      <span
        className={`${BODY} text-[12px] leading-[16px] text-brain-v1baby-blue-60 w-full truncate capitalize`}
        title={event.label}
      >
        {event.label}
      </span>
    </>
  );

  /* An unresolvable event stays a plain chip.
     The alternative — a button everywhere, which no-ops or opens an empty shell
     when the record is missing — is worse than not offering it: the tenant
     cannot tell "nothing to see" from "this screen is broken", and a keyboard
     user still lands on it. Losing the affordance IS the signal. */
  return (
    <li
      className="shrink-0"
      data-testid={`row-cash-event-${event.id}`}
      data-certainty={event.certainty}
      data-openable={openable ? "true" : "false"}
    >
      {openable ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${label}. Open record`}
          data-testid={`button-cash-event-${event.id}`}
          className={`${frame} cursor-pointer transition-colors hover:border-brain-v1purple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple`}
        >
          {body}
        </button>
      ) : (
        /* Still announced — the event is real information even when its record
           cannot be reached — but not as something that can be activated. */
        <div className={frame} role="group" aria-label={label} title="This record isn't available to open">
          {body}
        </div>
      )}
    </li>
  );
}

export function CashProjectionCard({
  view,
  format,
  horizonDays,
  openableEventIds,
  onOpenEvent,
}: {
  view: CashProjectionView;
  /** Currency formatter from the host page, so this card can't drift from the metrics. */
  format: (n: number) => string;
  horizonDays: number;
  /**
   * Event ids whose underlying record the host page can actually open. The card
   * does not resolve records itself — it holds no feeds — so tappability is
   * decided by the page and passed in. Omitted entirely (the Ledger's own
   * preview, a test) means no chip is a control, which is the safe default.
   */
  openableEventIds?: ReadonlySet<string>;
  onOpenEvent?: (event: CashEvent) => void;
}) {
  /* Axis ticks, abbreviated to fit. The currency symbol is taken from the
     injected `format` rather than hardcoded, so a tenant reading in EUR does
     not get a dollar-signed axis above euro figures. */
  const compactTick = useMemo(() => {
    const symbol = format(0).replace(/[\d.,\s\u00a0-]/g, "");
    return (v: number) => {
      const abs = Math.abs(v);
      const sign = v < 0 ? "-" : "";
      if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`;
      if (abs >= 1_000) return `${sign}${symbol}${Math.round(abs / 1_000)}k`;
      return `${sign}${symbol}${Math.round(abs)}`;
    };
  }, [format]);

  /* The chart needs a point for "today" before any event, or the first segment
     has nothing to leave from and the opening balance is invisible. */
  const points = useMemo(() => {
    if (view.kind !== "rows" || view.startingBalance === null) return [];
    const last = view.events[view.events.length - 1];
    return [
      { date: view.windowStart, all: view.startingBalance, confirmed: view.startingBalance, label: "Today" },
      ...view.events.map((e) => ({
        date: e.date,
        all: e.balanceAfter,
        confirmed: e.confirmedOnlyBalanceAfter,
        label: e.label,
      })),
      /* Close the line at the end of the stated window. Without this the plot
         stops at the last known event, so a header reading "Aug 9 – Aug 30"
         sits above a line that ends on Aug 20 — which looks like the projection
         ran out of data rather than what it is: nothing else is scheduled. The
         balance genuinely is flat across that tail. */
      ...(last && last.date < view.windowEnd
        ? [{
            date: view.windowEnd,
            all: last.balanceAfter,
            confirmed: last.confirmedOnlyBalanceAfter,
            label: "No further scheduled events",
          }]
        : []),
    ];
  }, [view]);

  if (view.kind === "failed") {
    return (
      <Shell>
        <UnavailableDataBox testId="text-cash-projection-failed">
          Couldn't load the cash projection. The ledger didn't respond.
        </UnavailableDataBox>
      </Shell>
    );
  }

  if (view.kind === "loading") {
    return (
      <Shell>
        <p className={`${BODY} text-brain-v1baby-blue-60`} data-testid="text-cash-projection-loading">
          Loading upcoming cash events…
        </p>
      </Shell>
    );
  }

  /* An incomplete cursor walk is NOT an empty window. Drawing a line from a
     partial event list deletes dips rather than shrinking them, so this refuses
     to draw and says why — the one state most likely to be mistaken for good news. */
  if (view.kind === "unreadable") {
    return (
      <Shell>
        <UnavailableDataBox testId="text-cash-projection-unreadable">
          Only part of the ledger could be read, so no projection is shown. A partial list would hide upcoming payments.
        </UnavailableDataBox>
      </Shell>
    );
  }

  if (view.kind === "no_balance") {
    return (
      <Shell>
        <p className={`${BODY} text-brain-v1baby-blue-60`} data-testid="text-cash-projection-no-balance">
          Connect an account to project your balance. There's no starting balance to run forward from.
        </p>
      </Shell>
    );
  }

  if (view.kind === "empty") {
    return (
      <Shell>
        <p className={`${BODY} text-brain-v1baby-blue-60`} data-testid="text-cash-projection-empty">
          Nothing scheduled in the next {horizonDays} days.
        </p>
        <p className={`${BODY} text-brain-v1baby-blue-60`}>{CASH_EVENT_BASIS}</p>
      </Shell>
    );
  }

  const floor = view.lowestConfirmedOnly;
  const negative = floor !== null && floor.amount < 0;

  return (
    <Shell>
      <div className="flex items-baseline justify-between gap-[8px] w-full">
        <p className={LABEL}>Next {horizonDays} days</p>
        <p className={`${MONO} text-brain-v1baby-blue-60`} data-testid="text-cash-projection-window">
          {shortDate(view.windowStart)} – {shortDate(view.windowEnd)}
        </p>
      </div>

      <div className="w-full h-[140px]" data-testid="chart-cash-projection">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="cashProjectionFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={LINE_ALL} stopOpacity={0.28} />
                <stop offset="100%" stopColor={LINE_ALL} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID_INK} strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{ fill: AXIS_INK, fontSize: 11, fontFamily: "Gilroy, sans-serif" }}
              axisLine={{ stroke: GRID_INK }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              tick={{ fill: AXIS_INK, fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
              axisLine={false}
              tickLine={false}
              width={52}
              /* Abbreviated on purpose. A full "$2,700,000.00" tick needs ~70px
                 of the ~420px centre column and clips to a meaningless
                 ",00,000". These are scale markers for reading the SHAPE of the
                 line; every figure the tenant might act on — the floor, each
                 event — is printed exactly below the chart and in the tooltip,
                 so nothing quotable is being rounded here. */
              tickFormatter={compactTick}
            />
            {/* Only drawn when the projection actually crosses zero — a permanent
                zero line on a healthy balance is decoration that cries wolf. */}
            {negative && <ReferenceLine y={0} stroke={DANGER} strokeDasharray="3 3" />}
            <Tooltip
              contentStyle={{
                background: "rgba(10, 12, 16, 1)",
                border: `1px solid ${GRID_INK}`,
                borderRadius: 8,
                fontFamily: "Gilroy, sans-serif",
                fontSize: 12,
              }}
              labelFormatter={(v) => shortDate(v)}
              labelStyle={{
                color: "rgba(108, 119, 157, 1)",
                fontFamily: "Gilroy, sans-serif",
                fontWeight: 500,
              }}
              formatter={(value: number, name) => [
                format(value),
                name === "all" ? "If invoices are paid" : "Confirmed only",
              ]}
            />
            <Area
              type="monotone"
              dataKey="all"
              stroke={LINE_ALL}
              strokeWidth={2}
              fill="url(#cashProjectionFill)"
              dot={false}
              isAnimationActive={false}
            />
            {/* The floor. Dashed, unfilled, and drawn on top so it is never hidden
                by the optimistic track's fill. */}
            {view.hasProjectedInflow && (
              <Area
                type="monotone"
                dataKey="confirmed"
                stroke={LINE_CONFIRMED}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                fill="none"
                dot={false}
                isAnimationActive={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {floor && (
        <div
          className={`flex flex-col gap-[2px] px-[12px] py-[10px] mb-[12px] rounded-[8px] border border-solid ${
            negative
              ? "bg-brain-v1dark-pink-red border-[rgba(210,3,68,0.2)]"
              : "bg-brain-v1baby-blue-5 border-brain-v1stroke-2"
          }`}
          data-testid="callout-cash-projection-floor"
        >
          <p className={`${BODY} ${negative ? "text-brain-v1pink-red" : "text-brain-v1baby-blue-100"}`}>
            Lowest point: <span className="[font-family:'JetBrains_Mono',monospace]">{format(floor.amount)}</span> on{" "}
            {shortDate(floor.date)}
          </p>
          <p className={`${BODY} text-brain-v1baby-blue-60`}>
            {view.hasProjectedInflow
              ? "If no outstanding invoices are paid in this window."
              : "Based on scheduled obligations only."}
          </p>
        </div>
      )}

      <Divider />

      {/* The event strip: chart order, left to right, one chip per event.
          Scrolls horizontally rather than wrapping — wrapping would break the
          date sequence across rows and cost the alignment with the plot, which
          is the only reason this is a strip and not a list. The next chip is
          left partly visible at this column width, which is the scroll cue. */}
       <p className={`${LABEL} w-full`}>
        {view.events.length === 1 ? "1 scheduled event" : `${view.events.length} scheduled events`}
      </p>
      <ul
        className="flex gap-[8px] w-full overflow-x-auto pb-[4px]"
        data-testid="list-cash-projection-events"
        aria-label="Scheduled cash events, in date order"
      >
        {view.events.map((e) => (
          <EventChip
            key={e.id}
            event={e}
            format={format}
            onOpen={onOpenEvent && openableEventIds?.has(e.id) ? () => onOpenEvent(e) : undefined}
          />
        ))}
      </ul>

      <p className={`${BODY} text-brain-v1baby-blue-60`} data-testid="text-cash-projection-basis">
        {CASH_EVENT_BASIS}
      </p>
    </Shell>
  );
}
