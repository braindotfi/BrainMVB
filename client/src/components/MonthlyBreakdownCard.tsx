/**
 * Monthly Breakdown — grouped bar chart for the Cash Flow tab.
 *
 * Shows income vs expense per calendar month for a user-selected period
 * ("Last 6 months", "Last 12 months", or "Year to date" when in season).
 * Clicking a bar pair selects that month; a detail panel below lists that
 * month's totals and top expense counterparties.
 *
 * Period windows are CONTIGUOUS CALENDAR MONTHS ending today, not the N most
 * recent months that happen to contain transactions. Months with no activity
 * appear as zero-height bars so gaps are visible rather than silently hidden.
 *
 * Data source: the raw transactions array already fetched by CashFlowTab.
 * No new network request is needed — the grouping is pure client-side
 * arithmetic on the same feed via buildMonthlyWindow() in cashFlow.ts.
 *
 * Note on parity with the Brain Assistant: differences between this chart and
 * an Assistant answer for the same month can be material, not just rounding,
 * for three distinct reasons established by code analysis:
 *
 * 1. Page cap. CashFlowTab fetches `GET /ledger/transactions` as a single
 *    un-paginated call with no cursor walk. The response declares `next_cursor`
 *    (see ListTransactionsResponse in server/brain/client.ts), but CashFlowTab
 *    never follows it. When brain-core returns a partial page, the monthly
 *    figures here are a floor, not the real totals. The `truncated` prop is set
 *    to true in that case and a notice is shown below. Whether the Assistant's
 *    answer covers a larger set of transactions depends on brain-core's internal
 *    aggregation — that has not been confirmed by direct observation.
 *
 * 2. Categorisation. The chart classifies transactions by the raw `direction`
 *    field (inflow → income, outflow → expense). Brain-core's intelligence
 *    layer may reclassify some entries — for example reclassifying an outflow
 *    between the tenant's own accounts as a transfer. The extent of any such
 *    reclassification has not been measured against a live tenant.
 *
 * 3. Currency mixing. `absAmount()` adds all amounts regardless of currency.
 *    A tenant transacting in multiple currencies will see totals that mix units.
 *    The Assistant may report per-currency breakdowns or refuse to aggregate
 *    across currencies. Single-currency tenants are unaffected.
 *
 * The chart's arithmetic is verified to be correct for the transactions it
 * receives (see the parity tests in cashFlow.test.ts). The only open question
 * on a live tenant is whether those transactions represent the full ledger.
 */

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { FilterChipRow, type FilterChip } from "@/components/FilterChipRow";
import { WidgetCard, Divider } from "@/components/LedgerWidgets";
import {
  buildMonthlyWindow,
  monthSeriesDesc,
  showYtdChip,
  ytdWindowKeys,
  type CashFlowTxLike,
} from "@/lib/cashFlow";

// ── colour tokens — reuse the same green/red already on this page ──────────
const INCOME_COLOR = "#42bf23";
const EXPENSE_COLOR = "#d20344";
const AXIS_INK = "rgba(65, 73, 101, 1)";
const GRID_INK = "rgba(29, 33, 50, 1)";

// ── typography helpers — match CashProjectionCard ─────────────────────────
const LABEL =
  "[font-family:'Gilroy',sans-serif] font-semibold text-[12px] uppercase text-brain-v1baby-blue-60";
const BODY =
  "[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[18px]";
const MONO = "[font-family:'JetBrains_Mono',monospace] font-medium text-[13px]";

type Format = (a: string | number) => string;
type Period = "6" | "12" | "ytd";

/** Returns the current calendar month as "YYYY-MM". */
function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** "Aug 2026" → "Aug '26" — compact enough for a 12-bar axis. */
function shortTick(label: string): string {
  const parts = label.split(" ");
  if (parts.length !== 2) return label;
  return `${parts[0]} '${parts[1].slice(2)}`;
}

/** Compact currency tick — mirrors CashProjectionCard's compactTick. */
function makeCompactTick(format: Format): (v: number) => string {
  const symbol = format(0).replace(/[\d.,\s\u00a0]/g, "").trim();
  return (v: number) => {
    const abs = Math.abs(v);
    const sign = v < 0 ? "-" : "";
    if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}${symbol}${Math.round(abs / 1_000)}k`;
    return `${sign}${symbol}${Math.round(abs)}`;
  };
}

export function MonthlyBreakdownCard({
  transactions,
  isLoading,
  failed,
  truncated,
  format,
  nameOf,
}: {
  /**
   * null = still fetching (show loading state).
   * [] or [...] = fetch completed (show chart or empty state).
   * When `failed` is true this value will be null; the caller must still
   * pass null so the types stay honest — but the render path changes.
   */
  transactions: readonly CashFlowTxLike[] | null;
  /** True while the transaction query has not yet resolved. */
  isLoading?: boolean;
  /**
   * True when the transaction fetch failed outright.
   *
   * A failed fetch is NOT the same as no transactions. Rendering an empty
   * chart or "no data" copy when the source is unreachable would let users
   * mistake an availability problem for a business fact (nothing moved). The
   * card renders an explicit "couldn't load" state instead, consistent with
   * how CashFlowTab already handles the same failure for every other metric.
   */
  failed?: boolean;
  /**
   * True when brain-core returned a partial page of transactions (next_cursor
   * was non-null). The chart's monthly figures are then a floor — actual
   * totals may be higher. A notice is rendered so the user is not misled by
   * numbers that look complete but are not.
   */
  truncated?: boolean;
  format: Format;
  nameOf?: (id: string | null | undefined) => string | null;
}): JSX.Element {
  const [period, setPeriod] = useState<Period>("6");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const compactTick = useMemo(() => makeCompactTick(format), [format]);

  // The current calendar month is the right-hand anchor for every window.
  // Computed once per mount so the chart does not shift mid-session.
  const thisMonth = useMemo(() => currentMonthKey(), []);
  const thisMonthNumber = Number(thisMonth.split("-")[1]); // 1–12

  // "Year to date" is meaningful when there are ≥ 2 months to show (Feb+)
  // but not when it covers a full calendar year (December = 12 months, which
  // makes it the same as "Last 12 months" for the same year).
  const showYtd = showYtdChip(thisMonthNumber);

  const activePeriod: Period = period === "ytd" && !showYtd ? "6" : period;

  // Build the ordered list of YYYY-MM keys for the active window.
  // These are CONTIGUOUS CALENDAR MONTHS regardless of whether each has data.
  const windowKeys = useMemo((): readonly string[] => {
    if (activePeriod === "ytd") {
      // Jan of current year through current month (oldest → newest).
      return ytdWindowKeys(thisMonth);
    }
    const n = activePeriod === "12" ? 12 : 6;
    return monthSeriesDesc(thisMonth, n).reverse(); // oldest → newest
  }, [activePeriod, thisMonth]);

  // Fill every window slot: data months get their real figures, empty months
  // get income=0/expenses=0 so gaps are visible, not hidden.
  const chartData = useMemo(
    () => buildMonthlyWindow(transactions ?? [], windowKeys),
    [transactions, windowKeys],
  );

  // The active (selected) month: sticky when switching periods if still
  // visible; otherwise defaults to the most recent month in the current window.
  const activeMonth = useMemo(() => {
    const last = chartData[chartData.length - 1]?.monthKey ?? null;
    if (selectedMonth && chartData.some((d) => d.monthKey === selectedMonth))
      return selectedMonth;
    return last;
  }, [selectedMonth, chartData]);

  const selectedEntry = chartData.find((d) => d.monthKey === activeMonth) ?? null;

  const chips: FilterChip[] = [
    { value: "6", label: "Last 6 months" },
    { value: "12", label: "Last 12 months" },
    ...(showYtd ? [{ value: "ytd", label: "Year to date" } as FilterChip] : []),
  ];

  // ── inner content — three exclusive states ────────────────────────────────
  let inner: React.ReactNode;

  if (failed) {
    // A fetch failure is NOT "no data" — it means we could not find out.
    // Rendering an empty chart here would let a user mistake an availability
    // problem for a genuine absence of activity. This matches how the rest of
    // CashFlowTab handles source failures: name the casualty, never imply zero.
    inner = (
      <p
        className={`${BODY} text-brain-v1baby-blue-60 px-[16px] py-[12px]`}
        data-testid="text-monthly-breakdown-unavailable"
      >
        Transaction data couldn't be loaded. That is not a statement that nothing
        moved — treat it as unknown, and refresh to see the real figures.
      </p>
    );
  } else if (isLoading && transactions === null) {
    inner = (
      <p
        className={`${BODY} text-brain-v1baby-blue-60 px-[16px] py-[12px]`}
        data-testid="text-monthly-breakdown-loading"
      >
        Loading monthly breakdown…
      </p>
    );
  } else if (chartData.every((e) => e.income === 0 && e.expenses === 0)) {
    // All zero — either genuinely no data or empty tenant.
    inner = (
      <p
        className={`${BODY} text-brain-v1baby-blue-60 px-[16px] py-[12px]`}
        data-testid="text-monthly-breakdown-empty"
      >
        No transaction data for this period.
      </p>
    );
  } else {
    inner = (
      <div className="flex flex-col gap-[12px] w-full">
        {/* ── bar chart ────────────────────────────────────────────────── */}
        <div
          className="w-full"
          style={{ height: 160 }}
          data-testid="chart-monthly-breakdown"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              barCategoryGap="30%"
              barGap={2}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
              onClick={(data) => {
                const mk =
                  data?.activePayload?.[0]?.payload?.monthKey as
                    | string
                    | undefined;
                if (mk) setSelectedMonth(mk);
              }}
              style={{ cursor: "pointer" }}
            >
              <CartesianGrid
                stroke={GRID_INK}
                strokeDasharray="2 4"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tickFormatter={shortTick}
                tick={{
                  fill: AXIS_INK,
                  fontSize: 10,
                  fontFamily: "JetBrains Mono, monospace",
                }}
                axisLine={{ stroke: GRID_INK }}
                tickLine={false}
                minTickGap={0}
              />
              <YAxis
                tick={{
                  fill: AXIS_INK,
                  fontSize: 10,
                  fontFamily: "JetBrains Mono, monospace",
                }}
                axisLine={false}
                tickLine={false}
                width={44}
                tickFormatter={compactTick}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={{
                  background: "rgba(10, 12, 16, 0.96)",
                  border: `1px solid ${GRID_INK}`,
                  borderRadius: 8,
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 12,
                }}
                labelStyle={{
                  color: AXIS_INK,
                  fontFamily: "Gilroy, sans-serif",
                  fontSize: 12,
                  fontWeight: 600,
                  paddingBottom: 4,
                }}
                itemStyle={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 12,
                  paddingTop: 2,
                  paddingBottom: 2,
                }}
                formatter={(value: number, name: string) => [
                  format(value),
                  name === "income" ? "Income" : "Expenses",
                ]}
              />
              <Bar
                dataKey="income"
                name="income"
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              >
                {chartData.map((entry) => (
                  <Cell
                    key={entry.monthKey}
                    fill={INCOME_COLOR}
                    opacity={entry.monthKey === activeMonth ? 1 : 0.3}
                  />
                ))}
              </Bar>
              <Bar
                dataKey="expenses"
                name="expenses"
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              >
                {chartData.map((entry) => (
                  <Cell
                    key={entry.monthKey}
                    fill={EXPENSE_COLOR}
                    opacity={entry.monthKey === activeMonth ? 1 : 0.3}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ── legend ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-[12px] px-[2px]">
          <div className="flex items-center gap-[6px]">
            <div
              className="size-[8px] rounded-full shrink-0"
              style={{ background: INCOME_COLOR }}
            />
            <span className={`${LABEL} normal-case`}>Income</span>
          </div>
          <div className="flex items-center gap-[6px]">
            <div
              className="size-[8px] rounded-full shrink-0"
              style={{ background: EXPENSE_COLOR }}
            />
            <span className={`${LABEL} normal-case`}>Expenses</span>
          </div>
        </div>

        <Divider />

        {/* ── selected month detail ────────────────────────────────────── */}
        {selectedEntry ? (
          <div
            className="flex flex-col gap-[8px] w-full"
            data-testid="panel-monthly-breakdown-detail"
          >
            <p className={LABEL} data-testid="text-monthly-breakdown-month">
              {selectedEntry.label}
            </p>

            <div className="flex gap-[8px] w-full">
              <div className="flex-1 flex flex-col gap-[2px] px-[12px] py-[10px] rounded-[8px] bg-brain-v1baby-blue-5 border border-solid border-brain-v1stroke-2">
                <p
                  className={`${LABEL} normal-case`}
                  style={{ color: INCOME_COLOR }}
                >
                  Income
                </p>
                <p
                  className={MONO}
                  style={{ color: INCOME_COLOR }}
                  data-testid="text-monthly-breakdown-income"
                >
                  {/* When the transaction feed is known to be partial, withhold
                      the figure rather than displaying a number that is lower
                      than the real total. Mirrors how the headline liabilities
                      metric shows "—" when the obligations read is incomplete. */}
                  {truncated ? "—" : format(selectedEntry.income)}
                </p>
              </div>
              <div className="flex-1 flex flex-col gap-[2px] px-[12px] py-[10px] rounded-[8px] bg-brain-v1baby-blue-5 border border-solid border-brain-v1stroke-2">
                <p
                  className={`${LABEL} normal-case`}
                  style={{ color: EXPENSE_COLOR }}
                >
                  Expenses
                </p>
                <p
                  className={MONO}
                  style={{ color: EXPENSE_COLOR }}
                  data-testid="text-monthly-breakdown-expenses"
                >
                  {truncated ? "—" : format(selectedEntry.expenses)}
                </p>
              </div>
            </div>

            {/* Top expense counterparties.
                Grouped by counterparty_id: nameOf resolves ids to display
                names when the counterparty feed is available. When no name
                can be resolved, "Unknown" is shown rather than silently
                omitting the entry — the spend is real even if the source
                is not identified. */}
            {selectedEntry.topExpenseCounterpartyIds.length > 0 && (
              <div className="flex flex-col gap-[4px] w-full">
                <p className={`${LABEL} mt-[4px]`}>Top expenses</p>
                {selectedEntry.topExpenseCounterpartyIds.map(
                  ({ id, amount }, idx) => {
                    const name =
                      nameOf?.(id) ??
                      (id ? `${id.slice(0, 12)}…` : "Unknown");
                    return (
                      <div
                        key={id ?? `unknown-${idx}`}
                        className="flex items-center justify-between gap-[8px] py-[4px]"
                        data-testid={`row-monthly-breakdown-cp-${idx}`}
                      >
                        <p
                          className={`${BODY} text-brain-v1baby-blue-100 truncate`}
                        >
                          {name}
                        </p>
                        <p
                          className={`${MONO} text-brain-v1baby-blue-60 shrink-0`}
                        >
                          {format(amount)}
                        </p>
                      </div>
                    );
                  },
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <WidgetCard title="Monthly Breakdown">
      <div className="flex flex-col gap-[12px] px-[16px] py-[12px] w-full">
        {/* Period toggle — same FilterChipRow pattern as Counterparties. */}
        <FilterChipRow
          chips={chips}
          value={activePeriod}
          onChange={(v) => {
            setPeriod(v as Period);
            setSelectedMonth(null); // reset selection when window changes
          }}
          label="Breakdown period"
          testIdPrefix="chip-monthly-period"
        />
        {/* Transaction feed was a partial page — figures are a floor, not the
            real totals. Surfaced so the user is not misled by numbers that look
            complete. Mirrors how invTruncated is surfaced in the bills list. */}
        {truncated && !failed && (
          <p
            className={`${BODY} text-brain-v1baby-blue-60`}
            style={{ fontSize: 11 }}
            data-testid="text-monthly-breakdown-truncated"
          >
            Monthly totals are based on a partial transaction feed — actual
            figures may be higher.
          </p>
        )}
        {inner}
      </div>
    </WidgetCard>
  );
}
