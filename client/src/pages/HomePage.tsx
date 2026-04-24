import { ScrollArea } from "@/components/ui/scroll-area";

const IMG_DOT = "https://www.figma.com/api/mcp/asset/5bdaa2a7-9ef5-472c-8736-e7eaf63ede35";
const IMG_DIVIDER = "https://www.figma.com/api/mcp/asset/bcb0d389-ab27-4633-b2e4-b0e02bc51a9e";
const IMG_ICON_BG = "https://www.figma.com/api/mcp/asset/16ce30f8-5b65-45b9-9f49-434c443bcceb";
const IMG_ICON_ARROW = "https://www.figma.com/api/mcp/asset/a70b94ec-b33c-42ae-9646-ce831ef01ae8";
const IMG_ICON_FLAG = "https://www.figma.com/api/mcp/asset/5ffd2545-786c-44b1-bcda-8012df286c92";

const NEEDS_REVIEW = [
  { id: 1, title: "Pay your phone bill?", vendor: "Verizon", amount: "$189", due: "Due Friday" },
  { id: 2, title: "Approve payroll for 8 people?", amount: "$12,800", due: "runs tomorrow morning" },
  { id: 3, title: "Approve payroll for 8 people?", amount: "$12,800", due: "runs tomorrow morning" },
  { id: 4, title: "Approve payroll for 8 people?", amount: "$12,800", due: "runs tomorrow morning" },
];

const ReviewItem = ({ item, highlighted }: { item: typeof NEEDS_REVIEW[0]; highlighted?: boolean }) => (
  <div
    className="content-stretch flex items-center p-[8px] relative rounded-[8px] shrink-0 w-full"
    style={{ background: highlighted ? "#11141b" : "#0a0c10", border: highlighted ? "1px solid #1d2132" : "none" }}
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

const ActionIconButton = ({ src }: { src: string }) => (
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
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#414965] text-[16px] uppercase whitespace-nowrap">Cash in the bank</p>
                  <div className="flex flex-col gap-[8px] items-start not-italic relative shrink-0 w-full">
                    <p className="[font-family:'Gilroy',sans-serif] leading-[0] relative shrink-0 text-[#a8b9f4] text-[0px] w-full">
                      <span className="font-medium leading-[36px] text-[32px]">$47,232</span>
                      <span className="font-medium leading-[36px] text-[#6c779d] text-[20px]">.42</span>
                    </p>
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[24px] relative shrink-0 text-[#414965] text-[20px] w-full">
                      Enough to cover the bills for about 6 months.
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

            {/* Bottom row */}
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
                      <div key={item.id} className="w-full">
                        <ReviewItem item={item} highlighted={idx === 1} />
                        {idx < NEEDS_REVIEW.length - 1 && (
                          <div className="h-px my-[4px] relative shrink-0 w-full" style={{ background: "#1d2132" }} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-[#0a0c10] flex flex-1 flex-col items-start min-w-px overflow-clip relative rounded-[16px]">
                <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">Recent Activity</p>
                </div>
                <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
                  <div className="flex flex-col gap-[8px] items-start relative shrink-0 w-full">
                    {[
                      { label: "Paid Adobe subscription", meta: "Automatic · 15th of every month", amount: "$54", time: "9:14 AM" },
                      { label: "Moved $5,000 to savings", meta: "Rule: savings sweep · Chase checking", amount: "$5,000", time: "8:01 AM" },
                      { label: "Paid Adobe subscription", meta: "Automatic · 15th of every month", amount: "$54", time: "Yesterday" },
                    ].map((act, idx) => (
                      <div key={idx} className="w-full">
                        <div className="bg-[#0a0c10] flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
                          <ActionIconButton src={IMG_ICON_ARROW} />
                          <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
                            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] w-full">{act.label}</p>
                            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] w-full">{act.meta}</p>
                          </div>
                          <div className="flex flex-col items-end justify-center leading-[20px] not-italic relative shrink-0 text-right w-[100px]">
                            <p className="[font-family:'JetBrains_Mono',sans-serif] font-semibold relative shrink-0 text-[#a8b9f4] text-[18px] w-full">{act.amount}</p>
                            <p className="[font-family:'Gilroy',sans-serif] font-semibold relative shrink-0 text-[#414965] text-[16px] w-full">{act.time}</p>
                          </div>
                        </div>
                        {idx < 2 && <div className="h-px my-[4px] relative shrink-0 w-full" style={{ background: "#1d2132" }} />}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
