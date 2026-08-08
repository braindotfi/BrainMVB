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
import {
  vendorSegment,
  isReviewedOnly,
  supportsTrustActions,
  isNeedsReview,
  trustChipKind,
  trustTitleKind,
} from "@/lib/brainVendors";
import { openRuleDetail, resolveRule } from "@/lib/openRuleDetail";
import closeIcon from "@assets/Close_1783293571882.png";
import { AlertCallout, InfoIcon } from "@/components/Callout";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";

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
    chipText: "#ff9500",
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
      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[20px] text-brain-v1baby-blue-60 whitespace-nowrap">
        {children}
      </p>
      <div className="flex-1 h-px bg-brain-v1stroke-2" />
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
      className="flex items-center justify-center px-[20px] py-[10px] rounded-pill w-full disabled:opacity-60 disabled:cursor-not-allowed [font-family:'Gilroy',sans-serif] font-semibold text-[16px] leading-[20px] hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
      style={{ background, color }}
    >
      {busy ? "Working..." : label}
    </button>
  );
}

function Row({ label, value, valueColor = "#a8b9f4" }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center w-full border-b border-brain-v1stroke-2 last:border-b-0">
      <div className="flex flex-col justify-center px-[12px] py-[8px] w-[140px] shrink-0">
        <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] text-brain-v1baby-blue-60">
          {label}
        </span>
      </div>
      <div className="flex flex-1 flex-col justify-center px-[12px] py-[8px] min-w-px">
        <span className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] break-all" style={{ color: valueColor }}>
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
  onPause,
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
  onPause?: (vendorId: string) => void;
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
     already decided. The valid forward transitions are grant or pause.
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

  /* Informational rows (today: the payroll register placeholder) carry no trust
     controls. The derived trustStatus still says "new"/"known" — that is a tier
     derivation over payment history and it does not know the row is a
     bookkeeping artefact — so the status chip and the heading are overridden
     too. Leaving them would label the row "New Vendor" and invite exactly the
     review that is being withheld. */
  const trustActionsAvailable = supportsTrustActions(vendor);

  /* Which status this row is in is decided by trustChipKind, next to vendorTier
     and in the same branch order, so the chip cannot disagree with the tab the row
     is filed under. Deciding it here from trustStatus is what produced a run of
     false badges: that field reports `under_review` for a pause AND for a server
     risk mark, and reports `trusted` before it looks at risk at all.

     This component owns only the words, because those are segment-dependent —
     customers are "Confirmed", vendors "Trusted". "Paused" rather than "Flagged"
     for the /trust/pause state: this app already spends "flag" on the per-
     counterparty anomaly signals rendered further down this same popup ("Active
     Flags", "Flags Raised"), and two meanings for one word on one screen is worse
     than the naming drift it replaced. */
  const chipLabel = {
    informational: "Informational",
    needsReview: "Needs Review",
    paused: "Paused",
    /* Dismissed, not granted. It shares the Trusted tab, and the row list draws
       the same distinction with its Reviewed badge. */
    reviewed: "Reviewed",
    trusted: trustedWord,
    /* No tier claims this row, so the chip must not claim anything either. */
    unclassified: meta.label,
  }[trustChipKind(vendor)];

  return (
    <>
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-brain-v1baby-blue-5 border border-brain-v1stroke-2 border-solid flex flex-col items-start overflow-hidden rounded-modal w-[480px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out">
          {/* Title and Controls */}
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-brain-v1stroke-2 border-solid h-[56px] relative shrink-0 w-full">
            <DialogPrimitive.Title asChild>
              <p
                data-testid="text-vendor-popup-title"
                className="-translate-x-1/2 absolute [font-family:'Gilroy',sans-serif] font-semibold leading-[24px] left-1/2 not-italic text-brain-v1baby-blue-100 text-[20px] text-center top-[calc(50%-12px)] whitespace-nowrap"
              >
                {/* Derived from the chip kind, not from trustStatus. Read directly,
                    that field made this heading claim "Trusted Vendor" for a row
                    brain-core had marked sanctioned — in the largest text on the
                    popup, directly above a chip reading "Needs Review". */}
                {{
                  informational: "Payroll Register",
                  needsReview: `Review ${nounTitle}`,
                  new: `New ${nounTitle}`,
                  paused: `Paused ${nounTitle}`,
                  reviewed: `Reviewed ${nounTitle}`,
                  trusted: `${trustedWord} ${nounTitle}`,
                  /* No tier claims the row; ask for a look rather than assert a state. */
                  unclassified: `Review ${nounTitle}`,
                }[trustTitleKind(vendor)]}
              </p>
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="absolute right-[12px] top-[12px] size-[32px] p-0 hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
              data-testid="button-close-vendor-popup"
            >
              <img src={closeIcon} alt="" className="size-[32px] rounded-full" />
            </DialogPrimitive.Close>
          </div>

          {/* Vendor name + status tag + subtitle */}
          <div className="border-b border-brain-v1stroke-2 border-solid flex flex-col items-start p-[24px] relative shrink-0 w-full">
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
                  className="flex items-center justify-center px-[10px] py-[4px] rounded-pill shrink-0 border border-solid"
                  style={{
                    background: !trustActionsAvailable
                      ? "#1a1e2b"
                      : vendor.trustStatus === "under_review"
                        ? "#350011"
                        : vendor.trustStatus === "trusted"
                          ? "#123509"
                          : meta.chipBg,
                    borderColor: !trustActionsAvailable
                      ? "rgba(108,119,157,0.2)"
                      : vendor.trustStatus === "under_review"
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
                      color: !trustActionsAvailable
                        ? "#6c779d"
                        : vendor.trustStatus === "under_review"
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
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-brain-v1baby-blue-60 text-[16px] w-full">
                {vendor.category} · Account ending in {vendor.payeeAccountLast4}
              </p>
            </div>
          </div>

          {/* Container */}
          <div className="flex flex-col gap-[32px] items-start p-[24px] relative w-full overflow-y-auto" data-testid="vendor-detail-popup-content">
            {/* Info callout */}
            {vendor.trustStatus === "under_review" && vendor.wasTrustedLabel && (
              <div className="border border-brain-v1stroke-2 border-solid rounded-row w-full">
                <div className="flex items-center p-[8px] w-full">
                  <div className="flex flex-1 gap-[8px] items-start min-w-px">
                    <InfoIcon color="#6c779d" className="mt-[2px]" />
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-brain-v1baby-blue-60 text-[14px] flex-1 min-w-px">
                      {vendor.wasTrustedLabel}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {vendor.trustStatus === "trusted" && vendor.trustGrantedLabel && (
              <div className="border border-brain-v1stroke-2 border-solid rounded-row w-full">
                <div className="flex items-center p-[8px] w-full">
                  <div className="flex flex-1 gap-[8px] items-start min-w-px">
                    <InfoIcon color="#6c779d" className="mt-[2px]" />
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-brain-v1baby-blue-60 text-[14px] flex-1 min-w-px">
                      {vendor.trustGrantedLabel}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {vendor.trustStatus === "new" && (
              <div className="border border-brain-v1stroke-2 border-solid rounded-row w-full">
                <div className="flex items-center p-[8px] w-full">
                  <div className="flex flex-1 gap-[8px] items-start min-w-px">
                    <InfoIcon color="#6c779d" className="mt-[2px]" />
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-brain-v1baby-blue-60 text-[14px] flex-1 min-w-px">
                      Only {vendor.history.paymentCount} payment{vendor.history.paymentCount === 1 ? "" : "s"} on record. Brain needs more history before suggesting trust.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {vendor.trustStatus === "known" && (
              <div className="border border-brain-v1stroke-2 border-solid rounded-row w-full">
                <div className="flex items-center p-[8px] w-full">
                  <div className="flex flex-1 gap-[8px] items-start min-w-px">
                    <InfoIcon color="#a8b9f4" className="mt-[2px]" />
                    <div className="flex flex-col gap-[8px] flex-1 min-w-px">
                      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-brain-v1baby-blue-100 text-[14px]">
                        Brain suggests trusting this {noun}.
                      </p>
                      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-brain-v1baby-blue-60 text-[14px]">
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
              <div className="bg-brain-v1highlight-dropdown-bg border border-brain-v1stroke-2 border-solid flex flex-col items-start rounded-row w-full">
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
                        <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] leading-[16px] w-full">
                          Account changed from ···{flag.priorAccountLast4} to ···{flag.newAccountLast4}
                        </p>
                      )}
                      <p className="w-full">
                        A trusted vendor with changed bank details is automatically placed under review. Verify the new account with the vendor before restoring trust.
                      </p>
                      <p className="[font-family:'JetBrains_Mono',monospace] text-[11px] leading-[14px] w-full">
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
                    <div key={rid} className="bg-brain-v1highlight-dropdown-bg border border-brain-v1stroke-2 border-solid relative rounded-row shrink-0 w-full">
                      <button
                        type="button"
                        onClick={() => openRuleDetail(rid, navigate)}
                        disabled={!rule}
                        className="flex items-start w-full text-left focus:outline-none"
                        data-testid={`vendor-linked-rule-${rid}`}
                      >
                        <div className="flex flex-col items-center justify-center relative shrink-0 size-[64px]">
                          <div className="bg-brain-v1baby-blue-15 border border-[rgba(108,119,157,0.2)] border-solid content-stretch flex items-center justify-center px-[8px] py-[3px] relative rounded-pill shrink-0">
                            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-brain-v1baby-blue-60 text-[12px] text-center whitespace-nowrap">
                              Rule
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-1 flex-col items-start justify-center min-w-px relative self-stretch">
                          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-100 text-[16px] w-full">
                            {rule ? titleCase(rule.name) : "Rule unavailable"}
                          </p>
                        </div>
                        <div className="flex flex-col items-center justify-center relative shrink-0 size-[64px]">
                          <ChevronRight size={24} className="shrink-0 text-brain-v1baby-blue-60" />
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
                <div className="bg-brain-v1highlight-dropdown-bg border border-brain-v1stroke-2 border-solid flex flex-col items-start rounded-row w-full">
                  {vendor.eligibilityEvidence.map((ev, idx) => (
                    <div
                      key={idx}
                      className="flex items-center w-full border-b border-brain-v1stroke-2 last:border-b-0"
                    >
                      <div className="flex flex-col justify-center px-[12px] py-[8px] w-[140px] shrink-0">
                        <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] text-brain-v1baby-blue-60">
                          {ev.label.charAt(0).toUpperCase() + ev.label.slice(1)}
                        </span>
                      </div>
                      <div className="flex flex-1 items-center gap-[8px] px-[12px] py-[8px] min-w-px">
                        <span
                          className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] whitespace-nowrap"
                          style={{
                            color:
                              ev.severity === "warning"
                                ? "#ff9500"
                                : ev.severity === "danger"
                                  ? "#d20344"
                                  : "#a8b9f4",
                          }}
                        >
                          {ev.value}
                        </span>
                        {ev.severity === "warning" && (
                          <div
                            className="flex items-center justify-center px-[8px] py-[3px] rounded-pill shrink-0 border border-solid"
                            style={{ background: "#4a2300", borderColor: "rgba(255,149,0,0.2)" }}
                          >
                            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-brain-v1light-orange text-[12px] text-center whitespace-nowrap">
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

            {/* Action buttons — wired to VendorsPanel mount-point handlers.
                Informational rows get none of them: every control below records
                a trust decision, and there is no decision to record about a
                placeholder. They are omitted rather than disabled because no
                sequence of events makes them available. */}
            <div className="flex flex-col gap-[12px] w-full">
              {!trustActionsAvailable ? (
                <div
                  className="border border-brain-v1stroke-2 border-solid rounded-row w-full"
                  data-testid="text-informational-only"
                >
                  <div className="flex items-center p-[8px] w-full">
                    <div className="flex flex-1 gap-[8px] items-start min-w-px">
                      <InfoIcon color="#6c779d" className="mt-[2px]" />
                      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-brain-v1baby-blue-60 text-[14px] flex-1 min-w-px">
                        Brain keeps this row to group entries from a payroll register. It is not a{" "}
                        {noun} you pay directly, so there is nothing here to trust, flag, or dismiss.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
              {/* Trusted → Revoke + Delete */}
              {vendor.trustStatus === "trusted" && (
                <div className="flex flex-col gap-[12px] w-full">
                  {/* A granted row can be risk-marked upstream afterwards. The chip
                      and the tab both say Needs Review in that case, so the body has
                      to give the reason — otherwise the popup shows a review demand
                      with nothing on it explaining what changed. */}
                  {isNeedsReview(vendor) && (
                    <AlertCallout testId="text-trusted-risk-note">
                      Brain marked this {noun} as risky since trust was granted. Verify the
                      account, or pause trust while you check.
                    </AlertCallout>
                  )}
                  {/* trusted → paused via /trust/pause. The button, the tab and the
                      chip all read "Pause"/"Paused" so one state has one name.
                      The paused → trusted path uses /trust/restore (in the Paused tab popup). */}
                  <TrustButton
                    label="Pause"
                    onClick={() => onPause?.(vendor.id)}
                    busy={trustBusy}
                    color="#ff9500"
                    background="#4a2300"
                    testId="button-pause-trust"
                  />
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    disabled={trustBusy}
                    className="flex items-center justify-center px-[20px] py-[8px] rounded-pill hover:opacity-80 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[16px] leading-[20px] text-brain-v1baby-blue-60 w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
                    style={{ background: "#350011", color: "#d20344" }}
                    data-testid="button-delete-vendor"
                  >
                    Delete {nounTitle}
                  </button>
                </div>
              )}

              {/* Acknowledged (dismissed without granting) → seen from the
                  Trusted/Confirmed tab. Grant and Flag are both valid
                  transitions; no Dismiss (it already happened). */}
              {reviewedOnly && (
                <div className="flex flex-col gap-[14px] w-full">
                  <p
                    className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-brain-v1baby-blue-60"
                    data-testid="text-acknowledged-note"
                  >
                    You reviewed this {noun} and took no action. You can still grant trust now if you've changed your mind.
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
                    label="Pause"
                    onClick={() => onPause?.(vendor.id)}
                    busy={trustBusy}
                    color="#ff9500"
                    background="#4a2300"
                    testId="button-pause-counterparty"
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
                    label="Pause"
                    onClick={() => onPause?.(vendor.id)}
                    busy={trustBusy}
                    color="#ff9500"
                    background="#4a2300"
                    testId="button-pause-counterparty"
                  />
                  <TrustButton
                    label="No action"
                    onClick={() => onAcknowledge?.(vendor.id)}
                    busy={trustBusy}
                    color="#6c779d"
                    background="#1d2132"
                    testId="button-acknowledge-counterparty"
                  />
                </div>
              )}

              {/* under_review covers two distinct states with different valid transitions:
                    trustState === "paused"  → user previously paused this row;
                                               only /trust/restore returns it to trusted
                                               (grant is invalid here per the transition matrix)
                    trustState !== "paused"  → unreviewed + high/sanctioned risk_level;
                                               /trust/grant is the correct move */}
              {vendor.trustStatus === "under_review" && (
                vendor.trustState === "paused" ? (
                  <div className="flex flex-col gap-[14px] w-full">
                    <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-brain-v1baby-blue-60">
                      You paused trust for this {noun}. Verify the account directly before restoring it.
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
                      label="No action"
                      onClick={() => onAcknowledge?.(vendor.id)}
                      busy={trustBusy}
                      color="#6c779d"
                      background="#1d2132"
                      testId="button-acknowledge-counterparty"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-[14px] w-full">
                    <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-brain-v1baby-blue-60">
                      Brain marked this {noun} as risky. Verify the account before granting trust.
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
                      label="No action"
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
                  <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-brain-v1baby-blue-60">
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
                    label="Pause"
                    onClick={() => onPause?.(vendor.id)}
                    busy={trustBusy}
                    color="#ff9500"
                    background="#4a2300"
                    testId="button-pause-counterparty"
                  />
                  <TrustButton
                    label="No action"
                    onClick={() => onAcknowledge?.(vendor.id)}
                    busy={trustBusy}
                    color="#6c779d"
                    background="#1d2132"
                    testId="button-acknowledge-counterparty"
                  />
                </div>
              )}
                </>
              )}
            </div>
          </div>

          {(onPrev || onNext) && (
            <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-t border-brain-v1stroke-2 border-solid flex flex-col items-start p-[24px] relative shrink-0 w-full">
              <div className="flex gap-[16px] items-center w-full">
                <button
                  type="button"
                  disabled={pagerDisabled || !onPrev}
                  data-testid="button-vendor-previous"
                  onClick={onPrev}
                  className="bg-brain-v1baby-blue-15 flex flex-1 gap-[8px] items-center justify-center px-[20px] py-[8px] rounded-pill disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
                >
                  <ChevronLeft size={16} className="text-brain-v1baby-blue-60 shrink-0" />
                  <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-60 text-[16px] whitespace-nowrap">
                    Previous
                  </span>
                </button>
                <button
                  type="button"
                  disabled={pagerDisabled || !onNext}
                  data-testid="button-vendor-next"
                  onClick={onNext}
                  className="bg-brain-v1baby-blue-15 flex flex-1 gap-[8px] items-center justify-center px-[20px] py-[8px] rounded-pill disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
                >
                  <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-60 text-[16px] whitespace-nowrap">
                    Next
                  </span>
                  <ChevronRight size={16} className="text-brain-v1baby-blue-60 shrink-0" />
                </button>
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>

    {/* Delete confirmation — rendered as its own floating dialog so it
        sits on top of the vendor detail popup, not inline inside it. */}
    <DeleteConfirmDialog
      open={confirmingDelete}
      onOpenChange={(open) => { if (!open) setConfirmingDelete(false); }}
      title={`Delete ${nounTitle}`}
      body={`Are you sure you want to delete this ${noun}? Deleting removes this ${noun} entirely. This can't be undone.`}
      cancelLabel="Cancel"
      confirmLabel="Delete"
      onCancel={() => setConfirmingDelete(false)}
      onConfirm={() => {
        setConfirmingDelete(false);
        onOpenChange(false);
        onDeleteVendor?.(vendor.id, vendor.name);
      }}
      cancelTestId="button-delete-vendor-cancel"
      confirmTestId="button-confirm-delete-vendor"
    />
  </>
  );
}
