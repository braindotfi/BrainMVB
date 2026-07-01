import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useState, useEffect } from "react";
import { RecordPager } from "./RecordPager";
import {
  X,
  ShieldCheck,
  ShieldAlert,
  Clock,
  AlertTriangle,
  Sparkles,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { useLocation } from "wouter";
import { useCurrency } from "@/lib/currencyContext";
import type { Vendor, TrustStatus } from "@/lib/vendorTypes";
import { resolveRule, openRuleDetail } from "@/lib/openRuleDetail";

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
    chipBg: "rgba(65,73,101,0.10)",
    chipText: "#414965",
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

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#414965] text-[12px] uppercase tracking-[0.04em] w-full">
    {children}
  </p>
);

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
  /* header pager — cycle through the other vendors in the active tab */
  onPrev?: () => void;
  onNext?: () => void;
  pagerDisabled?: boolean;
}) {
  const { format } = useCurrency();
  const [, navigate] = useLocation();
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [confirmingGrant, setConfirmingGrant] = useState(false);
  const [reviewed, setReviewed] = useState(false);

  /* Reset confirm/review states whenever vendor changes so prior vendor's UI doesn't leak. */
  useEffect(() => {
    setConfirmingRevoke(false);
    setConfirmingGrant(false);
    setReviewed(false);
  }, [vendor?.id]);

  if (!vendor) return null;

  const meta = TRUST_META[vendor.trustStatus];
  const Icon = meta.icon;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] border-solid flex flex-col items-start overflow-hidden rounded-[24px] w-[520px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out">
          {/* Header */}
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-[#1d2132] border-b border-solid flex items-center gap-[12px] px-[20px] py-[14px] relative shrink-0 w-full">
            <div className="flex items-center gap-[8px] flex-1 min-w-px">
              <span
                className="px-[6px] py-[2px] rounded-[4px] [font-family:'JetBrains_Mono',monospace] font-medium text-[10px] uppercase tracking-[0.06em] flex items-center gap-[4px]"
                style={{ background: meta.chipBg, color: meta.chipText }}
              >
                <Icon size={11} />
                {meta.label}
              </span>
              <span className="[font-family:'JetBrains_Mono',monospace] leading-[16px] text-[#414965] text-[12px]">
                {vendor.id}
              </span>
            </div>
            {onPrev && onNext && (
              <RecordPager
                onPrev={onPrev}
                onNext={onNext}
                disabled={pagerDisabled}
                testIdPrefix="vendor"
              />
            )}
            <DialogPrimitive.Close
              className="size-[32px] rounded-full bg-[#222737] flex items-center justify-center hover:bg-[#2c3247] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] shrink-0"
              data-testid="button-close-vendor-popup"
            >
              <X size={14} className="text-[#a8b9f4]" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex flex-col gap-[24px] items-start p-[24px] w-full overflow-y-auto" data-testid="vendor-detail-popup-content">
            {/* Name + category */}
            <div className="flex flex-col gap-[6px] w-full">
              <p
                className="[font-family:'Gilroy',sans-serif] font-semibold text-[20px] leading-[28px]"
                style={{ color: meta.headlineColor }}
              >
                {vendor.name}
              </p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d]">
                {vendor.category} · account ending in {vendor.payeeAccountLast4}
              </p>
            </div>

            {/* Status line */}
            {vendor.trustStatus === "trusted" && vendor.trustGrantedLabel && (
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#42bf23]">
                {vendor.trustGrantedLabel}
              </p>
            )}
            {vendor.trustStatus === "under_review" && vendor.wasTrustedLabel && (
              <div className="flex flex-col gap-[8px] w-full">
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#d20344]">
                  {vendor.wasTrustedLabel}
                </p>
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d]">
                  Trust is paused while you review the flag below. No auto-payments will go through until resolved.
                </p>
              </div>
            )}
            {vendor.trustStatus === "known" && vendor.eligibleForTrust && (
              <div className="flex flex-col gap-[8px] w-full">
                <div className="flex items-center gap-[6px]">
                  <Sparkles size={14} className="text-[#7631ee]" />
                  <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#7631ee]">
                    Brain suggests trusting this vendor
                  </p>
                </div>
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d]">
                  Based on consistent payment history and no unresolved flags. You decide — trust is never auto-granted.
                </p>
              </div>
            )}
            {vendor.trustStatus === "new" && (
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d]">
                Only {vendor.history.paymentCount} payment{vendor.history.paymentCount === 1 ? "" : "s"} on record. Brain needs more history before suggesting trust.
              </p>
            )}

            {/* History facts */}
            <div className="flex flex-col gap-[12px] w-full">
              <SectionLabel>Payment history</SectionLabel>
              <div className="flex flex-col gap-[8px] w-full">
                <FactRow label="Payments" value={`${vendor.history.paymentCount}`} />
                <FactRow label="Total paid" value={format(vendor.history.totalPaid)} />
                <FactRow label="Average" value={format(vendor.history.avgAmount)} />
                <FactRow label="First" value={vendor.history.firstPaidLabel} />
                <FactRow label="Last" value={vendor.history.lastPaidLabel} />
                {vendor.history.flagCount > 0 && (
                  <FactRow
                    label="Flags raised"
                    value={`${vendor.history.flagCount}`}
                    valueColor="#d20344"
                  />
                )}
              </div>
            </div>

            {/* Flags */}
            {vendor.flags.length > 0 && (
              <div className="flex flex-col gap-[12px] w-full">
                <SectionLabel>
                  {vendor.flags.length === 1 ? "Active flag" : "Active flags"}
                </SectionLabel>
                <div className="flex flex-col gap-[8px] w-full">
                  {vendor.flags.map((flag, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col gap-[4px] p-[12px] rounded-[8px] w-full"
                      style={{ background: "rgba(210,3,68,0.06)", border: "1px solid rgba(210,3,68,0.15)" }}
                    >
                      <div className="flex items-center gap-[6px]">
                        <AlertTriangle size={14} style={{ color: ALERT }} />
                        <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px]" style={{ color: ALERT }}>
                          {flag.label}
                        </p>
                      </div>
                      {flag.kind === "bank_detail_change" && (
                        <>
                          {flag.priorAccountLast4 && flag.newAccountLast4 && (
                            <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] text-[#6c779d]">
                              Account changed from ···{flag.priorAccountLast4} to ···{flag.newAccountLast4}
                            </p>
                          )}
                          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] text-[#6c779d]">
                            A trusted vendor with changed bank details is automatically placed under review. Verify the new account with the vendor before restoring trust.
                          </p>
                        </>
                      )}
                      <p className="[font-family:'JetBrains_Mono',monospace] text-[11px] text-[#414965]">
                        Raised {flag.raisedAtLabel}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Eligibility evidence (known + eligible only) */}
            {vendor.eligibleForTrust && vendor.eligibilityEvidence && vendor.eligibilityEvidence.length > 0 && (
              <div className="flex flex-col gap-[12px] w-full">
                <SectionLabel>Why Brain suggests trust</SectionLabel>
                <div className="flex flex-col gap-[8px] w-full">
                  {vendor.eligibilityEvidence.map((fact, idx) => (
                    <FactRow
                      key={idx}
                      label={fact.label}
                      value={fact.value}
                      valueColor={fact.severity === "warning" ? "#f59e0b" : fact.severity === "danger" ? ALERT : "#a8b9f4"}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Linked rules */}
            {vendor.ruleIds.length > 0 && (
              <div className="flex flex-col gap-[12px] w-full">
                <SectionLabel>Linked rules</SectionLabel>
                <div className="flex flex-col gap-[8px] w-full">
                  {vendor.ruleIds.map((ruleId) => {
                    const resolved = resolveRule(ruleId);
                    return resolved ? (
                      <button
                        key={ruleId}
                        type="button"
                        onClick={() => { openRuleDetail(ruleId, navigate); }}
                        className="flex items-center gap-[8px] p-[8px] rounded-[8px] bg-[#0a0c10] w-full text-left hover:bg-[#11141b] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                        data-testid={`link-rule-${ruleId}`}
                      >
                        <span className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase text-[#414965] tracking-[0.04em]">rule</span>
                        <span className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d] flex-1 min-w-px">{resolved.name}</span>
                        <ChevronRight size={14} className="text-[#414965] shrink-0" />
                      </button>
                    ) : (
                      <div
                        key={ruleId}
                        className="flex items-center gap-[8px] p-[8px] rounded-[8px] bg-[#0a0c10] w-full opacity-50"
                      >
                        <span className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase text-[#414965] tracking-[0.04em]">rule</span>
                        <span className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d] flex-1 min-w-px">{ruleId} (rule unavailable)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Divider before actions */}
            <div className="h-px w-full bg-[#1d2132]" />

            {/* Action buttons — vary by trust status */}
            <div className="flex flex-col gap-[12px] w-full">
              {/* Trusted → Revoke (with confirm) */}
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
                          onClick={() => {
                            setConfirmingRevoke(false);
                            onOpenChange(false);
                          }}
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
                      className="flex items-center justify-center gap-[8px] px-[16px] py-[10px] rounded-[100px] hover:opacity-80 transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#d20344] w-full"
                      style={{ background: "#350011" }}
                      data-testid="button-revoke-trust"
                    >
                      <ShieldAlert size={16} /> Revoke trust
                    </button>
                  )}
                </div>
              )}

              {/* Known → Grant (with confirm); eligible gets purple Brain-suggest CTA, non-eligible gets outline */}
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
                          onClick={() => {
                            setConfirmingGrant(false);
                            onOpenChange(false);
                          }}
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
                      className="flex items-center justify-center gap-[8px] px-[16px] py-[10px] rounded-[100px] hover:opacity-80 transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[14px] w-full"
                      style={{ background: vendor.eligibleForTrust ? PURPLE : "transparent", color: vendor.eligibleForTrust ? "#ffffff" : "#7631ee", border: vendor.eligibleForTrust ? "none" : `1px solid ${PURPLE}` }}
                      data-testid="button-grant-trust"
                    >
                      <Sparkles size={16} /> Grant trust
                    </button>
                  )}
                </div>
              )}

              {/* Under review → two-step: Review change, then Restore trust */}
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
                        className="flex items-center justify-center gap-[8px] px-[16px] py-[10px] rounded-[100px] hover:opacity-80 transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#ffffff] w-full"
                        style={{ background: "#222737", border: "1px solid #414965" }}
                        data-testid="button-review-change"
                      >
                        <AlertTriangle size={16} /> Review the change
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
                        className="flex items-center justify-center gap-[8px] px-[16px] py-[10px] rounded-[100px] hover:opacity-80 transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#ffffff] w-full"
                        style={{ background: ACTIVE }}
                        data-testid="button-restore-trust"
                      >
                        <ShieldCheck size={16} /> Restore trust
                      </button>
                      <button
                        type="button"
                        onClick={() => setReviewed(false)}
                        className="flex items-center justify-center gap-[8px] px-[16px] py-[10px] rounded-[100px] hover:opacity-80 transition-opacity [font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d] w-full"
                        style={{ background: "transparent" }}
                      >
                        Go back
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* New → de-emphasized manual Trust Vendor, with confirm */}
              {vendor.trustStatus === "new" && (
                <div className="flex flex-col gap-[12px] w-full">
                  <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#414965]">
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
                          onClick={() => {
                            setConfirmingGrant(false);
                            onOpenChange(false);
                          }}
                          className="flex flex-1 items-center justify-center px-[12px] py-[10px] rounded-[100px] hover:opacity-80 transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[13px] text-[#ffffff]"
                          style={{ background: PURPLE }}
                          data-testid="button-confirm-grant-trust-new"
                        >
                          Grant trust
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingGrant(true)}
                      className="flex items-center justify-center gap-[8px] px-[16px] py-[10px] rounded-[100px] hover:opacity-80 transition-opacity [font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#414965] w-full"
                      style={{ background: "transparent", border: "1px solid #414965" }}
                      data-testid="button-grant-trust-new"
                    >
                      <Sparkles size={16} /> Trust vendor
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ── Fact row (label + value mono) ──────────────────────────────────────────── */
function FactRow({
  label,
  value,
  valueColor = "#a8b9f4",
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-center justify-between w-full">
      <span className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] text-[#6c779d]">{label}</span>
      <span className="[font-family:'JetBrains_Mono',monospace] font-medium text-[13px] text-right" style={{ color: valueColor }}>
        {value}
      </span>
    </div>
  );
}
