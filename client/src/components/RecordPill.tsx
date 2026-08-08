import type { CSSProperties, ReactNode } from "react";

/**
 * The compact pill used inside record rows.
 *
 * Inbox's record badges are the reference: a 12px/14px label with 8px
 * horizontal and 2px vertical padding. Keeping the geometry here prevents
 * each record surface from inventing a slightly different badge.
 */
export function RecordPill({
  children,
  className,
  style,
  testId,
  title,
}: {
  children: ReactNode;
  /** Colour classes only; the shared geometry and border are added here. */
  className: string;
  style?: CSSProperties;
  testId?: string;
  title?: string;
}): JSX.Element {
  return (
    <span
      className={`${className} inline-flex items-center justify-center gap-[4px] border border-solid rounded-pill px-[8px] py-[2px] [font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[12px] text-center whitespace-nowrap shrink-0`}
      style={style}
      data-testid={testId}
      title={title}
    >
      {children}
    </span>
  );
}