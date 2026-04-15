import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield } from "lucide-react";
import { agents, AgentStatus, AgentRule } from "@/lib/agentsData";

type ReputationTier = "Legendary" | "Diamond" | "Gold" | "Silver" | "Bronze" | "New" | "Unranked" | "Caution";

interface AgentReputation {
  score: number;
  tier: ReputationTier;
  rankLabel: string;
  percentile: number;
  validationCount: number;
  totalVolumeUsd: number;
  ageLabel?: string;
}

const TIER_CONFIG: Record<ReputationTier, {
  bg: string; border: string; text: string; subtext: string; shield: string;
}> = {
  Legendary: { bg: "bg-[#1a0840]", border: "border-[rgba(157,92,245,0.25)]", text: "text-[#9d5cf5]", subtext: "text-[#7631ee]", shield: "#9d5cf5" },
  Diamond:   { bg: "bg-[#0a1a2e]", border: "border-[rgba(56,189,248,0.25)]", text: "text-[#38bdf8]", subtext: "text-[#0ea5e9]", shield: "#38bdf8" },
  Gold:      { bg: "bg-[#1a0e00]", border: "border-[rgba(255,149,0,0.25)]",  text: "text-[#ff9500]", subtext: "text-[#b86800]", shield: "#ff9500" },
  Silver:    { bg: "bg-[#10131a]", border: "border-[rgba(168,185,244,0.25)]",text: "text-[#a8b9f4]", subtext: "text-[#6c779d]", shield: "#a8b9f4" },
  Bronze:    { bg: "bg-[#140c00]", border: "border-[rgba(205,124,47,0.25)]", text: "text-[#cd7c2f]", subtext: "text-[#8b5a1f]", shield: "#cd7c2f" },
  New:       { bg: "bg-[#001a16]", border: "border-[rgba(0,212,170,0.25)]",  text: "text-[#00d4aa]", subtext: "text-[#00a07c]", shield: "#00d4aa" },
  Unranked:  { bg: "bg-[#0d0f14]", border: "border-[rgba(65,73,101,0.25)]",  text: "text-[#6c779d]", subtext: "text-[#414965]", shield: "#414965" },
  Caution:   { bg: "bg-[#1a0009]", border: "border-[rgba(210,3,68,0.3)]",    text: "text-[#d20344]", subtext: "text-[#8b001f]", shield: "#d20344" },
};

const riskColors = {
  low:    { bg: "bg-[#123509]", border: "border-[rgba(66,191,35,0.2)]", text: "text-[#42bf23]" },
  medium: { bg: "bg-[#2e1d00]", border: "border-[rgba(255,149,0,0.2)]", text: "text-[#ff9500]" },
  high:   { bg: "bg-[#350011]", border: "border-[rgba(210,3,68,0.2)]",  text: "text-[#d20344]" },
};

const statusConfig = {
  active:   { dot: "bg-[#42bf23]", badge: "bg-[#123509] border-[rgba(66,191,35,0.2)] text-[#42bf23]", label: "Active" },
  paused:   { dot: "bg-yellow-400", badge: "bg-yellow-900/30 border-yellow-700/30 text-yellow-400", label: "Paused" },
  inactive: { dot: "bg-[#6c779d]", badge: "bg-[#1d2132] border-[#2d3450] text-[#6c779d]", label: "Inactive" },
};

const logColors = {
  success: "text-[#42bf23]",
  info:    "text-[#a8b9f4]",
  warn:    "text-[#ff9500]",
};

const logDots = {
  success: "bg-[#42bf23]",
  info:    "bg-[#a8b9f4]",
  warn:    "bg-[#ff9500]",
};

export const AgentManagePage = (): JSX.Element => {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const agent = agents.find((a) => a.id === params.id);

  const [currentStatus, setCurrentStatus] = useState<AgentStatus>(agent?.status ?? "inactive");
  const [rules, setRules] = useState<AgentRule[]>(agent?.rules ?? []);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [budget, setBudget] = useState(agent?.budget ?? "");
  const [riskLevel, setRiskLevel] = useState(agent?.riskLevel ?? "medium");
  const [schedule, setSchedule] = useState(agent?.schedule ?? "");
  const [saved, setSaved] = useState(false);

  const { data: reputation } = useQuery<AgentReputation>({
    queryKey: ["/api/agents", params.id, "reputation"],
    queryFn: () => fetch(`/api/agents/${params.id}/reputation`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    enabled: !!params.id,
  });

  const statusMutation = useMutation({
    mutationFn: async (status: AgentStatus) => {
      const res = await fetch(`/api/agents/${params.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (_data, status) => setCurrentStatus(status),
    onError: (_err, status) => setCurrentStatus(status),
  });

  const handleToggle = () => {
    const next: AgentStatus = currentStatus === "active" ? "inactive" : "active";
    setCurrentStatus(next);
    statusMutation.mutate(next);
  };

  const startEdit = (rule: AgentRule) => {
    setEditingRuleId(rule.id);
    setEditingValue(rule.value);
  };

  const commitEdit = (ruleId: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, value: editingValue } : r))
    );
    setEditingRuleId(null);
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!agent) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#6c779d]">
        <span className="text-xl [font-family:'Gilroy',sans-serif]">Agent not found</span>
        <button
          onClick={() => navigate("/agents")}
          className="mt-4 px-4 py-2 bg-[#4a2300] rounded-full text-[#ff9500] text-sm [font-family:'Gilroy',sans-serif]"
        >
          Back to Agents
        </button>
      </div>
    );
  }

  const isActive = currentStatus === "active";
  const sc = statusConfig[currentStatus];
  const rc = riskColors[riskLevel as keyof typeof riskColors];

  return (
    <div className="flex flex-col h-full bg-[#11141b] rounded-[16px] border border-[#1d2132] overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[#1d2132] flex-shrink-0">
        <button
          data-testid="button-back-agents"
          onClick={() => navigate("/agents")}
          className="w-8 h-8 flex items-center justify-center bg-[#0a0c10] border border-[#1d2132] rounded-full hover:border-[#2d3450] transition-colors flex-shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7L9 12" stroke="#6c779d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <img src={agent.avatar} alt={agent.name} className="w-10 h-10 rounded-xl flex-shrink-0" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="[font-family:'Gilroy',sans-serif] font-semibold text-white text-base">
              {agent.name}
            </span>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] [font-family:'Gilroy',sans-serif] font-semibold border ${sc.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
              {sc.label}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="bg-[#123509] border border-[rgba(66,191,35,0.2)] px-[7px] py-[2px] rounded-[22px] text-[#42bf23] text-[10px] [font-family:'Gilroy',sans-serif] whitespace-nowrap">
              {agent.type}
            </span>
            <span className="text-[#2d3450]">·</span>
            <span className="text-xs text-[#6c779d] [font-family:'Gilroy',sans-serif]">
              Deployed {agent.deployedAt}
            </span>
          </div>
        </div>

        {/* Toggle */}
        <button
          data-testid="button-manage-toggle"
          onClick={handleToggle}
          disabled={statusMutation.isPending}
          className={`relative h-[24px] w-[40px] flex-shrink-0 transition-all rounded-[100px] ${statusMutation.isPending ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <div className={`absolute left-[2px] top-[2px] h-[20px] w-[36px] rounded-[100px] transition-colors ${isActive ? "bg-[#123509]" : "bg-[#222737]"}`} />
          <div className={`absolute top-[4px] size-[16px] rounded-[100px] transition-all ${isActive ? "bg-[#42bf23] left-[20px]" : "bg-[#06070a] left-[4px]"}`} />
        </button>
      </div>

      {/* ── Main scroll area ── */}
      <ScrollArea className="flex-1">
        <div className="p-5 flex flex-col gap-5">

          {/* ── Stats row ── */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total Earnings", value: agent.earnings, green: agent.earnings.startsWith("+") },
              { label: "Total Actions", value: agent.trades.toLocaleString(), green: false },
              { label: "Success Rate", value: agent.successRate, green: false },
            ].map((s) => (
              <div key={s.label} className="bg-[#0a0c10] rounded-[12px] p-4 border border-[#1d2132] flex flex-col gap-1">
                <span className="[font-family:'Gilroy',sans-serif] text-[#6c779d] text-[12px] leading-[14px]">
                  {s.label}
                </span>
                <span className={`[font-family:'Gilroy',sans-serif] font-semibold text-[18px] leading-[22px] ${s.green ? "text-[#42bf23]" : "text-white"}`}>
                  {s.value}
                </span>
              </div>
            ))}
          </div>

          {/* ── Reputation Ranking ── */}
          {reputation && (() => {
            const tc = TIER_CONFIG[reputation.tier];
            const tier = reputation.tier;
            const subtitle =
              tier === "New"
                ? reputation.ageLabel ? `${reputation.ageLabel} · building reputation` : "Newly registered · building reputation"
                : tier === "Unranked"
                ? `${reputation.validationCount} on-chain validations · not enough activity to rank`
                : tier === "Caution"
                ? `${Math.abs(reputation.score)} negative score · ${reputation.validationCount} failed or disputed validations`
                : `Top ${100 - reputation.percentile}% · ${reputation.validationCount.toLocaleString()} on-chain validations`;
            const scoreLabel =
              tier === "Caution" ? `−${Math.abs(reputation.score)}`
              : tier === "New" || tier === "Unranked" ? "—"
              : reputation.score.toLocaleString();
            return (
              <div
                className={`rounded-[12px] p-4 border ${tc.bg} ${tc.border} flex items-center gap-4`}
                data-testid="card-reputation"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: `${tc.shield}18` }}>
                  <Shield size={20} color={tc.shield} strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className={`[font-family:'Gilroy',sans-serif] font-semibold text-[18px] leading-[22px] ${tc.text}`}>
                      {tier}
                    </span>
                    {reputation.rankLabel !== "—" && tier !== "New" && tier !== "Unranked" && tier !== "Caution" && (
                      <span className="[font-family:'Gilroy',sans-serif] text-[13px] text-[#6c779d]">
                        Rank {reputation.rankLabel}
                      </span>
                    )}
                    {tier === "Caution" && (
                      <span className="[font-family:'Gilroy',sans-serif] text-[11px] px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(210,3,68,0.15)", color: "#d20344" }}>
                        Under review
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="[font-family:'Gilroy',sans-serif] text-[11px] text-[#6c779d]">
                      {subtitle}
                    </span>
                    {tier !== "New" && tier !== "Unranked" && reputation.totalVolumeUsd > 0 && (
                      <span className="[font-family:'Gilroy',sans-serif] text-[11px] text-[#414965]">
                        ${reputation.totalVolumeUsd.toLocaleString()} lifetime volume
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className={`[font-family:'Gilroy',sans-serif] font-semibold text-[15px] ${tc.text}`}>
                    {scoreLabel}
                  </div>
                  <div className="[font-family:'Gilroy',sans-serif] text-[10px] text-[#414965] uppercase tracking-wide mt-0.5">
                    Rep Score
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Description ── */}
          <div className="bg-[#0a0c10] rounded-[12px] p-4 border border-[#1d2132]">
            <span className="[font-family:'Gilroy',sans-serif] font-semibold text-white text-sm block mb-2">
              About this agent
            </span>
            <p className="[font-family:'Gilroy',sans-serif] text-[#a8b9f4] text-[13px] leading-[20px]">
              {agent.description}
            </p>
            <div className="mt-3 pt-3 border-t border-[#1d2132] grid grid-cols-3 gap-3">
              <div>
                <span className="text-[11px] text-[#6c779d] [font-family:'Gilroy',sans-serif] block">Wallet</span>
                <span className="text-xs text-[#a8b9f4] [font-family:'Gilroy',sans-serif]">{agent.walletAddress}</span>
              </div>
              <div>
                <span className="text-[11px] text-[#6c779d] [font-family:'Gilroy',sans-serif] block">Category</span>
                <span className="text-xs text-[#a8b9f4] [font-family:'Gilroy',sans-serif]">{agent.category}</span>
              </div>
              <div>
                <span className="text-[11px] text-[#6c779d] [font-family:'Gilroy',sans-serif] block">Last Active</span>
                <span className="text-xs text-[#a8b9f4] [font-family:'Gilroy',sans-serif]">{agent.lastActive}</span>
              </div>
            </div>
          </div>

          {/* ── Rules ── */}
          <div className="bg-[#0a0c10] rounded-[12px] border border-[#1d2132] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1d2132]">
              <span className="[font-family:'Gilroy',sans-serif] font-semibold text-white text-sm">
                Agent Rules
              </span>
              <span className="text-[11px] text-[#6c779d] [font-family:'Gilroy',sans-serif]">
                Click a rule to edit
              </span>
            </div>

            <div className="flex flex-col divide-y divide-[#1d2132]">
              {rules.map((rule, idx) => (
                <div key={rule.id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#1d2132] flex items-center justify-center text-[10px] [font-family:'Gilroy',sans-serif] text-[#6c779d] mt-0.5">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] text-[#6c779d] [font-family:'Gilroy',sans-serif] block mb-1 uppercase tracking-wide">
                        {rule.label}
                      </span>
                      {editingRuleId === rule.id ? (
                        <div className="flex flex-col gap-2">
                          <textarea
                            data-testid={`input-rule-${rule.id}`}
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            rows={2}
                            className="w-full bg-[#11141b] border border-[#42bf23]/30 rounded-[8px] px-3 py-2 text-[13px] text-white [font-family:'Gilroy',sans-serif] outline-none resize-none focus:border-[#42bf23]/60 transition-colors"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button
                              data-testid={`button-save-rule-${rule.id}`}
                              onClick={() => commitEdit(rule.id)}
                              className="px-3 py-1 bg-[#123509] border border-[rgba(66,191,35,0.2)] rounded-full text-[#42bf23] text-[11px] [font-family:'Gilroy',sans-serif] hover:bg-[#1a4a0d] transition-colors"
                            >
                              Save rule
                            </button>
                            <button
                              onClick={() => setEditingRuleId(null)}
                              className="px-3 py-1 bg-[#1d2132] rounded-full text-[#6c779d] text-[11px] [font-family:'Gilroy',sans-serif] hover:text-white transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          data-testid={`button-edit-rule-${rule.id}`}
                          onClick={() => startEdit(rule)}
                          className="text-left w-full text-[13px] text-[#a8b9f4] [font-family:'Gilroy',sans-serif] leading-[18px] hover:text-white transition-colors group"
                        >
                          {rule.value}
                          <span className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-[#6c779d]">
                            ✎ edit
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Configuration ── */}
          <div className="bg-[#0a0c10] rounded-[12px] border border-[#1d2132] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1d2132]">
              <span className="[font-family:'Gilroy',sans-serif] font-semibold text-white text-sm">
                Configuration
              </span>
            </div>
            <div className="p-4 flex flex-col gap-4">

              {/* Budget */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] text-[#6c779d] [font-family:'Gilroy',sans-serif] uppercase tracking-wide">
                  Budget / Spend Limit
                </label>
                <input
                  data-testid="input-budget"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="w-full bg-[#11141b] border border-[#1d2132] focus:border-[#42bf23]/40 rounded-[8px] px-3 py-2.5 text-[13px] text-white [font-family:'Gilroy',sans-serif] outline-none transition-colors"
                />
              </div>

              {/* Schedule */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] text-[#6c779d] [font-family:'Gilroy',sans-serif] uppercase tracking-wide">
                  Execution Schedule
                </label>
                <input
                  data-testid="input-schedule"
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                  className="w-full bg-[#11141b] border border-[#1d2132] focus:border-[#42bf23]/40 rounded-[8px] px-3 py-2.5 text-[13px] text-white [font-family:'Gilroy',sans-serif] outline-none transition-colors"
                />
              </div>

              {/* Risk level */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] text-[#6c779d] [font-family:'Gilroy',sans-serif] uppercase tracking-wide">
                  Risk Level
                </label>
                <div className="flex gap-2">
                  {(["low", "medium", "high"] as const).map((level) => {
                    const c = riskColors[level];
                    const active = riskLevel === level;
                    return (
                      <button
                        key={level}
                        data-testid={`button-risk-${level}`}
                        onClick={() => setRiskLevel(level)}
                        className={`flex-1 py-2 rounded-[8px] text-[12px] [font-family:'Gilroy',sans-serif] border capitalize transition-all ${
                          active
                            ? `${c.bg} ${c.border} ${c.text}`
                            : "bg-[#11141b] border-[#1d2132] text-[#6c779d] hover:text-white"
                        }`}
                      >
                        {level}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Save button */}
              <button
                data-testid="button-save-config"
                onClick={handleSave}
                className={`w-full py-3 rounded-[10px] text-sm [font-family:'Gilroy',sans-serif] font-semibold transition-all ${
                  saved
                    ? "bg-[#123509] text-[#42bf23]"
                    : "bg-[#4a2300] text-[#ff9500] hover:bg-[#5a2d00]"
                }`}
              >
                {saved ? "✓ Saved" : "Save Changes"}
              </button>
            </div>
          </div>

          {/* ── Activity log ── */}
          <div className="bg-[#0a0c10] rounded-[12px] border border-[#1d2132] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1d2132]">
              <span className="[font-family:'Gilroy',sans-serif] font-semibold text-white text-sm">
                Activity Log
              </span>
            </div>
            <div className="flex flex-col divide-y divide-[#1d2132]">
              {agent.activityLog.map((entry, i) => (
                <div key={i} className="flex gap-3 px-4 py-3">
                  <div className="flex-shrink-0 mt-1.5">
                    <span className={`block w-2 h-2 rounded-full ${logDots[entry.kind]}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className={`text-[12px] [font-family:'Gilroy',sans-serif] font-semibold ${logColors[entry.kind]}`}>
                        {entry.event}
                      </span>
                      <span className="text-[10px] text-[#6c779d] [font-family:'Gilroy',sans-serif] flex-shrink-0">
                        {entry.time}
                      </span>
                    </div>
                    <p className="text-[12px] text-[#a8b9f4] [font-family:'Gilroy',sans-serif] leading-[16px] mt-0.5">
                      {entry.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </ScrollArea>
    </div>
  );
};
