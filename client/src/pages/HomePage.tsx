import { ScrollArea } from "@/components/ui/scroll-area";

const IMG_DOT = "https://www.figma.com/api/mcp/asset/c4669f17-d98e-4165-bb29-b4f5f32a9a72";
const IMG_DIVIDER = "https://www.figma.com/api/mcp/asset/0064ca07-f987-4b4b-8242-4f91fb3acb69";

/* Actions widget icons (Figma 3839:43693) — green circle with checkmark */
const IMG_CHECK_ELLIPSE = "https://www.figma.com/api/mcp/asset/7da39f3e-8121-4716-b6f0-091a09769662";
const IMG_CHECK_VECTOR  = "https://www.figma.com/api/mcp/asset/f03a6f8a-d64d-4d18-a93d-0e92a25228a1";

/* Recommendations widget icons (Figma 3839:43709) — orange circle with "i" */
const IMG_INFO_ELLIPSE = "https://www.figma.com/api/mcp/asset/214f0423-8dd5-4e8a-ba46-5dc6be1df22b";
const IMG_INFO_VEC1    = "https://www.figma.com/api/mcp/asset/97d44e25-22ed-4288-81e6-95ebcea055cc";
const IMG_INFO_VEC2    = "https://www.figma.com/api/mcp/asset/204b7048-85f9-45a8-aacc-1a7629b7ce43";

const NEEDS_REVIEW = [
  { id: 1, title: "Pay your phone bill?", vendor: "Verizon", amount: "$189", due: "Due Friday" },
  { id: 2, title: "Approve payroll for 8 people?", amount: "$12,800", due: "runs tomorrow morning" },
  { id: 3, title: "Approve payroll for 8 people?", amount: "$12,800", due: "runs tomorrow morning" },
  { id: 4, title: "Approve payroll for 8 people?", amount: "$12,800", due: "runs tomorrow morning" },
];

const ACTIONS = [
  { id: 1, label: "Paid 3 small bills this morning." },
  { id: 2, label: "Paid car payment for the month of March, due tomorrow." },
];

const RECOMMENDATIONS = [
  { id: 1, label: "I found a payments agent that can help you manage recurring payments. Would you like to review it?" },
  { id: 2, label: "Savings rate went up. Want me to move idle cash there?" },
];

const ReviewItem = ({ item }: { item: typeof NEEDS_REVIEW[0] }) => (
  <div
    className="content-stretch flex items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer"
    data-testid={`review-item-${item.id}`}
  >
    <div className="flex flex-1 flex-col items-start min-w-px relative">
      <div className="flex items-center justify-center relative shrink-0 w-full">
        <p className="flex-1 min-w-px [font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[16px]">{item.title}</p>
      </div>
      <div className="flex gap-[8px] items-center justify-center relative shrink-0">
        {item.vendor && (
          <>
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">{item.vendor}</p>
            <div className="relative shrink-0 size-[4px]"><img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_DOT} /></div>
          </>
        )}
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">{item.amount}</p>
        <div className="relative shrink-0 size-[4px]"><img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_DOT} /></div>
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">{item.due}</p>
      </div>
    </div>
  </div>
);

const GreenCheckIcon = () => (
  <div className="relative rounded-[100px] shrink-0 size-[24px]">
    <div className="absolute left-0 size-[24px] top-0">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_CHECK_ELLIPSE} />
    </div>
    <div className="absolute left-[4px] size-[16px] top-[4px]">
      <div className="absolute inset-[16.65%_12.5%_16.68%_12.5%]">
        <div className="absolute inset-[-7.03%_-6.25%]">
          <img alt="" className="block max-w-none size-full" src={IMG_CHECK_VECTOR} />
        </div>
      </div>
    </div>
  </div>
);

const OrangeInfoIcon = () => (
  <div className="relative rounded-[100px] shrink-0 size-[24px]">
    <div className="absolute left-0 size-[24px] top-0">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_INFO_ELLIPSE} />
    </div>
    <div className="absolute left-[4px] size-[16px] top-[4px]">
      <div className="absolute inset-[12.5%]">
        <div className="absolute inset-[-6.25%]">
          <img alt="" className="block max-w-none size-full" src={IMG_INFO_VEC1} />
        </div>
      </div>
      <div className="absolute inset-[30.18%_46.88%_63.57%_46.88%]">
        <div className="absolute inset-[-25%]">
          <img alt="" className="block max-w-none size-full" src={IMG_INFO_VEC2} />
        </div>
      </div>
    </div>
  </div>
);

type WidgetItem = { id: number; label: string };
const ListItem = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
  <div className="bg-[#0a0c10] flex gap-[8px] items-start p-[8px] relative rounded-[8px] shrink-0 w-full">
    {icon}
    <div className="flex flex-1 flex-col items-start min-w-px relative">
      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[24px] text-[#a8b9f4] text-[16px] w-full">{label}</p>
    </div>
  </div>
);

const SectionWidget = ({ title, count, items, icon }: { title: string; count: number; items: WidgetItem[]; icon: React.ReactNode }) => (
  <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
    <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
      <div className="flex flex-1 gap-[8px] items-center min-w-px relative">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">{title}</p>
        <div className="bg-[#414965] flex flex-col items-center justify-center min-w-[16px] p-[2px] relative rounded-[4px] shrink-0">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[12px] text-[#a8b9f4] text-[12px] text-center whitespace-nowrap">{count}</p>
        </div>
      </div>
    </div>
    <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
      <div className="flex flex-col gap-[8px] items-start relative shrink-0 w-full">
        {items.map((item, idx) => (
          <div key={item.id} className="flex flex-col gap-[8px] w-full">
            <ListItem icon={icon} label={item.label} />
            {idx < items.length - 1 && (
              <div className="h-px relative shrink-0 w-full" style={{ background: "#1d2132" }} />
            )}
          </div>
        ))}
      </div>
    </div>
  </div>
);

export function HomePage() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[40px] items-start pb-[16px] pt-[40px] px-[16px] w-full">

          {/* Header */}
          <div className="flex flex-col items-start relative shrink-0 w-full">
            <div className="flex items-center relative shrink-0 w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[0] not-italic relative shrink-0 text-[#6c779d] text-[0px] whitespace-nowrap">
                <span className="leading-[24px] text-[20px]">{greeting}, </span>
                <span className="leading-[24px] text-[#a8b9f4] text-[20px]">Maria</span>
                <span className="leading-[24px] text-[20px]">.</span>
              </p>
            </div>
            <div className="flex items-center relative shrink-0 w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] not-italic relative shrink-0 text-[#a8b9f4] text-[32px] whitespace-nowrap">
                Here's where your business stands today.
              </p>
            </div>
          </div>

          {/* Stat cards row */}
          <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">
            <div className="flex gap-[16px] items-stretch relative shrink-0 w-full">
              <div className="bg-[#0a0c10] flex flex-1 flex-col items-start min-w-px p-[16px] relative rounded-[16px]">
                <div className="flex flex-col gap-[8px] items-start justify-center relative shrink-0 w-full">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#414965] text-[16px] uppercase whitespace-nowrap">Money in all accounts</p>
                  <div className="flex flex-col gap-[8px] items-start not-italic relative shrink-0 w-full">
                    <p className="[font-family:'Gilroy',sans-serif] leading-[0] relative shrink-0 text-[#a8b9f4] text-[0px] w-full">
                      <span className="font-medium leading-[36px] text-[32px]">$86,993</span>
                      <span className="font-medium leading-[36px] text-[#6c779d] text-[20px]">.42</span>
                    </p>
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[24px] relative shrink-0 text-[#414965] text-[20px] w-full">
                      Across bank, crypto and agent accounts.
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-[#0a0c10] flex flex-1 flex-col items-start min-w-px p-[16px] relative rounded-[16px]">
                <div className="flex flex-col gap-[8px] items-start justify-center relative shrink-0 w-full">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#414965] text-[16px] uppercase whitespace-nowrap">You're spending about</p>
                  <div className="flex flex-col gap-[8px] items-start not-italic relative shrink-0 w-full">
                    <p className="[font-family:'Gilroy',sans-serif] leading-[0] relative shrink-0 text-[#a8b9f4] text-[0px] w-full">
                      <span className="font-medium leading-[36px] text-[32px]">$7,324</span>
                      <span className="font-medium leading-[36px] text-[#6c779d] text-[20px]">/mo</span>
                    </p>
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[24px] relative shrink-0 text-[#42bf23] text-[20px] w-full">
                      $432 less than last month. Nice
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="h-px relative shrink-0 w-full" style={{ background: "#1d2132" }} />

            {/* Bottom row: Needs Review (left) + Actions/Recommendations stacked (right) */}
            <div className="flex gap-[16px] items-start relative shrink-0 w-full">
              {/* Needs Review */}
              <div className="bg-[#0a0c10] flex flex-1 flex-col items-start min-w-px overflow-clip relative rounded-[16px]">
                <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
                  <div className="flex flex-1 gap-[8px] items-center min-w-px relative">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">Needs Review</p>
                    <div className="bg-[#414965] flex flex-col items-center justify-center min-w-[16px] p-[2px] relative rounded-[4px] shrink-0">
                      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[12px] text-[#a8b9f4] text-[12px] text-center whitespace-nowrap">{NEEDS_REVIEW.length}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
                  <div className="flex flex-col gap-[8px] items-start relative shrink-0 w-full">
                    {NEEDS_REVIEW.map((item, idx) => (
                      <div key={item.id} className="flex flex-col gap-[8px] w-full">
                        <ReviewItem item={item} />
                        {idx < NEEDS_REVIEW.length - 1 && (
                          <div className="h-px relative shrink-0 w-full" style={{ background: "#1d2132" }} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right column: Actions + Recommendations */}
              <div className="flex flex-1 flex-col gap-[16px] items-start relative">
                <SectionWidget title="Actions"          count={ACTIONS.length}          items={ACTIONS}          icon={<GreenCheckIcon />} />
                <SectionWidget title="Recommendations"  count={RECOMMENDATIONS.length}  items={RECOMMENDATIONS}  icon={<OrangeInfoIcon />} />
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
