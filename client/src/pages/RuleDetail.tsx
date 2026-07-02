import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Flag,
  ShieldCheck,
  Pause,
  Play,
  Trash2,
  ChevronDown,
  ReceiptText,
  AlertTriangle,
  Pencil,
} from "lucide-react";
import { useRule, pauseRule, resumeRule, removeVendor, lowerCap, setThreshold, deleteRule } from "@/lib/rulesStore";
import { AUTO_HANDLED_PROPOSALS } from "@/lib/mockProposals";
import { useCurrency } from "@/lib/currencyContext";
import type { ProblemReport } from "@/lib/proposalTypes";

const ALERT = "#d20344";

/* ── Rule detail — the destination of "Report a problem → pause and review".
   #D20344 is reserved for problem/alert accents ONLY; affirmative actions use
   purple #7631ee. Amounts / dates / policy ids render monospace. ──────────── */
export function RuleDetail() {
  const [, params] = useRoute("/rules/:id");
  const [, navigate] = useLocation();
  const { format } = useCurrency();
  const rule = useRule(params?.id);

  const [confirmingResume, setConfirmingResume] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showCapEditor, setShowCapEditor] = useState(false);
  const [capDraft, setCapDraft] = useState("");
  const [showAmountEditor, setShowAmountEditor] = useState(false);
  const [amountDraft, setAmountDraft] = useState("");

  if (!rule) {
    return (
      <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col items-center justify-center gap-[16px] p-[24px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[18px]">
          This rule no longer exists.
        </p>
        <button
          type="button"
          onClick={() => navigate("/rules")}
          data-testid="button-back-to-rules"
          className="flex items-center gap-[8px] px-[16px] py-[10px] rounded-[100px] bg-[#240757] border border-[rgba(118,49,238,0.35)] hover:bg-[#2e0a6b] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#7631ee]"
        >
          <ArrowLeft size={16} /> Back to rules
        </button>
      </div>
    );
  }

  const reports = rule.problemReports ?? [];
  const openReports = reports.filter((r) => !r.resolved);
  const pausedFromReport = !rule.active && openReports.length > 0;
  const latestOpen = openReports[openReports.length - 1];
  /* The receipt that triggered the most recent open report — the linked payment. */
  const linkedPayment = latestOpen
    ? AUTO_HANDLED_PROPOSALS.find((p) => p.id === latestOpen.proposalId)
    : undefined;

  const openReceipt = (proposalId: string) => navigate(`/review?receipt=${proposalId}`);

  const onResume = () => {
    resumeRule(rule.id);
    setConfirmingResume(false);
  };
  const onDelete = () => {
    deleteRule(rule.id);
    navigate("/rules");
  };
  const onLowerCap = () => {
    const next = Number(capDraft.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(next) && next > 0) {
      lowerCap(rule.id, Math.round(next));
      setShowCapEditor(false);
      setCapDraft("");
    }
  };
  const onSaveAmount = () => {
    const next = Number(amountDraft.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(next) && next > 0) {
      setThreshold(rule.id, Math.round(next));
      setShowAmountEditor(false);
      setAmountDraft("");
    }
  };
  const amountMeta =
    rule.kind === "guardrail"
      ? { label: "Approval threshold", help: "Brain checks with you before any payment over this amount." }
      : { label: "Trigger amount", help: "Brain acts when the balance crosses this amount." };

  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[24px] items-start pb-[24px] pt-[32px] px-[16px] w-full">

          {/* Back + header */}
          <div className="flex flex-col gap-[12px] items-start w-full">
            <button
              type="button"
              onClick={() => navigate("/rules")}
              data-testid="button-back-to-rules"
              className="flex items-center gap-[6px] [font-family:'Gilroy',sans-serif] font-semibold text-[13px] text-[#6c779d] hover:text-[#a8b9f4] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965] rounded-[100px] px-[4px] py-[2px]"
            >
              <ArrowLeft size={15} /> Rules
            </button>

            <div className="flex items-start gap-[12px] w-full">
              <div className="flex flex-col gap-[6px] flex-1 min-w-px">
                <div className="flex items-center gap-[10px] flex-wrap">
                  <p
                    className="[font-family:'Gilroy',sans-serif] font-semibold leading-[32px] text-[#a8b9f4] text-[26px]"
                    data-testid="text-rule-name"
                  >
                    {rule.name}
                  </p>
                  <StatusPill active={rule.active} />
                </div>
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px]">
                  {rule.summary}
                </p>
                <p className="[font-family:'JetBrains_Mono',monospace] leading-[18px] text-[#414965] text-[12px]" data-testid="text-rule-policy-id">
                  {rule.policyId} · {rule.createdLabel}
                </p>
              </div>
            </div>
          </div>

          {/* Paused-from-report banner — #D20344 accent, with the linked payment. */}
          {pausedFromReport && (
            <div
              className="w-full rounded-[12px] p-[16px] flex flex-col gap-[12px]"
              style={{ backgroundColor: "rgba(210,3,68,0.08)", border: `1px solid rgba(210,3,68,0.3)` }}
              data-testid="banner-paused-from-report"
            >
              <div className="flex items-start gap-[10px]">
                <Flag size={18} className="shrink-0 mt-[1px]" style={{ color: ALERT }} />
                <div className="flex flex-col gap-[4px]">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[15px]" style={{ color: ALERT }}>
                    Paused after you reported a problem
                  </p>
                  <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#a8b9f4] text-[13px]">
                    You flagged “{latestOpen?.reason}” on a payment this rule cleared. It won’t auto-clear anything new until you resume it.
                  </p>
                </div>
              </div>

              {linkedPayment && (
                <button
                  type="button"
                  onClick={() => openReceipt(linkedPayment.id)}
                  data-testid="button-linked-payment"
                  className="flex items-center gap-[10px] w-full rounded-[10px] bg-[#0a0c10] border border-[#1d2132] px-[12px] py-[10px] hover:border-[rgba(210,3,68,0.4)] transition-colors text-left focus:outline-none focus-visible:ring-2"
                  style={{ ["--tw-ring-color" as string]: ALERT }}
                >
                  <ReceiptText size={16} className="shrink-0 text-[#6c779d]" />
                  <div className="flex flex-col flex-1 min-w-px">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[18px] text-[#a8b9f4] text-[13px] truncate">
                      {linkedPayment.counterparty ?? linkedPayment.title}
                    </p>
                    {linkedPayment.settledMeta && (
                      <p className="[font-family:'JetBrains_Mono',monospace] leading-[16px] text-[#6c779d] text-[11px] truncate">
                        {linkedPayment.settledMeta}
                      </p>
                    )}
                  </div>
                  {typeof linkedPayment.amount === "number" && (
                    <span className="[font-family:'JetBrains_Mono',monospace] text-[13px] text-[#a8b9f4] shrink-0">
                      {format(linkedPayment.amount)}
                    </span>
                  )}
                </button>
              )}
            </div>
          )}

          {/* What changed — plain-language status line. */}
          <div className="w-full rounded-[12px] bg-[#0a0c10] border border-[#1d2132] p-[14px] flex items-start gap-[10px]" data-testid="text-what-changed">
            <AlertTriangle
              size={16}
              className="shrink-0 mt-[1px]"
              style={{ color: rule.active ? "#6c779d" : ALERT }}
            />
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[13px] text-[#a8b9f4]">
              {rule.active ? (
                <>
                  This rule is <span className="font-semibold text-[#42bf23]">active</span> — it auto-clears {rule.scopeSummary ?? "matching payments"} without asking you.
                </>
              ) : (
                <>
                  This rule is <span className="font-semibold" style={{ color: ALERT }}>paused</span> — payments it used to auto-clear ({rule.scopeSummary ?? "matching payments"}) will now wait for your approval in Needs Review.
                </>
              )}
            </p>
          </div>

          {/* Active / Paused toggle — resume needs confirm. */}
          <div className="w-full rounded-[12px] bg-[#0a0c10] border border-[#1d2132] p-[14px] flex flex-col gap-[12px]">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[18px] text-[#a8b9f4] text-[14px]">
              Rule status
            </p>

            {!confirmingResume ? (
              <button
                type="button"
                onClick={() => (rule.active ? pauseRule(rule.id) : setConfirmingResume(true))}
                data-testid="button-toggle-rule"
                className={`flex w-full items-center justify-center gap-[8px] px-[16px] py-[11px] rounded-[100px] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[14px] focus:outline-none focus-visible:ring-2 ${
                  rule.active
                    ? "bg-[#1d2132] hover:bg-[#252a3d] text-[#a8b9f4] focus-visible:ring-[#414965]"
                    : "bg-[#7631ee] hover:bg-[#8a4bf5] text-white focus-visible:ring-[#7631EE]"
                }`}
              >
                {rule.active ? <Pause size={16} /> : <Play size={16} />}
                {rule.active ? "Pause this rule" : "Resume this rule"}
              </button>
            ) : (
              <div className="flex flex-col gap-[10px]">
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#6c779d] text-[13px]">
                  Resuming lets this rule auto-clear {rule.scopeSummary ?? "matching payments"} again without asking. Make sure you’ve resolved what you reported first.
                </p>
                <div className="flex gap-[10px] items-stretch w-full">
                  <button
                    type="button"
                    onClick={() => setConfirmingResume(false)}
                    data-testid="button-resume-cancel"
                    className="flex-1 px-[12px] py-[9px] rounded-[100px] bg-[#1d2132] hover:bg-[#252a3d] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[13px] text-[#a8b9f4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965]"
                  >
                    Keep paused
                  </button>
                  <button
                    type="button"
                    onClick={onResume}
                    data-testid="button-resume-confirm"
                    className="flex-1 px-[12px] py-[9px] rounded-[100px] bg-[#7631ee] hover:bg-[#8a4bf5] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[13px] text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                  >
                    Resume rule
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Amount editor — the guardrail approval threshold / automation trigger
              amount. Moved here from the inline row pill so the amount is edited on
              the rule's own page. */}
          {typeof rule.threshold === "number" && (
            <div className="w-full rounded-[12px] bg-[#0a0c10] border border-[#1d2132] p-[14px] flex flex-col gap-[12px]">
              <div className="flex items-start justify-between gap-[12px]">
                <div className="flex flex-col gap-[2px] min-w-px">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[18px] text-[#a8b9f4] text-[14px]">
                    {amountMeta.label}
                  </p>
                  <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[12px]">
                    {amountMeta.help}
                  </p>
                </div>
                <span
                  className="[font-family:'JetBrains_Mono',monospace] text-[15px] text-[#a8b9f4] shrink-0"
                  data-testid="text-rule-threshold"
                >
                  {format(rule.threshold)}
                </span>
              </div>
              {!showAmountEditor ? (
                <button
                  type="button"
                  onClick={() => { setShowAmountEditor(true); setAmountDraft(String(rule.threshold)); }}
                  data-testid="button-edit-amount"
                  className="self-start flex items-center gap-[6px] px-[12px] py-[7px] rounded-[100px] bg-[#1d2132] hover:bg-[#252a3d] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#a8b9f4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965]"
                >
                  <Pencil size={13} /> Edit amount
                </button>
              ) : (
                <div className="flex gap-[8px] items-center">
                  <input
                    value={amountDraft}
                    autoFocus
                    inputMode="numeric"
                    onChange={(e) => setAmountDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onSaveAmount();
                      if (e.key === "Escape") { setShowAmountEditor(false); setAmountDraft(""); }
                    }}
                    data-testid="input-amount"
                    className="flex-1 rounded-[8px] bg-[#06070a] border border-[#1d2132] px-[12px] py-[8px] [font-family:'JetBrains_Mono',monospace] text-[13px] text-[#a8b9f4] focus:outline-none focus-visible:border-[rgba(118,49,238,0.5)]"
                  />
                  <button
                    type="button"
                    onClick={() => { setShowAmountEditor(false); setAmountDraft(""); }}
                    data-testid="button-amount-cancel"
                    className="px-[12px] py-[8px] rounded-[100px] bg-[#1d2132] hover:bg-[#252a3d] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#a8b9f4]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onSaveAmount}
                    data-testid="button-amount-save"
                    className="px-[12px] py-[8px] rounded-[100px] bg-[#7631ee] hover:bg-[#8a4bf5] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-white"
                  >
                    Save
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Remediations — narrow the rule instead of nuking it. */}
          <div className="w-full rounded-[12px] bg-[#0a0c10] border border-[#1d2132] p-[14px] flex flex-col gap-[14px]">
            <div className="flex items-center gap-[8px]">
              <ShieldCheck size={16} className="text-[#7631ee] shrink-0" />
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[18px] text-[#a8b9f4] text-[14px]">
                Tighten this rule
              </p>
            </div>

            {/* Allowlist — remove a vendor */}
            {rule.allowlist && rule.allowlist.length > 0 && (
              <div className="flex flex-col gap-[8px]">
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[12px]">
                  Trusted vendors
                </p>
                <div className="flex flex-col gap-[6px]">
                  {rule.allowlist.map((vendor) => (
                    <div
                      key={vendor}
                      className="flex items-center gap-[8px] rounded-[8px] bg-[#06070a] border border-[#1d2132] px-[12px] py-[8px]"
                      data-testid={`row-vendor-${vendor.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}
                    >
                      <span className="flex-1 [font-family:'Gilroy',sans-serif] font-medium text-[13px] text-[#a8b9f4] truncate">
                        {vendor}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeVendor(rule.id, vendor)}
                        data-testid={`button-remove-vendor-${vendor.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}
                        className="px-[10px] py-[5px] rounded-[100px] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[12px] focus:outline-none focus-visible:ring-2"
                        style={{ backgroundColor: "rgba(210,3,68,0.1)", color: ALERT, ["--tw-ring-color" as string]: ALERT }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cap — lower it */}
            {typeof rule.cap === "number" && (
              <div className="flex flex-col gap-[8px]">
                <div className="flex items-center justify-between">
                  <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[12px]">
                    Auto-clear cap
                  </p>
                  <span className="[font-family:'JetBrains_Mono',monospace] text-[13px] text-[#a8b9f4]" data-testid="text-rule-cap">
                    {format(rule.cap)}
                  </span>
                </div>
                {!showCapEditor ? (
                  <button
                    type="button"
                    onClick={() => { setShowCapEditor(true); setCapDraft(String(rule.cap)); }}
                    data-testid="button-lower-cap"
                    className="self-start px-[12px] py-[7px] rounded-[100px] bg-[#1d2132] hover:bg-[#252a3d] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#a8b9f4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965]"
                  >
                    Lower the cap
                  </button>
                ) : (
                  <div className="flex gap-[8px] items-center">
                    <input
                      value={capDraft}
                      onChange={(e) => setCapDraft(e.target.value)}
                      inputMode="numeric"
                      data-testid="input-cap"
                      className="flex-1 rounded-[8px] bg-[#06070a] border border-[#1d2132] px-[12px] py-[8px] [font-family:'JetBrains_Mono',monospace] text-[13px] text-[#a8b9f4] focus:outline-none focus-visible:border-[rgba(118,49,238,0.5)]"
                    />
                    <button
                      type="button"
                      onClick={() => { setShowCapEditor(false); setCapDraft(""); }}
                      data-testid="button-cap-cancel"
                      className="px-[12px] py-[8px] rounded-[100px] bg-[#1d2132] hover:bg-[#252a3d] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#a8b9f4]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={onLowerCap}
                      data-testid="button-cap-save"
                      className="px-[12px] py-[8px] rounded-[100px] bg-[#7631ee] hover:bg-[#8a4bf5] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-white"
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Delete the rule */}
            <div className="pt-[4px] border-t border-[#1d2132]">
              {!confirmingDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  data-testid="button-delete-rule"
                  className="flex items-center gap-[8px] mt-[12px] px-[12px] py-[8px] rounded-[100px] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[13px] focus:outline-none focus-visible:ring-2"
                  style={{ backgroundColor: "rgba(210,3,68,0.08)", color: ALERT, ["--tw-ring-color" as string]: ALERT }}
                >
                  <Trash2 size={15} /> Delete this rule
                </button>
              ) : (
                <div className="flex flex-col gap-[10px] mt-[12px]">
                  <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#6c779d] text-[13px]">
                    Deleting removes this rule entirely. Future matching payments will always wait for your approval. This can’t be undone.
                  </p>
                  <div className="flex gap-[10px] items-stretch w-full">
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      data-testid="button-delete-cancel"
                      className="flex-1 px-[12px] py-[9px] rounded-[100px] bg-[#1d2132] hover:bg-[#252a3d] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[13px] text-[#a8b9f4]"
                    >
                      Keep rule
                    </button>
                    <button
                      type="button"
                      onClick={onDelete}
                      data-testid="button-delete-confirm"
                      className="flex-1 px-[12px] py-[9px] rounded-[100px] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[13px] text-white focus:outline-none focus-visible:ring-2"
                      style={{ backgroundColor: ALERT, ["--tw-ring-color" as string]: ALERT }}
                    >
                      Delete rule
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Reported problems trail */}
          <div className="w-full flex flex-col gap-[12px]">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[18px] text-[#a8b9f4] text-[14px]">
              Reported problems
            </p>
            {reports.length === 0 ? (
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#6c779d] text-[13px]">
                No problems reported on this rule yet.
              </p>
            ) : (
              <div className="flex flex-col gap-[8px]">
                {[...reports].reverse().map((r) => (
                  <ReportCard key={r.id} report={r} onOpenReceipt={openReceipt} />
                ))}
              </div>
            )}
          </div>

        </div>
      </ScrollArea>
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  if (active) {
    return (
      <span
        data-testid="pill-rule-status"
        className="flex items-center gap-[6px] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] px-[10px] py-[4px] rounded-[100px] bg-[#123509] text-[#42bf23]"
      >
        Active
      </span>
    );
  }
  return (
    <span
      data-testid="pill-rule-status"
      className="flex items-center gap-[6px] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] px-[10px] py-[4px] rounded-[100px]"
      style={{ backgroundColor: "rgba(210,3,68,0.12)", color: ALERT }}
    >
      Paused
    </span>
  );
}

function ReportCard({
  report,
  onOpenReceipt,
}: {
  report: ProblemReport;
  onOpenReceipt: (proposalId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="w-full rounded-[10px] bg-[#0a0c10] border border-[#1d2132] overflow-hidden"
      data-testid={`card-report-${report.id}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-[10px] w-full px-[12px] py-[10px] text-left hover:bg-[#0d1017] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965]"
      >
        <Flag size={15} className="shrink-0" style={{ color: report.resolved ? "#6c779d" : ALERT }} />
        <div className="flex flex-col flex-1 min-w-px">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[18px] text-[#a8b9f4] text-[13px]">
            {report.reason}
          </p>
          <p className="[font-family:'JetBrains_Mono',monospace] leading-[16px] text-[#6c779d] text-[11px]">
            {report.reportedAtLabel}
          </p>
        </div>
        {report.resolved && (
          <span className="[font-family:'Gilroy',sans-serif] font-medium text-[11px] text-[#6c779d] shrink-0">
            Resolved
          </span>
        )}
        <ChevronDown
          size={15}
          className={`shrink-0 text-[#6c779d] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-[12px] pb-[12px] flex flex-col gap-[8px]">
          {report.note && (
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#a8b9f4] text-[13px] rounded-[8px] bg-[#06070a] border border-[#1d2132] px-[12px] py-[8px]">
              {report.note}
            </p>
          )}
          <button
            type="button"
            onClick={() => onOpenReceipt(report.proposalId)}
            data-testid={`button-report-receipt-${report.id}`}
            className="self-start flex items-center gap-[6px] px-[12px] py-[7px] rounded-[100px] bg-[#1d2132] hover:bg-[#252a3d] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#a8b9f4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965]"
          >
            <ReceiptText size={14} /> View the receipt
          </button>
        </div>
      )}
    </div>
  );
}
