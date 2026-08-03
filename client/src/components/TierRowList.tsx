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
import { orderRowsForDisplay } from "@/lib/tierRowOrder";
import type { RowTier } from "@/lib/decisionFilters";
import { Divider } from "@/components/LedgerWidgets";
import { UnavailableDataBox } from "@/components/Callout";
import { capitalCase } from "@/lib/displayLabels";

/* Tier accents. Red = Urgent, amber = Waiting on you, periwinkle = Insights —
   the palette already used for Inbox status tags, not the prototype's colours. */
const TIER_ACCENT: Record<ProposalTier, string> = {
  urgent: "#d20344",
  waiting: "#ff9500",
  insight: "#a8b9f4",
};

/* Rows can also be `decided` history, which carries NO accent — the colour bar
   means "this is waiting on you", and a settled record is not. Sections never
   render this tier (TIER_ORDER has three), only Decisions' flat timeline does. */
const ROW_ACCENT: Record<RowTier, string | null> = { ...TIER_ACCENT, decided: null };

export interface TierRowAction {
  id: string;
  label: string;
  tone: ActionTone;
  onClick: () => void;
  disabled?: boolean;
  /** Hover text explaining a disabled action, e.g. core won't accept it yet. */
  title?: string;
}

/** Small pill beside the title. `className` must carry its own border COLOUR only
 *  — the element adds `border border-solid`, matching the chip convention used by
 *  the Inbox status tags. */
export interface TierRowBadge {
  label: string;
  className: string;
  /** Anything the pill encodes in COLOUR alone. Decision rows are pilled with
   *  the agent name, so severity survives only as the chip's palette — this
   *  carries it as text for anyone who cannot see the colour. */
  srLabel?: string;
}

/**
 * Bulk-selection checkbox, shown only on rows a batch approval may legally cover
 * (`bulkApprove.ts` decides which — never this component).
 *
 * `disabled` with a `title` is used for a row that IS eligible but sits outside the
 * batch already started, because bulk approval covers one type at a time. Hiding
 * its checkbox instead would make rows appear and vanish as the selection changes;
 * a disabled box that explains itself on hover keeps the list still.
 */
export interface TierRowSelect {
  checked: boolean;
  disabled?: boolean;
  title?: string;
  /** Accessible name — the row title alone is not in the label. */
  label: string;
  onChange: () => void;
}

/** Right-side outcome pill for settled / decided rows.
 *
 *  When this is set the row renders the pill instead of action buttons — the
 *  outcome is final so there is nothing to act on. The three icon variants map
 *  to the three semantic outcomes (done-positive, done-negative, in-progress).
 */
export interface TierRowStatusPill {
  label: string;
  /** Background of the pill capsule, e.g. "#123509" or "rgba(255,255,255,0.3)". */
  bg: string;
  /** Text + icon stroke colour. */
  textColor: string;
  /** Semantic shape: checkmark (approved/acknowledged), X (rejected), clock (pending). */
  icon: "check" | "x" | "pending";
}

export interface TierRowModel {
  id: string;
  tier: RowTier;
  title: string;
  /** Type / status pill, as the prototype puts at the end of a row title. */
  badge?: TierRowBadge;
  subtitle?: string;
  /** Small muted line under the subtitle (escalation timers and similar). */
  note?: string;
  actions: TierRowAction[];
  /** Opens the record's full detail sheet. Omitted when it has none. */
  onOpenDetail?: () => void;
  detailLabel?: string;
  /** Bulk-approve checkbox. Omitted on every row that cannot be batch-approved. */
  select?: TierRowSelect;
  /** Stable prefix for this row's test ids, e.g. `row-overview`. */
  testIdPrefix: string;
  /** Right-side outcome pill for settled records. Replaces action buttons. */
  statusPill?: TierRowStatusPill;
  /** Container background override. Settled records get a purple tint (#12032d)
   *  when a human made the decision; automated/in-progress rows stay on base. */
  rowBg?: string;
}

/* ── Outcome-status pill (right side of settled rows) ──────────────────────
   Figma nodes 6214-69210 / 6214-69233 / 6214-69246 / 6214-69258 / 6214-69270.
   Three icon shapes: checkmark (approved / acknowledged / auto-approved),
   X (rejected), clock (pending / in-flight). All stroked in the pill's own
   textColor so they recolour automatically. */

function PillCheckIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
      <path d="M3.5 8.5 7 12l5.5-8" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PillXIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
      <path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PillClockIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
      <circle cx="8" cy="8" r="5.5" stroke={color} strokeWidth="1.5" />
      <path d="M8 5.5V8l2 1.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DecisionPill({ pill }: { pill: TierRowStatusPill }) {
  const Icon =
    pill.icon === "check" ? PillCheckIcon : pill.icon === "x" ? PillXIcon : PillClockIcon;
  return (
    <div
      className="flex gap-[4px] items-center justify-center px-[12px] py-[8px] rounded-[100px] shrink-0"
      style={{ background: pill.bg }}
      data-testid="status-pill"
    >
      <Icon color={pill.textColor} />
      <span
        className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[12px] whitespace-nowrap"
        style={{ color: pill.textColor }}
      >
        {pill.label}
      </span>
    </div>
  );
}

export const TierRow = ({ row }: { row: TierRowModel }) => {
  const accent = ROW_ACCENT[row.tier];
  /* Settled rows tint their background (purple for user-decided, base for auto).
     The hover needs to lighten that tint, not snap back to the default. */
  const baseBg = row.rowBg ?? "#0a0c10";
  const hoverBg = row.rowBg ? "#1a0442" : "#11141b";
  /* Settled rows show Figma's 16px / semibold / leading-[20px] for the two
     secondary lines; live-queue rows keep the existing compact 14px / medium. */
  const secondaryClass = row.statusPill
    ? "[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] w-full truncate"
    : "[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[14px] w-full truncate";

  return (
    <div
      className={`flex flex-col sm:flex-row gap-[12px] items-start sm:items-center justify-between px-[16px] py-[12px] w-full transition-colors border-b border-solid border-[#1d2132] last:border-b-0 ${
        accent ? "border-l-[3px]" : ""
      } ${row.onOpenDetail ? "cursor-pointer" : ""}`}
      style={{
        background: baseBg,
        ...(accent ? { borderLeftColor: accent } : {}),
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = hoverBg; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = baseBg; }}
      data-testid={`${row.testIdPrefix}-${row.id}`}
      data-tier={row.tier}
      {...(row.onOpenDetail
        ? {
            role: "button" as const,
            tabIndex: 0,
            onClick: row.onOpenDetail,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); row.onOpenDetail?.(); }
            },
          }
        : {})}
    >
      {row.select ? (
        <input
          type="checkbox"
          checked={row.select.checked}
          disabled={row.select.disabled}
          onChange={row.select.onChange}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          title={row.select.title}
          aria-label={row.select.label}
          data-testid={`${row.testIdPrefix}-${row.id}-select`}
          className="decision-checkbox mt-[3px] sm:mt-0 size-[16px] shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
        />
      ) : (
        <div aria-hidden="true" className="size-[16px] shrink-0" />
      )}
      <div className="flex flex-col gap-[4px] items-start min-w-px flex-1">
        <div className="flex flex-nowrap items-center gap-x-[8px] w-full min-w-0">
          <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[16px] min-w-0 truncate">
            {row.title}
          </p>
          {row.badge && (
            <span
              className={`${row.badge.className} border border-solid rounded-[22px] px-[8px] py-[2px] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[14px] text-center whitespace-nowrap shrink-0`}
              data-testid={`${row.testIdPrefix}-${row.id}-badge`}
            >
              {capitalCase(row.badge.label)}
              {row.badge.srLabel && <span className="sr-only">{`, ${row.badge.srLabel}`}</span>}
            </span>
          )}
        </div>
        {row.subtitle && (
          <p className={secondaryClass}>
            {row.subtitle}
          </p>
        )}
        {row.note && (
          <p className={secondaryClass}>
            {row.note}
          </p>
        )}
      </div>
      {row.statusPill ? (
        <DecisionPill pill={row.statusPill} />
      ) : row.actions.length > 0 ? (
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
      ) : null}
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
        <div className="flex items-center justify-center min-w-[18px] px-[5px] py-[1px] rounded-[4px] shrink-0" style={{ background: accent }}>
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#0a0c10] text-[11px] text-center whitespace-nowrap">{rows.length}</p>
        </div>
        {meta.note && (
          <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[12px] truncate">
            Note: {meta.note}
          </p>
        )}
      </div>
      <div className="flex flex-col w-full rounded-[12px] border border-solid border-[#1d2132] bg-[#0a0c10] overflow-hidden">
        <div className="flex flex-col w-full">
          {rows.map((row) => (
            <TierRow key={row.id} row={row} />
          ))}
        </div>
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
  unavailable = false,
}: {
  rows: TierRowModel[];
  emptyMessage: string;
  unavailable?: boolean;
}) => {
  /* Grouped through the same ordering the unified pager walks (tierRowOrder.ts)
     so the sections and Previous/Next can never disagree about what comes after
     what. */
  const groups = useMemo(() => {
    const ordered = orderRowsForDisplay(rows);
    return TIER_ORDER.map((tier) => ({ tier, rows: ordered.filter((r) => r.tier === tier) })).filter(
      (g) => g.rows.length > 0,
    );
  }, [rows]);

  if (groups.length === 0) {
    if (unavailable) {
      return <UnavailableDataBox testId="tier-sections-empty">{emptyMessage}</UnavailableDataBox>;
    }
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
