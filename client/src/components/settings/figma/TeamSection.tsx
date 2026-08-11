import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  BACKUP_APPROVER_NOTE,
  setBackupApprover,
  useBackupApprovers,
} from "@/lib/backupApprover";
import { openMemberDetail, primeMembers } from "@/lib/membersStore";
import { mapApprovalRejection, parseCoreError } from "@/lib/approvalRejections";
import closeIcon from "@assets/Close_1783293571882.png";
import memberIcon from "@assets/member_1783635675512.png";
import arrowButton from "@assets/Button_1783635877872.png";
import { AlertCallout, MutedCallout } from "@/components/Callout";
import { Button } from "@/components/ui/button";
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
  mode: "production" | "durable" | "demo";
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
      className="px-[8px] py-[3px] rounded-pill [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[14px]"
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
  const backups = useBackupApprovers();
  const isBackup = backups.has(member.id);

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
    <div className="settings-record-item flex flex-col gap-[8px]">
      <button
        type="button"
        onClick={() => openMemberDetail(member.id)}
        data-testid={`row-member-${member.id}`}
        className="settings-record text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-brain-v1baby-blue-30 rounded-[4px]"
      >
        <div className="settings-record-content flex flex-[1_0_0] gap-[8px] items-center min-w-px">
          <div className="shrink-0 size-[40px] rounded-full overflow-hidden">
            <img alt="" className="size-full object-cover" src={memberIcon} />
          </div>
          <div className="settings-record-copy min-w-0 flex flex-col gap-[4px] items-start justify-center">
          <div className="flex flex-wrap gap-[8px] items-center min-w-0">
            <p className="settings-record-title min-w-0">
              {member.displayName}
            </p>
            <RolePill role={member.role} />
            {invited && (
              <span
                className="px-[8px] py-[3px] rounded-pill [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[14px]"
                style={{ background: "rgba(108,119,157,0.1)", color: "#6c779d", border: "1px solid rgba(108,119,157,0.3)" }}
                data-testid={`pill-invited-${member.id}`}
              >
                Invited - awaiting signup
              </span>
            )}
            {isBackup && (
              <span
                className="px-[8px] py-[3px] rounded-pill [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[14px]"
                style={{ background: "rgba(255,149,0,0.1)", color: "#ff9500", border: "1px solid rgba(255,149,0,0.3)" }}
                title={BACKUP_APPROVER_NOTE}
                data-testid={`pill-backup-${member.id}`}
              >
                backup approver
              </span>
            )}
            {!member.active && (
              <span
                className="px-[8px] py-[3px] rounded-pill [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[14px]"
                style={{ background: "rgba(210,3,68,0.12)", color: "#d20344", border: "1px solid rgba(210,3,68,0.3)" }}
              >
                Deactivated
              </span>
            )}
          </div>
          <p className="settings-record-detail" data-testid={`text-envelope-${member.id}`}>
            {envelopeLine(member.approval)}
          </p>
          </div>
        </div>
        <div className="relative rounded-pill shrink-0 size-[40px] overflow-hidden">
          <img alt="" className="absolute inset-0 size-full" src={arrowButton} />
        </div>
      </button>
      <div className="flex flex-wrap gap-[8px] items-center pl-[48px]">
        {invited && inviteActions && (
          <>
            <Button
              variant="primary"
              size="compact"
              disabled={busy !== null}
              onClick={() => inviteCall("resend")}
              data-testid={`button-resend-invite-${member.id}`}
            >
              {busy === "resend" ? "Resending…" : "Resend Invite"}
            </Button>
            <Button
              variant="destructive"
              size="compact"
              disabled={busy !== null}
              onClick={() => inviteCall("revoke")}
              data-testid={`button-revoke-invite-${member.id}`}
            >
              {busy === "revoke" ? "Revoking…" : "Revoke Invite"}
            </Button>
          </>
        )}
      </div>
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
  const [backup, setBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDisplayName(""); setEmail(""); setRole("approver");
      setDomains(["ap"]); setLimit("10000"); setBackup(false); setBusy(false); setError(null);
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
      const memberId: string | undefined = (body as { member?: { id?: string } })?.member?.id;
      /* The member exists from here on, so record the (UI-only) backup mark before
         the invite step below, which has its own early return. */
      if (backup && memberId) setBackupApprover(memberId, true);
      // Production tenancy: issue the invite link for the new member. If this second
      // call fails, the member exists but has no invite - say exactly that, loudly.
      if (production) {
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
    "w-full bg-brain-v1baby-blue-15 rounded-[8px] px-[8px] py-[10px] [font-family:'Gilroy',sans-serif] text-[16px] leading-[20px] text-white placeholder:text-brain-v1baby-blue-60 outline-none focus:ring-1 focus:ring-brain-v1purple";

  const inputLabel = (text: string) => (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
      <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full">
        <p className="[word-break:break-word] [font-family:'Gilroy',sans-serif] font-semibold leading-[20px] not-italic relative shrink-0 text-brain-v1baby-blue-60 text-[14px] whitespace-nowrap">{text}</p>
        <div className="flex-[1_0_0] h-px min-w-px bg-brain-v1stroke-2 relative" />
      </div>
    </div>
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" data-testid="add-member-backdrop" />
        <DialogPrimitive.Content
          aria-labelledby="add-member-title"
          className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-brain-v1baby-blue-5 border border-brain-v1stroke-2 rounded-modal w-[440px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none flex flex-col overflow-hidden"
          data-testid="add-member-dialog"
        >
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-brain-v1stroke-2 border-solid h-[56px] relative shrink-0 w-full">
            <p id="add-member-title" className="-translate-x-1/2 [font-family:'Gilroy',sans-serif] font-semibold leading-[24px] absolute left-[calc(50%+0.5px)] not-italic text-brain-v1baby-blue-100 text-[20px] text-center top-[calc(50%-12px)] whitespace-nowrap">
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
              className="content-stretch flex flex-[1_0_0] items-center justify-center min-w-px px-[16px] py-[8px] relative rounded-pill [font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[14px] whitespace-nowrap transition-colors"
                        style={{
                          background: role === r ? "#240757" : "#0c0f14",
                          color: role === r ? "#7631ee" : "#6c779d",
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
                        className="content-stretch flex items-center justify-center px-[16px] py-[8px] relative rounded-pill shrink-0 [font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[14px] whitespace-nowrap transition-colors"
                        style={{
                          background: domains.includes(d) ? "#240757" : "#0c0f14",
                          color: domains.includes(d) ? "#7631ee" : "#6c779d",
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
                {/* Backup approver — UI-only, and the helper text below says so
                    rather than letting the control imply authority it lacks. */}
                <div className="content-stretch flex flex-col gap-[8px] items-start relative shrink-0 w-full">
                  {inputLabel("Backup Approver?")}
                  <div className="content-stretch flex gap-[8px] items-center overflow-clip relative shrink-0 w-full">
                    {[
                      { v: false, label: "No" },
                      { v: true, label: "Yes" },
                    ].map(({ v, label }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setBackup(v)}
                        data-testid={`select-backup-${label.toLowerCase()}`}
                        className="content-stretch flex flex-[1_0_0] items-center justify-center min-w-px px-[16px] py-[8px] relative rounded-pill [font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[14px] whitespace-nowrap transition-colors"
                        style={{
                          background: backup === v ? "#240757" : "#0c0f14",
                          color: backup === v ? "#7631ee" : "#6c779d",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p
                    className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-brain-v1baby-blue-60 text-[13px]"
                    data-testid="text-backup-unenforced"
                  >
                    {BACKUP_APPROVER_NOTE}
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <AlertCallout testId="text-add-member-error">{error}</AlertCallout>
            )}

            <Button
              variant="warning"
              onClick={submit}
              disabled={busy}
              data-testid="button-submit-member"
              className="w-full"
            >
              {busy ? "Adding…" : "Add Member"}
            </Button>
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
      {/* Header + panel: 4px gap, matching Account subpage */}
      <div className="flex flex-col gap-[4px]">
        <div className="flex items-center min-h-[36px]">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-brain-v1baby-blue-60 text-[16px] leading-[24px]">
            Members
          </p>
        </div>

        <div className="bg-brain-v1highlight-dropdown-bg rounded-panel overflow-hidden flex flex-col">
        <div className="settings-record-list">
        {isLoading && (
          <div className="flex gap-[16px] h-[40px] items-center">
            <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-brain-v1baby-blue-60 text-[16px]">Loading members…</p>
          </div>
        )}
        {isError && (
          <div className="flex gap-[16px] h-[40px] items-center">
            <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-brain-v1pink-red text-[16px]" data-testid="text-members-error">
              Couldn't load team members.
            </p>
          </div>
        )}
        {!isLoading && !isError && members.length === 0 && (
          <div className="flex gap-[16px] h-[40px] items-center">
            <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-brain-v1baby-blue-60 text-[16px]">No members yet.</p>
          </div>
        )}
        {members.map((m) => (
          <MemberRow key={m.id} member={m} inviteActions={production} />
        ))}
        </div>
        </div>
      </div>

      <Button
        variant="primary"
        onClick={() => setAddOpen(true)}
        data-testid="button-add-member"
        className="self-start"
      >
        <Plus className="relative shrink-0 size-[16px] text-brain-v1purple" />
        {production ? "Invite Member" : "Add Member"}
      </Button>

      {/* Escalation — shown for shape, inert in substance.
          Two reasons it cannot be wired: there is no scheduler or notification
          channel to fire on a timer, and the backup approver it would notify is
          itself a UI-only mark. Rendering working-looking dropdowns here would
          promise an escalation that nobody would ever receive, on the exact
          surface where an operator decides whether an item is covered. */}
      <div className="flex flex-col gap-[4px]">
        <div className="flex items-center min-h-[36px]">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-brain-v1baby-blue-60 text-[16px] leading-[24px]">
            Escalation
          </p>
        </div>

        <div className="bg-brain-v1highlight-dropdown-bg rounded-panel overflow-hidden flex flex-col w-full">
          <div className="p-[16px]">
            <MutedCallout
              title="Escalation timers are not active."
              testId="text-escalation-unavailable"
            >
              Brain is propose-only: if the primary approver does not act, nothing ships
              and nothing is escalated. Backup-approver marks are recorded in this
              browser only, so no reminder is sent to anyone today.
            </MutedCallout>
          </div>
          <div className="settings-record-list">
          {[
            {
              id: "urgent",
              title: "Escalate urgent items after",
              detail: "Fraud anomalies and similarly time-sensitive flags.",
              value: "1 hour",
            },
            {
              id: "action-needed",
              title: "Escalate action-needed items after",
              detail: "Payments, collections, treasury, close.",
              value: "4 hours",
            },
          ].map((row) => (
            <div
              key={row.id}
              className="settings-record opacity-40"
              data-testid={`row-escalation-${row.id}`}
              aria-disabled="true"
            >
              <div className="settings-record-copy">
                <p className="settings-record-title">{row.title}</p>
                <p className="settings-record-detail">{row.detail}</p>
              </div>
              <div
                className="shrink-0 rounded-[8px] px-[12px] py-[8px] [font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-60 text-[14px] bg-brain-v1baby-blue-15"
                aria-hidden="true"
              >
                {row.value}
              </div>
            </div>
          ))}
          </div>
        </div>
      </div>

      <AddMemberDialog open={addOpen} onClose={() => setAddOpen(false)} production={production} />
    </div>
  );
}
