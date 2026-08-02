import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useState, useEffect } from "react";

/* ── Title case helper - used for all labels platform-wide ──────────────── */
function titleCase(str: string) {
  return str
    .replace(/(^| )&($| )/g, "$1and$2")
    .replace(/\w\S*/g, (txt) => {
      const lower = txt.toLowerCase();
      if (lower === "ap" || lower === "ar") return lower.toUpperCase();
      return txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase();
    });
}
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { useLocation } from "wouter";
import { useCurrency } from "@/lib/useCurrency";
import type { Vendor, TrustStatus } from "@/lib/vendorTypes";
import { vendorSegment, isReviewedOnly } from "@/lib/brainVendors";
import { openRuleDetail, resolveRule } from "@/lib/openRuleDetail";
import closeIcon from "@assets/Close_1783293571882.png";
import { AlertCallout, InfoIcon } from "@/components/Callout";

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
    /* "known" upstream means the counterparty is identified but not yet
       actioned — it does NOT mean "Brain-suggested, not yet confirmed".
       brain-core's provenance enum has no value with that meaning today.
       Use neutral styling; the Suggested chip/label must not appear here. */
    label: "Known",
    chipBg: "#1a1e2b",
    chipText: "#6c779d",
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

/* ── Trust action button — wired to mount-point handlers in VendorsPanel ──────
   Never fetches itself. Receives onClick from the panel so invalidation,
   optimistic state and error handling stay in one place.
   Disabled during in-flight window (`busy`); assistive tech reads it as
   unavailable without needing a tooltip wrapper. */
function TrustButton({
  label,
  onClick,
  busy,
  color,
  background,
  testId,
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
  color: string;
  background: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      data-testid={testId}
      className="flex items-center justify-center px-[20px] py-[10px] rounded-[100px] w-full disabled:opacity-50 disabled:cursor-wait [font-family:'Gilroy',sans-serif] font-semibold text-[16px] hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
      style={{ background, color }}
    >
      {busy ? "Working..." : label}
    </button>
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
  onDeleteVendor,
  onGrant,
  onFlag,
  onRestore,
  onAcknowledge,
  trustBusy,
}: {
  vendor: Vendor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrev?: () => void;
  onNext?: () => void;
  pagerDisabled?: boolean;
  onDeleteVendor?: (vendorId: string, vendorName: string) => void;
  /** Grant trust / confirm. Valid from unreviewed or acknowledged states. */
  onGrant?: (vendorId: string) => void;
  /** Pause / flag. Moves trusted → paused via /trust/pause. */
  onFlag?: (vendorId: string) => void;
  /** Restore paused vendor to trusted via /trust/restore. paused → trusted only. */
  onRestore?: (vendorId: string) => void;
  /** Acknowledge without granting — dismiss from review queue. */
  onAcknowledge?: (vendorId: string) => void;
  /** True while any trust action is in-flight; disables all trust buttons. */
  trustBusy?: boolean;
}) {
  const { format } = useCurrency();
  const [, navigate] = useLocation();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    setConfirmingDelete(false);
  }, [vendor?.id]);

  if (!vendor) return null;

  const meta = TRUST_META[vendor.trustStatus];

  /* Dismissed-but-not-trusted rows (trustState === "acknowledged") surface in
     the Trusted/Confirmed list, but their derived trustStatus is still
     "known"/"new". They must NOT get the unreviewed action set — the user
     already decided. The only valid forward transition is grant.
     Risk-flagged acknowledged rows are excluded: risk keeps them in Needs
     Review (never the Trusted tab), so they keep the under_review block. */
  const reviewedOnly = isReviewedOnly(vendor) && vendor.trustStatus !== "under_review";

  /* Segment-aware wording. The Customers segment says "Confirmed" where the
     Vendors segment says "Trusted" — a label alias over one tier and one
     future endpoint, never a second state. Read through the same helper the
     list uses so the popup and the row it opened from can never disagree. */
  const isCustomer = vendorSegment(vendor) === "customer";
  const nounTitle = isCustomer ? "Customer" : "Vendor";
  const noun = isCustomer ? "customer" : "vendor";
  const trustedWord = isCustomer ? "Confirmed" : "Trusted";
  const grantLabel = isCustomer ? `Confirm ${nounTitle}` : `Trust ${nounTitle}`;
  const restoreLabel = isCustomer ? "Restore Confirmation" : "Restore Trust";

  const chipLabel =
    vendor.trustStatus === "under_review"
      ? "Paused"
      : vendor.trustStatus === "trusted"
        ? trustedWord
        : meta.label;

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
                  ? `New ${nounTitle}`
                  : vendor.trustStatus === "trusted"
                    ? `${trustedWord} ${nounTitle}`
                    : `Review ${nounTitle}`}
              </p>
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="absolute right-[12px] top-[12px] size-[32px] p-0 hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
              data-testid="button-close-vendor-popup"
            >
              <img src={closeIcon} alt="" className="size-[32px] rounded-full" />
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
                    {chipLabel}
                  </p>
                </div>
              </div>
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px] w-full">
                {vendor.category} · Account ending in {vendor.payeeAccountLast4}
              </p>
            </div>
          </div>

          {/* Container */}
          <div className="flex flex-col gap-[32px] items-start p-[24px] relative w-full overflow-y-auto" data-testid="vendor-detail-popup-content">
            {/* Info callout */}
            {vendor.trustStatus === "under_review" && vendor.wasTrustedLabel && (
              <div className="border border-[#1d2132] border-solid rounded-[12px] w-full">
                <div className="flex items-center p-[8px] w-full">
                  <div className="flex flex-1 gap-[8px] items-start min-w-px">
                    <InfoIcon color="#6c779d" className="mt-[2px]" />
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
                    <InfoIcon color="#6c779d" className="mt-[2px]" />
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
                    <InfoIcon color="#6c779d" className="mt-[2px]" />
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[14px] flex-1 min-w-px">
                      Only {vendor.history.paymentCount} payment{vendor.history.paymentCount === 1 ? "" : "s"} on record. Brain needs more history before suggesting trust.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {vendor.trustStatus === "known" && (
              <div className="border border-[#1d2132] border-solid rounded-[12px] w-full">
                <div className="flex items-center p-[8px] w-full">
                  <div className="flex flex-1 gap-[8px] items-start min-w-px">
                    <InfoIcon color="#a8b9f4" className="mt-[2px]" />
                    <div className="flex flex-col gap-[8px] flex-1 min-w-px">
                      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#a8b9f4] text-[14px]">
                        Brain suggests trusting this {noun}.
                      </p>
                      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[14px]">
                        Based on consistent payment history and no unresolved flags. You decide, trust is never auto-granted.
                      </p>
                    </div>
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
                  <AlertCallout key={idx} title={flag.label}>
                    <div className="flex flex-col gap-[8px] items-start w-full">
                      {flag.kind === "bank_detail_change" && flag.priorAccountLast4 && flag.newAccountLast4 && (
                        <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] w-full">
                          Account changed from ···{flag.priorAccountLast4} to ···{flag.newAccountLast4}
                        </p>
                      )}
                      <p className="w-full">
                        A trusted vendor with changed bank details is automatically placed under review. Verify the new account with the vendor before restoring trust.
                      </p>
                      <p className="[font-family:'JetBrains_Mono',monospace] text-[11px] w-full">
                        Raised {flag.raisedAtLabel}
                      </p>
                    </div>
                  </AlertCallout>
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
                            {rule ? titleCase(rule.name) : "Rule unavailable"}
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

            {/* Payment eligibility evidence — shown when Brain has recorded
                fact rows that inform a future trust decision. The section
                header no longer claims Brain is "suggesting" trust: brain-core
                has no provenance value meaning "Brain-suggested, not yet
                confirmed", so the framing is forward-looking rather than
                assertive. Rendered for any status that carries evidence rows,
                not only for `known`. */}
            {vendor.eligibilityEvidence && vendor.eligibilityEvidence.length > 0 && (
              <div className="flex flex-col gap-[16px] items-start w-full">
                <SectionLabel>Payment eligibility</SectionLabel>
                <div className="bg-[#0a0c10] border border-[#1d2132] border-solid flex flex-col items-start rounded-[12px] w-full">
                  {vendor.eligibilityEvidence.map((ev, idx) => (
                    <div
                      key={idx}
                      className="flex items-center w-full border-b border-[#1d2132] last:border-b-0"
                    >
                      <div className="flex flex-col justify-center px-[12px] py-[8px] w-[140px] shrink-0">
                        <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[20px] text-[#6c779d]">
                          {ev.label.charAt(0).toUpperCase() + ev.label.slice(1)}
                        </span>
                      </div>
                      <div className="flex flex-1 items-center gap-[8px] px-[12px] py-[8px] min-w-px">
                        <span
                          className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[20px] whitespace-nowrap"
                          style={{
                            color:
                              ev.severity === "warning"
                                ? "#ff9400"
                                : ev.severity === "danger"
                                  ? "#d20344"
                                  : "#a8b9f4",
                          }}
                        >
                          {ev.value}
                        </span>
                        {ev.severity === "warning" && (
                          <div
                            className="flex items-center justify-center px-[8px] py-[3px] rounded-[22px] shrink-0 border border-solid"
                            style={{ background: "#4a2300", borderColor: "rgba(255,149,0,0.2)" }}
                          >
                            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#ff9400] text-[12px] text-center whitespace-nowrap">
                              Resolved
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action buttons — wired to VendorsPanel mount-point handlers */}
            <div className="flex flex-col gap-[12px] w-full">
              {/* Trusted → Revoke + Delete */}
              {vendor.trustStatus === "trusted" && (
                <div className="flex flex-col gap-[12px] w-full">
                  {confirmingDelete ? (
                    /* ── Delete confirmation ── */
                    <div className="flex flex-col gap-[24px] items-start w-full">
                      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[28px] text-[#414965] text-[22px] w-full">
                        Deleting removes this {noun} entirely. Are you sure you want to delete this {noun}? This can't be undone.
                      </p>
                      <div className="flex gap-[16px] items-center w-full">
                        <button
                          type="button"
                          onClick={() => setConfirmingDelete(false)}
                          className="flex flex-1 items-center justify-center px-[24px] py-[12px] rounded-[100px] hover:opacity-80 transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[18px] leading-[24px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                          style={{ background: "#222737" }}
                          data-testid="button-delete-vendor-cancel"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmingDelete(false);
                            onOpenChange(false);
                            onDeleteVendor?.(vendor.id, vendor.name);
                          }}
                          className="flex flex-1 items-center justify-center px-[24px] py-[12px] rounded-[100px] hover:opacity-80 transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[#d20344] text-[18px] leading-[24px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d20344]"
                          style={{ background: "#350011" }}
                          data-testid="button-confirm-delete-vendor"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* trusted → paused via /trust/pause.
                          "Flag" matches the Flagged chip the row lands under.
                          The paused → trusted path uses /trust/restore (in the Flagged tab popup). */}
                      <TrustButton
                        label="Flag"
                        onClick={() => onFlag?.(vendor.id)}
                        busy={trustBusy}
                        color="#ff9400"
                        background="#4a2300"
                        testId="button-flag-trust"
                      />
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(true)}
                        disabled={trustBusy}
                        className="flex items-center justify-center px-[20px] py-[8px] rounded-[100px] hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[16px] text-[#6c779d] w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                        style={{ background: "#1d2132" }}
                        data-testid="button-delete-vendor"
                      >
                        Delete {nounTitle}
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Acknowledged (dismissed without granting) → seen from the
                  Trusted/Confirmed tab. Grant is the only valid transition;
                  re-flagging an acknowledged row is a non-transition, so no
                  Flag button, and no Dismiss (it already happened). */}
              {reviewedOnly && (
                <div className="flex flex-col gap-[14px] w-full">
                  <p
                    className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d]"
                    data-testid="text-acknowledged-note"
                  >
                    You dismissed this {noun} without granting trust. You can still grant trust now if you've changed your mind.
                  </p>
                  <TrustButton
                    label={grantLabel}
                    onClick={() => onGrant?.(vendor.id)}
                    busy={trustBusy}
                    color="#42bf23"
                    background="#123509"
                    testId="button-grant-trust"
                  />
                </div>
              )}

              {/* known → Brain has seen payments; user confirms, flags, or dismisses.
                  acknowledge is a valid transition from unreviewed per the matrix. */}
              {vendor.trustStatus === "known" && !reviewedOnly && (
                <div className="flex flex-col gap-[12px] w-full">
                  <TrustButton
                    label={grantLabel}
                    onClick={() => onGrant?.(vendor.id)}
                    busy={trustBusy}
                    color="#42bf23"
                    background="#123509"
                    testId="button-grant-trust"
                  />
                  <TrustButton
                    label="Flag"
                    onClick={() => onFlag?.(vendor.id)}
                    busy={trustBusy}
                    color="#ff9400"
                    background="#4a2300"
                    testId="button-flag-counterparty"
                  />
                  <TrustButton
                    label="Dismiss"
                    onClick={() => onAcknowledge?.(vendor.id)}
                    busy={trustBusy}
                    color="#6c779d"
                    background="#1d2132"
                    testId="button-acknowledge-counterparty"
                  />
                </div>
              )}

              {/* under_review covers two distinct states with different valid transitions:
                    trustState === "paused"  → user previously flagged this row;
                                               only /trust/restore returns it to trusted
                                               (grant is invalid here per the transition matrix)
                    trustState !== "paused"  → unreviewed + high/sanctioned risk_level;
                                               /trust/grant is the correct move */}
              {vendor.trustStatus === "under_review" && (
                vendor.trustState === "paused" ? (
                  <div className="flex flex-col gap-[14px] w-full">
                    <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d]">
                      Trust is paused. Verify the {noun} account directly before restoring.
                    </p>
                    <TrustButton
                      label={restoreLabel}
                      onClick={() => onRestore?.(vendor.id)}
                      busy={trustBusy}
                      color="#42bf23"
                      background="#123509"
                      testId="button-restore-trust"
                    />
                    <TrustButton
                      label="Dismiss"
                      onClick={() => onAcknowledge?.(vendor.id)}
                      busy={trustBusy}
                      color="#6c779d"
                      background="#1d2132"
                      testId="button-acknowledge-counterparty"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-[14px] w-full">
                    <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d]">
                      This {noun} carries a risk flag. Verify the account before granting trust.
                    </p>
                    <TrustButton
                      label={grantLabel}
                      onClick={() => onGrant?.(vendor.id)}
                      busy={trustBusy}
                      color="#42bf23"
                      background="#123509"
                      testId="button-grant-trust"
                    />
                    <TrustButton
                      label="Dismiss"
                      onClick={() => onAcknowledge?.(vendor.id)}
                      busy={trustBusy}
                      color="#6c779d"
                      background="#1d2132"
                      testId="button-acknowledge-counterparty"
                    />
                  </div>
                )
              )}

              {/* New → grant, flag, or dismiss.
                  acknowledge is a valid transition from unreviewed per the matrix. */}
              {vendor.trustStatus === "new" && !reviewedOnly && (
                <div className="flex flex-col gap-[14px] w-full">
                  <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d]">
                    This {noun} will be eligible for trust after a few more on-time payments with consistent amounts and no flags.
                  </p>
                  <TrustButton
                    label={grantLabel}
                    onClick={() => onGrant?.(vendor.id)}
                    busy={trustBusy}
                    color="#42bf23"
                    background="#123509"
                    testId="button-grant-trust"
                  />
                  <TrustButton
                    label="Flag"
                    onClick={() => onFlag?.(vendor.id)}
                    busy={trustBusy}
                    color="#ff9400"
                    background="#4a2300"
                    testId="button-flag-counterparty"
                  />
                  <TrustButton
                    label="Dismiss"
                    onClick={() => onAcknowledge?.(vendor.id)}
                    busy={trustBusy}
                    color="#6c779d"
                    background="#1d2132"
                    testId="button-acknowledge-counterparty"
                  />
                </div>
              )}
            </div>
          </div>

          {(onPrev || onNext) && (
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
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
