import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
} from "lightweight-charts";
import type { AgentData } from "@/lib/agentsData";

type Period = "1H" | "1D" | "1W" | "1M" | "1Y" | "ALL";

const PERIODS: Period[] = ["1H", "1D", "1W", "1M", "1Y", "ALL"];

const GREEN     = "#42bf23";
const GREEN_DIM = "rgba(66,191,35,0.52)";

/* ─── Deterministic LCG random ─── */
function makeRng(seed: number) {
  let s = (seed * 1664525 + 1013904223) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function agentSeed(agent: AgentData): number {
  return agent.id.split("").reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
}

/** Generate action-count data for each time bucket */
function generateData(
  agent: AgentData,
  period: Period,
): { time: number; value: number; color: string }[] {
  const now = Math.floor(Date.now() / 1000);

  let intervalSecs: number;
  let count: number;
  switch (period) {
    case "1H":  intervalSecs = 60;         count = 60; break;
    case "1D":  intervalSecs = 3600;       count = 24; break;
    case "1W":  intervalSecs = 86400;      count = 7;  break;
    case "1M":  intervalSecs = 86400;      count = 30; break;
    case "1Y":  intervalSecs = 86400 * 7;  count = 52; break;
    case "ALL": intervalSecs = 86400 * 30; count = 36; break;
  }

  const totalTrades = agent.trades || 120;
  const seed        = agentSeed(agent) + period.charCodeAt(0) * 17;
  const rng         = makeRng(seed);

  /* Average actions per bucket, scaled to the period */
  const avgPerBucket = Math.max(1, (() => {
    switch (period) {
      case "1H":  return totalTrades / (24 * 60);
      case "1D":  return totalTrades / 24;
      case "1W":  return totalTrades / 7;
      case "1M":  return totalTrades / 30;
      case "1Y":  return totalTrades / 52;
      case "ALL": return totalTrades / 12;
    }
  })());

  const start = now - intervalSecs * count;

  return Array.from({ length: count }, (_, i) => {
    /* Simulate market-hours bump for sub-day buckets */
    const bucketHour = Math.floor(((start + intervalSecs * i) % 86400) / 3600);
    const hourFactor =
      period === "1H" || period === "1D"
        ? bucketHour >= 8 && bucketHour <= 20 ? 1.45 : 0.55
        : 1.0;

    const noise = rng();
    const val   = Math.max(0, Math.round(avgPerBucket * hourFactor * (0.25 + noise * 1.55)));
    const isHigh = val > avgPerBucket * 1.15;

    return {
      time:  start + intervalSecs * i,
      value: val,
      color: isHigh ? GREEN : GREEN_DIM,
    };
  });
}

const PERIOD_LABEL: Record<Period, string> = {
  "1H": "past hour",
  "1D": "past 24 h",
  "1W": "past week",
  "1M": "past month",
  "1Y": "past year",
  "ALL": "all time",
};

interface Props { agent: AgentData }

export const AgentPerfChart = ({ agent }: Props): JSX.Element => {
  const [period, setPeriod] = useState<Period>("1D");

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const seriesRef    = useRef<ISeriesApi<SeriesType> | null>(null);
  const periodRef    = useRef<Period>(period);
  periodRef.current  = period;

  /* ── Summary numbers ── */
  const data  = generateData(agent, period);
  const total = data.reduce((s, d) => s + d.value, 0);

  /* Compare first half vs second half of the period for trend */
  const mid       = Math.floor(data.length / 2);
  const firstHalf = data.slice(0, mid).reduce((s, d) => s + d.value, 0);
  const secHalf   = data.slice(mid).reduce((s, d) => s + d.value, 0);
  const delta     = secHalf - firstHalf;
  const positive  = delta >= 0;
  const deltaPct  = firstHalf > 0 ? Math.round(Math.abs(delta / firstHalf) * 100) : 0;
  const deltaStr  = `${positive ? "▲" : "▼"} ${deltaPct}%`;

  /* ── Create chart once ── */
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width:  containerRef.current.clientWidth || 600,
      height: 290,
      layout: {
        background:      { type: ColorType.Solid, color: "#0a0c10" },
        textColor:       "#6c779d",
        fontSize:        10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "#1d2132", style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color:                "#ff9500",
          style:                LineStyle.Dashed,
          width:                1,
          labelBackgroundColor: "#4a2300",
        },
        horzLine: {
          color:                "#ff9500",
          style:                LineStyle.Dashed,
          width:                1,
          labelBackgroundColor: "#4a2300",
        },
      },
      rightPriceScale: {
        visible:       true,
        borderVisible: false,
        scaleMargins:  { top: 0.08, bottom: 0.06 },
      },
      leftPriceScale: { visible: false },
      timeScale: {
        visible:       true,
        borderVisible: false,
        fixLeftEdge:   true,
        fixRightEdge:  true,
        rightOffset:   2,
      },
      handleScroll: false,
      handleScale:  false,
    } as any);

    const series = chart.addSeries(HistogramSeries, {
      color:            GREEN_DIM,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current  = chart;
    seriesRef.current = series;

    series.setData(generateData(agent, periodRef.current) as any);
    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current  = null;
      seriesRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Update data on period / agent change ── */
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    seriesRef.current.setData(generateData(agent, period) as any);
    chartRef.current.timeScale().fitContent();
  }, [period, agent.id]);

  return (
    <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-[16px] py-[10px]" style={{ borderBottom: "1px solid #1d2132" }}>

        {/* Count + trend pill */}
        <div className="flex items-center gap-[8px] flex-shrink-0">
          <div className="flex flex-col gap-[2px]">
            <div className="flex items-baseline gap-[4px]">
              <span style={{ fontFamily: "'Gilroy-Bold',Helvetica,sans-serif", fontSize: "22px", lineHeight: "26px", color: "#a8b9f4" }}>
                {total.toLocaleString()}
              </span>
              <span style={{ fontFamily: "'Gilroy-Medium',Helvetica,sans-serif", fontSize: "13px", lineHeight: "16px", color: "#6c779d" }}>
                actions
              </span>
            </div>
            <span style={{ fontFamily: "'Gilroy-Medium',Helvetica,sans-serif", fontSize: "11px", color: "#414965" }}>
              {PERIOD_LABEL[period]}
            </span>
          </div>

          <div
            className="flex items-center justify-center px-[8px] py-[4px] rounded-[40px] flex-shrink-0"
            style={{ background: positive ? "#123509" : "#350011" }}
          >
            <span style={{ fontFamily: "'Gilroy-SemiBold',Helvetica,sans-serif", fontSize: "13px", lineHeight: "16px", color: positive ? GREEN : "#d20344", whiteSpace: "nowrap" }}>
              {deltaStr}
            </span>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-[2px] p-[2px] rounded-[400px] flex-shrink-0" style={{ background: "#06070a" }}>
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              data-testid={`button-chart-period-${p}`}
              className="flex items-center justify-center px-[12px] py-[4px] rounded-[100px] transition-all flex-shrink-0"
              style={period === p ? { background: "#4a2300" } : { background: "#06070a" }}
            >
              <span style={{ fontFamily: "'Gilroy-SemiBold',Helvetica,sans-serif", fontSize: "12px", lineHeight: "16px", color: period === p ? "#ff9500" : "#414965", whiteSpace: "nowrap" }}>
                {p}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Chart canvas ── */}
      <div ref={containerRef} style={{ height: "290px", background: "#0a0c10" }} />
    </div>
  );
};
