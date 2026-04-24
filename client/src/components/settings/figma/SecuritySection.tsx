import { useEffect, useRef, useState } from "react";
import { SUB } from "@/assets/sub-icons";
import { Switch, Icons } from "./FigmaPrimitives";

const SESSION_TIMEOUT_OPTIONS = ["5 min", "15 min"] as const;

  export default function SecuritySection() {
    const [sessionTimeout, setSessionTimeout] = useState<string>("5 min");
    const [open, setOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!open) return;
      const handler = (e: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    return (
      <div className="flex flex-col gap-6 w-full">
        <div className="content-stretch flex flex-col gap-[4px] items-start relative shrink-0 w-full">
        <div className="content-stretch flex flex-col h-[24px] items-start relative shrink-0 w-full">
          <p className="font-['Gilroy',sans-serif] font-semibold leading-[24px] not-italic relative shrink-0 text-[#414965] text-[16px] w-full">
            Authentication
          </p>
        </div>
        <div className="bg-[#0a0c10] content-stretch flex flex-col gap-[16px] items-start p-[16px] relative rounded-[16px] shrink-0 w-full">
          <div className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full">
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["8075e445"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 overflow-clip size-[24px] top-1/2">
                  <div className="absolute inset-[8.33%_33.33%_8.33%_16.67%]">
                    <div className="absolute inset-[-5%_-8.33%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["af536317"]} />
                    </div>
                  </div>
                  <div className="absolute inset-[66.67%_20.85%_8.33%_45.81%]">
                    <div className="absolute inset-[-16.67%_-12.5%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["29f5f74b"]} />
                    </div>
                  </div>
                  <div className="absolute inset-[54.17%_29.19%_33.33%_54.14%]">
                    <div className="absolute inset-[-33.33%_-25%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["63b3cad2"]} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  Two-Factor Authentication
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">
                    Enabled via authentication app
                  </p>
                </div>
              </div>
            </div>
            <Switch active className="h-[24px] relative rounded-[100px] shrink-0 w-[40px]" />
          </div>
          <div className="h-0 relative shrink-0 w-full">
            <div className="absolute inset-[-0.5px_0]">
              <img alt="" className="block max-w-none size-full" src={SUB["e3fea1dc"]} />
            </div>
          </div>
          <div className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full">
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["8075e445"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 overflow-clip size-[24px] top-1/2">
                  <div className="absolute inset-[12.5%]">
                    <div className="absolute inset-[-5.56%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["63c37f2c"]} />
                    </div>
                  </div>
                  <div className="absolute bottom-3/4 left-[79.17%] right-[8.33%] top-[8.33%]">
                    <div className="absolute inset-[-25%_-33.33%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["42f96bb7"]} />
                    </div>
                  </div>
                  <div className="absolute bottom-[39.58%] left-1/2 right-[39.58%] top-[33.33%]">
                    <div className="absolute inset-[-15.38%_-40%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["57f89a4a"]} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  Session Timeout
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">
                    Auto-lock after inactivity
                  </p>
                </div>
              </div>
            </div>
            <div ref={dropdownRef} className="relative shrink-0 w-[120px]">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="bg-[#222737] content-stretch flex gap-[8px] items-center p-[8px] rounded-[8px] w-full text-left hover:bg-[#2a3045] transition-colors"
                data-testid="button-session-timeout"
              >
                <div className="content-stretch flex flex-[1_0_0] items-center min-w-px relative">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[16px] text-white whitespace-nowrap">
                    {sessionTimeout}
                  </p>
                </div>
                <Icons className="relative shrink-0 size-[24px]" icon="Chevron Down" />
              </button>
              {open && (
                <div className="absolute right-0 top-[calc(100%+4px)] z-50 bg-[#222737] border border-[#414965] rounded-[8px] overflow-hidden w-full shadow-lg">
                  {SESSION_TIMEOUT_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setSessionTimeout(opt);
                        setOpen(false);
                      }}
                      className={`w-full text-left px-[12px] py-[8px] font-['Gilroy',sans-serif] font-medium text-[16px] leading-[20px] hover:bg-[#2a3045] transition-colors ${
                        sessionTimeout === opt ? "text-white" : "text-[#a8b9f4]"
                      }`}
                      data-testid={`option-session-timeout-${opt.replace(/\s+/g, "-")}`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="content-stretch flex flex-col gap-[4px] items-start relative shrink-0 w-full">
        <div className="content-stretch flex flex-col h-[24px] items-start relative shrink-0 w-full">
          <p className="font-['Gilroy',sans-serif] font-semibold leading-[24px] not-italic relative shrink-0 text-[#414965] text-[16px] w-full">
            Account Activity
          </p>
        </div>
        <div className="bg-[#0a0c10] content-stretch flex flex-col gap-[16px] items-start overflow-clip p-[16px] relative rounded-[16px] shrink-0 w-full">
          <div className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full">
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["8075e445"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 overflow-clip size-[24px] top-1/2">
                  <div className="absolute inset-[20.83%_12.5%]">
                    <div className="absolute inset-[-7.14%_-5.56%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["42244355"]} />
                    </div>
                  </div>
                  <div className="absolute inset-[25.83%_14.58%_49.34%_14.58%]">
                    <div className="absolute inset-[-13.11%_-3.67%_-16.78%_-3.67%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["7cf8e582"]} />
                    </div>
                  </div>
                  <div className="absolute inset-[52.09%_2.09%_6.26%_56.26%]">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["ba6945be"]} />
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  Login Alerts
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">
                    Email me on new sign-ins
                  </p>
                </div>
              </div>
            </div>
            <Switch active className="h-[24px] relative rounded-[100px] shrink-0 w-[40px]" />
          </div>
          <div className="h-0 relative shrink-0 w-full">
            <div className="absolute inset-[-0.5px_0]">
              <img alt="" className="block max-w-none size-full" src={SUB["e3fea1dc"]} />
            </div>
          </div>
          <div className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full">
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["8075e445"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
                  <div className="absolute inset-[20.83%_70.83%_62.5%_12.5%]">
                    <div className="absolute inset-[-25%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["3d9549a8"]} />
                    </div>
                  </div>
                  <div className="absolute inset-[12.5%_12.5%_12.5%_14.63%]">
                    <div className="absolute inset-[-5.56%_-5.72%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["8ef16d08"]} />
                    </div>
                  </div>
                  <div className="absolute bottom-[37.5%] left-1/2 right-[37.5%] top-[33.33%]">
                    <div className="absolute inset-[-14.29%_-33.33%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["74c90841"]} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  Login History
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">
                    View recent sign-in activity
                  </p>
                </div>
              </div>
            </div>
            <div className="relative rounded-[100px] shrink-0 size-[40px]">
              <div className="absolute left-0 size-[40px] top-0">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["f9526a37"]} />
              </div>
              <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
                <div className="absolute bottom-1/4 flex items-center justify-center left-[40.09%] right-[37.5%] top-1/4" style={{ containerType: "size" }}>
                  <div className="-rotate-90 -scale-x-100 flex-none h-[100cqw] w-[100cqh]">
                    <div className="relative size-full">
                      <div className="absolute inset-[-18.59%_-8.33%]">
                        <img alt="" className="block max-w-none size-full" src={SUB["cacfcca5"]} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="h-0 relative shrink-0 w-full">
            <div className="absolute inset-[-0.5px_0]">
              <img alt="" className="block max-w-none size-full" src={SUB["e3fea1dc"]} />
            </div>
          </div>
          <div className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full">
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["8075e445"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
                  <div className="-translate-x-1/2 absolute bottom-[45.83%] left-1/2 top-1/2 w-px">
                    <div className="absolute inset-[-75%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["ee50e55c"]} />
                    </div>
                  </div>
                  <div className="absolute bottom-[45.83%] left-[29.17%] right-[66.67%] top-1/2">
                    <div className="absolute inset-[-75%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["f91c8e53"]} />
                    </div>
                  </div>
                  <div className="absolute bottom-[45.83%] left-[66.67%] right-[29.17%] top-1/2">
                    <div className="absolute inset-[-75%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["c3ec2ee7"]} />
                    </div>
                  </div>
                  <div className="absolute border-2 border-[#6c779d] border-solid h-[11px] left-[3px] rounded-[3px] top-[7px] w-[18px]" />
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  Change PIN
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">
                    Update your 6-digit transaction PIN
                  </p>
                </div>
              </div>
            </div>
            <div className="relative rounded-[100px] shrink-0 size-[40px]">
              <div className="absolute left-0 size-[40px] top-0">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["f9526a37"]} />
              </div>
              <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
                <div className="absolute bottom-1/4 flex items-center justify-center left-[40.09%] right-[37.5%] top-1/4" style={{ containerType: "size" }}>
                  <div className="-rotate-90 -scale-x-100 flex-none h-[100cqw] w-[100cqh]">
                    <div className="relative size-full">
                      <div className="absolute inset-[-18.59%_-8.33%]">
                        <img alt="" className="block max-w-none size-full" src={SUB["cacfcca5"]} />
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
  