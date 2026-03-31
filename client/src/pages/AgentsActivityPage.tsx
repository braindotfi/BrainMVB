import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { agents, AgentStatus, AgentData } from "@/lib/agentsData";

/* ── Toggle switch matching Figma exactly ── */
const AgentToggle = ({
  active,
  onClick,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  disabled: boolean;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    data-testid="button-agent-toggle"
    className={`relative h-[24px] w-[40px] flex-shrink-0 transition-all ${
      active ? "rounded-[100px]" : "rounded-[12px]"
    } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
  >
    {/* Track */}
    <div
      className={`absolute left-[2px] top-[2px] h-[20px] w-[36px] rounded-[100px] transition-colors ${
        active ? "bg-[#123509]" : "bg-[#222737]"
      }`}
    />
    {/* Dot */}
    <div
      className={`absolute top-[4px] size-[16px] rounded-[100px] transition-all ${
        active ? "bg-[#42bf23] left-[20px]" : "bg-[#06070a] left-[4px]"
      }`}
    />
  </button>
);

/* ── Agent Card ── */
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
  const earningsPositive = agent.earnings.startsWith("+");

  return (
    <div
      data-testid={`card-agent-${agent.id}`}
      className="flex flex-col gap-[16px] p-[16px] border border-[#1d2132] rounded-[16px] transition-colors hover:border-[#2d3450]"
    >
      {/* ── Header row ── */}
      <div className="flex gap-[8px] h-[48px] items-center">
        {/* Avatar */}
        <div className="overflow-hidden relative flex-shrink-0 size-[48px] rounded-[10px]">
          <img
            src={agent.avatar}
            alt={agent.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>

        {/* Name + toggle row + type tag */}
        <div className="flex flex-col gap-[4px] items-start justify-center flex-1 min-w-0">
          {/* Name row: name text + toggle */}
          <div className="flex gap-[16px] items-center w-full">
            <span className="flex-1 min-w-0 [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[16px] text-white leading-[20px] truncate">
              {agent.name}
            </span>
            <AgentToggle
              active={isActive}
              onClick={onToggle}
              disabled={isUpdating}
            />
          </div>

          {/* Type tag */}
          <div className="flex items-center">
            <span className="bg-[#123509] border border-[rgba(66,191,35,0.2)] px-[8px] py-[3px] rounded-[22px] [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#42bf23] text-[11px] leading-[14px] whitespace-nowrap">
              {agent.type}
            </span>
          </div>
        </div>
      </div>

      {/* ── Description ── */}
      <p className="[font-family:'Gilroy-Medium',Helvetica] text-[#a8b9f4] text-[14px] leading-[16px] overflow-hidden w-full" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
        {agent.description}
      </p>

      {/* ── Stats box ── */}
      <div className="bg-[#0a0c10] flex gap-[6px] items-center p-[8px] rounded-[8px] w-full">
        {/* Earnings */}
        <div className="flex flex-col gap-[3px] items-center justify-center flex-1">
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#6c779d] text-[13px] leading-[14px] whitespace-nowrap">
            Earnings
          </span>
          <span
            className={`[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[16px] leading-[20px] whitespace-nowrap ${
              earningsPositive ? "text-[#42bf23]" : "text-[#a8b9f4]"
            }`}
          >
            {agent.earnings}
          </span>
        </div>

        {/* Divider */}
        <div className="w-px self-stretch bg-[#1d2132] flex-shrink-0" />

        {/* Actions */}
        <div className="flex flex-col gap-[3px] items-center justify-center flex-1">
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#6c779d] text-[13px] leading-[14px] whitespace-nowrap">
            Actions
          </span>
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#a8b9f4] text-[16px] leading-[20px] whitespace-nowrap">
            {agent.trades.toLocaleString()}
          </span>
        </div>

        {/* Divider */}
        <div className="w-px self-stretch bg-[#1d2132] flex-shrink-0" />

        {/* Success */}
        <div className="flex flex-col gap-[3px] items-center justify-center flex-1">
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#6c779d] text-[13px] leading-[14px] whitespace-nowrap">
            Success
          </span>
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#a8b9f4] text-[16px] leading-[20px] whitespace-nowrap">
            {agent.successRate}
          </span>
        </div>
      </div>

      {/* ── Horizontal divider ── */}
      <div className="h-px w-full bg-[#1d2132] flex-shrink-0" />

      {/* ── Footer: Last Active + Edit button ── */}
      <div className="flex gap-[16px] items-center w-full">
        {/* Last Active */}
        <div className="flex flex-col gap-[2px] items-start justify-center flex-1 min-w-0">
          <span className="[font-family:'Gilroy-Medium',Helvetica] text-[#6c779d] text-[12px] leading-[14px] whitespace-nowrap">
            Last Active
          </span>
          <span className="[font-family:'Gilroy-Medium',Helvetica] text-[#a8b9f4] text-[14px] leading-[16px] whitespace-nowrap">
            {agent.lastActive}
          </span>
        </div>

        {/* Edit button */}
        <button
          data-testid={`button-edit-agent-${agent.id}`}
          onClick={onEdit}
          className="bg-[#4a2300] flex gap-[4px] items-center justify-center px-[12px] py-[8px] rounded-[100px] flex-shrink-0 hover:bg-[#5a2d00] transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M11.333 2a1.886 1.886 0 0 1 2.667 2.667L5.333 13.333l-3.666.667.666-3.667L11.333 2Z" stroke="#ff9500" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#ff9500] text-[12px] leading-[16px] whitespace-nowrap">
            Edit
          </span>
        </button>
      </div>
    </div>
  );
};

export const AgentsActivityPage = (): JSX.Element => {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"all" | "active" | "inactive">("all");
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

  const filtered = agents.filter((a) => {
    const status = agentStatuses[a.id];
    const matchesTab =
      activeTab === "active" ? status === "active" :
      activeTab === "inactive" ? status === "inactive" || status === "paused" :
      true;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.type.toLowerCase().includes(q);
    return matchesTab && matchesSearch;
  });

  const allCount = agents.length;
  const activeCount = agents.filter((a) => agentStatuses[a.id] === "active").length;
  const inactiveCount = agents.filter((a) => agentStatuses[a.id] !== "active").length;

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
        <div className="flex-1 flex items-center justify-center">
          {searchOpen ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-[#06070a] border border-[#1d2131] focus-within:border-[#414965] rounded-full transition-colors w-full max-w-[320px]">
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
                className="bg-transparent text-white text-sm [font-family:'Gilroy-Medium',Helvetica] placeholder-[#414965] outline-none flex-1"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="text-[#414965] hover:text-white transition-colors flex-shrink-0">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
                </button>
              )}
            </div>
          ) : (
            <div className="inline-flex items-center bg-[#06070a] rounded-[400px] p-[2px] gap-[2px]">
              {([
                { key: "all",      label: "All",      count: allCount      },
                { key: "active",   label: "Active",   count: activeCount   },
                { key: "inactive", label: "Inactive", count: inactiveCount },
              ] as const).map(({ key, label, count }) => {
                const isActive = activeTab === key;
                return (
                  <button
                    key={key}
                    data-testid={`tab-agents-${key}`}
                    onClick={() => setActiveTab(key)}
                    className={`flex items-center gap-[4px] px-[16px] py-[6px] rounded-[100px] text-[14px] [font-family:'Gilroy-SemiBold',Helvetica] font-semibold transition-all ${
                      isActive ? "bg-[#350011] text-[#d20344]" : "bg-[#06070a] text-[#414965] hover:text-white"
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

        {/* Search toggle */}
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

      {/* ── Agent grid ── */}
      <ScrollArea className="flex-1">
        <div className="px-[16px] pb-[16px] flex flex-wrap gap-[16px] content-start">
          {filtered.map((agent) => (
            <div key={agent.id} className="w-full xl:w-[calc(50%-8px)]">
              <AgentCard
                agent={agent}
                currentStatus={agentStatuses[agent.id]}
                onToggle={() => handleToggle(agent.id)}
                isUpdating={updatingId === agent.id}
                onEdit={() => navigate(`/manage/${agent.id}`)}
              />
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};
