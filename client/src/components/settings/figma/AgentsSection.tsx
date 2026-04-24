import { useState } from "react";
import { SUB } from "@/assets/sub-icons";
import { Switch } from "./FigmaPrimitives";
import { useCurrency } from "@/lib/currencyContext";
import { formatThousandsInput } from "@/lib/formatters";

  export default function AgentsSection() {
    const { currency } = useCurrency();
    const [autoApprove, setAutoApprove] = useState<string>("");
    const [maxDailySpend, setMaxDailySpend] = useState<string>("");
    return (
      <div className="flex flex-col gap-6 w-full">
        <div className="content-stretch flex flex-col gap-[4px] items-start relative shrink-0 w-full">
        <div className="content-stretch flex flex-col h-[24px] items-start relative shrink-0 w-full">
          <p className="font-['Gilroy',sans-serif] font-semibold leading-[24px] not-italic relative shrink-0 text-[#414965] text-[16px] w-full">
            Permissions
          </p>
        </div>
        <div className="bg-[#0a0c10] content-stretch flex flex-col gap-[16px] items-start overflow-clip p-[16px] relative rounded-[16px] shrink-0 w-full">
          <div className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full">
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["3fbb6f43"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 overflow-clip size-[24px] top-1/2">
                  <div className="absolute inset-[12.5%_12.5%_20.83%_8.33%]">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["fdce3b01"]} />
                  </div>
                  <div className="absolute inset-[58.33%_12.5%_4.17%_70.83%]">
                    <div className="absolute inset-[-11.11%_-25%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["60c74507"]} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  Allow Agent Transactions
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">
                    Let AI agents execute payments on your behalf
                  </p>
                </div>
              </div>
            </div>
            <Switch active className="h-[24px] relative rounded-[100px] shrink-0 w-[40px]" />
          </div>
          <div className="h-0 relative shrink-0 w-full">
            <div className="absolute inset-[-0.5px_0]">
              <img alt="" className="block max-w-none size-full" src={SUB["a77bbc50"]} />
            </div>
          </div>
          <div className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full">
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["3fbb6f43"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 overflow-clip size-[24px] top-1/2">
                  <div className="absolute inset-[8.33%_33.33%_8.33%_16.67%]">
                    <div className="absolute inset-[-5%_-8.33%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["f200ed1c"]} />
                    </div>
                  </div>
                  <div className="absolute inset-[66.67%_20.85%_8.33%_45.81%]">
                    <div className="absolute inset-[-16.67%_-12.5%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["7659b95d"]} />
                    </div>
                  </div>
                  <div className="absolute inset-[54.17%_29.19%_33.33%_54.14%]">
                    <div className="absolute inset-[-33.33%_-25%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["79cb5758"]} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  Require 2FA for Agent Payments
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">
                    Confirm agent spends via authenticator
                  </p>
                </div>
              </div>
            </div>
            <Switch className="h-[24px] relative rounded-[12px] shrink-0 w-[40px]" />
          </div>
          <div className="h-0 relative shrink-0 w-full">
            <div className="absolute inset-[-0.5px_0]">
              <img alt="" className="block max-w-none size-full" src={SUB["a77bbc50"]} />
            </div>
          </div>
          <div className="content-stretch flex gap-[16px] items-center relative shrink-0 w-full">
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["3fbb6f43"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
                  <div className="absolute inset-[12.5%]">
                    <div className="absolute inset-[-5.56%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["94213b81"]} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start justify-center min-w-px relative">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] w-full">
                  Max Auto-Approve Amount
                </p>
                <div className="content-stretch flex items-center relative shrink-0 w-full">
                  <p className="flex-[1_0_0] font-['Gilroy',sans-serif] font-medium leading-[16px] min-w-px not-italic relative text-[#6c779d] text-[14px]">
                    Amounts below this execute without confirmation
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-[#222737] border border-[#414965] border-solid content-stretch flex gap-[8px] items-center px-[8px] py-[10px] relative rounded-[8px] shrink-0 w-[160px]">
              <div className="content-stretch flex flex-[1_0_0] items-center min-w-px relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={autoApprove}
                  onChange={(e) => setAutoApprove(formatThousandsInput(e.target.value))}
                  placeholder="0"
                  className="bg-transparent border-none outline-none w-full font-['Gilroy',sans-serif] font-medium leading-[20px] text-[16px] text-white placeholder:text-[#6c779d] caret-white"
                  data-testid="input-max-auto-approve"
                />
              </div>
              <div className="bg-[#222737] border border-[rgba(108,119,157,0.2)] border-solid content-stretch flex items-center justify-center px-[8px] py-[3px] relative rounded-[22px] shrink-0">
                <p className="font-['Gilroy',sans-serif] font-semibold leading-[14px] not-italic relative shrink-0 text-[#6c779d] text-[12px] text-center whitespace-nowrap" data-testid="text-auto-approve-currency">
                  {currency}
                </p>
              </div>
            </div>
          </div>
          <div className="h-0 relative shrink-0 w-full">
            <div className="absolute inset-[-0.5px_0]">
              <img alt="" className="block max-w-none size-full" src={SUB["a77bbc50"]} />
            </div>
          </div>
          <div className="content-stretch flex gap-[16px] items-center relative shrink-0 w-full">
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["3fbb6f43"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 overflow-clip size-[24px] top-1/2">
                  <div className="absolute inset-[12.5%_12.5%_22.05%_12.5%]">
                    <div className="absolute inset-[-6.37%_-5.56%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["ca094367"]} />
                    </div>
                  </div>
                  <div className="absolute inset-[45.83%_34.64%_27.89%_41.67%]">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["40ac23aa"]} />
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start justify-center min-w-px relative">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] w-full">
                  Max Daily Agent Spend
                </p>
                <div className="content-stretch flex items-center relative shrink-0 w-full">
                  <p className="flex-[1_0_0] font-['Gilroy',sans-serif] font-medium leading-[16px] min-w-px not-italic relative text-[#6c779d] text-[14px]">
                    Aggregate cap across all agents per day
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-[#222737] border border-[#414965] border-solid content-stretch flex gap-[8px] items-center px-[8px] py-[10px] relative rounded-[8px] shrink-0 w-[160px]">
              <div className="content-stretch flex flex-[1_0_0] items-center min-w-px relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={maxDailySpend}
                  onChange={(e) => setMaxDailySpend(formatThousandsInput(e.target.value))}
                  placeholder="0"
                  className="bg-transparent border-none outline-none w-full font-['Gilroy',sans-serif] font-medium leading-[20px] text-[16px] text-white placeholder:text-[#6c779d] caret-white"
                  data-testid="input-max-daily-agent-spend"
                />
              </div>
              <div className="bg-[#222737] border border-[rgba(108,119,157,0.2)] border-solid content-stretch flex items-center justify-center px-[8px] py-[3px] relative rounded-[22px] shrink-0">
                <p className="font-['Gilroy',sans-serif] font-semibold leading-[14px] not-italic relative shrink-0 text-[#6c779d] text-[12px] text-center whitespace-nowrap" data-testid="text-daily-spend-currency">
                  {currency}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="content-stretch flex flex-col gap-[4px] items-start relative shrink-0 w-full">
        <div className="content-stretch flex flex-col h-[24px] items-start relative shrink-0 w-full">
          <p className="font-['Gilroy',sans-serif] font-semibold leading-[24px] not-italic relative shrink-0 text-[#414965] text-[16px] w-full">
            Confirmation Rules
          </p>
        </div>
        <div className="bg-[#0a0c10] content-stretch flex flex-col items-start overflow-clip p-[16px] relative rounded-[16px] shrink-0 w-full">
          <div className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full">
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["3fbb6f43"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
                  <div className="absolute inset-[12.5%]">
                    <div className="absolute inset-[-5.56%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["85459e15"]} />
                    </div>
                  </div>
                  <div className="absolute bottom-[18.75%] left-[37.5%] right-1/4 top-[81.25%]">
                    <div className="absolute inset-[-1.13px_-12.5%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["fbb05c5f"]} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  Manual Approval Required
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">
                    Ask me before every agent transaction
                  </p>
                </div>
              </div>
            </div>
            <Switch active className="h-[24px] relative rounded-[100px] shrink-0 w-[40px]" />
          </div>
        </div>
      </div>
      </div>
    );
  }
  