import { useEffect, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import closeIcon from "@assets/Close_1783293571882.png";

/* ─── Billing-related modals ────────────────────────────────
   ChangePlanModal: pick a plan, confirm.
   UpdateCardModal: edit card number, expiry, CVC, name.
   CancelSubscriptionModal: logout-style confirm dialog. */

const CloseIcon = () => (
  <img src={closeIcon} alt="" className="size-[32px] rounded-full" />
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M3 7.5 6 10.5l5-7" stroke="#42bf23" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const RoundIconButton = ({ children, onClick, label, testId }: { children: ReactNode; onClick: () => void; label: string; testId: string }) => (
  <button
    type="button"
    aria-label={label}
    data-testid={testId}
    onClick={onClick}
    className="size-[32px] p-0 hover:opacity-90 transition-opacity"
  >
    {children}
  </button>
);

const Header = ({ title, onClose, testIdPrefix }: { title: string; onClose: () => void; testIdPrefix: string }) => (
  <div className="relative h-[56px] flex items-center justify-center border-b border-[#1d2132]">
    <Dialog.Title className="font-['Gilroy',sans-serif] font-semibold text-[20px] leading-[24px] text-[#a8b9f4]">
      {title}
    </Dialog.Title>
    <div className="absolute right-[11px] top-1/2 -translate-y-1/2">
      <RoundIconButton label="Close" testId={`button-${testIdPrefix}-close`} onClick={onClose}><CloseIcon /></RoundIconButton>
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

const ModalShell = ({ open, onOpenChange, title, testId, description, children }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  testId: string;
  description: string;
  children: ReactNode;
}) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <Dialog.Content
        data-testid={`modal-${testId}`}
        className="fixed left-1/2 top-1/2 z-50 w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-[24px] border border-[#1d2132] overflow-hidden focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        style={{ background: "#0a0c10" }}
      >
        <Dialog.Description className="sr-only">{description}</Dialog.Description>
        <Header title={title} onClose={() => onOpenChange(false)} testIdPrefix={testId} />
        <div className="flex flex-col gap-4 p-[39px]">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);

/* ─── Change Plan ──────────────────────────────────────── */

export type PlanId = "free" | "pro" | "business";

const PLANS: { id: PlanId; name: string; price: string; cadence: string; tagline: string }[] = [
  { id: "free",     name: "Free",     price: "$0",   cadence: "/mo", tagline: "Try Brain: 1 agent, $10k monthly cap." },
  { id: "pro",      name: "Pro",      price: "$24",  cadence: "/mo", tagline: "Unlimited agents, $5M monthly cap, priority support." },
  { id: "business", name: "Business", price: "$199", cadence: "/mo", tagline: "Dedicated infra, SLAs, custom policy signers." },
];

export function ChangePlanModal({
  open, onOpenChange, currentPlan, onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currentPlan: PlanId;
  onConfirm: (planId: PlanId) => void;
}) {
  const [selected, setSelected] = useState<PlanId>(currentPlan);
  useEffect(() => { if (open) setSelected(currentPlan); }, [open, currentPlan]);

  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      title="Change Plan"
      testId="change-plan"
      description="Choose the plan that fits your usage."
    >
      <div className="flex flex-col gap-2 w-full">
        {PLANS.map(plan => {
          const isSelected = selected === plan.id;
          const isCurrent  = currentPlan === plan.id;
          return (
            <button
              key={plan.id}
              type="button"
              data-testid={`option-plan-${plan.id}`}
              onClick={() => setSelected(plan.id)}
              className="flex items-start gap-3 p-3 rounded-[12px] text-left hover-elevate transition-colors"
              style={{
                background: "#222737",
                border: `1px solid ${isSelected ? "#7631ee" : "transparent"}`,
              }}
            >
              <div
                className="mt-[2px] size-[18px] rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  background: isSelected ? "#7631ee" : "transparent",
                  border: `1.5px solid ${isSelected ? "#7631ee" : "#414965"}`,
                }}
              >
                {isSelected && <span className="size-[6px] rounded-full bg-white"/>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <p style={{ color: "#fff", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "16px", lineHeight: "20px" }}>{plan.name}</p>
                  {isCurrent && (
                    <span
                      className="px-2 py-[1px] rounded-[10px]"
                      style={{ background: "#240757", color: "#a8b9f4", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "10px", lineHeight: "14px" }}
                    >
                      Current
                    </span>
                  )}
                </div>
                <p style={{ color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 500, fontSize: "13px", lineHeight: "18px", marginTop: 2 }}>
                  {plan.tagline}
                </p>
              </div>
              <p
                className="flex-shrink-0"
                style={{ color: "#fff", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "16px", lineHeight: "20px" }}
              >
                {plan.price}<span style={{ color: "#6c779d", fontWeight: 500, fontSize: "12px" }}>{plan.cadence}</span>
              </p>
            </button>
          );
        })}
      </div>
      <div className="pt-2">
        <PrimaryButton
          testId="button-change-plan-confirm"
          onClick={() => onConfirm(selected)}
          disabled={selected === currentPlan}
        >
          {selected === currentPlan ? "Already on this plan" : `Switch to ${PLANS.find(p => p.id === selected)?.name}`}
        </PrimaryButton>
      </div>
    </ModalShell>
  );
}

/* ─── Update Credit Card ───────────────────────────────── */

const formatCardNumber = (raw: string) =>
  raw.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");

const formatExpiry = (raw: string) => {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  if (d.length < 3) return d;
  return `${d.slice(0, 2)}/${d.slice(2)}`;
};

export function UpdateCardModal({
  open, onOpenChange, onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (last4: string) => void;
}) {
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc]       = useState("");
  const [name, setName]     = useState("");

  useEffect(() => {
    if (open) { setNumber(""); setExpiry(""); setCvc(""); setName(""); }
  }, [open]);

  const digits = number.replace(/\D/g, "");
  const expiryValid = /^\d{2}\/\d{2}$/.test(expiry) && Number(expiry.slice(0, 2)) >= 1 && Number(expiry.slice(0, 2)) <= 12;
  const canSave = digits.length >= 13 && digits.length <= 19 && expiryValid && cvc.length >= 3 && name.trim().length > 1;

  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      title="Update Card"
      testId="update-card"
      description="Update the payment card on file."
    >
      <div className="flex flex-col gap-1 w-full">
        <FieldLabel>Card Number</FieldLabel>
        <div className="flex items-center px-2 py-[10px] rounded-[8px]" style={{ background: "#222737" }}>
          <input
            data-testid="input-card-number"
            type="text"
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="1234 5678 9012 3456"
            value={number}
            onChange={e => setNumber(formatCardNumber(e.target.value))}
            className="flex-1 min-w-0 bg-transparent outline-none font-['JetBrains_Mono',monospace] font-medium text-[16px] leading-[20px] text-white placeholder:text-[#6c779d]"
            autoFocus
          />
        </div>
      </div>
      <div className="flex gap-3 w-full">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <FieldLabel>Expiry</FieldLabel>
          <div className="flex items-center px-2 py-[10px] rounded-[8px]" style={{ background: "#222737" }}>
            <input
              data-testid="input-card-expiry"
              type="text"
              inputMode="numeric"
              autoComplete="cc-exp"
              placeholder="MM/YY"
              value={expiry}
              onChange={e => setExpiry(formatExpiry(e.target.value))}
              className="flex-1 min-w-0 bg-transparent outline-none font-['JetBrains_Mono',monospace] font-medium text-[16px] leading-[20px] text-white placeholder:text-[#6c779d]"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <FieldLabel>CVC</FieldLabel>
          <div className="flex items-center px-2 py-[10px] rounded-[8px]" style={{ background: "#222737" }}>
            <input
              data-testid="input-card-cvc"
              type="text"
              inputMode="numeric"
              autoComplete="cc-csc"
              placeholder="123"
              value={cvc}
              onChange={e => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="flex-1 min-w-0 bg-transparent outline-none font-['JetBrains_Mono',monospace] font-medium text-[16px] leading-[20px] text-white placeholder:text-[#6c779d]"
            />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1 w-full">
        <FieldLabel>Name on Card</FieldLabel>
        <div className="flex items-center px-2 py-[10px] rounded-[8px]" style={{ background: "#222737" }}>
          <input
            data-testid="input-card-name"
            type="text"
            autoComplete="cc-name"
            placeholder="Full name"
            value={name}
            onChange={e => setName(e.target.value)}
            className="flex-1 min-w-0 bg-transparent outline-none font-['Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-white placeholder:text-[#6c779d]"
          />
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1" style={{ color: "#6c779d" }}>
        <CheckIcon />
        <p className="font-['Gilroy',sans-serif] font-medium text-[12px] leading-[16px]">
          Payments are processed securely. We never store your full card number.
        </p>
      </div>
      <div className="pt-2">
        <PrimaryButton
          testId="button-update-card-save"
          disabled={!canSave}
          onClick={() => onConfirm(digits.slice(-4))}
        >
          Save Card
        </PrimaryButton>
      </div>
    </ModalShell>
  );
}

/* ─── Cancel Subscription (Logout-style) ──────────────────
   Visual parity with LogoutConfirmModal in NavigationMenuSection. */

export function CancelSubscriptionModal({
  show, onCancel, onConfirm,
}: { show: boolean; onCancel: () => void; onConfirm: () => void }) {
  if (!show) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      data-testid="modal-cancel-subscription"
    >
      <div
        className="flex flex-col overflow-hidden rounded-[16px] w-[320px]"
        style={{
          background: "#11141b",
          border: "1px solid #1d2132",
          boxShadow:
            "0px 68px 27px 0px rgba(0,0,0,0.06), 0px 38px 23px 0px rgba(0,0,0,0.2), 0px 17px 17px 0px rgba(0,0,0,0.34), 0px 4px 9px 0px rgba(0,0,0,0.39)",
        }}
      >
        <div className="flex flex-col gap-[8px] items-center px-[8px] py-[24px] text-center w-full">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[20px] leading-[24px] w-full">
            Cancel Subscription
          </p>
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px] leading-[16px] w-full">
            Are you sure you want to cancel your subscription?
          </p>
        </div>
        <div className="flex gap-[8px] items-start p-[8px] w-full">
          <button
            data-testid="button-cancel-sub-dismiss"
            onClick={onCancel}
            className="flex flex-1 items-center justify-center px-[12px] py-[8px] rounded-[100px] hover:opacity-80 transition-opacity"
            style={{ background: "#222737" }}
          >
            <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[12px] leading-[16px] whitespace-nowrap">Cancel</span>
          </button>
          <button
            data-testid="button-cancel-sub-confirm"
            onClick={onConfirm}
            className="flex flex-1 items-center justify-center px-[12px] py-[8px] rounded-[100px] hover:opacity-80 transition-opacity"
            style={{ background: "#350011" }}
          >
            <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#d20344] text-[12px] leading-[16px] whitespace-nowrap">Confirm</span>
          </button>
        </div>
      </div>
    </div>
  );
}
