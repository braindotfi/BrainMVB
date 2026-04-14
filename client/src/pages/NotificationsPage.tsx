import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/hooks/useNotifications";
import { NotifAvatar, formatNotifTime } from "@/components/NotifAvatar";

const GILROY_SEMI = { fontFamily: "'Gilroy', sans-serif", fontWeight: 600 } as const;
const GILROY_MED  = { fontFamily: "'Gilroy', sans-serif", fontWeight: 500 } as const;

export const NotificationsPage = (): JSX.Element => {
  const { notifications, unreadCount, isLoading, markRead, markAllRead } = useNotifications();

  return (
    <div className="flex flex-col h-full rounded-[16px] border border-solid overflow-hidden" style={{ background: "#11141b", borderColor: "#1d2132" }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-[16px] py-[16px] flex-shrink-0">
        <h2 style={{ ...GILROY_SEMI, fontSize: "20px", lineHeight: "24px", color: "#6c779d" }}>
          Notifications
        </h2>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            data-testid="mark-all-read-btn"
            className="h-6 flex items-center px-[10px] rounded-[100px] transition-opacity hover:opacity-80"
            style={{ background: "#222737", color: "#6c779d", ...GILROY_MED, fontSize: "12px", lineHeight: "16px" }}
          >
            Mark All As Read
          </button>
        )}
      </div>

      {/* ── List ── */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-[#7631ee] border-t-transparent rounded-full animate-spin" />
              <span style={{ ...GILROY_MED, fontSize: "13px", color: "#414965" }}>Loading notifications…</span>
            </div>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span className="text-3xl">🔔</span>
            <span style={{ ...GILROY_MED, fontSize: "13px", color: "#414965" }}>No notifications yet</span>
          </div>
        ) : (
          <div className="flex flex-col px-[16px] py-[8px]" style={{ gap: "8px" }}>
            {notifications.map((n, i) => (
              <div key={n.id} className="flex flex-col" style={{ gap: "8px" }}>

                {/* ── Notification row ── */}
                <div
                  onClick={() => !n.read && markRead(n.id)}
                  data-testid={`notification-item-${n.id}`}
                  className="flex items-start w-full cursor-pointer"
                  style={{
                    gap: "8px",
                    padding: "8px",
                    background: !n.read ? "#222737" : "transparent",
                    borderRadius: !n.read ? "8px" : "0",
                  }}
                >
                  <NotifAvatar type={n.type} title={n.title} />

                  <div className="flex flex-col items-start min-w-0" style={{ flex: "1 0 0" }}>
                    <div className="flex flex-col items-start w-full" style={{ gap: "4px" }}>

                      {/* Title + timestamp */}
                      <div className="flex items-center w-full" style={{ gap: "8px", lineHeight: "20px" }}>
                        <p
                          className="min-w-0"
                          style={{
                            ...GILROY_SEMI,
                            flex: "1 0 0",
                            fontSize: "16px",
                            color: !n.read ? "#ff9500" : "#a8b9f4",
                          }}
                        >
                          {n.title}
                        </p>
                        <p
                          className="flex-shrink-0 whitespace-nowrap"
                          style={{ ...GILROY_MED, fontSize: "14px", color: "#6c779d" }}
                        >
                          {formatNotifTime(n.createdAt)}
                        </p>
                      </div>

                      {/* Body */}
                      <p
                        className="w-full"
                        style={{
                          ...GILROY_MED,
                          fontSize: "14px",
                          lineHeight: "16px",
                          color: !n.read ? "#a8b9f4" : "#6c779d",
                        }}
                      >
                        {n.body}
                      </p>

                    </div>
                  </div>
                </div>

                {/* Divider */}
                {i < notifications.length - 1 && (
                  <div className="w-full flex-shrink-0" style={{ height: "1px", background: "#1d2132" }} />
                )}

              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
