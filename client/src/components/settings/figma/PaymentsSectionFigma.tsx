import { SUB } from "@/assets/sub-icons";
import { Switch, Icons } from "./FigmaPrimitives";

  export default function PaymentsSectionFigma() {
    return (
      <div className="flex flex-col gap-6 w-full">
        <div className="content-stretch flex flex-col gap-[4px] items-start relative shrink-0 w-full">
        <div className="content-stretch flex flex-col h-[24px] items-start relative shrink-0 w-full">
          <p className="font-['Gilroy',sans-serif] font-semibold leading-[24px] not-italic relative shrink-0 text-[#414965] text-[16px] w-full">{`Currency & Display`}</p>
        </div>
        <div className="bg-[#0a0c10] content-stretch flex flex-col items-start overflow-clip p-[16px] relative rounded-[16px] shrink-0 w-full">
          <div className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full">
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["7b2583c9"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
                  <div className="absolute inset-[12.5%]">
                    <div className="absolute inset-[-5.56%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["10a844eb"]} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  Default Currency
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">
                    Used for balance display
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-[#222737] content-stretch flex gap-[8px] items-center p-[8px] relative rounded-[8px] shrink-0 w-[120px]">
              <div className="content-stretch flex flex-[1_0_0] items-center min-w-px relative">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[16px] text-white whitespace-nowrap">
                  USD
                </p>
              </div>
              <Icons className="relative shrink-0 size-[24px]" icon="Chevron Down" />
            </div>
          </div>
        </div>
      </div>
      <div className="content-stretch flex flex-col gap-[4px] items-start relative shrink-0 w-full">
        <div className="content-stretch flex flex-col h-[24px] items-start relative shrink-0 w-full">
          <p className="font-['Gilroy',sans-serif] font-semibold leading-[24px] not-italic relative shrink-0 text-[#414965] text-[16px] w-full">
            Spending Limits
          </p>
        </div>
        <div className="bg-[#0a0c10] content-stretch flex flex-col gap-[16px] items-start overflow-clip p-[16px] relative rounded-[16px] shrink-0 w-full">
          <div className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full">
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["7b2583c9"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 overflow-clip size-[24px] top-1/2">
                  <div className="absolute inset-[12.5%_12.5%_22.05%_12.5%]">
                    <div className="absolute inset-[-6.37%_-5.56%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["aa7e5f9d"]} />
                    </div>
                  </div>
                  <div className="absolute inset-[45.83%_34.64%_27.89%_41.67%]">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["cb61e807"]} />
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  Daily Spend Limit
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">
                    Maximum per calendar day
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-[#222737] border border-[#414965] border-solid content-stretch flex gap-[8px] items-center px-[8px] py-[10px] relative rounded-[8px] shrink-0 w-[160px]">
              <div className="content-stretch flex flex-[1_0_0] gap-[2px] items-center min-w-px relative">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[16px] text-white whitespace-nowrap">
                  10,000
                </p>
                <div className="h-[16px] relative shrink-0 w-0">
                  <div className="absolute inset-[-4.69%_-0.75px]">
                    <img alt="" className="block max-w-none size-full" src={SUB["261bc0c2"]} />
                  </div>
                </div>
              </div>
              <div className="bg-[#222737] border border-[rgba(108,119,157,0.2)] border-solid content-stretch flex items-center justify-center px-[8px] py-[3px] relative rounded-[22px] shrink-0">
                <p className="font-['Gilroy',sans-serif] font-semibold leading-[14px] not-italic relative shrink-0 text-[#6c779d] text-[12px] text-center whitespace-nowrap">
                  USD
                </p>
              </div>
            </div>
          </div>
          <div className="h-0 relative shrink-0 w-full">
            <div className="absolute inset-[-0.5px_0]">
              <img alt="" className="block max-w-none size-full" src={SUB["3afa2a55"]} />
            </div>
          </div>
          <div className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full">
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["7b2583c9"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
                  <div className="absolute inset-[20.83%_8.33%]">
                    <div className="absolute inset-[-7.14%_-5%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["c0819c46"]} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  Single Transaction Limit
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">
                    Maximum per transaction
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-[#222737] content-stretch flex gap-[8px] items-center px-[8px] py-[10px] relative rounded-[8px] shrink-0 w-[160px]">
              <div className="content-stretch flex flex-[1_0_0] gap-[2px] items-center min-w-px relative">
                <div className="h-[16px] relative shrink-0 w-0">
                  <div className="absolute inset-[-4.69%_-0.75px]">
                    <img alt="" className="block max-w-none size-full" src={SUB["261bc0c2"]} />
                  </div>
                </div>
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#6c779d] text-[16px] whitespace-nowrap">
                  e.g. 1000
                </p>
              </div>
              <div className="bg-[#222737] border border-[rgba(108,119,157,0.2)] border-solid content-stretch flex items-center justify-center px-[8px] py-[3px] relative rounded-[22px] shrink-0">
                <p className="font-['Gilroy',sans-serif] font-semibold leading-[14px] not-italic relative shrink-0 text-[#6c779d] text-[12px] text-center whitespace-nowrap">
                  USD
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="content-stretch flex flex-col gap-[4px] items-start relative shrink-0 w-full">
        <div className="content-stretch flex flex-col h-[24px] items-start relative shrink-0 w-full">
          <p className="font-['Gilroy',sans-serif] font-semibold leading-[24px] not-italic relative shrink-0 text-[#414965] text-[16px] w-full">
            Savings
          </p>
        </div>
        <div className="bg-[#0a0c10] content-stretch flex flex-col gap-[16px] items-start overflow-clip p-[16px] relative rounded-[16px] shrink-0 w-full">
          <div className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full">
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["7b2583c9"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 overflow-clip size-[24px] top-1/2">
                  <div className="absolute inset-[39.58%_37.5%_37.5%_35.42%]">
                    <div className="absolute inset-[-18.18%_-15.39%_-18.18%_-15.38%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["26f2a029"]} />
                    </div>
                  </div>
                  <div className="absolute inset-[8.33%]">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["0ea5e5b7"]} />
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  Auto-Save
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">
                    Automatically save a % of each deposit
                  </p>
                </div>
              </div>
            </div>
            <Switch active className="h-[24px] relative rounded-[100px] shrink-0 w-[40px]" />
          </div>
          <div className="h-0 relative shrink-0 w-full">
            <div className="absolute inset-[-0.5px_0]">
              <img alt="" className="block max-w-none size-full" src={SUB["3afa2a55"]} />
            </div>
          </div>
          <div className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full">
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["7b2583c9"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 overflow-clip size-[24px] top-1/2">
                  <div className="absolute inset-[12.5%]">
                    <div className="absolute inset-[-5.56%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["b068e078"]} />
                    </div>
                  </div>
                  <div className="absolute inset-[33.85%_58.85%_58.85%_33.85%]">
                    <div className="absolute inset-[-21.43%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["367f3ec3"]} />
                    </div>
                  </div>
                  <div className="absolute inset-[58.85%_33.85%_33.85%_58.85%]">
                    <div className="absolute inset-[-21.43%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["edf9e42d"]} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  Save Rate
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">
                    Percentage of each inbound transfer
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-[#222737] content-stretch flex gap-[8px] items-center px-[8px] py-[10px] relative rounded-[8px] shrink-0 w-[120px]">
              <div className="content-stretch flex flex-[1_0_0] gap-[2px] items-center min-w-px relative">
                <div className="h-[16px] relative shrink-0 w-0">
                  <div className="absolute inset-[-4.69%_-0.75px]">
                    <img alt="" className="block max-w-none size-full" src={SUB["261bc0c2"]} />
                  </div>
                </div>
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#6c779d] text-[16px] whitespace-nowrap">
                  e.g. 10
                </p>
              </div>
              <div className="bg-[#222737] border border-[rgba(108,119,157,0.2)] border-solid content-stretch flex items-center justify-center px-[8px] py-[3px] relative rounded-[22px] shrink-0">
                <p className="font-['Gilroy',sans-serif] font-semibold leading-[14px] not-italic relative shrink-0 text-[#6c779d] text-[12px] text-center whitespace-nowrap">
                  %
                </p>
              </div>
            </div>
          </div>
          <div className="h-0 relative shrink-0 w-full">
            <div className="absolute inset-[-0.5px_0]">
              <img alt="" className="block max-w-none size-full" src={SUB["3afa2a55"]} />
            </div>
          </div>
          <div className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full">
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["7b2583c9"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
                  <div className="absolute inset-[16.67%_12.5%]">
                    <div className="absolute inset-[-6.25%_-5.56%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["337dea36"]} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  Round-Up Investments
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">
                    Round up spend to nearest dollar, invest the change
                  </p>
                </div>
              </div>
            </div>
            <Switch className="h-[24px] relative rounded-[12px] shrink-0 w-[40px]" />
          </div>
        </div>
      </div>
      </div>
    );
  }
  