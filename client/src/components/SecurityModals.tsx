import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";

/* ─── Security modals ───────────────────────────────────────
   - LoginHistoryModal:  recent sign-in sessions + sign-out-others.
   - ChangePinModal:     3-step (current → new → confirm) PIN flow.            */

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M11.667 4.333 4.333 11.667M4.333 4.333l7.334 7.334" stroke="#a8b9f4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
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

const ShellRoot = ({ open, onOpenChange, testId, description, width = 400, children }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  testId: string;
  description: string;
  width?: number;
  children: ReactNode;
}) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <Dialog.Content
        data-testid={`modal-${testId}`}
        style={{ background: "#0a0c10", width }}
        className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-[24px] border border-[#1d2132] overflow-hidden focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
      >
        <Dialog.Description className="sr-only">{description}</Dialog.Description>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);

/* ─── Login History ─────────────────────────────────────── */

type Session = {
  id: string;
  device: string;
  browser: string;
  location: string;
  ip: string;
  when: string;
  current?: boolean;
};

const SESSIONS: Session[] = [
  { id: "s1", device: "MacBook Pro",      browser: "Chrome 124",  location: "San Francisco, CA, US", ip: "172.58.12.4",   when: "Active now",         current: true },
  { id: "s2", device: "iPhone 15 Pro",    browser: "Brain iOS",   location: "San Francisco, CA, US", ip: "76.103.220.18", when: "2 hours ago" },
  { id: "s3", device: "Windows 11",       browser: "Edge 124",    location: "New York, NY, US",      ip: "207.97.227.239", when: "Yesterday, 8:42 PM" },
  { id: "s4", device: "iPad Air",         browser: "Safari 17",   location: "Lisbon, PT",            ip: "85.247.21.91",   when: "May 21, 11:04 AM" },
  { id: "s5", device: "MacBook Pro",      browser: "Chrome 124",  location: "Berlin, DE",            ip: "82.151.62.34",   when: "May 18, 9:17 AM" },
];

const DeviceDot = ({ current }: { current?: boolean }) => (
  <div className="size-[8px] rounded-full flex-shrink-0" style={{ background: current ? "#42bf23" : "#414965" }} />
);

export function LoginHistoryModal({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <ShellRoot open={open} onOpenChange={onOpenChange} testId="login-history" description="Review devices currently signed in to your account." width={440}>
      <Header title="Login History" onClose={() => onOpenChange(false)} testIdPrefix="login-history" />
      <div className="flex flex-col gap-3 p-[24px]">
        <p className="font-['Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-[#6c779d]">
          Devices and browsers that recently signed in to your Brain account.
        </p>
        <div className="flex flex-col rounded-[12px] overflow-hidden" style={{ background: "#11141b", border: "1px solid #1d2132" }}>
          {SESSIONS.map((s, idx) => (
            <div
              key={s.id}
              data-testid={`row-session-${s.id}`}
              className="flex items-center gap-3 p-3"
              style={{ borderTop: idx === 0 ? "none" : "1px solid #1d2132" }}
            >
              <DeviceDot current={s.current} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p style={{ color: "#fff", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "14px", lineHeight: "18px" }}>
                    {s.device}
                  </p>
                  <span style={{ color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 500, fontSize: "12px", lineHeight: "16px" }}>
                    · {s.browser}
                  </span>
                  {s.current && (
                    <span
                      className="px-2 py-[1px] rounded-[10px]"
                      style={{ background: "#123509", color: "#42bf23", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "10px", lineHeight: "14px", border: "1px solid rgba(66,191,35,0.2)" }}
                    >
                      This device
                    </span>
                  )}
                </div>
                <p style={{ color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 500, fontSize: "12px", lineHeight: "16px", marginTop: 2 }}>
                  {s.location} · {s.ip}
                </p>
              </div>
              <p
                className="flex-shrink-0"
                style={{ color: s.current ? "#42bf23" : "#a8b9f4", fontFamily: "'Gilroy', sans-serif", fontWeight: 500, fontSize: "12px", lineHeight: "16px" }}
              >
                {s.when}
              </p>
            </div>
          ))}
        </div>
        <button
          type="button"
          data-testid="button-signout-others"
          onClick={() => onOpenChange(false)}
          className="w-full rounded-full px-6 py-3 hover-elevate"
          style={{ background: "#350011", color: "#d20344", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "14px", lineHeight: "20px" }}
        >
          Sign out all other sessions
        </button>
      </div>
    </ShellRoot>
  );
}

/* ─── Change PIN ────────────────────────────────────────── */

type PinStep = "current" | "new" | "confirm";

const PIN_LEN = 6;

function PinInput({ value, onChange, testIdPrefix }: { value: string; onChange: (v: string) => void; testIdPrefix: string }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const cells = useMemo(() => Array.from({ length: PIN_LEN }), []);

  useEffect(() => {
    refs.current[Math.min(value.length, PIN_LEN - 1)]?.focus();
  }, [value.length]);

  return (
    <div className="flex gap-2 justify-center w-full">
      {cells.map((_, i) => {
        const ch = value[i] ?? "";
        return (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={1}
            value={ch}
            data-testid={`${testIdPrefix}-${i}`}
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, "").slice(-1);
              if (!d) return;
              const next = (value.slice(0, i) + d + value.slice(i + 1)).slice(0, PIN_LEN);
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
              } else if (e.key === "ArrowRight" && i < PIN_LEN - 1) {
                refs.current[i + 1]?.focus();
              }
            }}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, PIN_LEN);
              if (pasted) { e.preventDefault(); onChange(pasted); }
            }}
            className="size-[48px] text-center rounded-[8px] outline-none focus:border-[#7631ee] transition-colors"
            style={{
              background: "#222737",
              border: "1px solid #1d2132",
              color: "#6c779d",
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 500,
              fontSize: "20px",
              lineHeight: "24px",
            }}
          />
        );
      })}
    </div>
  );
}

const STEP_COPY: Record<PinStep, { title: string; heading: string; sub: string; cta: string }> = {
  current: {
    title: "Change PIN",
    heading: "Enter Current PIN",
    sub: "Confirm your existing 6-digit transaction PIN to continue.",
    cta: "Continue",
  },
  new: {
    title: "Change PIN",
    heading: "Set a New PIN",
    sub: "Choose a new 6-digit PIN. Avoid obvious patterns like 123456.",
    cta: "Continue",
  },
  confirm: {
    title: "Change PIN",
    heading: "Confirm New PIN",
    sub: "Re-enter the new PIN to confirm.",
    cta: "Update PIN",
  },
};

export function ChangePinModal({
  open, onOpenChange, onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: () => void;
}) {
  const [step, setStep] = useState<PinStep>("current");
  const [current, setCurrent] = useState("");
  const [next, setNext]       = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep("current"); setCurrent(""); setNext(""); setConfirm(""); setError(null);
    }
  }, [open]);

  const copy = STEP_COPY[step];
  const value = step === "current" ? current : step === "new" ? next : confirm;
  const setValue = (v: string) => {
    setError(null);
    if (step === "current") setCurrent(v);
    else if (step === "new") setNext(v);
    else setConfirm(v);
  };

  const canAdvance = value.length === PIN_LEN;

  const advance = () => {
    if (!canAdvance) return;
    if (step === "current") {
      // Demo: any 6-digit value accepted as "current PIN".
      setStep("new");
    } else if (step === "new") {
      if (next === current) { setError("New PIN must differ from current PIN."); return; }
      if (/^(\d)\1{5}$/.test(next)) { setError("PIN cannot be a single repeated digit."); return; }
      setStep("confirm");
    } else {
      if (confirm !== next) { setError("PINs do not match. Try again."); return; }
      onConfirm();
    }
  };

  const back = () => {
    setError(null);
    if (step === "new") setStep("current");
    else if (step === "confirm") { setConfirm(""); setStep("new"); }
  };

  return (
    <ShellRoot open={open} onOpenChange={onOpenChange} testId="change-pin" description="Update your 6-digit transaction PIN.">
      <Header
        title={copy.title}
        onClose={() => onOpenChange(false)}
        onBack={step !== "current" ? back : undefined}
        testIdPrefix="change-pin"
      />
      <div className="flex flex-col gap-4 p-[39px]">
        <div className="flex flex-col gap-1 text-center">
          <p className="font-['Gilroy',sans-serif] font-semibold text-[18px] leading-[24px] text-white">{copy.heading}</p>
          <p className="font-['Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-[#6c779d]">{copy.sub}</p>
        </div>
        <PinInput
          value={value}
          onChange={setValue}
          testIdPrefix={`input-pin-${step}`}
        />
        {error && (
          <p data-testid="text-pin-error" className="font-['Gilroy',sans-serif] font-medium text-[13px] leading-[18px] text-[#d20344] text-center">
            {error}
          </p>
        )}
        <div className="pt-2">
          <PrimaryButton
            testId="button-change-pin-advance"
            disabled={!canAdvance}
            onClick={advance}
          >
            {copy.cta}
          </PrimaryButton>
        </div>
      </div>
    </ShellRoot>
  );
}
