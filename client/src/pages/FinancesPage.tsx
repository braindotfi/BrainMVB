import { ScrollArea } from "@/components/ui/scroll-area";

const IMG_DOT = "https://www.figma.com/api/mcp/asset/a01773a1-31c0-4017-8d1a-60bc12ffa8cb";
const IMG_DIVIDER = "https://www.figma.com/api/mcp/asset/93f4fc57-f8fb-4fff-a9a5-9961a954e865";
const IMG_16PX_ICON = "https://www.figma.com/api/mcp/asset/1462ed4f-5980-42d5-bc84-07e88d329b94";

const ACCOUNTS = [
  { name: "Chase Business Checking", sub: "Your main account", sub2: "Pays most bills from here", balance: "$32,523", highlighted: false },
  { name: "Chase Savings", sub: "Earnings 4.2%", sub2: "Brains tops this up from checking", balance: "$15,000", highlighted: true },
  { name: "Account Totals", sub: "Enough for about 6 months at your current spending", sub2: "", balance: "$47,523", highlighted: false },
];

const SPENDING = [
  { category: "Payroll", amount: "$12,800", period: "every 2 weeks", auto: true },
  { category: "SaaS Subscriptions", amount: "$1,240", period: "monthly", auto: true },
  { category: "Contractors", amount: "$3,200", period: "variable", auto: false },
];

export function FinancesPage() {
  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[40px] items-start pb-[16px] pt-[40px] px-[16px] w-full">

          {/* Header */}
          <div className="flex flex-col items-start relative shrink-0 w-full">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#6c779d] text-[20px] whitespace-nowrap">Your Finances</p>
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] text-[#a8b9f4] text-[32px] whitespace-nowrap">Here's your financial snapshot right now.</p>
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#414965] text-[16px] whitespace-nowrap">Updated 2 minutes ago...</p>
          </div>

          <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">

            {/* Accounts */}
            <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
              <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
                <div className="flex flex-1 items-center min-w-px relative">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px] whitespace-nowrap">Accounts</p>
                </div>
              </div>
              <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
                <div className="flex flex-col gap-[8px] items-start relative shrink-0 w-full">
                  {ACCOUNTS.map((acc, idx) => (
                    <div key={idx} className="w-full">
                      <div
                        className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full"
                        style={{
                          background: acc.highlighted ? "#11141b" : "#0a0c10",
                          border: acc.highlighted ? "1px solid #1d2132" : "none",
                        }}
                      >
                        <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
                          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">{acc.name}</p>
                          <div className="flex gap-[4px] items-center relative shrink-0">
                            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">{acc.sub}</p>
                            {acc.sub2 && (
                              <>
                                <div className="relative shrink-0 size-[4px]"><img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_DOT} /></div>
                                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">{acc.sub2}</p>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end justify-center relative shrink-0">
                          <p className="[font-family:'JetBrains_Mono',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[18px] text-right whitespace-nowrap">{acc.balance}</p>
                        </div>
                      </div>
                      {idx < ACCOUNTS.length - 1 && (
                        <div className="h-px my-[4px] relative shrink-0 w-full" style={{ background: "#1d2132" }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Spending Breakdown */}
            <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
              <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
                <div className="flex flex-1 items-center min-w-px relative">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px] whitespace-nowrap">Spending Breakdown</p>
                </div>
              </div>
              <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
                <div className="flex flex-col gap-[8px] items-start relative shrink-0 w-full">
                  {SPENDING.map((item, idx) => (
                    <div key={idx} className="w-full">
                      <div className="bg-[#0a0c10] flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
                        <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
                          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">{item.category}</p>
                          <div className="flex gap-[4px] items-center relative shrink-0">
                            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">{item.period}</p>
                            <div className="relative shrink-0 size-[4px]"><img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_DOT} /></div>
                            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">{item.auto ? "Auto" : "Manual"}</p>
                          </div>
                        </div>
                        <p className="[font-family:'JetBrains_Mono',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[18px] text-right whitespace-nowrap">{item.amount}</p>
                      </div>
                      {idx < SPENDING.length - 1 && (
                        <div className="h-px my-[4px] relative shrink-0 w-full" style={{ background: "#1d2132" }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
