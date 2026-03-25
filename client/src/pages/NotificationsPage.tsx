import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Notification {
  id: string;
  type: "trade" | "agent" | "system" | "launchpad" | "alert";
  title: string;
  message: string;
  time: string;
  read: boolean;
  avatar?: string;
}

const initialNotifications: Notification[] = [
  {
    id: "1",
    type: "trade",
    title: "AlphaFlow executed a trade",
    message: "Bought 0.42 ETH at $2,487.30 — momentum signal triggered.",
    time: "2 min ago",
    read: false,
  },
  {
    id: "2",
    type: "launchpad",
    title: "SwarmAlpha just launched 🚀",
    message: "A new AI agent token is live on Launchpad. Bonding curve at 8%.",
    time: "8 min ago",
    read: false,
    avatar: "/figmaAssets/avatars-7.svg",
  },
  {
    id: "3",
    type: "alert",
    title: "Risk Sentinel: Anomaly detected",
    message: "Unusual volume spike on MATIC position. Risk threshold at 78%.",
    time: "22 min ago",
    read: false,
  },
  {
    id: "4",
    type: "agent",
    title: "Yield Pilot rebalanced portfolio",
    message: "Moved 15% from AAVE to Compound to chase higher yield (8.2% APY).",
    time: "1 hour ago",
    read: true,
    avatar: "/figmaAssets/avatars-9.svg",
  },
  {
    id: "5",
    type: "launchpad",
    title: "TrendRadar bonding curve at 22%",
    message: "The agent you're watching has gained 45.2% in 24h.",
    time: "2 hours ago",
    read: true,
    avatar: "/figmaAssets/avatars-5.svg",
  },
  {
    id: "6",
    type: "trade",
    title: "Pay Stream payment executed",
    message: "Processed $324.50 payment via x402 protocol — confirmed.",
    time: "3 hours ago",
    read: true,
  },
  {
    id: "7",
    type: "system",
    title: "New feature: Community replies",
    message: "You can now comment and react on agent detail pages on Launchpad.",
    time: "1 day ago",
    read: true,
  },
  {
    id: "8",
    type: "agent",
    title: "Signal Seer paused",
    message: "The agent paused due to low confidence signals. Review required.",
    time: "2 days ago",
    read: true,
    avatar: "/figmaAssets/avatars-5.svg",
  },
  {
    id: "9",
    type: "alert",
    title: "AlphaFlow win streak: 12 trades",
    message: "Your trading agent has won 12 consecutive trades. Current P&L: +$4,820.",
    time: "2 days ago",
    read: true,
    avatar: "/figmaAssets/avatars-3.svg",
  },
  {
    id: "10",
    type: "system",
    title: "Account verified",
    message: "Your Brain Finance account identity has been successfully verified.",
    time: "3 days ago",
    read: true,
  },
];

const typeConfig = {
  trade: { icon: "⚡", color: "text-brain-v1green", bg: "bg-brain-v1dark-green" },
  agent: { icon: "🤖", color: "text-brain-v1purple", bg: "bg-brain-v1dark-purple" },
  system: { icon: "ℹ️", color: "text-brain-v1baby-blue-60", bg: "bg-brain-v1baby-blue-15" },
  launchpad: { icon: "🚀", color: "text-brain-v1light-orange", bg: "bg-brain-v1dark-orange" },
  alert: { icon: "⚠️", color: "text-yellow-400", bg: "bg-yellow-900/30" },
};

export const NotificationsPage = (): JSX.Element => {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () =>
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

  const markRead = (id: string) =>
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );

  const dismiss = (id: string) =>
    setNotifications((prev) => prev.filter((n) => n.id !== id));

  const filtered = notifications.filter((n) =>
    filter === "unread" ? !n.read : true
  );

  return (
    <div className="flex flex-col h-full bg-shared-colorsbaby-blue-5 rounded-3xl border border-solid border-[#1d2131] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1d2131]">
        <div className="flex items-center gap-3">
          <h1 className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-xl">
            Notifications
          </h1>
          {unreadCount > 0 && (
            <div className="inline-flex items-center justify-center px-2 py-0.5 bg-brain-v1dark-orange rounded-full">
              <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1light-orange text-xs">
                {unreadCount}
              </span>
            </div>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 hover:text-brain-v1white transition-colors"
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-1 px-6 py-3 border-b border-[#1d2131]">
        {(["all", "unread"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm [font-family:'Gilroy-SemiBold',Helvetica] font-semibold capitalize transition-colors ${
              filter === f
                ? "bg-brain-v1baby-blue-15 text-brain-v1white"
                : "text-brain-v1baby-blue-30 hover:text-brain-v1baby-blue-60"
            }`}
          >
            {f}
            {f === "unread" && unreadCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-brain-v1dark-orange rounded-full text-brain-v1light-orange text-[10px]">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Notification list */}
      <ScrollArea className="flex-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="text-4xl">🔔</div>
            <span className="text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica] text-sm">
              No {filter === "unread" ? "unread " : ""}notifications
            </span>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-[#1d2131]">
            {filtered.map((n) => {
              const cfg = typeConfig[n.type];
              return (
                <div
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={`flex items-start gap-4 px-6 py-4 cursor-pointer transition-colors hover:bg-brain-v1baby-blue-15 ${
                    !n.read ? "bg-[#131927]" : ""
                  }`}
                >
                  {/* Icon / avatar */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                    {n.avatar ? (
                      <img src={n.avatar} alt="" className="w-10 h-10 rounded-xl" />
                    ) : (
                      <span className="text-lg">{cfg.icon}</span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={`[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm ${
                          n.read ? "text-brain-v1baby-blue-60" : "text-brain-v1white"
                        }`}
                      >
                        {n.title}
                      </span>
                      <span className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica] whitespace-nowrap flex-shrink-0">
                        {n.time}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica] leading-relaxed">
                      {n.message}
                    </p>
                  </div>

                  {/* Unread dot + dismiss */}
                  <div className="flex flex-col items-center gap-2 flex-shrink-0 pt-0.5">
                    {!n.read && (
                      <div className="w-2 h-2 rounded-full bg-brain-v1dark-orange" />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        dismiss(n.id);
                      }}
                      className="w-5 h-5 flex items-center justify-center rounded-full text-brain-v1baby-blue-30 hover:text-brain-v1white hover:bg-brain-v1baby-blue-15 transition-colors"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
