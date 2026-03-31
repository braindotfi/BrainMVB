import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { agents } from "@/lib/agentsData";

const riskColors = {
  low:    { bg: "#0d2e0d", border: "rgba(66,191,35,0.2)",   text: "#42bf23" },
  medium: { bg: "#2e1d00", border: "rgba(255,149,0,0.2)",   text: "#ff9500" },
  high:   { bg: "#350011", border: "rgba(210,3,68,0.2)",    text: "#d20344" },
};

const statusConfig = {
  active:   { dot: "#42bf23", bg: "#0d2e0d", border: "rgba(66,191,35,0.2)", text: "#42bf23", label: "Active" },
  paused:   { dot: "#facc15", bg: "#2a2000", border: "rgba(250,204,21,0.2)", text: "#facc15", label: "Paused" },
  inactive: { dot: "#6c779d", bg: "#1d2132", border: "#2d3450",              text: "#6c779d", label: "Inactive" },
};

const logColors = { success: "#42bf23", info: "#a8b9f4", warn: "#ff9500" };
const logDots   = { success: "#42bf23", info: "#a8b9f4", warn: "#ff9500" };

const StatBox = ({ label, value, accent }: { label: string; value: string; accent?: string }) => (
  <div
    className="flex flex-col gap-1 px-4 py-3 flex-1"
    style={{ borderRight: "1px solid #1d2132" }}
  >
    <span className="text-[11px]" style={{ color: "#414965", fontFamily: "'Gilroy-Medium', Helvetica, sans-serif" }}>
      {label}
    </span>
    <span className="text-base" style={{ color: accent ?? "#c8d4f0", fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif" }}>
      {value}
    </span>
  </div>
);

export const AgentDetailPage = (): JSX.Element => {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [deploying, setDeploying] = useState(false);
  const [deployed, setDeployed] = useState(false);

  const agent = agents.find((a) => a.id === params.id);

  if (!agent) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-[#11141b] rounded-[16px] border border-[#1d2132]">
        <span className="text-4xl">🤖</span>
        <p style={{ color: "#414965", fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif" }}>
          Agent not found
        </p>
        <button
          onClick={() => navigate("/marketplace")}
          className="px-4 py-2 rounded-full text-sm transition-opacity hover:opacity-80"
          style={{ background: "#4a2300", color: "#ff9500", fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif" }}
        >
          Back to Marketplace
        </button>
      </div>
    );
  }

  const risk   = riskColors[agent.riskLevel];
  const status = statusConfig[agent.status];

  const handleDeploy = () => {
    if (deployed) { navigate("/agents"); return; }
    setDeploying(true);
    setTimeout(() => { setDeploying(false); setDeployed(true); }, 1400);
  };

  return (
    <div className="flex flex-col h-full bg-[#11141b] rounded-[16px] border border-solid border-[#1d2132] overflow-hidden">

      {/* ── Top bar ── */}
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid #1d2132" }}
      >
        <button
          data-testid="button-back-marketplace"
          onClick={() => navigate("/marketplace")}
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors hover:bg-[#161b28]"
          style={{ background: "#0d1018", border: "1px solid #1d2132" }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7L9 11" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="text-sm" style={{ color: "#414965", fontFamily: "'Gilroy-Medium', Helvetica, sans-serif" }}>
          Marketplace
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="flex-shrink-0">
          <path d="M4 2L8 6L4 10" stroke="#414965" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-sm" style={{ color: "#c8d4f0", fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif" }}>
          {agent.name}
        </span>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-5 p-4 pb-6">

          {/* ── Hero card ── */}
          <div
            className="rounded-[16px] overflow-hidden"
            style={{ background: "#0a0c10", border: "1px solid #1d2132" }}
          >
            {/* Agent identity */}
            <div className="flex items-start gap-4 p-4">
              <img
                src={agent.avatar}
                alt={agent.name}
                className="w-14 h-14 rounded-2xl flex-shrink-0"
                style={{ background: "#161b28" }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1
                    className="text-lg leading-tight"
                    style={{ color: "#f1f5f9", fontFamily: "'Gilroy-Bold', Helvetica, sans-serif" }}
                  >
                    {agent.name}
                  </h1>
                  {/* Status badge */}
                  <span
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] flex-shrink-0"
                    style={{
                      background: status.bg,
                      border: `1px solid ${status.border}`,
                      color: status.text,
                      fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif",
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: status.dot }} />
                    {status.label}
                  </span>
                </div>

                {/* Type + category tags */}
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span
                    className="px-2 py-0.5 rounded-full text-[11px]"
                    style={{
                      background: "#123509",
                      border: "1px solid rgba(66,191,35,0.2)",
                      color: "#42bf23",
                      fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif",
                    }}
                  >
                    {agent.type}
                  </span>
                  <span
                    className="px-2 py-0.5 rounded-full text-[11px]"
                    style={{
                      background: "#161b28",
                      border: "1px solid #1d2132",
                      color: "#6c779d",
                      fontFamily: "'Gilroy-Medium', Helvetica, sans-serif",
                    }}
                  >
                    {agent.category}
                  </span>
                  {/* Risk */}
                  <span
                    className="px-2 py-0.5 rounded-full text-[11px]"
                    style={{
                      background: risk.bg,
                      border: `1px solid ${risk.border}`,
                      color: risk.text,
                      fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif",
                    }}
                  >
                    {agent.riskLevel.charAt(0).toUpperCase() + agent.riskLevel.slice(1)} Risk
                  </span>
                </div>

                <p
                  className="text-[12px] leading-relaxed mt-2"
                  style={{ color: "#6c779d", fontFamily: "'Gilroy-Medium', Helvetica, sans-serif" }}
                >
                  {agent.description}
                </p>
              </div>
            </div>

            {/* Stats row */}
            <div
              className="flex items-stretch overflow-hidden"
              style={{ borderTop: "1px solid #1d2132" }}
            >
              <StatBox label="Success Rate" value={agent.successRate} accent="#42bf23" />
              <StatBox label="Total Actions" value={agent.trades.toLocaleString()} />
              <StatBox label="P&L" value={agent.earnings} accent={agent.earnings.startsWith("+") ? "#42bf23" : "#d20344"} />
              <div className="flex flex-col gap-1 px-4 py-3 flex-1">
                <span className="text-[11px]" style={{ color: "#414965", fontFamily: "'Gilroy-Medium', Helvetica, sans-serif" }}>
                  Last Active
                </span>
                <span className="text-base" style={{ color: "#c8d4f0", fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif" }}>
                  {agent.lastActive}
                </span>
              </div>
            </div>
          </div>

          {/* ── Configuration ── */}
          <div
            className="rounded-[16px] overflow-hidden"
            style={{ background: "#0a0c10", border: "1px solid #1d2132" }}
          >
            <div className="px-4 pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: "1px solid #1d2132" }}>
              <span className="text-sm" style={{ color: "#c8d4f0", fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif" }}>
                Configuration
              </span>
            </div>
            <div className="flex flex-col">
              {[
                { label: "Budget",   value: agent.budget   },
                { label: "Schedule", value: agent.schedule  },
                { label: "Deployed", value: agent.deployedAt },
              ].map(({ label, value }, i, arr) => (
                <div
                  key={label}
                  className="flex items-center justify-between px-4 py-3"
                  style={{ borderBottom: i < arr.length - 1 ? "1px solid #1d2132" : undefined }}
                >
                  <span className="text-[12px]" style={{ color: "#414965", fontFamily: "'Gilroy-Medium', Helvetica, sans-serif" }}>
                    {label}
                  </span>
                  <span className="text-[12px]" style={{ color: "#a8b9f4", fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif" }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Rulebook ── */}
          <div
            className="rounded-[16px] overflow-hidden"
            style={{ background: "#0a0c10", border: "1px solid #1d2132" }}
          >
            <div className="px-4 pt-4 pb-3 flex items-center gap-2" style={{ borderBottom: "1px solid #1d2132" }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="2" y="1" width="10" height="12" rx="1.5" stroke="#6c779d" strokeWidth="1.2" />
                <path d="M4.5 4.5h5M4.5 7h5M4.5 9.5h3" stroke="#6c779d" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              <span className="text-sm" style={{ color: "#c8d4f0", fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif" }}>
                Rulebook
              </span>
            </div>
            <div className="flex flex-col">
              {agent.rules.map((rule, i) => (
                <div
                  key={rule.id}
                  className="flex items-start gap-3 px-4 py-3"
                  style={{ borderBottom: i < agent.rules.length - 1 ? "1px solid #1d2132" : undefined }}
                >
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5"
                    style={{
                      background: "#161b28",
                      border: "1px solid #1d2132",
                      color: "#6c779d",
                      fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif",
                    }}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] mb-0.5" style={{ color: "#414965", fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif" }}>
                      {rule.label}
                    </p>
                    <p className="text-[12px] leading-relaxed" style={{ color: "#a8b9f4", fontFamily: "'Gilroy-Medium', Helvetica, sans-serif" }}>
                      {rule.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Recent Activity ── */}
          <div
            className="rounded-[16px] overflow-hidden"
            style={{ background: "#0a0c10", border: "1px solid #1d2132" }}
          >
            <div className="px-4 pt-4 pb-3 flex items-center gap-2" style={{ borderBottom: "1px solid #1d2132" }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="5.5" stroke="#6c779d" strokeWidth="1.2" />
                <path d="M7 4v3.5l2 2" stroke="#6c779d" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              <span className="text-sm" style={{ color: "#c8d4f0", fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif" }}>
                Recent Activity
              </span>
            </div>
            <div className="flex flex-col">
              {agent.activityLog.map((log, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 px-4 py-3"
                  style={{ borderBottom: i < agent.activityLog.length - 1 ? "1px solid #1d2132" : undefined }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                    style={{ background: logDots[log.kind] }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px]" style={{ color: logColors[log.kind], fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif" }}>
                        {log.event}
                      </span>
                      <span className="text-[11px]" style={{ color: "#2a2f46", fontFamily: "'Gilroy-Medium', Helvetica, sans-serif" }}>
                        {log.time}
                      </span>
                    </div>
                    <p className="text-[12px] mt-0.5 leading-relaxed" style={{ color: "#414965", fontFamily: "'Gilroy-Medium', Helvetica, sans-serif" }}>
                      {log.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Deploy CTA ── */}
          <button
            data-testid="button-deploy-agent"
            onClick={handleDeploy}
            disabled={deploying}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-[100px] text-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
            style={{
              background: deployed ? "#123509" : "linear-gradient(135deg, #ff9500, #e07800)",
              color: deployed ? "#42bf23" : "#0a0400",
              fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif",
              border: deployed ? "1px solid rgba(66,191,35,0.25)" : "none",
            }}
          >
            {deploying ? (
              <>
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="28" strokeDashoffset="10" />
                </svg>
                Deploying…
              </>
            ) : deployed ? (
              <>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8l4 4 6-7" stroke="#42bf23" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Deployed — View in My Agents
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8l5-5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Deploy {agent.name}
              </>
            )}
          </button>

        </div>
      </ScrollArea>
    </div>
  );
};
