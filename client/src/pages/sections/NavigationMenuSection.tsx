import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Separator } from "@/components/ui/separator";
import {
  getChatSessions,
  deleteChatSession,
  formatSessionTime,
  type ChatSession,
} from "@/lib/chatHistory";
import { ShareModal } from "@/components/ShareModal";
import { useNotifications } from "@/hooks/useNotifications";

interface DailyInsight {
  kind: "alert" | "opportunity" | "pattern" | "warning" | "info";
  tag: string;
  text: string;
  action: string;
}

const mainMenuItems = [
  { id: "agents", label: "Agents", icon: "/figmaAssets/navbar-icons-1.svg", activeIcon: "/figmaAssets/nav-agent-active.png", path: "/agents", emoji: null },
];

const initialNotifications = [
  { id: "1", title: "AlphaFlow executed a trade", body: "Bought 0.45 ETH at $2,498", time: "2m ago", read: false },
  { id: "2", title: "SwarmAlpha just launched 🚀", body: "New agent is now live in the Marketplace", time: "15m ago", read: false },
  { id: "3", title: "Risk Sentinel: Anomaly detected", body: "Unusual volatility in BNB/USDC pair", time: "3h ago", read: true },
  { id: "4", title: "Capital rebalanced successfully", body: "Portfolio adjusted to target weights", time: "12h ago", read: true },
];

const EthIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M12 2L5 12.5L12 9.5L19 12.5L12 2Z" fill="#6b7db3"/>
    <path d="M5 12.5L12 16L19 12.5L12 9.5L5 12.5Z" fill="#4a5a8a"/>
    <path d="M12 16L5 13.5L12 22L19 13.5L12 16Z" fill="#6b7db3"/>
    <path d="M12 9.5L19 12.5L12 16L5 12.5L12 9.5Z" fill="#384870"/>
  </svg>
);

/* ── Sidebar icon components — exact paths from Figma 3146:45452 ── */

const CollapseIcon = () => (
  <svg width="18" height="16" viewBox="0 0 20 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 6L11 9L14 12M12 9H19M3 17H5C6.10457 17 7 16.1046 7 15V3C7 1.89543 6.10457 1 5 1H3C1.89543 1 1 1.89543 1 3V15C1 16.1046 1.89543 17 3 17Z" stroke="#A8B9F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const ExpandIcon = () => (
  <svg width="18" height="16" viewBox="0 0 20 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 6L9 9L6 12M8 9H1M17 17H15C13.8954 17 13 16.1046 13 15V3C13 1.89543 13.8954 1 15 1H17C18.1046 1 19 1.89543 19 3V15C19 16.1046 18.1046 17 17 17Z" stroke="#A8B9F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const DashboardIcon = ({ active }: { active: boolean }) => {
  const c = active ? "#9d5cf5" : "#6c779d";
  return (
    <svg width="18" height="13" viewBox="0 0 22.2997 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fill={c} d="M11 0C14.0788 0 16.8608 1.26625 18.8574 3.30469L10.0811 12.082C9.57337 12.5897 9.57337 13.4122 10.0811 13.9199C10.5887 14.4275 11.4113 14.4276 11.9189 13.9199L20.4561 5.38184C21.4353 7.0265 22 8.9469 22 11C22 12.367 21.7485 13.6747 21.292 14.8818C21.0263 15.5843 20.3242 16 19.5732 16H2.42676C1.67575 16 0.973681 15.5843 0.708008 14.8818C0.251487 13.6747 0 12.367 0 11C0 4.92487 4.92487 0 11 0ZM14.2949 3.38086C12.9078 2.781 11.3823 2.57143 9.88477 2.77441C8.38727 2.9775 6.97319 3.58574 5.7959 4.5332C4.61853 5.48092 3.72154 6.73263 3.20312 8.15234C2.68479 9.57204 2.56385 11.1065 2.85352 12.5898C2.99115 13.2945 3.67426 13.7538 4.37891 13.6162C5.08324 13.4784 5.54275 12.7962 5.40527 12.0918C5.20631 11.073 5.28949 10.019 5.64551 9.04395C6.00153 8.06899 6.61725 7.20942 7.42578 6.55859C8.2343 5.90789 9.20594 5.49006 10.2344 5.35059C11.2627 5.21129 12.3102 5.35568 13.2627 5.76758C13.9215 6.05206 14.6868 5.74861 14.9717 5.08984C15.2563 4.43119 14.9533 3.66604 14.2949 3.38086ZM20.0811 2.08203C20.5887 1.57435 21.4113 1.57435 21.9189 2.08203C22.4265 2.58972 22.4266 3.41227 21.9189 3.91992L20.4561 5.38184C20.0062 4.62625 19.4691 3.92919 18.8574 3.30469L20.0811 2.08203Z"/>
    </svg>
  );
};

const InsightsIcon = ({ active }: { active: boolean }) => {
  const c = active ? "#9d5cf5" : "#6c779d";
  const rays: Array<[number, number, number]> = [
    [12,   2,    0],
    [22,   12,   90],
    [2,    12,   90],
    [19.4, 4.6,  45],
    [4.6,  4.6,  135],
    [19.4, 19.4, 135],
    [4.6,  19.4, 45],
  ];
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(4.75,4.375)">
        <path fill={c} d="M0 7.25C0 3.246 3.246 0 7.25 0C11.254 0 14.5 3.246 14.5 7.25C14.5 9.886 13.097 11.929 11.055 13.158C10.954 13.219 10.905 13.3 10.892 13.367L10.646 14.593C10.617 14.739 10.57 14.878 10.508 15.007H3.992C3.93 14.878 3.883 14.739 3.854 14.593L3.608 13.367C3.595 13.3 3.546 13.219 3.446 13.158C1.403 11.929 0 9.886 0 7.25Z"/>
      </g>
      <g transform="translate(9.25,20.38)">
        <path fill={c} d="M0 0V0.743C0 1.709 0.784 2.493 1.75 2.493H3.75C4.717 2.493 5.5 1.709 5.5 0.743V0H0Z"/>
      </g>
      {rays.map(([cx, cy, angle], i) => {
        const rad = (angle * Math.PI) / 180;
        return (
          <line
            key={i}
            x1={cx + Math.sin(rad) * -1.5}
            y1={cy - Math.cos(rad) * 1.5}
            x2={cx + Math.sin(rad) * 1.5}
            y2={cy + Math.cos(rad) * 1.5}
            stroke={c}
            strokeWidth="2"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
};

const PerksIcon = ({ active }: { active: boolean }) => {
  const c = active ? "#9d5cf5" : "#6c779d";
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(3,7)">
        <path fill={c} d="M8 6V15H5.7998C4.11978 15 3.27941 14.9998 2.6377 14.6729C2.07347 14.3853 1.61472 13.9265 1.32715 13.3623C1.00018 12.7206 1 11.8802 1 10.2002V6H8ZM16 0C16.465 0 16.698 0 16.8887 0.0508C17.406 0.1895 17.8105 0.594 17.9492 1.1113C18.0003 1.3021 18 1.535 18 2C18 2.465 18.0003 2.6979 17.9492 2.8887C17.8105 3.406 17.406 3.8105 16.8887 3.9492C16.698 4.0003 16.465 4 16 4H2C1.535 4 1.3021 4.0003 1.1113 3.9492C0.594 3.8105 0.1895 3.406 0.0508 2.8887C0 2.6979 0 2.465 0 2C0 1.535 0 1.3021 0.0508 1.1113C0.1895 0.594 0.594 0.1895 1.1113 0.0508C1.3021 0 1.535 0 2 0H16ZM17 10.2002C17 11.8802 16.9998 12.7206 16.6729 13.3623C16.3853 13.9265 15.9265 14.3853 15.3623 14.6729C14.7206 14.9998 13.8802 15 12.2002 15H10V6H17V10.2002Z"/>
      </g>
      <g transform="translate(5,3)">
        <path stroke={c} strokeWidth="2" strokeLinejoin="round" fill="none" d="M7 6V4.857M7 6H4.214C2.439 6 1 4.561 1 2.786C1 1.799 1.799 1 2.786 1H3.143C5.273 1 7 2.727 7 4.857M7 6H9.786C11.561 6 13 4.561 13 2.786C13 1.799 12.2 1 11.214 1H10.857C8.727 1 7 2.727 7 4.857"/>
      </g>
    </svg>
  );
};

const CountBadge = ({ count, purple = false }: { count: number; purple?: boolean }) => (
  <div
    className="flex items-center justify-center flex-shrink-0 px-[4px] py-[2px] rounded-[4px]"
    style={{ background: purple ? "rgba(118,49,238,0.18)" : "#222737", minWidth: "18px" }}
  >
    <span style={{ fontFamily: "'Gilroy-SemiBold', Helvetica", fontSize: "12px", lineHeight: "12px", color: purple ? "#9d5cf5" : "#6c779d", textAlign: "center" as const }}>
      {count}
    </span>
  </div>
);

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  onCreateAgent: () => void;
  onLogout?: () => void;
}


const insightColors = {
  alert:       { tag: "#ff9500", border: "#ff9500", bg: "rgba(255,149,0,0.06)" },
  opportunity: { tag: "#42bf23", border: "#42bf23", bg: "rgba(66,191,35,0.06)" },
  pattern:     { tag: "#7631ee", border: "#7631ee", bg: "rgba(118,49,238,0.06)" },
  warning:     { tag: "#d20344", border: "#d20344", bg: "rgba(210,3,68,0.06)"  },
  info:        { tag: "#a8b9f4", border: "#a8b9f4", bg: "rgba(168,185,244,0.06)" },
};

export const NavigationMenuSection = ({ collapsed, onToggle, onCreateAgent, onLogout }: Props): JSX.Element => {
  const [location, navigate] = useLocation();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false);
  const [openMoreMenu, setOpenMoreMenu] = useState<string | null>(null);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const notifPanelRef = useRef<HTMLDivElement>(null);
  const historyPanelRef = useRef<HTMLDivElement>(null);

  const { unreadCount, markAllRead: markAllReadLive, notifications: liveNotifications } = useNotifications();
  const dismiss = (id: string) => setNotifications((prev) => prev.filter((n) => n.id !== id));

  // ── Daily Insights from API ──
  const { data: insightsResponse, isLoading: insightsLoading } = useQuery<{
    insights: DailyInsight[];
    generatedAt: string | null;
    generating: boolean;
    nextAt: string | null;
  }>({
    queryKey: ["/api/insights"],
    refetchInterval: 30000, // poll every 30s to pick up new generation
  });
  const insightsData: DailyInsight[] = insightsResponse?.insights ?? [];
  const insightsGenerating = insightsResponse?.generating ?? false;
  const insightsGeneratedAt = insightsResponse?.generatedAt ? new Date(insightsResponse.generatedAt) : null;

  const isActive = (path: string) => {
    if (path === "/") return location === "/" || location === "";
    return location.startsWith(path);
  };

  const markAllRead = () => {
    markAllReadLive();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const loadSessions = () => setChatSessions(getChatSessions());

  useEffect(() => {
    loadSessions();
    window.addEventListener("chat-sessions-updated", loadSessions);
    return () => window.removeEventListener("chat-sessions-updated", loadSessions);
  }, []);

  // Open history panel when AssistantPage history button is clicked
  useEffect(() => {
    const handler = () => setChatHistoryOpen(true);
    window.addEventListener("open-chat-history", handler);
    return () => window.removeEventListener("open-chat-history", handler);
  }, []);

  // Refresh sessions when history panel opens
  useEffect(() => {
    if (chatHistoryOpen) loadSessions();
  }, [chatHistoryOpen]);

  // Close panels on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifPanelRef.current && !notifPanelRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
      if (historyPanelRef.current && !historyPanelRef.current.contains(e.target as Node)) {
        setChatHistoryOpen(false);
        setOpenMoreMenu(null);
      }
    };
    if (notificationsOpen || chatHistoryOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notificationsOpen, chatHistoryOpen]);

  const openSession = (id: string) => {
    setChatHistoryOpen(false);
    setOpenMoreMenu(null);
    // Dispatch event so AssistantPage can load the session even when already on /assistant
    window.dispatchEvent(new CustomEvent("load-chat-session", { detail: { id } }));
    navigate("/assistant");
  };

  const removeSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteChatSession(id);
    loadSessions();
  };

  // ── Insights panel ──
  const InsightsPanel = () => (
    <>
      {insightsOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300"
          onClick={() => setInsightsOpen(false)}
        />
      )}
      <div
        className={`fixed z-40 top-[12px] bottom-[12px] flex flex-col w-[360px] overflow-hidden
          transition-all duration-300 ease-out
          ${insightsOpen ? "opacity-100 translate-x-0 pointer-events-auto" : "opacity-0 -translate-x-4 pointer-events-none"}
        `}
        style={{
          left: collapsed ? "76px" : "280px",
          background: "#0a0c10",
          border: "1px solid #1d2132",
          borderRadius: "16px",
          boxShadow: "0px 68px 27px 0px rgba(0,0,0,0.06),0px 38px 23px 0px rgba(0,0,0,0.2),0px 17px 17px 0px rgba(0,0,0,0.34),0px 4px 9px 0px rgba(0,0,0,0.39)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between flex-shrink-0 px-[16px] py-[14px]"
          style={{ borderBottom: "1px solid #1d2132", background: "rgba(10,12,16,0.92)", backdropFilter: "blur(10px)" }}
        >
          <div className="flex items-center gap-[8px]">
            <div
              className="w-[8px] h-[8px] rounded-full flex-shrink-0"
              style={{ background: "#7631ee", animation: "pulse 2s infinite" }}
            />
            <span style={{ fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif", fontSize: "16px", lineHeight: "22px", color: "#a8b9f4" }}>
              Insights for You
            </span>
          </div>
          <button
            onClick={() => setInsightsOpen(false)}
            className="flex items-center justify-center flex-shrink-0 hover:opacity-70 transition-opacity"
            style={{ width: "24px", height: "24px", borderRadius: "100px", background: "#1d2132" }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1L9 9M9 1L1 9" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Sub-header */}
        <div className="px-[16px] py-[10px] flex-shrink-0" style={{ borderBottom: "1px solid #1d2132" }}>
          {insightsLoading || insightsGenerating ? (
            <div className="flex items-center gap-[8px]">
              <div className="w-[6px] h-[6px] rounded-full bg-[#7631ee] animate-pulse flex-shrink-0" />
              <p style={{ fontFamily: "'Gilroy-Medium', Helvetica, sans-serif", fontSize: "12px", lineHeight: "16px", color: "#6c779d" }}>
                Brain AI is analysing your accounts…
              </p>
            </div>
          ) : (
            <p style={{ fontFamily: "'Gilroy-Medium', Helvetica, sans-serif", fontSize: "12px", lineHeight: "16px", color: "#414965" }}>
              Brain AI analysed your accounts and found {insightsData.length} personalised recommendations.
            </p>
          )}
        </div>

        {/* Insight cards */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-[10px] p-[12px]">
          {(insightsLoading || insightsGenerating) && insightsData.length === 0 ? (
            /* Loading skeleton */
            Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col gap-[8px] p-[12px] rounded-[12px] animate-pulse"
                style={{ background: "rgba(118,49,238,0.04)", border: "1px solid rgba(118,49,238,0.10)", borderLeft: "3px solid rgba(118,49,238,0.25)", borderRadius: "0 12px 12px 0" }}
              >
                <div className="h-[10px] w-[80px] rounded bg-[#1d2132]" />
                <div className="h-[13px] w-full rounded bg-[#1d2132]" />
                <div className="h-[13px] w-4/5 rounded bg-[#1d2132]" />
                <div className="h-[12px] w-[100px] rounded bg-[#1d2132]" />
              </div>
            ))
          ) : (
            insightsData.map((insight, i) => {
              const c = insightColors[insight.kind] ?? insightColors.info;
              return (
                <div
                  key={i}
                  className="flex flex-col gap-[6px] p-[12px] cursor-pointer transition-all hover:brightness-110"
                  style={{
                    background: c.bg,
                    border: `1px solid ${c.border}22`,
                    borderLeft: `3px solid ${c.border}`,
                    borderRadius: "0 12px 12px 0",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif",
                      fontSize: "10px",
                      lineHeight: "13px",
                      letterSpacing: "0.07em",
                      textTransform: "uppercase" as const,
                      color: c.tag,
                    }}
                  >
                    {insight.tag}
                  </span>
                  <p
                    style={{
                      fontFamily: "'Gilroy-Medium', Helvetica, sans-serif",
                      fontSize: "13px",
                      lineHeight: "19px",
                      color: "#d0d8f0",
                    }}
                  >
                    {insight.text}
                  </p>
                  <span
                    style={{
                      fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif",
                      fontSize: "12px",
                      lineHeight: "16px",
                      color: c.tag,
                    }}
                  >
                    {insight.action}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          className="flex-shrink-0 px-[16px] py-[12px]"
          style={{ borderTop: "1px solid #1d2132" }}
        >
          <p style={{ fontFamily: "'Gilroy-Medium', Helvetica, sans-serif", fontSize: "11px", lineHeight: "15px", color: "#414965", textAlign: "center" as const }}>
            {insightsGeneratedAt
              ? `Last updated ${insightsGeneratedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · Refreshes every 24h · Powered by Brain AI`
              : "Insights refresh every 24 hours · Powered by Brain AI"}
          </p>
        </div>
      </div>
    </>
  );

  // ── Notifications popup panel ──
  const NotificationsPanel = () => (
    <>
      <div
        className={`fixed inset-0 z-30 transition-opacity duration-300 ${notificationsOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={() => setNotificationsOpen(false)}
      />
      <div
        ref={notifPanelRef}
        className={`fixed z-40 top-[68px] flex flex-col w-[340px] rounded-2xl border border-[#1e2235] bg-[#0d1017] shadow-[0_20px_60px_rgba(0,0,0,0.7)]
          transition-all duration-300 ease-out overflow-hidden
          ${notificationsOpen ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-2 pointer-events-none"}
        `}
        style={{ left: collapsed ? "76px" : "280px" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4">
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-white text-base">Notifications</span>
          <div className="flex items-center gap-2">
            <button
              onClick={markAllRead}
              className="px-3 py-1 rounded-full bg-[#1a1f30] [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#6c779d] text-[11px] hover:text-white transition-colors"
            >
              Mark all read
            </button>
            <button
              onClick={() => setNotificationsOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-[#1a1f30] text-[#6c779d] hover:text-white transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Notification rows */}
        <div className="flex flex-col">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-[#6c779d]">
              <span className="text-2xl">🔔</span>
              <span className="text-xs [font-family:'Gilroy-Medium',Helvetica]">No notifications</span>
            </div>
          ) : notifications.map((n, i) => (
            <div
              key={n.id}
              className={`flex items-start gap-3 px-5 py-4 transition-colors hover:bg-[#131927] group ${
                i < notifications.length - 1 ? "border-b border-[#1a1f2e]" : ""
              } ${!n.read ? "bg-[#0f1420]" : ""}`}
            >
              {/* Icon — lightbulb for insights, eth for everything else */}
              <div className="w-9 h-9 rounded-full bg-[#1a1f30] flex items-center justify-center flex-shrink-0 mt-0.5">
                {n.type === "insights" ? (
                  <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                    <path d="M9 2a5 5 0 0 1 3.5 8.5c-.5.5-.8 1.2-.8 1.8V13H6.3v-.7c0-.6-.3-1.3-.8-1.8A5 5 0 0 1 9 2Z" stroke="#7631ee" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M6.3 13.5h5.4M7 15.5h4" stroke="#7631ee" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                ) : (
                  <EthIcon />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-[13px] leading-snug [font-family:'Gilroy-SemiBold',Helvetica] ${!n.read ? "text-[#f97316]" : "text-[#8899bb]"}`}>
                  {n.title}
                </p>
                <p className="text-[11px] text-[#6c779d] [font-family:'Gilroy-Medium',Helvetica] mt-1 leading-relaxed">{n.body}</p>
                <p className="text-[11px] text-[#414965] [font-family:'Gilroy-Medium',Helvetica] mt-1">{n.time}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded-full bg-[#1a1f30] text-[#6c779d] hover:text-white flex-shrink-0 mt-1"
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
              </button>
            </div>
          ))}
        </div>

        {/* View All button */}
        <div className="px-4 py-4">
          <Link href="/notifications">
            <button
              onClick={() => setNotificationsOpen(false)}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#131927] hover:bg-[#1a2133] transition-colors rounded-xl"
            >
              <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-white text-sm">View All Notifications</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8H13M9 4L13 8L9 12" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </Link>
        </div>
      </div>
    </>
  );

  // ── Group sessions by relative time label ──
  const groupSessionsByMonth = (sessions: ChatSession[]) => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
    const startOfThisWeek = new Date(startOfToday.getTime() - startOfToday.getDay() * 86400000);
    const startOfLastWeek = new Date(startOfThisWeek.getTime() - 7 * 86400000);

    const getLabel = (iso: string) => {
      const d = new Date(iso);
      if (d >= startOfToday) return "Today";
      if (d >= startOfYesterday) return "Yesterday";
      if (d >= startOfThisWeek) return "This Week";
      if (d >= startOfLastWeek) return "Last Week";
      return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    };

    const ORDER = ["Today", "Yesterday", "This Week", "Last Week"];
    const groups: { label: string; sessions: ChatSession[] }[] = [];
    sessions.forEach((sess) => {
      const label = getLabel(sess.updatedAt);
      const existing = groups.find((g) => g.label === label);
      if (existing) existing.sessions.push(sess);
      else groups.push({ label, sessions: [sess] });
    });

    return groups.sort((a, b) => {
      const ai = ORDER.indexOf(a.label);
      const bi = ORDER.indexOf(b.label);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return new Date(b.label).getTime() - new Date(a.label).getTime();
    });
  };

  // Get the currently open session id from the URL
  const currentSessionId = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("session")
    : null;

  // ── Chat history popup panel (Figma 3146-45912) ──
  const ChatHistoryPanel = () => {
    const grouped = groupSessionsByMonth(chatSessions);

    const handleDeleteSession = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      deleteChatSession(id);
      loadSessions();
      setOpenMoreMenu(null);
      setChatHistoryOpen(false);
      window.dispatchEvent(new Event("chat-sessions-updated"));
      // Navigate to fresh assistant home after deletion
      window.dispatchEvent(new Event("new-chat"));
      navigate("/assistant");
    };

    const handleShareSession = (e: React.MouseEvent) => {
      e.stopPropagation();
      setOpenMoreMenu(null);
      setChatHistoryOpen(false);
      setShareOpen(true);
    };

    return (
      <>
        {/* Dim overlay */}
        {chatHistoryOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300"
            onClick={() => { setChatHistoryOpen(false); setOpenMoreMenu(null); }}
          />
        )}

        <div
          ref={historyPanelRef}
          className={`fixed z-40 top-[72px] bottom-[72px] flex flex-col w-[320px] overflow-hidden
            transition-all duration-300 ease-out
            ${chatHistoryOpen ? "opacity-100 translate-x-0 pointer-events-auto" : "opacity-0 -translate-x-4 pointer-events-none"}
          `}
          style={{
            left: collapsed ? "76px" : "280px",
            background: "#0a0c10",
            border: "1px solid #1d2132",
            borderRadius: "16px",
            boxShadow: "0px 68px 27px 0px rgba(0,0,0,0.06),0px 38px 23px 0px rgba(0,0,0,0.2),0px 17px 17px 0px rgba(0,0,0,0.34),0px 4px 9px 0px rgba(0,0,0,0.39)",
          }}
        >
          {/* ── Sticky header (56px, backdrop-blur) ── */}
          <div
            className="flex items-center justify-between flex-shrink-0"
            style={{
              height: "56px",
              padding: "0 16px",
              background: "rgba(10,12,16,0.88)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              borderBottom: "1px solid #1d2132",
            }}
          >
            <span
              style={{
                fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif",
                fontWeight: 600,
                fontSize: "20px",
                lineHeight: "24px",
                color: "#6c779d",
                whiteSpace: "nowrap",
              }}
            >
              Chat History
            </span>
            <button
              onClick={() => { setChatHistoryOpen(false); setOpenMoreMenu(null); }}
              className="flex items-center justify-center flex-shrink-0 hover:opacity-70 transition-opacity"
              style={{ width: "24px", height: "24px", borderRadius: "100px", background: "#1d2132" }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1L9 9M9 1L1 9" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* ── Scrollable content ── */}
          <div className="flex-1 overflow-y-auto" style={{ padding: "8px" }}>
            {chatSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <path d="M4 7h20M4 14h14M4 21h8" stroke="#414965" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <p style={{ fontFamily: "'Gilroy-Medium', Helvetica, sans-serif", fontSize: "13px", lineHeight: "18px", color: "#414965" }}>
                  No chat history yet.<br />Start a conversation with Brain.
                </p>
              </div>
            ) : (
              <div className="flex flex-col" style={{ gap: "16px" }}>
                {grouped.map((group) => (
                  <div key={group.label} className="flex flex-col" style={{ gap: "4px" }}>
                    {/* Month label */}
                    <div style={{ paddingLeft: "8px", paddingBottom: "4px" }}>
                      <span style={{
                        fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif",
                        fontWeight: 600,
                        fontSize: "12px",
                        lineHeight: "16px",
                        color: "#414965",
                        whiteSpace: "nowrap",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}>
                        {group.label}
                      </span>
                    </div>
                    {/* Session rows */}
                    {group.sessions.map((sess) => {
                      const isMenuOpen = openMoreMenu === sess.id;
                      return (
                        <div key={sess.id} className="relative group/row">
                          {/* Row — clicking the title area resumes the chat */}
                          <div
                            className="flex items-center justify-between rounded-[8px] px-2 py-[7px] cursor-pointer
                              hover:bg-[#4a2300] transition-colors"
                            style={{ gap: "6px" }}
                            onClick={() => {
                              setOpenMoreMenu(null);
                              openSession(sess.id);
                            }}
                          >
                            <span
                              className="flex-1 truncate group-hover/row:text-[#ff9500] transition-colors"
                              style={{
                                fontFamily: "'Gilroy-Medium', Helvetica, sans-serif",
                                fontSize: "14px",
                                lineHeight: "18px",
                                color: "#6c779d",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {sess.title}
                            </span>

                            {/* Three-dot button — visible on hover */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMoreMenu(isMenuOpen ? null : sess.id);
                              }}
                              className="opacity-0 group-hover/row:opacity-100 transition-opacity flex-shrink-0
                                w-6 h-6 rounded-[6px] flex items-center justify-center hover:bg-[#5c2d00]"
                              title="More options"
                            >
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                <circle cx="7" cy="2.5" r="1.3" fill="#ff9500" />
                                <circle cx="7" cy="7" r="1.3" fill="#ff9500" />
                                <circle cx="7" cy="11.5" r="1.3" fill="#ff9500" />
                              </svg>
                            </button>
                          </div>

                          {/* ── More dropdown (Share / Delete) ── */}
                          {isMenuOpen && (
                            <div
                              className="absolute right-0 z-50 flex flex-col overflow-hidden"
                              style={{
                                top: "calc(100% + 2px)",
                                width: "160px",
                                background: "#0d1017",
                                border: "1px solid #1d2132",
                                borderRadius: "10px",
                                boxShadow: "0px 12px 32px rgba(0,0,0,0.7)",
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {/* Share */}
                              <button
                                onClick={handleShareSession}
                                className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#131927] transition-colors text-left"
                              >
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                  <circle cx="11" cy="2.5" r="1.8" stroke="#6c779d" strokeWidth="1.1"/>
                                  <circle cx="3" cy="7" r="1.8" stroke="#6c779d" strokeWidth="1.1"/>
                                  <circle cx="11" cy="11.5" r="1.8" stroke="#6c779d" strokeWidth="1.1"/>
                                  <path d="M4.7 6.1L9.3 3.4M4.7 7.9L9.3 10.6" stroke="#6c779d" strokeWidth="1.1" strokeLinecap="round"/>
                                </svg>
                                <span style={{ fontFamily: "'Gilroy-Medium', Helvetica, sans-serif", fontSize: "13px", color: "#6c779d" }}>
                                  Share
                                </span>
                              </button>
                              {/* Divider */}
                              <div style={{ height: "1px", background: "#1d2132", margin: "0 8px" }} />
                              {/* Delete */}
                              <button
                                onClick={(e) => handleDeleteSession(e, sess.id)}
                                className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#1a0a0a] transition-colors text-left"
                              >
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                  <path d="M2 4h10M5 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4M5.5 6.5v4M8.5 6.5v4M3.5 4l.7 7.5a.5.5 0 0 0 .5.5h4.6a.5.5 0 0 0 .5-.5L10.5 4" stroke="#d20344" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <span style={{ fontFamily: "'Gilroy-Medium', Helvetica, sans-serif", fontSize: "13px", color: "#d20344" }}>
                                  Delete
                                </span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </>
    );
  };

  if (collapsed) {
    return (
      <>
        <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} />
        <NotificationsPanel />
        <ChatHistoryPanel />
        <nav className="flex flex-col w-[60px] h-full rounded-[16px] border border-solid border-[#1d2132] bg-[#11141b] flex-shrink-0">
          <div className="flex flex-col flex-1 items-center mt-2 gap-1 w-full px-[7px]">
            {/* Expand button — top of collapsed sidebar (rounded-full, 40px) */}
            <button
              onClick={onToggle}
              title="Expand menu"
              className="w-[40px] h-[40px] flex-shrink-0 flex items-center justify-center rounded-[100px] transition-colors mb-0"
              style={{ background: "rgba(168,185,244,0.15)" }}
            >
              <ExpandIcon />
            </button>

            {/* Brain logo icon — below expand button */}
            <div className="w-[40px] h-[40px] flex-shrink-0 flex items-center justify-center">
              <img
                className="w-8 h-8 object-contain"
                alt="Brain"
                src="/figmaAssets/frame-1000002163.svg"
              />
            </div>

            {/* Dashboard — first item */}
            <Link href="/dashboard">
              <button title="Dashboard" className={`flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${isActive("/dashboard") ? "bg-brain-v1highlight-dropdown-bg" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}>
                <DashboardIcon active={isActive("/dashboard")} />
              </button>
            </Link>

            {mainMenuItems.map((item) => (
              <div key={item.id} className="w-full flex flex-col items-center">
                <Link href={item.path}>
                  <button title={item.label} className={`flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${isActive(item.path) ? "bg-brain-v1highlight-dropdown-bg" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}>
                    <img className="w-5 h-5" alt={item.label} src={isActive(item.path) ? item.activeIcon : item.icon} />
                  </button>
                </Link>
              </div>
            ))}

            <div className="w-8 h-px bg-[#1d2132] my-1" />

            <button title="Notifications" onClick={() => setNotificationsOpen((v) => !v)} className={`relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${notificationsOpen ? "bg-brain-v1baby-blue-30" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}>
              <img className="w-5 h-5" alt="Notifications" src={notificationsOpen ? "/figmaAssets/nav-notifications-active.png" : "/figmaAssets/notif-icon.svg"} />
              {unreadCount > 0 && (
                <div className="absolute -top-0.5 -right-0.5 flex items-center justify-center px-[4px] py-[1px] rounded-[4px] min-w-[14px]" style={{ background: "#1a1f2e" }}>
                  <span style={{ fontFamily: "'Gilroy-SemiBold', Helvetica", fontSize: "9px", lineHeight: "13px", color: "#6c779d" }}>{unreadCount}</span>
                </div>
              )}
            </button>

            <button
              title="Invite Friends"
              onClick={() => setShareOpen(true)}
              className={`flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${shareOpen ? "bg-brain-v1highlight-dropdown-bg" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}
            >
              <img src={shareOpen ? "/figmaAssets/nav-invite-active.png" : "/figmaAssets/nav-invite-normal.png"} alt="Invite Friends" className="w-5 h-5" style={{ mixBlendMode: "lighten" }} />
            </button>

            <Link href="/settings">
              <button title="Settings" className="flex items-center justify-center w-9 h-9 rounded-xl bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15 transition-colors">
                <img className="w-5 h-5" alt="Settings" src="/figmaAssets/navbar-icons-5.svg" />
              </button>
            </Link>
          </div>

          <div className="flex flex-col items-center gap-2 pb-4 mt-auto pt-4 px-2">
            <button title="Create Agent" onClick={onCreateAgent} className="flex items-center justify-center w-9 h-9 bg-[#4a2300] rounded-full hover:opacity-80 transition-opacity">
              <img className="w-5 h-5" alt="Create" src="/figmaAssets/create-agent-icon.svg" />
            </button>
            <button title="Logout" className="flex items-center justify-center w-9 h-9 bg-[#350011] rounded-full hover:opacity-80 transition-opacity">
              <img className="w-5 h-5" alt="Logout" src="/figmaAssets/logout-icon.svg" />
            </button>
          </div>
        </nav>
      </>
    );
  }

  return (
    <>
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} />
      <NotificationsPanel />
      <ChatHistoryPanel />
      <nav className="flex flex-col w-[264px] h-full rounded-[16px] border border-solid border-[#1d2132] bg-[#11141b] flex-shrink-0">
        {/* Brain logo row — collapse button lives here on the right */}
        <div className="flex items-center px-3 pt-3 pb-0 flex-shrink-0 h-[40px]">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <img
              className="w-6 h-6 object-contain flex-shrink-0"
              alt="Brain"
              src="/figmaAssets/frame-1000002163.svg"
            />
            <div className="[font-family:'Gridular-Regular',Helvetica] font-normal text-transparent text-[24px] leading-7 whitespace-nowrap select-none">
              <span className="text-[#7631ee]">br</span>
              <span className="text-[#ffffff]">ai</span>
              <span className="text-[#7631ee]">n</span>
            </div>
          </div>
          <button
            onClick={onToggle}
            title="Collapse menu"
            className="w-[40px] h-[40px] flex-shrink-0 flex items-center justify-center rounded-[100px] transition-colors hover:opacity-80"
            style={{ background: "rgba(168,185,244,0.15)" }}
          >
            <CollapseIcon />
          </button>
        </div>

        <div className="flex flex-col flex-1 mx-2 mt-4 gap-4 pb-0 overflow-y-auto min-h-0">
          {/* Main Menu */}
          <div className="flex flex-col items-start gap-1 w-full">
            <div className="flex items-center px-2 py-0 w-full">
              <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-30 text-xs tracking-[0] leading-4">Main Menu</span>
            </div>

            <div className="flex flex-col items-start gap-1 w-full">
              {/* Dashboard — first item */}
              <Link href="/dashboard" className="w-full">
                <button className={`flex items-center gap-2 p-2 w-full rounded-xl cursor-pointer transition-colors ${isActive("/dashboard") ? "bg-brain-v1highlight-dropdown-bg" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}>
                  <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
                    <DashboardIcon active={isActive("/dashboard")} />
                  </div>
                  <span className={`[font-family:'Gilroy-Medium',Helvetica] font-medium text-base tracking-[0] leading-5 whitespace-nowrap text-left flex-1 ${isActive("/dashboard") ? "text-brain-v1white" : "text-brain-v1baby-blue-60"}`}>
                    Dashboard
                  </span>
                  {isActive("/dashboard") && (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0 text-[#414965]">
                      <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </Link>

              {mainMenuItems.map((item) => (
                <div key={item.id} className="w-full">
                  {item.id === "assistant" ? (
                    <Link href={item.path} className="w-full">
                      <button className={`flex items-center gap-2 p-2 w-full rounded-xl cursor-pointer transition-colors ${isActive(item.path) ? "bg-brain-v1highlight-dropdown-bg" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}>
                        <img className="w-6 h-6 flex-shrink-0" alt={item.label} src={isActive(item.path) ? item.activeIcon : item.icon} />
                        <span className={`[font-family:'Gilroy-Medium',Helvetica] font-medium text-base tracking-[0] leading-5 whitespace-nowrap text-left flex-1 ${isActive(item.path) ? "text-brain-v1white" : "text-brain-v1baby-blue-60"}`}>
                          {item.label}
                        </span>
                        {isActive(item.path) && (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0 text-[#414965]">
                            <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                    </Link>
                  ) : (
                    <Link href={item.path} className="w-full">
                      <button className={`flex items-center gap-2 p-2 w-full rounded-xl cursor-pointer transition-colors ${isActive(item.path) ? "bg-brain-v1highlight-dropdown-bg" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}>
                        <img className="w-6 h-6 flex-shrink-0" alt={item.label} src={isActive(item.path) ? item.activeIcon : item.icon} />
                        <span className={`[font-family:'Gilroy-Medium',Helvetica] font-medium text-base tracking-[0] leading-5 whitespace-nowrap text-left flex-1 ${isActive(item.path) ? "text-brain-v1white" : "text-brain-v1baby-blue-60"}`}>
                          {item.emoji ? `${item.emoji} ` : ""}{item.label}
                        </span>
                        {isActive(item.path) && (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0 text-[#414965]">
                            <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>

          <Separator className="w-full bg-[#1d2132]" />

          {/* Other section */}
          <div className="flex flex-col items-start gap-1 w-full">
            <div className="flex items-center justify-center gap-2 px-2 py-0 w-full">
              <span className="flex-1 [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-30 text-xs tracking-[0] leading-4">Other</span>
            </div>

            <button
              onClick={() => setNotificationsOpen((v) => !v)}
              className={`flex items-center gap-2 p-2 w-full rounded-xl cursor-pointer transition-colors ${notificationsOpen ? "bg-brain-v1highlight-dropdown-bg" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}
            >
              <img className="w-6 h-6 flex-shrink-0" alt="Notifications" src={notificationsOpen ? "/figmaAssets/nav-notifications-active.png" : "/figmaAssets/notif-icon.svg"} />
              <span className={`[font-family:'Gilroy-Medium',Helvetica] font-medium text-base tracking-[0] leading-5 whitespace-nowrap text-left flex-1 ${notificationsOpen ? "text-white" : "text-brain-v1baby-blue-60"}`}>Notifications</span>
              {unreadCount > 0 && (
                <CountBadge count={unreadCount} />
              )}
              {notificationsOpen && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0 text-[#414965]">
                  <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>

            <button
              onClick={() => setShareOpen(true)}
              className={`flex items-center gap-2 p-2 w-full rounded-xl cursor-pointer transition-colors ${shareOpen ? "bg-brain-v1highlight-dropdown-bg" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}
            >
              <img src={shareOpen ? "/figmaAssets/nav-invite-active.png" : "/figmaAssets/nav-invite-normal.png"} alt="Invite Friends" className="w-6 h-6 flex-shrink-0" style={{ mixBlendMode: "lighten" }} />
              <span className={`[font-family:'Gilroy-Medium',Helvetica] font-medium text-base tracking-[0] leading-5 whitespace-nowrap text-left flex-1 ${shareOpen ? "text-white" : "text-brain-v1baby-blue-60"}`}>Invite Friends</span>
              <div className="flex items-center justify-center px-1.5 py-0.5 bg-brain-v1dark-green rounded-full flex-shrink-0">
                <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1green text-[10px] leading-3 whitespace-nowrap">+50 $BRAIN</span>
              </div>
            </button>

            <Link href="/settings" className="w-full">
              <button className={`flex items-center gap-2 p-2 w-full rounded-xl cursor-pointer transition-colors ${isActive("/settings") ? "bg-brain-v1highlight-dropdown-bg" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}>
                <img className="w-6 h-6 flex-shrink-0" alt="Settings" src="/figmaAssets/navbar-icons-5.svg" />
                <span className={`[font-family:'Gilroy-Medium',Helvetica] font-medium text-base tracking-[0] leading-5 whitespace-nowrap text-left flex-1 ${isActive("/settings") ? "text-brain-v1white" : "text-brain-v1baby-blue-60"}`}>Settings</span>
                {isActive("/settings") && (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0 text-[#414965]">
                    <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </Link>
          </div>
        </div>

        {/* Bottom buttons */}
        <div className="flex flex-col items-start gap-2 mx-2 mb-4 mt-auto pt-4">
          <button onClick={onCreateAgent} className="flex items-center justify-center gap-2 px-5 py-2 w-full bg-[#4a2300] rounded-[100px] hover:opacity-80 transition-opacity">
            <img className="w-6 h-6 flex-shrink-0" alt="Create" src="/figmaAssets/create-agent-icon.svg" />
            {!collapsed && <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#ff9500] text-base font-semibold leading-5 whitespace-nowrap">Create Agent</span>}
          </button>
          <button
            onClick={onLogout}
            className="flex items-center justify-center gap-2 px-5 py-2 w-full bg-[#350011] rounded-[100px] hover:opacity-80 transition-opacity"
          >
            <img className="w-6 h-6 flex-shrink-0" alt="Logout" src="/figmaAssets/logout-icon.svg" />
            {!collapsed && <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#d20344] text-base font-semibold leading-5 whitespace-nowrap">Logout</span>}
          </button>
        </div>
      </nav>
    </>
  );
};
