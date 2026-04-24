import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

const IMG_ICON_BG = "https://www.figma.com/api/mcp/asset/16ce30f8-5b65-45b9-9f49-434c443bcceb";
const IMG_ICON_ARROW = "https://www.figma.com/api/mcp/asset/a70b94ec-b33c-42ae-9646-ce831ef01ae8";
const IMG_DOT = "https://www.figma.com/api/mcp/asset/a01773a1-31c0-4017-8d1a-60bc12ffa8cb";

type Tab = "All" | "Payments" | "Flags" | "Moves";
const TABS: Tab[] = ["All", "Payments", "Flags", "Moves"];

const ActivityIconButton = ({ src }: { src: string }) => (
  <div className="relative rounded-[100px] shrink-0 size-[40px]">
    <div className="absolute left-0 size-[40px] top-0">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_ICON_BG} />
    </div>
    <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
      <div className="absolute bottom-[26.04%] left-[26.04%] right-1/4 top-1/4">
        <div className="absolute inset-[-8.51%]">
          <img alt="" className="block max-w-none size-full" src={src} />
        </div>
      </div>
    </div>
  </div>
);

const TODAY_ACTIVITIES = [
  { id: 1, title: "Paid Adobe subscription", meta1: "Automatic", meta2: "15th of every month", meta3: "Chase checking", amount: "$54", time: "9:14 AM" },
  { id: 2, title: "Moved $5,000 to savings", meta1: "Rule: savings sweep", meta2: "checking → savings", meta3: "", amount: "$5,000", time: "8:01 AM" },
  { id: 3, title: "Flagged unusual charge", meta1: "New vendor", meta2: "Awaiting review", meta3: "", amount: "$320", time: "7:45 AM" },
];

const YESTERDAY_ACTIVITIES = [
  { id: 4, title: "Paid Verizon bill", meta1: "Automatic", meta2: "Monthly", meta3: "Chase checking", amount: "$189", time: "9:00 AM" },
  { id: 5, title: "Invoice reminder sent", meta1: "Rule: overdue invoices", meta2: "Client: Acme Corp", meta3: "", amount: "", time: "10:30 AM" },
];

const ActivityItem = ({ item }: { item: typeof TODAY_ACTIVITIES[0] }) => (
  <div className="bg-[#0a0c10] flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
    <div className="flex flex-1 gap-[8px] items-center min-w-px relative">
      <ActivityIconButton src={IMG_ICON_ARROW} />
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
    <div className="flex flex-col items-start justify-center leading-[20px] not-italic relative shrink-0 text-right w-[100px]">
      {item.amount && <p className="[font-family:'JetBrains_Mono',sans-serif] font-semibold relative shrink-0 text-[#a8b9f4] text-[18px] w-full text-right">{item.amount}</p>}
      <p className="[font-family:'Gilroy',sans-serif] font-semibold relative shrink-0 text-[#414965] text-[16px] w-full text-right">{item.time}</p>
    </div>
  </div>
);

const SectionCard = ({ title, items }: { title: string; items: typeof TODAY_ACTIVITIES }) => (
  <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
    <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
      <div className="flex flex-1 items-center min-w-px relative">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px] whitespace-nowrap">{title}</p>
      </div>
    </div>
    <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
      <div className="flex flex-col gap-[8px] items-start relative shrink-0 w-full">
        {items.map((item, idx) => (
          <div key={item.id} className="w-full">
            <ActivityItem item={item} />
            {idx < items.length - 1 && <div className="h-px my-[4px] relative shrink-0 w-full" style={{ background: "#1d2132" }} />}
          </div>
        ))}
      </div>
    </div>
  </div>
);

export function ActivityPage() {
  const [activeTab, setActiveTab] = useState<Tab>("All");

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
            <div
              className="flex gap-[2px] items-center overflow-clip p-[2px] relative rounded-[400px] shrink-0"
              style={{ background: "#06070a" }}
            >
              {TABS.map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="flex items-center justify-center px-[12px] py-[6px] relative rounded-[400px] shrink-0 transition-all"
                    style={{
                      background: isActive ? "#222737" : "transparent",
                    }}
                    data-testid={`tab-${tab.toLowerCase()}`}
                  >
                    <p
                      className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[16px] whitespace-nowrap"
                      style={{ color: isActive ? "#a8b9f4" : "#414965" }}
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
            <SectionCard title="Today" items={TODAY_ACTIVITIES} />
            <SectionCard title="Yesterday" items={YESTERDAY_ACTIVITIES} />
          </div>

        </div>
      </ScrollArea>
    </div>
  );
}
