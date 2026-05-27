import { useState } from "react";
import { useLocation, Link } from "wouter";
import { ICONS } from "@/assets/figma-icons";
import { useRuleSuggestions } from "@/lib/rule-suggestions";
import { NEEDS_REVIEW } from "@/components/ReviewItems";

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

import robotMoneyLogo from "@assets/robotmoney_1779790884383.png";

const BrainLogo = () => (
  <div className="h-[48px] relative shrink-0 w-[150px] flex items-center pl-[17px]">
    <img alt="Robot Money" className="h-[40px] w-auto object-contain" src={robotMoneyLogo} />
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

/* Review icon — Figma 4062:44310 (inactive) / 4062:44311 (active) */
const ReviewIconActive = () => (
  <div className="relative shrink-0 size-[24px]">
    <div className="absolute h-[20px] left-[3px] top-[3px] w-[18px]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.review_active_body} />
    </div>
    <div className="absolute h-[5px] left-[7px] top-px w-[10px]">
      <div className="absolute inset-[-22.5%_-22.5%_-67.5%_-22.5%]">
        <img alt="" className="block max-w-none size-full" src={ICONS.review_active_tab} />
      </div>
    </div>
    <div className="absolute h-[8px] left-1/2 top-[calc(50%+2px)] w-[9px] -translate-x-1/2 -translate-y-1/2">
      <div className="absolute inset-[-14.06%_-25%_-42.19%_-25%]">
        <img alt="" className="block max-w-none size-full" src={ICONS.review_active_check} />
      </div>
    </div>
  </div>
);

const ReviewIconInactive = () => (
  <div className="relative shrink-0 size-[24px]">
    <div className="absolute h-[22px] left-[3px] top-px w-[18px]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.review_inactive_subtract} />
    </div>
  </div>
);

/* Rules icon — Figma 4062:44620 (inactive) / 4062:44617 (active) */
const RulesIconActive = () => (
  <div className="relative shrink-0 size-[24px]">
    <div className="absolute inset-[4.17%_8.33%]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.rules_active_vec} />
    </div>
    <div className="absolute bottom-[33.33%] left-[29.17%] right-1/4 top-[20.83%]">
      <div className="absolute inset-[-10.23%_-20.45%_-30.68%_-20.45%]">
        <img alt="" className="block max-w-none size-full" src={ICONS.rules_active_vec1} />
      </div>
    </div>
  </div>
);

const RulesIconInactive = () => (
  <div className="relative shrink-0 size-[24px]">
    <div className="absolute inset-[4.17%_8.33%]">
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

/* Notification counter badge — Figma 3876:70929 (Counter)
   bg #7631ee, text #240757 (dark purple), rounded-[4px], min-w-[16px], p-[2px] */
const NotificationBadge = ({ count, testId }: { count: number; testId?: string }) => (
  <div
    data-testid={testId}
    className="bg-[#7631ee] flex flex-col items-center justify-center min-w-[16px] p-[2px] relative rounded-[4px] shrink-0"
  >
    <p
      className="[font-family:'Gilroy',sans-serif] font-semibold leading-[12px] text-[#240757] text-[12px] text-center whitespace-nowrap"
    >
      {count > 99 ? "99+" : count}
    </p>
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
  { path: "/review", label: "Review", ActiveIcon: ReviewIconActive, InactiveIcon: ReviewIconInactive },
  { path: "/rules", label: "Rules", ActiveIcon: RulesIconActive, InactiveIcon: RulesIconInactive },
  { path: "/activity", label: "Activity", ActiveIcon: ActivityIconActive, InactiveIcon: ActivityIconInactive },
];

const OTHER_NAV: NavItem[] = [
  { path: "/settings", label: "Settings", ActiveIcon: SettingsIconActive, InactiveIcon: SettingsIconInactive },
];

export const NavigationMenuSection = ({ collapsed, onToggle, onLogout }: Props): JSX.Element => {
  const [location] = useLocation();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const ruleSuggestionsCount = useRuleSuggestions().length;
  const reviewItemsCount = NEEDS_REVIEW.length;

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    return location.startsWith(path);
  };

  /** Returns the badge count for a nav item by path, or 0 if no badge applies. */
  const getNavCount = (path: string) => {
    if (path === "/rules") return ruleSuggestionsCount;
    if (path === "/review") return reviewItemsCount;
    return 0;
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
            {[...MAIN_NAV, ...OTHER_NAV].map(({ path, label, ActiveIcon, InactiveIcon }) => {
              const count = getNavCount(path);
              return (
                <Link key={path} href={path} className="outline-none focus:outline-none">
                  <button
                    title={count > 0 ? `${label} (${count} new)` : label}
                    data-testid={`nav-collapsed-${label.toLowerCase()}`}
                    className={`relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${isActive(path) ? "bg-[#0a0c10]" : "hover:bg-[rgba(168,185,244,0.08)]"}`}
                  >
                    {isActive(path) ? <ActiveIcon /> : <InactiveIcon />}
                    {count > 0 && (
                      <span
                        data-testid={`badge-collapsed-${label.toLowerCase()}`}
                        className="absolute top-[2px] right-[2px] size-[8px] rounded-full bg-[#7631ee] ring-2 ring-[#11141b]"
                      />
                    )}
                  </button>
                </Link>
              );
            })}
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
                const count = getNavCount(path);
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
                      {count > 0 && <NotificationBadge count={count} testId={`badge-${label.toLowerCase()}`} />}
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
