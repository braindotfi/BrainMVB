import { useCallback, useEffect, useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import closeIcon from "@assets/Close_1783293571882.png";
import { useBrainPolicy, autoApproveLimitFromPolicy } from "@/lib/brainPolicy";
import {
  buildWalkthrough,
  readPolicyState,
  WALKTHROUGH_STEPS,
  type WalkthroughRule,
  type WalkthroughStep,
} from "@/lib/onboardingWalkthrough";
import { WalkthroughStepView } from "./onboarding/WalkthroughStep";

interface OnboardingFlowProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

/**
 * First-run walkthrough: a rule, what it auto-approves, what always comes to
 * you. Every specific it states is read from the tenant's live approval policy;
 * see lib/onboardingWalkthrough.ts for why the three read states are kept
 * apart rather than collapsed into one generic screen.
 */
export function OnboardingFlow({ open, onClose, onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState(0);
  const policy = useBrainPolicy();
  const limit = autoApproveLimitFromPolicy(policy.facts);

  const read = readPolicyState({ isLoading: policy.isLoading, isError: policy.isError, limit });

  /* The tenant's own rule for step 1: the first card in policy order, which is
     the one brain-core's VM would evaluate first. */
  const rule: WalkthroughRule | null = useMemo(() => {
    const first = policy.rules[0];
    return first ? { name: first.name, detail: first.scopeSummary ?? first.summary } : null;
  }, [policy.rules]);

  const live = useMemo(() => buildWalkthrough(read, rule), [read.state, (read as { limit?: unknown }).limit, rule]);

  /* Freeze each step's copy the first time it is shown. A policy read that
     lands mid-step would otherwise rewrite the sentence someone is reading —
     and on this screen the sentence is the product. */
  const [frozen, setFrozen] = useState<Record<number, WalkthroughStep>>({});
  useEffect(() => {
    setFrozen((prev) => (prev[step] ? prev : { ...prev, [step]: live[step] }));
  }, [step, live]);
  const shown = frozen[step] ?? live[step];

  const goNext = useCallback(() => {
    setStep((s) => {
      if (s >= WALKTHROUGH_STEPS - 1) {
        onComplete();
        return s;
      }
      return s + 1;
    });
  }, [onComplete]);

  const goBack = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  useEffect(() => {
    if (open) {
      setStep(0);
      setFrozen({});
    }
  }, [open]);

  const isLast = step === WALKTHROUGH_STEPS - 1;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          data-testid="onboarding-backdrop"
        />
        <DialogPrimitive.Content
          aria-describedby="onboarding-description"
          className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] border-solid flex flex-col items-start overflow-hidden rounded-[24px] w-[480px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          data-testid="onboarding-modal"
        >
          {/* Header */}
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-[#1d2132] border-solid h-[56px] relative shrink-0 w-full">
            {step > 0 && (
              <button
                type="button"
                onClick={goBack}
                aria-label="Back"
                data-testid="button-onboarding-back"
                className="absolute left-[11px] top-[11px] size-[32px] rounded-full bg-[#222737] flex items-center justify-center hover:bg-[#2c3247] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M7.5 1.5L3 6L7.5 10.5" stroke="#a8b9f4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}

            <StepDots total={WALKTHROUGH_STEPS} current={step} />

            <DialogPrimitive.Close
              data-testid="button-onboarding-close"
              aria-label="Close"
              className="absolute right-[11px] top-[11px] size-[32px] p-0 hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
            >
              <img src={closeIcon} alt="" className="size-[32px] rounded-full" />
            </DialogPrimitive.Close>

            <DialogPrimitive.Title className="sr-only">How Brain's rules work</DialogPrimitive.Title>
            <DialogPrimitive.Description id="onboarding-description" className="sr-only">
              Step {step + 1} of {WALKTHROUGH_STEPS}
            </DialogPrimitive.Description>
          </div>

          {/* Body */}
          <div className="w-full flex-1 min-h-0 overflow-y-auto overflow-x-hidden" data-testid="onboarding-scroll">
            <div className="flex flex-col gap-[24px] p-[24px] w-full">
              <WalkthroughStepView step={shown} index={step} />

              <div className="flex gap-[16px] items-stretch w-full">
                <button
                  type="button"
                  onClick={onClose}
                  data-testid="button-onboarding-skip"
                  className="flex flex-1 items-center justify-center px-[20px] py-[10px] rounded-[100px] bg-[#222737] hover:bg-[#2c3247] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                >
                  <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">
                    Skip
                  </span>
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  data-testid="button-onboarding-continue"
                  className="flex flex-1 items-center justify-center px-[20px] py-[10px] rounded-[100px] bg-[#4a2300] hover:bg-[#5a2c00] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff9500]"
                >
                  <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#ff9500] text-[16px] whitespace-nowrap">
                    {isLast ? "Got it — take me to Brain" : "Next"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* Step indicator */
function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-[8px] px-[12px] py-[6px] rounded-full bg-[#1a0d33]">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`block rounded-full transition-colors ${
            i === current ? "bg-[#7631EE] size-[8px]" : "bg-[rgba(118,49,238,0.3)] size-[6px]"
          }`}
        />
      ))}
    </div>
  );
}
