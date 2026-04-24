import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Separator } from "@/components/ui/separator";
import { ShareModal } from "@/components/ShareModal";

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  onCreateAgent: () => void;
  onLogout?: () => void;
}

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
          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[20px] leading-[24px] w-full">
            Logout
          </p>
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px] leading-[16px] w-full">
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
            <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[12px] leading-[16px] whitespace-nowrap">Cancel</span>
          </button>
          <button
            data-testid="button-logout-confirm"
            onClick={onConfirm}
            className="flex flex-1 items-center justify-center px-[12px] py-[8px] rounded-[100px] hover:opacity-80 transition-opacity"
            style={{ background: "#350011" }}
          >
            <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#d20344] text-[12px] leading-[16px] whitespace-nowrap">Confirm</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Sidebar icon components ── */

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

const AgentsIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="8" width="18" height="12" rx="2" stroke={active ? "#a8b9f4" : "#6c779d"} strokeWidth="1.5" fill={active ? "rgba(118,49,238,0.15)" : "none"} />
    <path d="M12 2v6M9.5 5h5" stroke={active ? "#a8b9f4" : "#6c779d"} strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="9" cy="14" r="1.5" fill={active ? "#7631ee" : "#6c779d"} />
    <circle cx="15" cy="14" r="1.5" fill={active ? "#7631ee" : "#6c779d"} />
    <path d="M9 18h6" stroke={active ? "#a8b9f4" : "#6c779d"} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const MarketplaceIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M4 3h16l-2 6H6L4 3z" stroke={active ? "#a8b9f4" : "#6c779d"} strokeWidth="1.5" strokeLinejoin="round" fill={active ? "rgba(118,49,238,0.15)" : "none"} />
    <path d="M4 9v11a1 1 0 001 1h14a1 1 0 001-1V9" stroke={active ? "#a8b9f4" : "#6c779d"} strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M10 21v-6h4v6" stroke={active ? "#a8b9f4" : "#6c779d"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    {active && <circle cx="12" cy="6" r="1" fill="#7631ee" />}
  </svg>
);

const SettingsIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="3" stroke={active ? "#a8b9f4" : "#6c779d"} strokeWidth="1.5" fill={active ? "rgba(118,49,238,0.3)" : "none"} />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke={active ? "#a8b9f4" : "#6c779d"} strokeWidth="1.5" />
  </svg>
);

const mainMenuItems = [
  { id: "agents", label: "Agents", path: "/agents" },
  { id: "marketplace", label: "Marketplace", path: "/marketplace" },
];

export const NavigationMenuSection = ({ collapsed, onToggle, onCreateAgent, onLogout }: Props): JSX.Element => {
  const [location] = useLocation();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === "/agents") return location === "/" || location === "" || location.startsWith("/agents") || location.startsWith("/manage") || location.startsWith("/agent/");
    return location.startsWith(path);
  };

  if (collapsed) {
    return (
      <>
        <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} />
        <LogoutConfirmModal show={showLogoutConfirm} onCancel={() => setShowLogoutConfirm(false)} onConfirm={() => { setShowLogoutConfirm(false); onLogout?.(); }} />
        <nav className="flex flex-col w-[60px] h-full rounded-[16px] border border-solid border-[#1d2132] bg-[#11141b] flex-shrink-0">
          <div className="flex flex-col flex-1 items-center mt-2 gap-1 w-full px-[7px]">
            {/* Expand button */}
            <button
              onClick={onToggle}
              title="Expand menu"
              className="w-[40px] h-[40px] flex-shrink-0 flex items-center justify-center rounded-[100px] mb-0"
              style={{ background: "#222737" }}
            >
              <ExpandIcon />
            </button>

            {/* Brain logo icon */}
            <div className="w-[40px] h-[40px] flex-shrink-0 flex items-center justify-center">
              <img
                className="w-[32px] h-[32px] object-contain"
                alt="Brain"
                src="/figmaAssets/brain2x.png"
              />
            </div>

            {mainMenuItems.map((item) => (
              <Link key={item.id} href={item.path} className="outline-none focus:outline-none">
                <button title={item.label} className={`flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${isActive(item.path) ? "bg-brain-v1highlight-dropdown-bg" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}>
                  {item.id === "agents" && <AgentsIcon active={isActive(item.path)} />}
                  {item.id === "marketplace" && <MarketplaceIcon active={isActive(item.path)} />}
                </button>
              </Link>
            ))}

            <div className="w-8 h-px bg-[#1d2132] my-1" />

            <Link href="/settings" className="outline-none focus:outline-none">
              <button title="Settings" className={`flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${isActive("/settings") ? "bg-brain-v1highlight-dropdown-bg" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}>
                <SettingsIcon active={isActive("/settings")} />
              </button>
            </Link>
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
      <LogoutConfirmModal show={showLogoutConfirm} onCancel={() => setShowLogoutConfirm(false)} onConfirm={() => { setShowLogoutConfirm(false); onLogout?.(); }} />
      <nav className="flex flex-col w-[264px] h-full rounded-[16px] border border-solid border-[#1d2132] bg-[#11141b] flex-shrink-0">
        {/* Brain logo row */}
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
              <span className="[font-family:'Gilroy',sans-serif] font-semibold text-brain-v1baby-blue-30 text-xs tracking-[0] leading-4">Main Menu</span>
            </div>

            <div className="flex flex-col items-start gap-1 w-full">
              {mainMenuItems.map((item) => (
                <Link key={item.id} href={item.path} className="w-full outline-none focus:outline-none">
                  <button className={`flex items-center gap-2 p-2 w-full rounded-xl cursor-pointer transition-colors ${isActive(item.path) ? "bg-brain-v1highlight-dropdown-bg" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}>
                    <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
                      {item.id === "agents" && <AgentsIcon active={isActive(item.path)} />}
                      {item.id === "marketplace" && <MarketplaceIcon active={isActive(item.path)} />}
                    </div>
                    <span className={`[font-family:'Gilroy',sans-serif] font-medium text-base tracking-[0] leading-5 whitespace-nowrap text-left flex-1 ${isActive(item.path) ? "text-brain-v1white" : "text-brain-v1baby-blue-60"}`}>
                      {item.label}
                    </span>
                    {isActive(item.path) && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0 text-[#414965]">
                        <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                </Link>
              ))}
            </div>
          </div>

          <Separator className="w-full bg-[#1d2132]" />

          {/* Other section */}
          <div className="flex flex-col items-start gap-1 w-full">
            <div className="flex items-center justify-center gap-2 px-2 py-0 w-full">
              <span className="flex-1 [font-family:'Gilroy',sans-serif] font-semibold text-brain-v1baby-blue-30 text-xs tracking-[0] leading-4">Other</span>
            </div>

            <Link href="/settings" className="w-full outline-none focus:outline-none">
              <button className={`flex items-center gap-2 p-2 w-full rounded-xl cursor-pointer transition-colors ${isActive("/settings") ? "bg-brain-v1highlight-dropdown-bg" : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"}`}>
                <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
                  <SettingsIcon active={isActive("/settings")} />
                </div>
                <span className={`[font-family:'Gilroy',sans-serif] font-medium text-base tracking-[0] leading-5 whitespace-nowrap text-left flex-1 ${isActive("/settings") ? "text-brain-v1white" : "text-brain-v1baby-blue-60"}`}>Settings</span>
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
            <span className="[font-family:'Gilroy',sans-serif] text-[#ff9500] text-base font-semibold leading-5 whitespace-nowrap">Create Agent</span>
          </button>
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="flex items-center justify-center gap-2 px-5 py-2 w-full bg-[#350011] rounded-[100px] hover:opacity-80 transition-opacity"
          >
            <img className="w-6 h-6 flex-shrink-0" alt="Logout" src="/figmaAssets/logout-icon.svg" />
            <span className="[font-family:'Gilroy',sans-serif] text-[#d20344] text-base font-semibold leading-5 whitespace-nowrap">Logout</span>
          </button>
        </div>
      </nav>
    </>
  );
};
