import { SUB } from "@/assets/sub-icons";
import { Switch } from "./FigmaPrimitives";
import { useUserContact } from "@/lib/userContact";

  export default function NotificationsSection() {
    const { email, phone } = useUserContact();
    return (
      <div className="flex flex-col gap-6 w-full">
        <div className="content-stretch flex flex-col gap-[4px] items-start relative shrink-0 w-full">
        <div className="content-stretch flex flex-col h-[24px] items-start relative shrink-0 w-full">
          <p className="font-['Gilroy',sans-serif] font-semibold leading-[24px] not-italic relative shrink-0 text-[#414965] text-[16px] w-full">
            Alert Types
          </p>
        </div>
        <div className="bg-[#0a0c10] content-stretch flex flex-col gap-[16px] items-start overflow-clip p-[16px] relative rounded-[16px] shrink-0 w-full">
          <div className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full">
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["31db1a10"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 overflow-clip size-[24px] top-1/2">
                  <div className="absolute inset-[16.67%_5.77%_16.67%_5.81%]">
                    <div className="absolute inset-[-6.25%_-4.71%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["ac487561"]} />
                    </div>
                  </div>
                  <div className="absolute inset-[29.17%_41.67%]">
                    <div className="absolute inset-[-10%_-25%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["d727a284"]} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  Transaction Alerts
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">
                    Notify on every payment or transfer
                  </p>
                </div>
              </div>
            </div>
            <Switch active className="h-[24px] relative rounded-[100px] shrink-0 w-[40px]" />
          </div>
          <div className="h-0 relative shrink-0 w-full">
            <div className="absolute inset-[-0.5px_0]">
              <img alt="" className="block max-w-none size-full" src={SUB["4bb528f5"]} />
            </div>
          </div>
          <div className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full">
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["31db1a10"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
                  <div className="absolute inset-[12.5%]">
                    <div className="absolute inset-[-5.56%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["777bdc69"]} />
                    </div>
                  </div>
                  <div className="absolute inset-[62.48%_0.02%_4.18%_66.65%]">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["02710dae"]} />
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  Low Balance Alerts
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">
                    Warn me when balance falls below $100
                  </p>
                </div>
              </div>
            </div>
            <Switch active className="h-[24px] relative rounded-[100px] shrink-0 w-[40px]" />
          </div>
          <div className="h-0 relative shrink-0 w-full">
            <div className="absolute inset-[-0.5px_0]">
              <img alt="" className="block max-w-none size-full" src={SUB["4bb528f5"]} />
            </div>
          </div>
          <div className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full">
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["31db1a10"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 overflow-clip size-[24px] top-1/2">
                  <div className="absolute inset-[12.98%_16.67%_11.84%_16.67%]">
                    <div className="absolute inset-[-5.54%_-6.25%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["c014762b"]} />
                    </div>
                  </div>
                  <div className="absolute bottom-[52.08%] left-1/2 right-1/2 top-[35.42%]">
                    <div className="absolute inset-[-33.33%_-1px]">
                      <img alt="" className="block max-w-none size-full" src={SUB["e4877d09"]} />
                    </div>
                  </div>
                  <div className="absolute inset-[59.38%_48.96%_38.54%_48.96%]">
                    <div className="absolute inset-[-200%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["cfa1f100"]} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  Security Alerts
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">
                    Logins Policy changes, suspicious activity
                  </p>
                </div>
              </div>
            </div>
            <Switch active className="h-[24px] relative rounded-[100px] shrink-0 w-[40px]" />
          </div>
          <div className="h-0 relative shrink-0 w-full">
            <div className="absolute inset-[-0.5px_0]">
              <img alt="" className="block max-w-none size-full" src={SUB["4bb528f5"]} />
            </div>
          </div>
          <div className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full">
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["31db1a10"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 overflow-clip size-[24px] top-1/2">
                  <div className="absolute inset-[58.33%_0_4.17%_66.67%]">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["ddc17f72"]} />
                  </div>
                  <div className="absolute inset-[12.5%_12.5%_20.83%_8.33%]">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["d25eb17d"]} />
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  Agent Activity
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">
                    When Brain proposes actions
                  </p>
                </div>
              </div>
            </div>
            <Switch active className="h-[24px] relative rounded-[100px] shrink-0 w-[40px]" />
          </div>
          <div className="h-0 relative shrink-0 w-full">
            <div className="absolute inset-[-0.5px_0]">
              <img alt="" className="block max-w-none size-full" src={SUB["4bb528f5"]} />
            </div>
          </div>
          <div className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full">
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["31db1a10"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 overflow-clip size-[24px] top-1/2">
                  <div className="absolute inset-[33.33%_58.33%_37.5%_10.42%]">
                    <div className="absolute inset-[-14.29%_-13.33%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["b17d2492"]} />
                    </div>
                  </div>
                  <div className="absolute bottom-[41.67%] left-3/4 right-[10.42%] top-[37.5%]">
                    <div className="absolute inset-[-20%_-28.57%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["4a8178d8"]} />
                    </div>
                  </div>
                  <div className="absolute bottom-[21.7%] left-[41.67%] right-1/4 top-[17.53%]">
                    <div className="absolute inset-[-6.87%_-12.5%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["0eb0b0d0"]} />
                    </div>
                  </div>
                  <div className="absolute bottom-[12.5%] left-[33.33%] right-1/2 top-[62.5%]">
                    <div className="absolute inset-[-16.67%_-25%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["c191f0d0"]} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">Marketing and Updates</p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">
                    Product news and special offers
                  </p>
                </div>
              </div>
            </div>
            <Switch className="h-[24px] relative rounded-[12px] shrink-0 w-[40px]" />
          </div>
        </div>
      </div>
      <div className="content-stretch flex flex-col gap-[4px] items-start relative shrink-0 w-full">
        <div className="content-stretch flex flex-col h-[24px] items-start relative shrink-0 w-full">
          <p className="font-['Gilroy',sans-serif] font-semibold leading-[24px] not-italic relative shrink-0 text-[#414965] text-[16px] w-full">
            Channels
          </p>
        </div>
        <div className="bg-[#0a0c10] content-stretch flex flex-col gap-[16px] items-start overflow-clip p-[16px] relative rounded-[16px] shrink-0 w-full">
          <div className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full">
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["31db1a10"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 overflow-clip size-[24px] top-1/2">
                  <div className="absolute inset-[20.83%_12.5%]">
                    <div className="absolute inset-[-7.14%_-5.56%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["fae52bfc"]} />
                    </div>
                  </div>
                  <div className="absolute inset-[25.83%_14.58%_49.34%_14.58%]">
                    <div className="absolute inset-[-13.11%_-3.67%_-16.78%_-3.67%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["20e837aa"]} />
                    </div>
                  </div>
                  <div className="absolute inset-[54.17%_8.33%_8.33%_58.33%]">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["ddc17f72"]} />
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  Email
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap" data-testid="text-notification-email">
                    {email}
                  </p>
                </div>
              </div>
            </div>
            <Switch active className="h-[24px] relative rounded-[100px] shrink-0 w-[40px]" />
          </div>
          <div className="h-0 relative shrink-0 w-full">
            <div className="absolute inset-[-0.5px_0]">
              <img alt="" className="block max-w-none size-full" src={SUB["4bb528f5"]} />
            </div>
          </div>
          <div className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full">
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["31db1a10"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 overflow-clip size-[24px] top-1/2">
                  <div className="absolute inset-[12.5%_12.5%_16.67%_16.67%]">
                    <div className="absolute inset-[-5.88%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["757b2cad"]} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  Push Notifications
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">
                    In-app and mobile alerts
                  </p>
                </div>
              </div>
            </div>
            <Switch active className="h-[24px] relative rounded-[100px] shrink-0 w-[40px]" />
          </div>
          <div className="h-0 relative shrink-0 w-full">
            <div className="absolute inset-[-0.5px_0]">
              <img alt="" className="block max-w-none size-full" src={SUB["4bb528f5"]} />
            </div>
          </div>
          <div className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full">
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["31db1a10"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 overflow-clip size-[24px] top-1/2">
                  <div className="absolute inset-[16.67%_10.42%]">
                    <div className="absolute inset-[-6.25%_-5.26%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["89506a61"]} />
                    </div>
                  </div>
                  <div className="absolute inset-[46.35%_27.6%]">
                    <div className="absolute inset-[-21.43%_-3.49%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["8402c939"]} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  SMS
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap" data-testid="text-notification-phone">
                    {phone}
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
  