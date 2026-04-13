import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";

function NotifAvatar({ type }: { type: string }) {
  if (type === "insights") {
    return (
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: "#1a1035", border: "1px solid #4a1a9e" }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M9 2a5 5 0 0 1 3.5 8.5c-.5.5-.8 1.2-.8 1.8V13H6.3v-.7c0-.6-.3-1.3-.8-1.8A5 5 0 0 1 9 2Z" stroke="#7631ee" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M6.3 13.5h5.4M7 15.5h4" stroke="#7631ee" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      </div>
    );
  }
  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
      style={{ background: "#1a1f30" }}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <ellipse cx="10" cy="10" rx="10" ry="10" fill="#2a2f45"/>
        <path d="M10 4.5L12.5 9H7.5L10 4.5Z" fill="#627EEA"/>
        <path d="M10 4.5L12.5 9H10V4.5Z" fill="#8EA4F4"/>
        <path d="M7.5 9.5L10 10.75L12.5 9.5L10 14.5L7.5 9.5Z" fill="#627EEA"/>
        <path d="M10 10.75L12.5 9.5L10 14.5V10.75Z" fill="#8EA4F4"/>
        <path d="M7.5 9L10 10.25L12.5 9L10 9.5L7.5 9Z" fill="#D8E1FF"/>
      </svg>
    </div>
  );
}

export const NotificationsPage = (): JSX.Element => {
  const { notifications, unreadCount, isLoading, markRead, markAllRead } = useNotifications();

  const formatTime = (ts: string) => {
    try { return formatDistanceToNow(new Date(ts), { addSuffix: false }); }
    catch { return "just now"; }
  };

  return (
    <div className="flex flex-col h-full bg-[#11141b] rounded-[16px] border border-solid border-[#1d2132] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-[16px] py-[16px] flex-shrink-0">
        <h2
          className="text-[20px] leading-[24px]"
          style={{ color: "#6c779d", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}
        >
          Notifications
        </h2>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            data-testid="mark-all-read-btn"
            className="h-6 flex items-center px-[10px] rounded-[100px] text-[12px] leading-[16px] hover:opacity-80 transition-opacity"
            style={{ background: "#222737", color: "#6c779d", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}
          >
            Mark All As Read
          </button>
        )}
      </div>

      {/* Notification list */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-[#7631ee] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm" style={{ color: "#414965", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}>Loading notifications…</span>
            </div>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span className="text-3xl">🔔</span>
            <span className="text-sm" style={{ color: "#414965", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}>
              No notifications yet
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-[8px] px-[16px] py-[8px]">
            {notifications.map((n, i) => (
              <div key={n.id} className="flex flex-col gap-[8px]">
                {/* Row */}
                <div
                  onClick={() => !n.read && markRead(n.id)}
                  data-testid={`notification-item-${n.id}`}
                  className={`flex gap-[8px] items-start p-[8px] cursor-pointer transition-colors ${
                    !n.read ? "bg-[#222737] rounded-[8px]" : ""
                  }`}
                >
                  <NotifAvatar type={n.type} />

                  <div className="flex flex-col gap-[4px] items-start flex-1 min-w-0">
                    {/* Title + timestamp row */}
                    <div className="flex gap-[8px] items-center w-full leading-[20px]">
                      <p
                        className="flex-1 min-w-0 text-[16px]"
                        style={{
                          color: !n.read ? "#ff9500" : "#a8b9f4",
                          fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif",
                        }}
                      >
                        {n.title}
                      </p>
                      <p
                        className="text-[14px] whitespace-nowrap flex-shrink-0"
                        style={{ color: "#6c779d", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}
                      >
                        {formatTime(n.createdAt)}
                      </p>
                    </div>
                    {/* Body */}
                    <p
                      className="text-[14px] leading-[16px] w-full"
                      style={{
                        color: !n.read ? "#a8b9f4" : "#6c779d",
                        fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif",
                      }}
                    >
                      {n.body}
                    </p>
                  </div>
                </div>

                {/* Divider */}
                {i < notifications.length - 1 && (
                  <div className="w-full border-b border-[#1d2132]" />
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
