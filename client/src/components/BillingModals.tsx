import { useEffect, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { SiVisa, SiMastercard, SiAmericanexpress, SiDiscover } from "react-icons/si";
import closeIcon from "@assets/Close_1783293571882.png";

/* ─── Billing-related modals (Figma: Change Plan 6107:17186,
   Add Card No Processor 6106:68345, Add Card Default 6112:69061) ───
   ChangePlanModal: pick a plan, confirm.
   UpdateCardModal: card form when a processor is connected; honest
   placeholder otherwise. Only the last 4 digits ever leave the modal.
   CancelSubscriptionModal: logout-style confirm dialog. */

const CloseIcon = () => (
  <img src={closeIcon} alt="" className="size-[32px] rounded-full" />
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
  <div className="relative h-[56px] flex items-center justify-center border-b border-brain-v1stroke-2 backdrop-blur-[10px]" style={{ background: "rgba(17,20,27,0.8)" }}>
    <Dialog.Title className="[font-family:'Gilroy',sans-serif] font-semibold text-[20px] leading-[24px] text-brain-v1baby-blue-100">
      {title}
    </Dialog.Title>
    <div className="absolute right-[11px] top-1/2 -translate-y-1/2">
      <RoundIconButton label="Close" testId={`button-${testIdPrefix}-close`} onClick={onClose}><CloseIcon /></RoundIconButton>
    </div>
  </div>
);

const ModalShell = ({ open, onOpenChange, title, testId, description, width = 400, children }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
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
        className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-modal border border-brain-v1stroke-2 overflow-hidden focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        style={{ background: "#11141b", width }}
      >
        <Dialog.Description className="sr-only">{description}</Dialog.Description>
        <Header title={title} onClose={() => onOpenChange(false)} testIdPrefix={testId} />
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);

/* ─── Change Plan ──────────────────────────────────────── */

export type { PlanId } from "@/lib/planStore";
import type { PlanId } from "@/lib/planStore";

const PLANS: { id: PlanId; name: string; price: string | null; features: string[]; recommended?: boolean }[] = [
  { id: "free",         name: "Free",         price: "$0",  features: ["Try Brain", "1 agent", "1 source"] },
  { id: "personal",     name: "Personal",     price: "$49", features: ["6 agents", "3 sources"] },
  { id: "professional", name: "Professional", price: "$99", features: ["Unlimited agents", "Unlimited sources"], recommended: true },
  { id: "business",     name: "Business",     price: null,  features: ["Dedicated infra", "SLAs", "Custom signers"] },
];

const PlanRadio = ({ active }: { active: boolean }) => (
  <div className="relative shrink-0 size-[20px]">
    <div
      className="absolute inset-0 rounded-full border"
      style={active
        ? { background: "#240757", borderColor: "rgba(118,49,238,0.2)" }
        : { background: "#06070a", borderColor: "#222737" }}
    />
    {active && <div className="absolute inset-[20%] rounded-full" style={{ background: "#7631ee" }} />}
  </div>
);

const StarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M7 1.2l1.72 3.49 3.85.56-2.79 2.72.66 3.83L7 10l-3.44 1.8.66-3.83-2.79-2.72 3.85-.56L7 1.2z" fill="#4a2300"/>
  </svg>
);

const Dot = ({ color }: { color: string }) => (
  <span className="size-[4px] rounded-full shrink-0" style={{ background: color }} />
);

export function ChangePlanModal({
  open, onOpenChange, currentPlan, onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currentPlan: PlanId | null;
  onConfirm: (planId: PlanId) => void;
}) {
  const [selected, setSelected] = useState<PlanId>(currentPlan ?? "free");
  useEffect(() => { if (open) setSelected(currentPlan ?? "free"); }, [open, currentPlan]);
  const selectedPlan = PLANS.find(p => p.id === selected);
  const isCurrent = selected === currentPlan;

  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      title="Change Plan"
      testId="change-plan"
      description="Choose the plan that fits your usage."
      width={480}
    >
      <div className="flex flex-col gap-[24px] p-[24px]">
        <div className="flex flex-col gap-[12px]">
          {PLANS.map(plan => {
            const isSelected = selected === plan.id;
            const accent = isSelected ? "#7631ee" : "#6c779d";
            const nameColor = isSelected ? "#ffffff" : "#a8b9f4";
            const priceColor = isSelected ? "#7631ee" : "#a8b9f4";
            return (
              <button
                key={plan.id}
                type="button"
                data-testid={`option-plan-${plan.id}`}
                onClick={() => setSelected(plan.id)}
                className="relative flex items-center gap-[12px] p-[16px] rounded-panel text-left w-full border transition-colors"
                style={isSelected
                  ? { background: "#12032d", borderColor: "#7631ee" }
                  : { background: "#0a0c10", borderColor: "#1d2132" }}
              >
                <PlanRadio active={isSelected} />
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[20px]" style={{ color: nameColor }}>
                    {plan.name}
                  </p>
                  <div className="flex gap-[4px] items-center flex-wrap">
                    {plan.features.map((f, i) => (
                      <span key={f} className="flex items-center gap-[4px]">
                        {i > 0 && <Dot color={accent} />}
                        <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] whitespace-nowrap" style={{ color: accent }}>
                          {f}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
                {plan.price !== null ? (
                  <div className="flex gap-[8px] items-center shrink-0">
                    <p className="font-['JetBrains_Mono',monospace] font-medium text-[26px] leading-[20px] text-right w-[80px]" style={{ color: priceColor }}>
                      {plan.price}
                    </p>
                    <p className="font-['JetBrains_Mono',monospace] font-medium text-[12px] leading-[16px] w-[26px] text-center" style={{ color: priceColor }}>
                      /mo
                    </p>
                  </div>
                ) : (
                  <p className="font-['JetBrains_Mono',monospace] font-medium text-[16px] leading-[20px] text-right shrink-0" style={{ color: priceColor }}>
                    Contact Us
                  </p>
                )}
                {plan.recommended && (
                  <span
                    className="absolute -top-[8px] right-[24px] flex gap-[2px] items-center justify-center px-[6px] py-[2px] rounded-pill border"
                    style={{
                      backgroundImage: "linear-gradient(110deg, rgb(255,171,55) 0%, rgb(255,148,0) 100%)",
                      borderColor: "rgba(74,35,0,0.4)",
                    }}
                  >
                    <StarIcon />
                    <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] text-brain-v1dark-orange">Recommended</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          data-testid="button-change-plan-confirm"
          onClick={() => onConfirm(selected)}
          disabled={isCurrent}
          className="w-full flex items-center justify-center px-[20px] py-[10px] rounded-full hover-elevate disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ background: "#4a2300" }}
        >
          <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[20px] text-brain-v1light-orange whitespace-nowrap">
            {isCurrent ? "Already On This Plan" : `Switch To ${selectedPlan?.name}`}
          </span>
        </button>
      </div>
    </ModalShell>
  );
}

/* ─── Add / Update Card ────────────────────────────────── */

const InfoCircleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 mt-[2px]">
    <circle cx="8" cy="8" r="6" stroke="#6c779d" strokeWidth="1.4"/>
    <path d="M8 7.4v3.4" stroke="#6c779d" strokeWidth="1.4" strokeLinecap="round"/>
    <circle cx="8" cy="5" r="0.9" fill="#6c779d"/>
  </svg>
);

const CheckCircleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 mt-[2px]">
    <circle cx="8" cy="8" r="6.3" stroke="#42bf23" strokeWidth="1.4"/>
    <path d="M5.3 8.2 7.1 10l3.6-4" stroke="#42bf23" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const CARD_BRANDS: { name: string; icon: ReactNode; bg: string }[] = [
  { name: "Visa",       icon: <SiVisa size={14} color="#1a1f71" />,       bg: "#ffffff" },
  { name: "Mastercard", icon: <SiMastercard size={13} color="#eb001b" />, bg: "#ffffff" },
  { name: "Maestro",    icon: (
    <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden="true">
      <circle cx="5" cy="5" r="4.5" fill="#0099df"/>
      <circle cx="9" cy="5" r="4.5" fill="#ed0006" fillOpacity="0.85"/>
    </svg>
  ), bg: "#ffffff" },
  { name: "Amex",       icon: <SiAmericanexpress size={12} color="#ffffff" />, bg: "#1f72cd" },
  { name: "Discover",   icon: <SiDiscover size={13} color="#ff6000" />,   bg: "#ffffff" },
];

const CardInput = ({ value, onChange, placeholder, testId, maxLength, inputMode }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  testId: string;
  maxLength?: number;
  inputMode?: "numeric";
}) => (
  <input
    type="text"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    maxLength={maxLength}
    inputMode={inputMode}
    data-testid={testId}
    autoComplete="off"
    className="w-full rounded-[8px] px-[8px] py-[10px] [font-family:'Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-brain-v1baby-blue-100 placeholder:text-brain-v1baby-blue-60 focus:outline-none focus:ring-1 focus:ring-brain-v1purple"
    style={{ background: "#222737" }}
  />
);

const InputLabel = ({ children }: { children: ReactNode }) => (
  <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[20px] text-brain-v1baby-blue-60 whitespace-nowrap">{children}</p>
);

export function UpdateCardModal({
  open, onOpenChange, onConfirm, processorConnected = true,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (last4: string) => void;
  processorConnected?: boolean;
}) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [mm, setMm] = useState("");
  const [yy, setYy] = useState("");
  const [cvv, setCvv] = useState("");
  useEffect(() => {
    if (open) { setName(""); setNumber(""); setMm(""); setYy(""); setCvv(""); }
  }, [open]);

  if (!processorConnected) {
    return (
      <ModalShell
        open={open}
        onOpenChange={onOpenChange}
        title="Update Card"
        testId="update-card"
        description="Update the payment card on file."
      >
        <div className="flex flex-col gap-[32px] p-[24px]">
          <div className="flex flex-col gap-[16px]">
            <div className="flex gap-[8px] items-center w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[20px] text-brain-v1baby-blue-60 whitespace-nowrap">Payment Method</p>
              <div className="flex-1 h-px bg-brain-v1stroke-2" />
            </div>
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-brain-v1baby-blue-100">
              Card updates are unavailable until a tokenized payment processor is connected.
            </p>
            <div className="flex gap-[8px] items-start p-[8px] rounded-row border border-brain-v1stroke-2">
              <InfoCircleIcon />
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-brain-v1baby-blue-60">
                Brain will not collect card numbers or security codes in this form.
              </p>
            </div>
          </div>
          <div className="flex gap-[8px] items-start">
            <CheckCircleIcon />
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-brain-v1baby-blue-100">
              Add Stripe Elements or another tokenizing widget before enabling card updates.
            </p>
          </div>
          <button
            type="button"
            data-testid="button-update-card-save"
            disabled
            className="w-full flex items-center justify-center px-[20px] py-[10px] rounded-full opacity-50 cursor-not-allowed"
            style={{ background: "#4a2300" }}
          >
            <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[20px] text-brain-v1light-orange whitespace-nowrap">Processor Required</span>
          </button>
        </div>
      </ModalShell>
    );
  }

  const digits = number.replace(/\D/g, "");
  const valid =
    name.trim().length > 0 &&
    digits.length >= 12 && digits.length <= 19 &&
    /^(0?[1-9]|1[0-2])$/.test(mm) &&
    /^\d{2}$/.test(yy) &&
    /^\d{3,4}$/.test(cvv);

  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      title="Payment Information"
      testId="update-card"
      description="Add a payment card. Only the last four digits are kept."
    >
      <div className="flex flex-col gap-[32px] p-[24px]">
        <div className="flex flex-col gap-[16px]">
          <div className="flex flex-col gap-[6px]">
            <InputLabel>Name on Card</InputLabel>
            <CardInput value={name} onChange={setName} placeholder="John Doe" testId="input-card-name" />
          </div>
          <div className="flex flex-col gap-[6px]">
            <div className="flex gap-[8px] items-center w-full">
              <p className="flex-1 [font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[20px] text-brain-v1baby-blue-60">Credit Card</p>
              <div className="flex gap-[8px] items-center shrink-0">
                {CARD_BRANDS.map(b => (
                  <span
                    key={b.name}
                    title={b.name}
                    className="h-[16px] w-[23px] rounded-[2.5px] border border-brain-v1white flex items-center justify-center overflow-hidden"
                    style={{ background: b.bg }}
                  >
                    {b.icon}
                  </span>
                ))}
              </div>
            </div>
            <CardInput value={number} onChange={(v) => setNumber(v.replace(/[^\d ]/g, ""))} placeholder="Card number..." testId="input-card-number" maxLength={23} inputMode="numeric" />
          </div>
          <div className="flex gap-[16px] items-start w-full">
            <div className="flex-1 min-w-0 flex flex-col gap-[6px]">
              <InputLabel>Expiration Date</InputLabel>
              <div className="flex gap-[8px]">
                <CardInput value={mm} onChange={(v) => setMm(v.replace(/\D/g, ""))} placeholder="MM" testId="input-card-mm" maxLength={2} inputMode="numeric" />
                <CardInput value={yy} onChange={(v) => setYy(v.replace(/\D/g, ""))} placeholder="YY" testId="input-card-yy" maxLength={2} inputMode="numeric" />
              </div>
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-[6px]">
              <InputLabel>Security Code</InputLabel>
              <CardInput value={cvv} onChange={(v) => setCvv(v.replace(/\D/g, ""))} placeholder="CVV" testId="input-card-cvv" maxLength={4} inputMode="numeric" />
            </div>
          </div>
        </div>
        <button
          type="button"
          data-testid="button-update-card-save"
          disabled={!valid}
          onClick={() => onConfirm(digits.slice(-4))}
          className="w-full flex items-center justify-center px-[20px] py-[10px] rounded-full hover-elevate disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ background: "#240757" }}
        >
          <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[20px] text-brain-v1purple whitespace-nowrap">Add This Card</span>
        </button>
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
        className="flex flex-col overflow-hidden rounded-panel w-[320px]"
        style={{
          background: "#11141b",
          border: "1px solid #1d2132",
          boxShadow:
            "0px 68px 27px 0px rgba(0,0,0,0.06), 0px 38px 23px 0px rgba(0,0,0,0.2), 0px 17px 17px 0px rgba(0,0,0,0.34), 0px 4px 9px 0px rgba(0,0,0,0.39)",
        }}
      >
        <div className="flex flex-col gap-[8px] items-center px-[8px] py-[24px] text-center w-full">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-brain-v1baby-blue-100 text-[20px] leading-[24px] w-full">
            Cancel Subscription
          </p>
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-60 text-[14px] leading-[20px] w-full">
            Are you sure you want to cancel your subscription?
          </p>
        </div>
        <div className="flex gap-[8px] items-start p-[8px] w-full">
          <button
            data-testid="button-cancel-sub-dismiss"
            onClick={onCancel}
            className="flex flex-1 items-center justify-center px-[12px] py-[8px] rounded-pill hover:opacity-80 transition-opacity"
            style={{ background: "#222737" }}
          >
            <span className="[font-family:'Gilroy',sans-serif] font-semibold text-brain-v1baby-blue-60 text-[14px] leading-[20px] whitespace-nowrap">Cancel</span>
          </button>
          <button
            data-testid="button-cancel-sub-confirm"
            onClick={onConfirm}
            className="flex flex-1 items-center justify-center px-[12px] py-[8px] rounded-pill hover:opacity-80 transition-opacity"
            style={{ background: "#350011" }}
          >
            <span className="[font-family:'Gilroy',sans-serif] font-semibold text-brain-v1pink-red text-[14px] leading-[20px] whitespace-nowrap">Confirm</span>
          </button>
        </div>
      </div>
    </div>
  );
}
