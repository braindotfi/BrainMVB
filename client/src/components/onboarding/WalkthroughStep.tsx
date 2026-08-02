import type { WalkthroughStep as StepContent } from "@/lib/onboardingWalkthrough";
import { capitalCase } from "@/lib/displayLabels";

/* Chip colours follow the app's tag vocabulary. Per the shared convention the
   constants carry the border COLOUR only, so the element adds `border
   border-solid` itself or the stroke renders as nothing. */
const TAG_AUTO = "bg-[#1d2132] text-[#a8b9f4] border-[rgba(168,185,244,0.2)]";
const TAG_NEEDS_YOU = "bg-[#4a2300] text-[#ff9500] border-[rgba(255,149,0,0.2)]";
const TAG_EXAMPLE = "bg-[#222737] text-[#6c779d] border-[rgba(108,119,157,0.2)]";

function Chip({ label, tone, testId }: { label: string; tone: string; testId: string }) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center rounded-[22px] border border-solid px-[8px] py-[3px] [font-family:'Gilroy',sans-serif] font-semibold text-[11px] leading-[14px] whitespace-nowrap ${tone}`}
    >
      {capitalCase(label)}
    </span>
  );
}

/** The rule toggle on step 1. Shown on, and inert: the walkthrough explains
 *  rules, it does not edit them. */
function Toggle() {
  return (
    <span
      aria-hidden
      data-testid="onboarding-row-toggle"
      className="shrink-0 w-[36px] h-[20px] rounded-full bg-[#7631EE] relative"
    >
      <span className="absolute right-[2px] top-[2px] size-[16px] rounded-full bg-white" />
    </span>
  );
}

export function WalkthroughStepView({ step, index }: { step: StepContent; index: number }) {
  const { row } = step;
  return (
    <div className="flex flex-col gap-[20px]" data-testid={`onboarding-step-${index + 1}`}>
      <div className="flex flex-col gap-[8px]">
        <p
          className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]"
          data-testid="onboarding-headline"
        >
          {step.headline}
        </p>
        <p
          className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]"
          data-testid="onboarding-subhead"
        >
          {step.subhead}
        </p>
      </div>

      {row && (
        <div
          className="flex items-center gap-[12px] bg-[#0a0c10] rounded-[16px] p-[16px]"
          data-testid="onboarding-row"
        >
          <div className="flex-1 min-w-0 flex flex-col gap-[4px]">
            <div className="flex items-center gap-[8px] flex-wrap">
              <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[15px] leading-[20px]">
                {row.title}
              </span>
              {row.badge && (
                <Chip
                  label={row.badge.label}
                  tone={row.badge.tone === "auto" ? TAG_AUTO : TAG_NEEDS_YOU}
                  testId="onboarding-row-badge"
                />
              )}
              {/* An illustration is labelled as one. Without this marker a fresh
                  tenant would read these rows as their own history. */}
              {row.isExample && <Chip label="Example" tone={TAG_EXAMPLE} testId="onboarding-row-example" />}
            </div>
            <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[12px] leading-[16px]">
              {row.sub}
            </span>
          </div>

          {row.showToggle && <Toggle />}

          {row.showDecisionButtons && (
            <div className="flex items-center gap-[8px] shrink-0" data-testid="onboarding-row-decisions">
              {/* Disabled on purpose: there is nothing real to decide here, and a
                  live-looking button on an example would be a lie about what the
                  walkthrough is showing. */}
              <button
                type="button"
                disabled
                className="px-[12px] py-[6px] rounded-[100px] bg-[#0f2f1c] [font-family:'Gilroy',sans-serif] font-semibold text-[13px] leading-[16px] text-[#4ade80] opacity-50 cursor-default"
              >
                Approve
              </button>
              <button
                type="button"
                disabled
                className="px-[12px] py-[6px] rounded-[100px] bg-[#350011] [font-family:'Gilroy',sans-serif] font-semibold text-[13px] leading-[16px] text-[#d20344] opacity-50 cursor-default"
              >
                Decline
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
