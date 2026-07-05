import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useState, useEffect } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  ChevronRight,
  ChevronLeft,
  Info,
} from "lucide-react";
import { useLocation } from "wouter";
import { useCurrency } from "@/lib/currencyContext";
import type { Vendor, TrustStatus } from "@/lib/vendorTypes";
import { openRuleDetail, resolveRule } from "@/lib/openRuleDetail";
import alertFlagIcon from "@assets/Icons_1783209453304.png";
import closeIcon from "@assets/Close_1783208306441.png";

const ALERT = "#d20344";
const ACTIVE = "#42bf23";
const PURPLE = "#7631ee";

const TRUST_META: Record<
  TrustStatus,
  {
    label: string;
    chipBg: string;
    chipText: string;
    icon: typeof ShieldCheck;
    headlineColor: string;
  }
> = {
  trusted: {
    label: "Trusted",
    chipBg: "rgba(66,191,35,0.10)",
    chipText: ACTIVE,
    icon: ShieldCheck,
    headlineColor: ACTIVE,
  },
  known: {
    label: "Known",
    chipBg: "rgba(118,49,238,0.10)",
    chipText: PURPLE,
    icon: Clock,
    headlineColor: "#a8b9f4",
  },
  new: {
    label: "New",
    chipBg: "#4a2300",
    chipText: "#ff9400",
    icon: Clock,
    headlineColor: "#a8b9f4",
  },
  under_review: {
    label: "Under review",
    chipBg: "rgba(210,3,68,0.10)",
    chipText: ALERT,
    icon: ShieldAlert,
    headlineColor: ALERT,
  },
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-[8px] items-center w-full">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[14px] text-[#6c779d] whitespace-nowrap">
        {children}
      </p>
      <div className="flex-1 h-px bg-[#1d2132]" />
    </div>
  );
}

function Row({ label, value, valueColor = "#a8b9f4" }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center w-full border-b border-[#1d2132] last:border-b-0">
      <div className="flex flex-col justify-center px-[12px] py-[8px] w-[140px] shrink-0">
        <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[20px] text-[#6c779d]">
          {label}
        </span>
      </div>
      <div className="flex flex-1 flex-col justify-center px-[12px] py-[8px] min-w-px">
        <span className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[20px] break-all" style={{ color: valueColor }}>
          {value}
        </span>
      </div>
    </div>
  );
}

export function VendorDetailPopup({
  vendor,
  open,
  onOpenChange,
  onPrev,
  onNext,
  pagerDisabled,
}: {
  vendor: Vendor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrev?: () => void;
  onNext?: () => void;
  pagerDisabled?: boolean;
}) {
  const { format } = useCurrency();
  const [, navigate] = useLocation();
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [confirmingGrant, setConfirmingGrant] = useState(false);
  const [reviewed, setReviewed] = useState(false);

  useEffect(() => {
    setConfirmingRevoke(false);
    setConfirmingGrant(false);
    setReviewed(false);
  }, [vendor?.id]);

  if (!vendor) return null;

  const meta = TRUST_META[vendor.trustStatus];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] border-solid flex flex-col items-start overflow-hidden rounded-[24px] w-[480px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out">
          {/* Title and Controls */}
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-[#1d2132] border-solid h-[56px] relative shrink-0 w-full">
            <DialogPrimitive.Title asChild>
              <p className="-translate-x-1/2 absolute font-['Gilroy',sans-serif] font-semibold leading-[24px] left-1/2 not-italic text-[#a8b9f4] text-[20px] text-center top-[calc(50%-12px)] whitespace-nowrap">
                {vendor.trustStatus === "new"
                  ? "New Vendor"
                  : vendor.trustStatus === "trusted"
                    ? "Trusted Vendor"
                    : "Review Vendor"}
              </p>
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="absolute right-[12px] top-[12px] size-[32px] rounded-full bg-[#222737] flex items-center justify-center hover:bg-[#2c3247] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
              data-testid="button-close-vendor-popup"
            >
              <img src={closeIcon} alt="" className="size-[14px]" />
            </DialogPrimitive.Close>
          </div>

          {/* Vendor name + status tag + subtitle */}
          <div className="border-b border-[#1d2132] border-solid flex flex-col items-start p-[24px] relative shrink-0 w-full">
            <div className="flex flex-col gap-[8px] items-start w-full">
              <div className="flex gap-[8px] items-center w-full">
                <p
                  className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[20px]"
                  style={{ color: meta.headlineColor }}
                  data-testid="text-vendor-name"
                >
                  {vendor.name}
                </p>
                <div
                  className="flex items-center justify-center px-[10px] py-[4px] rounded-[22px] shrink-0 border border-solid"
                  style={{
                    background: vendor.trustStatus === "under_review"
                      ? "#350011"
                      : vendor.trustStatus === "trusted"
                        ? "#123509"
                        : meta.chipBg,
                    borderColor: vendor.trustStatus === "under_review"
                      ? "rgba(210,3,68,0.2)"
                      : vendor.trustStatus === "new"
                        ? "rgba(255,149,0,0.2)"
                        : vendor.trustStatus === "trusted"
                          ? "rgba(66,191,35,0.2)"
                          : "transparent",
                  }}
                >
                  <p
                    className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[14px] text-center whitespace-nowrap"
                    style={{
                      color: vendor.trustStatus === "under_review"
                        ? "#d20344"
                        : vendor.trustStatus === "trusted"
                          ? "#42bf23"
                          : meta.chipText,
                    }}
                  >
                    {vendor.trustStatus === "under_review" ? "Paused" : meta.label}
                  </p>
                </div>
              </div>
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px] w-full">
                {vendor.category} · Account ending in {vendor.payeeAccountLast4}
              </p>
            </div>
          </div>

          {/* Container */}
          <div className="flex flex-col gap-[32px] items-start p-[24px] relative shrink-0 w-full overflow-y-auto" data-testid="vendor-detail-popup-content">
            {/* Info callout */}
            {vendor.trustStatus === "under_review" && vendor.wasTrustedLabel && (
              <div className="border border-[#1d2132] border-solid rounded-[12px] w-full">
                <div className="flex items-center p-[8px] w-full">
                  <div className="flex flex-1 gap-[8px] items-start min-w-px">
                    <Info size={16} className="shrink-0 mt-[1px] text-[#6c779d]" />
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[14px] flex-1 min-w-px">
                      {vendor.wasTrustedLabel}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {vendor.trustStatus === "trusted" && vendor.trustGrantedLabel && (
              <div className="border border-[#1d2132] border-solid rounded-[12px] w-full">
                <div className="flex items-center p-[8px] w-full">
                  <div className="flex flex-1 gap-[8px] items-start min-w-px">
                    <Info size={16} className="shrink-0 mt-[1px] text-[#6c779d]" />
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[14px] flex-1 min-w-px">
                      {vendor.trustGrantedLabel}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {vendor.trustStatus === "new" && (
              <div className="border border-[#1d2132] border-solid rounded-[12px] w-full">
                <div className="flex items-center p-[8px] w-full">
                  <div className="flex flex-1 gap-[8px] items-start min-w-px">
                    <Info size={16} className="shrink-0 mt-[1px] text-[#6c779d]" />
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[14px] flex-1 min-w-px">
                      Only {vendor.history.paymentCount} payment{vendor.history.paymentCount === 1 ? "" : "s"} on record. Brain needs more history before suggesting trust.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Payment History */}
            <div className="flex flex-col gap-[16px] items-start w-full">
              <SectionLabel>Payment History</SectionLabel>
              <div className="bg-[#0a0c10] border border-[#1d2132] border-solid flex flex-col items-start rounded-[12px] w-full">
                <Row label="Payments" value={`${vendor.history.paymentCount}`} />
                <Row label="Total Paid" value={format(vendor.history.totalPaid)} />
                <Row label="Average" value={format(vendor.history.avgAmount)} />
                <Row label="First" value={vendor.history.firstPaidLabel} />
                <Row label="Last" value={vendor.history.lastPaidLabel} />
                {vendor.history.flagCount > 0 && (
                  <Row label="Flags Raised" value={`${vendor.history.flagCount}`} valueColor="#d20344" />
                )}
              </div>
            </div>

            {/* Active Flag */}
            {vendor.flags.length > 0 && (
              <div className="flex flex-col gap-[16px] items-start w-full">
                <SectionLabel>
                  {vendor.flags.length === 1 ? "Active Flag" : "Active Flags"}
                </SectionLabel>
                {vendor.flags.map((flag, idx) => (
                  <div
                    key={idx}
                    className="bg-[#350011] border border-[rgba(210,3,68,0.2)] border-solid flex items-start p-[8px] rounded-[12px] w-full"
                  >
                    <div className="flex flex-1 gap-[8px] items-start min-w-px">
                      <img src={alertFlagIcon} alt="" className="size-[16px] shrink-0 mt-[1px]" />
                      <div className="flex flex-1 flex-col gap-[8px] items-start justify-center min-w-px">
                        <p className="[font-family:'Gilroy',sans-serif] font-bold text-[14px] leading-[16px] text-[#d20344] uppercase w-full">
                          {flag.label}
                        </p>
                        {flag.kind === "bank_detail_change" && flag.priorAccountLast4 && flag.newAccountLast4 && (
                          <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] text-[#d20344] w-full">
                            Account changed from ···{flag.priorAccountLast4} to ···{flag.newAccountLast4}
                          </p>
                        )}
                        <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[16px] text-[#d20344] w-full">
                          A trusted vendor with changed bank details is automatically placed under review. Verify the new account with the vendor before restoring trust.
                        </p>
                        <p className="[font-family:'JetBrains_Mono',monospace] text-[11px] text-[#d20344] w-full">
                          Raised {flag.raisedAtLabel}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Linked Rules (trusted only) */}
            {vendor.trustStatus === "trusted" && vendor.ruleIds.length > 0 && (
              <div className="flex flex-col gap-[16px] items-start w-full">
                {vendor.ruleIds.map((rid) => {
                  const rule = resolveRule(rid);
                  return (
                    <div key={rid} className="bg-[#0a0c10] border border-[#1d2132] border-solid relative rounded-[12px] shrink-0 w-full">
                      <button
                        type="button"
                        onClick={() => openRuleDetail(rid, navigate)}
                        disabled={!rule}
                        className="flex items-start w-full text-left focus:outline-none"
                        data-testid={`vendor-linked-rule-${rid}`}
                      >
                        <div className="flex flex-col items-center justify-center relative shrink-0 size-[64px]">
                          <div className="bg-[#222737] border border-[rgba(108,119,157,0.2)] border-solid content-stretch flex items-center justify-center px-[8px] py-[3px] relative rounded-[22px] shrink-0">
                            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#6c779d] text-[12px] text-center whitespace-nowrap">
                              Rule
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-1 flex-col items-start justify-center min-w-px relative self-stretch">
                          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] w-full">
                            {rule ? rule.name : "Rule unavailable"}
                          </p>
                        </div>
                        <div className="flex flex-col items-center justify-center relative shrink-0 size-[64px]">
                          <ChevronRight size={24} className="shrink-0 text-[#6c779d]" />
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col gap-[12px] w-full">
              {/* Trusted → Revoke */}
              {vendor.trustStatus === "trusted" && (
                <div className="flex flex-col gap-[12px] w-full">
                  {confirmingRevoke ? (
                    <div className="flex flex-col gap-[12px] p-[16px] rounded-[12px] w-full" style={{ background: "rgba(210,3,68,0.06)", border: "1px solid rgba(210,3,68,0.15)" }}>
                      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[16px] text-[#d20344]">
                        Revoke trust for {vendor.name}?
                      </p>
                      <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d]">
                        This vendor will move to <strong className="text-[#a8b9f4]">Known</strong> and will no longer be auto-paid by rules. Future payments will require manual approval.
                      </p>
                      <div className="flex gap-[8px] w-full">
                        <button
                          type="button"
                          onClick={() => setConfirmingRevoke(false)}
                          className="flex flex-1 items-center justify-center px-[12px] py-[10px] rounded-[100px] hover:opacity-80 transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[13px] text-[#6c779d]"
                          style={{ background: "#222737" }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => { setConfirmingRevoke(false); onOpenChange(false); }}
                          className="flex flex-1 items-center justify-center px-[12px] py-[10px] rounded-[100px] hover:opacity-80 transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[13px] text-[#d20344]"
                          style={{ background: "#350011" }}
                          data-testid="button-confirm-revoke-trust"
                        >
                          Revoke trust
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingRevoke(true)}
                      className="flex items-center justify-center px-[16px] py-[10px] rounded-[100px] hover:opacity-80 transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#d20344] w-full"
                      style={{ background: "#350011" }}
                      data-testid="button-revoke-trust"
                    >
                      Revoke trust
                    </button>
                  )}
                </div>
              )}

              {/* Known → Grant */}
              {vendor.trustStatus === "known" && (
                <div className="flex flex-col gap-[12px] w-full">
                  {confirmingGrant ? (
                    <div className="flex flex-col gap-[12px] p-[16px] rounded-[12px] w-full" style={{ background: "rgba(118,49,238,0.06)", border: "1px solid rgba(118,49,238,0.20)" }}>
                      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[16px] text-[#7631ee]">
                        Grant trust to {vendor.name}?
                      </p>
                      <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d]">
                        This vendor will move to <strong className="text-[#a8b9f4]">Trusted</strong> and will be eligible for auto-pay by rules that include them in their allowlist.
                      </p>
                      <div className="flex gap-[8px] w-full">
                        <button
                          type="button"
                          onClick={() => setConfirmingGrant(false)}
                          className="flex flex-1 items-center justify-center px-[12px] py-[10px] rounded-[100px] hover:opacity-80 transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[13px] text-[#6c779d]"
                          style={{ background: "#222737" }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => { setConfirmingGrant(false); onOpenChange(false); }}
                          className="flex flex-1 items-center justify-center px-[12px] py-[10px] rounded-[100px] hover:opacity-80 transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[13px] text-[#ffffff]"
                          style={{ background: PURPLE }}
                          data-testid="button-confirm-grant-trust"
                        >
                          Grant trust
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingGrant(true)}
                      className="flex items-center justify-center px-[16px] py-[10px] rounded-[100px] hover:opacity-80 transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[14px] w-full"
                      style={{ background: vendor.eligibleForTrust ? PURPLE : "transparent", color: vendor.eligibleForTrust ? "#ffffff" : "#7631ee", border: vendor.eligibleForTrust ? "none" : `1px solid ${PURPLE}` }}
                      data-testid="button-grant-trust"
                    >
                      Grant trust
                    </button>
                  )}
                </div>
              )}

              {/* Under review → Review the Change */}
              {vendor.trustStatus === "under_review" && (
                <div className="flex flex-col gap-[12px] w-full">
                  {!reviewed ? (
                    <div className="flex flex-col gap-[12px] w-full">
                      <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d]">
                        Trust is paused while you review the flag. Verify the new account directly with the vendor before restoring.
                      </p>
                      <button
                        type="button"
                        onClick={() => setReviewed(true)}
                        className="flex items-center justify-center px-[20px] py-[8px] rounded-[100px] hover:opacity-80 transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[16px] text-[#ff9400] w-full"
                        style={{ background: "#4a2300" }}
                        data-testid="button-review-change"
                      >
                        Review the Change
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-[12px] w-full">
                      <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d]">
                        You've reviewed the change. Restore trust only if you've verified the new account directly with the vendor.
                      </p>
                      <button
                        type="button"
                        onClick={() => { setReviewed(false); onOpenChange(false); }}
                        className="flex items-center justify-center px-[16px] py-[10px] rounded-[100px] hover:opacity-80 transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#ffffff] w-full"
                        style={{ background: ACTIVE }}
                        data-testid="button-restore-trust"
                      >
                        Restore trust
                      </button>
                      <button
                        type="button"
                        onClick={() => setReviewed(false)}
                        className="flex items-center justify-center px-[16px] py-[10px] rounded-[100px] hover:opacity-80 transition-opacity [font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d] w-full"
                        style={{ background: "transparent" }}
                      >
                        Go back
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* New → manual Trust */}
              {vendor.trustStatus === "new" && (
                <div className="flex flex-col gap-[14px] w-full">
                  <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d]">
                    This vendor will be eligible for trust after a few more on-time payments with consistent amounts and no flags. You can still grant trust manually.
                  </p>
                  {confirmingGrant ? (
                    <div className="flex flex-col gap-[12px] p-[16px] rounded-[12px] w-full" style={{ background: "rgba(118,49,238,0.06)", border: "1px solid rgba(118,49,238,0.20)" }}>
                      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[16px] text-[#7631ee]">
                        Grant trust to {vendor.name}?
                      </p>
                      <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d]">
                        Only {vendor.history.paymentCount} payment{vendor.history.paymentCount === 1 ? "" : "s"} on record. This vendor will move to <strong className="text-[#a8b9f4]">Trusted</strong> immediately.
                      </p>
                      <div className="flex gap-[8px] w-full">
                        <button
                          type="button"
                          onClick={() => setConfirmingGrant(false)}
                          className="flex flex-1 items-center justify-center px-[12px] py-[10px] rounded-[100px] hover:opacity-80 transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[13px] text-[#6c779d]"
                          style={{ background: "#222737" }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => { setConfirmingGrant(false); onOpenChange(false); }}
                          className="flex flex-1 items-center justify-center px-[12px] py-[10px] rounded-[100px] hover:opacity-80 transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[13px] text-[#ffffff]"
                          style={{ background: PURPLE }}
                          data-testid="button-confirm-grant-trust"
                        >
                          Grant trust
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center w-full">
                      <button
                        type="button"
                        onClick={() => setConfirmingGrant(true)}
                        className="flex flex-1 gap-[8px] items-center justify-center px-[20px] py-[8px] rounded-[100px] hover:opacity-80 transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[16px] text-[#42bf23]"
                        style={{ background: "#123509" }}
                        data-testid="button-grant-trust"
                      >
                        Trust Vendor
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Previous / Next */}
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-t border-[#1d2132] border-solid flex flex-col items-start p-[24px] relative shrink-0 w-full">
            <div className="flex gap-[16px] items-center w-full">
              <button
                type="button"
                disabled={pagerDisabled || !onPrev}
                data-testid="button-vendor-previous"
                onClick={onPrev}
                className="bg-[#222737] flex flex-1 gap-[8px] items-center justify-center px-[20px] py-[8px] rounded-[100px] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                <ChevronLeft size={16} className="text-[#6c779d] shrink-0" />
                <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">
                  Previous
                </span>
              </button>
              <button
                type="button"
                disabled={pagerDisabled || !onNext}
                data-testid="button-vendor-next"
                onClick={onNext}
                className="bg-[#222737] flex flex-1 gap-[8px] items-center justify-center px-[20px] py-[8px] rounded-[100px] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">
                  Next
                </span>
                <ChevronRight size={16} className="text-[#6c779d] shrink-0" />
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
