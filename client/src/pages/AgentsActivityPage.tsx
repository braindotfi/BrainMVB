import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { agents, AgentStatus, AgentData } from "@/lib/agentsData";

type RepTier = "Legendary" | "Diamond" | "Gold" | "Silver" | "Bronze" | "New" | "Unranked" | "Caution";

/* Figma node 3372:33198 — Badges component asset URLs */
const BADGE_ICON: Record<RepTier, { url: string; flip?: boolean }> = {
  Legendary: { url: "https://www.figma.com/api/mcp/asset/0cd3ea99-ddcb-48a6-bfc9-8f6063ed006c" },
  Diamond:   { url: "https://www.figma.com/api/mcp/asset/0cd3ea99-ddcb-48a6-bfc9-8f6063ed006c" },
  Gold:      { url: "https://www.figma.com/api/mcp/asset/7b86d198-9ed1-4d56-8634-b20ec3cd0617" },
  Silver:    { url: "https://www.figma.com/api/mcp/asset/d23d250b-3830-4de9-a673-69f89e77eb24" },
  Bronze:    { url: "https://www.figma.com/api/mcp/asset/c8f31b86-e328-4fb3-b89d-43cdb0f98c89" },
  New:       { url: "https://www.figma.com/api/mcp/asset/149a8d54-d2ee-4c0f-91b6-fad1c96cc23e" },
  Unranked:  { url: "https://www.figma.com/api/mcp/asset/5d3b18d5-4967-4d8a-901a-40306401f848", flip: true },
  Caution:   { url: "https://www.figma.com/api/mcp/asset/bc612cfb-4c95-4e26-862e-60685e6c3695" },
};
const BADGE_STYLE: Record<RepTier, { bg: string; textGrad?: string; textSolid?: string }> = {
  Legendary: { bg: "linear-gradient(107deg, rgb(80,30,180) 0%, rgb(110,55,195) 100%)",       textGrad: "linear-gradient(105deg, #d4b4ff 0%, #9d5cf5 100%)" },
  Diamond:   { bg: "linear-gradient(107deg, rgb(46,31,113) 0%, rgb(67,50,118) 100%)",         textGrad: "linear-gradient(105deg, rgb(176,150,255) 0%, rgb(127,113,255) 100%)" },
  Gold:      { bg: "linear-gradient(to right, #352502, #614b12)",                             textGrad: "linear-gradient(100deg, rgb(255,221,134) 0%, rgb(174,126,23) 100%)" },
  Silver:    { bg: "linear-gradient(to right, #2b363b, #3f4e55)",                             textGrad: "linear-gradient(101deg, rgb(220,229,232) 0%, rgb(141,158,166) 100%)" },
  Bronze:    { bg: "linear-gradient(to right, #2d220e, #42321a)",                             textGrad: "linear-gradient(101deg, rgb(192,159,107) 0%, rgb(104,78,38) 100%)" },
  New:       { bg: "linear-gradient(102deg, rgb(0,55,44) 0%, rgb(11,75,62) 100%)",            textGrad: "linear-gradient(98deg, rgb(137,255,232) 0%, rgb(0,212,170) 100%)" },
  Unranked:  { bg: "linear-gradient(to right, #21283b, #363d56)",                             textGrad: "linear-gradient(41deg, rgb(151,163,204) 23%, rgb(108,119,157) 76%)" },
  Caution:   { bg: "#350011",                                                                  textSolid: "#d20344" },
};

/* Compact reputation pill — matches Figma Badges component (node 3638:37529+) */
const RepBadge = ({ tier, agentId }: { tier: RepTier; agentId: string }) => {
  const icon = BADGE_ICON[tier];
  const style = BADGE_STYLE[tier];
  return (
    <span
      className="inline-flex items-center gap-[2px] px-[6px] py-[2px] rounded-[40px] flex-shrink-0"
      style={{ background: style.bg }}
      data-testid={`badge-reputation-${agentId}`}
    >
      <span className={`w-[16px] h-[16px] flex-shrink-0 flex items-center justify-center${icon.flip ? " -scale-y-100" : ""}`}>
        <img src={icon.url} alt="" className="w-full h-full object-contain" />
      </span>
      <span
        className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[14px] whitespace-nowrap"
        style={style.textGrad
          ? { backgroundImage: style.textGrad, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }
          : { color: style.textSolid }}
      >
        {tier}
      </span>
    </span>
  );
};

/* ── Per-agent spend cap mock data ── */
const SPEND_DATA: Record<string, { cap: string; unit: string; pct: number }> = {
  alphaflow:     { cap: "$5k",    unit: "/day", pct: 62 },
  yieldpilot:    { cap: "$2.5k",  unit: "/day", pct: 18 },
  risksentinel:  { cap: "$10k",   unit: "/day", pct: 8  },
  signalseer:    { cap: "$500",   unit: "/mo",  pct: 34 },
  inboxzero:     { cap: "$50",    unit: "/mo",  pct: 0  },
  trendradar:    { cap: "$1k",    unit: "/day", pct: 45 },
  taskforgepro:  { cap: "$5k",    unit: "/day", pct: 71 },
  opscommander:  { cap: "$3k",    unit: "/day", pct: 29 },
};

/* ── Color logic based on % used ── */
const usedColor = (pct: number) => {
  if (pct >= 90) return "#d20344";
  if (pct >= 70) return "#ff9500";
  return "#42bf23";
};

/* ── Agent Card — Figma 3374-34051 ── */
const AgentCard = ({
  agent,
  spend,
  currentStatus,
  onToggle,
  isUpdating,
  onOpen,
}: {
  agent: AgentData;
  spend: { cap: string; unit: string; pct: number };
  currentStatus: AgentStatus;
  onToggle: () => void;
  isUpdating: boolean;
  onOpen: () => void;
}) => {
  const isActive = currentStatus === "active";
  const barColor = usedColor(spend.pct);

  const { data: rep } = useQuery<{ tier: RepTier; rankLabel: string }>({
    queryKey: ["/api/agents", agent.id, "reputation"],
    queryFn: () => fetch(`/api/agents/${agent.id}/reputation`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div
      data-testid={`card-agent-${agent.id}`}
      className="bg-[#0a0c10] flex flex-col gap-[8px] p-[16px] rounded-[16px] cursor-pointer transition-opacity hover:opacity-90 select-none"
      onClick={onOpen}
    >
      {/* ── Header: avatar + name/tag + stop/start btn ── */}
      <div className="flex gap-[8px] h-[48px] items-center">
        {/* Avatar 48×48 */}
        <div className="overflow-hidden relative flex-shrink-0 size-[48px] rounded-[10px]">
          <img
            src={agent.avatar}
            alt={agent.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>

        {/* Name + type tag */}
        <div className="flex flex-1 min-w-0 flex-col gap-[4px]">
          <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-white text-[16px] leading-[20px] truncate">
            {agent.name}
          </span>
          <div className="flex items-center gap-[4px] flex-shrink-0">
            <div className="inline-flex items-center justify-center px-[8px] py-[3px] rounded-[22px] flex-shrink-0"
              style={{ background: "#222737", border: "1px solid rgba(108,119,157,0.2)" }}>
              <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[11px] leading-[14px] whitespace-nowrap">
                {agent.type}
              </span>
            </div>
            {rep && <RepBadge tier={rep.tier} agentId={agent.id} />}
          </div>
        </div>

        {/* Stop / Start button — right side of header */}
        {isActive ? (
          <button
            data-testid={`button-stop-agent-${agent.id}`}
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            disabled={isUpdating}
            className="flex gap-[4px] items-center justify-center px-[12px] py-[8px] rounded-[100px] flex-shrink-0 transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: "#350011" }}
          >
            <div className="w-[12px] h-[12px] rounded-[2px] flex-shrink-0" style={{ background: "#d20344" }} />
            <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#d20344] text-[12px] leading-[16px] whitespace-nowrap">
              Stop
            </span>
          </button>
        ) : (
          <button
            data-testid={`button-start-agent-${agent.id}`}
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            disabled={isUpdating}
            className="flex gap-[4px] items-center justify-center px-[12px] py-[8px] rounded-[100px] flex-shrink-0 transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: "#123509" }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="flex-shrink-0">
              <path d="M3 2L10 6L3 10V2Z" fill="#42bf23" />
            </svg>
            <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#42bf23] text-[12px] leading-[16px] whitespace-nowrap">
              Start
            </span>
          </button>
        )}
      </div>

      {/* ── Cap / Used + progress bar ── */}
      <div className="flex flex-col gap-[8px]">
        {/* Labels + values row */}
        <div className="flex gap-[16px]">
          {/* Cap (left) */}
          <div className="flex flex-1 flex-col items-start min-w-0">
            <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[13px] leading-[16px]">
              Cap
            </span>
            <p style={{ fontSize: 0, lineHeight: 0 }}>
              <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#a8b9f4] text-[16px] leading-[20px]">
                {spend.cap}
              </span>
              <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#a8b9f4] text-[12px] leading-[20px]">
                {spend.unit}
              </span>
            </p>
          </div>

          {/* Used (right, right-aligned) */}
          <div className="flex flex-1 flex-col items-end min-w-0">
            <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[13px] leading-[16px]">
              Used
            </span>
            <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[16px] leading-[20px]"
              style={{ color: barColor }}>
              {spend.pct}%
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="relative h-[8px] w-full flex-shrink-0">
          <div className="absolute inset-0 rounded-[40px]" style={{ background: "#222737" }} />
          <div
            className="absolute left-0 top-0 h-full rounded-[40px] transition-all"
            style={{ width: `${spend.pct}%`, background: barColor }}
          />
        </div>
      </div>
    </div>
  );
};

/* ── Main page ── */
type TabKey = "all" | "my-agents" | "active" | "inactive";

export const AgentsActivityPage = (): JSX.Element => {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    const params = new URLSearchParams(searchString);
    const t = params.get("tab");
    return (t === "my-agents" || t === "active" || t === "inactive") ? t as TabKey : "all";
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const t = params.get("tab");
    if (t === "my-agents" || t === "active" || t === "inactive") {
      setActiveTab(t as TabKey);
    } else if (!t) {
      setActiveTab("all");
    }
  }, [searchString]);

  /* ── Fetch created agents from API ── */
  const { data: apiAgentsRaw } = useQuery<{ id: string; name: string; type: string; description: string; avatar: string; status: string; capitalAmount: number; capitalAsset: string; riskLevel: string; executionMode: string; allowedAssets: string[]; createdAt: string; createdByUser?: boolean }[]>({
    queryKey: ["/api/agents"],
    refetchOnWindowFocus: false,
  });

  const staticIds = new Set(agents.map((a) => a.id));
  const apiAgents: AgentData[] = (apiAgentsRaw ?? [])
    .filter((a) => !staticIds.has(a.id))
    .map((a) => ({
      id: a.id,
      name: a.name,
      ticker: "$" + a.name.toUpperCase().replace(/\s/g, "").slice(0, 8),
      description: a.description || `AI ${a.type} agent`,
      avatar: a.avatar || "/figmaAssets/avatars.svg",
      status: (a.status === "active" ? "active" : "inactive") as AgentStatus,
      type: a.type ? a.type.charAt(0).toUpperCase() + a.type.slice(1) : "Custom",
      earnings: "$0",
      trades: 0,
      successRate: "—",
      lastActive: "Just now",
      category: a.type || "custom",
      rules: [],
      budget: a.capitalAmount ? `$${a.capitalAmount.toLocaleString()} ${a.capitalAsset || "USDC"}` : "—",
      riskLevel: (a.riskLevel === "conservative" ? "low" : a.riskLevel === "aggressive" ? "high" : "medium") as "low" | "medium" | "high",
      schedule: a.executionMode || "automatic",
      walletAddress: "0x0000000000000000000000000000000000000000",
      deployedAt: a.createdAt ? new Date(a.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Just now",
      activityLog: [],
      createdByUser: true,
    }));

  const [deletedIds] = useState<Set<string>>(() => {
    try {
      return new Set<string>(JSON.parse(localStorage.getItem("brain-deleted-agents") || "[]"));
    } catch {
      return new Set<string>();
    }
  });

  const allAgents: AgentData[] = [...agents, ...apiAgents].filter((a) => !deletedIds.has(a.id));

  /* Build spend map including API agents (derive from capitalAmount) */
  const spendMap: Record<string, { cap: string; unit: string; pct: number }> = {
    ...SPEND_DATA,
    ...Object.fromEntries(
      apiAgents.map((a) => {
        const raw = apiAgentsRaw?.find((r) => r.id === a.id);
        const cap = raw?.capitalAmount
          ? raw.capitalAmount >= 1000
            ? `$${Math.round(raw.capitalAmount / 1000)}k`
            : `$${raw.capitalAmount}`
          : "$—";
        return [a.id, { cap, unit: "/day", pct: 0 }];
      })
    ),
  };

  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus>>(
    () => Object.fromEntries(allAgents.map((a) => [a.id, a.status]))
  );
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    setAgentStatuses((prev) => {
      const next: Record<string, AgentStatus> = {};
      allAgents.forEach((a) => {
        next[a.id] = prev[a.id] ?? a.status;
      });
      return next;
    });
  }, [apiAgentsRaw]);

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
    const fallback = allAgents.find((a) => a.id === agentId)?.status ?? "inactive";
    const current = agentStatuses[agentId] ?? fallback;
    const next: AgentStatus = current === "active" ? "inactive" : "active";
    setAgentStatuses((prev) => ({ ...prev, [agentId]: next }));
    setUpdatingId(agentId);
    statusMutation.mutate({ id: agentId, status: next });
  };

  const allCount      = allAgents.length;
  const myCount       = allAgents.filter((a) => a.createdByUser).length;
  const activeCount   = allAgents.filter((a) => (agentStatuses[a.id] ?? a.status) === "active").length;
  const inactiveCount = allAgents.filter((a) => (agentStatuses[a.id] ?? a.status) !== "active").length;

  const filtered = allAgents.filter((a) => {
    const status = agentStatuses[a.id] ?? a.status;
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
    const activeIds = allAgents.filter((a) => (agentStatuses[a.id] ?? a.status) === "active").map((a) => a.id);
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

      {/* ── Header nav bar — Figma 3372:33199 ── */}
      <div className="relative flex-shrink-0" style={{ height: "64px", background: "#11141b" }}>

        {/* Stop All button (left) */}
        <div className="absolute left-[16px] top-[16px]">
          <button
            data-testid="button-killswitch"
            onClick={handleKillswitch}
            disabled={activeCount === 0}
            className="flex items-center gap-[4px] px-[12px] py-[8px] rounded-[100px] transition-opacity hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ background: "#350011" }}
          >
            <div className="relative flex-shrink-0 size-[16px] flex items-center justify-center">
              <div className="w-[12px] h-[12px] rounded-[2px]" style={{ background: "#d20344" }} />
            </div>
            <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#d20344] text-[12px] leading-[16px] whitespace-nowrap">
              Stop All
            </span>
          </button>
        </div>

        {/* Tab bar (center) */}
        <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto">
            {searchOpen ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-full transition-colors"
                style={{ background: "#06070a", border: "1px solid #1d2132", width: "280px" }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0" style={{ color: "#414965" }}>
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
                  className="bg-transparent text-white text-[14px] [font-family:'Plus Jakarta Sans',Helvetica] placeholder-[#414965] outline-none flex-1"
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
              <div className="inline-flex items-center gap-[2px] p-[2px] rounded-[400px]" style={{ background: "#06070a" }}>
                {tabs.map(({ key, label, count }) => {
                  const isSel = activeTab === key;
                  return (
                    <button
                      key={key}
                      data-testid={`tab-agents-${key}`}
                      onClick={() => {
                        setActiveTab(key);
                        navigate(key === "all" ? "/agents" : `/agents?tab=${key}`, { replace: true });
                      }}
                      className="flex items-center gap-[4px] px-[16px] py-[6px] rounded-[100px] text-[14px] [font-family:'Plus Jakarta Sans',Helvetica] transition-all whitespace-nowrap"
                      style={{
                        background: isSel ? "#350011" : "transparent",
                        color: isSel ? "#d20344" : "#414965",
                      }}
                    >
                      {label}
                      <div className="flex items-center justify-center p-[2px] rounded-[4px]"
                        style={{ background: isSel ? "#d20344" : "#222737" }}>
                        <span className="text-[12px] [font-family:'Plus Jakarta Sans',Helvetica] leading-[12px]"
                          style={{ color: isSel ? "#350011" : "#6c779d" }}>
                          {count}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Search toggle (right) — dark 32px circle with search icon */}
        <button
          data-testid="button-search-toggle"
          onClick={handleSearchToggle}
          className="absolute right-[16px] top-[16px] w-[32px] h-[32px] rounded-[100px] flex items-center justify-center transition-opacity hover:opacity-70"
          style={{ background: searchOpen ? "#350011" : "#1d2132" }}
        >
          {searchOpen ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1L11 11M11 1L1 11" stroke="#d20344" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="#6c779d" strokeWidth="1.3" />
              <path d="M9.5 9.5L12.5 12.5" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>

      {/* ── Agent card grid ── */}
      <ScrollArea className="flex-1">
        <div className="px-[16px] pb-[16px] grid grid-cols-2 gap-[16px]">
          {filtered.length === 0 ? (
            <div className="col-span-2 flex flex-col items-center justify-center py-16 gap-3">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <rect x="8" y="8" width="24" height="24" rx="4" stroke="#1d2132" strokeWidth="2" />
                <path d="M16 20h8M20 16v8" stroke="#1d2132" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <p className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#414965] text-[14px]">
                No agents found
              </p>
            </div>
          ) : (
            filtered.map((agent) => {
              const spend = spendMap[agent.id] ?? { cap: "$—", unit: "/day", pct: 0 };
              return (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  spend={spend}
                  currentStatus={agentStatuses[agent.id] ?? agent.status}
                  onToggle={() => handleToggle(agent.id)}
                  isUpdating={updatingId === agent.id}
                  onOpen={() => navigate(`/agent/${agent.id}`)}
                />
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
