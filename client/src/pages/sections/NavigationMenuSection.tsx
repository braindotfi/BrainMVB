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
  { id: "agents", label: "Agents", path: "/agents" },
  { id: "marketplace", label: "Marketplace", path: "/marketplace" },
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

/* ── Sidebar icon components — Figma assets ── */

const CollapseIcon = () => (
  <svg width="18" height="16" viewBox="0 0 20 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 6L11 9L14 12M12 9H19M3 17H5C6.10457 17 7 16.1046 7 15V3C7 1.89543 6.10457 1 5 1H3C1.89543 1 1 1.89543 1 3V15C1 16.1046 1.89543 17 3 17Z" stroke="#6C779D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const ExpandIcon = () => (
  <svg width="18" height="16" viewBox="0 0 20 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M11 6L14 9L11 12M13 9H6M3 17H17C18.1046 17 19 16.1046 19 15V3C19 1.89543 18.1046 1 17 1H3C1.89543 1 1 1.89543 1 3V15C1 16.1046 1.89543 17 3 17Z" stroke="#6C779D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const DashboardIcon = ({ active }: { active: boolean }) => active ? (
  <div className="relative size-[24px]">
    <div className="absolute inset-[16.67%_4.17%]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src="https://www.figma.com/api/mcp/asset/9f227a2e-b9c7-4983-8211-f9a363b72e2e" />
    </div>
    <div className="absolute inset-[23.75%_2.92%_23.75%_44.58%]">
      <div className="absolute inset-[-8.93%_-17.86%_-26.79%_-17.86%]">
        <img alt="" className="block max-w-none size-full" src="https://www.figma.com/api/mcp/asset/a3b26a6d-fe0c-4b92-b480-0a13701c7b91" />
      </div>
    </div>
    <div className="absolute flex inset-[27.91%_33.01%_26.5%_15.41%] items-center justify-center" style={{ containerType: "size" }}>
      <div className="-rotate-90 flex-none h-[100cqw] w-[100cqh]">
        <div className="relative size-full">
          <div className="absolute inset-[-9.09%_-20.56%_-27.26%_-20.56%]">
            <img alt="" className="block max-w-none size-full" src="https://www.figma.com/api/mcp/asset/9d1e66d0-cba8-445f-8d5a-f1dd22377e6a" />
          </div>
        </div>
      </div>
    </div>
  </div>
) : (
  <div className="overflow-clip relative size-[24px]">
    <div className="absolute inset-[16.67%_2.92%_16.67%_4.17%]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src="https://www.figma.com/api/mcp/asset/f3fe4ed0-52d6-41ac-ac44-514919c74e23" />
    </div>
  </div>
);

const AgentsIcon = ({ active }: { active: boolean }) => active ? (
  <div className="relative size-[24px]">
    <div className="absolute inset-[8.33%_0_16.67%_0]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src="https://www.figma.com/api/mcp/asset/b53c2bad-67a2-4081-b85b-88b5e3b9d279" />
    </div>
    <div className="absolute inset-[33.33%_29.17%]">
      <div className="absolute inset-[-14.06%_-22.5%_-42.19%_-22.5%]">
        <img alt="" className="block max-w-none size-full" src="https://www.figma.com/api/mcp/asset/2bedcb17-5224-441c-a164-ac242bfb04c1" />
      </div>
    </div>
  </div>
) : (
  <div className="relative size-[24px]">
    <div className="absolute inset-[8.33%_0_16.67%_0]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src="https://www.figma.com/api/mcp/asset/3b33f363-c70c-4227-9760-55006068912e" />
    </div>
  </div>
);

const MarketplaceIcon = ({ active }: { active: boolean }) => active ? (
  <div className="relative size-[24px]">
    <div className="absolute inset-[8.33%_4.17%]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src="https://www.figma.com/api/mcp/asset/ecd60c4a-1a93-449f-8700-97904d23811e" />
    </div>
    <div className="absolute inset-[17.59%_13.38%_54.63%_13.38%]">
      <div className="absolute inset-[-16.88%_-12.8%_-50.63%_-12.8%]">
        <img alt="" className="block max-w-none size-full" src="https://www.figma.com/api/mcp/asset/84e800e1-8442-437c-9e23-22f3eff49f9f" />
      </div>
    </div>
  </div>
) : (
  <div className="relative size-[24px]">
    <div className="absolute inset-[8.33%_4.17%]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src="https://www.figma.com/api/mcp/asset/3b5d2a25-eaa9-45cc-b255-0c85fd1fb455" />
    </div>
  </div>
);

const TransactionsIcon = ({ active }: { active: boolean }) => active ? (
  <div className="overflow-clip relative size-[24px]">
    <div className="absolute inset-[12.08%_3.35%_12.09%_3.4%]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src="https://www.figma.com/api/mcp/asset/9f4b3667-896e-4f8e-84f3-ff3db0f1bbdf" />
    </div>
  </div>
) : (
  <div className="overflow-clip relative size-[24px]">
    <div className="absolute inset-[29.17%_41.67%]">
      <div className="absolute inset-[-10%_-25%]">
        <img alt="" className="block max-w-none size-full" src="https://www.figma.com/api/mcp/asset/bbbbe5df-e21b-4e9f-8507-7555e90f6a33" />
      </div>
    </div>
    <div className="absolute inset-[16.25%_7.52%_16.25%_7.56%]">
      <div className="absolute inset-[-6.17%_-4.91%]">
        <img alt="" className="block max-w-none size-full" src="https://www.figma.com/api/mcp/asset/a81167fa-846b-456b-a37f-c387ca6add52" />
      </div>
    </div>
  </div>
);

const InsightsIcon = ({ active }: { active: boolean }) => active ? (
  <div className="relative size-[24px]">
    <div className="absolute inset-[18.23%_19.79%_4.69%_19.79%]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src="https://www.figma.com/api/mcp/asset/8d1f58a5-c7fc-4f1b-b42a-eca62f597c3e" />
    </div>
    <div className="absolute inset-[2.08%_2.06%_14.92%_2.1%]">
      <div className="absolute inset-[-5.65%_-9.78%_-16.94%_-9.78%]">
        <img alt="" className="block max-w-none size-full" src="https://www.figma.com/api/mcp/asset/d6d364a2-7a39-41d1-b687-7602abbdc72f" />
      </div>
    </div>
  </div>
) : (
  <div className="relative size-[24px]">
    <div className="absolute inset-[84.93%_38.54%_4.69%_38.54%]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src="https://www.figma.com/api/mcp/asset/8c264f27-02ae-4470-8aec-c56636a70462" />
    </div>
    <div className="absolute inset-[18.23%_19.79%_19.24%_19.79%]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src="https://www.figma.com/api/mcp/asset/78291a4d-ffb1-4a59-bf79-e3f32ebd0c08" />
    </div>
    <div className="absolute bottom-[89.58%] left-1/2 right-1/2 top-[6.25%]">
      <div className="absolute inset-[-100%_-1px]">
        <img alt="" className="block max-w-none size-full" src="https://www.figma.com/api/mcp/asset/b53c5ec7-1ebe-4ee3-9e19-a694184c7711" />
      </div>
    </div>
    <div className="absolute flex inset-[49.98%_6.23%_50.02%_89.6%] items-center justify-center" style={{ containerType: "size" }}>
      <div className="flex-none h-[100cqw] rotate-90 w-[2287600000cqh]">
        <div className="relative size-full">
          <div className="absolute inset-[-100%_-1px]">
            <img alt="" className="block max-w-none size-full" src="https://www.figma.com/api/mcp/asset/5be84bbf-c88f-41d7-bc2a-2d9ad369bf23" />
          </div>
        </div>
      </div>
    </div>
    <div className="absolute flex inset-[49.98%_89.56%_50.02%_6.27%] items-center justify-center" style={{ containerType: "size" }}>
      <div className="flex-none h-[100cqw] rotate-90 w-[2287600000cqh]">
        <div className="relative size-full">
          <div className="absolute inset-[-100%_-1px]">
            <img alt="" className="block max-w-none size-full" src="https://www.figma.com/api/mcp/asset/5be84bbf-c88f-41d7-bc2a-2d9ad369bf23" />
          </div>
        </div>
      </div>
    </div>
    <div className="absolute flex inset-[77.97%_19.03%_19.08%_78.02%] items-center justify-center" style={{ containerType: "size" }}>
      <div className="flex-none h-[hypot(-100cqw,-100cqh)] rotate-135 w-[hypot(-100cqw,100cqh)]">
        <div className="relative size-full">
          <div className="absolute inset-[-100%_-1px]">
            <img alt="" className="block max-w-none size-full" src="https://www.figma.com/api/mcp/asset/8e9818e7-201a-4925-a638-5ef38c7a2028" />
          </div>
        </div>
      </div>
    </div>
    <div className="absolute flex inset-[19.04%_77.95%_78.01%_19.1%] items-center justify-center" style={{ containerType: "size" }}>
      <div className="flex-none h-[hypot(-100cqw,-100cqh)] rotate-135 w-[hypot(-100cqw,100cqh)]">
        <div className="relative size-full">
          <div className="absolute inset-[-100%_-1px]">
            <img alt="" className="block max-w-none size-full" src="https://www.figma.com/api/mcp/asset/8e9818e7-201a-4925-a638-5ef38c7a2028" />
          </div>
        </div>
      </div>
    </div>
    <div className="absolute flex inset-[19.04%_19.03%_78.01%_78.03%] items-center justify-center" style={{ containerType: "size" }}>
      <div className="flex-none h-[hypot(-100cqw,100cqh)] rotate-45 w-[hypot(100cqw,100cqh)]">
        <div className="relative size-full">
          <div className="absolute inset-[-100%_-1px]">
            <img alt="" className="block max-w-none size-full" src="https://www.figma.com/api/mcp/asset/1f61de9c-52ab-4d9b-9b1b-6b8752a2871f" />
          </div>
        </div>
      </div>
    </div>
    <div className="absolute flex inset-[77.97%_77.95%_19.08%_19.1%] items-center justify-center" style={{ containerType: "size" }}>
      <div className="flex-none h-[hypot(-100cqw,100cqh)] rotate-45 w-[hypot(100cqw,100cqh)]">
        <div className="relative size-full">
          <div className="absolute inset-[-100%_-1px]">
            <img alt="" className="block max-w-none size-full" src="https://www.figma.com/api/mcp/asset/1f61de9c-52ab-4d9b-9b1b-6b8752a2871f" />
          </div>
        </div>
      </div>
    </div>
  </div>
);

const NotificationsIcon = ({ active }: { active: boolean }) => (
  <div className="relative size-[24px]">
    <div className="absolute inset-[4.17%_8.33%]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={active ? "https://www.figma.com/api/mcp/asset/53ab837b-84c5-4115-b620-fce90feae4df" : "https://www.figma.com/api/mcp/asset/2264c645-7926-443d-96e0-06d18d9fb764"} />
    </div>
  </div>
);

const CountBadge = ({ count, purple = false }: { count: number; purple?: boolean }) => (
  <div
    className="flex items-center justify-center flex-shrink-0 px-[4px] py-[2px] rounded-[4px]"
    style={{ background: purple ? "rgba(118,49,238,0.18)" : "#222737", minWidth: "18px" }}
  >
    <span style={{ fontFamily: "'Plus Jakarta Sans', Helvetica", fontSize: "12px", lineHeight: "12px", color: purple ? "#9d5cf5" : "#6c779d", textAlign: "center" as const }}>
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

const LogoutConfirmModal = ({ show, onCancel, onConfirm }: { show: boolean; onCancel: () => void; onConfirm: () => void }) => {
  if (!show) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="flex flex-col overflow-hidden rounded-[16px] w-[320px]"
        style={{
          background: "#11141b",
          border: "1px solid #1d2132",
          boxShadow: "0px 68px 27px 0px rgba(0,0,0,0.06), 0px 38px 23px 0px rgba(0,0,0,0.2), 0px 17px 17px 0px rgba(0,0,0,0.34), 0px 4px 9px 0px rgba(0,0,0,0.39)",
        }}
      >
        <div className="flex flex-col gap-[8px] items-center px-[8px] py-[24px] text-center w-full">
          <p className="[font-family:'Gilroy','Plus Jakarta Sans',Helvetica,sans-serif] font-semibold text-[#a8b9f4] text-[20px] leading-[24px] w-full">
            Logout
          </p>
          <p className="[font-family:'Gilroy','Plus Jakarta Sans',Helvetica,sans-serif] font-medium text-[#6c779d] text-[14px] leading-[16px] w-full">
            Are you sure you want to logout?
          </p>
        </div>
        <div className="flex gap-[8px] items-start p-[8px] w-full">
          <button
            data-testid="button-logout-cancel"
            onClick={onCancel}
            className="flex flex-1 items-center justify-center px-[12px] py-[8px] rounded-[100px] hover:opacity-80 transition-opacity"
            style={{ background: "#222737" }}
          >
            <span className="[font-family:'Gilroy','Plus Jakarta Sans',Helvetica,sans-serif] font-semibold text-[#6c779d] text-[12px] leading-[16px] whitespace-nowrap">Cancel</span>
          </button>
          <button
            data-testid="button-logout-confirm"
            onClick={onConfirm}
            className="flex flex-1 items-center justify-center px-[12px] py-[8px] rounded-[100px] hover:opacity-80 transition-opacity"
            style={{ background: "#350011" }}
          >
            <span className="[font-family:'Gilroy','Plus Jakarta Sans',Helvetica,sans-serif] font-semibold text-[#d20344] text-[12px] leading-[16px] whitespace-nowrap">Confirm</span>
          </button>
        </div>
      </div>
    </div>
  );
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
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
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
    if (path === "/dashboard") return location === "/" || location === "" || location.startsWith("/dashboard");
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
          ${insightsOpen ? "visible opacity-100 translate-x-0 pointer-events-auto" : "invisible opacity-0 -translate-x-4 pointer-events-none"}
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
            <span className="[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-[#6c779d] text-[20px] leading-[24px]">Insights</span>
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
              <p style={{ fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif", fontSize: "12px", lineHeight: "16px", color: "#6c779d" }}>
                Brain AI is analysing your accounts…
              </p>
            </div>
          ) : (
            <p style={{ fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif", fontSize: "12px", lineHeight: "16px", color: "#414965" }}>
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
                      fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif",
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
                      fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif",
                      fontSize: "13px",
                      lineHeight: "19px",
                      color: "#d0d8f0",
                    }}
                  >
                    {insight.text}
                  </p>
                  <span
                    style={{
                      fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif",
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
          <p style={{ fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif", fontSize: "11px", lineHeight: "15px", color: "#414965", textAlign: "center" as const }}>
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
        className={`fixed inset-0 z-30 transition-opacity duration-300 bg-black/50 ${notificationsOpen ? "visible opacity-100 pointer-events-auto" : "invisible opacity-0 pointer-events-none"}`}
        onClick={() => setNotificationsOpen(false)}
      />
      <div
        ref={notifPanelRef}
        className={`fixed z-40 top-[68px] flex flex-col w-[340px] rounded-2xl border border-[#1e2235] bg-[#0d1017] shadow-[0_20px_60px_rgba(0,0,0,0.7)]
          transition-all duration-300 ease-out overflow-hidden
          ${notificationsOpen ? "visible opacity-100 translate-y-0 pointer-events-auto" : "invisible opacity-0 -translate-y-2 pointer-events-none"}
        `}
        style={{ left: collapsed ? "76px" : "280px" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-[16px] py-[16px]">
          <span className="[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-[#6c779d] text-[20px] leading-[24px]">Notifications</span>
          <div className="flex items-center gap-2">
            <button
              onClick={markAllRead}
              className="h-6 flex items-center px-[10px] rounded-[100px] bg-[#222737] [font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[12px] leading-[16px] hover:opacity-80 transition-opacity"
            >
              Mark all read
            </button>
            <button
              onClick={() => setNotificationsOpen(false)}
              className="w-6 h-6 flex items-center justify-center rounded-full bg-[#222737] text-[#6c779d] hover:opacity-80 transition-opacity"
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
              <span className="text-xs [font-family:'Plus Jakarta Sans',Helvetica]">No notifications</span>
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
                <p className={`text-[13px] leading-snug [font-family:'Plus Jakarta Sans',Helvetica] ${!n.read ? "text-[#f97316]" : "text-[#8899bb]"}`}>
                  {n.title}
                </p>
                <p className="text-[11px] text-[#6c779d] [font-family:'Plus Jakarta Sans',Helvetica] mt-1 leading-relaxed">{n.body}</p>
                <p className="text-[11px] text-[#414965] [font-family:'Plus Jakarta Sans',Helvetica] mt-1">{n.time}</p>
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
          <Link href="/notifications" className="outline-none focus:outline-none">
            <button
              onClick={() => setNotificationsOpen(false)}
              className="w-full flex items-center justify-center gap-2 py-[10px] bg-[#222737] hover:opacity-80 transition-opacity rounded-[100px]"
            >
              <span className="[font-family:'Plus Jakarta Sans',Helvetica] font-medium text-[#6c779d] text-sm">View All Notifications</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8H13M9 4L13 8L9 12" stroke="#6c779d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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
            ${chatHistoryOpen ? "visible opacity-100 translate-x-0 pointer-events-auto" : "invisible opacity-0 -translate-x-4 pointer-events-none"}
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
                fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif",
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
                <p style={{ fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif", fontSize: "13px", lineHeight: "18px", color: "#414965" }}>
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
                        fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif",
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
                                fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif",
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
                                <span style={{ fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif", fontSize: "13px", color: "#6c779d" }}>
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
                                <span style={{ fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif", fontSize: "13px", color: "#d20344" }}>
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
        <InsightsPanel />
        <ChatHistoryPanel />
        <LogoutConfirmModal show={showLogoutConfirm} onCancel={() => setShowLogoutConfirm(false)} onConfirm={() => { setShowLogoutConfirm(false); onLogout?.(); }} />
        <nav className="flex flex-col w-[60px] h-full rounded-[16px] border border-solid border-[#1d2132] bg-[#11141b] flex-shrink-0">
          <div className="flex flex-col flex-1 items-center mt-2 gap-1 w-full px-[7px]">
            {/* Expand button — top of collapsed sidebar (rounded-full, 40px) */}
            <button
              onClick={onToggle}
              title="Expand menu"
              className="w-[40px] h-[40px] flex-shrink-0 flex items-center justify-center rounded-[100px] mb-0"
              style={{ background: "#222737" }}
            >
              <ExpandIcon />
            </button>

            {/* Brain logo icon — below expand button */}
            <div className="w-[40px] h-[40px] flex-shrink-0 flex items-center justify-center">
              <img
                className="w-[32px] h-[32px] object-contain"
                alt="Brain"
                src="/figmaAssets/brain2x.png"
              />
            </div>

            {/* Dashboard — first item */}
            <Link href="/dashboard" className="outline-none focus:outline-none">
              <button title="Dashboard" className={`flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${isActive("/dashboard") ? "bg-brain-v1highlight-dropdown-bg" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}>
                <DashboardIcon active={isActive("/dashboard")} />
              </button>
            </Link>

            {mainMenuItems.map((item) => (
              <div key={item.id} className="w-full flex flex-col items-center">
                <Link href={item.path} className="outline-none focus:outline-none">
                  <button title={item.label} className={`flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${isActive(item.path) ? "bg-brain-v1highlight-dropdown-bg" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}>
                    {item.id === "agents" && <AgentsIcon active={isActive(item.path)} />}
                    {item.id === "marketplace" && <MarketplaceIcon active={isActive(item.path)} />}
                  </button>
                </Link>
              </div>
            ))}

            <div className="w-8 h-px bg-[#1d2132] my-1" />

            <button title="Notifications" onClick={() => setNotificationsOpen((v) => !v)} className={`relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${notificationsOpen ? "bg-brain-v1baby-blue-30" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}>
              <NotificationsIcon active={notificationsOpen} />
              {unreadCount > 0 && (
                <div className="absolute -top-0.5 -right-0.5 flex items-center justify-center px-[4px] py-[1px] rounded-[4px] min-w-[14px]" style={{ background: "#1a1f2e" }}>
                  <span style={{ fontFamily: "'Plus Jakarta Sans', Helvetica", fontSize: "9px", lineHeight: "13px", color: "#6c779d" }}>{unreadCount}</span>
                </div>
              )}
            </button>

            <button title="Insights" onClick={() => setInsightsOpen((v) => !v)} className={`flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${insightsOpen ? "bg-brain-v1baby-blue-30" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}>
              <InsightsIcon active={insightsOpen} />
            </button>

          </div>

          <div className="flex flex-col items-center gap-2 pb-4 mt-auto pt-4 px-2">
            <button title="Create Agent" onClick={onCreateAgent} className="flex items-center justify-center w-9 h-9 bg-[#4a2300] rounded-full hover:opacity-80 transition-opacity">
              <img className="w-5 h-5" alt="Create" src="/figmaAssets/create-agent-icon.svg" />
            </button>
            <button title="Logout" onClick={() => setShowLogoutConfirm(true)} className="flex items-center justify-center w-9 h-9 bg-[#350011] rounded-full hover:opacity-80 transition-opacity">
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
      <InsightsPanel />
      <ChatHistoryPanel />
      <LogoutConfirmModal show={showLogoutConfirm} onCancel={() => setShowLogoutConfirm(false)} onConfirm={() => { setShowLogoutConfirm(false); onLogout?.(); }} />
      <nav className="flex flex-col w-[264px] h-full rounded-[16px] border border-solid border-[#1d2132] bg-[#11141b] flex-shrink-0">
        {/* Brain logo row — collapse button lives here on the right */}
        <div className="flex items-center px-3 pt-3 pb-0 flex-shrink-0 h-[40px]">
          <div className="flex items-center flex-1 min-w-0">
            <img
              className="h-[32px] object-contain flex-shrink-0"
              alt="Brain"
              src="/figmaAssets/brainfull2x.png"
            />
          </div>
          <button
            onClick={onToggle}
            title="Collapse menu"
            className="w-[40px] h-[40px] flex-shrink-0 flex items-center justify-center rounded-[100px]"
            style={{ background: "rgba(168,185,244,0.15)" }}
          >
            <CollapseIcon />
          </button>
        </div>

        <div className="flex flex-col flex-1 mx-2 mt-4 gap-4 pb-0 overflow-y-auto min-h-0">
          {/* Main Menu */}
          <div className="flex flex-col items-start gap-1 w-full">
            <div className="flex items-center px-2 py-0 w-full">
              <span className="[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-brain-v1baby-blue-30 text-xs tracking-[0] leading-4">Main Menu</span>
            </div>

            <div className="flex flex-col items-start gap-1 w-full">
              {/* Dashboard — first item */}
              <Link href="/dashboard" className="w-full outline-none focus:outline-none">
                <button className={`flex items-center gap-2 p-2 w-full rounded-xl cursor-pointer transition-colors ${isActive("/dashboard") ? "bg-brain-v1highlight-dropdown-bg" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}>
                  <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
                    <DashboardIcon active={isActive("/dashboard")} />
                  </div>
                  <span className={`[font-family:'Plus Jakarta Sans',Helvetica] font-medium text-base tracking-[0] leading-5 whitespace-nowrap text-left flex-1 ${isActive("/dashboard") ? "text-brain-v1white" : "text-brain-v1baby-blue-60"}`}>
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
                  <Link href={item.path} className="w-full outline-none focus:outline-none">
                    <button className={`flex items-center gap-2 p-2 w-full rounded-xl cursor-pointer transition-colors ${isActive(item.path) ? "bg-brain-v1highlight-dropdown-bg" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}>
                      <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
                        {item.id === "agents" && <AgentsIcon active={isActive(item.path)} />}
                        {item.id === "marketplace" && <MarketplaceIcon active={isActive(item.path)} />}
                      </div>
                      <span className={`[font-family:'Plus Jakarta Sans',Helvetica] font-medium text-base tracking-[0] leading-5 whitespace-nowrap text-left flex-1 ${isActive(item.path) ? "text-brain-v1white" : "text-brain-v1baby-blue-60"}`}>
                        {item.label}
                      </span>
                      {isActive(item.path) && (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0 text-[#414965]">
                          <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  </Link>
                </div>
              ))}
            </div>
          </div>

          <Separator className="w-full bg-[#1d2132]" />

          {/* Other section */}
          <div className="flex flex-col items-start gap-1 w-full">
            <div className="flex items-center justify-center gap-2 px-2 py-0 w-full">
              <span className="flex-1 [font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-brain-v1baby-blue-30 text-xs tracking-[0] leading-4">Other</span>
            </div>

            <button
              onClick={() => setNotificationsOpen((v) => !v)}
              className={`flex items-center gap-2 p-2 w-full rounded-xl cursor-pointer transition-colors ${notificationsOpen ? "bg-brain-v1highlight-dropdown-bg" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}
            >
              <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
                <NotificationsIcon active={notificationsOpen} />
              </div>
              <span className={`[font-family:'Plus Jakarta Sans',Helvetica] font-medium text-base tracking-[0] leading-5 whitespace-nowrap text-left flex-1 ${notificationsOpen ? "text-white" : "text-brain-v1baby-blue-60"}`}>Notifications</span>
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
              onClick={() => setInsightsOpen((v) => !v)}
              className={`flex items-center gap-2 p-2 w-full rounded-xl cursor-pointer transition-colors ${insightsOpen ? "bg-brain-v1highlight-dropdown-bg" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}
            >
              <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
                <InsightsIcon active={insightsOpen} />
              </div>
              <span className={`[font-family:'Plus Jakarta Sans',Helvetica] font-medium text-base tracking-[0] leading-5 whitespace-nowrap text-left flex-1 ${insightsOpen ? "text-white" : "text-brain-v1baby-blue-60"}`}>Insights</span>
              {insightsOpen && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0 text-[#414965]">
                  <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>

          </div>
        </div>

        {/* Bottom buttons */}
        <div className="flex flex-col items-start gap-2 mx-2 mb-4 mt-auto pt-4">
          <button onClick={onCreateAgent} className="flex items-center justify-center gap-2 px-5 py-2 w-full bg-[#4a2300] rounded-[100px] hover:opacity-80 transition-opacity">
            <img className="w-6 h-6 flex-shrink-0" alt="Create" src="/figmaAssets/create-agent-icon.svg" />
            {!collapsed && <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#ff9500] text-base font-semibold leading-5 whitespace-nowrap">Create Agent</span>}
          </button>
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="flex items-center justify-center gap-2 px-5 py-2 w-full bg-[#350011] rounded-[100px] hover:opacity-80 transition-opacity"
          >
            <img className="w-6 h-6 flex-shrink-0" alt="Logout" src="/figmaAssets/logout-icon.svg" />
            {!collapsed && <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#d20344] text-base font-semibold leading-5 whitespace-nowrap">Logout</span>}
          </button>
        </div>
      </nav>
    </>
  );
};
