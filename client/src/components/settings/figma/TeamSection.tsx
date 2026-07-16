import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { openMemberDetail, primeMembers } from "@/lib/membersStore";
import { mapApprovalRejection, parseCoreError } from "@/lib/approvalRejections";
import closeIcon from "@assets/Close_1783293571882.png";
import memberIcon from "@assets/member_1783635675512.png";
import arrowButton from "@assets/Button_1783635877872.png";
import {
  ROLE_LABELS,
  envelopeLine,
  isInvitedPending,
  type ApprovalDomain,
  type BrainMember,
  type ListMembersResponse,
  type MemberRole,
  type ApprovalPolicyFacts,
} from "@/lib/membersApi";

/** Production-tenancy gate for the invite UI (mode + linked flag from the BFF). */
interface TenancyStatus {
  mode: "production" | "demo";
  linked: boolean;
  tenantId?: string;
}

/* Settings → Team. Members & approval authority, backed by the REAL brain-core API
   through the BFF (member/user-principal token). This page never enforces anything
   itself - it reads and mutates; core is the sole authority and its refusals surface
   verbatim (e.g. last_admin_protected). */

const ALL_DOMAINS: ApprovalDomain[] = ["ap", "ar", "treasury", "payroll", "reconciliation"];
const DOMAIN_TITLE: Record<ApprovalDomain, string> = {
  ap: "AP",
  ar: "AR",
  treasury: "Treasury",
  payroll: "Payroll",
  reconciliation: "Reconciliation",
};

function RolePill({ role }: { role: MemberRole }) {
  const color = role === "admin" ? "#7631ee" : role === "approver" ? "#a8b9f4" : "#6c779d";
  const bg = role === "admin" ? "#240757" : role === "approver" ? "rgba(168,185,244,0.1)" : "rgba(108,119,157,0.1)";
  const border = role === "admin" ? "rgba(118,49,238,0.2)" : `${color}33`;
  return (
    <span
      className="px-[8px] py-[3px] rounded-[22px] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[14px]"
      style={{ background: bg, color, border: `1px solid ${border}` }}
      data-testid={`pill-role-${role}`}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

function MemberRow({ member, inviteActions }: { member: BrainMember; inviteActions: boolean }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<null | "resend" | "revoke">(null);
  const invited = isInvitedPending(member);

  const inviteCall = async (action: "resend" | "revoke") => {
    setBusy(action);
    try {
      const res = await fetch(`/api/brain/members/${encodeURIComponent(member.id)}/invites`, {
        method: action === "resend" ? "POST" : "DELETE",
        credentials: "include",
      });
      const body = await res.json().catch(() => undefined);
      if (!res.ok) {
        toast({
          title: action === "resend" ? "Couldn't resend invite" : "Couldn't revoke invite",
          description: mapApprovalRejection(parseCoreError(body)).detail,
          variant: "destructive",
        });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/brain/members"] });
      toast({
        title: action === "resend" ? "Invite reissued" : "Invite revoked",
        description:
          action === "resend"
            ? `A new invite link was issued for ${member.displayName}; the previous one no longer works.`
            : `${member.displayName}'s invite link no longer works.`,
      });
    } catch {
      toast({ title: "Couldn't reach Brain core", description: "Nothing was changed.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-[8px]">
      <button
        type="button"
        onClick={() => openMemberDetail(member.id)}
        data-testid={`row-member-${member.id}`}
        className="bg-[#0a0c10] flex gap-[16px] items-center p-[8px] rounded-[8px] w-full text-left hover:bg-[#0d1018] transition-colors"
      >
        <div className="shrink-0 size-[40px] rounded-full overflow-hidden">
          <img alt="" className="size-full object-cover" src={memberIcon} />
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-[4px] items-start justify-center">
          <div className="flex gap-[8px] items-start shrink-0">
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[20px] truncate">
              {member.displayName}
            </p>
            <RolePill role={member.role} />
            {invited && (
              <span
                className="px-[8px] py-[3px] rounded-[22px] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[14px]"
                style={{ background: "rgba(108,119,157,0.1)", color: "#6c779d", border: "1px solid rgba(108,119,157,0.3)" }}
                data-testid={`pill-invited-${member.id}`}
              >
                Invited - awaiting signup
              </span>
            )}
            {!member.active && (
              <span
                className="px-[8px] py-[3px] rounded-[22px] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[14px]"
                style={{ background: "rgba(210,3,68,0.12)", color: "#d20344", border: "1px solid rgba(210,3,68,0.3)" }}
              >
                Deactivated
              </span>
            )}
          </div>
          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[14px] leading-[16px] truncate" data-testid={`text-envelope-${member.id}`}>
            {envelopeLine(member.approval)}
          </p>
        </div>
        <div className="relative rounded-[100px] shrink-0 size-[40px] overflow-hidden">
          <img alt="" className="absolute inset-0 size-full" src={arrowButton} />
        </div>
      </button>
      {invited && inviteActions && (
        <div className="flex gap-[8px] items-center pl-[64px]">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => inviteCall("resend")}
            data-testid={`button-resend-invite-${member.id}`}
            className="rounded-[100px] bg-[#240757] px-[12px] py-[6px] [font-family:'Gilroy',sans-serif] font-semibold text-[#7631ee] text-[13px] hover:bg-[#2e0a6e] transition-colors disabled:opacity-40"
          >
            {busy === "resend" ? "Resending…" : "Resend invite"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => inviteCall("revoke")}
            data-testid={`button-revoke-invite-${member.id}`}
            className="rounded-[100px] px-[12px] py-[6px] [font-family:'Gilroy',sans-serif] font-semibold text-[13px] transition-colors disabled:opacity-40"
            style={{ background: "rgba(210,3,68,0.08)", color: "#d20344", border: "1px solid rgba(210,3,68,0.3)" }}
          >
            {busy === "revoke" ? "Revoking…" : "Revoke invite"}
          </button>
        </div>
      )}
    </div>
  );
}

function AddMemberDialog({ open, onClose, production }: { open: boolean; onClose: () => void; production: boolean }) {
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("approver");
  const [domains, setDomains] = useState<ApprovalDomain[]>(["ap"]);
  const [limit, setLimit] = useState("10000");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDisplayName(""); setEmail(""); setRole("approver");
      setDomains(["ap"]); setLimit("10000"); setBusy(false); setError(null);
    }
  }, [open]);

  const toggleDomain = (d: ApprovalDomain) =>
    setDomains((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const submit = async () => {
    if (!displayName.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setBusy(true);
    setError(null);
    const perItemLimit = Number(limit.replace(/[^0-9.]/g, "")) || 0;
    try {
      const res = await fetch("/api/brain/members", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          email: email.trim(),
          role,
          approval: { domains, perItemLimit, requiresSecondApproverAbove: null },
          // Production tenancy: mark the membership as invite-pending so core issues it
          // in the "invited" state (the invite link itself is issued right after).
          ...(production ? { invite: true } : {}),
        }),
      });
      const body = await res.json().catch(() => undefined);
      if (!res.ok) {
        setError(mapApprovalRejection(parseCoreError(body)).detail);
        return;
      }
      // Production tenancy: issue the invite link for the new member. If this second
      // call fails, the member exists but has no invite - say exactly that, loudly.
      if (production) {
        const memberId: string | undefined = (body as { member?: { id?: string } })?.member?.id;
        if (memberId) {
          const inviteRes = await fetch(`/api/brain/members/${encodeURIComponent(memberId)}/invites`, {
            method: "POST",
            credentials: "include",
          });
          const inviteBody = await inviteRes.json().catch(() => undefined);
          if (!inviteRes.ok) {
            await queryClient.invalidateQueries({ queryKey: ["/api/brain/members"] });
            setError(
              `${displayName.trim()} was added, but the invite couldn't be issued: ` +
                `${mapApprovalRejection(parseCoreError(inviteBody)).detail} Use "Resend invite" on their row to retry.`,
            );
            return;
          }
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/brain/members"] });
      toast({
        title: production ? "Invite sent" : "Member added",
        description: production
          ? `${displayName.trim()} was invited - they'll appear as Active once they accept.`
          : `${displayName.trim()} can now approve within their authority.`,
      });
      onClose();
    } catch {
      setError("Couldn't reach Brain core. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  const fieldCls =
    "w-full bg-[#222737] rounded-[8px] px-[8px] py-[10px] [font-family:'Gilroy',sans-serif] text-[16px] text-white placeholder:text-[#6c779d] outline-none focus:ring-1 focus:ring-[#7631ee]";

  const inputLabel = (text: string) => (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
      <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full">
        <p className="[word-break:break-word] [font-family:'Gilroy',sans-serif] font-semibold leading-[14px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">{text}</p>
        <div className="flex-[1_0_0] h-px min-w-px bg-[#1d2132] relative" />
      </div>
    </div>
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" data-testid="add-member-backdrop" />
        <DialogPrimitive.Content
          aria-labelledby="add-member-title"
          className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] rounded-[24px] w-[440px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none flex flex-col overflow-hidden"
          data-testid="add-member-dialog"
        >
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-[#1d2132] border-solid h-[56px] relative shrink-0 w-full">
            <p id="add-member-title" className="-translate-x-1/2 [font-family:'Gilroy',sans-serif] font-semibold leading-[24px] absolute left-[calc(50%+0.5px)] not-italic text-[#a8b9f4] text-[20px] text-center top-[calc(50%-12px)] whitespace-nowrap">
              Add Member
            </p>
            <DialogPrimitive.Close aria-label="Close" data-testid="button-add-member-close" className="absolute right-[11px] top-[11px] size-[32px] p-0 hover:opacity-90 transition-opacity">
              <img src={closeIcon} alt="" className="size-[32px]" />
            </DialogPrimitive.Close>
          </div>

          <div className="content-stretch flex flex-col gap-[32px] items-start p-[24px] relative shrink-0 w-full overflow-y-auto">
            <div className="relative shrink-0 w-full">
              <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[24px] items-start relative size-full">
                {/* Name */}
                <div className="content-stretch flex flex-col gap-[8px] items-start relative shrink-0 w-full">
                  {inputLabel("Name")}
                  <input className={fieldCls} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. John Doe" data-testid="input-member-name" />
                </div>
                {/* Email */}
                <div className="content-stretch flex flex-col gap-[8px] items-start relative shrink-0 w-full">
                  {inputLabel("Email")}
                  <input className={fieldCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. john@mail.com" data-testid="input-member-email" />
                </div>
                {/* Role */}
                <div className="content-stretch flex flex-col gap-[8px] items-start relative shrink-0 w-full">
                  {inputLabel("Role")}
                  <div className="content-stretch flex gap-[8px] items-center overflow-clip relative shrink-0 w-full">
                    {(["admin", "approver", "viewer"] as MemberRole[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole(r)}
                        data-testid={`select-role-${r}`}
                        className="content-stretch flex flex-[1_0_0] items-center justify-center min-w-px px-[16px] py-[8px] relative rounded-[100px] [font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[14px] whitespace-nowrap transition-colors"
                        style={{
                          background: role === r ? "#240757" : "#0c0f14",
                          color: role === r ? "#7631ee" : "#414965",
                        }}
                      >
                        {ROLE_LABELS[r]}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Domains */}
                <div className="content-stretch flex flex-col gap-[8px] items-start relative shrink-0 w-full">
                  {inputLabel("Approval Domains")}
                  <div className="content-stretch flex flex-wrap gap-[8px] items-center overflow-clip relative shrink-0 w-full">
                    {ALL_DOMAINS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDomain(d)}
                        data-testid={`toggle-domain-${d}`}
                        className="content-stretch flex items-center justify-center px-[16px] py-[8px] relative rounded-[100px] shrink-0 [font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[14px] whitespace-nowrap transition-colors"
                        style={{
                          background: domains.includes(d) ? "#240757" : "#0c0f14",
                          color: domains.includes(d) ? "#7631ee" : "#414965",
                        }}
                      >
                        {DOMAIN_TITLE[d]}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Limit */}
                <div className="content-stretch flex flex-col gap-[8px] items-start relative shrink-0 w-full">
                  {inputLabel("Per-Item Limit (USD)")}
                  <input
                    className={`${fieldCls} [font-family:'JetBrains_Mono',monospace]`}
                    value={limit}
                    inputMode="numeric"
                    onChange={(e) => setLimit(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="10000"
                    data-testid="input-member-limit"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-[10px] border border-[rgba(210,3,68,0.3)] bg-[rgba(210,3,68,0.08)] p-[12px]" data-testid="text-add-member-error">
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#d20344] text-[13px] leading-[18px]">{error}</p>
              </div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={busy}
              data-testid="button-submit-member"
              className="w-full bg-[#240757] flex items-center justify-center px-[20px] py-[10px] rounded-[100px] [font-family:'Gilroy',sans-serif] font-semibold text-[#7631ee] text-[16px] leading-[20px] hover:bg-[#2e0a6e] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? "Adding…" : "Add Member"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default function TeamSection() {
  const { data, isLoading, isError } = useQuery<ListMembersResponse>({
    queryKey: ["/api/brain/members"],
  });
  const { data: policy } = useQuery<ApprovalPolicyFacts>({
    queryKey: ["/api/brain/approval-policy"],
  });
  const { data: tenancy } = useQuery<TenancyStatus>({
    queryKey: ["/api/brain/tenancy"],
  });
  const production = tenancy?.mode === "production";
  const [addOpen, setAddOpen] = useState(false);

  const members = data?.members ?? [];
  useEffect(() => {
    if (members.length) primeMembers(members);
  }, [members]);

  return (
    <div className="flex flex-col gap-[20px] w-full">
      {/* Header */}
      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]">
        Members
      </p>

      {/* Members list panel */}
      <div className="bg-[#0a0c10] rounded-[16px] p-[16px] flex flex-col gap-[16px]">
        {isLoading && (
          <div className="flex gap-[16px] items-center p-[8px] rounded-[8px]">
            <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">Loading members…</p>
          </div>
        )}
        {isError && (
          <div className="flex gap-[16px] items-center p-[8px] rounded-[8px]">
            <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#d20344] text-[16px]" data-testid="text-members-error">
              Couldn't load your team from Brain core.
            </p>
          </div>
        )}
        {!isLoading && !isError && members.length === 0 && (
          <div className="flex gap-[16px] items-center p-[8px] rounded-[8px]">
            <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">No members yet.</p>
          </div>
        )}
        {members.map((m, i) => (
          <div key={m.id} className="flex flex-col gap-[16px]">
            {i > 0 && <div className="h-px bg-[#1d2132] w-full" />}
            <MemberRow member={m} inviteActions={production} />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        data-testid="button-add-member"
        className="self-start rounded-[100px] bg-[#240757] px-[14px] py-[8px] [font-family:'Gilroy',sans-serif] font-semibold text-[#7631ee] text-[14px] hover:bg-[#2e0a6e] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
      >
        {production ? "+ Invite member" : "+ Add member"}
      </button>

      <AddMemberDialog open={addOpen} onClose={() => setAddOpen(false)} production={production} />
    </div>
  );
}
