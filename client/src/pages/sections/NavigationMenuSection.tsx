import { useState } from "react";
import { Separator } from "@/components/ui/separator";

// Main menu items data
const mainMenuItems = [
  {
    id: "assistant",
    label: "Assistant",
    icon: "/figmaAssets/navbar-icons.svg",
    active: false,
    indented: false,
    hasChevron: false,
  },
  {
    id: "agents",
    label: "Agents",
    icon: "/figmaAssets/navbar-icons-1.svg",
    active: false,
    indented: false,
    hasChevron: false,
  },
  {
    id: "marketplace",
    label: "Marketplace",
    icon: "/figmaAssets/navbar-icons-3.svg",
    active: true,
    indented: false,
    hasChevron: true,
    chevronIcon: "/figmaAssets/icons-12.svg",
  },
  {
    id: "trading",
    label: "Trading",
    icon: "/figmaAssets/navbar-icons-4.svg",
    active: false,
    indented: true,
    hasChevron: false,
  },
  {
    id: "payments",
    label: "Payments",
    icon: "/figmaAssets/navbar-icons-4.svg",
    active: false,
    indented: true,
    hasChevron: false,
  },
  {
    id: "lending",
    label: "Lending",
    icon: "/figmaAssets/navbar-icons-4.svg",
    active: false,
    indented: true,
    hasChevron: false,
  },
];

// Other menu items data
const otherMenuItems = [
  {
    id: "notifications",
    label: "Notifications",
    icon: "/figmaAssets/navbar-icons-2.svg",
    active: false,
    badge: "12",
  },
  {
    id: "settings",
    label: "Settings",
    icon: "/figmaAssets/navbar-icons-5.svg",
    active: true,
    badge: null,
  },
];

export const NavigationMenuSection = (): JSX.Element => {
  const [activeItem, setActiveItem] = useState<string>("marketplace");

  return (
    <nav className="flex flex-col w-[264px] min-h-[774px] rounded-3xl overflow-hidden border border-solid border-[#1d2132] bg-brain-v1baby-blue-5">
      {/* Top menu area */}
      <div className="flex flex-col flex-1 mx-2 mt-2 gap-4 pt-2 pb-0">
        {/* Main Menu section */}
        <div className="flex flex-col items-start gap-1 w-full">
          {/* Section label */}
          <div className="flex items-center justify-center gap-2 px-2 py-0 w-full">
            <span className="flex-1 [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-30 text-xs tracking-[0] leading-4">
              Main Menu
            </span>
          </div>

          {/* Main menu items */}
          <div className="flex flex-col items-start gap-1 w-full">
            {mainMenuItems.map((item) => (
              <div
                key={item.id}
                className={
                  item.indented
                    ? "flex flex-col items-start gap-2.5 pl-8 pr-0 py-0 w-full"
                    : "w-full"
                }
              >
                <button
                  onClick={() => setActiveItem(item.id)}
                  className={`flex items-center gap-2 p-2 w-full rounded-xl cursor-pointer ${
                    item.id === "marketplace"
                      ? "bg-brain-v1highlight-dropdown-bg"
                      : "bg-brain-v1baby-blue-5"
                  }`}
                >
                  <img
                    className="w-6 h-6 flex-shrink-0"
                    alt="Navbar icons"
                    src={item.icon}
                  />
                  <div className="flex items-center gap-1 flex-1">
                    <span
                      className={`[font-family:'Gilroy-Medium',Helvetica] font-medium text-base tracking-[0] leading-5 whitespace-nowrap ${
                        item.id === "marketplace"
                          ? "text-brain-v1white"
                          : "text-brain-v1baby-blue-60"
                      }`}
                    >
                      {item.label}
                    </span>
                  </div>
                  {item.hasChevron && item.chevronIcon && (
                    <img
                      className="w-6 h-6 flex-shrink-0"
                      alt="Icons"
                      src={item.chevronIcon}
                    />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <Separator className="w-full bg-[#1d2132]" />

        {/* Other section */}
        <div className="flex flex-col items-start gap-1 w-full">
          {/* Section label */}
          <div className="flex items-center justify-center gap-2 px-2 py-0 w-full">
            <span className="flex-1 [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-30 text-xs tracking-[0] leading-4">
              Other
            </span>
          </div>

          {/* Other menu items */}
          <div className="flex flex-col items-start gap-1 w-full">
            {otherMenuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveItem(item.id)}
                className={`flex items-center gap-2 p-2 w-full rounded-xl cursor-pointer ${
                  item.active
                    ? "bg-brain-v1baby-blue-15"
                    : "bg-brain-v1baby-blue-5"
                }`}
              >
                <img
                  className="w-6 h-6 flex-shrink-0"
                  alt="Navbar icons"
                  src={item.icon}
                />
                <div className="flex items-center gap-1 flex-1">
                  <span className="text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] font-medium text-base tracking-[0] leading-5 whitespace-nowrap">
                    {item.label}
                  </span>
                </div>
                {item.badge && (
                  <div className="inline-flex flex-col items-center justify-center p-0.5 bg-brain-v1baby-blue-15 rounded">
                    <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-xs text-center tracking-[0] leading-3 whitespace-nowrap">
                      {item.badge}
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom action buttons */}
      <div className="flex flex-col items-start gap-2 mx-2 mb-4 mt-auto pt-4">
        {/* Create an Agent button */}
        <button className="flex items-center justify-center gap-1 px-3 py-2 w-full bg-brain-v1dark-orange rounded-[100px]">
          <img
            className="w-4 h-4 flex-shrink-0"
            alt="Icons"
            src="/figmaAssets/icons-24.svg"
          />
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-brain-v1light-orange text-xs font-semibold tracking-[0] leading-4 whitespace-nowrap">
            Create an Agent
          </span>
        </button>

        {/* Logout button */}
        <button className="flex items-center justify-center gap-1 px-3 py-2 w-full bg-brain-v1dark-pink-red rounded-[100px]">
          <img
            className="w-4 h-4 flex-shrink-0"
            alt="Icons"
            src="/figmaAssets/icons-10.svg"
          />
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-brain-v1pink-red text-xs font-semibold tracking-[0] leading-4 whitespace-nowrap">
            Logout
          </span>
        </button>
      </div>
    </nav>
  );
};
