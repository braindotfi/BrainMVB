import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { openMemberDetail, primeMembers } from "@/lib/membersStore";
import { mapApprovalRejection, parseCoreError } from "@/lib/approvalRejections";
import closeIcon from "@assets/Close_1783293571882.png";
import {
  ROLE_LABELS,
  envelopeLine,
  formatThreshold,
  type ApprovalDomain,
  type BrainMember,
  type ListMembersResponse,
  type MemberRole,
  type ApprovalPolicyFacts,
} from "@/lib/membersApi";

/* Settings → Team. Members & approval authority, backed by the REAL brain-core API
   through the BFF (member/user-principal token). This page never enforces anything
   itself — it reads and mutates; core is the sole authority and its refusals surface
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
  const color =
    role === "admin" ? "#7631ee" : role === "approver" ? "#a8b9f4" : "#6c779d";
  const bg =
    role === "admin" ? "rgba(118,49,238,0.12)" : role === "approver" ? "rgba(168,185,244,0.1)" : "rgba(108,119,157,0.1)";
  return (
    <span
      className="px-[8px] py-[2px] rounded-[22px] [font-family:'Gilroy',sans-serif] font-semibold text-[11px] leading-[13px]"
      style={{ background: bg, color, border: `1px solid ${color}33` }}
      data-testid={`pill-role-${role}`}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

function MemberRow({ member }: { member: BrainMember }) {
  return (
    <button
      type="button"
      onClick={() => openMemberDetail(member.id)}
      data-testid={`row-member-${member.id}`}
      className="flex items-center gap-[12px] px-[16px] py-[12px] w-full text-left hover:bg-[#0d1018] transition-colors"
    >
      <div className="size-[40px] rounded-full bg-[#161b28] flex items-center justify-center shrink-0">
        <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[16px]">
          {member.displayName.slice(0, 1).toUpperCase()}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-[8px]">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#c8d4f0] text-[15px] leading-[20px] truncate">
            {member.displayName}
          </p>
          <RolePill role={member.role} />
          {!member.active && (
            <span
              className="px-[8px] py-[2px] rounded-[22px] [font-family:'Gilroy',sans-serif] font-semibold text-[11px] leading-[13px]"
              style={{ background: "rgba(210,3,68,0.12)", color: "#d20344", border: "1px solid rgba(210,3,68,0.3)" }}
            >
              Deactivated
            </span>
          )}
        </div>
        <p className="mt-[2px] [font-family:'JetBrains_Mono',monospace] text-[#6c779d] text-[12px] leading-[16px] truncate" data-testid={`text-envelope-${member.id}`}>
          {envelopeLine(member.approval)}
        </p>
      </div>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
        <path d="M5 3L9 7L5 11" stroke="#414965" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function AddMemberDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
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
        }),
      });
      const body = await res.json().catch(() => undefined);
      if (!res.ok) {
        setError(mapApprovalRejection(parseCoreError(body)).detail);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/brain/members"] });
      toast({ title: "Member added", description: `${displayName.trim()} can now approve within their authority.` });
      onClose();
    } catch {
      setError("Couldn't reach Brain core. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const fieldCls =
    "w-full bg-[#0a0c10] border border-[#1d2132] rounded-[10px] px-[12px] py-[10px] [font-family:'Gilroy',sans-serif] text-[15px] text-white placeholder:text-[#414965] outline-none focus:border-[#7631ee]";

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" data-testid="add-member-backdrop" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] rounded-[24px] w-[440px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none flex flex-col"
          data-testid="add-member-dialog"
        >
          <div className="h-[56px] border-b border-[#1d2132] relative shrink-0">
            <DialogPrimitive.Title className="absolute left-1/2 -translate-x-1/2 top-[16px] [font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[20px]">
              Add member
            </DialogPrimitive.Title>
            <DialogPrimitive.Close aria-label="Close" data-testid="button-add-member-close" className="absolute right-[11px] top-[11px] size-[32px] p-0 hover:opacity-90 transition-opacity">
              <img src={closeIcon} alt="" className="size-[32px] rounded-full" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex flex-col gap-[14px] p-[24px] overflow-y-auto">
            <div className="flex flex-col gap-[6px]">
              <label className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]">Name</label>
              <input className={fieldCls} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Jordan Lee" data-testid="input-member-name" />
            </div>
            <div className="flex flex-col gap-[6px]">
              <label className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]">Email</label>
              <input className={fieldCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jordan@company.com" data-testid="input-member-email" />
            </div>
            <div className="flex flex-col gap-[6px]">
              <label className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]">Role</label>
              <div className="flex gap-[8px]">
                {(["admin", "approver", "viewer"] as MemberRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    data-testid={`select-role-${r}`}
                    className="flex-1 rounded-[10px] px-[10px] py-[8px] [font-family:'Gilroy',sans-serif] font-semibold text-[14px] transition-colors"
                    style={{
                      background: role === r ? "rgba(118,49,238,0.15)" : "#0a0c10",
                      color: role === r ? "#a78bfa" : "#6c779d",
                      border: `1px solid ${role === r ? "#7631ee" : "#1d2132"}`,
                    }}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-[6px]">
              <label className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]">Approval domains</label>
              <div className="flex flex-wrap gap-[8px]">
                {ALL_DOMAINS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDomain(d)}
                    data-testid={`toggle-domain-${d}`}
                    className="rounded-[22px] px-[12px] py-[6px] [font-family:'Gilroy',sans-serif] font-semibold text-[13px] transition-colors"
                    style={{
                      background: domains.includes(d) ? "rgba(118,49,238,0.15)" : "#0a0c10",
                      color: domains.includes(d) ? "#a78bfa" : "#6c779d",
                      border: `1px solid ${domains.includes(d) ? "#7631ee" : "#1d2132"}`,
                    }}
                  >
                    {DOMAIN_TITLE[d]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-[6px]">
              <label className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]">Per-item limit (USD)</label>
              <input
                className={`${fieldCls} [font-family:'JetBrains_Mono',monospace]`}
                value={limit}
                inputMode="numeric"
                onChange={(e) => setLimit(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="10000"
                data-testid="input-member-limit"
              />
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
              className="mt-[4px] rounded-[100px] bg-[#7631ee] hover:bg-[#8544ff] disabled:opacity-40 disabled:cursor-not-allowed px-[20px] py-[11px] [font-family:'Gilroy',sans-serif] font-semibold text-white text-[16px] transition-colors"
            >
              {busy ? "Adding…" : "Add member"}
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
  const [addOpen, setAddOpen] = useState(false);

  const members = data?.members ?? [];
  useEffect(() => {
    if (members.length) primeMembers(members);
  }, [members]);

  return (
    <div className="flex flex-col gap-[20px] w-full">
      {/* Header */}
      <div className="flex flex-col gap-[4px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#7631ee] text-[13px] uppercase tracking-[0.08em]">
          Your Team
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-semibold text-white text-[22px] leading-[28px]">
          Who can approve, and up to how much.
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[15px] leading-[20px]">
          Authority is enforced by Brain core on every surface — this page manages it.
        </p>
      </div>

      {/* Tenant approval facts (read from core's policy) */}
      {policy?.secondApprovalThreshold && (
        <div className="rounded-[12px] border border-[#1d2132] bg-[#0a0c10] px-[16px] py-[12px]" data-testid="text-tenant-threshold">
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px] leading-[18px]">
            Payments over{" "}
            <span className="[font-family:'JetBrains_Mono',monospace] text-[#a8b9f4]">
              {formatThreshold(policy.secondApprovalThreshold)}
            </span>{" "}
            require a second approver, tenant-wide.
          </p>
        </div>
      )}

      {/* Members list */}
      <div className="rounded-[16px] border border-[#1d2132] overflow-hidden" style={{ background: "#0a0c10" }}>
        <div className="flex items-center justify-between px-[16px] py-[12px] border-b border-[#1d2132]">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[16px]">Members</p>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            data-testid="button-add-member"
            className="rounded-[100px] bg-[rgba(118,49,238,0.15)] border border-[#7631ee] px-[14px] py-[6px] [font-family:'Gilroy',sans-serif] font-semibold text-[#a78bfa] text-[14px] hover:bg-[rgba(118,49,238,0.25)] transition-colors"
          >
            + Add member
          </button>
        </div>

        {isLoading && (
          <div className="px-[16px] py-[24px]">
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[15px]">Loading members…</p>
          </div>
        )}
        {isError && (
          <div className="px-[16px] py-[24px]">
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#d20344] text-[15px]" data-testid="text-members-error">
              Couldn't load your team from Brain core.
            </p>
          </div>
        )}
        {!isLoading && !isError && members.length === 0 && (
          <div className="px-[16px] py-[24px]">
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[15px]">No members yet.</p>
          </div>
        )}
        {members.map((m, i) => (
          <div key={m.id}>
            {i > 0 && <div className="h-px bg-[#1d2132] mx-[16px]" />}
            <MemberRow member={m} />
          </div>
        ))}
      </div>

      <AddMemberDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
