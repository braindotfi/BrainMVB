import { useState } from "react";

// Asset data for the list
const assetsData = [
  {
    icon: "/figmaAssets/crypto-icons.svg",
    name: "Ethereum",
    ticker: "ETH",
    value: "$2,500",
    amount: "1.245",
    iconSize: "w-10 h-10",
  },
  {
    icon: "/figmaAssets/crypto-icons-3.svg",
    name: "Dollar",
    ticker: "USD",
    value: "$10,000",
    amount: "10,000",
    iconSize: "w-10 h-10",
  },
  {
    icon: "/figmaAssets/crypto-icons-1.svg",
    name: "Polygon",
    ticker: "MATIC",
    value: "$16,832.85",
    amount: "295.23",
    iconSize: "w-10 h-10",
  },
  {
    icon: "/figmaAssets/crypto-icons-2.svg",
    name: "Binance",
    ticker: "BNB",
    value: "$2,500",
    amount: "1.245",
    iconSize: "w-10 h-10",
  },
  {
    icon: "/figmaAssets/crypto-icons-3.svg",
    name: "Dollar",
    ticker: "USD",
    value: "$10,000",
    amount: "10,000",
    iconSize: "w-10 h-10",
  },
];

// Action buttons for the card section
const cardActions = [
  { icon: "/figmaAssets/icons-4.svg", label: "Add" },
  { icon: "/figmaAssets/icons-14.svg", label: "Send" },
  { icon: "/figmaAssets/icons-9.svg", label: "Exchange" },
];

// Filter tabs for assets
const filterTabs = ["All", "Cash", "Crypto"];

// Main tab options
const mainTabs = ["Assets", "Transactions"];

export const AccountOverviewSection = (): JSX.Element => {
  const [activeFilter, setActiveFilter] = useState("All");
  const [activeTab, setActiveTab] = useState("Assets");

  return (
    <div className="flex flex-col gap-4 rounded-3xl overflow-hidden border border-solid border-[#1d2131] bg-shared-colorsbaby-blue-5 w-[386px]">
      {/* Header bar */}
      <div className="flex mx-2 mt-2 h-12 items-center gap-2 p-2 bg-brain-v1baby-blue-15 rounded-2xl">
        <div className="flex items-center gap-2 flex-1">
          <img
            className="w-8 h-8"
            alt="Wallet icons"
            src="/figmaAssets/wallet-icons-1.svg"
          />
          <span className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-brain-v1baby-blue-100 text-base tracking-[0] leading-5 whitespace-nowrap">
            Your Account
          </span>
        </div>

        <div className="inline-flex items-center gap-2 flex-shrink-0">
          <img
            className="w-5 h-5"
            alt="Icons"
            src="/figmaAssets/icons-15.svg"
          />
          <img
            className="w-6 h-6"
            alt="Icons"
            src="/figmaAssets/icons-13.svg"
          />
        </div>
      </div>

      {/* Card + Actions section */}
      <div className="h-[290px] w-[370px] self-center relative">
        {/* Actions bar below card */}
        <div className="absolute top-[152px] left-0 w-[370px] h-[138px] flex bg-brain-v1headerfooterbg rounded-2xl">
          <div className="flex mt-16 w-[338px] h-[58px] ml-4 items-center gap-2">
            {cardActions.map((action) => (
              <div
                key={action.label}
                className="flex flex-col items-center justify-center gap-1 flex-1 cursor-pointer"
              >
                <div className="relative w-10 h-10 bg-brain-v1dark-orange rounded-[100px] flex items-center justify-center">
                  <img
                    className="w-6 h-6"
                    alt={action.label}
                    src={action.icon}
                  />
                </div>
                <span className="self-stretch [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-xs text-center tracking-[0] leading-[14px]">
                  {action.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Debit card */}
        <div className="absolute top-0 left-0 w-[370px] h-[200px] bg-brain-v1dark-orange rounded-2xl overflow-hidden shadow-[0px_5px_11px_#0000004a,0px_20px_20px_#00000042,0px_44px_26px_#00000026,0px_78px_31px_#0000000a,0px_122px_34px_#00000003] before:content-[''] before:absolute before:inset-0 before:p-[1.4px] before:rounded-2xl before:[background:linear-gradient(119deg,rgba(255,149,0,0.42)_0%,rgba(255,149,0,0)_36%,rgba(255,149,0,0.06)_67%,rgba(255,149,0,0.6)_100%)] before:[-webkit-mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] before:[-webkit-mask-composite:xor] before:[mask-composite:exclude] before:z-[1] before:pointer-events-none">
          {/* Glow effect */}
          <div className="absolute top-[-110px] left-[68px] w-[451px] h-[246px] bg-brain-v1light-orange rounded-[225.41px/123.04px] rotate-[-52.17deg] blur-[37px] opacity-60" />

          {/* Balance row */}
          <div className="flex w-[338px] items-center justify-center gap-4 absolute top-4 left-4">
            <img
              className="w-12 h-12"
              alt="Wallet icons"
              src="/figmaAssets/wallet-icons.svg"
            />
            <div className="flex items-center gap-2 flex-1">
              <span className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-brain-v1white text-[32px] text-center tracking-[0] leading-8 whitespace-nowrap">
                865,040.30
              </span>
              <div className="inline-flex items-start px-1.5 py-0.5 bg-brain-v1white-30 rounded-[100px]">
                <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-xs tracking-[0] leading-3 whitespace-nowrap">
                  AED
                </span>
              </div>
            </div>
          </div>

          {/* Card number row */}
          <div className="flex flex-col w-[338px] items-start gap-1 absolute top-20 left-4">
            <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1light-orange text-xs tracking-[0] leading-3 whitespace-nowrap">
              Debit Card
            </span>
            <div className="flex items-start gap-2 self-stretch w-full">
              <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-xl tracking-[0] leading-6 whitespace-nowrap">
                1652 0400 3201 6995
              </span>
              <img
                className="w-6 h-6"
                alt="Icons"
                src="/figmaAssets/icons-8.svg"
              />
            </div>
          </div>

          {/* Card details row */}
          <div className="absolute top-[136px] left-4 w-[338px] h-8 flex">
            <div className="inline-flex w-[84px] h-8 flex-col items-start gap-1">
              <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1light-orange text-xs leading-3 whitespace-nowrap tracking-[0]">
                Name
              </span>
              <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-sm tracking-[0] leading-4">
                Adam Jones
              </span>
            </div>

            <div className="inline-flex w-11 h-8 ml-[50px] flex-col items-start gap-1">
              <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1light-orange text-xs tracking-[0] leading-3 whitespace-nowrap">
                Expiry
              </span>
              <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-sm tracking-[0] leading-4">
                12/24
              </span>
            </div>

            <div className="inline-flex w-[26px] h-8 ml-10 flex-col items-start gap-1">
              <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1light-orange text-xs tracking-[0] leading-3 whitespace-nowrap">
                CVC
              </span>
              <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-sm tracking-[0] leading-4">
                592
              </span>
            </div>

            {/* Overlapping circles (card brand logo) */}
            <div className="h-[26px] w-[42px] self-center relative ml-[52px]">
              <div className="absolute top-0 left-4 w-[26px] h-[26px] bg-brain-v1light-orange rounded-[13px] opacity-40" />
              <div className="absolute top-0 left-0 w-[26px] h-[26px] bg-brain-v1light-orange rounded-[13px] opacity-40" />
            </div>
          </div>

          {/* Dots indicator */}
          <img
            className="absolute top-[182px] left-[172px] w-[26px] h-1.5"
            alt="Frame"
            src="/figmaAssets/frame-2131329948.svg"
          />
        </div>
      </div>

      {/* Assets section */}
      <div className="flex mx-2 flex-col items-start gap-4 w-[370px]">
        {/* Tab headers + filter pills */}
        <div className="flex flex-col items-start gap-2 self-stretch w-full">
          {/* Main tabs: Assets / Transactions */}
          <div className="flex items-start gap-[17px] self-stretch w-full">
            {mainTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-2xl tracking-[0] leading-7 whitespace-nowrap bg-transparent border-none p-0 cursor-pointer ${
                  activeTab === tab
                    ? "text-brain-v1baby-blue-100"
                    : "text-brain-v1baby-blue-30"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Filter pills */}
          <div className="flex w-[370px] items-center gap-0.5 p-0.5 bg-brain-v1headerfooterbg rounded-[400px] overflow-hidden">
            {filterTabs.map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`flex items-center justify-center gap-[17px] px-4 py-2 flex-1 rounded-[100px] border-none cursor-pointer transition-colors ${
                  activeFilter === filter
                    ? "bg-brain-v1dark-green"
                    : "bg-brain-v1headerfooterbg"
                }`}
              >
                <span
                  className={`[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm tracking-[0] leading-4 whitespace-nowrap ${
                    activeFilter === filter
                      ? "text-brain-v1green"
                      : "text-brain-v1baby-blue-30"
                  }`}
                >
                  {filter}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Asset list */}
        <div className="flex flex-col items-start gap-4 self-stretch w-full">
          {assetsData.map((asset, index) => (
            <div
              key={`${asset.ticker}-${index}`}
              className="flex flex-col self-stretch w-full gap-4"
            >
              <div className="flex items-center gap-2 self-stretch w-full">
                <img
                  className={`${asset.iconSize} flex-shrink-0`}
                  alt={`${asset.name} icon`}
                  src={asset.icon}
                />
                <div className="flex items-center justify-center gap-2 flex-1">
                  <div className="inline-flex flex-col items-start gap-1 flex-shrink-0">
                    <span className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-brain-v1baby-blue-100 text-base tracking-[0] leading-5 whitespace-nowrap">
                      {asset.name}
                    </span>
                    <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-30 text-sm leading-4 whitespace-nowrap tracking-[0]">
                      {asset.ticker}
                    </span>
                  </div>

                  <div className="flex flex-col items-start justify-center gap-1 flex-1">
                    <span className="self-stretch [font-family:'JetBrains_Mono',Helvetica] font-medium text-brain-v1green text-base text-right leading-5 tracking-[0]">
                      {asset.value}
                    </span>
                    <span className="self-stretch [font-family:'JetBrains_Mono',Helvetica] font-medium text-brain-v1baby-blue-30 text-sm text-right tracking-[0] leading-4">
                      {asset.amount}
                    </span>
                  </div>
                </div>
              </div>

              {/* Separator between items (not after last) */}
              {index < assetsData.length - 1 && (
                <img
                  className="self-stretch w-full h-px"
                  alt="Vector"
                  src="/figmaAssets/vector-933.svg"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
