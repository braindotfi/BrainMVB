import { useState } from "react";
import { useLocation, Link } from "wouter";
import { ICONS } from "@/assets/figma-icons";

interface Props {
  collapsed: boolean;
  onToggle: () => void;
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
          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[20px] leading-[24px] w-full">Logout</p>
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px] leading-[16px] w-full">Are you sure you want to logout?</p>
        </div>
        <div className="flex gap-[8px] items-start p-[8px] w-full">
          <button data-testid="button-logout-cancel" onClick={onCancel} className="flex flex-1 items-center justify-center px-[12px] py-[8px] rounded-[100px] hover:opacity-80 transition-opacity" style={{ background: "#222737" }}>
            <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[12px] leading-[16px] whitespace-nowrap">Cancel</span>
          </button>
          <button data-testid="button-logout-confirm" onClick={onConfirm} className="flex flex-1 items-center justify-center px-[12px] py-[8px] rounded-[100px] hover:opacity-80 transition-opacity" style={{ background: "#350011" }}>
            <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#d20344] text-[12px] leading-[16px] whitespace-nowrap">Confirm</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const BrainLogo = () => (
  <div className="h-[40px] relative shrink-0 w-[130px]">
    <div className="absolute left-0 size-[40px] top-0">
      <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[32px] top-1/2">
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.brain_union} />
      </div>
      <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 mask-alpha mask-intersect mask-no-clip mask-no-repeat mask-position-[0px_0px] mask-size-[32px_32px] size-[32px] top-1/2" style={{ maskImage: `url('${ICONS.brain_mask}')` }}>
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.brain_overlay} />
      </div>
    </div>
    <p className="absolute leading-[0] left-[44px] not-italic text-[0px] text-white top-[8px] whitespace-nowrap" style={{ fontFamily: "'Gridular', sans-serif" }}>
      <span className="leading-[24px] text-[#7631ee] text-[28px]">br</span>
      <span className="leading-[24px] text-[28px]">ai</span>
      <span className="leading-[24px] text-[#7631ee] text-[28px]">n</span>
    </p>
  </div>
);

const CollapseButton = ({ onClick }: { onClick: () => void }) => (
  <button
    data-testid="button-collapse-sidebar"
    onClick={onClick}
    title="Collapse menu"
    className="relative rounded-[100px] shrink-0 size-[40px] hover:opacity-80 transition-opacity"
  >
    <div className="absolute left-0 size-[40px] top-0">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.collapse_bg} />
    </div>
    <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
      <div className="absolute inset-[16.67%_12.5%]">
        <div className="absolute inset-[-6.25%_-5.56%]">
          <img alt="" className="block max-w-none size-full" src={ICONS.collapse_icon} />
        </div>
      </div>
    </div>
  </button>
);

const HomeIconActive = () => (
  <div className="relative shrink-0 size-[24px]">
    <div
      className="absolute inset-[4.17%_12.5%] rounded-[4px]"
      style={{
        background:
          "linear-gradient(121.6deg, rgb(150, 90, 255) 16.8%, rgb(118, 49, 238) 72.248%) padding-box, linear-gradient(180deg, rgba(255, 255, 255, 0.85) 0%, rgba(168, 137, 250, 0.55) 50%, rgba(118, 49, 238, 0.4) 100%) border-box",
        border: "1.4px solid transparent",
      }}
    />
    <div className="absolute inset-[24.54%_32.5%_24.53%_32.5%]">
      <div className="absolute inset-[-9.2%_-26.79%_-27.61%_-26.79%]">
        <img alt="" className="block max-w-none size-full" src={ICONS.home_active_vec} />
      </div>
    </div>
  </div>
);

const HomeIconInactive = () => (
  <div className="relative shrink-0 size-[24px]">
    <div className="absolute inset-[4.17%_12.5%]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.home_inactive} />
    </div>
  </div>
);

const FinancesIconActive = () => (
  <div className="overflow-clip relative shrink-0 size-[24px]">
    <div className="absolute left-0 size-[24px] top-0">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.finances_active_base} />
    </div>
    <div className="absolute inset-[14.58%_33.33%]">
      <div className="absolute inset-[-6.62%_-28.13%_-19.85%_-28.13%]">
        <img alt="" className="block max-w-none size-full" src={ICONS.finances_active_stroke} />
      </div>
    </div>
  </div>
);

const FinancesIconInactive = () => (
  <div className="overflow-clip relative shrink-0 size-[24px]">
    <div className="absolute left-0 size-[24px] top-0">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.finances_inactive} />
    </div>
  </div>
);

const RulesIconActive = () => (
  <div className="relative shrink-0 size-[24px]">
    <div className="absolute inset-[4.17%_16.67%_4.17%_4.17%]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.rules_active_body} />
    </div>
    <div className="absolute bottom-1/2 left-[37.5%] right-[33.33%] top-1/4">
      <div className="absolute inset-[-18.75%_-32.14%_-56.25%_-32.14%]">
        <img alt="" className="block max-w-none size-full" src={ICONS.rules_active_tab} />
      </div>
    </div>
    <div className="absolute inset-[66.67%_4.17%_4.17%_37.5%]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.rules_active_subtract} />
    </div>
  </div>
);

const RulesIconInactive = () => (
  <div className="relative shrink-0 size-[24px]">
    <div className="absolute left-px size-[22px] top-px">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.rules_inactive} />
    </div>
  </div>
);

const ActivityIconActive = () => (
  <div className="relative shrink-0 size-[24px]">
    <div className="absolute inset-[12.5%_4.17%]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.activity_active_base} />
    </div>
    <div className="absolute inset-[20.83%_12.5%]">
      <div className="absolute inset-[-8.04%_-12.5%_-24.11%_-12.5%]">
        <img alt="" className="block max-w-none size-full" src={ICONS.activity_active_stroke} />
      </div>
    </div>
  </div>
);

const ActivityIconInactive = () => (
  <div className="relative shrink-0 size-[24px]">
    <div className="absolute inset-[12.5%_4.17%]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.activity_inactive} />
    </div>
  </div>
);

const SettingsIconActive = () => (
  <div className="relative shrink-0 size-[24px]">
    <div className="absolute inset-[4.17%]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.settings_active_vec} />
    </div>
    <div className="absolute inset-[33.33%]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.settings_active_vec1} />
    </div>
  </div>
);

const SettingsIconInactive = () => (
  <div className="relative shrink-0 size-[24px]">
    <div className="absolute inset-[4.17%]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.settings_inactive} />
    </div>
  </div>
);

const ChevronRight = () => (
  <div className="relative shrink-0 size-[24px]">
    <div className="absolute inset-[33.33%_43.39%_33.33%_41.67%]">
      <div className="absolute inset-[-12.5%_-27.89%]">
        <img alt="" className="block max-w-none size-full" src={ICONS.chevron_right} />
      </div>
    </div>
  </div>
);

const ExpandIcon = () => (
  <svg width="18" height="16" viewBox="0 0 20 18" fill="none">
    <path d="M11 6L14 9L11 12M13 9H6M3 17H17C18.1046 17 19 16.1046 19 15V3C19 1.89543 18.1046 1 17 1H3C1.89543 1 1 1.89543 1 3V15C1 16.1046 1.89543 17 3 17Z" stroke="#6C779D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

type NavItem = {
  path: string;
  label: string;
  ActiveIcon: () => JSX.Element;
  InactiveIcon: () => JSX.Element;
};

const MAIN_NAV: NavItem[] = [
  { path: "/", label: "Home", ActiveIcon: HomeIconActive, InactiveIcon: HomeIconInactive },
  { path: "/finances", label: "Finances", ActiveIcon: FinancesIconActive, InactiveIcon: FinancesIconInactive },
  { path: "/rules", label: "Rules", ActiveIcon: RulesIconActive, InactiveIcon: RulesIconInactive },
  { path: "/activity", label: "Activity", ActiveIcon: ActivityIconActive, InactiveIcon: ActivityIconInactive },
];

const OTHER_NAV: NavItem[] = [
  { path: "/settings", label: "Settings", ActiveIcon: SettingsIconActive, InactiveIcon: SettingsIconInactive },
];

export const NavigationMenuSection = ({ collapsed, onToggle, onLogout }: Props): JSX.Element => {
  const [location] = useLocation();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    return location.startsWith(path);
  };

  if (collapsed) {
    return (
      <>
        <LogoutConfirmModal show={showLogoutConfirm} onCancel={() => setShowLogoutConfirm(false)} onConfirm={() => { setShowLogoutConfirm(false); onLogout?.(); }} />
        <nav className="flex flex-col w-[60px] h-full rounded-[16px] border border-solid border-[#1d2132] bg-[#11141b] flex-shrink-0">
          <div className="flex flex-col flex-1 items-center mt-2 gap-1 w-full px-[7px]">
            <button onClick={onToggle} title="Expand menu" className="w-[40px] h-[40px] flex-shrink-0 flex items-center justify-center rounded-[100px]" style={{ background: "#222737" }}>
              <ExpandIcon />
            </button>
            <div className="w-[40px] h-[40px] flex-shrink-0 flex items-center justify-center">
              <img className="w-[40px] h-[40px] object-contain flex-shrink-0" alt="Brain" src={ICONS.brain_logo_3d} />
            </div>
            {[...MAIN_NAV, ...OTHER_NAV].map(({ path, label, ActiveIcon, InactiveIcon }) => (
              <Link key={path} href={path} className="outline-none focus:outline-none">
                <button title={label} className={`flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${isActive(path) ? "bg-[#0a0c10]" : "hover:bg-[rgba(168,185,244,0.08)]"}`}>
                  {isActive(path) ? <ActiveIcon /> : <InactiveIcon />}
                </button>
              </Link>
            ))}
          </div>
          <div className="flex flex-col items-center gap-2 pb-4 mt-auto pt-4 px-2">
            <button title="Logout" onClick={() => setShowLogoutConfirm(true)} className="flex items-center justify-center w-9 h-9 bg-[#350011] rounded-full hover:opacity-80 transition-opacity">
              <img className="w-5 h-5" alt="Logout" src={ICONS.logout} />
            </button>
          </div>
        </nav>
      </>
    );
  }

  return (
    <>
      <LogoutConfirmModal show={showLogoutConfirm} onCancel={() => setShowLogoutConfirm(false)} onConfirm={() => { setShowLogoutConfirm(false); onLogout?.(); }} />
      <nav className="flex flex-col w-[264px] h-full rounded-[16px] border border-solid border-[#1d2132] bg-[#11141b] flex-shrink-0 overflow-hidden">
        <div className="flex flex-col flex-1 mx-[7px] mt-[7px] gap-[16px] pb-0 overflow-y-auto min-h-0">

          {/* Header: Logo + Collapse button */}
          <div className="flex items-center justify-between relative shrink-0 w-full">
            <BrainLogo />
            <CollapseButton onClick={onToggle} />
          </div>

          {/* Main Menu section */}
          <div className="flex flex-col gap-[4px] items-start relative shrink-0 w-full">
            <div className="flex items-center justify-center px-[8px] relative shrink-0 w-full">
              <p className="flex-1 min-w-px [font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#414965] text-[12px]">Main Menu</p>
            </div>
            <div className="flex flex-col gap-[4px] items-start relative shrink-0 w-full">
              {MAIN_NAV.map(({ path, label, ActiveIcon, InactiveIcon }) => {
                const active = isActive(path);
                return (
                  <Link key={path} href={path} className="w-full outline-none focus:outline-none">
                    <button
                      data-testid={`nav-${label.toLowerCase()}`}
                      className="flex gap-[8px] items-center p-[8px] relative rounded-[12px] shrink-0 w-full transition-colors hover:opacity-90"
                      style={{ background: active ? "#0a0c10" : "#11141b" }}
                    >
                      {active ? <ActiveIcon /> : <InactiveIcon />}
                      <div className="flex flex-1 gap-[4px] items-center min-w-px relative">
                        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[16px] whitespace-nowrap" style={{ color: active ? "#ffffff" : "#6c779d" }}>
                          {label}
                        </p>
                      </div>
                      {active && <ChevronRight />}
                    </button>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="h-0 relative shrink-0 w-full">
            <div className="absolute inset-[-0.5px_0]">
              <img alt="" className="block max-w-none size-full" src={ICONS.divider} />
            </div>
          </div>

          {/* Other section */}
          <div className="flex flex-col gap-[4px] items-start relative shrink-0 w-full">
            <div className="flex items-center justify-center px-[8px] relative shrink-0 w-full">
              <p className="flex-1 min-w-px [font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#414965] text-[12px]">Other</p>
            </div>
            <div className="flex flex-col gap-[4px] items-start relative shrink-0 w-full">
              {OTHER_NAV.map(({ path, label, ActiveIcon, InactiveIcon }) => {
                const active = isActive(path);
                return (
                  <Link key={path} href={path} className="w-full outline-none focus:outline-none">
                    <button
                      data-testid={`nav-${label.toLowerCase()}`}
                      className="flex gap-[8px] items-center p-[8px] relative rounded-[12px] shrink-0 w-full transition-colors hover:opacity-90"
                      style={{ background: active ? "#0a0c10" : "#11141b" }}
                    >
                      {active ? <ActiveIcon /> : <InactiveIcon />}
                      <div className="flex flex-1 gap-[4px] items-center min-w-px relative">
                        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[16px] whitespace-nowrap" style={{ color: active ? "#ffffff" : "#6c779d" }}>
                          {label}
                        </p>
                      </div>
                      {active && <ChevronRight />}
                    </button>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Logout */}
        <div className="flex flex-col items-start gap-[8px] mx-[7px] mb-[7px] shrink-0">
          <button
            data-testid="button-logout"
            onClick={() => setShowLogoutConfirm(true)}
            className="flex items-center justify-center gap-[8px] px-[20px] py-[8px] w-full rounded-[100px] hover:opacity-80 transition-opacity"
            style={{ background: "#350011" }}
          >
            <div className="relative shrink-0 size-[24px]">
              <div className="absolute inset-[16.67%]">
                <div className="absolute inset-[-6.25%]">
                  <img alt="" className="block max-w-none size-full" src={ICONS.logout} />
                </div>
              </div>
            </div>
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#d20344] text-[16px] whitespace-nowrap">Logout</p>
          </button>
        </div>
      </nav>
    </>
  );
};
