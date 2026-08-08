import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import closeIcon from "@assets/Close_1783293571882.png";
import { Button } from "@/components/ui/button";

/* ─── Security modals ───────────────────────────────────────
   LoginHistoryModal:  recent sign-in sessions + sign-out-others.
   ChangePinModal:     3-step (current, new, confirm) PIN flow.            */

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
    className="size-[32px] rounded-pill flex items-center justify-center hover-elevate"
    style={{ background: "#1d2132" }}
  >
    {children}
  </button>
);

const Header = ({ title, onClose, onBack, testIdPrefix }: { title: string; onClose: () => void; onBack?: () => void; testIdPrefix: string }) => (
  <div className="relative h-[56px] flex items-center justify-center border-b border-brain-v1stroke-2">
    {onBack && (
      <div className="absolute left-[11px] top-1/2 -translate-y-1/2">
        <RoundIconButton label="Back" testId={`button-${testIdPrefix}-back`} onClick={onBack}><BackIcon /></RoundIconButton>
      </div>
    )}
    <Dialog.Title className="[font-family:'Gilroy',sans-serif] font-semibold text-[20px] leading-[24px] text-brain-v1baby-blue-100">
      {title}
    </Dialog.Title>
    <div className="absolute right-[11px] top-1/2 -translate-y-1/2">
      <RoundIconButton label="Close" testId={`button-${testIdPrefix}-close`} onClick={onClose}><CloseIcon /></RoundIconButton>
    </div>
  </div>
);

const PrimaryButton = ({ children, onClick, disabled, testId }: { children: ReactNode; onClick: () => void; disabled?: boolean; testId: string }) => (
  <Button
    variant="warning"
    size="large"
    onClick={onClick}
    disabled={disabled}
    data-testid={testId}
    className="w-full"
  >
    {children}
  </Button>
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
        className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-modal border border-brain-v1stroke-2 overflow-hidden focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
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

const SessionRow = ({ s, onSignOut }: { s: Session; onSignOut?: (id: string) => void }) => (
  <div
    data-testid={`row-session-${s.id}`}
    className="bg-brain-v1highlight-dropdown-bg flex items-center gap-[16px] p-[8px] rounded-[8px] w-full group"
  >
    <div className="flex flex-1 min-w-0 gap-[8px] items-center">
      <StatusDot active={s.current} />
      <div className="flex flex-col items-start justify-center w-[249px] shrink-0">
        <div className="flex gap-[4px] items-center">
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-brain-v1baby-blue-100 whitespace-nowrap">
            {s.device}
          </p>
          <Bullet />
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-brain-v1baby-blue-60 whitespace-nowrap">
            {s.browser}
          </p>
        </div>
        <div className="flex gap-[4px] items-center">
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-brain-v1baby-blue-60 whitespace-nowrap">
            {s.location}
          </p>
          <Bullet />
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-brain-v1baby-blue-60 whitespace-nowrap">
            {s.ip}
          </p>
        </div>
      </div>
    </div>
    <div className="flex flex-1 min-w-0 items-center justify-end gap-[8px]">
      <p
        className="[font-family:'Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-right whitespace-nowrap"
        style={{ color: s.current ? "#42bf23" : "#a8b9f4" }}
      >
        {s.when}
      </p>
      {!s.current && onSignOut && (
        <button
          type="button"
          data-testid={`button-signout-session-${s.id}`}
          aria-label={`Sign out ${s.device} session`}
          onClick={() => onSignOut(s.id)}
          className="size-[24px] shrink-0 rounded-full bg-brain-v1baby-blue-15 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-brain-v1dark-pink-red hover:text-brain-v1pink-red transition-all focus:outline-none"
          title="Sign out this session"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3.33 3.33L12.67 12.67M12.67 3.33L3.33 12.67" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-brain-v1baby-blue-60 group-hover:text-brain-v1pink-red" />
          </svg>
        </button>
      )}
    </div>
  </div>
);

export function LoginHistoryModal({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [sessions, setSessions] = useState<Session[]>(SESSIONS);

  useEffect(() => {
    if (open) setSessions(SESSIONS);
  }, [open]);

  const signOutOne = (id: string) => {
    setSessions((list) => list.filter((s) => s.id !== id));
  };

  const signOutAll = () => {
    setSessions((list) => list.filter((s) => s.current));
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          data-testid="modal-login-history"
          className="fixed left-1/2 top-1/2 z-50 w-[480px] -translate-x-1/2 -translate-y-1/2 bg-brain-v1baby-blue-5 border border-brain-v1stroke-2 rounded-modal overflow-clip focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <Dialog.Description className="sr-only">
            Devices and browsers that recently signed in to your Brain account.
          </Dialog.Description>

          {/* Title + Controls (Figma 4569:61429) */}
          <div className="relative h-[56px] w-full border-b border-brain-v1stroke-2 bg-[rgba(17,20,27,0.8)] backdrop-blur-[10px]">
            <Dialog.Title className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 [font-family:'Gilroy',sans-serif] font-semibold text-[20px] leading-[24px] text-brain-v1baby-blue-100 whitespace-nowrap">
              Login History
            </Dialog.Title>
            <Dialog.Close
              data-testid="button-close-login-history"
              aria-label="Close"
              className="absolute right-[11px] top-[11px] size-[32px] p-0 hover:opacity-90 transition-opacity focus:outline-none"
            >
              <CloseIcon />
            </Dialog.Close>
          </div>

          {/* Body - Figma 4569:61431 */}
          <div className="flex flex-col gap-[24px] items-start p-[24px] w-full">
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-brain-v1baby-blue-60 w-full">
              Devices and browsers that recently signed in to your Brain account.
            </p>

            {/* List container - Figma 4569:61474.
                Height hugs content; capped at 216px (3 rows) with internal
                scroll if more sessions ever exist. */}
            <div className="bg-brain-v1highlight-dropdown-bg max-h-[216px] overflow-y-auto rounded-panel w-[432px]">
              <div className="flex flex-col p-[8px] w-full">
                <div className="flex flex-col gap-[8px] w-full">
                  {sessions.length === 0 ? (
                    <p
                      data-testid="text-no-sessions"
                      className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-brain-v1baby-blue-60 text-center py-[16px]"
                    >
                      No other active sessions.
                    </p>
                  ) : (
                    sessions.map((s, i) => (
                      <div key={s.id} className="flex flex-col gap-[8px] w-full">
                        <SessionRow s={s} onSignOut={signOutOne} />
                        {i < sessions.length - 1 && (
                          <div className="h-px w-full bg-brain-v1stroke-2" />
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Sign Out button - Figma 4569:61467 */}
            <Button
              variant="destructive"
              className="w-full"
              data-testid="button-signout-others"
              onClick={signOutAll}
              disabled={!sessions.some((s) => !s.current)}
            >
              Sign Out of All Devices
            </Button>
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
            autoComplete="one time code"
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
            className="flex-1 min-w-0 h-[56px] text-center rounded-panel outline-none focus:ring-1 focus:ring-brain-v1purple transition-shadow"
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
          className="fixed left-1/2 top-1/2 z-50 w-[400px] -translate-x-1/2 -translate-y-1/2 bg-brain-v1highlight-dropdown-bg border border-brain-v1stroke-2 rounded-modal overflow-clip focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <Dialog.Description className="sr-only">Update your 6-digit transaction PIN.</Dialog.Description>

          {/* Title + Controls - Figma 4575:61705 */}
          <div className="relative h-[56px] w-full bg-brain-v1highlight-dropdown-bg border-b border-brain-v1stroke-2">
            <Dialog.Title className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 [font-family:'Gilroy',sans-serif] font-semibold text-[20px] leading-[24px] text-brain-v1baby-blue-100 whitespace-nowrap">
              Change Pin
            </Dialog.Title>
            <Dialog.Close
              data-testid="button-close-change-pin"
              aria-label="Close"
              className="absolute right-[11px] top-1/2 -translate-y-1/2 size-[32px] p-0 hover:opacity-90 transition-opacity focus:outline-none"
            >
              <CloseIcon />
            </Dialog.Close>
          </div>

          {/* Body - Figma 4575:61709 / 4575:61726.
              Figma frame is 400 × 336: header 56, body inset 39px sides, top
              39px (= 95−56), button gap 24px (= 247−95−body), bottom 41px. */}
          <div className="px-[39px] pt-[39px] pb-[41px] flex flex-col w-full">
            <div className="flex flex-col gap-[16px] w-[322px]">
              <p
                data-testid={`text-pin-sub-${step}`}
                className="[font-family:'Gilroy',sans-serif] font-medium text-[22px] leading-[28px] text-brain-v1baby-blue-30 w-full"
              >
                {copy.sub}
              </p>
              <PinInput
                value={value}
                onChange={setValue}
                testIdPrefix={`input-pin-${step}`}
              />
              {error && (
                <p data-testid="text-pin-error" className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-brain-v1pink-red w-full">
                  {error}
                </p>
              )}
            </div>

            <div className="mt-[24px] flex items-center w-[322px]">
              <Button
                variant="warning"
                size="large"
                className="flex-1 min-w-0"
                data-testid="button-change-pin-advance"
                disabled={!canAdvance}
                onClick={advance}
              >
                {copy.cta}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
