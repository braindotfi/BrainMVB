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
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Shield,
} from "lucide-react";
import { useRule, pauseRule, resumeRule, lowerCap, setThreshold, deleteRule } from "@/lib/rulesStore";
import {
  usePolicyRule,
  APPLIES_TO_LABEL,
  EXECUTE_LABEL,
  describeWhen,
  policyRuleLabel,
} from "@/lib/brainPolicy";
import type { PolicyContentRule } from "@/lib/brainPolicy";
import { useCurrency } from "@/lib/useCurrency";
import type { ProblemReport, RuleHistoryEvent } from "@/lib/proposalTypes";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import closeIcon from "@assets/Close_1783293571882.png";
import playIcon from "@assets/play_1783376650313.png";
import deleteIcon from "@assets/delete_1783376650313.png";
import pauseIcon from "@assets/pause_1783376736546.png";
import { AlertCallout, InfoIcon, PolicyCallout } from "@/components/Callout";
import { Divider, WidgetPanel } from "@/components/LedgerWidgets";


/* Rule detail: the destination of "Report a problem → pause and review".
   #D20344 is reserved for problem/alert accents ONLY; affirmative actions use
   purple #7631ee. Amounts / dates / policy ids render monospace. ──────────── */
export function RuleDetail() {
  const [, params] = useRoute("/rules/:id");
  const [, navigate] = useLocation();
  const { format, symbol } = useCurrency();
  const rule = useRule(params?.id);
  const {
    rule: policyRule,
    policyLabel,
    isLoading: policyLoading,
    isError: policyError,
  } = usePolicyRule(params?.id);
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
      <div className="bg-brain-v1baby-blue-5 border border-brain-v1stroke-2 border-solid overflow-hidden relative rounded-panel size-full flex flex-col items-center justify-center gap-[16px] p-[24px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold text-brain-v1baby-blue-100 text-[18px] leading-[24px]">
          Loading policy rule…
        </p>
        <Button
          variant="primary"
          onClick={() => navigate("/ledger?tab=rules&rules=default")}
          data-testid="button-back-to-rules"
          className="border border-[rgba(118,49,238,0.35)]"
        >
          <ArrowLeft size={16} /> Back
        </Button>
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
      <div className="bg-brain-v1baby-blue-5 border border-brain-v1stroke-2 border-solid overflow-hidden relative rounded-panel size-full flex flex-col items-center justify-center gap-[16px] p-[24px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold text-brain-v1baby-blue-100 text-[18px] leading-[24px]">
          {isPolicy ? "This policy rule is not available right now." : "This rule no longer exists."}
        </p>
        <Button
          variant="primary"
          onClick={() => navigate(isPolicy ? "/ledger?tab=rules&rules=default" : "/ledger?tab=rules")}
          data-testid="button-back-to-rules"
          className="border border-[rgba(118,49,238,0.35)]"
        >
          <ArrowLeft size={16} /> Back
        </Button>
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
    navigate("/ledger?tab=rules");
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
    <div className="bg-brain-v1baby-blue-5 border border-brain-v1stroke-2 border-solid overflow-hidden relative rounded-panel size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[24px] items-start pb-[24px] pt-[32px] px-[16px] w-full">

          {/* Back button. Routes to the correct tab based on rule type.
              Policy rules render their own back pill inside PolicyDetailHeader. */}
          {!isPolicy && (
            <Button
              variant="secondary"
              size="compact"
              onClick={() => {
                let tab = "default";
                if (rule) {
                  tab =
                    rule.kind === "guardrail"
                      ? "guardrails"
                      : "automations";
                }
                navigate(`/ledger?tab=rules&rules=${tab}`);
              }}
              data-testid="button-back-to-rules"
              className="hover:text-brain-v1baby-blue-100"
            >
              <ArrowLeft size={16} /> Back
            </Button>
          )}

          {isPolicy && policyRule ? (
            <PolicyDetailHeader rule={policyRule} policyLabel={policyLabel} />
          ) : rule ? (
            <div className="flex items-start gap-[12px] w-full">
              <div className="flex flex-col gap-[6px] flex-1 min-w-px">
                <div className="flex items-center gap-[10px] flex-wrap">
                  <p
                    className="[font-family:'Gilroy',sans-serif] font-semibold leading-[32px] text-brain-v1baby-blue-100 text-[26px]"
                    data-testid="text-rule-name"
                  >
                    {rule.name}
                  </p>
                  <StatusPill active={rule.active} />
                </div>
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-brain-v1baby-blue-60 text-[14px]">
                  {rule.summary}
                </p>
                <p className="[font-family:'JetBrains_Mono',monospace] leading-[16px] text-brain-v1baby-blue-60 text-[12px]" data-testid="text-rule-policy-id">
                  {rule.policyId} · {rule.createdLabel}
                </p>
              </div>
            </div>
          ) : null}

          {/* Paused-from-report banner: #D20344 accent, with the linked payment. */}
          {pausedFromReport && (
            <AlertCallout title="Paused after you reported a problem" testId="banner-paused-from-report">
              You flagged “{latestOpen?.reason}” on a payment this rule cleared. It won’t auto-clear anything new until you resume it.
            </AlertCallout>
          )}

          {/* Policy rule detail body: read-only, shows all DSL fields */}
          {isPolicy && policyRule && (
            <PolicyDetailBody rule={policyRule} policyLabel={policyLabel} />
          )}

          {/* Everything below is ONLY for app-local rules */}
          {!isPolicy && rule && (
            <>

          {/* Status banner. Matches Figma's "Info Circle" info pill. */}
          <div
            className="w-full rounded-row border border-brain-v1stroke-2 p-[8px] flex items-center gap-[8px]"
            data-testid="text-what-changed"
          >
            <InfoIcon color="#6c779d" className="mt-[2px]" />
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[14px] text-brain-v1baby-blue-60">
              {rule.active ? (
                <>
                  This rule is <span className="font-semibold text-brain-v1green">active</span>. It auto-clears {titleCase(rule.scopeSummary ?? "matching payments")} automatically.
                </>
              ) : (
                <>
                  This rule is <span className="font-semibold text-brain-v1light-orange">paused</span> . Payments it used to auto-clear ({titleCase(rule.scopeSummary ?? "matching payments")}) will now wait for your approval in Needs Review.
                </>
              )}
            </p>
          </div>

          {/* Rule status: Pause/Resume + Delete. Matches Figma's "Rule Status" card. */}
          <WidgetPanel><div className="p-[16px] flex flex-col gap-[12px]">
            <div className="flex items-center justify-between gap-[16px] flex-wrap">
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[24px] text-brain-v1baby-blue-60 text-[20px]">
                Rule Status
              </p>
              <div className="flex items-center gap-[8px]">
                <Button
                  variant={rule.active ? "warning" : "success"}
                  size="compact"
                  onClick={() => (rule.active ? pauseRule(rule.id) : setResumeModalOpen(true))}
                  data-testid="button-toggle-rule"
                >
                  <img src={rule.active ? pauseIcon : playIcon} alt="" className="shrink-0 size-[16px]" />
                  {rule.active ? "Pause Rule" : "Resume Rule"}
                </Button>
                <Button
                  variant="destructive"
                  size="compact"
                  onClick={() => setConfirmingDelete(true)}
                  data-testid="button-delete-rule"
                >
                  <img src={deleteIcon} alt="" className="shrink-0 size-[16px]" /> Delete Rule
                </Button>
              </div>
            </div>

          </div></WidgetPanel>

          {/* Paused-from-report banner: orange accent. Matches Figma's flagged banner under Rule Status. */}
          {pausedFromReport && (
            <AlertCallout title="Paused after you reported a problem" testId="banner-paused-from-report">
              You flagged “{latestOpen?.reason}” on a payment this rule cleared. It won’t auto-clear anything new until you resume it.
            </AlertCallout>
          )}

          {/* Resume-rule confirmation: dim/blur backdrop modal, matches other popups. */}
          <DialogPrimitive.Root open={resumeModalOpen} onOpenChange={setResumeModalOpen}>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
                data-testid="resume-rule-backdrop"
              />
              <DialogPrimitive.Content
                className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-brain-v1highlight-dropdown-bg border border-brain-v1stroke-2 border-solid flex flex-col items-start overflow-hidden rounded-modal w-[440px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
                data-testid="resume-rule-modal"
              >
                {/* Title bar */}
                <div className="bg-brain-v1highlight-dropdown-bg border-b border-brain-v1stroke-2 border-solid h-[56px] relative shrink-0 w-full flex items-center justify-center">
                  <DialogPrimitive.Title className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-brain-v1baby-blue-100 text-[20px] text-center whitespace-nowrap">
                    Resume Rule
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Close
                    data-testid="button-resume-modal-close"
                    aria-label="Close"
                    className="absolute right-[11px] top-[11px] size-[32px] p-0 hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
                  >
                    <img src={closeIcon} alt="" className="size-[32px] rounded-full" />
                  </DialogPrimitive.Close>
                </div>

                {/* Body */}
                <div className="flex flex-col gap-[24px] items-start p-[40px] w-full overflow-y-auto">
                  <DialogPrimitive.Description
                    className="[font-family:'Gilroy',sans-serif] font-medium leading-[28px] text-brain-v1baby-blue-100 text-[22px]"
                  >
                    Resuming lets this rule auto-clear {titleCase(rule.scopeSummary ?? "matching payments")} again automatically. Make sure you’ve resolved what you reported first.
                  </DialogPrimitive.Description>

                  <div className="flex gap-[16px] items-center w-full">
                    <Button
                      variant="secondary"
                      size="large"
                      className="flex-1"
                      onClick={() => setResumeModalOpen(false)}
                      data-testid="button-resume-cancel"
                    >
                      Keep Paused
                    </Button>
                    <Button
                      variant="success"
                      size="large"
                      className="flex-1"
                      onClick={onResume}
                      data-testid="button-resume-confirm"
                    >
                      Resume
                    </Button>
                  </div>
                </div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>

          {/* Delete-rule confirmation: matches Figma node 6252:69510. */}
          <DialogPrimitive.Root open={confirmingDelete} onOpenChange={setConfirmingDelete}>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
                data-testid="delete-rule-backdrop"
              />
              <DialogPrimitive.Content
                className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-brain-v1highlight-dropdown-bg border-[0.938px] border-brain-v1stroke-2 border-solid flex flex-col items-start overflow-hidden rounded-modal w-[375px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
                data-testid="delete-rule-modal"
              >
                {/* Title bar */}
                <div className="bg-brain-v1highlight-dropdown-bg border-b border-brain-v1stroke-2 border-solid h-[52.5px] relative shrink-0 w-full flex items-center justify-center">
                  <DialogPrimitive.Title className="[font-family:'Gilroy',sans-serif] font-semibold leading-[22.5px] text-brain-v1baby-blue-100 text-[18.75px] text-center whitespace-nowrap">
                    Delete Rule
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Close
                    data-testid="button-delete-modal-close"
                    aria-label="Close"
                    className="absolute right-[10.94px] top-[11.25px] size-[30px] p-0 hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
                  >
                    <img src={closeIcon} alt="" className="size-[30px] rounded-full" />
                  </DialogPrimitive.Close>
                </div>

                {/* Body */}
                <div className="flex flex-col gap-[20px] items-start p-[30px] w-full overflow-y-auto">
                  <DialogPrimitive.Description
                    className="[font-family:'Gilroy',sans-serif] font-medium leading-[26.25px] text-brain-v1baby-blue-100 text-[20.625px] w-full"
                  >
                    Are you sure you want to delete this rule? Deleting removes this rule entirely. This can’t be undone.
                  </DialogPrimitive.Description>

                  <div className="flex gap-[15px] items-center w-full">
                    <Button
                      variant="secondary"
                      onClick={() => setConfirmingDelete(false)}
                      data-testid="button-delete-cancel"
                      className="w-[150px]"
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={onDelete}
                      data-testid="button-delete-confirm"
                      className="w-[150px]"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>

          {/* Trusted vendors: allowlist removal. Matches Figma's "Popup - Search Results" panel. */}
          {rule.allowlist && rule.allowlist.length > 0 && (
            <WidgetPanel>
              <div className="flex items-center gap-[8px] px-[16px] py-[14px] border-b border-brain-v1stroke-2">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-100 text-[20px]">
                  Trusted Vendors
                </p>
              </div>
              <div className="flex flex-col gap-[8px] p-[8px]">
                {rule.allowlist.map((vendor, i) => (
                  <div key={vendor} className="flex flex-col gap-[8px]">
                    {i > 0 && <div className="h-px w-full bg-brain-v1stroke-2" />}
                    <div
                      className="flex items-center gap-[16px] p-[8px] rounded-[8px]"
                      data-testid={`row-vendor-${vendor.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}
                    >
                      <span className="flex-1 [font-family:'Gilroy',sans-serif] font-semibold text-[16px] leading-[20px] text-brain-v1baby-blue-100 truncate">
                        {vendor}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </WidgetPanel>
          )}

          {/* Amount: threshold / cap edit. Matches Figma's "Amount" panel. */}
          {(typeof rule.threshold === "number" || typeof rule.cap === "number") && (
            <WidgetPanel>
              <div className="flex items-center px-[16px] py-[14px] border-b border-brain-v1stroke-2">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-100 text-[20px]">
                  Amount
                </p>
              </div>
              <div className="flex flex-col gap-[8px] p-[8px]">
                {typeof rule.threshold === "number" && (
                  <AmountRow
                    value={rule.threshold}
                    format={format}
                    symbol={symbol}
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
                  <div className="h-px w-full bg-brain-v1stroke-2" />
                )}
                {typeof rule.cap === "number" && (
                  <AmountRow
                    value={rule.cap}
                    format={format}
                    symbol={symbol}
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
            </WidgetPanel>
          )}

          {/* Reported problems: accordion trail. Matches Figma's "Reported Problems" panel. */}
          <WidgetPanel>
            <div className="flex items-center gap-[8px] px-[16px] py-[14px] border-b border-brain-v1stroke-2">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-100 text-[20px]">
                Reported Problems
              </p>
            </div>
            <div className="flex flex-col gap-[8px] p-[8px]">
              {reports.length === 0 ? (
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-brain-v1baby-blue-60 text-[13px] px-[8px] py-[4px]">
                  No problems reported on this rule yet.
                </p>
              ) : (
                [...reports].reverse().map((r, i) => (
                  <div key={r.id} className="flex flex-col gap-[8px]">
                    {i > 0 && <div className="h-px w-full bg-brain-v1stroke-2" />}
                    <ReportCard report={r} onOpenReceipt={openReceipt} />
                  </div>
                ))
              )}
            </div>
          </WidgetPanel>

          {/* History: created/paused/resumed trail. Matches Figma's panel pattern. */}
          <WidgetPanel>
            <div className="flex items-center gap-[8px] px-[16px] py-[14px] border-b border-brain-v1stroke-2">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-100 text-[20px]">
                History
              </p>
            </div>
            <div className="flex flex-col gap-[8px] p-[8px]">
              {history.length === 0 ? (
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-brain-v1baby-blue-60 text-[13px] px-[8px] py-[4px]">
                  Nothing recorded yet.
                </p>
              ) : (
                [...history].reverse().map((h, i) => (
                  <div key={h.id} className="flex flex-col gap-[8px]">
                    {i > 0 && <div className="h-px w-full bg-brain-v1stroke-2" />}
                    <HistoryRow event={h} />
                  </div>
                ))
              )}
            </div>
          </WidgetPanel>

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
        className="flex items-center gap-[6px] [font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[20px] px-[10px] py-[4px] rounded-pill border bg-brain-v1dark-green text-brain-v1green"
        style={{ borderColor: "rgba(66,191,35,0.2)" }}
      >
        Active
      </span>
    );
  }
  return (
    <span
      data-testid="pill-rule-status"
      className="flex items-center gap-[6px] [font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[20px] px-[10px] py-[4px] rounded-pill border bg-brain-v1dark-orange text-brain-v1light-orange"
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
      className={`w-full rounded-[8px] flex flex-col gap-[8px] p-[8px] ${open ? "bg-brain-v1baby-blue-5 border border-brain-v1stroke-2" : "bg-brain-v1highlight-dropdown-bg"}`}
      data-testid={`card-report-${report.id}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid={`button-toggle-report-${report.id}`}
        className="flex items-center justify-between gap-[10px] w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1baby-blue-30 rounded-[6px]"
      >
        <div className="flex flex-col gap-[4px] min-w-px">
          {/* Record ramp, matching every other title-over-subtext row: medium 16/20
              title, medium 14/16 subtext. This row had both lines at semibold 16/20,
              which made the timestamp compete with the reason. */}
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-100 text-[16px]">
            {report.reason}
          </p>
          <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-brain-v1baby-blue-60 text-[14px]">
            {report.reportedAtLabel}
          </p>
        </div>
        {open ? (
          <ChevronUp size={24} className="shrink-0 text-brain-v1baby-blue-60" />
        ) : (
          <ChevronDown size={24} className="shrink-0 text-brain-v1baby-blue-60" />
        )}
      </button>
      {open && (
        <>
          <div className="h-px w-full bg-brain-v1stroke-2" />
          <div className="flex items-center gap-[16px]">
            {report.note && (
              <p className="flex-1 [font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-60 text-[16px]">
                {report.note}
              </p>
            )}
            <Button
              variant="secondary"
              size="compact"
              onClick={() => onOpenReceipt(report.proposalId)}
              data-testid={`button-report-receipt-${report.id}`}
            >
              View the Receipt
            </Button>
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
      <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[16px] leading-[20px] text-brain-v1baby-blue-100 truncate">
        {event.label}
      </span>
      <span className="[font-family:'JetBrains_Mono',monospace] text-[13px] leading-[18px] text-brain-v1baby-blue-60 shrink-0">
        {event.atLabel}
      </span>
    </div>
  );
}

function AmountRow({
  value,
  format,
  symbol,
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
  symbol: string;
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
          className="flex-1 [font-family:'Gilroy',sans-serif] font-semibold text-[16px] leading-[20px] text-brain-v1baby-blue-100"
          data-testid={testIdValue}
        >
          {format(value)}
        </span>
        <Button
          variant="secondary"
          size="compact"
          onClick={onEditStart}
          data-testid={testIdEdit}
          className="w-[80px]"
        >
          Edit
        </Button>
      </div>
    );
  }
  return (
    <div className="flex gap-[16px] items-center p-[8px] rounded-[8px]">
      <div className="flex-1 min-w-px flex flex-col justify-center">
        <div className="w-full h-[32px] flex items-center rounded-[8px] bg-brain-v1baby-blue-15 px-[12px] [font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-white">
          <span aria-hidden="true" className="shrink-0">{symbol}</span>
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
            aria-label={`Amount in ${symbol}`}
            className="min-w-0 flex-1 h-full bg-transparent pl-[4px] focus:outline-none"
          />
        </div>
      </div>
      <div className="flex gap-[8px] items-center shrink-0">
        <Button
          variant="subtle"
          size="compact"
          onClick={onCancel}
          data-testid={testIdCancel}
          className="w-[80px]"
        >
          Cancel
        </Button>
        <Button
          variant="success"
          size="compact"
          onClick={onSave}
          data-testid={testIdSave}
          className="w-[80px]"
        >
          Save
        </Button>
      </div>
    </div>
  );
}

/* ── Policy rule detail - read-only view of a brain-core policy rule ─────────
   Shows all DSL fields: applies_to, when conditions, execute, require,
   plus policy version + quorum metadata. No Pause/Resume/Delete. */

function PolicyDetailHeader({
  rule,
  policyLabel,
}: {
  rule: PolicyContentRule;
  policyLabel: string;
}) {
  const [, navigate] = useLocation();
  const appliesTo = (rule.applies_to ?? [])
    .map((a) => APPLIES_TO_LABEL[a] ?? a)
    .join(", ") || "any action";
  const executeLabel = EXECUTE_LABEL[rule.execute ?? "confirm"] ?? (rule.execute ?? "unknown");

  return (
    <div className="content-stretch flex flex-col gap-[24px] items-start relative shrink-0 w-full">
      {/* Back button, same pill style as automations/guardrails/suggested tabs */}
      <Button
        variant="secondary"
        size="compact"
        onClick={() => navigate("/ledger?tab=rules&rules=default")}
        data-testid="button-back-to-rules"
        className="hover:text-brain-v1baby-blue-100"
      >
        <ArrowLeft size={16} /> Back
      </Button>

      {/* Title + Read-Only tag + subtitle + policy-id. Same spacing/format as automations/guardrails/suggested */}
      <div className="flex items-start gap-[12px] w-full">
        <div className="flex flex-col gap-[6px] flex-1 min-w-px">
          <div className="flex items-center gap-[10px] flex-wrap">
            <p
              className="[font-family:'Gilroy',sans-serif] font-semibold leading-[32px] text-brain-v1baby-blue-100 text-[26px]"
              data-testid="text-rule-name"
            >
              {policyRuleLabel(rule)}
            </p>
            <span
              data-testid="pill-rule-status"
              className="bg-brain-v1dark-purple border border-[rgba(118,49,238,0.2)] border-solid flex items-center justify-center px-[10px] py-[4px] rounded-pill shrink-0 [font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-brain-v1purple text-[14px] text-center"
            >
              Read-Only
            </span>
          </div>
          <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-brain-v1baby-blue-60 text-[14px]">
            {titleCase(appliesTo)} · {titleCase(executeLabel)}
          </p>
          <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-brain-v1baby-blue-60 text-[12px]">
            From {policyLabel}
          </p>
        </div>
      </div>
    </div>
  );
}

function PolicyDetailBody({
  rule,
  policyLabel,
}: {
  rule: PolicyContentRule;
  policyLabel: string;
}) {
  const { format } = useCurrency();
  const conditions = describeWhen(rule.when ?? {}, format);
  const appliesTo = rule.applies_to ?? [];
  const hasRequire = !!rule.require;
  const execute = rule.execute ?? "confirm";

  return (
    <div className="content-stretch flex flex-col gap-[16px] items-start relative shrink-0 w-full">
      {/* DSL fields panel - matches Figma "Popup - Search Results" */}
      <WidgetPanel>
        {/* Panel header */}
        <div className="bg-brain-v1highlight-dropdown-bg border-brain-v1stroke-2 border-b border-solid content-stretch flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
          <div className="content-stretch flex flex-[1_0_0] items-center min-w-px relative">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-100 text-[20px] whitespace-nowrap">
              Rule Definition
            </p>
          </div>
        </div>

        {/* Panel body - rows with dividers */}
        <div className="content-stretch flex flex-col items-start p-[8px] relative shrink-0 w-full">
          <div className="content-stretch flex flex-col gap-[8px] items-start relative shrink-0 w-full">
            {/* Applies To row */}
            <div className="bg-brain-v1highlight-dropdown-bg content-stretch flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
              <div className="content-stretch flex flex-col items-start justify-center relative shrink-0 w-[160px]">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-60 text-[16px] whitespace-nowrap">
                  Applies To
                </p>
              </div>
              <div className="content-stretch flex flex-[1_0_0] flex-col items-end justify-center min-w-px relative">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-100 text-[16px] whitespace-nowrap">
                  {appliesTo.length > 0
                    ? appliesTo.map((scope) => APPLIES_TO_LABEL[scope] ?? "matching actions").join(", ")
                    : "any action"}
                </p>
              </div>
            </div>

            <Divider />

            {/* When row */}
            <div className="bg-brain-v1highlight-dropdown-bg content-stretch flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
              <div className="content-stretch flex flex-col items-start justify-center relative shrink-0 w-[160px]">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-60 text-[16px] whitespace-nowrap">
                  When
                </p>
              </div>
              <div className="content-stretch flex flex-[1_0_0] flex-col items-end justify-center min-w-px relative">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-100 text-[16px] whitespace-nowrap">
                  {conditions.length > 0 ? conditions.join(" · ") : "always"}
                </p>
              </div>
            </div>

            <Divider />

            {/* Execute row */}
            <div className="bg-brain-v1highlight-dropdown-bg content-stretch flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
              <div className="content-stretch flex flex-col items-start justify-center relative shrink-0 w-[160px]">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-60 text-[16px] whitespace-nowrap">
                  Execute
                </p>
              </div>
              <div className="content-stretch flex flex-[1_0_0] flex-col items-end justify-center min-w-px relative">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-100 text-[16px] whitespace-nowrap">
                  {EXECUTE_LABEL[execute] ?? "requires review"}
                </p>
              </div>
            </div>

            {hasRequire && (
              <>
                <Divider />
                <div className="bg-brain-v1highlight-dropdown-bg content-stretch flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
                  <div className="content-stretch flex flex-col items-start justify-center relative shrink-0 w-[160px]">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-60 text-[16px] whitespace-nowrap">
                      Requires
                    </p>
                  </div>
                  <div className="content-stretch flex flex-[1_0_0] flex-col items-end justify-center min-w-px relative">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-100 text-[16px] whitespace-nowrap">
                      {formatRequire(rule.require!)}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </WidgetPanel>

      {/* Info banner — moved below the table; matches Inbox purple style */}
      <PolicyCallout testId="text-policy-info">
        This rule is part of {policyLabel}. Brain enforces it for every matching action, and it cannot be edited or paused from this app. Changes must be made through Brain core’s admin layer.
      </PolicyCallout>
    </div>
  );
}
