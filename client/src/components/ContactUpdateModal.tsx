import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import closeIcon from "@assets/Close_1783293571882.png";
import { useAppAlert } from "@/components/AppAlert";

/* ─── Contact Update Modal ──────────────────────────────────
   Two-step flow for email and phone number changes.
   Step 1 (enter):  input + "Verify" CTA
   Step 2 (verify):  6-digit code + "Resend" / "Confirm"
   No real SMS/email gateway — code is client-generated for UX.
   Figma refs:
     email-enter   5734:79360
     email-verify  5734:79454
     phone-enter   5734:79621
     phone-verify  5734:79714
   ─────────────────────────────────────────────────────────── */

const CloseIcon = () => (
  <img src={closeIcon} alt="" className="size-[32px] rounded-full" />
);

const BackIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M10 3 5 8l5 5" stroke="#a8b9f4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const RoundIconButton = ({ children, onClick, label, testId }: { children: ReactNode; onClick: () => void; label: string; testId: string }) => (
  <button
    type="button"
    aria-label={label}
    data-testid={testId}
    onClick={onClick}
    className="size-[32px] rounded-full flex items-center justify-center hover-elevate"
    style={{ background: "#1d2132" }}
  >
    {children}
  </button>
);

const Header = ({ title, onClose, onBack, testIdPrefix }: { title: string; onClose: () => void; onBack?: () => void; testIdPrefix: string }) => (
  <div className="relative h-[56px] flex items-center justify-center border-b border-[#1d2132]">
    {onBack && (
      <div className="absolute left-[11px] top-1/2 -translate-y-1/2">
        <RoundIconButton label="Back" testId={`button-${testIdPrefix}-back`} onClick={onBack}><BackIcon /></RoundIconButton>
      </div>
    )}
    <Dialog.Title className="font-['Gilroy',sans-serif] font-semibold text-[20px] leading-[24px] text-[#a8b9f4]">
      {title}
    </Dialog.Title>
    <div className="absolute right-[11px] top-1/2 -translate-y-1/2">
      <RoundIconButton label="Close" testId={`button-${testIdPrefix}-close`} onClick={onClose}><CloseIcon /></RoundIconButton>
    </div>
  </div>
);

/* ─── Re-usable 6-digit code input (visible digits, not dots) ─── */
const CODE_LEN = 6;

function CodeInput({ value, onChange, testIdPrefix }: { value: string; onChange: (v: string) => void; testIdPrefix: string }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const cells = useMemo(() => Array.from({ length: CODE_LEN }), []);

  useEffect(() => {
    refs.current[Math.min(value.length, CODE_LEN - 1)]?.focus();
  }, [value.length]);

  return (
    <div className="flex gap-[8px] items-start w-full">
      {cells.map((_, i) => {
        const ch = value[i] ?? "";
        return (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={1}
            value={ch}
            data-testid={`${testIdPrefix}-${i}`}
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, "").slice(-1);
              if (!d) return;
              const next = (value.slice(0, i) + d + value.slice(i + 1)).slice(0, CODE_LEN);
              onChange(next.length > value.length ? value + d : next);
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace") {
                if (value[i]) {
                  onChange(value.slice(0, i) + value.slice(i + 1));
                } else if (i > 0) {
                  onChange(value.slice(0, i - 1));
                }
              } else if (e.key === "ArrowLeft" && i > 0) {
                refs.current[i - 1]?.focus();
              } else if (e.key === "ArrowRight" && i < CODE_LEN - 1) {
                refs.current[i + 1]?.focus();
              }
            }}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LEN);
              if (pasted) { e.preventDefault(); onChange(pasted); }
            }}
            className="flex-1 min-w-0 h-[56px] text-center rounded-[16px] outline-none focus:ring-1 focus:ring-[#7631ee] transition-shadow"
            style={{
              background: "#222737",
              border: "none",
              color: ch ? "#fff" : "#6c779d",
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 500,
              fontSize: "20px",
              lineHeight: "24px",
              padding: "10px 16px",
            }}
          />
        );
      })}
    </div>
  );
}

/* ─── Country code row (phone step 1) ─── */
const COUNTRY_OPTIONS = [
  { code: "+1", flag: "🇺🇸", label: "United States" },
] as const;

function CountrySelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = COUNTRY_OPTIONS.find(c => c.code === value) ?? COUNTRY_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        data-testid="button-country-select"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-[8px] bg-[#222737] rounded-[8px] px-[8px] py-[10px] outline-none focus:ring-1 focus:ring-[#7631ee]"
      >
        <span className="text-[16px] leading-[20px]">{selected.flag}</span>
        <span className="font-['Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-[#fff]">
          {selected.code}
        </span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="ml-auto shrink-0">
          <path d="M4 6l4 4 4-4" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className="absolute z-10 mt-[4px] w-full bg-[#222737] rounded-[8px] border border-[#1d2132] overflow-hidden">
          {COUNTRY_OPTIONS.map(c => (
            <button
              key={c.code}
              type="button"
              onClick={() => { onChange(c.code); setOpen(false); }}
              className="w-full flex items-center gap-[8px] px-[8px] py-[10px] hover:bg-[#1d2132] transition-colors"
            >
              <span className="text-[16px]">{c.flag}</span>
              <span className="font-['Gilroy',sans-serif] font-medium text-[16px] text-[#a8b9f4]">{c.label}</span>
              <span className="font-['Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d] ml-auto">{c.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Text input (email / phone) ─── */
function TextInput({
  value, onChange, placeholder, testId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  testId: string;
}) {
  return (
    <input
      data-testid={testId}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-[#222737] rounded-[8px] px-[8px] py-[10px] outline-none focus:ring-1 focus:ring-[#7631ee]"
      style={{
        color: "#fff",
        fontFamily: "'Gilroy', sans-serif",
        fontWeight: 500,
        fontSize: "16px",
        lineHeight: "20px",
        border: "none",
      }}
    />
  );
}

/* ─── Public modal component ─── */

export type ContactType = "email" | "phone";

type Step = "enter" | "verify";

export function ContactUpdateModal({
  open,
  onOpenChange,
  type,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  type: ContactType;
  onComplete: (value: string) => void;
}) {
  const alert = useAppAlert();
  const [step, setStep] = useState<Step>("enter");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+1");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const expectedCodeRef = useRef<string>("");

  /* Reset on open */
  useEffect(() => {
    if (open) {
      setStep("enter");
      setEmail("");
      setPhone("");
      setCode("");
      setError(null);
      expectedCodeRef.current = "";
    }
  }, [open]);

  const isEmail = type === "email";
  const title = step === "enter"
    ? (isEmail ? "Update Email Address" : "Update Phone Number")
    : (isEmail ? "Verify Email Address" : "Verify Phone Number");
  const subtitle = step === "enter"
    ? (isEmail ? "Enter your new email address." : "Enter your new phone number.")
    : (isEmail ? "Enter 6 digit code sent to you via email." : "Enter 6 digit code sent to you via SMS.");

  const canVerify = isEmail
    ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    : phone.replace(/\D/g, "").length >= 7;

  const sendCode = () => {
    const generated = Math.floor(100000 + Math.random() * 900000).toString();
    expectedCodeRef.current = generated;
    setCode("");
    setError(null);
    const destination = isEmail ? email : `${countryCode} ${phone}`;
    alert.success("Verification code sent", `Enter ${generated} to verify ${destination}.`);
  };

  const advanceToVerify = () => {
    if (!canVerify) return;
    sendCode();
    setStep("verify");
  };

  const confirm = () => {
    if (code.length !== CODE_LEN) return;
    if (code !== expectedCodeRef.current) {
      setError("Invalid code. Please try again.");
      return;
    }
    const finalValue = isEmail ? email : `${countryCode} ${phone}`;
    onComplete(finalValue);
    onOpenChange(false);
  };

  const resend = () => {
    sendCode();
  };

  const goBack = () => {
    setStep("enter");
    setCode("");
    setError(null);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          data-testid={`modal-contact-update-${type}`}
          className="fixed left-1/2 top-1/2 z-50 w-[400px] -translate-x-1/2 -translate-y-1/2 bg-[#0a0c10] border border-[#1d2132] rounded-[24px] overflow-clip focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <Dialog.Description className="sr-only">
            {isEmail ? "Update your email address." : "Update your phone number."}
          </Dialog.Description>

          <Header
            title={title}
            onClose={() => onOpenChange(false)}
            onBack={step === "verify" ? goBack : undefined}
            testIdPrefix={`contact-update-${type}`}
          />

          <div className="px-[39px] pt-[39px] pb-[41px] flex flex-col w-full">
            <div className="flex flex-col gap-[16px] w-[322px]">
              <p
                data-testid={`text-contact-sub-${type}-${step}`}
                className="font-['Gilroy',sans-serif] font-medium text-[22px] leading-[28px] text-[#414965] w-full"
              >
                {subtitle}
              </p>

              {step === "enter" && (
                <div className="flex flex-col gap-[12px] w-full">
                  {isEmail ? (
                    <div className="flex flex-col gap-[4px]">
                      <p className="font-['Gilroy',sans-serif] font-semibold text-[14px] leading-[20px] text-[#6c779d]">
                        Email Address
                      </p>
                      <TextInput
                        value={email}
                        onChange={setEmail}
                        placeholder="e.g. john@gmail.com"
                        testId="input-contact-email"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-[4px]">
                        <p className="font-['Gilroy',sans-serif] font-semibold text-[14px] leading-[20px] text-[#6c779d]">
                          Country Code
                        </p>
                        <CountrySelector value={countryCode} onChange={setCountryCode} />
                      </div>
                      <div className="flex flex-col gap-[4px]">
                        <p className="font-['Gilroy',sans-serif] font-semibold text-[14px] leading-[20px] text-[#6c779d]">
                          Phone#
                        </p>
                        <TextInput
                          value={phone}
                          onChange={setPhone}
                          placeholder="e.g. 230402042"
                          testId="input-contact-phone"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {step === "verify" && (
                <div className="flex flex-col gap-[16px] w-full">
                  <CodeInput
                    value={code}
                    onChange={(v) => { setCode(v); setError(null); }}
                    testIdPrefix={`input-verify-code-${type}`}
                  />
                  {error && (
                    <p data-testid="text-verify-error" className="font-['Gilroy',sans-serif] font-medium text-[13px] leading-[18px] text-[#d20344] w-full">
                      {error}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-[24px] flex items-center w-[322px]">
              {step === "enter" ? (
                <button
                  type="button"
                  data-testid={`button-contact-verify-${type}`}
                  disabled={!canVerify}
                  onClick={advanceToVerify}
                  className="flex-1 min-w-0 flex items-center justify-center bg-[#4a2300] rounded-[100px] px-[24px] py-[12px] disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                >
                  <span className="font-['Gilroy',sans-serif] font-semibold text-[18px] leading-[24px] text-[#ff9500] whitespace-nowrap">
                    Verify
                  </span>
                </button>
              ) : (
                <div className="flex gap-[8px] w-full">
                  <button
                    type="button"
                    data-testid={`button-verify-resend-${type}`}
                    onClick={resend}
                    className="flex-1 min-w-0 flex items-center justify-center bg-[#222737] rounded-[100px] px-[16px] py-[10px] hover:opacity-90 transition-opacity"
                  >
                    <span className="font-['Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-[#a8b9f4] whitespace-nowrap">
                      Resend
                    </span>
                  </button>
                  <button
                    type="button"
                    data-testid={`button-verify-confirm-${type}`}
                    disabled={code.length !== CODE_LEN}
                    onClick={confirm}
                    className="flex-1 min-w-0 flex items-center justify-center bg-[#42bf23] rounded-[100px] px-[16px] py-[10px] disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                  >
                    <span className="font-['Gilroy',sans-serif] font-semibold text-[16px] leading-[20px] text-[#fff] whitespace-nowrap">
                      Confirm
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
