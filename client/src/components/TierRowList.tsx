/**
 * Tier sections and decision rows — the shared list surface behind Overview and
 * Decisions.
 *
 * The v6 prototype renders both screens as ONE single-column list of rows, split
 * into tier sections with a colour-coded left border, with the row's own actions
 * inline at its end. Nothing here decides which tier a record lands in or which
 * buttons it gets: `proposalTiers.ts` owns the first and each record's
 * `available_decisions` owns the second. This module only lays them out.
 *
 * Why the actions are inline rather than behind the detail sheet: the point of
 * Overview is clearing items without a click-through. A row that can only be acted
 * on after opening a modal makes the tier grouping decorative.
 */

import { useMemo } from "react";
import { ActionButton, type ActionTone } from "@/components/ProposalCardParts";
import { TIER_META, TIER_ORDER, type ProposalTier } from "@/lib/proposalTiers";

/* Tier accents. Red = Urgent, amber = Waiting on you, periwinkle = Insights —
   the palette already used for Inbox status tags, not the prototype's colours. */
const TIER_ACCENT: Record<ProposalTier, string> = {
  urgent: "#d20344",
  waiting: "#ff9500",
  insight: "#a8b9f4",
};

export interface TierRowAction {
  id: string;
  label: string;
  tone: ActionTone;
  onClick: () => void;
  disabled?: boolean;
  /** Hover text explaining a disabled action, e.g. core won't accept it yet. */
  title?: string;
}

export interface TierRowModel {
  id: string;
  tier: ProposalTier;
  title: string;
  subtitle?: string;
  /** Small muted line under the subtitle (escalation timers and similar). */
  note?: string;
  actions: TierRowAction[];
  /** Opens the record's full detail sheet. Omitted when it has none. */
  onOpenDetail?: () => void;
  detailLabel?: string;
  /** Stable prefix for this row's test ids, e.g. `row-overview`. */
  testIdPrefix: string;
}

export const TierRow = ({ row }: { row: TierRowModel }) => {
  const accent = TIER_ACCENT[row.tier];
  return (
    <div
      className="flex flex-col sm:flex-row gap-[12px] items-start sm:items-center justify-between px-[16px] py-[14px] w-full bg-[#0a0c10] transition-colors hover:bg-[#11141b] border-l-[3px] border-solid"
      style={{ borderLeftColor: accent }}
      data-testid={`${row.testIdPrefix}-${row.id}`}
      data-tier={row.tier}
    >
      <div className="flex flex-col gap-[3px] items-start min-w-px flex-1">
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[16px] w-full">
          {row.title}
        </p>
        {row.subtitle && (
          <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#6c779d] text-[13px] w-full">
            {row.subtitle}
          </p>
        )}
        {row.note && (
          <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#414965] text-[12px] w-full">
            {row.note}
          </p>
        )}
        {row.onOpenDetail && (
          <button
            type="button"
            onClick={row.onOpenDetail}
            data-testid={`${row.testIdPrefix}-${row.id}-detail`}
            className="mt-[4px] [font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#7631ee] text-[12px] hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] rounded-[4px]"
          >
            View full detail
          </button>
        )}
      </div>
      {row.actions.length > 0 && (
        <div className="flex gap-[8px] items-center shrink-0">
          {row.actions.map((a) => (
            <ActionButton
              key={a.id}
              label={a.label}
              tone={a.tone}
              size="compact"
              onClick={a.onClick}
              disabled={a.disabled}
              title={a.title}
              testId={`${row.testIdPrefix}-${row.id}-action-${a.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const TierSection = ({ tier, rows }: { tier: ProposalTier; rows: TierRowModel[] }) => {
  const meta = TIER_META[tier];
  const accent = TIER_ACCENT[tier];
  return (
    <div className="flex flex-col gap-[10px] items-start w-full" data-testid={`tier-section-${tier}`}>
      <div className="flex gap-[8px] items-center w-full">
        <div className="size-[6px] rounded-full shrink-0" style={{ background: accent }} />
        <p
          className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[12px] uppercase tracking-[0.4px] whitespace-nowrap"
          style={{ color: accent }}
          data-testid={`tier-heading-${tier}`}
        >
          {meta.title}
        </p>
        {meta.note && (
          <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[12px] truncate">
            — {meta.note}
          </p>
        )}
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[12px] ml-auto shrink-0">
          {rows.length}
        </p>
      </div>
      <div className="flex flex-col w-full rounded-[12px] border border-solid border-[#1d2132] overflow-hidden divide-y divide-[#1d2132]">
        {rows.map((row) => (
          <TierRow key={row.id} row={row} />
        ))}
      </div>
    </div>
  );
};

/**
 * Every non-empty tier, in fixed order.
 *
 * An empty tier renders nothing at all rather than an empty-state card: three
 * "nothing here" boxes stacked on a quiet day is noise, and the whole-surface
 * empty state (`emptyMessage`) already covers having nothing anywhere.
 */
export const TierSections = ({
  rows,
  emptyMessage,
}: {
  rows: TierRowModel[];
  emptyMessage: string;
}) => {
  const groups = useMemo(
    () => TIER_ORDER.map((tier) => ({ tier, rows: rows.filter((r) => r.tier === tier) })).filter((g) => g.rows.length > 0),
    [rows],
  );

  if (groups.length === 0) {
    return (
      <div
        className="flex items-center px-[16px] py-[20px] w-full rounded-[12px] border border-solid border-[#1d2132] bg-[#0a0c10]"
        data-testid="tier-sections-empty"
      >
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[26px] items-start w-full">
      {groups.map((g) => (
        <TierSection key={g.tier} tier={g.tier} rows={g.rows} />
      ))}
    </div>
  );
};
