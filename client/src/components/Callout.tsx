/**
 * Inline callout boxes and their icons.
 *
 * Before this file every callout in the app was hand-rolled, so the same
 * "circle + i" glyph existed as five near-identical copies and the alert boxes
 * had drifted into three different colour schemes (amber, crimson-tint, and a
 * borderless variant). Both icons and the alert frame now live here so a change
 * lands everywhere at once.
 *
 * The alert frame is Figma node 6091:16677 — background #350011, a 20%-opacity
 * #D20344 hairline, 12px radius, 8px padding, 8px gap, and 14px/16 Gilroy
 * Medium in #D20344.
 */

const FONT = "[font-family:'Gilroy',sans-serif]";

/** Filled disc with the exclamation knocked out in the alert background. */
export function AlertIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      {/* Geometry read off the supplied 32px artwork: full-bleed disc, a 1.7-wide
          stem spanning y 4.0–9.0, and the point centred at y 11.25. */}
      <circle cx="8" cy="8" r="8" fill="#d20344" />
      <path d="M8 4.85v3.3" stroke="#350011" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="8" cy="11.25" r="1.1" fill="#350011" />
    </svg>
  );
}

/**
 * Ring with an "i". Tintable because the same glyph marks the purple policy
 * banners and the grey read-only notice on the account popup.
 */
export function InfoIcon({
  size = 16,
  color = "#7631ee",
  className = "",
}: {
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      {/* 14px outer diameter with a 2px ring, dot at y 5, stem spanning y 6.5–11 —
          all measured off the supplied 32px artwork. */}
      <circle cx="8" cy="8" r="6" stroke={color} strokeWidth="2" />
      <circle cx="8" cy="5" r="0.85" fill={color} />
      <path d="M8 7.5v2.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The alert frame from Figma.
 *
 * `title` is optional: the Figma node is a single line of text, but two of the
 * existing banners carry a heading over an explanation. Rather than flatten
 * those into one sentence — which would lose the reason the rule paused — the
 * frame stretches to hold both, keeping the node's colours, radius, padding
 * and gap exactly.
 */
export function AlertCallout({
  title,
  children,
  testId,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      className={`bg-[#350011] border border-[rgba(210,3,68,0.2)] border-solid rounded-[12px] flex items-center p-[8px] w-full ${className}`}
      data-testid={testId}
    >
      <div className="flex flex-1 gap-[8px] items-start min-w-px">
        <AlertIcon />
        <div className="flex flex-1 flex-col justify-center min-w-px gap-[4px]">
          {title && (
            <p className={`${FONT} font-semibold leading-[16px] text-[#d20344] text-[14px]`}>
              {title}
            </p>
          )}
          <div className={`${FONT} font-medium leading-[16px] text-[#d20344] text-[14px] [word-break:break-word]`}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
