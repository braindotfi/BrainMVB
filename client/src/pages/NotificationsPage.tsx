import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNav } from "@/lib/navContext";

interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
}

const initialNotifications: Notification[] = [
  { id: "1", title: "AlphaFlow executed a trade", message: "Bought 0.42 ETH at $2,487.30 — momentum signal triggered.", time: "2m ago", read: false },
  { id: "2", title: "SwarmAlpha just launched 🚀", message: "A new AI agent token is live on Launchpad. Bonding curve at 8%.", time: "15 minutes ago", read: false },
  { id: "3", title: "Risk Sentinel: Anomaly detected", message: "Unusual volume spike on MATIC position. Risk threshold at 78%.", time: "3 hours ago", read: true },
  { id: "4", title: "Yield Pilot rebalanced portfolio", message: "Moved 15% from AAVE to Compound to chase higher yield (8.2% APY).", time: "12 hours ago", read: true },
  { id: "5", title: "TrendRadar bonding curve at 22%", message: "The agent you're watching has gained 45.2% in 24h.", time: "1 day ago", read: true },
  { id: "6", title: "Pay Stream payment executed", message: "Processed $324.50 payment via x402 protocol — confirmed.", time: "2 days ago", read: true },
  { id: "7", title: "New feature: Community replies", message: "You can now comment and react on agent detail pages on Launchpad.", time: "2 days ago", read: true },
  { id: "8", title: "Signal Seer paused", message: "The agent paused due to low confidence signals. Review required.", time: "2 days ago", read: true },
  { id: "9", title: "AlphaFlow win streak: 12 trades", message: "Your trading agent has won 12 consecutive trades. Current P&L: +$4,820.", time: "2 days ago", read: true },
  { id: "10", title: "Account verified", message: "Your Brain Finance account identity has been successfully verified.", time: "3 days ago", read: true },
];

const EthAvatar = () => (
  <div className="w-10 h-10 rounded-full bg-[#1a1f30] flex items-center justify-center flex-shrink-0">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L5 12.5L12 9.5L19 12.5L12 2Z" fill="#6b7db3" />
      <path d="M5 12.5L12 16L19 12.5L12 9.5L5 12.5Z" fill="#4a5a8a" />
      <path d="M12 16L5 13.5L12 22L19 13.5L12 16Z" fill="#6b7db3" />
      <path d="M12 9.5L19 12.5L12 16L5 12.5L12 9.5Z" fill="#384870" />
    </svg>
  </div>
);

export const NotificationsPage = (): JSX.Element => {
  const { toggleNav } = useNav();
  const [notifications, setNotifications] = useState(initialNotifications);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () =>
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

  const markRead = (id: string) =>
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );

  return (
    <div className="flex flex-col h-full bg-[#080b14] rounded-3xl border border-solid border-[#1a1f2e] overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-4 flex-shrink-0">
        {/* Collapse nav button */}
        <button
          onClick={toggleNav}
          className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 hover:opacity-80 transition-opacity"
        >
          <img src="/figmaAssets/nav-collapse-icon.png" alt="Menu" className="w-full h-full" />
        </button>

        {/* Mark all as read */}
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="px-4 py-1.5 rounded-full bg-[#1a1f30] [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#6c779d] text-xs hover:text-white transition-colors"
          >
            Mark All As Read
          </button>
        )}
      </div>

      {/* Notification list */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col">
          {notifications.map((n, i) => (
            <div
              key={n.id}
              onClick={() => markRead(n.id)}
              className={`flex items-start gap-4 px-5 py-4 cursor-pointer transition-colors hover:bg-[#0f1420] ${
                !n.read ? "bg-[#0c1018]" : ""
              } ${i < notifications.length - 1 ? "border-b border-[#131927]" : ""}`}
            >
              <EthAvatar />

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={`[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm leading-snug ${
                      !n.read ? "text-[#f97316]" : "text-[#c8d4f0]"
                    }`}
                  >
                    {n.title}
                  </span>
                  <span className="text-[11px] text-[#414965] [font-family:'Gilroy-Medium',Helvetica] whitespace-nowrap flex-shrink-0 mt-0.5">
                    {n.time}
                  </span>
                </div>
                <p className="mt-1 text-[12px] text-[#6c779d] [font-family:'Gilroy-Medium',Helvetica] leading-relaxed">
                  {n.message}
                </p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};
