import { useEffect, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useAppAlert } from "@/components/AppAlert";
import { setUserEmail } from "@/lib/userContact";

/* ─── Email entry + Verify modals ──────────────────────────────────────
   Two-step flow mirroring PhoneNumberModal: enter email → enter 6-digit
   code → on success update the shared user-contact store.
   Demo code is "123456" — any other entry triggers an error alert.
   Visual style is intentionally identical to PhoneNumberModal
   (Figma 3734:40206 + 3734:40233 references, repurposed for email).   */

const VALID_CODE = "123456";

type Step = "enter" | "verify";

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
        <RoundIconButton label="Back" testId="button-email-back" onClick={onBack}><BackIcon /></RoundIconButton>
      </div>
    )}
    <Dialog.Title className="font-['Gilroy',sans-serif] font-semibold text-[20px] leading-[24px] text-[#a8b9f4]">
      {title}
    </Dialog.Title>
    <div className="absolute right-[11px] top-1/2 -translate-y-1/2">
      <RoundIconButton label="Close" testId="button-email-close" onClick={onClose}><CloseIcon /></RoundIconButton>
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailModal({ open, onOpenChange, currentEmail }: { open: boolean; onOpenChange: (o: boolean) => void; currentEmail: string }) {
  const alert = useAppAlert();
  const [step, setStep] = useState<Step>("enter");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState<string[]>(Array(6).fill(""));
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (open) {
      setStep("enter");
      setEmail("");
      setCode(Array(6).fill(""));
    }
  }, [open]);

  const trimmedEmail = email.trim();
  const canContinue = EMAIL_RE.test(trimmedEmail) && trimmedEmail.toLowerCase() !== currentEmail.toLowerCase();
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
      setUserEmail(trimmedEmail);
      onOpenChange(false);
      alert.success("Email address updated", `Your email address is now ${trimmedEmail}.`);
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
          data-testid="modal-email"
          className="fixed left-1/2 top-1/2 z-50 w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-[24px] border border-[#1d2132] overflow-hidden focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          style={{ background: "#0a0c10" }}
        >
          <Dialog.Description className="sr-only">
            {step === "enter" ? "Enter a new email address" : "Verify your email with the 6-digit code"}
          </Dialog.Description>

          {step === "enter" ? (
            <>
              <Header title="Email Address" onClose={() => onOpenChange(false)} />
              <div className="flex flex-col gap-4 p-[39px]">
                <div className="flex flex-col gap-1 w-full">
                  <FieldLabel>Email</FieldLabel>
                  <div className="flex items-center px-2 py-[10px] rounded-[8px]" style={{ background: "#222737" }}>
                    <input
                      data-testid="input-email-address"
                      type="email"
                      autoComplete="email"
                      placeholder="e.g. you@company.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="flex-1 min-w-0 bg-transparent outline-none font-['Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-white placeholder:text-[#6c779d]"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="pt-2">
                  <PrimaryButton
                    testId="button-email-verify-send"
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
              <Header title="Verify Email Address" onClose={() => onOpenChange(false)} onBack={() => setStep("enter")} />
              <div className="flex flex-col gap-4 p-[39px]">
                <p className="font-['Gilroy',sans-serif] font-medium text-[22px] leading-[28px] text-[#414965]">
                  Enter 6 digit code sent to {trimmedEmail}.
                </p>
                <div className="flex gap-2 w-full">
                  {code.map((c, i) => (
                    <input
                      key={i}
                      ref={el => { inputsRef.current[i] = el; }}
                      data-testid={`input-email-code-${i}`}
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
                <div className="flex gap-4 w-full pt-2">
                  <button
                    type="button"
                    data-testid="button-email-resend"
                    onClick={() => alert.info("Code resent", `A new 6-digit code is on its way to ${trimmedEmail}. It expires in 10 minutes.`)}
                    className="flex-1 min-w-0 rounded-full px-6 py-3 hover-elevate"
                    style={{ background: "#11141b", color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "18px", lineHeight: "24px" }}
                  >
                    Resend
                  </button>
                  <button
                    type="button"
                    data-testid="button-email-code-submit"
                    onClick={handleVerify}
                    disabled={!canVerify}
                    className="flex-1 min-w-0 rounded-full px-6 py-3 hover-elevate transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: "#123509", color: "#42bf23", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "18px", lineHeight: "24px" }}
                  >
                    Confirm
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
