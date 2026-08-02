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
import { ChevronRight, ChevronLeft } from "lucide-react";
import infoIconSrc from "@assets/figma_icons/inline/proposal_info.png";
import warningIconSrc from "@assets/figma_icons/inline/proposal_warning.png";
import { capitalCase } from "@/lib/displayLabels";

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
      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[14px] text-[#6c779d] whitespace-nowrap">
        {children}
      </p>
      {leading}
    </div>
    <div className="flex-1 min-w-px h-px bg-[#1d2132]" aria-hidden="true" />
    {trailing}
  </div>
);

/** Heading + body, at the frame's 16px internal gap. */
export const CardSection = ({
  title,
  trailing,
  leading,
  children,
  testId,
}: {
  title: string;
  trailing?: ReactNode;
  leading?: ReactNode;
  children: ReactNode;
  testId?: string;
}) => (
  <section className="flex flex-col gap-[16px] items-start w-full" data-testid={testId}>
    <SectionHeading trailing={trailing} leading={leading}>
      {title}
    </SectionHeading>
    {children}
  </section>
);

/** A section whose heading IS the disclosure control (Technical Detail in the
 *  frame). The chevron sits beside the label and the whole row is the hit area —
 *  a chevron that only responds to a separate control reads as decoration. */
export const CollapsibleSection = ({
  title,
  expanded,
  onToggle,
  children,
  toggleTestId,
  testId,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  toggleTestId?: string;
  testId?: string;
}) => (
  <section className="flex flex-col gap-[16px] items-start w-full" data-testid={testId}>
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      data-testid={toggleTestId}
      className="w-full text-left rounded-[4px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
    >
      <SectionHeading
        leading={
          <ChevronRight
            size={14}
            className={`text-[#6c779d] transition-transform ${expanded ? "rotate-90" : ""}`}
            aria-hidden="true"
          />
        }
      >
        {title}
      </SectionHeading>
    </button>
    {expanded && children}
  </section>
);

/** The frame's 32px section rhythm. */
export const CardBody = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col gap-[32px] items-start p-[24px] w-full">{children}</div>
);

/** Body copy — Gilroy Medium 16/20 #6c779d. */
export const CardText = ({
  children,
  className = "",
  testId,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
}) => (
  <p
    className={`[font-family:'Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-[#6c779d] w-full ${className}`}
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
  <div
    className="inline-flex items-center justify-center px-[10px] py-[4px] rounded-[22px] border border-solid shrink-0"
    style={{ background, borderColor: border }}
    data-testid={testId}
  >
    <span
      className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[16px] text-center whitespace-nowrap"
      style={{ color }}
    >
      {capitalCase(label)}
    </span>
  </div>
);

/** Small caption pill used on evidence rows ("Payment", "Invoice"). */
export const TypeTag = ({ label }: { label: string }) => (
  <div className="inline-flex items-center justify-center bg-[#222737] border border-solid border-[rgba(108,119,157,0.2)] px-[8px] py-[3px] rounded-[22px] shrink-0">
    <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[14px] text-[#6c779d] text-center whitespace-nowrap">
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
    className="flex items-center p-[8px] rounded-[12px] border border-solid w-full"
    style={{ background: tone.background, borderColor: tone.border }}
    data-testid={testId}
  >
    <div className="flex flex-1 gap-[8px] items-start min-w-px">
      <img src={icon} alt="" aria-hidden="true" className="size-[16px] shrink-0" />
      <p
        className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[16px] flex-1 min-w-px"
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
    className="bg-[#0a0c10] border border-solid border-[#1d2132] rounded-[12px] w-full flex flex-col overflow-hidden"
    data-testid={testId}
  >
    {rows.map((row, i) => (
      <div
        key={`${row.label}-${i}`}
        className={`flex items-start w-full ${i < rows.length - 1 ? "border-b border-solid border-[#1d2132]" : ""}`}
      >
        <div className="flex flex-col items-start justify-center px-[12px] py-[8px] shrink-0 w-[140px]">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[20px] text-[#6c779d]">
            {row.label}
          </p>
        </div>
        <div className="flex flex-1 flex-col items-start justify-center min-w-px px-[12px] py-[8px]">
          <p
            className={`text-[13px] leading-[20px] text-[#a8b9f4] break-words w-full ${
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

/* ── Linked evidence row ─────────────────────────────────────────────────────
   The resolved record title and chevron are the only visible content. Every row
   is a button because every live evidence item has a record surface behind it. */
export const EvidenceLinkRow = ({
  label,
  onClick,
  testId,
}: {
  label: string;
  onClick: () => void;
  testId?: string;
}) => {
  const inner = (
    <>
      <div className="flex flex-1 items-center min-w-px">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[16px] leading-[20px] text-[#a8b9f4] truncate">
          {label}
        </p>
      </div>
      <ChevronRight size={16} className="text-[#6c779d] shrink-0" aria-hidden="true" />
    </>
  );

  const shell =
    "bg-[#0a0c10] border border-solid border-[#1d2132] rounded-[12px] px-[16px] py-[12px] flex gap-[16px] items-center w-full text-left";

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`${shell} transition-colors hover:border-[#2a3050] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]`}
    >
      {inner}
    </button>
  );
};

/* ── Confidence meter ─────────────────────────────────────────────────────── */
export const ConfidenceMeter = ({ pct }: { pct: number }) => (
  <div className="h-[6px] relative w-full" data-testid="bar-confidence-track">
    <div className="absolute h-[6px] left-0 right-0 top-0 rounded-[3px] bg-[#222737]" />
    <div
      className="absolute h-[6px] left-0 top-0 rounded-[3px] bg-[#7631ee]"
      style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
    />
  </div>
);

/** The mono value that sits at the right of the Confidence heading. */
export const HeadingValue = ({ children, testId }: { children: ReactNode; testId?: string }) => (
  <p
    className="[font-family:'JetBrains_Mono',monospace] font-semibold text-[14px] leading-[14px] text-[#6c779d] whitespace-nowrap shrink-0"
    data-testid={testId}
  >
    {children}
  </p>
);

/* ── Decision buttons ────────────────────────────────────────────────────────
   Approve / Postpone / Reject in the frame; in the live card the SET comes from
   available_decisions, so only the palette is fixed here. */
export type ActionTone = "approve" | "reject" | "neutral" | "acknowledge";

const ACTION_TONES: Record<ActionTone, { background: string; color: string }> = {
  approve: { background: "#123509", color: "#42bf23" },
  reject: { background: "#350011", color: "#d20344" },
  neutral: { background: "#222737", color: "#6c779d" },
  acknowledge: { background: "#240757", color: "#a88afa" },
};

/* `full` fills the card footer (the detail sheets); `compact` sits inline at the
   end of a list row, where a flex-1 button would eat the row. Same palette either
   way — a row's Approve must not read as a different control from the sheet's. */
export type ActionSize = "full" | "compact";

const ACTION_SIZES: Record<ActionSize, string> = {
  full: "flex-1 min-w-px px-[20px] py-[10px] text-[16px] leading-[20px]",
  compact: "shrink-0 px-[14px] py-[6px] text-[13px] leading-[16px]",
};

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
}) => {
  const palette = ACTION_TONES[tone];
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
      onKeyDown={(event) => event.stopPropagation()}
      disabled={disabled}
      title={title}
      data-testid={testId}
      style={{ background: palette.background, color: palette.color }}
      className={`flex items-center justify-center rounded-[100px] [font-family:'Gilroy',sans-serif] font-semibold whitespace-nowrap transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] ${ACTION_SIZES[size]}`}
    >
      {label}
    </button>
  );
};

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
  <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-t border-solid border-[#1d2132] flex flex-col items-start p-[24px] shrink-0 w-full">
    {position && (
      <span className="sr-only" aria-live="polite" data-testid="text-proposal-pager-position">
        {position}
      </span>
    )}
    <div className="flex gap-[16px] items-center w-full">
      <button
        type="button"
        onClick={onPrev}
        disabled={!hasPrev}
        data-testid="button-proposal-prev"
        className="flex flex-1 min-w-px gap-[8px] items-center justify-center bg-[#222737] px-[20px] py-[8px] rounded-[100px] [font-family:'Gilroy',sans-serif] font-semibold text-[16px] leading-[20px] text-[#6c779d] whitespace-nowrap transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
      >
        <ChevronLeft size={24} className="shrink-0" aria-hidden="true" />
        Previous
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!hasNext}
        data-testid="button-proposal-next"
        className="flex flex-1 min-w-px gap-[8px] items-center justify-center bg-[#222737] px-[20px] py-[8px] rounded-[100px] [font-family:'Gilroy',sans-serif] font-semibold text-[16px] leading-[20px] text-[#6c779d] whitespace-nowrap transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
      >
        Next
        <ChevronRight size={24} className="shrink-0" aria-hidden="true" />
      </button>
    </div>
  </div>
);
