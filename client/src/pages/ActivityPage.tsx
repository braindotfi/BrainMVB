import { useEffect, useMemo, useRef, useState } from "react";
import { useSearch, useLocation } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ICONS } from "@/assets/figma-icons";
import { useIntents, type IntentRecord } from "@/lib/intentsStore";
import type { Proposal } from "@/lib/proposalTypes";
import { SettledRecordCard } from "@/components/SettledRecordCard";
import {
  AUTO_HANDLED_PROPOSALS,
} from "@/lib/mockProposals";
import {
  type ActivityType,
  type ActivityItemData,
  parseClockTime,
  autoHandledToActivity,
  TODAY_ACTIVITIES,
  YESTERDAY_ACTIVITIES,
} from "@/lib/brainFeed";

/* "Brain Did" icon — Figma 3943:42552 (purple circle + AI badge vector) */
const BrainDidIcon = () => (
  <div className="relative rounded-[100px] shrink-0 size-[40px]">
    <div className="absolute left-0 size-[40px] top-0">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.brain_did_bg} />
    </div>
    <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 overflow-clip size-[24px] top-1/2">
      <div className="absolute inset-[12.5%]">
        <div className="absolute inset-[-5.56%]">
          <img alt="" className="block max-w-none size-full" src={ICONS.brain_did_vec} />
        </div>
      </div>
    </div>
  </div>
);

const ApprovedIcon = () => (
  <div className="relative rounded-[100px] shrink-0 size-[40px]">
    <div className="absolute left-0 size-[40px] top-0">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.approved_bg} />
    </div>
    <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
      <div className="absolute inset-[12.5%_12.49%_14.82%_33.33%]">
        <div className="absolute inset-[-5.73%_-7.69%]">
          <img alt="" className="block max-w-none size-full" src={ICONS.approved_vec} />
        </div>
      </div>
      <div className="absolute inset-[41.67%_66.67%_16.67%_12.5%]">
        <div className="absolute inset-[-10%_-20%]">
          <img alt="" className="block max-w-none size-full" src={ICONS.approved_vec2} />
        </div>
      </div>
    </div>
  </div>
);

type Tab = "All" | "Brain Did" | "You Approved";
/* "All" is intentionally hidden for now — kept in the type/logic (filterByTab
   still treats it as the unfiltered view) so it can be re-enabled later. */
const TABS: Tab[] = ["Brain Did", "You Approved"];

const ICON_MAP: Record<ActivityType, () => JSX.Element> = {
  paid: BrainDidIcon,
  moved: BrainDidIcon,
  approved: ApprovedIcon,
};

const TYPE_TO_TAB: Record<ActivityType, Tab> = {
  paid: "Brain Did",
  moved: "Brain Did",
  approved: "You Approved",
};

const TAB_SLUG: Record<Tab, string> = {
  "All": "all",
  "Brain Did": "brain-did",
  "You Approved": "you-approved",
};

const SLUG_TO_TAB: Record<string, Tab> = Object.fromEntries(
  (Object.entries(TAB_SLUG) as [Tab, string][]).map(([t, s]) => [s, t]),
);

/** Map a live brain-core PaymentIntent onto an activity-feed item.
    Outcomes "reject" / "confirm" (detections that need review) are intentionally
    filtered out here because they are a duplicate of the Review page's job.
    Only "paid" / "declined" (user action) become activity feed items. */
function intentToActivity(rec: IntentRecord): ActivityItemData | null {
  const amount = `$${rec.amount.toLocaleString()}`;
  const base = { id: rec.intentId, amount, time: "Just now" };
  if (rec.declined) {
    return { ...base, type: "approved", title: `You declined the payment to ${rec.vendor}`, meta1: "Brain will not pay it", meta2: "" };
  }
  if (rec.outcome === "reject" || rec.outcome === "confirm") {
    return null;
  }
  return { ...base, type: "paid", title: `Brain approved a payment to ${rec.vendor}`, meta1: "Within your auto-pay policy", meta2: "Proposed — not executed" };
}

const filterNulls = <T,>(arr: (T | null)[]): T[] => arr.filter((x): x is T => x !== null);

const ActivityItem = ({
  item,
  highlighted,
  rowRef,
  onSelect,
}: {
  item: ActivityItemData;
  highlighted: boolean;
  rowRef?: (el: HTMLDivElement | null) => void;
  onSelect?: (item: ActivityItemData) => void;
}) => {
  const Icon = ICON_MAP[item.type];
  const clickable = Boolean(item.linkTo || item.proposal);
  return (
    <div
      ref={rowRef}
      data-testid={`row-activity-${item.id}`}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onSelect?.(item) : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect?.(item);
              }
            }
          : undefined
      }
      className={`flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border transition-colors hover:bg-[#11141b] hover:border-[#1d2132] ${
        clickable ? "cursor-pointer" : ""
      } ${highlighted ? "bg-[#11141b] border-[#7631EE]" : "border-transparent"}`}
    >
      <div className="flex flex-1 gap-[8px] items-center min-w-px relative">
        <Icon />
        <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] w-full">{item.title}</p>
          <div className="flex gap-[4px] items-center relative shrink-0 w-full flex-wrap">
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px]">{item.meta1}</p>
            {item.meta2 && (
              <>
                <div className="relative shrink-0 size-[4px]"><img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.activity_dot} /></div>
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px] whitespace-nowrap">{item.meta2}</p>
              </>
            )}
            {item.meta3 && (
              <>
                <div className="relative shrink-0 size-[4px]"><img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.activity_dot} /></div>
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px] whitespace-nowrap">{item.meta3}</p>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end justify-center leading-[20px] not-italic relative shrink-0 text-right w-[100px]">
        {item.amount && <p className="[font-family:'JetBrains_Mono',monospace] font-semibold relative shrink-0 text-[#a8b9f4] text-[18px] w-full text-right">{item.amount}</p>}
        <p className="[font-family:'Gilroy',sans-serif] font-medium relative shrink-0 text-[#414965] text-[14px] w-full text-right">{item.time}</p>
      </div>
    </div>
  );
};

const SectionCard = ({
  title,
  items,
  highlightedId,
  registerRowRef,
  onSelect,
}: {
  title: string;
  items: ActivityItemData[];
  highlightedId: string | null;
  registerRowRef: (id: number | string) => (el: HTMLDivElement | null) => void;
  onSelect?: (item: ActivityItemData) => void;
}) => {
  if (items.length === 0) return null;
  return (
    <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
      <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
        <div className="flex flex-1 items-center min-w-px relative">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px] whitespace-nowrap">{title}</p>
        </div>
      </div>
      <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
        <div className="flex flex-col gap-[8px] items-start relative shrink-0 w-full">
          {items.map((item, idx) => (
            <div key={item.id} className="flex flex-col gap-[8px] w-full">
              <ActivityItem
                item={item}
                highlighted={highlightedId === String(item.id)}
                rowRef={registerRowRef(item.id)}
                onSelect={onSelect}
              />
              {idx < items.length - 1 && <div className="h-px shrink-0 w-full" style={{ background: "#1d2132" }} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export function ActivityPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const { intents } = useIntents();
  const resolvedInitial = SLUG_TO_TAB[params.get("tab") ?? ""] ?? "Brain Did";
  const initialTab: Tab = resolvedInitial === "All" ? "Brain Did" : resolvedInitial;
  // Row ids can be numeric (static activities) or strings (auto-handled
  // receipts, e.g. "prop-aws"). Keep the raw param string and compare by string
  // so deep-links from the home page work for both.
  const initialRow = params.get("row") || null;

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [highlightedId, setHighlightedId] = useState<string | null>(initialRow);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const registerRowRef = (id: number | string) => (el: HTMLDivElement | null) => {
    if (el) rowRefs.current.set(String(id), el);
    else rowRefs.current.delete(String(id));
  };

  // Sync state when the URL changes (e.g. coming from the home page).
  useEffect(() => {
    const tabParam = params.get("tab") ?? "";
    const resolved = SLUG_TO_TAB[tabParam] ?? "Brain Did";
    setActiveTab(resolved === "All" ? "Brain Did" : resolved);
    setHighlightedId(params.get("row") || null);
  }, [params]);

  // Scroll the highlighted row into view and clear the highlight after a short pause.
  useEffect(() => {
    if (highlightedId == null) return;
    const el = rowRefs.current.get(highlightedId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = window.setTimeout(() => setHighlightedId(null), 2000);
    return () => window.clearTimeout(t);
  }, [highlightedId]);

  const filterByTab = (items: ActivityItemData[]) =>
    activeTab === "All" ? items : items.filter((it) => TYPE_TO_TAB[it.type] === activeTab);

  const autoHandledItems = useMemo(
    () => AUTO_HANDLED_PROPOSALS.map(autoHandledToActivity),
    [],
  );
  const todayMerged = useMemo(
    () =>
      [...autoHandledItems, ...TODAY_ACTIVITIES].sort(
        (a, b) => parseClockTime(b.time) - parseClockTime(a.time),
      ),
    [autoHandledItems],
  );

  const liveItems = filterByTab(filterNulls(intents.map(intentToActivity)));
  const todayItems = filterByTab(todayMerged);
  const yesterdayItems = filterByTab(YESTERDAY_ACTIVITIES);

  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);

  const handleSelect = (item: ActivityItemData) => {
    if (item.proposal) {
      setSelectedProposal(item.proposal);
    } else if (item.linkTo) {
      navigate(item.linkTo);
    }
  };

  /* Header pager — cycle (wrap-around) through the tappable records in the active
     tab, in display order (Just now → Today → Yesterday). Rows without a proposal
     (link-only) are excluded since they don't open this popup. */
  const pagerItems = [...liveItems, ...todayItems, ...yesterdayItems].filter((it) => it.proposal);
  const pagerIdx = selectedProposal
    ? pagerItems.findIndex((it) => it.proposal!.id === selectedProposal.id)
    : -1;
  const pagerDisabled = pagerIdx < 0 || pagerItems.length <= 1;
  const pageProposal = (dir: 1 | -1) => {
    if (pagerDisabled) return;
    const next = pagerItems[(pagerIdx + dir + pagerItems.length) % pagerItems.length];
    setSelectedProposal(next.proposal!);
  };

  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[32px] items-start pb-[16px] pt-[40px] px-[16px] w-full">

          <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">
            {/* Header */}
            <div className="flex flex-col items-start gap-[4px] relative shrink-0 w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#6c779d] text-[20px] whitespace-nowrap">Your Activity</p>
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] text-[#a8b9f4] text-[32px] whitespace-nowrap">What Brain has been up to.</p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[22px] text-[#414965] text-[16px] whitespace-nowrap">
                Follow everything that Brain did or noticed. Tap for details.
              </p>
            </div>

            {/* Tab bar */}
            <div className="bg-[#06070a] flex gap-[2px] items-center overflow-clip p-[2px] relative rounded-[400px] shrink-0">
              {TABS.map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => {
                      setActiveTab(tab);
                      setHighlightedId(null);
                    }}
                    className="flex items-center justify-center px-[16px] py-[8px] relative rounded-[100px] shrink-0 transition-colors"
                    style={{ background: isActive ? "#4a2300" : "transparent" }}
                    data-testid={`tab-${tab.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <p
                      className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[14px] whitespace-nowrap"
                      style={{ color: isActive ? "#ff9500" : "#414965" }}
                    >
                      {tab}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Activity sections */}
          <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">
            <SectionCard
              title="Just now"
              items={liveItems}
              highlightedId={highlightedId}
              registerRowRef={registerRowRef}
              onSelect={handleSelect}
            />
            <SectionCard
              title="Today"
              items={todayItems}
              highlightedId={highlightedId}
              registerRowRef={registerRowRef}
              onSelect={handleSelect}
            />
            <SectionCard
              title="Yesterday"
              items={yesterdayItems}
              highlightedId={highlightedId}
              registerRowRef={registerRowRef}
              onSelect={handleSelect}
            />
          </div>

        </div>
      </ScrollArea>

      <SettledRecordCard
        proposal={selectedProposal}
        open={selectedProposal !== null}
        onOpenChange={(o) => { if (!o) setSelectedProposal(null); }}
        onViewAuditLog={() => {
          navigate(`/audit-log?record=${selectedProposal?.auditId ?? ""}`);
          setSelectedProposal(null);
        }}
        anchorAuditId={selectedProposal?.auditId}
        onPrev={() => pageProposal(-1)}
        onNext={() => pageProposal(1)}
        pagerDisabled={pagerDisabled}
      />
    </div>
  );
}
