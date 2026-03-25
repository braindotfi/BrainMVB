import { AccountOverviewSection } from "./sections/AccountOverviewSection";
import { HeaderFooterSection } from "./sections/HeaderFooterSection";
import { MainContentSection } from "./sections/MainContentSection";
import { NavigationMenuSection } from "./sections/NavigationMenuSection";

export const Marketplace = (): JSX.Element => {
  return (
    <div className="bg-shared-colorsheaderfooterbg w-full min-w-[1440px] min-h-[880px] flex flex-col">
      {/* Top header section spanning full width */}
      <HeaderFooterSection />

      {/* Main body: three columns side by side */}
      <div className="flex flex-row flex-1 w-full">
        {/* Left navigation column */}
        <NavigationMenuSection />

        {/* Center main content column */}
        <MainContentSection />

        {/* Right account overview column */}
        <AccountOverviewSection />
      </div>

      {/* Footer bar at the bottom */}
      <footer className="flex w-full h-14 items-center justify-between px-6 py-3 bg-shared-colorsheaderfooterbg">
        <div className="inline-flex items-center gap-3 flex-[0_0_auto]">
          <img
            className="w-[57.74px] h-[46.01px] mt-[-2.01px] mb-[-12.00px] ml-[-2.51px]"
            alt="Frame"
            src="/figmaAssets/frame-1000002162.svg"
          />
          <span className="w-fit [font-family:'Mont-Regular',Helvetica] font-normal text-shared-colorsbaby-blue-60 text-sm text-right tracking-[0] leading-[18px] whitespace-nowrap">
            Copyright © 2025 Brain Finance. All rights reserved.
          </span>
        </div>

        <img
          className="flex-[0_0_auto]"
          alt="Socials"
          src="/figmaAssets/socials.svg"
        />
      </footer>
    </div>
  );
};
