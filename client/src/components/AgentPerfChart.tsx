import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
} from "lightweight-charts";
import type { AgentData } from "@/lib/agentsData";

type Period = "1H" | "1D" | "1W" | "1M" | "1Y" | "ALL";

const PERIODS: Period[] = ["1H", "1D", "1W", "1M", "1Y", "ALL"];

function agentChartColor(agent: AgentData): string {
  if (agent.status !== "active") return "#6c779d";
  if (agent.riskLevel === "high") return "#d20344";
  if (agent.riskLevel === "medium") return "#7631ee";
  return "#42bf23";
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function generateData(agent: AgentData, period: Period): { time: number; value: number }[] {
  const now = Math.floor(Date.now() / 1000);
  let intervalSecs: number;
  let count: number;

  switch (period) {
    case "1H":  intervalSecs = 60;          count = 60;  break;
    case "1D":  intervalSecs = 3600;         count = 24;  break;
    case "1W":  intervalSecs = 86400;        count = 7;   break;
    case "1M":  intervalSecs = 86400;        count = 30;  break;
    case "1Y":  intervalSecs = 86400 * 7;    count = 52;  break;
    case "ALL": intervalSecs = 86400 * 30;   count = 36;  break;
  }

  const raw = parseFloat(agent.earnings.replace(/[^0-9.]/g, "")) || 1000;
  const basePrice = 0.055 + (raw % 500) / 100000;
  const seed = agent.id.charCodeAt(0) * 13 + agent.id.charCodeAt(1) * 7;
  const vol = agent.riskLevel === "high" ? 0.004 : agent.riskLevel === "medium" ? 0.002 : 0.0012;

  const startTime = now - intervalSecs * count;
  let price = basePrice;
  const points: { time: number; value: number }[] = [];

  for (let i = 0; i < count; i++) {
    const time = startTime + intervalSecs * i;
    const progress = i / count;
    const trend = progress * vol * 1.5;
    const n1 = vol * 0.45 * Math.sin(i * 2.3 + seed * 0.7);
    const n2 = vol * 0.25 * Math.sin(i * 5.1 + seed * 0.3);
    const n3 = vol * 0.12 * Math.sin(i * 11.7 + seed * 1.1);
    price = Math.max(basePrice * 0.82, basePrice + trend + n1 + n2 + n3);
    points.push({ time, value: parseFloat(price.toFixed(6)) });
  }

  return points;
}

interface Props {
  agent: AgentData;
}

export const AgentPerfChart = ({ agent }: Props): JSX.Element => {
  const [period, setPeriod] = useState<Period>("1D");
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const color = agentChartColor(agent);

  const data = generateData(agent, period);
  const firstVal = data[0]?.value ?? 0;
  const lastVal = data[data.length - 1]?.value ?? 0;
  const absDelta = lastVal - firstVal;
  const pctDelta = firstVal ? (absDelta / firstVal) * 100 : 0;
  const positive = absDelta >= 0;
  const priceDisplay = lastVal.toFixed(4);
  const deltaDisplay = `${positive ? "+" : ""}$${Math.abs(absDelta).toFixed(4)} (${Math.abs(pctDelta).toFixed(2)}%)`;

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 310,
      layout: {
        background: { type: ColorType.Solid, color: "#0a0c10" },
        textColor: "#6c779d",
        fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "#1d2132", style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "#ff9500",
          style: LineStyle.Dashed,
          width: 1,
          labelBackgroundColor: "#4a2300",
        },
        horzLine: {
          color: "#ff9500",
          style: LineStyle.Dashed,
          width: 1,
          labelBackgroundColor: "#4a2300",
        },
      },
      rightPriceScale: {
        visible: true,
        borderVisible: false,
        scaleMargins: { top: 0.08, bottom: 0.15 },
      },
      leftPriceScale: { visible: false },
      timeScale: {
        visible: true,
        borderVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        rightOffset: 0,
        barSpacing: 8,
      },
      handleScroll: false,
      handleScale: false,
    } as any);

    const series = chart.addSeries(AreaSeries, {
      lineColor: color,
      topColor: hexToRgba(color, 0.35),
      bottomColor: hexToRgba(color, 0.01),
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: color,
      crosshairMarkerBackgroundColor: color,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const initData = generateData(agent, period);
    series.setData(initData as any);
    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
        });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    const newData = generateData(agent, period);
    seriesRef.current.setData(newData as any);
    (seriesRef.current as any).applyOptions({
      lineColor: color,
      topColor: hexToRgba(color, 0.35),
      bottomColor: hexToRgba(color, 0.01),
    });
    chartRef.current.timeScale().fitContent();
  }, [period, agent.id, color]);

  return (
    <div
      className="rounded-[16px] overflow-hidden"
      style={{ background: "#0a0c10", border: "1px solid #1d2132" }}
    >
      {/* ── Header: price + delta pill | period tabs ── */}
      <div
        className="flex items-center justify-between px-[16px] py-[10px]"
        style={{ borderBottom: "1px solid #1d2132", background: "#0a0c10" }}
      >
        {/* Left: price + delta pill */}
        <div className="flex items-center gap-[8px] flex-shrink-0">
          <p style={{ lineHeight: 0 }}>
            <span
              style={{
                fontFamily: "'Gilroy-Medium', Helvetica, sans-serif",
                fontSize: "16px",
                lineHeight: "28px",
                color: "#a8b9f4",
              }}
            >
              $
            </span>
            <span
              style={{
                fontFamily: "'Gilroy-Medium', Helvetica, sans-serif",
                fontSize: "24px",
                lineHeight: "28px",
                color: "#a8b9f4",
              }}
            >
              {priceDisplay}
            </span>
          </p>
          <div
            className="flex items-center justify-center px-[8px] py-[4px] rounded-[40px] flex-shrink-0"
            style={{ background: positive ? "#123509" : "#350011" }}
          >
            <span
              style={{
                fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif",
                fontSize: "14px",
                lineHeight: "16px",
                color: positive ? "#42bf23" : "#d20344",
                whiteSpace: "nowrap",
              }}
            >
              {deltaDisplay}
            </span>
          </div>
        </div>

        {/* Right: period tab picker */}
        <div
          className="flex items-center gap-[2px] p-[2px] rounded-[400px] flex-shrink-0"
          style={{ background: "#06070a" }}
        >
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              data-testid={`button-chart-period-${p}`}
              className="flex items-center justify-center px-[12px] py-[4px] rounded-[100px] transition-all flex-shrink-0"
              style={period === p ? { background: "#4a2300" } : { background: "#06070a" }}
            >
              <span
                style={{
                  fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif",
                  fontSize: "12px",
                  lineHeight: "16px",
                  color: period === p ? "#ff9500" : "#414965",
                  whiteSpace: "nowrap",
                }}
              >
                {p}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── TradingView Lightweight Chart ── */}
      <div ref={containerRef} style={{ height: "310px", background: "#0a0c10" }} />
    </div>
  );
};
