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
  { id: "launchpad", label: "Launchpad", icon: "/figmaAssets/navbar-icons-3.svg", path: "/launchpad", emoji: "🚀" },
  { id: "assistant", label: "Assistant", icon: "/figmaAssets/navbar-icons.svg", path: "/assistant", emoji: null },
  { id: "agents", label: "Agents", icon: "/figmaAssets/navbar-icons-1.svg", path: "/agents", emoji: null },
  { id: "marketplace", label: "Marketplace", icon: "/figmaAssets/navbar-icons-3.svg", path: "/", emoji: null },
];

const initialNotifications = [
  { id: "1", title: "AlphaFlow executed a trade", body: "Bought 0.45 ETH at $2,498", time: "2m ago", read: false, icon: "⚡" },
  { id: "2", title: "SwarmAlpha just launched 🚀", body: "New agent is now live on the Launchpad", time: "8m ago", read: false, icon: "🚀" },
  { id: "3", title: "Risk Sentinel: Anomaly detected", body: "Unusual volatility in BNB/USDC pair", time: "22m ago", read: false, icon: "⚠️" },
  { id: "4", title: "Capital rebalanced successfully", body: "Portfolio adjusted to target weights", time: "1h ago", read: true, icon: "✅" },
  { id: "5", title: "New agent available on Marketplace", body: "YieldMax v2 is now available", time: "3h ago", read: true, icon: "🤖" },
];

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

  // ── Slide-in notifications panel ──
  const NotificationsPanel = () => (
    <>
      {/* Dim overlay behind the panel */}
      <div
        className={`fixed inset-0 z-30 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 ${notificationsOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={() => setNotificationsOpen(false)}
      />
    <div
      ref={notifPanelRef}
      className={`fixed z-40 top-[72px] flex flex-col gap-0 w-[300px] rounded-2xl border border-[#1d2131] bg-[#0d1017] shadow-2xl
        transition-all duration-300 ease-out
        ${notificationsOpen ? "opacity-100 translate-x-0 pointer-events-auto" : "opacity-0 -translate-x-4 pointer-events-none"}
      `}
      style={{ left: collapsed ? "76px" : "280px" }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1d2131]">
        <div className="flex items-center gap-2">
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-sm">Notifications</span>
          {unreadCount > 0 && (
            <div className="inline-flex items-center justify-center px-1.5 py-0.5 bg-brain-v1dark-orange rounded-full">
              <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1light-orange text-[10px] leading-3">{unreadCount}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-[10px] [font-family:'Gilroy-SemiBold',Helvetica] text-brain-v1baby-blue-30 hover:text-brain-v1white transition-colors">Mark all read</button>
          )}
          <button onClick={() => setNotificationsOpen(false)} className="w-6 h-6 flex items-center justify-center rounded-lg bg-brain-v1baby-blue-15 hover:bg-brain-v1baby-blue-30 transition-colors text-brain-v1baby-blue-60 hover:text-brain-v1white">
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>
      <div className="flex flex-col overflow-y-auto max-h-[420px]">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-brain-v1baby-blue-30">
            <span className="text-2xl">🔔</span>
            <span className="text-xs [font-family:'Gilroy-Medium',Helvetica]">No notifications</span>
          </div>
        ) : notifications.map((n, i) => (
          <div key={n.id} className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-brain-v1baby-blue-15 group ${i < notifications.length - 1 ? "border-b border-[#1d2131]" : ""} ${!n.read ? "bg-brain-v1baby-blue-5" : ""}`}>
            <div className="w-8 h-8 rounded-xl bg-brain-v1baby-blue-15 flex items-center justify-center text-base flex-shrink-0 mt-0.5">{n.icon}</div>
            <div className="flex-1 min-w-0">
              <p className={`text-xs leading-relaxed [font-family:'Gilroy-SemiBold',Helvetica] ${n.read ? "text-brain-v1baby-blue-60" : "text-brain-v1white"}`}>{n.title}</p>
              <p className="text-[11px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica] mt-0.5 leading-relaxed">{n.body}</p>
              <p className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica] mt-1">{n.time}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              {!n.read && <div className="w-2 h-2 bg-brain-v1dark-orange rounded-full" />}
              <button onClick={(e) => { e.stopPropagation(); dismiss(n.id); }} className="opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded bg-brain-v1baby-blue-15 hover:bg-brain-v1baby-blue-30">
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 1L7 7M7 1L1 7" stroke="#8899bb" strokeWidth="1.2" strokeLinecap="round" /></svg>
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="px-4 py-3 border-t border-[#1d2131]">
        <Link href="/notifications">
          <button onClick={() => setNotificationsOpen(false)} className="w-full py-2 text-[11px] text-brain-v1baby-blue-30 hover:text-brain-v1white [font-family:'Gilroy-SemiBold',Helvetica] transition-colors text-center rounded-xl hover:bg-brain-v1baby-blue-15">
            View all notifications →
          </button>
        </Link>
      </div>
    </div>
    </>
  );

  // ── Chat history slide-out panel ──
  const ChatHistoryPanel = () => (
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
        className={`fixed z-40 top-[72px] bottom-[72px] flex flex-col w-[280px] rounded-2xl border border-[#1d2131] bg-[#0d1017] shadow-2xl
          transition-all duration-300 ease-out
          ${chatHistoryOpen ? "opacity-100 translate-x-0 pointer-events-auto" : "opacity-0 -translate-x-4 pointer-events-none"}
        `}
        style={{ left: collapsed ? "76px" : "280px" }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1d2131] flex-shrink-0">
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-sm">Chat History</span>
          <button onClick={() => setChatHistoryOpen(false)} className="w-6 h-6 flex items-center justify-center rounded-lg bg-brain-v1baby-blue-15 hover:bg-brain-v1baby-blue-30 transition-colors text-brain-v1baby-blue-60 hover:text-brain-v1white">
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {chatSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-brain-v1baby-blue-30 px-4 text-center">
              <span className="text-3xl">💬</span>
              <p className="text-xs [font-family:'Gilroy-Medium',Helvetica] leading-relaxed">
                No chat history yet. Start a conversation with Brain AI.
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              {chatSessions.map((sess, i) => (
                <div
                  key={sess.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openSession(sess.id)}
                  onKeyDown={(e) => e.key === "Enter" && openSession(sess.id)}
                  className={`flex items-start gap-3 px-4 py-3 hover:bg-brain-v1baby-blue-15 transition-colors text-left group w-full cursor-pointer ${i < chatSessions.length - 1 ? "border-b border-[#1d2131]" : ""}`}
                >
                  <div className="w-8 h-8 rounded-xl bg-brain-v1dark-purple flex items-center justify-center flex-shrink-0 mt-0.5">
                    <div className="w-3 h-3 bg-brain-v1purple rounded-full opacity-80" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs [font-family:'Gilroy-SemiBold',Helvetica] text-brain-v1white truncate">{sess.title}</p>
                    <p className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica] mt-0.5">
                      {formatSessionTime(sess.updatedAt)} · {sess.messages.length - 1} messages
                    </p>
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); removeSession(e as unknown as React.MouseEvent<HTMLButtonElement>, sess.id); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); removeSession(e as unknown as React.MouseEvent<HTMLButtonElement>, sess.id); } }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 w-5 h-5 flex items-center justify-center rounded bg-brain-v1baby-blue-15 hover:bg-brain-v1dark-pink-red cursor-pointer"
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 1L7 7M7 1L1 7" stroke="#8899bb" strokeWidth="1.2" strokeLinecap="round" /></svg>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-[#1d2131] flex-shrink-0">
          <button
            onClick={() => { setChatHistoryOpen(false); navigate("/assistant"); window.dispatchEvent(new Event("new-chat")); }}
            className="w-full py-2.5 bg-brain-v1dark-orange rounded-xl text-brain-v1light-orange text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold hover:opacity-80 transition-opacity"
          >
            + New Chat
          </button>
        </div>
      </div>
    </>
  );

  if (collapsed) {
    return (
      <>
        <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} />
        <NotificationsPanel />
        <ChatHistoryPanel />
        <nav className="flex flex-col w-[60px] min-h-[calc(100vh-130px)] rounded-3xl border border-solid border-[#1d2132] bg-brain-v1baby-blue-5 flex-shrink-0">
          <div className="flex flex-col flex-1 items-center mt-2 gap-1 pt-2 w-full px-2">
            <button onClick={onToggle} title="Expand menu" className="w-9 h-9 flex items-center justify-center bg-brain-v1baby-blue-15 rounded-xl hover:bg-brain-v1baby-blue-30 transition-colors mb-1">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 2L10 7L5 12" stroke="#8899bb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>

            {mainMenuItems.map((item) => (
              <div key={item.id} className="w-full flex flex-col items-center">
                {item.id === "assistant" ? (
                  <div className="relative w-full flex flex-col items-center">
                    <Link href={item.path}>
                      <button title={item.label} className={`flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${isActive(item.path) ? "bg-brain-v1highlight-dropdown-bg" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}>
                        <img className="w-5 h-5" alt={item.label} src={item.icon} />
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
                      <img className="w-5 h-5" alt={item.label} src={item.icon} />
                    </button>
                  </Link>
                )}
              </div>
            ))}

            <div className="w-8 h-px bg-[#1d2132] my-1" />

            <button title="Notifications" onClick={() => setNotificationsOpen((v) => !v)} className={`relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${notificationsOpen ? "bg-brain-v1baby-blue-30" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}>
              <img className="w-5 h-5" alt="Notifications" src="/figmaAssets/navbar-icons-2.svg" />
              {unreadCount > 0 && (
                <div className="absolute top-0 right-0 w-4 h-4 bg-brain-v1dark-orange rounded-full flex items-center justify-center">
                  <span className="text-[8px] text-white [font-family:'Gilroy-SemiBold',Helvetica]">{unreadCount}</span>
                </div>
              )}
            </button>

            <button
              title="Invite Friends"
              onClick={() => setShareOpen(true)}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="7" cy="6" r="3" stroke="#8899bb" strokeWidth="1.3" />
                <path d="M1 15c0-3.314 2.686-5 6-5" stroke="#8899bb" strokeWidth="1.3" strokeLinecap="round" />
                <path d="M14 10v6M11 13h6" stroke="#42bf23" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>

            <Link href="/settings">
              <button title="Settings" className="flex items-center justify-center w-9 h-9 rounded-xl bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15 transition-colors">
                <img className="w-5 h-5" alt="Settings" src="/figmaAssets/navbar-icons-5.svg" />
              </button>
            </Link>
          </div>

          <div className="flex flex-col items-center gap-2 pb-4 mt-auto pt-4 px-2">
            <button title="Create Agent" onClick={onCreateAgent} className="flex items-center justify-center w-9 h-9 bg-brain-v1dark-orange rounded-full hover:opacity-80 transition-opacity">
              <img className="w-4 h-4" alt="Create" src="/figmaAssets/icons-24.svg" />
            </button>
            <button title="Logout" className="flex items-center justify-center w-9 h-9 bg-brain-v1dark-pink-red rounded-full hover:opacity-80 transition-opacity">
              <img className="w-4 h-4" alt="Logout" src="/figmaAssets/icons-10.svg" />
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
      <nav className="flex flex-col w-[264px] min-h-[calc(100vh-130px)] rounded-3xl border border-solid border-[#1d2132] bg-brain-v1baby-blue-5 flex-shrink-0">
        <div className="flex flex-col flex-1 mx-2 mt-2 gap-4 pt-2 pb-0 overflow-y-auto">
          {/* Main Menu */}
          <div className="flex flex-col items-start gap-1 w-full">
            <div className="flex items-center justify-between gap-2 px-2 py-0 w-full">
              <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-30 text-xs tracking-[0] leading-4">Main Menu</span>
              <button onClick={onToggle} title="Collapse menu" className="w-5 h-5 flex items-center justify-center rounded hover:bg-brain-v1baby-blue-15 transition-colors">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8 2L3 6L8 10" stroke="#414965" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
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
                            <img className="w-6 h-6 flex-shrink-0" alt={item.label} src={item.icon} />
                            <span className={`[font-family:'Gilroy-Medium',Helvetica] font-medium text-base tracking-[0] leading-5 whitespace-nowrap text-left flex-1 ${isActive(item.path) ? "text-brain-v1white" : "text-brain-v1baby-blue-60"}`}>
                              {item.label}
                            </span>
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
                        <img className="w-6 h-6 flex-shrink-0" alt={item.label} src={item.icon} />
                        <span className={`[font-family:'Gilroy-Medium',Helvetica] font-medium text-base tracking-[0] leading-5 whitespace-nowrap text-left flex-1 ${isActive(item.path) ? "text-brain-v1white" : "text-brain-v1baby-blue-60"}`}>
                          {item.emoji ? `${item.emoji} ` : ""}{item.label}
                        </span>
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
              className={`flex items-center gap-2 p-2 w-full rounded-xl cursor-pointer transition-colors ${notificationsOpen ? "bg-brain-v1baby-blue-15" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}
            >
              <img className="w-6 h-6 flex-shrink-0" alt="Notifications" src="/figmaAssets/navbar-icons-2.svg" />
              <span className="text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] font-medium text-base tracking-[0] leading-5 whitespace-nowrap text-left flex-1">Notifications</span>
              {unreadCount > 0 && (
                <div className="inline-flex items-center justify-center px-1.5 py-0.5 bg-brain-v1dark-orange rounded-full">
                  <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1light-orange text-[10px] leading-3 whitespace-nowrap">{unreadCount}</span>
                </div>
              )}
            </button>

            <button
              onClick={() => setShareOpen(true)}
              className="flex items-center gap-2 p-2 w-full rounded-xl cursor-pointer transition-colors bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"
            >
              <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="8" cy="7" r="3.5" stroke="#8899bb" strokeWidth="1.3" />
                  <path d="M1 17c0-3.866 3.134-6 7-6" stroke="#8899bb" strokeWidth="1.3" strokeLinecap="round" />
                  <path d="M16 11v7M12.5 14.5h7" stroke="#42bf23" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </div>
              <span className="text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] font-medium text-base tracking-[0] leading-5 whitespace-nowrap text-left flex-1">Invite Friends</span>
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
          <button onClick={onCreateAgent} className="flex items-center justify-center gap-1 px-3 py-2 w-full bg-brain-v1dark-orange rounded-[100px] hover:opacity-80 transition-opacity">
            <img className="w-4 h-4 flex-shrink-0" alt="Create" src="/figmaAssets/icons-24.svg" />
            <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-brain-v1light-orange text-xs font-semibold tracking-[0] leading-4 whitespace-nowrap">Create Agent</span>
          </button>
          <button className="flex items-center justify-center gap-1 px-3 py-2 w-full bg-brain-v1dark-pink-red rounded-[100px] hover:opacity-80 transition-opacity">
            <img className="w-4 h-4 flex-shrink-0" alt="Logout" src="/figmaAssets/icons-10.svg" />
            <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-brain-v1pink-red text-xs font-semibold tracking-[0] leading-4 whitespace-nowrap">Logout</span>
          </button>
        </div>
      </nav>
    </>
  );
};
