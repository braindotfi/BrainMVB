import { useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import closeIcon from "@assets/Close_1783293571882.png";
import { useQuery } from "@tanstack/react-query";
import { formatThousandsInput, parseAmt, stripCommas } from "@/lib/formatters";

/* AddGoalModal, Figma 4074:65865 ("New Goal").
   Same modal chrome as the Review popup (440px, rounded-24,
   #11141b BG, blurred 56px title bar, #1d2132 stroke). The body
   scrolls when content exceeds viewport height. */

export type AddGoalPayload = {
  category: string;
  name: string;
  amount: string;
  timeline: string;
  priority: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (goal: AddGoalPayload) => void | Promise<void>;
  /** When true, the Create button shows a loading state and is disabled. */
  isSubmitting?: boolean;
};

const CATEGORIES = [
  "Pay Off Debt",
  "Build Reserve",
  "Hit Milestone",
  "Cut Spend",
  "Capital Deploy",
  "Other",
];

const TIMELINES = ["6 months", "12 months", "18 months", "Custom"];

/* Comparison anchors shown in the priority card. Each one has a baseline
   priority value so the user's new goal can be re-ranked against them in
   real time as the slider moves. All four entries are intentionally
   different goals (no duplicates). */
const PRIORITY_ANCHORS: { name: string; priority: number }[] = [
  { name: "Hit $5M ARR",            priority: 88 },
  { name: "Reach 18-month runway",  priority: 64 },
  { name: "Q4 marketing budget",    priority: 35 },
];

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="flex gap-[8px] items-center w-full">
    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#6c779d] text-[14px] whitespace-nowrap">
      {children}
    </p>
    <div className="flex-1 h-px bg-[#1d2132]" />
  </div>
);

const Chip = ({
  children,
  selected,
  onClick,
  testId,
}: {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
  testId?: string;
}) => (
  <button
    type="button"
    data-testid={testId}
    onClick={onClick}
    className={
      "flex items-center justify-center px-[8px] py-[6px] rounded-[100px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] " +
      (selected ? "bg-[#4a2300] hover:bg-[#5a2c00]" : "bg-[#06070a] hover:bg-[#101218]")
    }
  >
    <span
      className={
        "[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[14px] whitespace-nowrap " +
        (selected ? "text-[#ff9500]" : "text-[#414965]")
      }
    >
      {children}
    </span>
  </button>
);

/* Figma 4077:66106, amber-filled circle (#4A2300) with an inverted
   exclamation glyph (#FF9500). The inner glyph is the 12px icon offset
   2px in from each edge of the 16px circle, matching the Figma layers. */
const HintIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="block shrink-0"
    aria-hidden
  >
    <circle cx="8" cy="8" r="8" fill="#4A2300" />
    <path
      d="M8 4.5L8.005 9M8 11.498H8.005"
      stroke="#FF9500"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);


/* Pulls a category-specific recommendation from Brain (Claude). The query is
   keyed on category so switching tabs swaps the hint without re-fetching what
   we've already loaded. Falls back gracefully on error. */
const RecommendationCard = ({ category }: { category: string }) => {
  const { data, isLoading, isError } = useQuery<{ text: string }>({
    queryKey: ["/api/goals/recommendation", category],
    queryFn: async ({ queryKey }) => {
      const [base, cat] = queryKey as [string, string];
      const res = await fetch(`${base}?category=${encodeURIComponent(cat)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: Boolean(category),
    staleTime: 30 * 60 * 1000,
  });

  const text = isLoading
    ? "Brain is sizing this up against your account…"
    : isError
      ? "Brain couldn't reach the recommendation engine. Pick a target you can defend and continue."
      : data?.text ?? "";

  return (
    <div
      data-testid="card-goal-recommendation"
      className="border border-[#1d2132] border-solid flex items-center p-[8px] rounded-[12px] w-full"
    >
      <div className="flex flex-1 gap-[8px] items-start min-w-0">
        <span className="relative shrink-0 size-[16px] mt-[1px]">
          <HintIcon />
        </span>
        <p
          data-testid="text-goal-recommendation"
          className={
            "flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[14px] " +
            (isLoading ? "text-[#414965] italic" : "text-[#6c779d]")
          }
        >
          {text}
        </p>
      </div>
    </div>
  );
};

export const AddGoalModal = ({ open, onOpenChange, onCreate, isSubmitting }: Props) => {
  const [category, setCategory] = useState("Pay Off Debt");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [amountFocused, setAmountFocused] = useState(false);
  const [amountTouched, setAmountTouched] = useState(false);
  const [timeline, setTimeline] = useState("12 months");
  const [priority, setPriority] = useState(29);

  /* Validate the typed amount. Empty is "not yet entered"; anything that
     parses to <= 0 is invalid. Only surface the error after the field has
     lost focus once so we don't yell at users mid-keystroke. */
  const amountNumber = parseAmt(amount);
  const amountEmpty = stripCommas(amount).trim() === "";
  const amountInvalid = !amountEmpty && amountNumber <= 0;
  const amountError =
    amountTouched && (amountEmpty ? "Enter a target amount." : amountInvalid ? "Amount must be greater than zero." : "");

  /* Build the live ranked list. The new goal joins the anchors and is
     re-sorted by priority on every slider tick. Higher priority bubbles
     it up the list in real time. If the user hasn't typed a name yet we
     keep the original "Your new goal will go here" placeholder copy. */
  const rankedList = useMemo(() => {
    const newGoal = {
      key: "new",
      name: name.trim() || "Your new goal will go here",
      placeholder: name.trim().length === 0,
      isNew: true,
      priority,
    };
    const anchors = PRIORITY_ANCHORS.map((a, i) => ({
      key: `anchor-${i}`,
      name: a.name,
      placeholder: false,
      isNew: false,
      priority: a.priority,
    }));
    return [...anchors, newGoal]
      .sort((a, b) => b.priority - a.priority)
      .map((row, idx) => ({ ...row, rank: idx + 1 }));
  }, [name, priority]);

  const inputClass =
    "bg-[#222737] flex items-center px-[8px] py-[10px] rounded-[8px] w-full " +
    "[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[16px] " +
    "placeholder:text-[#6c779d] outline-none focus:ring-2 focus:ring-[#7631EE]";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-testid="add-goal-modal-backdrop"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          aria-describedby="add-goal-modal-description"
          data-testid="add-goal-modal"
          className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] border-solid flex flex-col items-start overflow-hidden rounded-[24px] w-[440px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          {/* Title bar, Figma 4074:65866. */}
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border border-[#1d2132] border-solid h-[56px] relative shrink-0 w-full">
            <DialogPrimitive.Title className="absolute left-1/2 -translate-x-1/2 top-[calc(50%-12px)] [font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#a8b9f4] text-[20px] text-center whitespace-nowrap">
              New Goal
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              data-testid="button-add-goal-close"
              aria-label="Close"
              className="absolute right-[11px] top-[11px] size-[32px] p-0 hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
            >
              <img src={closeIcon} alt="" className="size-[32px] rounded-full" />
            </DialogPrimitive.Close>
          </div>

          {/* Scrollable body, gap-24, p-24 per Figma. */}
          <div className="flex flex-col gap-[24px] items-start p-[24px] w-full overflow-y-auto">
            <DialogPrimitive.Description
              id="add-goal-modal-description"
              className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px] w-full"
            >
              Tell Brain what your business is working toward. Agents will run it under signed policy.
            </DialogPrimitive.Description>

            {/* What's it for? */}
            <div className="flex flex-col gap-[8px] items-start w-full">
              <SectionLabel>What&rsquo;s it for?</SectionLabel>
              <div className="flex flex-wrap gap-[8px] items-center w-full">
                {CATEGORIES.map((c) => (
                  <Chip
                    key={c}
                    selected={category === c}
                    onClick={() => setCategory(c)}
                    testId={`chip-category-${c.replace(/\s+/g, "-").toLowerCase()}`}
                  >
                    {c}
                  </Chip>
                ))}
              </div>
            </div>

            {/* Brain hint card: dynamic recommendation per selected category */}
            <RecommendationCard category={category} />

            {/* Goal name */}
            <div className="flex flex-col gap-[8px] items-start w-full">
              <SectionLabel>What do you want to call it?</SectionLabel>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Reach 18-month runway, Hit $5M ARR etc"
                data-testid="input-goal-name"
                className={inputClass}
              />
            </div>

            {/* Target amount */}
            <div className="flex flex-col gap-[8px] items-start w-full">
              <SectionLabel>Target amount</SectionLabel>
              <div
                className={
                  "bg-[#222737] flex items-center gap-[4px] px-[8px] py-[10px] rounded-[8px] w-full transition-shadow " +
                  (amountError
                    ? "ring-2 ring-[#d20344]"
                    : amountFocused
                      ? "ring-2 ring-[#7631EE]"
                      : "")
                }
              >
                <span
                  aria-hidden
                  className={
                    "[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[16px] " +
                    (amountEmpty ? "text-[#6c779d]" : "text-[#a8b9f4]")
                  }
                >
                  $
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(e) => setAmount(formatThousandsInput(e.target.value))}
                  onFocus={() => setAmountFocused(true)}
                  onBlur={() => {
                    setAmountFocused(false);
                    setAmountTouched(true);
                  }}
                  onKeyDown={(e) => {
                    // Block obviously invalid keys early so the field stays clean.
                    const allowed =
                      e.ctrlKey ||
                      e.metaKey ||
                      e.key.length > 1 || // Backspace, Tab, Arrow*, etc.
                      /[0-9.]/.test(e.key);
                    if (!allowed) e.preventDefault();
                  }}
                  placeholder="20,000"
                  aria-invalid={amountError ? true : undefined}
                  aria-describedby={amountError ? "input-goal-amount-error" : undefined}
                  data-testid="input-goal-amount"
                  className="flex-1 bg-transparent outline-none [font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[16px] placeholder:text-[#6c779d]"
                />
              </div>
              {amountError && (
                <p
                  id="input-goal-amount-error"
                  data-testid="text-goal-amount-error"
                  className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#d20344] text-[13px]"
                >
                  {amountError}
                </p>
              )}
            </div>

            {/* By when */}
            <div className="flex flex-col gap-[8px] items-start w-full">
              <SectionLabel>By when?</SectionLabel>
              <div className="flex flex-wrap gap-[8px] items-center w-full">
                {TIMELINES.map((t) => (
                  <Chip
                    key={t}
                    selected={timeline === t}
                    onClick={() => setTimeline(t)}
                    testId={`chip-timeline-${t.replace(/\s+/g, "-").toLowerCase()}`}
                  >
                    {t}
                  </Chip>
                ))}
              </div>
            </div>

            {/* Priority */}
            <div className="flex flex-col gap-[8px] items-start w-full">
              <SectionLabel>How important is this goal compared to others?</SectionLabel>
              <div className="bg-[#0a0c10] flex flex-col gap-[16px] items-start p-[16px] rounded-[16px] w-full">
                <div className="flex flex-col items-start w-full">
                  <div className="flex justify-between w-full">
                    <p className="[font-family:'JetBrains_Mono',monospace] font-semibold leading-[12px] text-[#6c779d] text-[12px]">
                      Lower Priority
                    </p>
                    <p className="[font-family:'JetBrains_Mono',monospace] font-semibold leading-[12px] text-[#6c779d] text-[12px] text-right">
                      Higher Priority
                    </p>
                  </div>
                  {/* Slider: native range hidden over a styled track + knob. */}
                  <div className="relative h-[32px] w-full mt-[8px]">
                    <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[6px] bg-[#222737] rounded-[3px]" />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 left-0 h-[6px] bg-[#ff9500] rounded-[3px]"
                      style={{ width: `${priority}%` }}
                    />
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={priority}
                      onChange={(e) => setPriority(Number(e.target.value))}
                      data-testid="input-goal-priority"
                      aria-label="Goal priority"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-[24px] bg-white rounded-full shadow-[0_0.5px_4px_0_rgba(0,0,0,0.12),0_6px_13px_0_rgba(0,0,0,0.12)] pointer-events-none"
                      style={{ left: `${priority}%` }}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-[8px] items-start w-full">
                  {rankedList.map((p) => (
                    <div
                      key={p.key}
                      data-testid={`priority-row-${p.key}`}
                      className="flex gap-[8px] items-center w-full"
                    >
                      <span
                        className="size-[6px] rounded-full shrink-0"
                        style={{
                          backgroundColor: p.isNew
                            ? p.placeholder
                              ? "#414965"
                              : "#ff9500"
                            : "#42bf23",
                        }}
                      />
                      <p
                        className={
                          "flex-1 [font-family:'Gilroy',sans-serif] leading-[16px] text-[14px] truncate " +
                          (p.placeholder
                            ? "text-[#414965] font-medium"
                            : p.isNew
                              ? "text-[#ff9500] font-semibold"
                              : "text-[#6c779d] font-medium")
                        }
                      >
                        {p.name}
                      </p>
                      <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[16px] text-[#414965] text-[13px] whitespace-nowrap">
                        {p.placeholder ? "--" : `Ranked ${p.rank}`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Policy banner */}
            <div className="bg-[#240757] border border-[rgba(118,49,238,0.2)] border-solid flex items-center p-[8px] rounded-[8px] w-full">
              <p className="flex-1 [font-family:'Gilroy',sans-serif] leading-[16px] text-[#7631ee] text-[14px]">
                <span className="font-medium">You can change any of this later. P</span>
                <span className="font-semibold">olicy v3 will apply.</span>
              </p>
            </div>

            {/* Create button */}
            <button
              type="button"
              data-testid="button-add-goal-create"
              disabled={isSubmitting}
              onClick={() => {
                if (amountEmpty || amountInvalid) {
                  setAmountTouched(true);
                  return;
                }
                onCreate({ category, name, amount: stripCommas(amount), timeline, priority });
              }}
              className="flex items-center justify-center px-[20px] py-[10px] rounded-[100px] bg-[#123509] hover:bg-[#174710] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#42bf23] w-full disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#42bf23] text-[16px] whitespace-nowrap">
                {isSubmitting ? "Creating…" : "Create"}
              </span>
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
