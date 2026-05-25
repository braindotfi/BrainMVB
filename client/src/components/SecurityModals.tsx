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
/*  Pixel-perfect rebuild of Figma node 4569:61428.
    Outer 480px (432 list + 48 outer padding), header h-56 backdrop-blur,
    list bg #0a0c10 rounded-16, status dots (green / gray) per row,
    dark-red "Sign Out of All Devices" pill.                                  */

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
  { id: "s1", device: "Macbook Pro",   browser: "Chrome 124", location: "San Francisco, CA, US", ip: "172.58.12.4", when: "Active Now",         current: true },
  { id: "s2", device: "iPhone 15 Pro", browser: "Brain iOS",  location: "San Francisco, CA, US", ip: "172.58.12.4", when: "2 hours ago" },
  { id: "s3", device: "iPhone 15 Pro", browser: "Brain iOS",  location: "Lisbon, PT",            ip: "172.58.12.4", when: "Yesterday, 8:42 PM" },
];

const Bullet = () => (
  <span aria-hidden="true" className="size-[4px] rounded-full shrink-0" style={{ background: "#414965" }} />
);

const StatusDot = ({ active }: { active?: boolean }) => (
  // 24×32 wrapper with a centered 12-px colored circle (Figma laptop/phone slots).
  <div className="h-[32px] w-[24px] shrink-0 flex items-center justify-center">
    <span className="size-[12px] rounded-full" style={{ background: active ? "#42bf23" : "#6c779d" }} />
  </div>
);

const SessionRow = ({ s }: { s: Session }) => (
  <div
    data-testid={`row-session-${s.id}`}
    className="bg-[#0a0c10] flex items-center gap-[16px] p-[8px] rounded-[8px] w-full"
  >
    <div className="flex flex-1 min-w-0 gap-[8px] items-center">
      <StatusDot active={s.current} />
      <div className="flex flex-col items-start justify-center w-[249px] shrink-0">
        <div className="flex gap-[4px] items-center">
          <p className="font-['Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-[#a8b9f4] whitespace-nowrap">
            {s.device}
          </p>
          <Bullet />
          <p className="font-['Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-[#6c779d] whitespace-nowrap">
            {s.browser}
          </p>
        </div>
        <div className="flex gap-[4px] items-center">
          <p className="font-['Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-[#6c779d] whitespace-nowrap">
            {s.location}
          </p>
          <Bullet />
          <p className="font-['Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-[#6c779d] whitespace-nowrap">
            {s.ip}
          </p>
        </div>
      </div>
    </div>
    <p
      className="flex-1 min-w-0 font-['Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-right whitespace-nowrap"
      style={{ color: s.current ? "#42bf23" : "#a8b9f4" }}
    >
      {s.when}
    </p>
  </div>
);

export function LoginHistoryModal({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          data-testid="modal-login-history"
          className="fixed left-1/2 top-1/2 z-50 w-[480px] -translate-x-1/2 -translate-y-1/2 bg-[#11141b] border border-[#1d2132] rounded-[24px] overflow-clip focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <Dialog.Description className="sr-only">
            Devices and browsers that recently signed in to your Brain account.
          </Dialog.Description>

          {/* Title + Controls (Figma 4569:61429) */}
          <div className="relative h-[56px] w-full border border-[#1d2132] bg-[rgba(17,20,27,0.8)] backdrop-blur-[10px]">
            <Dialog.Title className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-['Gilroy',sans-serif] font-semibold text-[20px] leading-[24px] text-[#a8b9f4] whitespace-nowrap">
              Login History
            </Dialog.Title>
            <Dialog.Close
              data-testid="button-close-login-history"
              aria-label="Close"
              className="absolute right-[11px] top-[11px] size-[32px] rounded-full bg-[#222737] flex items-center justify-center hover:opacity-80 transition-opacity focus:outline-none"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3.33 3.33L12.67 12.67M12.67 3.33L3.33 12.67" stroke="#6C779D" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </Dialog.Close>
          </div>

          {/* Body — Figma 4569:61431 */}
          <div className="flex flex-col gap-[24px] items-start p-[24px] w-full">
            <p className="font-['Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-[#6c779d] w-full">
              Devices and browsers that recently signed in to your Brain account.
            </p>

            {/* List container — Figma 4569:61474 */}
            <div className="bg-[#0a0c10] h-[216px] overflow-clip rounded-[16px] w-[432px]">
              <div className="flex flex-col p-[8px] w-full">
                <div className="flex flex-col gap-[8px] w-full">
                  {SESSIONS.map((s, i) => (
                    <div key={s.id} className="flex flex-col gap-[8px] w-full">
                      <SessionRow s={s} />
                      {i < SESSIONS.length - 1 && (
                        <div className="h-px w-full bg-[#1d2132]" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sign Out button — Figma 4569:61467 */}
            <button
              type="button"
              data-testid="button-signout-others"
              onClick={() => onOpenChange(false)}
              className="flex flex-1 w-full items-center justify-center bg-[#350011] rounded-[100px] px-[20px] py-[10px] hover:opacity-80 transition-opacity"
            >
              <span className="font-['Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-[#d20344] whitespace-nowrap">
                Sign Out of All Devices
              </span>
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ─── Change PIN ────────────────────────────────────────── */

type PinStep = "current" | "new" | "confirm";

const PIN_LEN = 6;

/*  Pixel-perfect rebuild of Figma nodes 4575:61704 / 4577:61879 / 4577:61911.
    400-wide modal, solid #0a0c10 shell, 322-wide body inset 39px from sides,
    body top 95px, button top 247px, six h-56 PIN cells, dark-orange CTA pill.  */

function PinInput({ value, onChange, testIdPrefix }: { value: string; onChange: (v: string) => void; testIdPrefix: string }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const cells = useMemo(() => Array.from({ length: PIN_LEN }), []);

  useEffect(() => {
    refs.current[Math.min(value.length, PIN_LEN - 1)]?.focus();
  }, [value.length]);

  return (
    <div className="flex gap-[8px] items-start w-full">
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
            className="flex-1 min-w-0 h-[56px] text-center rounded-[16px] outline-none focus:ring-1 focus:ring-[#7631ee] transition-shadow"
            style={{
              background: "#222737",
              border: "none",
              color: "#6c779d",
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

const STEP_COPY: Record<PinStep, { sub: string; cta: string }> = {
  current: {
    sub: "Confirm your existing 6-digit PIN to continue.",
    cta: "Continue",
  },
  new: {
    sub: "Choose a new 6-digit PIN. Avoid patterns like 123456.",
    cta: "Continue",
  },
  confirm: {
    sub: "Re-enter your new PIN to confirm.",
    cta: "Confirm",
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

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          data-testid="modal-change-pin"
          className="fixed left-1/2 top-1/2 z-50 w-[400px] -translate-x-1/2 -translate-y-1/2 bg-[#0a0c10] border border-[#1d2132] rounded-[24px] overflow-clip focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <Dialog.Description className="sr-only">Update your 6-digit transaction PIN.</Dialog.Description>

          {/* Title + Controls — Figma 4575:61705 */}
          <div className="relative h-[56px] w-full bg-[#0a0c10] border border-[#1d2132]">
            <Dialog.Title className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-['Gilroy',sans-serif] font-semibold text-[20px] leading-[24px] text-[#a8b9f4] whitespace-nowrap">
              Change Pin
            </Dialog.Title>
            <Dialog.Close
              data-testid="button-close-change-pin"
              aria-label="Close"
              className="absolute right-[11px] top-1/2 -translate-y-1/2 size-[32px] rounded-full bg-[#222737] flex items-center justify-center hover:opacity-80 transition-opacity focus:outline-none"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3.33 3.33L12.67 12.67M12.67 3.33L3.33 12.67" stroke="#6C779D" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </Dialog.Close>
          </div>

          {/* Body group — Figma 4575:61709 (top 95, left 39, w 322) */}
          <div className="absolute left-[39px] top-[95px] w-[322px] flex flex-col gap-[16px] items-start">
            <p
              data-testid={`text-pin-sub-${step}`}
              className="font-['Gilroy',sans-serif] font-medium text-[22px] leading-[28px] text-[#414965] w-full"
            >
              {copy.sub}
            </p>
            <PinInput
              value={value}
              onChange={setValue}
              testIdPrefix={`input-pin-${step}`}
            />
            {error && (
              <p data-testid="text-pin-error" className="font-['Gilroy',sans-serif] font-medium text-[13px] leading-[18px] text-[#d20344] w-full">
                {error}
              </p>
            )}
          </div>

          {/* CTA — Figma 4575:61726 (top 247, left 39, w 322) */}
          <div className="absolute left-[39px] top-[247px] w-[322px] flex items-center">
            <button
              type="button"
              data-testid="button-change-pin-advance"
              disabled={!canAdvance}
              onClick={advance}
              className="flex-1 min-w-0 flex items-center justify-center bg-[#4a2300] rounded-[100px] px-[24px] py-[12px] disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              <span className="font-['Gilroy',sans-serif] font-semibold text-[18px] leading-[24px] text-[#ff9500] whitespace-nowrap">
                {copy.cta}
              </span>
            </button>
          </div>

          {/* Spacer so the absolutely-positioned content has room (top 247 + button ~48 + 41 padding ≈ 336). */}
          <div className="h-[336px]" />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
