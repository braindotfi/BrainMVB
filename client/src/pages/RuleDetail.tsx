import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Flag,
  Pause,
  Play,
  Trash2,
  ChevronDown,
  ChevronUp,
  ReceiptText,
  Info,
  Lock,
  Shield,
} from "lucide-react";
import { useRule, pauseRule, resumeRule, removeVendor, lowerCap, setThreshold, deleteRule } from "@/lib/rulesStore";
import { usePolicyRule, APPLIES_TO_LABEL, EXECUTE_LABEL, describeWhen } from "@/lib/brainPolicy";
import type { PolicyContentRule } from "@/lib/brainPolicy";
import { AUTO_HANDLED_PROPOSALS } from "@/lib/mockProposals";
import { useCurrency } from "@/lib/currencyContext";
import type { ProblemReport, RuleHistoryEvent } from "@/lib/proposalTypes";

const ALERT = "#d20344";

/* ── Rule detail — the destination of "Report a problem → pause and review".
   #D20344 is reserved for problem/alert accents ONLY; affirmative actions use
   purple #7631ee. Amounts / dates / policy ids render monospace. ──────────── */
export function RuleDetail() {
  const [, params] = useRoute("/rules/:id");
  const [, navigate] = useLocation();
  const { format } = useCurrency();
  const rule = useRule(params?.id);
  const { rule: policyRule, isLoading: policyLoading, isError: policyError } = usePolicyRule(params?.id);
  const isPolicy = params?.id?.startsWith("policy-") ?? false;

  const [confirmingResume, setConfirmingResume] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showCapEditor, setShowCapEditor] = useState(false);
  const [capDraft, setCapDraft] = useState("");
  const [showAmountEditor, setShowAmountEditor] = useState(false);
  const [amountDraft, setAmountDraft] = useState("");

  /* Loading state for policy rules: wait until the query resolves before
     deciding between "not found" and the detail view. */
  if (isPolicy && policyLoading) {
    return (
      <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col items-center justify-center gap-[16px] p-[24px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[18px]">
          Loading policy rule…
        </p>
        <button
          type="button"
          onClick={() => navigate("/rules?tab=default")}
          data-testid="button-back-to-rules"
          className="flex items-center gap-[8px] px-[16px] py-[10px] rounded-[100px] bg-[#240757] border border-[rgba(118,49,238,0.35)] hover:bg-[#2e0a6b] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#7631ee]"
        >
          <ArrowLeft size={16} /> Back to rules
        </button>
      </div>
    );
  }

  /* Terminal "not found" — only shown when we are certain the rule doesn't exist:
     - For policy routes: after the query has loaded (not loading) and returned no rule.
     - For app routes: when useRule returns nothing (store is synchronous). */
  const definitelyMissing = isPolicy
    ? !policyLoading && !policyRule
    : !rule;

  if (definitelyMissing) {
    return (
      <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col items-center justify-center gap-[16px] p-[24px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[18px]">
          {isPolicy ? "This policy rule is not available right now." : "This rule no longer exists."}
        </p>
        <button
          type="button"
          onClick={() => navigate(isPolicy ? "/rules?tab=default" : "/rules")}
          data-testid="button-back-to-rules"
          className="flex items-center gap-[8px] px-[16px] py-[10px] rounded-[100px] bg-[#240757] border border-[rgba(118,49,238,0.35)] hover:bg-[#2e0a6b] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#7631ee]"
        >
          <ArrowLeft size={16} /> Back to rules
        </button>
      </div>
    );
  }

  const reports = rule?.problemReports ?? [];
  const history = rule?.history ?? [];
  const openReports = reports.filter((r) => !r.resolved);
  const pausedFromReport = !rule?.active && openReports.length > 0;
  const latestOpen = openReports[openReports.length - 1];
  /* The receipt that triggered the most recent open report — the linked payment. */
  const linkedPayment = latestOpen
    ? AUTO_HANDLED_PROPOSALS.find((p) => p.id === latestOpen.proposalId)
    : undefined;

  const openReceipt = (proposalId: string) => navigate(`/review?receipt=${proposalId}`);

  const onResume = () => {
    if (!rule) return;
    resumeRule(rule.id);
    setConfirmingResume(false);
  };
  const onDelete = () => {
    if (!rule) return;
    deleteRule(rule.id);
    navigate("/rules");
  };
  const onLowerCap = () => {
    if (!rule) return;
    const next = Number(capDraft.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(next) && next > 0) {
      lowerCap(rule.id, Math.round(next));
      setShowCapEditor(false);
      setCapDraft("");
    }
  };
  const onSaveAmount = () => {
    if (!rule) return;
    const next = Number(amountDraft.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(next) && next > 0) {
      setThreshold(rule.id, Math.round(next));
      setShowAmountEditor(false);
      setAmountDraft("");
    }
  };
  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[24px] items-start pb-[24px] pt-[32px] px-[16px] w-full">

          {/* Back button — routes to the correct tab based on rule type */}
          <button
            type="button"
            onClick={() => {
              let tab = "default";
              if (!isPolicy && rule) {
                tab =
                  rule.kind === "guardrail"
                    ? "guardrails"
                    : rule.kind === "always_on"
                      ? "always-on"
                      : "automations";
              }
              navigate(`/rules?tab=${tab}`);
            }}
            data-testid="button-back-to-rules"
            className="flex items-center gap-[4px] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#6c779d] hover:text-[#a8b9f4] bg-[#222737] hover:bg-[#2a3040] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965] rounded-[100px] px-[12px] py-[8px]"
          >
            <ArrowLeft size={16} /> Back to Rules
          </button>

          {isPolicy && policyRule ? (
            <PolicyDetailHeader rule={policyRule} />
          ) : rule ? (
            <div className="flex flex-col gap-[12px] items-start w-full">
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
          ) : null}

          {/* Policy rule detail body — read-only, shows all DSL fields */}
          {isPolicy && policyRule && <PolicyDetailBody rule={policyRule} />}

          {/* Everything below is ONLY for app-local rules */}
          {!isPolicy && rule && (
            <>

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

          {/* Status banner — matches Figma's "Info Circle" info pill. */}
          <div
            className="w-full rounded-[12px] border border-[#1d2132] p-[8px] flex items-center gap-[8px]"
            data-testid="text-what-changed"
          >
            <Info size={16} className="shrink-0" style={{ color: rule.active ? "#6c779d" : ALERT }} />
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[14px] text-[#6c779d]">
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

          {/* Rule status — Pause/Resume + Delete, matches Figma's "Rule Status" card. */}
          <div className="w-full rounded-[16px] bg-[#0a0c10] p-[16px] flex flex-col gap-[12px]">
            <div className="flex items-center justify-between gap-[16px] flex-wrap">
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[24px] text-[#6c779d] text-[20px]">
                Rule Status
              </p>
              <div className="flex items-center gap-[8px]">
                <button
                  type="button"
                  onClick={() => (rule.active ? pauseRule(rule.id) : setConfirmingResume(true))}
                  data-testid="button-toggle-rule"
                  className="flex items-center gap-[4px] px-[12px] py-[8px] rounded-[100px] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[12px] focus:outline-none focus-visible:ring-2"
                  style={
                    rule.active
                      ? { backgroundColor: "#4a2300", color: "#ff9400", ["--tw-ring-color" as string]: "#ff9400" }
                      : { backgroundColor: "#123509", color: "#42bf23", ["--tw-ring-color" as string]: "#42bf23" }
                  }
                >
                  {rule.active ? <Pause size={14} /> : <Play size={14} />}
                  {rule.active ? "Pause Rule" : "Resume Rule"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  data-testid="button-delete-rule"
                  className="flex items-center gap-[4px] px-[12px] py-[8px] rounded-[100px] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[12px] focus:outline-none focus-visible:ring-2"
                  style={{ backgroundColor: "#350011", color: ALERT, ["--tw-ring-color" as string]: ALERT }}
                >
                  <Trash2 size={14} /> Delete Rule
                </button>
              </div>
            </div>

            {confirmingResume && (
              <div className="flex flex-col gap-[10px] pt-[12px] border-t border-[#1d2132]">
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

            {confirmingDelete && (
              <div className="flex flex-col gap-[10px] pt-[12px] border-t border-[#1d2132]">
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

          {/* Trusted vendors — allowlist removal, matches Figma's "Popup - Search Results" panel. */}
          {rule.allowlist && rule.allowlist.length > 0 && (
            <div className="w-full rounded-[16px] bg-[#0a0c10] overflow-hidden flex flex-col">
              <div className="flex items-center gap-[8px] px-[16px] py-[14px] border-b border-[#1d2132]">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px]">
                  Trusted Vendors
                </p>
                <span className="min-w-[16px] p-[2px] rounded-[4px] bg-[#414965] flex items-center justify-center [font-family:'Gilroy',sans-serif] font-semibold leading-[12px] text-[#a8b9f4] text-[12px]">
                  {rule.allowlist.length}
                </span>
              </div>
              <div className="flex flex-col gap-[8px] p-[8px]">
                {rule.allowlist.map((vendor, i) => (
                  <div key={vendor} className="flex flex-col gap-[8px]">
                    {i > 0 && <div className="h-px w-full bg-[#1d2132]" />}
                    <div
                      className="flex items-center gap-[16px] p-[8px] rounded-[8px]"
                      data-testid={`row-vendor-${vendor.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}
                    >
                      <span className="flex-1 [font-family:'Gilroy',sans-serif] font-semibold text-[16px] text-[#a8b9f4] truncate">
                        {vendor}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeVendor(rule.id, vendor)}
                        data-testid={`button-remove-vendor-${vendor.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}
                        className="w-[80px] flex items-center justify-center px-[12px] py-[8px] rounded-[100px] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[12px] focus:outline-none focus-visible:ring-2"
                        style={{ backgroundColor: "#350011", color: ALERT, ["--tw-ring-color" as string]: ALERT }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Amount — threshold / cap edit, matches Figma's "Amount" panel. */}
          {(typeof rule.threshold === "number" || typeof rule.cap === "number") && (
            <div className="w-full rounded-[16px] bg-[#0a0c10] overflow-hidden flex flex-col">
              <div className="flex items-center px-[16px] py-[14px] border-b border-[#1d2132]">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px]">
                  Amount
                </p>
              </div>
              <div className="flex flex-col gap-[8px] p-[8px]">
                {typeof rule.threshold === "number" && (
                  <AmountRow
                    value={rule.threshold}
                    format={format}
                    editing={showAmountEditor}
                    draft={amountDraft}
                    onDraftChange={setAmountDraft}
                    onEditStart={() => { setShowAmountEditor(true); setAmountDraft(String(rule.threshold)); }}
                    onCancel={() => { setShowAmountEditor(false); setAmountDraft(""); }}
                    onSave={onSaveAmount}
                    testIdValue="text-rule-threshold"
                    testIdInput="input-amount"
                    testIdEdit="button-edit-amount"
                    testIdCancel="button-amount-cancel"
                    testIdSave="button-amount-save"
                  />
                )}
                {typeof rule.threshold === "number" && typeof rule.cap === "number" && (
                  <div className="h-px w-full bg-[#1d2132]" />
                )}
                {typeof rule.cap === "number" && (
                  <AmountRow
                    value={rule.cap}
                    format={format}
                    editing={showCapEditor}
                    draft={capDraft}
                    onDraftChange={setCapDraft}
                    onEditStart={() => { setShowCapEditor(true); setCapDraft(String(rule.cap)); }}
                    onCancel={() => { setShowCapEditor(false); setCapDraft(""); }}
                    onSave={onLowerCap}
                    testIdValue="text-rule-cap"
                    testIdInput="input-cap"
                    testIdEdit="button-lower-cap"
                    testIdCancel="button-cap-cancel"
                    testIdSave="button-cap-save"
                  />
                )}
              </div>
            </div>
          )}

          {/* Reported problems — accordion trail, matches Figma's "Reported Problems" panel. */}
          <div className="w-full rounded-[16px] bg-[#0a0c10] overflow-hidden flex flex-col">
            <div className="flex items-center gap-[8px] px-[16px] py-[14px] border-b border-[#1d2132]">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px]">
                Reported Problems
              </p>
            </div>
            <div className="flex flex-col gap-[8px] p-[8px]">
              {reports.length === 0 ? (
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#6c779d] text-[13px] p-[8px]">
                  No problems reported on this rule yet.
                </p>
              ) : (
                [...reports].reverse().map((r, i) => (
                  <div key={r.id} className="flex flex-col gap-[8px]">
                    {i > 0 && <div className="h-px w-full bg-[#1d2132]" />}
                    <ReportCard report={r} onOpenReceipt={openReceipt} />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* History — created/paused/resumed trail, matches Figma's panel pattern. */}
          <div className="w-full rounded-[16px] bg-[#0a0c10] overflow-hidden flex flex-col">
            <div className="flex items-center gap-[8px] px-[16px] py-[14px] border-b border-[#1d2132]">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px]">
                History
              </p>
            </div>
            <div className="flex flex-col gap-[8px] p-[8px]">
              {history.length === 0 ? (
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#6c779d] text-[13px] p-[8px]">
                  No history recorded for this rule yet.
                </p>
              ) : (
                [...history].reverse().map((h, i) => (
                  <div key={h.id} className="flex flex-col gap-[8px]">
                    {i > 0 && <div className="h-px w-full bg-[#1d2132]" />}
                    <HistoryRow event={h} />
                  </div>
                ))
              )}
            </div>
          </div>

            </>
          )}

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
      className={`w-full rounded-[8px] flex flex-col gap-[8px] p-[8px] ${open ? "bg-[#11141b] border border-[#1d2132]" : "bg-[#0a0c10]"}`}
      data-testid={`card-report-${report.id}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid={`button-toggle-report-${report.id}`}
        className="flex items-center justify-between gap-[10px] w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965] rounded-[6px]"
      >
        <div className="flex flex-col gap-[4px] min-w-px">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px]">
            {report.reason}
          </p>
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px]">
            {report.reportedAtLabel}
          </p>
        </div>
        {open ? (
          <ChevronUp size={24} className="shrink-0 text-[#6c779d]" />
        ) : (
          <ChevronDown size={24} className="shrink-0 text-[#6c779d]" />
        )}
      </button>
      {open && (
        <>
          <div className="h-px w-full bg-[#1d2132]" />
          <div className="flex items-center gap-[16px]">
            {report.note && (
              <p className="flex-1 [font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px]">
                {report.note}
              </p>
            )}
            <button
              type="button"
              onClick={() => onOpenReceipt(report.proposalId)}
              data-testid={`button-report-receipt-${report.id}`}
              className="shrink-0 flex items-center px-[12px] py-[8px] rounded-[100px] bg-[#222737] hover:bg-[#2a3040] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#6c779d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965]"
            >
              View the Receipt
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function HistoryRow({ event }: { event: RuleHistoryEvent }) {
  return (
    <div
      className="flex items-center justify-between gap-[16px] p-[8px]"
      data-testid={`row-history-${event.id}`}
    >
      <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[16px] text-[#a8b9f4] truncate">
        {event.label}
      </span>
      <span className="[font-family:'JetBrains_Mono',monospace] text-[13px] text-[#6c779d] shrink-0">
        {event.atLabel}
      </span>
    </div>
  );
}

function AmountRow({
  value,
  format,
  editing,
  draft,
  onDraftChange,
  onEditStart,
  onCancel,
  onSave,
  testIdValue,
  testIdInput,
  testIdEdit,
  testIdCancel,
  testIdSave,
}: {
  value: number;
  format: (n: number) => string;
  editing: boolean;
  draft: string;
  onDraftChange: (v: string) => void;
  onEditStart: () => void;
  onCancel: () => void;
  onSave: () => void;
  testIdValue: string;
  testIdInput: string;
  testIdEdit: string;
  testIdCancel: string;
  testIdSave: string;
}) {
  if (!editing) {
    return (
      <div className="flex items-center gap-[16px] p-[8px] rounded-[8px]">
        <span
          className="flex-1 [font-family:'Gilroy',sans-serif] font-semibold text-[16px] text-[#a8b9f4]"
          data-testid={testIdValue}
        >
          {format(value)}
        </span>
        <button
          type="button"
          onClick={onEditStart}
          data-testid={testIdEdit}
          className="w-[80px] flex items-center justify-center px-[12px] py-[8px] rounded-[100px] bg-[#222737] hover:bg-[#2a3040] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#6c779d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965]"
        >
          Edit
        </button>
      </div>
    );
  }
  return (
    <div className="flex gap-[16px] items-center p-[8px] rounded-[8px]">
      <div className="flex-1 min-w-px flex flex-col justify-center">
        <input
          value={draft}
          autoFocus
          inputMode="numeric"
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave();
            if (e.key === "Escape") onCancel();
          }}
          data-testid={testIdInput}
          className="w-full h-[32px] flex items-center rounded-[8px] bg-[#222737] px-[12px] py-[8px] [font-family:'Gilroy',sans-serif] font-medium text-[15px] text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(118,49,238,0.5)]"
        />
      </div>
      <div className="flex gap-[8px] items-center shrink-0">
        <button
          type="button"
          onClick={onCancel}
          data-testid={testIdCancel}
          className="w-[80px] flex items-center justify-center px-[12px] py-[8px] rounded-[100px] bg-[#11141b] hover:bg-[#1d2132] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#6c779d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          data-testid={testIdSave}
          className="w-[80px] flex items-center justify-center px-[12px] py-[8px] rounded-[100px] bg-[#123509] hover:bg-[#173e0b] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#42bf23] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#42bf23]"
        >
          Save
        </button>
      </div>
    </div>
  );
}

/* ── Policy rule detail — read-only view of a brain-core policy rule ─────────
   Shows all DSL fields: applies_to, when conditions, execute, require,
   plus policy version + quorum metadata. No Pause/Resume/Delete. */

function PolicyDetailHeader({ rule }: { rule: PolicyContentRule }) {
  const rawName = rule.id.replace(/[-_]/g, " ");
  const appliesTo = (rule.applies_to ?? [])
    .map((a) => APPLIES_TO_LABEL[a] ?? a)
    .join(", ") || "any action";
  const executeLabel = EXECUTE_LABEL[rule.execute ?? "confirm"] ?? (rule.execute ?? "unknown");
  const requireSuffix = rule.require ? ` · requires ${rule.require.replace(/_/g, " ")}` : "";

  return (
    <div className="flex flex-col gap-[12px] items-start w-full">
      <div className="flex items-start gap-[12px] w-full">
        <div className="flex flex-col gap-[6px] flex-1 min-w-px">
          <div className="flex items-center gap-[10px] flex-wrap">
            <p
              className="[font-family:'Gilroy',sans-serif] font-semibold leading-[32px] text-[#a8b9f4] text-[26px]"
              data-testid="text-rule-name"
            >
              {rawName}
            </p>
            <span
              data-testid="pill-rule-status"
              className="flex items-center gap-[6px] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] px-[10px] py-[4px] rounded-[100px] bg-[#240757] text-[#7631ee] border border-[rgba(118,49,238,0.3)]"
            >
              <Lock size={12} /> Read-only
            </span>
          </div>
          <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px]">
            {appliesTo} — {executeLabel}{requireSuffix}
          </p>
          <p className="[font-family:'JetBrains_Mono',monospace] leading-[18px] text-[#414965] text-[12px]" data-testid="text-rule-policy-id">
            {rule.id} · From your active Brain policy
          </p>
        </div>
      </div>
    </div>
  );
}

function PolicyDetailBody({ rule }: { rule: PolicyContentRule }) {
  const conditions = describeWhen(rule.when ?? {});
  const appliesTo = rule.applies_to ?? [];
  const hasRequire = !!rule.require;
  const execute = rule.execute ?? "confirm";

  return (
    <div className="flex flex-col gap-[16px] items-start w-full">
      {/* Info banner */}
      <div
        className="w-full rounded-[12px] border border-[#1d2132] p-[12px] flex items-start gap-[10px]"
        data-testid="text-policy-info"
      >
        <Shield size={16} className="shrink-0 mt-[2px] text-[#6c779d]" />
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[14px] text-[#6c779d]">
          This rule is part of your Brain core <span className="font-semibold text-[#a8b9f4]">default policy</span>. It is enforced
          by Brain for every action and cannot be edited or paused from this app. Changes must be made
          through Brain core's admin layer.
        </p>
      </div>

      {/* DSL fields panel */}
      <div className="w-full rounded-[16px] bg-[#0a0c10] overflow-hidden flex flex-col">
        <div className="flex items-center px-[16px] py-[14px] border-b border-[#1d2132]">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px]">
            Rule definition
          </p>
        </div>
        <div className="flex flex-col gap-[2px] p-[8px]">
          {/* ID */}
          <div className="flex items-center justify-between gap-[16px] p-[8px]">
            <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#6c779d]">ID</span>
            <span className="[font-family:'JetBrains_Mono',monospace] text-[13px] text-[#a8b9f4] shrink-0">{rule.id}</span>
          </div>
          <div className="h-px w-full bg-[#1d2132]" />

          {/* Applies to */}
          <div className="flex items-center justify-between gap-[16px] p-[8px]">
            <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#6c779d]">Applies to</span>
            <span className="[font-family:'JetBrains_Mono',monospace] text-[13px] text-[#a8b9f4] text-right shrink-0">
              {appliesTo.length > 0 ? appliesTo.join(", ") : "any action"}
            </span>
          </div>
          <div className="h-px w-full bg-[#1d2132]" />

          {/* When conditions */}
          <div className="flex items-center justify-between gap-[16px] p-[8px]">
            <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#6c779d]">When</span>
            <span className="[font-family:'JetBrains_Mono',monospace] text-[13px] text-[#a8b9f4] text-right shrink-0 max-w-[60%]">
              {conditions.length > 0 ? conditions.join(" · ") : "always"}
            </span>
          </div>
          <div className="h-px w-full bg-[#1d2132]" />

          {/* Execute action */}
          <div className="flex items-center justify-between gap-[16px] p-[8px]">
            <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#6c779d]">Execute</span>
            <span className="[font-family:'JetBrains_Mono',monospace] text-[13px] text-[#a8b9f4] shrink-0">{execute}</span>
          </div>

          {hasRequire && (
            <>
              <div className="h-px w-full bg-[#1d2132]" />
              <div className="flex items-center justify-between gap-[16px] p-[8px]">
                <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#6c779d]">Requires</span>
                <span className="[font-family:'JetBrains_Mono',monospace] text-[13px] text-[#a8b9f4] shrink-0">{rule.require!.replace(/_/g, " ")}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
