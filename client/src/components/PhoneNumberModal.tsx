import { useEffect, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useAppAlert } from "@/components/AppAlert";
import { setUserPhone } from "@/lib/userContact";

/* ─── Phone Number entry + Verify modals (Figma 3734:40206 + 3734:40233) ───
   Two-step flow: enter phone → enter 6-digit code → on success update store.
   Demo code is "123456" — any other entry triggers an error alert.        */

const VALID_CODE = "123456";

type Step = "enter" | "verify";

const ChevronDown = ({ className = "size-[24px]" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M6 9l6 6 6-6" stroke="#a8b9f4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/* Close / Back glyphs sized + positioned to match Figma 3734:40234.
   Outer button is 32px circle, icon group is 16px inset at (8,8).
   Strokes are 1.5 × #a8b9f4, matching the Figma vector export. */
const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M11.667 4.333 4.333 11.667M4.333 4.333l7.334 7.334" stroke="#a8b9f4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const BackIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M10 3.333 5.333 8 10 12.667" stroke="#a8b9f4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/* Inline US flag (Figma 47:9447 uses a CDN flag PNG). Recreated as SVG
   to stay self-hosted: blue canton with stars omitted for visual density,
   13 alternating red/white stripes. */
const USFlag = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="rounded-full overflow-hidden">
    <defs><clipPath id="usflag-clip"><circle cx="12" cy="12" r="12"/></clipPath></defs>
    <g clipPath="url(#usflag-clip)">
      <rect width="24" height="24" fill="#fff"/>
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} y={i * (24 / 13) * 2 / 1} x="0" width="24" height={24 / 13} fill="#b22234" transform={`translate(0 ${i * (24 / 13) * 2})`} />
      ))}
      <rect x="0" y="0" width="11" height={(24 / 13) * 7} fill="#3c3b6e"/>
    </g>
  </svg>
);

const RoundIconButton = ({ children, onClick, label, testId }: { children: ReactNode; onClick: () => void; label: string; testId: string }) => (
  <button
    type="button"
    aria-label={label}
    data-testid={testId}
    onClick={onClick}
    className="size-[32px] rounded-full flex items-center justify-center transition-colors hover-elevate"
    style={{ background: "#1d2132" }}
  >
    {children}
  </button>
);

const Header = ({ title, onClose, onBack }: { title: string; onClose: () => void; onBack?: () => void }) => (
  <div className="relative h-[56px] flex items-center justify-center border-b border-[#1d2132]">
    {onBack && (
      <div className="absolute left-[11px] top-1/2 -translate-y-1/2">
        <RoundIconButton label="Back" testId="button-phone-back" onClick={onBack}><BackIcon /></RoundIconButton>
      </div>
    )}
    <Dialog.Title className="font-['Gilroy',sans-serif] font-semibold text-[20px] leading-[24px] text-[#a8b9f4]">
      {title}
    </Dialog.Title>
    <div className="absolute right-[11px] top-1/2 -translate-y-1/2">
      <RoundIconButton label="Close" testId="button-phone-close" onClick={onClose}><CloseIcon /></RoundIconButton>
    </div>
  </div>
);

const FieldLabel = ({ children }: { children: ReactNode }) => (
  <p className="font-['Gilroy',sans-serif] font-semibold text-[14px] leading-[20px] text-[#6c779d]">{children}</p>
);

const PrimaryButton = ({ children, onClick, disabled, testId }: { children: ReactNode; onClick: () => void; disabled?: boolean; testId: string }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    data-testid={testId}
    className="w-full rounded-full px-6 py-3 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover-elevate"
    style={{ background: "#4a2300", color: "#ff9500", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "18px", lineHeight: "24px" }}
  >
    {children}
  </button>
);

export function PhoneNumberModal({ open, onOpenChange, currentPhone }: { open: boolean; onOpenChange: (o: boolean) => void; currentPhone: string }) {
  const alert = useAppAlert();
  const [step, setStep] = useState<Step>("enter");
  const [countryCode] = useState("+1");
  const [number, setNumber] = useState("");
  const [code, setCode] = useState<string[]>(Array(6).fill(""));
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (open) {
      setStep("enter");
      setNumber("");
      setCode(Array(6).fill(""));
    }
  }, [open]);

  const fullPhone = `${countryCode} ${number.trim()}`;
  const canContinue = number.replace(/\D/g, "").length >= 7;
  const codeValue = code.join("");
  const canVerify = codeValue.length === 6;

  const handleCodeChange = (i: number, v: string) => {
    const digit = v.replace(/\D/g, "").slice(-1);
    setCode(prev => {
      const next = [...prev];
      next[i] = digit;
      return next;
    });
    if (digit && i < 5) inputsRef.current[i + 1]?.focus();
  };

  const handleCodeKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[i] && i > 0) {
      inputsRef.current[i - 1]?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text.length) {
      e.preventDefault();
      const next = Array(6).fill("");
      for (let i = 0; i < text.length; i++) next[i] = text[i];
      setCode(next);
      inputsRef.current[Math.min(text.length, 5)]?.focus();
    }
  };

  const handleVerify = () => {
    if (codeValue === VALID_CODE) {
      setUserPhone(fullPhone);
      onOpenChange(false);
      alert.success("Phone number updated", `Your phone number is now ${fullPhone}.`);
    } else {
      alert.error("Incorrect code", "The code you entered doesn't match. Please try again.");
      setCode(Array(6).fill(""));
      inputsRef.current[0]?.focus();
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          data-testid="modal-phone-number"
          className="fixed left-1/2 top-1/2 z-50 w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-[24px] border border-[#1d2132] overflow-hidden focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          style={{ background: "#0a0c10" }}
        >
          <Dialog.Description className="sr-only">
            {step === "enter" ? "Enter a new phone number" : "Verify your phone number with the SMS code"}
          </Dialog.Description>

          {step === "enter" ? (
            <>
              <Header title="Update Phone Number" onClose={() => onOpenChange(false)} />
              <div className="flex flex-col gap-4 p-[39px]" style={{ paddingTop: 39, paddingBottom: 39 }}>
                <div className="flex flex-col gap-1 w-full">
                  <FieldLabel>Country Code</FieldLabel>
                  <div className="flex items-center gap-2 p-2 rounded-[8px]" style={{ background: "#222737" }}>
                    <USFlag />
                    <p className="flex-1 font-['Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-white">+1</p>
                    <ChevronDown />
                  </div>
                </div>
                <div className="flex flex-col gap-1 w-full">
                  <FieldLabel>Phone#</FieldLabel>
                  <div className="flex items-center px-2 py-[10px] rounded-[8px]" style={{ background: "#222737" }}>
                    <input
                      data-testid="input-phone-number"
                      type="tel"
                      inputMode="numeric"
                      placeholder="e.g. 230402042"
                      value={number}
                      onChange={e => setNumber(e.target.value.replace(/[^\d\s\-()]/g, ""))}
                      className="flex-1 bg-transparent outline-none font-['Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-white placeholder:text-[#6c779d]"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="pt-2">
                  <PrimaryButton
                    testId="button-phone-verify-send"
                    onClick={() => setStep("verify")}
                    disabled={!canContinue}
                  >
                    Verify
                  </PrimaryButton>
                </div>
              </div>
            </>
          ) : (
            <>
              <Header title="Verify Phone Number" onClose={() => onOpenChange(false)} onBack={() => setStep("enter")} />
              <div className="flex flex-col gap-4 p-[39px]">
                <p className="font-['Gilroy',sans-serif] font-medium text-[22px] leading-[28px] text-[#414965]">
                  Enter 6 digit code sent to you via SMS.
                </p>
                {/* Code input cells — Figma 3734:40248 */}
                <div className="flex gap-2 w-full">
                  {code.map((c, i) => (
                    <input
                      key={i}
                      ref={el => { inputsRef.current[i] = el; }}
                      data-testid={`input-phone-code-${i}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={c}
                      onChange={e => handleCodeChange(i, e.target.value)}
                      onKeyDown={e => handleCodeKey(i, e)}
                      onPaste={handleCodePaste}
                      className="flex-1 min-w-0 h-[56px] rounded-[16px] text-center bg-transparent outline-none font-['JetBrains_Mono',monospace] font-medium text-[20px] leading-[24px] text-[#6c779d] focus:text-white focus:ring-2 focus:ring-[#7631ee]"
                      style={{ background: "#222737" }}
                      autoFocus={i === 0}
                    />
                  ))}
                </div>
                {/* Action buttons — Figma 3734:40261 */}
                <div className="flex gap-4 w-full pt-2">
                  <button
                    type="button"
                    data-testid="button-phone-resend"
                    onClick={() => alert.info("Code resent", `A new 6-digit code is on its way to ${fullPhone}. It expires in 10 minutes.`)}
                    className="flex-1 min-w-0 rounded-full px-6 py-3 hover-elevate"
                    style={{ background: "#11141b", color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "18px", lineHeight: "24px" }}
                  >
                    Resend
                  </button>
                  <button
                    type="button"
                    data-testid="button-phone-code-submit"
                    onClick={handleVerify}
                    disabled={!canVerify}
                    className="flex-1 min-w-0 rounded-full px-6 py-3 hover-elevate transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: "#4a2300", color: "#ff9500", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "18px", lineHeight: "24px" }}
                  >
                    Continue
                  </button>
                </div>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
