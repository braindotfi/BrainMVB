import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { INLINE_FIGMA } from "@/assets/inline-figma-icons";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { useAuth } from "@/lib/authContext";

/* Brain Did widget icons (Figma 3839:43693) — green circle with checkmark */
const IMG_CHECK_ELLIPSE = INLINE_FIGMA.homeCheckEllipse;
const IMG_CHECK_VECTOR  = INLINE_FIGMA.homeCheckVector;

/* Brain Detected widget icons (Figma 3839:43709) — orange circle with "i" */
const IMG_INFO_ELLIPSE = INLINE_FIGMA.homeInfoEllipse;
const IMG_INFO_VEC1    = INLINE_FIGMA.homeInfoVec1;
const IMG_INFO_VEC2    = INLINE_FIGMA.homeInfoVec2;

/* Each entry mirrors a row on the Activity page. activityId matches
   the ActivityItemData.id values declared in ActivityPage. */
const BRAIN_DID = [
  { id: 1, label: "Paid Adobe Creative Cloud (team plan)", activityId: 1 },
  { id: 2, label: "Paid Comcast Business Fiber", activityId: 2 },
  { id: 3, label: "Moved idle USDC from operating to AAVE yield protocol", activityId: 4 },
];

const BRAIN_DETECTED = [
  { id: 1, label: "Noticed a new charge from a new vendor", activityId: 3 },
  { id: 2, label: "Got paid by Northstar Design", activityId: 5 },
];

/* ─── Your Goals (Figma 3882:43037) — progress bars per goal ─── */
type GoalRow = {
  id: string;
  name: string;
  vault: string;
  saved: number;
  target: number;
  /** Tailwind/CSS color for the progress bar fill. */
  color: string;
};

const GOALS: GoalRow[] = [
  { id: "tax",       name: "Q2 tax reserve",       vault: "USDC Vault", saved: 60_000, target: 100_000, color: "#42bf23" },
  { id: "runway",    name: "Operating runway",     vault: "USDC",       saved:  4_000, target:  10_000, color: "#ff9500" },
  { id: "marketing", name: "Q4 marketing budget",  vault: "USDC Vault", saved:    400, target:   2_000, color: "#7631EE" },
  { id: "equipment", name: "New equipment fund",   vault: "sUSDS",      saved:  4_295, target:   8_000, color: "#d20344" },
];

const fmt = (n: number) => `$${n.toLocaleString("en-US")}`;

const GoalProgress = ({ goal }: { goal: GoalRow }) => {
  const pct = Math.max(0, Math.min(100, Math.round((goal.saved / goal.target) * 100)));
  return (
    <div className="flex flex-col gap-[8px] w-full" data-testid={`goal-${goal.id}`}>
      <div className="flex items-center justify-between gap-[12px] w-full">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[14px] truncate">
          <span>{goal.name}</span>
          <span className="text-[#6c779d] font-medium"> · {goal.vault}</span>
        </p>
        <div className="flex items-center gap-[12px] shrink-0 [font-family:'JetBrains_Mono',monospace] tabular-nums">
          <p className="text-[#a8b9f4] text-[14px]">
            <span className="font-medium">{fmt(goal.saved)}</span>
            <span className="text-[#6c779d]"> of </span>
            <span className="font-medium">{fmt(goal.target)}</span>
          </p>
          <p className="text-[#6c779d] text-[14px] w-[36px] text-right">{pct}%</p>
        </div>
      </div>
      <div className="h-[6px] w-full rounded-full bg-[#1d2132] overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: goal.color }}
        />
      </div>
    </div>
  );
};

const GoalsSection = () => (
  <div className="bg-[#0a0c10] flex flex-col items-start overflow-hidden rounded-[16px] w-full">
    <div className="border-[#1d2132] border-b border-solid flex items-center px-[16px] py-[14px] w-full">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px]">
        Your Goals
      </p>
    </div>
    <div className="flex flex-col gap-[16px] items-start p-[16px] w-full">
      {GOALS.map((g) => <GoalProgress key={g.id} goal={g} />)}
    </div>
  </div>
);

const GreenCheckIcon = () => (
  <div className="relative rounded-[100px] shrink-0 size-[24px]">
    <div className="absolute left-0 size-[24px] top-0">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_CHECK_ELLIPSE} />
    </div>
    <div className="absolute left-[4px] size-[16px] top-[4px]">
      <div className="absolute inset-[16.65%_12.5%_16.68%_12.5%]">
        <div className="absolute inset-[-7.03%_-6.25%]">
          <img alt="" className="block max-w-none size-full" src={IMG_CHECK_VECTOR} />
        </div>
      </div>
    </div>
  </div>
);

const OrangeInfoIcon = () => (
  <div className="relative rounded-[100px] shrink-0 size-[24px]">
    <div className="absolute left-0 size-[24px] top-0">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_INFO_ELLIPSE} />
    </div>
    <div className="absolute left-[4px] size-[16px] top-[4px]">
      <div className="absolute inset-[12.5%]">
        <div className="absolute inset-[-6.25%]">
          <img alt="" className="block max-w-none size-full" src={IMG_INFO_VEC1} />
        </div>
      </div>
      <div className="absolute inset-[30.18%_46.88%_63.57%_46.88%]">
        <div className="absolute inset-[-25%]">
          <img alt="" className="block max-w-none size-full" src={IMG_INFO_VEC2} />
        </div>
      </div>
    </div>
  </div>
);

type WidgetItem = { id: number; label: string; activityId: number };
const ListItem = ({
  icon,
  label,
  onClick,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  testId: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    data-testid={testId}
    className="flex gap-[8px] items-start p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer outline-none focus-visible:border-[#1d2132] text-left"
  >
    {icon}
    <div className="flex flex-1 flex-col items-start min-w-px relative">
      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[24px] text-[#a8b9f4] text-[16px] w-full">{label}</p>
    </div>
  </button>
);

const SectionWidget = ({
  title,
  count,
  items,
  icon,
  targetTab,
  testIdPrefix,
}: {
  title: string;
  count: number;
  items: WidgetItem[];
  icon: React.ReactNode;
  targetTab: "brain-did" | "brain-detected";
  testIdPrefix: string;
}) => {
  const [, navigate] = useLocation();
  return (
    <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
      <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
        <div className="flex flex-1 gap-[8px] items-center min-w-px relative">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">{title}</p>
          <div className="bg-[#414965] flex flex-col items-center justify-center min-w-[16px] p-[2px] relative rounded-[4px] shrink-0">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[12px] text-[#a8b9f4] text-[12px] text-center whitespace-nowrap">{count}</p>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
        <div className="flex flex-col gap-[8px] items-start relative shrink-0 w-full">
          {items.map((item, idx) => (
            <div key={item.id} className="flex flex-col gap-[8px] w-full">
              <ListItem
                icon={icon}
                label={item.label}
                testId={`${testIdPrefix}-${item.id}`}
                onClick={() => navigate(`/activity?tab=${targetTab}&row=${item.activityId}`)}
              />
              {idx < items.length - 1 && (
                <div className="h-px relative shrink-0 w-full" style={{ background: "#1d2132" }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export function HomePage() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const { user } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Show onboarding once per signed-in user, on first visit to the home screen.
  const onboardingKey = user ? `brain_onboarding_complete_${user.id}` : null;
  useEffect(() => {
    if (!onboardingKey) {
      setShowOnboarding(false);
      return;
    }
    try {
      const done = localStorage.getItem(onboardingKey);
      setShowOnboarding(!done);
    } catch {
      setShowOnboarding(true);
    }
  }, [onboardingKey]);

  const finishOnboarding = () => {
    if (onboardingKey) {
      try { localStorage.setItem(onboardingKey, "1"); } catch {}
    }
    setShowOnboarding(false);
  };

  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[40px] items-start pb-[16px] pt-[40px] px-[16px] w-full">

          {/* Header */}
          <div className="flex flex-col items-start relative shrink-0 w-full">
            <div className="flex items-center relative shrink-0 w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[0] not-italic relative shrink-0 text-[#6c779d] text-[0px] whitespace-nowrap">
                <span className="leading-[24px] text-[20px]">{greeting}, </span>
                <span className="leading-[24px] text-[#a8b9f4] text-[20px]">ACME Inc.</span>
                <span className="leading-[24px] text-[20px]">.</span>
              </p>
            </div>
            <div className="flex items-center relative shrink-0 w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] not-italic relative shrink-0 text-[#a8b9f4] text-[32px] whitespace-nowrap">
                Here's where your money stands today.
              </p>
            </div>
          </div>

          {/* Stat cards row */}
          <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">
            <div className="flex gap-[16px] items-stretch relative shrink-0 w-full">
              <div className="bg-[#0a0c10] flex flex-1 flex-col items-start min-w-px p-[16px] relative rounded-[16px]">
                <div className="flex flex-col gap-[8px] items-start justify-center relative shrink-0 w-full">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#414965] text-[16px] uppercase whitespace-nowrap">Money in all accounts</p>
                  <div className="flex flex-col gap-[8px] items-start not-italic relative shrink-0 w-full">
                    <p className="[font-family:'Gilroy',sans-serif] leading-[0] relative shrink-0 text-[#a8b9f4] text-[0px] w-full">
                      <span className="font-medium leading-[36px] text-[32px]">$86,993</span>
                      <span className="font-medium leading-[36px] text-[#6c779d] text-[20px]">.42</span>
                    </p>
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[24px] relative shrink-0 text-[#414965] text-[20px] w-full">
                      Across bank, crypto and agent accounts.
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-[#0a0c10] flex flex-1 flex-col items-start min-w-px p-[16px] relative rounded-[16px]">
                <div className="flex flex-col gap-[8px] items-start justify-center relative shrink-0 w-full">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#414965] text-[16px] uppercase whitespace-nowrap">You're spending about</p>
                  <div className="flex flex-col gap-[8px] items-start not-italic relative shrink-0 w-full">
                    <p className="[font-family:'Gilroy',sans-serif] leading-[0] relative shrink-0 text-[#a8b9f4] text-[0px] w-full">
                      <span className="font-medium leading-[36px] text-[32px]">$7,324</span>
                      <span className="font-medium leading-[36px] text-[#6c779d] text-[20px]">/mo</span>
                    </p>
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[24px] relative shrink-0 text-[#42bf23] text-[20px] w-full">
$432 less than last month. Nice.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="h-px relative shrink-0 w-full" style={{ background: "#1d2132" }} />

            {/* Middle row: Brain Did (left) + Brain Detected (right) */}
            <div className="flex gap-[16px] items-start relative shrink-0 w-full">
              <div className="flex flex-1 min-w-px">
                <SectionWidget
                  title="Brain Did"
                  count={BRAIN_DID.length}
                  items={BRAIN_DID}
                  icon={<GreenCheckIcon />}
                  targetTab="brain-did"
                  testIdPrefix="row-brain-did"
                />
              </div>
              <div className="flex flex-1 min-w-px">
                <SectionWidget
                  title="Brain Detected"
                  count={BRAIN_DETECTED.length}
                  items={BRAIN_DETECTED}
                  icon={<OrangeInfoIcon />}
                  targetTab="brain-detected"
                  testIdPrefix="row-brain-detected"
                />
              </div>
            </div>

            {/* Your Goals — full width below Brain Did / Brain Detected */}
            <GoalsSection />
          </div>
        </div>
      </ScrollArea>

      <OnboardingFlow
        open={showOnboarding}
        onClose={finishOnboarding}
        onComplete={finishOnboarding}
      />
    </div>
  );
}
