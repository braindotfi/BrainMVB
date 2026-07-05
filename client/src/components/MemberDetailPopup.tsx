import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import closeIcon from "@assets/Close_1783273053398.png";
import { useQuery } from "@tanstack/react-query";
import {
  useOpenMemberId,
  closeMemberDetail,
  getCachedMember,
  primeMember,
} from "@/lib/membersStore";
import {
  ROLE_LABELS,
  domainLabel,
  formatLimit,
  formatThreshold,
  isUnlimited,
  type BrainMember,
  type ApprovalPolicyFacts,
} from "@/lib/membersApi";

/* Member detail popup — the ONE place a member reference (Settings → Team row, an
   audit record's ACTOR label, a receipt) opens into. Driven by the membersStore
   `openMemberDetail(id)` signal. It re-fetches the authoritative record by id (so a
   DEACTIVATED member — dropped from the active list but still GET-able — still
   resolves and opens), falling back to the cache for an instant first paint.

   Enforcement is CORE-ONLY: the "locked rows" (self-approval blocked, tenant
   second-approval threshold) are READ from brain-core's policy, never hardcoded. */

function LabelValue({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-[4px] rounded-[12px] bg-[#0a0c10] p-[12px]">
      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[14px] text-[#414965] text-[12px] uppercase tracking-[0.06em]">
        {label}
      </p>
      <p
        className={`${mono ? "[font-family:'JetBrains_Mono',monospace]" : "[font-family:'Gilroy',sans-serif] font-semibold"} leading-[20px] text-[#c8d4f0] text-[15px] break-words`}
      >
        {value}
      </p>
    </div>
  );
}

function LockedRow({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex items-start gap-[10px] rounded-[12px] border border-[#1d2132] bg-[#0a0c10] p-[12px]">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-[2px] shrink-0" aria-hidden="true">
        <rect x="3" y="7" width="10" height="6.5" rx="1.5" stroke="#6c779d" strokeWidth="1.3" />
        <path d="M5 7V5.5a3 3 0 0 1 6 0V7" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
      <div className="flex-1 min-w-0">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[18px] text-[#a8b9f4] text-[14px]">{title}</p>
        <p className="mt-[2px] [font-family:'Gilroy',sans-serif] font-medium leading-[17px] text-[#6c779d] text-[13px]">{detail}</p>
      </div>
    </div>
  );
}

function MemberDetailBody({ id }: { id: string }) {
  const cached = getCachedMember(id);

  // Authoritative re-fetch by id. Deactivated members are still GET-able by id even
  // though they leave the list, so this resolves them for the ACTOR-label path.
  const { data, isLoading, isError } = useQuery<BrainMember>({
    queryKey: ["/api/brain/members", id],
  });
  const { data: policy } = useQuery<ApprovalPolicyFacts>({
    queryKey: ["/api/brain/approval-policy"],
  });

  useEffect(() => {
    if (data) primeMember(data);
  }, [data]);

  // Core is authoritative. Cache is used ONLY as a transient first-paint while the
  // fetch is in flight — if the authoritative fetch ERRORS (e.g. a stale id from a
  // prior provision/tenant), show "unavailable" rather than rendering stale cached
  // member data (which could be from another session/tenant).
  const member = data ?? (isError ? undefined : cached);

  if (!member) {
    return (
      <div className="p-[24px]">
        <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[15px]" data-testid="text-member-unavailable">
          {isLoading ? "Loading member…" : "This member is no longer available."}
        </p>
      </div>
    );
  }

  const limitTxt = isUnlimited(member.approval.perItemLimit)
    ? "No per-item limit"
    : formatLimit(member.approval.perItemLimit);
  const domainsTxt = member.approval.domains.length
    ? member.approval.domains.map(domainLabel).join(", ")
    : "None";
  const perMemberSecond =
    member.approval.requiresSecondApproverAbove != null
      ? `Above ${formatLimit(member.approval.requiresSecondApproverAbove)}`
      : null;

  return (
    <div className="flex flex-col gap-[20px] p-[24px]">
      {/* Identity */}
      <div className="flex items-center gap-[14px]">
        <div className="size-[48px] rounded-full bg-[#161b28] flex items-center justify-center shrink-0">
          <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[18px]">
            {member.displayName.slice(0, 1).toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[8px]">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold text-white text-[18px] leading-[22px] truncate" data-testid="text-member-name">
              {member.displayName}
            </p>
            {!member.active && (
              <span
                className="px-[8px] py-[2px] rounded-[22px] [font-family:'Gilroy',sans-serif] font-semibold text-[11px] leading-[13px]"
                style={{ background: "rgba(210,3,68,0.12)", color: "#d20344", border: "1px solid rgba(210,3,68,0.3)" }}
                data-testid="badge-member-deactivated"
              >
                Deactivated
              </span>
            )}
          </div>
          <p className="[font-family:'JetBrains_Mono',monospace] text-[#6c779d] text-[13px] leading-[18px] truncate">{member.email}</p>
        </div>
      </div>

      {/* Authority envelope */}
      <div className="grid grid-cols-2 gap-[8px]">
        <LabelValue label="Role" value={ROLE_LABELS[member.role]} />
        <LabelValue label="Per-item limit" value={limitTxt} mono={!isUnlimited(member.approval.perItemLimit)} />
        <div className="col-span-2">
          <LabelValue label="Approval domains" value={domainsTxt} />
        </div>
      </div>

      {/* Locked, core-enforced rows */}
      <div className="flex flex-col gap-[8px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[12px] uppercase tracking-[0.08em]">
          Enforced by Brain core
        </p>
        {policy?.selfApprovalBlocked && (
          <LockedRow
            title="Can't approve their own payments"
            detail="Segregation of duties is enforced on every approval — a member can never sign off a payment to themselves."
          />
        )}
        {policy?.secondApprovalThreshold && (
          <LockedRow
            title={`Second approver required above ${formatThreshold(policy.secondApprovalThreshold)}`}
            detail="Payments over the tenant threshold need two approvers, regardless of any single member's limit."
          />
        )}
        {perMemberSecond && (
          <LockedRow title={`Second approver on this member ${perMemberSecond.toLowerCase()}`} detail="A per-member second-approver floor, on top of the tenant-wide rule." />
        )}
      </div>
    </div>
  );
}

function MemberDetailDialog({ id }: { id: string }) {
  return (
    <DialogPrimitive.Root open onOpenChange={(o) => { if (!o) closeMemberDetail(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          data-testid="member-detail-backdrop"
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] border-solid flex flex-col items-start overflow-hidden rounded-[24px] w-[440px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          data-testid="member-detail-popup"
        >
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border border-[#1d2132] border-solid h-[56px] relative shrink-0 w-full">
            <DialogPrimitive.Title className="absolute left-1/2 -translate-x-1/2 top-[calc(50%-12px)] [font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#a8b9f4] text-[20px] text-center whitespace-nowrap">
              Member
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              data-testid="button-member-close"
              aria-label="Close"
              className="absolute right-[11px] top-[11px] size-[32px] rounded-full bg-[#222737] flex items-center justify-center hover:bg-[#2c3247] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
            >
              <img src={closeIcon} alt="" className="size-[14px]" />
            </DialogPrimitive.Close>
          </div>
          <div className="w-full overflow-y-auto">
            <MemberDetailBody id={id} />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Mount ONCE near the app root. Renders the member popup whenever a member id is open. */
export function MemberDetailHost() {
  const openId = useOpenMemberId();
  const [mountedId, setMountedId] = useState<string | null>(null);

  // Keep the id mounted through the close animation so it doesn't blank out.
  useEffect(() => {
    if (openId) setMountedId(openId);
  }, [openId]);

  if (!openId || !mountedId) return null;
  return <MemberDetailDialog id={mountedId} key={mountedId} />;
}
