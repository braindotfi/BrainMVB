import { useState } from "react";
import { useLocation, useRoute } from "wouter";

const C_LEVEL = new Set(["cfo", "ceo", "coo", "cto", "cmo", "cpo", "cro"]);
/** Render a brain-core `require` field (e.g. "single_signer", "cfo") with
 *  underscores replaced by spaces and C-suite acronyms uppercased. */
function formatRequire(require: string): string {
  return require
    .replace(/_/g, " ")
    .replace(/\b\w+/g, (w) => C_LEVEL.has(w.toLowerCase()) ? w.toUpperCase() : w);
}

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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Flag,
  ChevronDown,
  ChevronUp,
  Shield,
} from "lucide-react";
import { useRule, pauseRule, resumeRule, removeVendor, lowerCap, setThreshold, deleteRule } from "@/lib/rulesStore";
import { usePolicyRule, APPLIES_TO_LABEL, EXECUTE_LABEL, describeWhen } from "@/lib/brainPolicy";
import type { PolicyContentRule } from "@/lib/brainPolicy";
import { useCurrency } from "@/lib/currencyContext";
import type { ProblemReport, RuleHistoryEvent } from "@/lib/proposalTypes";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import closeIcon from "@assets/Close_1783293571882.png";
import playIcon from "@assets/play_1783376650313.png";
import deleteIcon from "@assets/delete_1783376650313.png";
import pauseIcon from "@assets/pause_1783376736546.png";

const ALERT = "#d20344";

/* Rule detail: the destination of "Report a problem → pause and review".
   #D20344 is reserved for problem/alert accents ONLY; affirmative actions use
   purple #7631ee. Amounts / dates / policy ids render monospace. ──────────── */
export function RuleDetail() {
  const [, params] = useRoute("/rules/:id");
  const [, navigate] = useLocation();
  const { format } = useCurrency();
  const rule = useRule(params?.id);
  const { rule: policyRule, isLoading: policyLoading, isError: policyError } = usePolicyRule(params?.id);
  const isPolicy = params?.id?.startsWith("policy-") ?? false;

  const [resumeModalOpen, setResumeModalOpen] = useState(false);
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
          className="flex items-center justify-center gap-[8px] px-[16px] py-[10px] rounded-[100px] bg-[#240757] border border-[rgba(118,49,238,0.35)] hover:bg-[#2e0a6b] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#7631ee]"
        >
          <ArrowLeft size={16} /> Back to rules
        </button>
      </div>
    );
  }

  /* Terminal "not found". Only shown when we are certain the rule doesn't exist:
     For policy routes: after the query has loaded (not loading) and returned no rule.
     For app routes: when useRule returns nothing (store is synchronous). */
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
          className="flex items-center justify-center gap-[8px] px-[16px] py-[10px] rounded-[100px] bg-[#240757] border border-[rgba(118,49,238,0.35)] hover:bg-[#2e0a6b] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#7631ee]"
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

  const openReceipt = (proposalId: string) => navigate(`/review?proposal=${proposalId}`);

  const onResume = () => {
    if (!rule) return;
    resumeRule(rule.id);
    setResumeModalOpen(false);
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

          {/* Back button. Routes to the correct tab based on rule type.
              Policy rules render their own back pill inside PolicyDetailHeader. */}
          {!isPolicy && (
            <button
              type="button"
              onClick={() => {
                let tab = "default";
                if (rule) {
                  tab =
                    rule.kind === "guardrail"
                      ? "guardrails"
                      : "automations";
                }
                navigate(`/rules?tab=${tab}`);
              }}
              data-testid="button-back-to-rules"
              className="flex items-center justify-center gap-[4px] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#6c779d] hover:text-[#a8b9f4] bg-[#222737] hover:bg-[#2a3040] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965] rounded-[100px] px-[12px] py-[8px]"
            >
              <ArrowLeft size={16} /> Back to Rules
            </button>
          )}

          {isPolicy && policyRule ? (
            <PolicyDetailHeader rule={policyRule} />
          ) : rule ? (
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
          ) : null}

          {/* Paused-from-report banner: #D20344 accent, with the linked payment. */}
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
            </div>
          )}

          {/* Policy rule detail body: read-only, shows all DSL fields */}
          {isPolicy && policyRule && <PolicyDetailBody rule={policyRule} />}

          {/* Everything below is ONLY for app-local rules */}
          {!isPolicy && rule && (
            <>

          {/* Status banner. Matches Figma's "Info Circle" info pill. */}
          <div
            className="w-full rounded-[12px] border border-[#1d2132] p-[8px] flex items-center gap-[8px]"
            data-testid="text-what-changed"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 mt-[2px]">
        <circle cx="8" cy="8" r="7" stroke="#6c779d" strokeWidth="1.3" />
        <path d="M8 7.3v4.2" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="8" cy="4.7" r="0.9" fill="#6c779d" />
      </svg>
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[14px] text-[#6c779d]">
              {rule.active ? (
                <>
                  This rule is <span className="font-semibold text-[#42bf23]">active</span>. It auto-clears {titleCase(rule.scopeSummary ?? "matching payments")} automatically.
                </>
              ) : (
                <>
                  This rule is <span className="font-semibold text-[#ff9400]">paused</span> . Payments it used to auto-clear ({titleCase(rule.scopeSummary ?? "matching payments")}) will now wait for your approval in Needs Review.
                </>
              )}
            </p>
          </div>

          {/* Rule status: Pause/Resume + Delete. Matches Figma's "Rule Status" card. */}
          <div className="w-full rounded-[16px] bg-[#0a0c10] p-[16px] flex flex-col gap-[12px]">
            <div className="flex items-center justify-between gap-[16px] flex-wrap">
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[24px] text-[#6c779d] text-[20px]">
                Rule Status
              </p>
              <div className="flex items-center gap-[8px]">
                <button
                  type="button"
                  onClick={() => (rule.active ? pauseRule(rule.id) : setResumeModalOpen(true))}
                  data-testid="button-toggle-rule"
                  className="flex items-center justify-center gap-[4px] px-[12px] py-[8px] rounded-[100px] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[12px] focus:outline-none focus-visible:ring-2"
                  style={
                    rule.active
                      ? { backgroundColor: "#4a2300", color: "#ff9400", ["--tw-ring-color" as string]: "#ff9400" }
                      : { backgroundColor: "#123509", color: "#42bf23", ["--tw-ring-color" as string]: "#42bf23" }
                  }
                >
                  <img src={rule.active ? pauseIcon : playIcon} alt="" className="shrink-0 size-[16px]" />
                  {rule.active ? "Pause Rule" : "Resume Rule"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  data-testid="button-delete-rule"
                  className="flex items-center justify-center gap-[4px] px-[12px] py-[8px] rounded-[100px] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[12px] focus:outline-none focus-visible:ring-2"
                  style={{ backgroundColor: "#350011", color: ALERT, ["--tw-ring-color" as string]: ALERT }}
                >
                  <img src={deleteIcon} alt="" className="shrink-0 size-[16px]" /> Delete Rule
                </button>
              </div>
            </div>

          </div>

          {/* Paused-from-report banner: orange accent. Matches Figma's flagged banner under Rule Status. */}
          {pausedFromReport && (
            <div
              className="w-full rounded-[12px] p-[16px] flex items-start gap-[10px]"
              style={{ backgroundColor: "#4a2300", border: "1px solid rgba(255,148,0,0.2)" }}
              data-testid="banner-paused-from-report"
            >
              <Flag size={18} className="shrink-0 mt-[1px] text-[#ff9400]" />
              <div className="flex flex-col gap-[4px]">
                <p className="[font-family:'Gilroy',sans-serif] font-bold uppercase leading-[20px] text-[15px] text-[#ff9400]">
                  Paused After You Reported a Problem
                </p>
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#ff9400] text-[13px]">
                  You flagged “{latestOpen?.reason}” on a payment this rule cleared. It won’t auto-clear anything new until you resume it.
                </p>
              </div>
            </div>
          )}

          {/* Resume-rule confirmation: dim/blur backdrop modal, matches other popups. */}
          <DialogPrimitive.Root open={resumeModalOpen} onOpenChange={setResumeModalOpen}>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
                data-testid="resume-rule-backdrop"
              />
              <DialogPrimitive.Content
                className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#0a0c10] border border-[#1d2132] border-solid flex flex-col items-start overflow-hidden rounded-[24px] w-[440px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
                data-testid="resume-rule-modal"
              >
                {/* Title bar */}
                <div className="bg-[#0a0c10] border-b border-[#1d2132] border-solid h-[56px] relative shrink-0 w-full flex items-center justify-center">
                  <DialogPrimitive.Title className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#a8b9f4] text-[20px] text-center whitespace-nowrap">
                    Resume Rule
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Close
                    data-testid="button-resume-modal-close"
                    aria-label="Close"
                    className="absolute right-[11px] top-[11px] size-[32px] p-0 hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                  >
                    <img src={closeIcon} alt="" className="size-[32px] rounded-full" />
                  </DialogPrimitive.Close>
                </div>

                {/* Body */}
                <div className="flex flex-col gap-[24px] items-start p-[40px] w-full overflow-y-auto">
                  <DialogPrimitive.Description
                    className="[font-family:'Gilroy',sans-serif] font-medium leading-[28px] text-[#414965] text-[22px]"
                  >
                    Resuming lets this rule auto-clear {titleCase(rule.scopeSummary ?? "matching payments")} again automatically. Make sure you’ve resolved what you reported first.
                  </DialogPrimitive.Description>

                  <div className="flex gap-[16px] items-center w-full">
                    <button
                      type="button"
                      onClick={() => setResumeModalOpen(false)}
                      data-testid="button-resume-cancel"
                      className="flex-1 px-[24px] py-[12px] rounded-[100px] bg-[#222737] hover:bg-[#2a3040] transition-colors flex items-center justify-center [font-family:'Gilroy',sans-serif] font-semibold text-[18px] text-[#6c779d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965]"
                    >
                      Keep Paused
                    </button>
                    <button
                      type="button"
                      onClick={onResume}
                      data-testid="button-resume-confirm"
                      className="flex-1 px-[24px] py-[12px] rounded-[100px] bg-[#123509] hover:bg-[#174710] transition-colors flex items-center justify-center [font-family:'Gilroy',sans-serif] font-semibold text-[18px] text-[#42bf23] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#42bf23]"
                    >
                      Resume
                    </button>
                  </div>
                </div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>

          {/* Delete-rule confirmation: popup modal matching Figma node 5577:65171. */}
          <DialogPrimitive.Root open={confirmingDelete} onOpenChange={setConfirmingDelete}>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
                data-testid="delete-rule-backdrop"
              />
              <DialogPrimitive.Content
                className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#0a0c10] border border-[#1d2132] border-solid flex flex-col items-start overflow-hidden rounded-[24px] w-[440px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
                data-testid="delete-rule-modal"
              >
                {/* Title bar */}
                <div className="bg-[#0a0c10] border-b border-[#1d2132] border-solid h-[56px] relative shrink-0 w-full flex items-center justify-center">
                  <DialogPrimitive.Title className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#a8b9f4] text-[20px] text-center whitespace-nowrap">
                    Delete Rule
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Close
                    data-testid="button-delete-modal-close"
                    aria-label="Close"
                    className="absolute right-[11px] top-[11px] size-[32px] p-0 hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                  >
                    <img src={closeIcon} alt="" className="size-[32px] rounded-full" />
                  </DialogPrimitive.Close>
                </div>

                {/* Body */}
                <div className="flex flex-col gap-[24px] items-start p-[40px] w-full overflow-y-auto">
                  <DialogPrimitive.Description
                    className="[font-family:'Gilroy',sans-serif] font-medium leading-[28px] text-[#414965] text-[22px]"
                  >
                    Deleting removes this rule entirely. Are you sure you want to delete this rule? This can’t be undone.
                  </DialogPrimitive.Description>

                  <div className="flex gap-[16px] items-center w-full">
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      data-testid="button-delete-cancel"
                      className="flex-1 px-[24px] py-[12px] rounded-[100px] bg-[#222737] hover:bg-[#2a3040] transition-colors flex items-center justify-center [font-family:'Gilroy',sans-serif] font-semibold text-[18px] text-[#6c779d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={onDelete}
                      data-testid="button-delete-confirm"
                      className="flex-1 px-[24px] py-[12px] rounded-[100px] bg-[#350011] hover:bg-[#4a0018] transition-colors flex items-center justify-center [font-family:'Gilroy',sans-serif] font-semibold text-[18px] text-[#d20344] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d20344]"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>

          {/* Trusted vendors: allowlist removal. Matches Figma's "Popup - Search Results" panel. */}
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

          {/* Amount: threshold / cap edit. Matches Figma's "Amount" panel. */}
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

          {/* Reported problems: accordion trail. Matches Figma's "Reported Problems" panel. */}
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

          {/* History: created/paused/resumed trail. Matches Figma's panel pattern. */}
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
        className="flex items-center gap-[6px] [font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[18px] px-[10px] py-[4px] rounded-[22px] border bg-[#123509] text-[#42bf23]"
        style={{ borderColor: "rgba(66,191,35,0.2)" }}
      >
        Active
      </span>
    );
  }
  return (
    <span
      data-testid="pill-rule-status"
      className="flex items-center gap-[6px] [font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[18px] px-[10px] py-[4px] rounded-[22px] border bg-[#4a2300] text-[#ff9400]"
      style={{ borderColor: "rgba(255,148,0,0.2)" }}
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
              className="shrink-0 flex items-center justify-center px-[12px] py-[8px] rounded-[100px] bg-[#222737] hover:bg-[#2a3040] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#6c779d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965]"
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
          className="w-full h-[32px] flex items-center rounded-[8px] bg-[#222737] px-[12px] py-[8px] [font-family:'Gilroy',sans-serif] font-medium text-[15px] text-white focus:outline-none"
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

/* ── Policy rule detail - read-only view of a brain-core policy rule ─────────
   Shows all DSL fields: applies_to, when conditions, execute, require,
   plus policy version + quorum metadata. No Pause/Resume/Delete. */

function PolicyDetailHeader({ rule }: { rule: PolicyContentRule }) {
  const [, navigate] = useLocation();
  const rawName = rule.id.replace(/[-_]/g, " ");
  const appliesTo = (rule.applies_to ?? [])
    .map((a) => APPLIES_TO_LABEL[a] ?? a)
    .join(", ") || "any action";
  const executeLabel = EXECUTE_LABEL[rule.execute ?? "confirm"] ?? (rule.execute ?? "unknown");

  return (
    <div className="content-stretch flex flex-col gap-[24px] items-start relative shrink-0 w-full">
      {/* Back button, same pill style as automations/guardrails/suggested tabs */}
      <button
        type="button"
        onClick={() => navigate("/rules?tab=default")}
        data-testid="button-back-to-rules"
        className="flex items-center justify-center gap-[4px] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#6c779d] hover:text-[#a8b9f4] bg-[#222737] hover:bg-[#2a3040] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965] rounded-[100px] px-[12px] py-[8px]"
      >
        <ArrowLeft size={16} /> Back to Rules
      </button>

      {/* Title + Read-Only tag + subtitle + policy-id. Same spacing/format as automations/guardrails/suggested */}
      <div className="flex items-start gap-[12px] w-full">
        <div className="flex flex-col gap-[6px] flex-1 min-w-px">
          <div className="flex items-center gap-[10px] flex-wrap">
            <p
              className="[font-family:'Gilroy',sans-serif] font-semibold leading-[32px] text-[#a8b9f4] text-[26px]"
              data-testid="text-rule-name"
            >
              {titleCase(rawName)}
            </p>
            <span
              data-testid="pill-rule-status"
              className="bg-[#240757] border border-[rgba(118,49,238,0.2)] border-solid flex items-center justify-center px-[10px] py-[4px] rounded-[22px] shrink-0 [font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#7631ee] text-[14px] text-center"
            >
              Read-Only
            </span>
          </div>
          <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px]">
            {titleCase(appliesTo)} · {titleCase(executeLabel)}
          </p>
          <p className="[font-family:'JetBrains_Mono',monospace] leading-[18px] text-[#414965] text-[12px]">
            {rule.id} · From your active Brain policy
          </p>
        </div>
      </div>
    </div>
  );
}

function PolicyDetailBody({ rule }: { rule: PolicyContentRule }) {
  const { format } = useCurrency();
  const conditions = describeWhen(rule.when ?? {}, format);
  const appliesTo = rule.applies_to ?? [];
  const hasRequire = !!rule.require;
  const execute = rule.execute ?? "confirm";

  return (
    <div className="content-stretch flex flex-col gap-[16px] items-start relative shrink-0 w-full">
      {/* DSL fields panel - matches Figma "Popup - Search Results" */}
      <div className="bg-[#0a0c10] content-stretch flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
        {/* Panel header */}
        <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid content-stretch flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
          <div className="content-stretch flex flex-[1_0_0] items-center min-w-px relative">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px] whitespace-nowrap">
              Rule Definition
            </p>
          </div>
        </div>

        {/* Panel body - rows with dividers */}
        <div className="content-stretch flex flex-col items-start p-[8px] relative shrink-0 w-full">
          <div className="content-stretch flex flex-col gap-[8px] items-start relative shrink-0 w-full">
            {/* ID row */}
            <div className="bg-[#0a0c10] content-stretch flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
              <div className="content-stretch flex flex-col items-start justify-center relative shrink-0 w-[160px]">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">
                  ID
                </p>
              </div>
              <div className="content-stretch flex flex-[1_0_0] flex-col items-end justify-center min-w-px relative">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  {rule.id}
                </p>
              </div>
            </div>

            <div className="h-px shrink-0 w-full" style={{ background: "#1d2132" }} />

            {/* Applies To row */}
            <div className="bg-[#0a0c10] content-stretch flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
              <div className="content-stretch flex flex-col items-start justify-center relative shrink-0 w-[160px]">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">
                  Applies To
                </p>
              </div>
              <div className="content-stretch flex flex-[1_0_0] flex-col items-end justify-center min-w-px relative">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  {appliesTo.length > 0 ? appliesTo.join(", ") : "any action"}
                </p>
              </div>
            </div>

            <div className="h-px shrink-0 w-full" style={{ background: "#1d2132" }} />

            {/* When row */}
            <div className="bg-[#0a0c10] content-stretch flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
              <div className="content-stretch flex flex-col items-start justify-center relative shrink-0 w-[160px]">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">
                  When
                </p>
              </div>
              <div className="content-stretch flex flex-[1_0_0] flex-col items-end justify-center min-w-px relative">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  {conditions.length > 0 ? conditions.join(" · ") : "always"}
                </p>
              </div>
            </div>

            <div className="h-px shrink-0 w-full" style={{ background: "#1d2132" }} />

            {/* Execute row */}
            <div className="bg-[#0a0c10] content-stretch flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
              <div className="content-stretch flex flex-col items-start justify-center relative shrink-0 w-[160px]">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">
                  Execute
                </p>
              </div>
              <div className="content-stretch flex flex-[1_0_0] flex-col items-end justify-center min-w-px relative">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  {execute}
                </p>
              </div>
            </div>

            {hasRequire && (
              <>
                <div className="h-px shrink-0 w-full" style={{ background: "#1d2132" }} />
                <div className="bg-[#0a0c10] content-stretch flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
                  <div className="content-stretch flex flex-col items-start justify-center relative shrink-0 w-[160px]">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">
                      Requires
                    </p>
                  </div>
                  <div className="content-stretch flex flex-[1_0_0] flex-col items-end justify-center min-w-px relative">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">
                      {formatRequire(rule.require!)}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Info banner — moved below the table; matches Inbox purple style */}
      <div
        className="flex items-start gap-[10px] p-[12px] rounded-[12px] w-full"
        style={{ background: "#240757", border: "1px solid rgba(118,49,238,0.2)" }}
        data-testid="text-policy-info"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 mt-[2px]">
        <circle cx="8" cy="8" r="7" stroke="#7631ee" strokeWidth="1.3" />
        <path d="M8 7.3v4.2" stroke="#7631ee" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="8" cy="4.7" r="0.9" fill="#7631ee" />
      </svg>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#7631ee] text-[14px]">
          This rule is part of your Brain core default policy. It is enforced by Brain for every action and cannot be edited or paused from this app. Changes must be made through Brain core’s admin layer.
        </p>
      </div>
    </div>
  );
}
