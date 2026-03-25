import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { Separator } from "@/components/ui/separator";
import {
  getChatSessions,
  deleteChatSession,
  formatSessionTime,
  type ChatSession,
} from "@/lib/chatHistory";
import { ShareModal } from "@/components/ShareModal";

const mainMenuItems = [
  { id: "assistant", label: "Assistant", icon: "/figmaAssets/navbar-icons.svg", activeIcon: "/figmaAssets/nav-assistant-active.png", path: "/assistant", emoji: null },
  { id: "agents", label: "Agents", icon: "/figmaAssets/navbar-icons-1.svg", activeIcon: "/figmaAssets/nav-agent-active.png", path: "/agents", emoji: null },
  { id: "launchpad", label: "Launchpad", icon: "/figmaAssets/navbar-icons-launchpad.svg", activeIcon: "/figmaAssets/nav-launchpad-active.png", path: "/launchpad", emoji: null },
  { id: "marketplace", label: "Marketplace", icon: "/figmaAssets/navbar-icons-3.svg", activeIcon: "/figmaAssets/nav-marketplace-active.png", path: "/", emoji: null },
];

const initialNotifications = [
  { id: "1", title: "AlphaFlow executed a trade", body: "Bought 0.45 ETH at $2,498", time: "2m ago", read: false },
  { id: "2", title: "SwarmAlpha just launched 🚀", body: "New agent is now live on the Launchpad", time: "15m ago", read: false },
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

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  onCreateAgent: () => void;
}

export const NavigationMenuSection = ({ collapsed, onToggle, onCreateAgent }: Props): JSX.Element => {
  const [location, navigate] = useLocation();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const notifPanelRef = useRef<HTMLDivElement>(null);
  const historyPanelRef = useRef<HTMLDivElement>(null);

  const isActive = (path: string) => {
    if (path === "/") return location === "/" || location === "";
    return location.startsWith(path);
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () => setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  const dismiss = (id: string) => setNotifications((prev) => prev.filter((n) => n.id !== id));

  const loadSessions = () => setChatSessions(getChatSessions());

  useEffect(() => {
    loadSessions();
    window.addEventListener("chat-sessions-updated", loadSessions);
    return () => window.removeEventListener("chat-sessions-updated", loadSessions);
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
      }
    };
    if (notificationsOpen || chatHistoryOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notificationsOpen, chatHistoryOpen]);

  const openSession = (id: string) => {
    setChatHistoryOpen(false);
    navigate(`/assistant?session=${id}`);
  };

  const removeSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteChatSession(id);
    loadSessions();
  };

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
              {/* Ethereum circle avatar */}
              <div className="w-9 h-9 rounded-full bg-[#1a1f30] flex items-center justify-center flex-shrink-0 mt-0.5">
                <EthIcon />
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

  // ── Group sessions by "Mon YYYY" ──
  const groupSessionsByMonth = (sessions: ChatSession[]) => {
    const groups: { label: string; sessions: ChatSession[] }[] = [];
    sessions.forEach((sess) => {
      const date = new Date(sess.updatedAt);
      const label = date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      const existing = groups.find((g) => g.label === label);
      if (existing) existing.sessions.push(sess);
      else groups.push({ label, sessions: [sess] });
    });
    return groups;
  };

  // Get the currently open session id from the URL
  const currentSessionId = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("session")
    : null;

  // ── Chat history popup panel (Figma 3146-45912) ──
  const ChatHistoryPanel = () => {
    const grouped = groupSessionsByMonth(chatSessions);
    return (
      <>
        {/* Dim overlay */}
        {chatHistoryOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 backdrop-blur-[1px] transition-opacity duration-300"
            onClick={() => setChatHistoryOpen(false)}
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
            boxShadow: "0px_68px_27px_0px_rgba(0,0,0,0.06),0px_38px_23px_0px_rgba(0,0,0,0.2),0px_17px_17px_0px_rgba(0,0,0,0.34),0px_4px_9px_0px_rgba(0,0,0,0.39)".replace(/_/g, " "),
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
              onClick={() => setChatHistoryOpen(false)}
              className="flex items-center justify-center flex-shrink-0 hover:opacity-70 transition-opacity"
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "100px",
                background: "#1d2132",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1L9 9M9 1L1 9" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* ── Scrollable content ── */}
          <div className="flex-1 overflow-y-auto" style={{ padding: "8px" }}>
            {chatSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center" style={{ color: "#414965" }}>
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <path d="M4 7h20M4 14h14M4 21h8" stroke="#414965" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <p style={{ fontFamily: "'Gilroy-Medium', Helvetica, sans-serif", fontSize: "13px", lineHeight: "18px", color: "#414965" }}>
                  No chat history yet.<br />Start a conversation with Brain AI.
                </p>
              </div>
            ) : (
              <div className="flex flex-col" style={{ gap: "16px" }}>
                {grouped.map((group) => (
                  <div key={group.label} className="flex flex-col" style={{ gap: "8px" }}>
                    {/* Month label */}
                    <div style={{ paddingLeft: "8px" }}>
                      <span style={{
                        fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif",
                        fontWeight: 600,
                        fontSize: "14px",
                        lineHeight: "16px",
                        color: "#414965",
                        whiteSpace: "nowrap",
                      }}>
                        {group.label}
                      </span>
                    </div>
                    {/* Session cards */}
                    {group.sessions.map((sess) => {
                      const isActive = sess.id === currentSessionId;
                      return (
                        <button
                          key={sess.id}
                          onClick={() => openSession(sess.id)}
                          className="w-full text-left flex items-start justify-between hover:opacity-80 transition-opacity"
                          style={{
                            background: isActive ? "#4a2300" : "#06070a",
                            borderRadius: "8px",
                            padding: "8px",
                            gap: "8px",
                          }}
                        >
                          <span
                            className="flex-1 truncate"
                            style={{
                              fontFamily: "'Gilroy-Medium', Helvetica, sans-serif",
                              fontSize: "14px",
                              lineHeight: "16px",
                              color: isActive ? "#ff9500" : "#6c779d",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {sess.title}
                          </span>
                          {isActive && (
                            /* Vertical 3-dot more icon */
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
                              <circle cx="8" cy="3" r="1.5" fill="#ff9500" />
                              <circle cx="8" cy="8" r="1.5" fill="#ff9500" />
                              <circle cx="8" cy="13" r="1.5" fill="#ff9500" />
                            </svg>
                          )}
                        </button>
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
        <nav className="flex flex-col w-[60px] h-full rounded-3xl border border-solid border-[#1d2132] bg-brain-v1baby-blue-5 flex-shrink-0">
          {/* Logo icon (collapsed) */}
          <div className="flex items-center justify-center pt-3 pb-1 flex-shrink-0">
            <img
              className="w-8 h-8 object-contain"
              alt="Brain"
              src="/figmaAssets/frame-1000002163.svg"
            />
          </div>

          <div className="flex flex-col flex-1 items-center mt-1 gap-1 w-full px-2">
            <button onClick={onToggle} title="Expand menu" className="w-9 h-9 flex items-center justify-center bg-brain-v1baby-blue-15 rounded-xl hover:bg-brain-v1baby-blue-30 transition-colors mb-1">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 2L10 7L5 12" stroke="#8899bb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>

            {mainMenuItems.map((item) => (
              <div key={item.id} className="w-full flex flex-col items-center">
                {item.id === "assistant" ? (
                  <div className="relative w-full flex flex-col items-center">
                    <Link href={item.path}>
                      <button title={item.label} className={`flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${isActive(item.path) ? "bg-brain-v1highlight-dropdown-bg" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}>
                        <img className="w-5 h-5" alt={item.label} src={isActive(item.path) ? item.activeIcon : item.icon} />
                      </button>
                    </Link>
                    <button
                      title="Chat History"
                      onClick={() => setChatHistoryOpen((v) => !v)}
                      className={`w-5 h-3 flex items-center justify-center rounded transition-colors ${chatHistoryOpen ? "text-brain-v1light-orange" : "text-brain-v1baby-blue-30 hover:text-brain-v1white"}`}
                    >
                      <svg width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 1L4 4L7 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                    </button>
                  </div>
                ) : (
                  <Link href={item.path}>
                    <button title={item.label} className={`flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${isActive(item.path) ? "bg-brain-v1highlight-dropdown-bg" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}>
                      <img className="w-5 h-5" alt={item.label} src={isActive(item.path) ? item.activeIcon : item.icon} />
                    </button>
                  </Link>
                )}
              </div>
            ))}

            <div className="w-8 h-px bg-[#1d2132] my-1" />

            <button title="Notifications" onClick={() => setNotificationsOpen((v) => !v)} className={`relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${notificationsOpen ? "bg-brain-v1baby-blue-30" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}>
              <img className="w-5 h-5" alt="Notifications" src={notificationsOpen ? "/figmaAssets/nav-notifications-active.png" : "/figmaAssets/notif-icon.svg"} />
              {unreadCount > 0 && (
                <div className="absolute top-0 right-0 flex items-center justify-center p-[2px] bg-[#414965] rounded-[4px] min-w-[14px]">
                  <span className="text-[9px] text-[#a8b9f4] [font-family:'Gilroy-SemiBold',Helvetica] leading-none">{unreadCount}</span>
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
      <nav className="flex flex-col w-[264px] h-full rounded-3xl border border-solid border-[#1d2132] bg-brain-v1baby-blue-5 flex-shrink-0">
        {/* Brain logo */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-2 flex-shrink-0">
          <img
            className="w-[36px] h-[37px] object-contain flex-shrink-0"
            alt="Brain"
            src="/figmaAssets/frame-1000002163.svg"
          />
          <div className="[font-family:'Gridular-Regular',Helvetica] font-normal text-transparent text-[26px] leading-7 whitespace-nowrap select-none">
            <span className="text-[#7631ee]">br</span>
            <span className="text-[#ffffff]">ai</span>
            <span className="text-[#7631ee]">n</span>
          </div>
        </div>

        <div className="flex flex-col flex-1 mx-2 gap-4 pb-0 overflow-y-auto min-h-0">
          {/* Main Menu */}
          <div className="flex flex-col items-start gap-1 w-full">
            <div className="flex items-center justify-between px-2 py-0 w-full">
              <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-30 text-xs tracking-[0] leading-4">Main Menu</span>
              <button
                onClick={onToggle}
                title="Collapse menu"
                className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0 hover:opacity-80 transition-opacity"
              >
                <img src="/figmaAssets/nav-collapse-icon.png" alt="Collapse" className="w-full h-full" />
              </button>
            </div>

            <div className="flex flex-col items-start gap-1 w-full">
              {mainMenuItems.map((item) => (
                <div key={item.id} className="w-full">
                  {item.id === "assistant" ? (
                    <div className="flex flex-col w-full">
                      <div className="flex items-center w-full group">
                        <Link href={item.path} className="flex-1">
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
                        {/* History toggle chevron */}
                        <button
                          onClick={() => setChatHistoryOpen((v) => !v)}
                          title="Chat History"
                          className={`w-7 h-8 flex items-center justify-center rounded-lg transition-colors flex-shrink-0 ${chatHistoryOpen ? "text-brain-v1light-orange bg-brain-v1baby-blue-15" : "text-brain-v1baby-blue-30 hover:text-brain-v1white hover:bg-brain-v1baby-blue-15"}`}
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`transition-transform duration-200 ${chatHistoryOpen ? "rotate-180" : ""}`}>
                            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    </div>
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
                <div className={`flex items-center justify-center p-[2px] rounded-[4px] ${notificationsOpen ? "bg-[#7631ee]" : "bg-[#414965]"}`}>
                  <span className={`[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[12px] leading-[12px] whitespace-nowrap ${notificationsOpen ? "text-[#240757]" : "text-[#a8b9f4]"}`}>{unreadCount}</span>
                </div>
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
              <button className={`flex items-center gap-2 p-2 w-full rounded-xl cursor-pointer transition-colors ${isActive("/settings") ? "bg-brain-v1baby-blue-15" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}>
                <img className="w-6 h-6 flex-shrink-0" alt="Settings" src="/figmaAssets/navbar-icons-5.svg" />
                <span className="text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] font-medium text-base tracking-[0] leading-5 whitespace-nowrap text-left flex-1">Settings</span>
              </button>
            </Link>
          </div>
        </div>

        {/* Bottom buttons */}
        <div className="flex flex-col items-start gap-2 mx-2 mb-4 mt-auto pt-4">
          <button onClick={onCreateAgent} className="flex items-center justify-center gap-2 px-5 py-2 w-full bg-[#4a2300] rounded-[100px] hover:opacity-80 transition-opacity">
            <img className="w-6 h-6 flex-shrink-0" alt="Create" src="/figmaAssets/create-agent-icon.svg" />
            <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#ff9500] text-base font-semibold leading-5 whitespace-nowrap">Create Agent</span>
          </button>
          <button className="flex items-center justify-center gap-2 px-5 py-2 w-full bg-[#350011] rounded-[100px] hover:opacity-80 transition-opacity">
            <img className="w-6 h-6 flex-shrink-0" alt="Logout" src="/figmaAssets/logout-icon.svg" />
            <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#d20344] text-base font-semibold leading-5 whitespace-nowrap">Logout</span>
          </button>
        </div>
      </nav>
    </>
  );
};
