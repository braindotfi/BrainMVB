import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { agents, AgentStatus, AgentData } from "@/lib/agentsData";

/* ── Agent Card matching Figma 2954-28819 exactly ── */
const AgentCard = ({
  agent,
  currentStatus,
  onToggle,
  isUpdating,
  onEdit,
}: {
  agent: AgentData;
  currentStatus: AgentStatus;
  onToggle: () => void;
  isUpdating: boolean;
  onEdit: () => void;
}) => {
  const isActive = currentStatus === "active";

  return (
    <div
      data-testid={`card-agent-${agent.id}`}
      className="flex flex-col gap-[16px] p-[16px] border border-[#1d2132] rounded-[16px] transition-colors hover:border-[#2d3450]"
    >
      {/* ── Header: avatar + name block ── */}
      <div className="flex gap-[8px] items-center h-[48px]">
        {/* Avatar 48×48 */}
        <div className="overflow-hidden relative flex-shrink-0 size-[48px] rounded-[10px]">
          <img
            src={agent.avatar}
            alt={agent.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>

        {/* Name + tag block */}
        <div className="flex flex-1 min-w-0 items-center">
          <div className="flex flex-1 min-w-0 flex-col items-start">
            {/* Row 1: agent name + "Last Active" label */}
            <div className="flex gap-[4px] h-[20px] items-center w-full">
              <p className="flex-1 min-w-0 [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[16px] text-white leading-[20px] truncate">
                {agent.name}
              </p>
              <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#6c779d] text-[12px] leading-[20px] whitespace-nowrap flex-shrink-0">
                Last Active
              </span>
            </div>

            {/* Row 2: type tag (purple) + last active time */}
            <div className="flex items-center justify-between w-full">
              <div
                className="flex items-center justify-center px-[8px] py-[3px] rounded-[22px] flex-shrink-0"
                style={{
                  background: "#240757",
                  border: "1px solid rgba(118,49,238,0.2)",
                }}
              >
                <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#7631ee] text-[11px] leading-[14px] whitespace-nowrap">
                  {agent.type}
                </span>
              </div>
              <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#a8b9f4] text-[14px] leading-[20px] whitespace-nowrap">
                {agent.lastActive}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Description ── */}
      <p
        className="[font-family:'Gilroy-Medium',Helvetica] text-[#a8b9f4] text-[14px] leading-[16px] overflow-hidden w-full"
        style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}
      >
        {agent.description}
      </p>

      {/* ── Stats box ── */}
      <div className="bg-[#0a0c10] flex gap-[6px] items-center p-[8px] rounded-[8px] w-full">
        {/* Earnings */}
        <div className="flex flex-col gap-[3px] items-center justify-center flex-1 min-w-0">
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#6c779d] text-[13px] leading-[14px] whitespace-nowrap">
            Earnings
          </span>
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#a8b9f4] text-[16px] leading-[20px] whitespace-nowrap">
            {agent.earnings}
          </span>
        </div>
        <div className="w-px self-stretch bg-[#1d2132] flex-shrink-0" />
        {/* Actions */}
        <div className="flex flex-col gap-[3px] items-center justify-center flex-1 min-w-0">
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#6c779d] text-[13px] leading-[14px] whitespace-nowrap">
            Actions
          </span>
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#a8b9f4] text-[16px] leading-[20px] whitespace-nowrap">
            {agent.trades.toLocaleString()}
          </span>
        </div>
        <div className="w-px self-stretch bg-[#1d2132] flex-shrink-0" />
        {/* Success */}
        <div className="flex flex-col gap-[3px] items-center justify-center flex-1 min-w-0">
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#6c779d] text-[13px] leading-[14px] whitespace-nowrap">
            Success
          </span>
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#42bf23] text-[16px] leading-[20px] whitespace-nowrap">
            {agent.successRate}
          </span>
        </div>
      </div>

      {/* ── Footer: Start/Stop + Edit buttons ── */}
      <div className="flex gap-[8px] items-center h-[32px]">
        {/* Start / Stop button — full width, flex-1 */}
        {isActive ? (
          <button
            data-testid={`button-stop-agent-${agent.id}`}
            onClick={onToggle}
            disabled={isUpdating}
            className="flex flex-1 gap-[4px] items-center justify-center px-[12px] py-[8px] rounded-[100px] transition-colors hover:opacity-80 disabled:opacity-50"
            style={{ background: "#350011" }}
          >
            {/* Red square stop icon */}
            <div className="w-[12px] h-[12px] rounded-[2px] flex-shrink-0" style={{ background: "#d20344" }} />
            <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#d20344] text-[12px] leading-[16px] whitespace-nowrap">
              Stop
            </span>
          </button>
        ) : (
          <button
            data-testid={`button-start-agent-${agent.id}`}
            onClick={onToggle}
            disabled={isUpdating}
            className="flex flex-1 gap-[4px] items-center justify-center px-[12px] py-[8px] rounded-[100px] transition-colors hover:opacity-80 disabled:opacity-50"
            style={{ background: "#123509" }}
          >
            {/* Green play icon */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
              <path d="M5.5 3.5L12.5 8L5.5 12.5V3.5Z" fill="#42bf23" />
            </svg>
            <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#42bf23] text-[12px] leading-[16px] whitespace-nowrap">
              Start
            </span>
          </button>
        )}

        {/* Edit button — full width, flex-1 */}
        <button
          data-testid={`button-edit-agent-${agent.id}`}
          onClick={onEdit}
          className="flex flex-1 gap-[4px] items-center justify-center px-[12px] py-[8px] rounded-[100px] transition-colors hover:opacity-80"
          style={{ background: "#4a2300" }}
        >
          {/* Pencil icon */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
            <path
              d="M11.333 2a1.886 1.886 0 0 1 2.667 2.667L5.167 13.5l-3.5.833.833-3.5L11.333 2Z"
              stroke="#ff9500"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#ff9500] text-[12px] leading-[16px] whitespace-nowrap">
            Edit
          </span>
        </button>
      </div>
    </div>
  );
};

/* ── Main page ── */
type TabKey = "all" | "my-agents" | "active" | "inactive";

export const AgentsActivityPage = (): JSX.Element => {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus>>(
    () => Object.fromEntries(agents.map((a) => [a.id, a.status]))
  );
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AgentStatus }) => {
      const res = await fetch(`/api/agents/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update agent status");
      return res.json() as Promise<{ agentId: string; status: AgentStatus }>;
    },
    onSettled: () => setUpdatingId(null),
  });

  const handleToggle = (agentId: string) => {
    const current = agentStatuses[agentId];
    const next: AgentStatus = current === "active" ? "inactive" : "active";
    setAgentStatuses((prev) => ({ ...prev, [agentId]: next }));
    setUpdatingId(agentId);
    statusMutation.mutate({ id: agentId, status: next });
  };

  const allCount      = agents.length;
  const myCount       = agents.filter((a) => a.createdByUser).length;
  const activeCount   = agents.filter((a) => agentStatuses[a.id] === "active").length;
  const inactiveCount = agents.filter((a) => agentStatuses[a.id] !== "active").length;

  const filtered = agents.filter((a) => {
    const status = agentStatuses[a.id];
    const matchesTab =
      activeTab === "my-agents" ? !!a.createdByUser :
      activeTab === "active"    ? status === "active" :
      activeTab === "inactive"  ? status !== "active" :
      true;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.type.toLowerCase().includes(q);
    return matchesTab && matchesSearch;
  });

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "all",       label: "All",       count: allCount      },
    { key: "my-agents", label: "My Agents", count: myCount       },
    { key: "active",    label: "Active",    count: activeCount   },
    { key: "inactive",  label: "Inactive",  count: inactiveCount },
  ];

  const handleKillswitch = () => {
    const activeIds = agents.filter((a) => agentStatuses[a.id] === "active").map((a) => a.id);
    if (activeIds.length === 0) return;
    setAgentStatuses((prev) => {
      const next = { ...prev };
      activeIds.forEach((id) => { next[id] = "inactive"; });
      return next;
    });
    activeIds.forEach((id) => statusMutation.mutate({ id, status: "inactive" }));
  };

  const handleSearchToggle = () => {
    if (searchOpen) {
      setSearchOpen(false);
      setSearchQuery("");
    } else {
      setSearchOpen(true);
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#11141b] rounded-[16px] border border-solid border-[#1d2132] overflow-hidden">

      {/* ── Header: tabs + search ── */}
      <div className="flex items-center gap-3 px-4 py-4 flex-shrink-0">
        {/* Killswitch — stops all active agents */}
        <button
          data-testid="button-killswitch"
          onClick={handleKillswitch}
          disabled={activeCount === 0}
          className="flex items-center gap-[4px] px-[12px] py-[8px] rounded-[100px] flex-shrink-0 transition-opacity hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ background: "#350011" }}
          title={activeCount === 0 ? "No active agents" : `Stop all ${activeCount} active agent${activeCount !== 1 ? "s" : ""}`}
        >
          <div className="relative shrink-0 size-[16px] flex items-center justify-center">
            <div className="w-[12px] h-[12px] rounded-[2px] bg-[#d20344]" />
          </div>
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#d20344] text-[12px] leading-[16px] whitespace-nowrap">
            Stop All
          </span>
        </button>

        <div className="flex-1 flex items-center justify-center">
          {searchOpen ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-[#06070a] border border-[#1d2131] focus-within:border-[#414965] rounded-full transition-colors w-full max-w-[360px]">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[#414965] flex-shrink-0">
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search agents..."
                data-testid="input-search-agents"
                className="bg-transparent text-white text-sm [font-family:'Gilroy-Medium',Helvetica] placeholder-[#414965] outline-none flex-1"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="text-[#414965] hover:text-white transition-colors flex-shrink-0">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          ) : (
            /* ── Tab bar ── */
            <div className="inline-flex items-center bg-[#06070a] rounded-[400px] p-[2px] gap-[2px]">
              {tabs.map(({ key, label, count }) => {
                const isActive = activeTab === key;
                return (
                  <button
                    key={key}
                    data-testid={`tab-agents-${key}`}
                    onClick={() => setActiveTab(key)}
                    className={`flex items-center gap-[4px] px-[16px] py-[6px] rounded-[100px] text-[14px] [font-family:'Gilroy-SemiBold',Helvetica] font-semibold transition-all whitespace-nowrap ${
                      isActive
                        ? "bg-[#350011] text-[#d20344]"
                        : "bg-[#06070a] text-[#414965] hover:text-white"
                    }`}
                  >
                    {label}
                    <div
                      className={`flex items-center justify-center p-[2px] rounded-[4px] ${
                        isActive ? "bg-[#d20344]" : "bg-[#222737]"
                      }`}
                    >
                      <span
                        className={`text-[12px] [font-family:'Gilroy-SemiBold',Helvetica] font-semibold leading-[12px] ${
                          isActive ? "text-[#350011]" : "text-[#6c779d]"
                        }`}
                      >
                        {count}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Search icon toggle */}
        <button
          data-testid="button-search-toggle"
          onClick={handleSearchToggle}
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
            searchOpen
              ? "bg-[#d20344] text-white"
              : "bg-[#06070a] text-[#414965] hover:text-white"
          }`}
        >
          {searchOpen ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>

      {/* ── Agent card grid ── */}
      <ScrollArea className="flex-1">
        <div className="px-[16px] pb-[16px] flex flex-wrap gap-[16px] content-start">
          {filtered.length === 0 ? (
            <div className="w-full flex flex-col items-center justify-center py-16 gap-3">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <rect x="8" y="8" width="24" height="24" rx="4" stroke="#1d2132" strokeWidth="2" />
                <path d="M16 20h8M20 16v8" stroke="#1d2132" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-[#414965] text-[14px]">
                No agents found
              </p>
            </div>
          ) : (
            filtered.map((agent) => (
              <div key={agent.id} className="w-full xl:w-[calc(50%-8px)]">
                <AgentCard
                  agent={agent}
                  currentStatus={agentStatuses[agent.id]}
                  onToggle={() => handleToggle(agent.id)}
                  isUpdating={updatingId === agent.id}
                  onEdit={() => navigate(`/agent/${agent.id}`)}
                />
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
