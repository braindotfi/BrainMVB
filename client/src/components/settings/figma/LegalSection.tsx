import { SUB } from "@/assets/sub-icons";

const TERMS_URL = "https://docs.brain.fi/legal/terms-of-service";
const PRIVACY_URL = "https://docs.brain.fi/legal/privacy-policy";

const openExternal = (url: string) => {
  window.open(url, "_blank", "noopener,noreferrer");
};

  export default function LegalSection() {
    return (
      <div className="flex flex-col gap-6 w-full">
        <div className="content-stretch flex flex-col gap-[4px] items-start relative shrink-0 w-full">
        <div className="content-stretch flex flex-col h-[24px] items-start relative shrink-0 w-full">
          <p className="font-['Gilroy',sans-serif] font-semibold leading-[24px] not-italic relative shrink-0 text-[#414965] text-[16px] w-full">
            Account Activity
          </p>
        </div>
        <div className="bg-[#0a0c10] content-stretch flex flex-col gap-[16px] items-start overflow-clip p-[16px] relative rounded-[16px] shrink-0 w-full">
          <button
            type="button"
            onClick={() => openExternal(TERMS_URL)}
            data-testid="button-terms-of-service"
            aria-label="Open Terms of Service"
            className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#414965] rounded-[4px]"
          >
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["38b57d96"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
                  <div className="absolute inset-[12.5%_20.83%]">
                    <div className="absolute inset-[-5.56%_-7.14%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["8b6b169b"]} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  Terms of Service
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">
                    Last updated January 1, 2025
                  </p>
                </div>
              </div>
            </div>
            <div className="relative rounded-[100px] shrink-0 size-[40px]">
              <div className="absolute left-0 size-[40px] top-0">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["92cb11b2"]} />
              </div>
              <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
                <div className="absolute bottom-1/4 flex items-center justify-center left-[40.09%] right-[37.5%] top-1/4" style={{ containerType: "size" }}>
                  <div className="-rotate-90 -scale-x-100 flex-none h-[100cqw] w-[100cqh]">
                    <div className="relative size-full">
                      <div className="absolute inset-[-18.59%_-8.33%]">
                        <img alt="" className="block max-w-none size-full" src={SUB["8e7d89a7"]} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </button>
          <div className="h-0 relative shrink-0 w-full">
            <div className="absolute inset-[-0.5px_0]">
              <img alt="" className="block max-w-none size-full" src={SUB["10beff8b"]} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => openExternal(PRIVACY_URL)}
            data-testid="button-privacy-policy"
            aria-label="Open Privacy Policy"
            className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#414965] rounded-[4px]"
          >
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["38b57d96"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
                  <div className="absolute inset-[12.5%_12.5%_10.85%_20.83%]">
                    <div className="absolute inset-[-5.44%_-6.25%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["fe4a60f0"]} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  Privacy Policy
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">
                    How we handle your data
                  </p>
                </div>
              </div>
            </div>
            <div className="relative rounded-[100px] shrink-0 size-[40px]">
              <div className="absolute left-0 size-[40px] top-0">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["92cb11b2"]} />
              </div>
              <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
                <div className="absolute bottom-1/4 flex items-center justify-center left-[40.09%] right-[37.5%] top-1/4" style={{ containerType: "size" }}>
                  <div className="-rotate-90 -scale-x-100 flex-none h-[100cqw] w-[100cqh]">
                    <div className="relative size-full">
                      <div className="absolute inset-[-18.59%_-8.33%]">
                        <img alt="" className="block max-w-none size-full" src={SUB["8e7d89a7"]} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </button>
          <div className="h-0 relative shrink-0 w-full">
            <div className="absolute inset-[-0.5px_0]">
              <img alt="" className="block max-w-none size-full" src={SUB["10beff8b"]} />
            </div>
          </div>
          <div className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full">
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["38b57d96"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 overflow-clip size-[24px] top-1/2">
                  <div className="absolute inset-[12.5%]">
                    <div className="absolute inset-[-5.56%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["d4163ffc"]} />
                    </div>
                  </div>
                  <div className="absolute inset-[29.17%_58.33%_58.33%_29.17%]">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["87dc1a83"]} />
                  </div>
                  <div className="absolute inset-[41.67%_41.67%_45.83%_45.83%]">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["07efc589"]} />
                  </div>
                  <div className="absolute bottom-[37.5%] left-[66.67%] right-1/4 top-[54.17%]">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["dd07104b"]} />
                  </div>
                  <div className="absolute bottom-1/4 left-[41.67%] right-[45.83%] top-[62.5%]">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["07efc589"]} />
                  </div>
                  <div className="absolute bottom-[37.5%] left-1/4 right-[66.67%] top-[54.17%]">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["6994cd77"]} />
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  Cookie Policy
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">
                    Manage Cookie Perferences
                  </p>
                </div>
              </div>
            </div>
            <div className="relative rounded-[100px] shrink-0 size-[40px]">
              <div className="absolute left-0 size-[40px] top-0">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["92cb11b2"]} />
              </div>
              <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
                <div className="absolute bottom-1/4 flex items-center justify-center left-[40.09%] right-[37.5%] top-1/4" style={{ containerType: "size" }}>
                  <div className="-rotate-90 -scale-x-100 flex-none h-[100cqw] w-[100cqh]">
                    <div className="relative size-full">
                      <div className="absolute inset-[-18.59%_-8.33%]">
                        <img alt="" className="block max-w-none size-full" src={SUB["8e7d89a7"]} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    );
  }
  