import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Clock, ShieldQuestion, Loader } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  NEEDS_REVIEW,
  ReviewModal,
  type ReviewItemType,
} from "@/components/ReviewItems";
import { ProposalDetail, type ProposalAction } from "@/components/ProposalDetail";
import { MOCK_PROPOSALS, ACCOUNT_SUMMARY } from "@/lib/mockProposals";
import type { Proposal, ProposalStatus } from "@/lib/proposalTypes";
import { useCurrency } from "@/lib/currencyContext";
import { useIntents, type IntentRecord } from "@/lib/intentsStore";
import { apiRequest } from "@/lib/queryClient";

/* ── Convert legacy static demo items into full Proposal shape so they
   render through the same ProposalDetail sheet (confidence, evidence,
   policy trace, rationale, etc.) ─────────────────────────────────────────── */
function legacyToProposal(item: ReviewItemType): Proposal {
  const amountNum = parseFloat(item.amountFull.replace(/[$,]/g, ""));
  return {
    id: `legacy-${item.id}`,
    auditId: `rut-${item.id}`,
    agent: "invoice",
    surface: "business",
    title: item.title,
    rowSubtitle: item.vendor ? `${item.vendor} \u00b7 ${item.due}` : item.due,
    actionStatement: item.question,
    actionMeta: `from ${item.from} \u00b7 ${item.dueBy}`,
    executionLabel: "ACH settles next business day",
    cancelDeadlineLabel: "cancel until 5:00 PM ET",
    amount: amountNum,
    amountDisplay: item.amount,
    counterparty: item.who,
    dueLabel: item.dueBy,
    severity: "clean",
    reasonChips: [{ label: "Looks routine", severity: "clean" }],
    rationale: item.description,
    facts: [
      { label: "vendor", value: item.who },
      { label: "amount", value: item.amountFull },
      { label: "due by", value: item.dueBy },
      { label: "from account", value: item.from },
      { label: "auto policy", value: item.autoLabel },
    ],
    evidence: [
      {
        kind: "prior_payment",
        title: "Matched 12 prior payments",
        subtitle: "Same vendor, same amount, same cadence",
      },
      {
        kind: "contract",
        title: "Routine Payment Policy \u00a74.2",
        subtitle: "Auto-cleared: vendor + amount + cadence match",
      },
    ],
    confidence: {
      score: 0.98,
      band: "high",
      caveat: "Pattern-matched against 12 months of history. No flags.",
    },
    whatHappensNext:
      "If you approve, this will settle via ACH next business day. You can cancel until 5:00 PM ET today.",
    risk: "If this is wrong, you can reverse the ACH within 24 hours. Risk: low \u2014 vendor and amount match 12-month pattern.",
    policy: {
      id: "routine-payment",
      explanation:
        "Auto-cleared under Routine Payment Policy \u00a74.2 (vendor + amount + cadence match)",
      autoClearedOtherwise: true,
    },
    actions: {
      approve: {
        label: "Approve",
        sublabel: "Settles next business day",
      },
      reject: {
        label: "Reject",
        sublabel: "Stop this payment",
      },
      postpone: {
        label: "Postpone",
        sublabel: "Review again tomorrow",
      },
    },
    status: "pending",
    batchApprovable: true,
  };
}

/* ── Live brain-core PaymentIntents (real, gated approvals) ──────────────── */
function intentToReview(rec: IntentRecord): ReviewItemType {
  const amountStr = `$${rec.amount.toLocaleString()}`;
  const approvers = rec.requiredApprovers.length > 0 ? rec.requiredApprovers.join(" + ") : "owner + CFO";
  return {
    id: rec.intentId,
    live: true,
    intentId: rec.intentId,
    title: `Approve payment to ${rec.vendor}?`,
    vendor: rec.vendor,
    amount: amountStr,
    due: "Needs approval",
    question: `Should I pay ${rec.vendor} ${amountStr}?`,
    description: `Brain proposed this payment (${rec.invoiceNumber}) and the §6 policy gate flagged it for human sign-off — it is above your auto-pay limit and needs approval from ${approvers} before it can settle.`,
    who: rec.vendor,
    amountFull: amountStr,
    dueBy: "Awaiting approval",
    from: "Brain Smart Account",
    autoLabel: "Always require approval for large payments",
  };
}

/* ── Shared primitives (match Finances/Rules widgets) ────────────────────── */
const Divider = () => <div className="h-px shrink-0 w-full" style={{ background: "#1d2132" }} />;

const WidgetHeader = ({ title, count }: { title: string; count?: number }) => (
  <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
    <div className="flex flex-1 gap-[8px] items-center min-w-px relative">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px] whitespace-nowrap">{title}</p>
      {typeof count === "number" && (
        <div className="bg-[#414965] flex flex-col items-center justify-center min-w-[16px] p-[2px] relative rounded-[4px] shrink-0">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[12px] text-[#a8b9f4] text-[12px] text-center whitespace-nowrap">{count}</p>
        </div>
      )}
    </div>
  </div>
);

/* ── Pending / verifying proposal row (tappable → opens detail) ──────────── */
const ProposalRow = ({
  proposal,
  status,
  onClick,
  format,
}: {
  proposal: Proposal;
  status: ProposalStatus;
  onClick: () => void;
  format: (a: string | number) => string;
}) => {
  const parked = status === "verifying";
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      data-testid={`row-proposal-${proposal.id}`}
      className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer outline-none focus-visible:border-[#1d2132]"
    >
      {proposal.severity === "danger" && (
        <div className="w-[3px] self-stretch rounded-full bg-[#d20344] shrink-0" />
      )}
      <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] truncate w-full">
          {proposal.title}
        </p>
        <p className={`[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[14px] truncate w-full ${parked ? "text-[#7631ee]" : "text-[#6c779d]"}`}>
          {parked ? "Verifying with vendor — draft ready for review" : proposal.rowSubtitle}
        </p>
      </div>
      {typeof proposal.amount === "number" && (
        <div className="flex flex-col items-end justify-center relative shrink-0">
          <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#a8b9f4] text-[18px] text-right whitespace-nowrap">
            {format(proposal.amount)}
          </p>
        </div>
      )}
    </div>
  );
};

/* ── Executing row — HELD confirmation state with manual Cancel / Mark settled ── */
const ExecutingRow = ({
  proposal,
  onCancel,
  onSettle,
  format,
}: {
  proposal: Proposal;
  onCancel: () => void;
  onSettle: () => void;
  format: (a: string | number) => string;
}) => (
  <div
    data-testid={`row-executing-${proposal.id}`}
    className="flex flex-col gap-[10px] p-[12px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-[#1d2132]"
  >
    <div className="flex gap-[12px] items-center w-full">
      {/* static processing affordance — no spin that implies auto-progress */}
      <Loader size={16} className="text-[#7631ee] shrink-0" />
      <div className="flex flex-1 flex-col min-w-px">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[15px] truncate">
          {proposal.title}
        </p>
        <p className="[font-family:'JetBrains_Mono',monospace] leading-[16px] text-[#7631ee] text-[12px] truncate">
          Sent to execution · {proposal.cancelDeadlineLabel}
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[12px] truncate">
          {proposal.executionLabel}
        </p>
      </div>
      {typeof proposal.amount === "number" && (
        <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#a8b9f4] text-[16px] shrink-0">
          {format(proposal.amount)}
        </p>
      )}
    </div>
    <div className="flex gap-[8px] w-full">
      <button
        type="button"
        onClick={onCancel}
        data-testid={`button-cancel-${proposal.id}`}
        className="flex-1 px-[12px] py-[8px] rounded-[100px] bg-[#1d2132] hover:bg-[#252a3d] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[13px] text-[#a8b9f4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965]"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSettle}
        data-testid={`button-settle-${proposal.id}`}
        className="flex-1 px-[12px] py-[8px] rounded-[100px] bg-[#240757] border border-[rgba(118,49,238,0.3)] hover:bg-[#2e0a6b] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[13px] text-[#7631ee] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
      >
        Mark settled
      </button>
    </div>
  </div>
);

/* ── Collapsed settled/rejected/postponed row ────────────────────────────── */
const SETTLED_META: Record<string, { icon: typeof CheckCircle2; color: string; label: (p: Proposal) => string }> = {
  executed: { icon: CheckCircle2, color: "#42bf23", label: (p) => `Executed · ${p.auditId}` },
  rejected: { icon: XCircle, color: "#d20344", label: () => "Rejected" },
  postponed: { icon: Clock, color: "#6c779d", label: () => "Postponed to tomorrow" },
};

const SettledRow = ({ proposal, status }: { proposal: Proposal; status: ProposalStatus }) => {
  const meta = SETTLED_META[status];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <div
      data-testid={`row-settled-${proposal.id}`}
      className="flex gap-[10px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full"
    >
      <Icon size={15} style={{ color: meta.color }} className="shrink-0" />
      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#6c779d] text-[14px] truncate flex-1 min-w-px">
        {proposal.title}
      </p>
      <p className="[font-family:'JetBrains_Mono',monospace] leading-[16px] text-[12px] shrink-0" style={{ color: meta.color }}>
        {meta.label(proposal)}
      </p>
    </div>
  );
};

/* ── Page ────────────────────────────────────────────────────────────────── */
export function ReviewPage() {
  const { format } = useCurrency();
  const { intents, markDeclined } = useIntents();

  /* Status overrides keyed by proposal id. Every transition is user-driven —
     no setTimeout / auto-settle anywhere. */
  const [statuses, setStatuses] = useState<Record<string, ProposalStatus>>({});
  const [active, setActive] = useState<Proposal | null>(null);

  const statusOf = (p: Proposal): ProposalStatus => statuses[p.id] ?? p.status;
  const setStatus = (id: string, status: ProposalStatus) =>
    setStatuses((prev) => ({ ...prev, [id]: status }));

  const pending = MOCK_PROPOSALS.filter((p) => statusOf(p) === "pending");
  const verifying = MOCK_PROPOSALS.filter((p) => statusOf(p) === "verifying");
  const executing = MOCK_PROPOSALS.filter((p) => statusOf(p) === "executing");
  const settled = MOCK_PROPOSALS.filter((p) =>
    ["executed", "rejected", "postponed"].includes(statusOf(p)),
  );
  const queue = [...pending, ...verifying];

  const handleAction = (action: ProposalAction) => {
    if (!active) return;
    const next: ProposalStatus =
      action === "approve" ? "executing"
        : action === "reject" ? "rejected"
          : action === "postpone" ? "postponed"
            : "verifying";
    setStatus(active.id, next);
    setActive(null); // sheet closes on any action
  };

  /* Live brain-core PaymentIntents flagged by the §6 gate. */
  const liveReviews = intents.filter((i) => i.outcome === "confirm" && !i.declined).map(intentToReview);
  const [activeLive, setActiveLive] = useState<ReviewItemType | null>(null);
  const reject = useMutation<unknown, Error, string>({
    mutationFn: async (intentId: string) => {
      const res = await apiRequest("POST", "/api/brain/reject", { payment_intent_id: intentId, reason: "Declined by operator" });
      return res.json();
    },
    onSuccess: (_d, intentId) => markDeclined(intentId),
  });
  const handleLiveReject = () => {
    if (activeLive?.live && activeLive.intentId) reject.mutate(activeLive.intentId);
    setActiveLive(null);
  };

  /* Static legacy demo items — converted into full Proposal shape so they
     open in the same ProposalDetail sheet as the mock scenarios. */
  const legacyProposals = useMemo(() => NEEDS_REVIEW.map(legacyToProposal), []);

  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[32px] items-start pb-[16px] pt-[40px] px-[16px] w-full">

          {/* Header */}
          <div className="flex flex-col items-start relative shrink-0 w-full">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#6c779d] text-[20px] whitespace-nowrap">Your Review</p>
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] text-[#a8b9f4] text-[32px]">A few things I need your help on.</p>
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#414965] text-[16px]">Take a quick look and decide what should happen next.</p>
          </div>

          <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">

            {/* Auto-handled today — collapsed summary line (exception-only routing) */}
            <div
              className="flex items-center gap-[10px] px-[12px] py-[10px] rounded-[8px] w-full bg-[#0a0c10] border border-[#1d2132]"
              data-testid="row-auto-handled"
            >
              <CheckCircle2 size={16} className="text-[#42bf23] shrink-0" />
              <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#6c779d] text-[14px] min-w-px">
                Brain auto-handled{" "}
                <span className="text-[#a8b9f4] font-semibold">{ACCOUNT_SUMMARY.autoHandledCount} routine payments</span>{" "}
                today under policy without asking.
              </p>
              <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[18px] text-[#a8b9f4] text-[14px] shrink-0">
                {format(ACCOUNT_SUMMARY.autoHandledTotal)}
              </p>
            </div>

            {/* Live — real brain-core PaymentIntents flagged by §6 (only when present) */}
            {liveReviews.length > 0 && (
              <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
                <WidgetHeader title="Needs your approval" count={liveReviews.length} />
                <div className="flex flex-col gap-[8px] items-start p-[8px] relative shrink-0 w-full">
                  {liveReviews.map((item) => (
                    <LiveRow key={item.id} item={item} onClick={() => setActiveLive(item)} format={format} />
                  ))}
                </div>
              </div>
            )}

            {/* Needs Review — the data-driven proposal queue */}
            <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
              <WidgetHeader title="Needs Review" count={queue.length} />
              <div className="flex flex-col gap-[8px] items-start p-[8px] relative shrink-0 w-full">
                {queue.length === 0 && executing.length === 0 && (
                  <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px] p-[8px]">
                    Nothing left to review. You're all caught up.
                  </p>
                )}

                {queue.map((p, idx) => (
                  <div key={p.id} className="flex flex-col gap-[8px] w-full">
                    <ProposalRow proposal={p} status={statusOf(p)} onClick={() => setActive(p)} format={format} />
                    {idx < queue.length - 1 && <Divider />}
                  </div>
                ))}

                {/* Executing — held confirmation rows */}
                {executing.map((p) => (
                  <div key={p.id} className="flex flex-col gap-[8px] w-full">
                    {queue.length > 0 && <Divider />}
                    <ExecutingRow
                      proposal={p}
                      onCancel={() => setStatus(p.id, "pending")}
                      onSettle={() => setStatus(p.id, "executed")}
                      format={format}
                    />
                  </div>
                ))}

                {/* Account Totals — pendingAPTotal reconciles from the AP proposals */}
                <Divider />
                <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10]" data-testid="row-account-totals">
                  <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">Account Totals</p>
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px]">
                      {format(ACCOUNT_SUMMARY.totalCash)} cash · about {ACCOUNT_SUMMARY.runwayMonths} months runway
                    </p>
                  </div>
                  <div className="flex flex-col items-end justify-center relative shrink-0">
                    <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#a8b9f4] text-[18px] text-right whitespace-nowrap" data-testid="text-pending-ap">
                      {format(ACCOUNT_SUMMARY.pendingAPTotal)}
                    </p>
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#414965] text-[12px] whitespace-nowrap">pending AP</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Helper banner — purple */}
            <div className="bg-[#240757] border border-[rgba(118,49,238,0.2)] border-solid flex items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
              <div className="flex flex-1 items-start min-w-px relative">
                <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#7631ee] text-[14px]">
                  Tap any item to see why Brain suggested it, what happens next, and what the risk is before you approve anything. Brain proposes — you decide, and a separate execution service settles.
                </p>
              </div>
            </div>

            {/* Settled today — collapsed executed/rejected/postponed */}
            {settled.length > 0 && (
              <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
                <WidgetHeader title="Settled today" count={settled.length} />
                <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
                  {settled.map((p) => (
                    <SettledRow key={p.id} proposal={p} status={statusOf(p)} />
                  ))}
                </div>
              </div>
            )}

            {/* Routine Approvals — legacy items rendered through ProposalDetail */}
            <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
              <WidgetHeader title="Routine Approvals" count={legacyProposals.length} />
              <div className="flex flex-col gap-[8px] items-start p-[8px] relative shrink-0 w-full">
                {legacyProposals.map((p, idx) => (
                  <div key={p.id} className="flex flex-col gap-[8px] w-full">
                    <ProposalRow proposal={p} status={statusOf(p)} onClick={() => setActive(p)} format={format} />
                    {idx < legacyProposals.length - 1 && <Divider />}
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </ScrollArea>

      {/* Data-driven proposal sheet */}
      <ProposalDetail
        proposal={active}
        currentStatus={active ? statusOf(active) : undefined}
        open={active !== null}
        onOpenChange={(o) => { if (!o) setActive(null); }}
        onAction={handleAction}
      />

      {/* Legacy / live approval modal */}
      <ReviewModal
        item={activeLive}
        open={activeLive !== null}
        onOpenChange={(o) => { if (!o) setActiveLive(null); }}
        onConfirm={() => setActiveLive(null)}
        onReject={handleLiveReject}
      />
    </div>
  );
}

/* Row used for both live PaymentIntents and legacy static demo items. */
const LiveRow = ({ item, onClick, format }: { item: ReviewItemType; onClick: () => void; format: (a: string | number) => string }) => (
  <div
    onClick={onClick}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
    data-testid={`row-review-${item.id}`}
    className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer outline-none focus-visible:border-[#1d2132]"
  >
    <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] truncate w-full">{item.title}</p>
      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px] truncate w-full">
        {item.vendor ? `${item.vendor} · ${item.due}` : item.due}
      </p>
    </div>
    <div className="flex flex-col items-end justify-center relative shrink-0">
      <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#a8b9f4] text-[18px] text-right whitespace-nowrap">{format(item.amount)}</p>
    </div>
  </div>
);
