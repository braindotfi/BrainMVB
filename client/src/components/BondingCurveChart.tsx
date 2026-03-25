import { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, Area, AreaChart, CartesianGrid,
} from "recharts";

interface BondingCurveChartProps {
  baseRaised: number;
  graduationThreshold: number;
  currentPrice: number;
  symbol: string;
  chartData?: Array<{ createdAt: string; priceEth: string; baseRaised: string }>;
}

// Generate synthetic bonding curve data points if no real data is available
function generateCurveData(baseRaised: number, graduationThreshold: number) {
  const points = 60;
  const data = [];
  for (let i = 0; i <= points; i++) {
    const supply = (i / points) * 800_000_000; // 800M graduation supply
    const price = (1e9 * supply * supply) / (1e36); // k * s^2 / 1e36
    const raised = baseRaised * (i / points);
    data.push({
      supply: Math.round(supply / 1_000_000), // millions
      price: price,
      raised: raised,
      isCurrent: Math.abs(raised - baseRaised) < baseRaised * 0.02,
    });
  }
  return data;
}

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: { supply: number } }> }) => {
  if (!active || !payload?.length) return null;
  const { value, payload: { supply } } = payload[0];
  return (
    <div
      className="px-3 py-2 rounded-xl text-xs"
      style={{ background: "#1e2535", border: "1px solid #2d3748", color: "#c8d4f0" }}
    >
      <div style={{ color: "#6c779d" }}>Supply: <span style={{ color: "#a8b9f4" }}>{supply}M tokens</span></div>
      <div style={{ color: "#6c779d" }}>Price: <span style={{ color: "#22c55e" }}>Ξ{value.toExponential(4)}</span></div>
    </div>
  );
};

export function BondingCurveChart({ baseRaised, graduationThreshold, symbol }: BondingCurveChartProps) {
  const data = useMemo(() => generateCurveData(baseRaised, graduationThreshold), [baseRaised, graduationThreshold]);
  const progressPct = Math.min((baseRaised / graduationThreshold) * 100, 100);
  const currentIdx = Math.round((baseRaised / graduationThreshold) * data.length);

  return (
    <div className="flex flex-col gap-4">
      {/* Price curve */}
      <div
        className="rounded-2xl p-4"
        style={{ background: "#11141b", border: "1px solid #1d2132" }}
      >
        <div className="flex items-center justify-between mb-3">
          <span
            className="text-sm font-semibold"
            style={{ color: "#6c779d", fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif" }}
          >
            {symbol} Bonding Curve
          </span>
          <span
            className="text-xs px-2 py-1 rounded-full"
            style={{ background: progressPct >= 100 ? "rgba(34,197,94,0.15)" : "rgba(118,49,238,0.15)", color: progressPct >= 100 ? "#22c55e" : "#9d5cf5" }}
          >
            {progressPct >= 100 ? "GRADUATED" : `${progressPct.toFixed(1)}% funded`}
          </span>
        </div>

        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <defs>
              <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7631ee" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#7631ee" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="#1d2132" vertical={false} />
            <XAxis
              dataKey="supply"
              tick={{ fill: "#414965", fontSize: 10, fontFamily: "Gilroy-Medium, sans-serif" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => `${v}M`}
              interval={11}
            />
            <YAxis hide />
            <Tooltip content={<CustomTooltip />} />
            {/* Current position marker */}
            {currentIdx > 0 && currentIdx < data.length && (
              <ReferenceLine
                x={data[currentIdx]?.supply}
                stroke="#f97316"
                strokeDasharray="3 3"
                strokeWidth={1.5}
                label={{ value: "NOW", fill: "#f97316", fontSize: 9, position: "top" }}
              />
            )}
            {/* Graduation threshold marker */}
            <ReferenceLine
              x={data[data.length - 1]?.supply}
              stroke="#22c55e"
              strokeDasharray="3 3"
              strokeWidth={1.5}
              label={{ value: "GRAD", fill: "#22c55e", fontSize: 9, position: "top" }}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke="#7631ee"
              strokeWidth={2}
              fill="url(#curveGradient)"
              dot={false}
              activeDot={{ r: 4, fill: "#9d5cf5", stroke: "#1e2535", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Graduation progress bar */}
      <div
        className="rounded-xl p-4"
        style={{ background: "#11141b", border: "1px solid #1d2132" }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs" style={{ color: "#6c779d", fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif" }}>
            Graduation Progress
          </span>
          <span className="text-xs" style={{ color: "#a8b9f4", fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif" }}>
            Ξ{(baseRaised / 1e18).toFixed(0)} / Ξ{(graduationThreshold / 1e18).toFixed(0)}
          </span>
        </div>
        <div className="relative h-3 rounded-full overflow-hidden" style={{ background: "#222737" }}>
          <div
            className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
            style={{
              width: `${progressPct}%`,
              background: progressPct >= 100
                ? "linear-gradient(90deg, #22c55e, #16a34a)"
                : "linear-gradient(90deg, #7631ee, #9d5cf5)",
            }}
          />
        </div>
        <p className="mt-2 text-xs" style={{ color: "#414965", fontFamily: "'Gilroy-Medium', Helvetica, sans-serif" }}>
          {progressPct >= 100
            ? "🎓 Graduated! Trading on Aerodrome DEX. Liquidity permanently locked."
            : `Ξ${((graduationThreshold - baseRaised) / 1e18).toFixed(0)} more needed to graduate to Aerodrome DEX`}
        </p>
      </div>
    </div>
  );
}
