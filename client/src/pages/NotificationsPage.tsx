import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";

const NOTIFICATION_ICONS: Record<string, string> = {
  AGENT_PAYMENT_EXECUTED: "🤖",
  AGENT_POLICY_REJECTED: "⚠️",
  AGENT_GRADUATED: "🎓",
  AGENT_THRESHOLD_REACHED: "📈",
  TRANSACTION_CONFIRMED: "✅",
  CARD_TRANSACTION: "💳",
  BALANCE_LOW: "🔴",
  NEW_AGENT_LISTED: "🚀",
  TOKEN_PRICE_ALERT: "📊",
  AGENT_OBJECTIVE_COMPLETE: "🏁",
  NONCE: "🔑",
};

type FilterTab = "all" | "agents" | "banking" | "launchpad";

const CATEGORY_MAP: Record<FilterTab, string[]> = {
  all: [],
  agents: ["AGENT_PAYMENT_EXECUTED", "AGENT_POLICY_REJECTED", "AGENT_OBJECTIVE_COMPLETE"],
  banking: ["CARD_TRANSACTION", "TRANSACTION_CONFIRMED", "BALANCE_LOW"],
  launchpad: ["AGENT_GRADUATED", "AGENT_THRESHOLD_REACHED", "NEW_AGENT_LISTED", "TOKEN_PRICE_ALERT"],
};

function NotifAvatar({ type }: { type: string }) {
  const emoji = NOTIFICATION_ICONS[type] ?? "🔔";
  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-lg"
      style={{ background: "#1a1f30" }}
    >
      {emoji}
    </div>
  );
}

export const NotificationsPage = (): JSX.Element => {
  const { notifications, unreadCount, isLoading, sseConnected, markRead, deleteNotif, markAllRead } = useNotifications();
  const [tab, setTab] = useState<FilterTab>("all");

  const filtered = tab === "all"
    ? notifications
    : notifications.filter(n => CATEGORY_MAP[tab].includes(n.type));

  const formatTime = (ts: string) => {
    try { return formatDistanceToNow(new Date(ts), { addSuffix: true }); }
    catch { return "just now"; }
  };

  return (
    <div className="flex flex-col h-full bg-[#080b14] rounded-3xl border border-solid border-[#1a1f2e] overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-4 flex-shrink-0 border-b border-[#131927]">
        <div className="flex items-center gap-3">
          <h2
            className="text-base font-semibold"
            style={{ color: "#f1f5f9", fontFamily: "'Gilroy-Bold', Helvetica, sans-serif" }}
          >
            Notifications
          </h2>
          {unreadCount > 0 && (
            <div
              className="flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold"
              style={{ background: "#7631ee", color: "white", minWidth: "20px" }}
            >
              {unreadCount}
            </div>
          )}
          {/* SSE live indicator */}
          <div className="flex items-center gap-1">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: sseConnected ? "#22c55e" : "#ef4444" }}
            />
            <span className="text-xs" style={{ color: "#414965" }}>
              {sseConnected ? "Live" : "Offline"}
            </span>
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            data-testid="mark-all-read-btn"
            className="px-3 py-1.5 rounded-full text-xs transition-colors hover:opacity-80"
            style={{ background: "#1a1f30", color: "#6c779d", fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif" }}
          >
            Mark All Read
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-5 py-3 flex-shrink-0 border-b border-[#131927]">
        {(["all", "agents", "banking", "launchpad"] as FilterTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            data-testid={`notif-tab-${t}`}
            className="px-3 py-1.5 rounded-full text-xs capitalize transition-colors"
            style={{
              background: tab === t ? "#240757" : "transparent",
              color: tab === t ? "#9d5cf5" : "#414965",
              fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif",
              border: tab === t ? "1px solid #4a1a9e" : "1px solid transparent",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Notification list */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-[#7631ee] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm" style={{ color: "#414965" }}>Loading notifications…</span>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span className="text-3xl">🔔</span>
            <span className="text-sm" style={{ color: "#414965", fontFamily: "'Gilroy-Medium', Helvetica, sans-serif" }}>
              No notifications yet
            </span>
          </div>
        ) : (
          <div className="flex flex-col">
            {filtered.map((n, i) => (
              <div
                key={n.id}
                onClick={() => !n.read && markRead(n.id)}
                data-testid={`notification-item-${n.id}`}
                className={`flex items-start gap-4 px-5 py-4 cursor-pointer transition-colors hover:bg-[#0f1420] group ${
                  !n.read ? "bg-[#0c1018]" : ""
                } ${i < filtered.length - 1 ? "border-b border-[#131927]" : ""}`}
              >
                <NotifAvatar type={n.type} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className="text-sm leading-snug"
                      style={{
                        color: !n.read ? "#f97316" : "#c8d4f0",
                        fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif",
                      }}
                    >
                      {n.title}
                      {!n.read && (
                        <span
                          className="ml-2 inline-block w-1.5 h-1.5 rounded-full align-middle"
                          style={{ background: "#7631ee" }}
                        />
                      )}
                    </span>
                    <span
                      className="text-[11px] whitespace-nowrap flex-shrink-0 mt-0.5"
                      style={{ color: "#414965", fontFamily: "'Gilroy-Medium', Helvetica, sans-serif" }}
                    >
                      {formatTime(n.createdAt)}
                    </span>
                  </div>
                  <p
                    className="mt-1 text-[12px] leading-relaxed"
                    style={{ color: "#6c779d", fontFamily: "'Gilroy-Medium', Helvetica, sans-serif" }}
                  >
                    {n.body}
                  </p>
                </div>

                {/* Delete button */}
                <button
                  onClick={(e) => { e.stopPropagation(); deleteNotif(n.id); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1"
                  data-testid={`delete-notif-${n.id}`}
                  style={{ color: "#414965" }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
