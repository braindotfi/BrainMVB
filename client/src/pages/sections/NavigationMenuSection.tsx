import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Separator } from "@/components/ui/separator";

const mainMenuItems = [
  { id: "launchpad", label: "Launchpad", icon: "/figmaAssets/navbar-icons-3.svg", path: "/launchpad", emoji: "🚀" },
  { id: "assistant", label: "Assistant", icon: "/figmaAssets/navbar-icons.svg", path: "/assistant", emoji: null },
  { id: "agents", label: "Agents", icon: "/figmaAssets/navbar-icons-1.svg", path: "/agents", emoji: null },
  { id: "marketplace", label: "Marketplace", icon: "/figmaAssets/navbar-icons-3.svg", path: "/", emoji: null },
];

const notifications = [
  { id: "1", title: "AlphaFlow executed a trade", time: "2m ago", read: false, icon: "⚡" },
  { id: "2", title: "SwarmAlpha just launched 🚀", time: "8m ago", read: false, icon: "🚀" },
  { id: "3", title: "Risk Sentinel: Anomaly detected", time: "22m ago", read: false, icon: "⚠️" },
];

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  onCreateAgent: () => void;
}

export const NavigationMenuSection = ({ collapsed, onToggle, onCreateAgent }: Props): JSX.Element => {
  const [location] = useLocation();
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === "/") return location === "/" || location === "";
    return location.startsWith(path);
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (collapsed) {
    return (
      <nav className="flex flex-col w-[60px] min-h-[calc(100vh-130px)] rounded-3xl border border-solid border-[#1d2132] bg-brain-v1baby-blue-5 flex-shrink-0">
        <div className="flex flex-col flex-1 items-center mt-2 gap-1 pt-2 w-full px-2">
          <button
            onClick={onToggle}
            title="Expand menu"
            className="w-9 h-9 flex items-center justify-center bg-brain-v1baby-blue-15 rounded-xl hover:bg-brain-v1baby-blue-30 transition-colors mb-1"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5 2L10 7L5 12" stroke="#8899bb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {mainMenuItems.map((item) => (
            <Link key={item.id} href={item.path}>
              <button
                title={item.label}
                className={`flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${
                  isActive(item.path) ? "bg-brain-v1highlight-dropdown-bg" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"
                }`}
              >
                <img className="w-5 h-5" alt={item.label} src={item.icon} />
              </button>
            </Link>
          ))}

          <div className="w-8 h-px bg-[#1d2132] my-1" />

          {/* Notifications icon */}
          <button
            title="Notifications"
            onClick={() => setNotificationsOpen((v) => !v)}
            className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15 transition-colors"
          >
            <img className="w-5 h-5" alt="Notifications" src="/figmaAssets/navbar-icons-2.svg" />
            {unreadCount > 0 && (
              <div className="absolute top-0 right-0 w-4 h-4 bg-brain-v1dark-orange rounded-full flex items-center justify-center">
                <span className="text-[8px] text-white [font-family:'Gilroy-SemiBold',Helvetica]">{unreadCount}</span>
              </div>
            )}
          </button>

          {/* Settings icon */}
          <Link href="/settings">
            <button
              title="Settings"
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15 transition-colors"
            >
              <img className="w-5 h-5" alt="Settings" src="/figmaAssets/navbar-icons-5.svg" />
            </button>
          </Link>
        </div>

        <div className="flex flex-col items-center gap-2 pb-4 mt-auto pt-4 px-2">
          <button
            title="Create an Agent"
            onClick={onCreateAgent}
            className="flex items-center justify-center w-9 h-9 bg-brain-v1dark-orange rounded-full hover:opacity-80 transition-opacity"
          >
            <img className="w-4 h-4" alt="Create" src="/figmaAssets/icons-24.svg" />
          </button>
          <button title="Logout" className="flex items-center justify-center w-9 h-9 bg-brain-v1dark-pink-red rounded-full hover:opacity-80 transition-opacity">
            <img className="w-4 h-4" alt="Logout" src="/figmaAssets/icons-10.svg" />
          </button>
        </div>
      </nav>
    );
  }

  return (
    <nav className="flex flex-col w-[264px] min-h-[calc(100vh-130px)] rounded-3xl border border-solid border-[#1d2132] bg-brain-v1baby-blue-5 flex-shrink-0">
      <div className="flex flex-col flex-1 mx-2 mt-2 gap-4 pt-2 pb-0 overflow-y-auto">
        {/* Main Menu */}
        <div className="flex flex-col items-start gap-1 w-full">
          <div className="flex items-center justify-between gap-2 px-2 py-0 w-full">
            <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-30 text-xs tracking-[0] leading-4">
              Main Menu
            </span>
            <button
              onClick={onToggle}
              title="Collapse menu"
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-brain-v1baby-blue-15 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M8 2L3 6L8 10" stroke="#414965" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <div className="flex flex-col items-start gap-1 w-full">
            {mainMenuItems.map((item) => (
              <Link key={item.id} href={item.path} className="w-full">
                <button
                  className={`flex items-center gap-2 p-2 w-full rounded-xl cursor-pointer transition-colors ${
                    isActive(item.path) ? "bg-brain-v1highlight-dropdown-bg" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"
                  }`}
                >
                  <img className="w-6 h-6 flex-shrink-0" alt={item.label} src={item.icon} />
                  <span className={`[font-family:'Gilroy-Medium',Helvetica] font-medium text-base tracking-[0] leading-5 whitespace-nowrap text-left flex-1 ${
                    isActive(item.path) ? "text-brain-v1white" : "text-brain-v1baby-blue-60"
                  }`}>
                    {item.emoji ? `${item.emoji} ` : ""}{item.label}
                  </span>
                </button>
              </Link>
            ))}
          </div>
        </div>

        <Separator className="w-full bg-[#1d2132]" />

        {/* Other section */}
        <div className="flex flex-col items-start gap-1 w-full">
          <div className="flex items-center justify-center gap-2 px-2 py-0 w-full">
            <span className="flex-1 [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-30 text-xs tracking-[0] leading-4">
              Other
            </span>
          </div>

          {/* Notifications button — toggles inline */}
          <button
            onClick={() => setNotificationsOpen((v) => !v)}
            className={`flex items-center gap-2 p-2 w-full rounded-xl cursor-pointer transition-colors ${
              notificationsOpen ? "bg-brain-v1baby-blue-15" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"
            }`}
          >
            <img className="w-6 h-6 flex-shrink-0" alt="Notifications" src="/figmaAssets/navbar-icons-2.svg" />
            <span className="text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] font-medium text-base tracking-[0] leading-5 whitespace-nowrap text-left flex-1">
              Notifications
            </span>
            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <div className="inline-flex items-center justify-center px-1.5 py-0.5 bg-brain-v1dark-orange rounded-full">
                  <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1light-orange text-[10px] leading-3 whitespace-nowrap">
                    {unreadCount}
                  </span>
                </div>
              )}
              <svg
                width="12" height="12" viewBox="0 0 12 12" fill="none"
                className={`transition-transform duration-200 ${notificationsOpen ? "rotate-180" : ""}`}
              >
                <path d="M2 4L6 8L10 4" stroke="#414965" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </button>

          {/* Inline notifications panel */}
          {notificationsOpen && (
            <div className="w-full flex flex-col gap-1 pl-2 pr-1">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className="flex items-start gap-2 p-2 rounded-xl bg-brain-v1baby-blue-15 border border-[#1d2131]"
                >
                  <span className="text-base flex-shrink-0 mt-0.5">{n.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs leading-relaxed [font-family:'Gilroy-Medium',Helvetica] ${n.read ? "text-brain-v1baby-blue-30" : "text-brain-v1white"}`}>
                      {n.title}
                    </p>
                    <p className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">{n.time}</p>
                  </div>
                  {!n.read && <div className="w-1.5 h-1.5 bg-brain-v1dark-orange rounded-full flex-shrink-0 mt-1.5" />}
                </div>
              ))}
              <Link href="/notifications" className="w-full">
                <button className="w-full py-2 text-[11px] text-brain-v1baby-blue-30 hover:text-brain-v1white [font-family:'Gilroy-SemiBold',Helvetica] transition-colors">
                  View all notifications →
                </button>
              </Link>
            </div>
          )}

          {/* Settings */}
          <Link href="/settings" className="w-full">
            <button
              className={`flex items-center gap-2 p-2 w-full rounded-xl cursor-pointer transition-colors ${
                isActive("/settings") ? "bg-brain-v1baby-blue-15" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"
              }`}
            >
              <img className="w-6 h-6 flex-shrink-0" alt="Settings" src="/figmaAssets/navbar-icons-5.svg" />
              <span className="text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] font-medium text-base tracking-[0] leading-5 whitespace-nowrap text-left flex-1">
                Settings
              </span>
            </button>
          </Link>
        </div>
      </div>

      {/* Bottom buttons */}
      <div className="flex flex-col items-start gap-2 mx-2 mb-4 mt-auto pt-4">
        <button
          onClick={onCreateAgent}
          className="flex items-center justify-center gap-1 px-3 py-2 w-full bg-brain-v1dark-orange rounded-[100px] hover:opacity-80 transition-opacity"
        >
          <img className="w-4 h-4 flex-shrink-0" alt="Create" src="/figmaAssets/icons-24.svg" />
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-brain-v1light-orange text-xs font-semibold tracking-[0] leading-4 whitespace-nowrap">
            Create an Agent
          </span>
        </button>
        <button className="flex items-center justify-center gap-1 px-3 py-2 w-full bg-brain-v1dark-pink-red rounded-[100px] hover:opacity-80 transition-opacity">
          <img className="w-4 h-4 flex-shrink-0" alt="Logout" src="/figmaAssets/icons-10.svg" />
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-brain-v1pink-red text-xs font-semibold tracking-[0] leading-4 whitespace-nowrap">
            Logout
          </span>
        </button>
      </div>
    </nav>
  );
};
