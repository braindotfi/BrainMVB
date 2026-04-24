import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

const IMG_DOT = "https://www.figma.com/api/mcp/asset/a01773a1-31c0-4017-8d1a-60bc12ffa8cb";

const IMG_PAID_BG = "https://www.figma.com/api/mcp/asset/4a21ae3f-c946-415c-9dcf-8da32ae1e553";
const IMG_PAID_VEC = "https://www.figma.com/api/mcp/asset/ddd6aff6-dc13-4525-b570-5d664761433c";

const IMG_MOVED_BG = "https://www.figma.com/api/mcp/asset/a2a3401f-002c-4082-9469-668eb8ac4e64";
const IMG_MOVED_VEC = "https://www.figma.com/api/mcp/asset/10cd81a4-26e1-4a14-a03b-91c1d270961c";

const IMG_NOTICED_BG = "https://www.figma.com/api/mcp/asset/05af9150-0767-4803-ba5b-074d070d3ab1";
const IMG_NOTICED_VEC = "https://www.figma.com/api/mcp/asset/a28b70b6-393a-49d0-9ab6-6035875bc4fd";

const IMG_APPROVED_BG = "https://www.figma.com/api/mcp/asset/087a9b7b-19ac-443d-b071-3c834656dba8";
const IMG_APPROVED_VEC = "https://www.figma.com/api/mcp/asset/d5b32c07-c2d6-453a-b226-6f188a12cbd0";
const IMG_APPROVED_VEC2 = "https://www.figma.com/api/mcp/asset/1ed82ec6-0f9a-4f71-a408-b362b9bfee9d";

type ActivityType = "paid" | "moved" | "noticed" | "approved";

const PaidIcon = () => (
  <div className="relative rounded-[100px] shrink-0 size-[40px]">
    <div className="absolute left-0 size-[40px] top-0">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_PAID_BG} />
    </div>
    <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
      <div className="absolute bottom-[26.04%] left-[26.04%] right-1/4 top-1/4">
        <div className="absolute inset-[-8.51%]">
          <img alt="" className="block max-w-none size-full" src={IMG_PAID_VEC} />
        </div>
      </div>
    </div>
  </div>
);

const MovedIcon = () => (
  <div className="relative rounded-[100px] shrink-0 size-[40px]">
    <div className="absolute left-0 size-[40px] top-0">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_MOVED_BG} />
    </div>
    <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
      <div className="absolute bottom-[26.04%] left-[26.04%] right-1/4 top-1/4">
        <div className="absolute inset-[-8.51%]">
          <img alt="" className="block max-w-none size-full" src={IMG_MOVED_VEC} />
        </div>
      </div>
    </div>
  </div>
);

const NoticedIcon = () => (
  <div className="relative rounded-[100px] shrink-0 size-[40px]">
    <div className="absolute left-0 size-[40px] top-0">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_NOTICED_BG} />
    </div>
    <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 overflow-clip size-[24px] top-1/2">
      <div className="absolute inset-[12.5%_12.5%_20.83%_12.5%]">
        <div className="absolute inset-[-6.25%_-5.56%]">
          <img alt="" className="block max-w-none size-full" src={IMG_NOTICED_VEC} />
        </div>
      </div>
    </div>
  </div>
);

const ApprovedIcon = () => (
  <div className="relative rounded-[100px] shrink-0 size-[40px]">
    <div className="absolute left-0 size-[40px] top-0">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_APPROVED_BG} />
    </div>
    <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
      <div className="absolute inset-[12.5%_12.49%_14.82%_33.33%]">
        <div className="absolute inset-[-5.73%_-7.69%]">
          <img alt="" className="block max-w-none size-full" src={IMG_APPROVED_VEC} />
        </div>
      </div>
      <div className="absolute inset-[41.67%_66.67%_16.67%_12.5%]">
        <div className="absolute inset-[-10%_-20%]">
          <img alt="" className="block max-w-none size-full" src={IMG_APPROVED_VEC2} />
        </div>
      </div>
    </div>
  </div>
);

type Tab = "All" | "Brain Did" | "You Approved" | "Brain Noticed";
const TABS: Tab[] = ["All", "Brain Did", "You Approved", "Brain Noticed"];

const ICON_MAP: Record<ActivityType, () => JSX.Element> = {
  paid: PaidIcon,
  moved: MovedIcon,
  noticed: NoticedIcon,
  approved: ApprovedIcon,
};

const TYPE_TO_TAB: Record<ActivityType, Tab> = {
  paid: "Brain Did",
  moved: "Brain Did",
  noticed: "Brain Noticed",
  approved: "You Approved",
};

type ActivityItemData = {
  id: number;
  type: ActivityType;
  title: string;
  meta1: string;
  meta2: string;
  meta3?: string;
  amount: string;
  time: string;
};

const TODAY_ACTIVITIES: ActivityItemData[] = [
  { id: 1, type: "paid", title: "Paid Adobe subscription", meta1: "Automatic", meta2: "15th of every month", meta3: "Chase checking", amount: "$54", time: "9:14 AM" },
  { id: 2, type: "paid", title: "Paid Comcast Fiber Internet", meta1: "Automatic", meta2: "15th of every month", meta3: "Chase checking", amount: "$240", time: "6:46 AM" },
  { id: 3, type: "noticed", title: "Noticed a new charge from a new company", meta1: "Meridian LLC", meta2: "I emailed your bookeeper and cc'ed you", amount: "$1,515", time: "3:11 AM" },
];

const YESTERDAY_ACTIVITIES: ActivityItemData[] = [
  { id: 4, type: "moved", title: "Moved idle USDC from savings to AAVE yield protocol", meta1: "Savings exceeded $5,000 threshold. Earning 4.5% yield now.", meta2: "", amount: "$3,500", time: "6:28 PM" },
  { id: 5, type: "noticed", title: "Got paid by Northstar Design", meta1: "Invoice #INV-2024-041", meta2: "Paid 3 days early", amount: "$6,200", time: "2:20 PM" },
  { id: 6, type: "approved", title: "You approved payroll payment for John Smith", meta1: "Payment was sent to John's IBAN bank account at Wells Fargo.", meta2: "", amount: "$5,600", time: "10:02 AM" },
];

const ActivityItem = ({ item }: { item: ActivityItemData }) => {
  const Icon = ICON_MAP[item.type];
  return (
    <div
      data-testid={`row-activity-${item.id}`}
      className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer"
    >
      <div className="flex flex-1 gap-[8px] items-center min-w-px relative">
        <Icon />
        <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] w-full">{item.title}</p>
          <div className="flex gap-[4px] items-center relative shrink-0 w-full flex-wrap">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px]">{item.meta1}</p>
            {item.meta2 && (
              <>
                <div className="relative shrink-0 size-[4px]"><img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_DOT} /></div>
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">{item.meta2}</p>
              </>
            )}
            {item.meta3 && (
              <>
                <div className="relative shrink-0 size-[4px]"><img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_DOT} /></div>
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">{item.meta3}</p>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end justify-center leading-[20px] not-italic relative shrink-0 text-right w-[100px]">
        {item.amount && <p className="[font-family:'JetBrains_Mono',sans-serif] font-semibold relative shrink-0 text-[#a8b9f4] text-[18px] w-full text-right">{item.amount}</p>}
        <p className="[font-family:'Gilroy',sans-serif] font-semibold relative shrink-0 text-[#414965] text-[16px] w-full text-right">{item.time}</p>
      </div>
    </div>
  );
};

const SectionCard = ({ title, items }: { title: string; items: ActivityItemData[] }) => {
  if (items.length === 0) return null;
  return (
    <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
      <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
        <div className="flex flex-1 items-center min-w-px relative">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px] whitespace-nowrap">{title}</p>
        </div>
      </div>
      <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
        <div className="flex flex-col gap-[8px] items-start relative shrink-0 w-full">
          {items.map((item, idx) => (
            <div key={item.id} className="flex flex-col gap-[8px] w-full">
              <ActivityItem item={item} />
              {idx < items.length - 1 && <div className="h-px shrink-0 w-full" style={{ background: "#1d2132" }} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export function ActivityPage() {
  const [activeTab, setActiveTab] = useState<Tab>("All");

  const filterByTab = (items: ActivityItemData[]) =>
    activeTab === "All" ? items : items.filter((it) => TYPE_TO_TAB[it.type] === activeTab);

  const todayItems = filterByTab(TODAY_ACTIVITIES);
  const yesterdayItems = filterByTab(YESTERDAY_ACTIVITIES);

  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[40px] items-start pb-[16px] pt-[40px] px-[16px] w-full">

          <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">
            {/* Header */}
            <div className="flex flex-col items-start relative shrink-0 w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#6c779d] text-[20px] whitespace-nowrap">Your Activity</p>
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] text-[#a8b9f4] text-[32px] whitespace-nowrap">What Brain has been up to.</p>
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#414965] text-[16px] whitespace-nowrap">
                Follow everything that Brain did or noticed. Tap for details.
              </p>
            </div>

            {/* Tab bar */}
            <div className="bg-[#06070a] flex gap-[2px] items-center overflow-clip p-[2px] relative rounded-[400px] shrink-0">
              {TABS.map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="flex items-center justify-center px-[16px] py-[8px] relative rounded-[100px] shrink-0 transition-colors"
                    style={{ background: isActive ? "#4a2300" : "transparent" }}
                    data-testid={`tab-${tab.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <p
                      className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[14px] whitespace-nowrap"
                      style={{ color: isActive ? "#ff9500" : "#414965" }}
                    >
                      {tab}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Activity sections */}
          <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">
            <SectionCard title="Today" items={todayItems} />
            <SectionCard title="Yesterday" items={yesterdayItems} />
          </div>

        </div>
      </ScrollArea>
    </div>
  );
}
