/* Proposal card design system.
 *
 * Every primitive here is a literal transcription of the "Invoice Agent" frame
 * (Figma node 5737:65928). The card is assembled ONLY from these parts so the
 * spacing is identical between sections: the frame uses a 32px rhythm between
 * sections and 16px between a section's heading and its body, and nothing in
 * the card is allowed to invent a third value.
 *
 *   Section gap ....... 32px   (CardBody)
 *   Heading → body .... 16px   (CardSection)
 *   Stacked rows ...... 8px    (evidence list, decision buttons)
 *   Hero block ........ 24px   (pill → headline group)
 *
 * Type scale, from the same frame:
 *   Section heading ... Gilroy SemiBold 14 / 14  #6c779d
 *   Body copy ......... Gilroy Medium   16 / 20  #6c779d
 *   Fact label ........ Gilroy SemiBold 12 / 20  #6c779d
 *   Fact value ........ Gilroy Medium   13 / 20  #a8b9f4
 *   Box copy .......... Gilroy Medium   14 / 16
 */
import type { ReactNode } from "react";
import { ChevronRight, ChevronLeft, ArrowRight, AlertTriangle } from "lucide-react";
import infoIconSrc from "@assets/figma_icons/inline/proposal_info.png";
import warningIconSrc from "@assets/figma_icons/inline/proposal_warning.png";
import approveIconSrc from "@assets/figma_icons/inline/outcome_approve.png";
import editIconSrc from "@assets/figma_icons/inline/outcome_edit.png";
import rejectIconSrc from "@assets/figma_icons/inline/outcome_reject.png";
import { capitalCase } from "@/lib/displayLabels";
import { Button } from "@/components/ui/button";

/* ── Section heading ──────────────────────────────────────────────────────────
   Label, then a hairline rule that fills the remaining width, then an optional
   trailing node (Confidence puts "High · 97%" there). Every section uses this —
   including Technical Detail, which in the frame is this same heading with a
   disclosure chevron beside the label rather than a bare toggle button. */
export const SectionHeading = ({
  children,
  trailing,
  leading,
}: {
  children: ReactNode;
  trailing?: ReactNode;
  leading?: ReactNode;
}) => (
  <div className="flex gap-[8px] items-center w-full">
    <div className="flex gap-[4px] items-center shrink-0">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[20px] text-brain-v1baby-blue-60 whitespace-nowrap">
        {children}
      </p>
      {leading}
    </div>
    <div className="flex-1 min-w-px h-px bg-brain-v1stroke-2" aria-hidden="true" />
    {trailing}
  </div>
);

/** Heading + body, at the frame's 16px internal gap.
 *
 *  `gap` exists for the one section that measures differently: Linked Evidence
 *  sits 8px under its heading (frame 5875:65797 — heading ends at y=14, the first
 *  row starts at y=22) because the rows carry their own 12px inner padding, so a
 *  full 16px there reads as a hole. Every other section stays at 16px. */
export const CardSection = ({
  title,
  trailing,
  leading,
  gap = 16,
  children,
  testId,
}: {
  title: string;
  trailing?: ReactNode;
  leading?: ReactNode;
  gap?: 8 | 16;
  children: ReactNode;
  testId?: string;
}) => (
  <section
    className={`flex flex-col ${gap === 8 ? "gap-[8px]" : "gap-[16px]"} items-start w-full`}
    data-testid={testId}
  >
    <SectionHeading trailing={trailing} leading={leading}>
      {title}
    </SectionHeading>
    {children}
  </section>
);

/**
 * Full-width footer that closes every record card with a border rule and 24px
 * of space from that rule to the buttons inside it.
 *
 * The border reaches both card edges with `-mx-[24px]`; `px-[24px]` restores
 * the 24px inset for the buttons. This matches the PagerFooter rhythm and the
 * Figma spec: 24px from the rule to the first button, rule spans 100% of card.
 * A plain flex-gap between a 1px divider div and the buttons would expose the
 * parent's section rhythm (32px in most scroll columns) rather than the 24px
 * the footer zone deserves.
 */
export const CardActions = ({ children, testId }: { children: ReactNode; testId?: string }) => (
  <div
    className="border-t border-solid border-brain-v1stroke-2 -mx-[24px] px-[24px] pt-[24px] shrink-0 w-[calc(100%+48px)]"
    data-testid={testId}
  >
    {children}
  </div>
);

/** The frame's 32px section rhythm. */
export const CardBody = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col gap-[32px] items-start p-[24px] w-full">{children}</div>
);

/** Body copy — Gilroy Medium 16/20.
 *
 *  The frames set section prose in #a8b9f4, the same value as a fact VALUE: it is
 *  the card's content, so it carries the card's reading colour. #6c779d is the
 *  chrome colour — section headings, fact labels, captions ABOUT the content —
 *  and using it for prose was what made the sections read as greyed-out. `tone`
 *  is therefore opt-in: pass "muted" for a caption, never for a sentence the
 *  approver is meant to read. */
export const CardText = ({
  children,
  tone = "primary",
  className = "",
  testId,
}: {
  children: ReactNode;
  tone?: "primary" | "muted";
  className?: string;
  testId?: string;
}) => (
  <p
    className={`[font-family:'Gilroy',sans-serif] font-medium text-[16px] leading-[20px] ${
      tone === "muted" ? "text-brain-v1baby-blue-60" : "text-brain-v1baby-blue-100"
    } w-full ${className}`}
    data-testid={testId}
  >
    {children}
  </p>
);

/* ── Pills ────────────────────────────────────────────────────────────────── */

/** Risk / status pill. px-10 py-4, 22px radius, 14/16 SemiBold.
 *  Callers pass the palette so RISK_META stays the single source of risk colour. */
export const StatusPill = ({
  label,
  color,
  background,
  border,
  testId,
}: {
  label: string;
  color: string;
  background: string;
  border: string;
  testId?: string;
}) => (
  /* 24px tall in the frames (1px border + 4px + 14px line + 4px + 1px). The
     12/14 type with 12px side padding is what reproduces the frames' measured
     pill widths exactly — 81px for "Standard", 107px for "Informational". At
     14/16 the pill came out 26px tall and too wide at both lengths. */
  <div
    className="inline-flex items-center justify-center px-[12px] py-[4px] rounded-pill border border-solid shrink-0"
    style={{ background, borderColor: border }}
    data-testid={testId}
  >
    <span
      className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[14px] text-center whitespace-nowrap"
      style={{ color }}
    >
      {capitalCase(label)}
    </span>
  </div>
);

/** Small caption pill used on evidence rows ("Payment", "Invoice").
 *  20px tall in the frame (2px padding + 14px line + 2px padding + 1px borders). */
export const TypeTag = ({ label, testId }: { label: string; testId?: string }) => (
  <div
    className="inline-flex items-center justify-center bg-brain-v1baby-blue-15 border border-solid border-[rgba(108,119,157,0.2)] px-[8px] py-[2px] rounded-pill shrink-0"
    data-testid={testId}
  >
    <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[14px] text-brain-v1baby-blue-60 text-center whitespace-nowrap">
      {capitalCase(label)}
    </span>
  </div>
);

/* ── Callout boxes ────────────────────────────────────────────────────────────
   Identical geometry (p-8, 12px radius, 8px icon gap, 16px icon, 14/16 copy);
   only the palette differs, so they cannot drift apart. */
const Callout = ({
  icon,
  tone,
  children,
  testId,
}: {
  icon: string;
  tone: { background: string; border: string; color: string };
  children: ReactNode;
  testId?: string;
}) => (
  <div
    className="flex items-center p-[8px] rounded-row border border-solid w-full"
    style={{ background: tone.background, borderColor: tone.border }}
    data-testid={testId}
  >
    <div className="flex flex-1 gap-[8px] items-start min-w-px">
      <img src={icon} alt="" aria-hidden="true" className="size-[16px] shrink-0" />
      <p
        className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] flex-1 min-w-px"
        style={{ color: tone.color }}
      >
        {children}
      </p>
    </div>
  </div>
);

export const InfoBox = ({ children, testId }: { children: ReactNode; testId?: string }) => (
  <Callout
    icon={infoIconSrc}
    tone={{ background: "transparent", border: "#1d2132", color: "#6c779d" }}
    testId={testId}
  >
    {children}
  </Callout>
);

export const WarningBox = ({ children, testId }: { children: ReactNode; testId?: string }) => (
  <Callout
    icon={warningIconSrc}
    tone={{ background: "#350011", border: "rgba(210,3,68,0.2)", color: "#d20344" }}
    testId={testId}
  >
    {children}
  </Callout>
);

/* ── Key facts table ──────────────────────────────────────────────────────────
   The Vendor / Trailing Avg / This Invoice / Variance table: fixed 140px label
   column, 12/8 cell padding, hairline between rows and none after the last. */
export const KeyFactsTable = ({
  rows,
  testId,
}: {
  rows: { label: string; value: string; mono?: boolean }[];
  testId?: string;
}) => (
  <div
    className="bg-brain-v1highlight-dropdown-bg border border-solid border-brain-v1stroke-2 rounded-row w-full flex flex-col overflow-hidden"
    data-testid={testId}
  >
    {rows.map((row, i) => (
      <div
        key={`${row.label}-${i}`}
        className={`flex items-start w-full ${i < rows.length - 1 ? "border-b border-solid border-brain-v1stroke-2" : ""}`}
      >
        <div className="flex flex-col items-start justify-center px-[12px] py-[8px] shrink-0 w-[140px]">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] text-brain-v1baby-blue-60">
            {row.label}
          </p>
        </div>
        <div className="flex flex-1 flex-col items-start justify-center min-w-px px-[12px] py-[8px]">
          <p
            className={`text-[14px] leading-[20px] text-brain-v1baby-blue-100 break-words w-full ${
              row.mono
                ? "[font-family:'JetBrains_Mono',monospace]"
                : "[font-family:'Gilroy',sans-serif] font-medium"
            }`}
            data-testid={`text-key-fact-${row.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {row.value}
          </p>
        </div>
      </div>
    ))}
  </div>
);

/* ── Reason list ──────────────────────────────────────────────────────────────
   "Why Brain Suggested This": one row per signal the engine recorded.

   Rows share the key-facts shell (one bordered box, hairline between rows) so
   this section sits in the same visual family as the facts table below it.

   Row geometry is the frame's (5875:65772): 36px tall — 10px padding, a 16px
   glyph at x=12, and the copy at x=36, i.e. an 8px gap, set 13/16.

   The frame draws every bullet with a plain arrow, and every bullet it shows is
   a condition that HELD. A check the engine recorded as FAILED is therefore the
   one case the frame does not cover, and it must not inherit the satisfied
   styling: inside a matched rule the failed condition is usually the thing that
   escalated the record, and showing it as another neutral arrow would let an
   approver read it as more supporting evidence. It gets a red glyph and a "Not
   met" tag — real text, not colour alone, so the distinction survives for a
   colour-blind or screen-reader user. A check that passed and a check whose
   source stated no verdict both render as the frame's plain arrow: neither
   claims a verdict the data does not contain. */
export const ReasonList = ({
  reasons,
  testId,
}: {
  reasons: { text: string; passed?: boolean | null }[];
  testId?: string;
}) => (
  <ul
    className="bg-brain-v1highlight-dropdown-bg border border-solid border-brain-v1stroke-2 rounded-row w-full flex flex-col overflow-hidden list-none"
    data-testid={testId}
  >
    {reasons.map((reason, i) => {
      const failed = reason.passed === false;
      const Icon = failed ? AlertTriangle : ArrowRight;
      return (
        <li
          key={`${reason.text}-${i}`}
          className={`flex gap-[8px] items-start px-[12px] py-[10px] w-full ${
            i < reasons.length - 1 ? "border-b border-solid border-brain-v1stroke-2" : ""
          }`}
          data-testid={testId ? `${testId}-item-${i}` : undefined}
        >
          <Icon
            size={16}
            className={`shrink-0 ${failed ? "text-brain-v1pink-red" : "text-brain-v1baby-blue-60"}`}
            aria-hidden="true"
          />
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[18px] text-brain-v1baby-blue-100 flex-1 min-w-px">
            {reason.text}
          </p>
          {failed && (
            <span
              className="[font-family:'Gilroy',sans-serif] font-semibold text-[11px] leading-[14px] text-brain-v1pink-red shrink-0 whitespace-nowrap"
              data-testid={testId ? `${testId}-verdict-${i}` : undefined}
            >
              Not met
            </span>
          )}
        </li>
      );
    })}
  </ul>
);

/* ── Outcome row ──────────────────────────────────────────────────────────────
   "What Happens Next": one row per decision the card actually offers, with the
   glyph carrying the tone (approve ✓ green, reject ✗ red, anything else ✎).
   The label is the decision's own button label, so the row and the footer
   control that performs it always read the same word. */
/* The supplied artwork, not a drawn approximation: each is a filled 32px disc
   with the glyph already inside it, so the row renders the image alone rather
   than a coloured wrapper around a lucide icon. Reject carries its own dark-red
   disc, which is what gives the destructive branch its weight here — the frame
   has no tinted row behind it. */
const OUTCOME_TONES: Record<string, { icon: string; alt: string }> = {
  approve: { icon: approveIconSrc, alt: "" },
  acknowledge: { icon: approveIconSrc, alt: "" },
  reject: { icon: rejectIconSrc, alt: "" },
  edit: { icon: editIconSrc, alt: "" },
};

export const OutcomeRow = ({
  tone,
  label,
  children,
  testId,
}: {
  tone: string;
  label: string;
  children: ReactNode;
  testId?: string;
}) => {
  const meta = OUTCOME_TONES[tone] ?? OUTCOME_TONES.edit;
  return (
    <div className="flex gap-[16px] items-start w-full" data-testid={testId}>
      <img
        src={meta.icon}
        alt={meta.alt}
        aria-hidden="true"
        className="size-[32px] shrink-0"
        data-testid={testId ? `${testId}-glyph` : undefined}
      />
      <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-brain-v1baby-blue-60 flex-1 min-w-px">
        <span className="font-semibold text-brain-v1baby-blue-100">{label}:</span> {children}
      </p>
    </div>
  );
};

/* ── Linked evidence row ─────────────────────────────────────────────────────
   The resolved record title and chevron are the only visible content, preceded
   by the record's KIND as a pill ("Payment", "Invoice") when the evidence item
   carried one — that label is brain-core's own caption for the ref, not a guess
   made from the name. Every row is a button because every live evidence item
   has a record surface behind it. */
export const EvidenceLinkRow = ({
  label,
  kind,
  onClick,
  testId,
}: {
  label: string;
  kind?: string | null;
  onClick: () => void;
  testId?: string;
}) => {
  const inner = (
    <>
      {kind && <TypeTag label={kind} testId={testId ? `${testId}-kind` : undefined} />}
      <div className="flex flex-1 items-center min-w-px">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[16px] leading-[20px] text-brain-v1baby-blue-100 truncate">
          {label}
        </p>
      </div>
      <ChevronRight size={16} className="text-brain-v1baby-blue-60 shrink-0" aria-hidden="true" />
    </>
  );

  const shell =
    "bg-brain-v1highlight-dropdown-bg border border-solid border-brain-v1stroke-2 rounded-row px-[16px] py-[12px] flex gap-[16px] items-center w-full text-left";

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`${shell} transition-colors hover:border-brain-v1stroke-2-hover cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple`}
    >
      {inner}
    </button>
  );
};

/* ── Confidence meter ─────────────────────────────────────────────────────── */
export const ConfidenceMeter = ({ pct }: { pct: number }) => (
  <div className="h-[6px] relative w-full" data-testid="bar-confidence-track">
    <div className="absolute h-[6px] left-0 right-0 top-0 rounded-[3px] bg-brain-v1baby-blue-15" />
    <div
      className="absolute h-[6px] left-0 top-0 rounded-[3px] bg-brain-v1purple"
      style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
    />
  </div>
);

/** The mono value that sits at the right of the Confidence heading. */
export const HeadingValue = ({ children, testId }: { children: ReactNode; testId?: string }) => (
  <p
    className="[font-family:'JetBrains_Mono',monospace] font-semibold text-[14px] leading-[20px] text-brain-v1baby-blue-60 whitespace-nowrap shrink-0"
    data-testid={testId}
  >
    {children}
  </p>
);

/* ── Decision buttons ────────────────────────────────────────────────────────
   Approve / Postpone / Reject in the frame; in the live card the SET comes from
   available_decisions, so the tone maps onto the shared Button primitive's
   named intents (approve → success, reject → destructive, neutral → secondary). */
export type ActionTone = "approve" | "reject" | "neutral" | "acknowledge" | "warning";

const ACTION_VARIANTS: Record<ActionTone, "success" | "destructive" | "secondary" | "warning"> = {
  approve: "success",
  reject: "destructive",
  neutral: "secondary",
  acknowledge: "success",
  warning: "warning",
};

/* `full` fills the card footer (the detail sheets); `compact` sits inline at the
   end of a list row, where a flex-1 button would eat the row. Same palette either
   way — a row's Approve must not read as a different control from the sheet's. */
export type ActionSize = "full" | "compact";

export const ActionButton = ({
  label,
  tone,
  size = "full",
  onClick,
  disabled,
  title,
  testId,
}: {
  label: string;
  tone: ActionTone;
  size?: ActionSize;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  testId?: string;
}) => (
  <Button
    variant={ACTION_VARIANTS[tone]}
    size={size === "full" ? "default" : "compact"}
    onClick={(event) => {
      event.stopPropagation();
      onClick?.();
    }}
    onKeyDown={(event) => event.stopPropagation()}
    disabled={disabled}
    title={title}
    data-testid={testId}
    className={size === "full" ? "flex-1 min-w-px" : ""}
  >
    {label}
  </Button>
);

export const ActionRow = ({ children, testId }: { children: ReactNode; testId?: string }) => (
  <div className="flex gap-[8px] items-center w-full" data-testid={testId}>
    {children}
  </div>
);

/* ── Pager ────────────────────────────────────────────────────────────────────
   Pinned footer: Previous / Next across the full width. Disabled at the ends of
   the queue rather than hidden, so the footer height never changes as you page. */
export const PagerFooter = ({
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  position,
}: {
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  /** "3 of 12" — announced to screen readers, since the buttons alone don't say where you are. */
  position?: string;
}) => (
  <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-t border-solid border-brain-v1stroke-2 flex flex-col items-start p-[24px] shrink-0 w-full">
    {position && (
      <span className="sr-only" aria-live="polite" data-testid="text-proposal-pager-position">
        {position}
      </span>
    )}
    <div className="flex gap-[16px] items-center w-full">
      <Button
        variant="secondary"
        onClick={onPrev}
        disabled={!hasPrev}
        data-testid="button-proposal-prev"
        className="flex-1 min-w-px"
      >
        <ChevronLeft size={24} className="shrink-0" aria-hidden="true" />
        Previous
      </Button>
      <Button
        variant="secondary"
        onClick={onNext}
        disabled={!hasNext}
        data-testid="button-proposal-next"
        className="flex-1 min-w-px"
      >
        Next
        <ChevronRight size={24} className="shrink-0" aria-hidden="true" />
      </Button>
    </div>
  </div>
);
