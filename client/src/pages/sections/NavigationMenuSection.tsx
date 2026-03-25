import { useLocation, Link } from "wouter";
import { Separator } from "@/components/ui/separator";

const mainMenuItems = [
  {
    id: "launchpad",
    label: "Launchpad",
    icon: "/figmaAssets/navbar-icons-3.svg",
    path: "/launchpad",
    emoji: "🚀",
  },
  {
    id: "assistant",
    label: "Assistant",
    icon: "/figmaAssets/navbar-icons.svg",
    path: "/assistant",
    emoji: null,
  },
  {
    id: "agents",
    label: "Agents",
    icon: "/figmaAssets/navbar-icons-1.svg",
    path: "/agents",
    emoji: null,
  },
  {
    id: "marketplace",
    label: "Marketplace",
    icon: "/figmaAssets/navbar-icons-3.svg",
    path: "/",
    emoji: null,
  },
];

const otherMenuItems = [
  {
    id: "notifications",
    label: "Notifications",
    icon: "/figmaAssets/navbar-icons-2.svg",
    path: "/notifications",
    badge: "12",
  },
  {
    id: "settings",
    label: "Settings",
    icon: "/figmaAssets/navbar-icons-5.svg",
    path: "/settings",
    badge: null,
  },
];

interface Props {
  collapsed?: boolean;
}

export const NavigationMenuSection = ({ collapsed = false }: Props): JSX.Element => {
  const [location] = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location === "/" || location === "";
    return location.startsWith(path);
  };

  if (collapsed) {
    return (
      <nav className="flex flex-col w-[60px] min-h-[774px] rounded-3xl overflow-hidden border border-solid border-[#1d2132] bg-brain-v1baby-blue-5 flex-shrink-0">
        <div className="flex flex-col flex-1 items-center mx-2 mt-2 gap-1 pt-2">
          {mainMenuItems.map((item) => (
            <Link key={item.id} href={item.path}>
              <button
                title={item.label}
                className={`flex items-center justify-center w-10 h-10 rounded-xl transition-colors ${
                  isActive(item.path)
                    ? "bg-brain-v1highlight-dropdown-bg"
                    : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"
                }`}
              >
                <img className="w-5 h-5" alt={item.label} src={item.icon} />
              </button>
            </Link>
          ))}

          <Separator className="w-8 bg-[#1d2132] my-2" />

          {otherMenuItems.map((item) => (
            <Link key={item.id} href={item.path}>
              <button
                title={item.label}
                className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15 transition-colors"
              >
                <img className="w-5 h-5" alt={item.label} src={item.icon} />
                {item.badge && (
                  <div className="absolute top-0 right-0 w-4 h-4 bg-brain-v1dark-orange rounded-full flex items-center justify-center">
                    <span className="text-[8px] text-white [font-family:'Gilroy-SemiBold',Helvetica]">
                      {item.badge}
                    </span>
                  </div>
                )}
              </button>
            </Link>
          ))}
        </div>

        <div className="flex flex-col items-center gap-2 mx-2 mb-4 mt-auto pt-4">
          <button
            title="Create an Agent"
            className="flex items-center justify-center w-10 h-10 bg-brain-v1dark-orange rounded-full"
          >
            <img className="w-4 h-4" alt="Create" src="/figmaAssets/icons-24.svg" />
          </button>
          <button
            title="Logout"
            className="flex items-center justify-center w-10 h-10 bg-brain-v1dark-pink-red rounded-full"
          >
            <img className="w-4 h-4" alt="Logout" src="/figmaAssets/icons-10.svg" />
          </button>
        </div>
      </nav>
    );
  }

  return (
    <nav className="flex flex-col w-[264px] min-h-[774px] rounded-3xl overflow-hidden border border-solid border-[#1d2132] bg-brain-v1baby-blue-5 flex-shrink-0">
      <div className="flex flex-col flex-1 mx-2 mt-2 gap-4 pt-2 pb-0">
        <div className="flex flex-col items-start gap-1 w-full">
          <div className="flex items-center justify-center gap-2 px-2 py-0 w-full">
            <span className="flex-1 [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-30 text-xs tracking-[0] leading-4">
              Main Menu
            </span>
          </div>

          <div className="flex flex-col items-start gap-1 w-full">
            {mainMenuItems.map((item) => (
              <Link key={item.id} href={item.path} className="w-full">
                <button
                  className={`flex items-center gap-2 p-2 w-full rounded-xl cursor-pointer transition-colors ${
                    isActive(item.path)
                      ? "bg-brain-v1highlight-dropdown-bg"
                      : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"
                  }`}
                >
                  <img className="w-6 h-6 flex-shrink-0" alt={item.label} src={item.icon} />
                  <div className="flex items-center gap-1 flex-1">
                    <span
                      className={`[font-family:'Gilroy-Medium',Helvetica] font-medium text-base tracking-[0] leading-5 whitespace-nowrap ${
                        isActive(item.path) ? "text-brain-v1white" : "text-brain-v1baby-blue-60"
                      }`}
                    >
                      {item.emoji ? `${item.emoji} ` : ""}{item.label}
                    </span>
                  </div>
                </button>
              </Link>
            ))}
          </div>
        </div>

        <Separator className="w-full bg-[#1d2132]" />

        <div className="flex flex-col items-start gap-1 w-full">
          <div className="flex items-center justify-center gap-2 px-2 py-0 w-full">
            <span className="flex-1 [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-30 text-xs tracking-[0] leading-4">
              Other
            </span>
          </div>

          <div className="flex flex-col items-start gap-1 w-full">
            {otherMenuItems.map((item) => (
              <Link key={item.id} href={item.path} className="w-full">
                <button
                  className={`flex items-center gap-2 p-2 w-full rounded-xl cursor-pointer transition-colors ${
                    isActive(item.path)
                      ? "bg-brain-v1baby-blue-15"
                      : "bg-brain-v1baby-blue-5 hover:bg-brain-v1baby-blue-15"
                  }`}
                >
                  <img className="w-6 h-6 flex-shrink-0" alt={item.label} src={item.icon} />
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
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-start gap-2 mx-2 mb-4 mt-auto pt-4">
        <button className="flex items-center justify-center gap-1 px-3 py-2 w-full bg-brain-v1dark-orange rounded-[100px]">
          <img className="w-4 h-4 flex-shrink-0" alt="Create" src="/figmaAssets/icons-24.svg" />
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-brain-v1light-orange text-xs font-semibold tracking-[0] leading-4 whitespace-nowrap">
            Create an Agent
          </span>
        </button>

        <button className="flex items-center justify-center gap-1 px-3 py-2 w-full bg-brain-v1dark-pink-red rounded-[100px]">
          <img className="w-4 h-4 flex-shrink-0" alt="Logout" src="/figmaAssets/icons-10.svg" />
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-brain-v1pink-red text-xs font-semibold tracking-[0] leading-4 whitespace-nowrap">
            Logout
          </span>
        </button>
      </div>
    </nav>
  );
};
