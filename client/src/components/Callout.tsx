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

type CalloutProps = {
  /**
   * Optional heading. The Figma node is a single line of text, but several real
   * banners carry a heading over an explanation. Flattening those into one
   * sentence would lose information — the reason a rule paused, which feed
   * failed — so the frame stretches to hold both.
   */
  title?: string;
  children: React.ReactNode;
  testId?: string;
  className?: string;
};

/**
 * A remote read was unavailable.
 *
 * This is intentionally different from AlertCallout: it does not imply that
 * the user has an urgent item to resolve, only that the screen cannot make an
 * empty-state claim yet. It matches the Ledger Accounts unavailable state.
 */
export function UnavailableDataBox({
  children,
  testId,
  className = "",
}: {
  children: React.ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex gap-[12px] items-center px-[16px] py-[12px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] ${className}`}
      data-testid={testId}
    >
      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#ff9400] text-[16px] flex-1">
        {children}
      </p>
    </div>
  );
}

const TONES = {
  alert: {
    box: "bg-[#350011] border-[rgba(210,3,68,0.2)]",
    text: "text-[#d20344]",
    Icon: () => <AlertIcon />,
  },
  muted: {
    box: "bg-[#0a0c10] border-[#1d2132]",
    text: "text-[#6c779d]",
    Icon: () => <InfoIcon color="#6c779d" />,
  },
} as const;

function CalloutFrame({
  tone,
  title,
  children,
  testId,
  className = "",
}: CalloutProps & { tone: keyof typeof TONES }) {
  const { box, text, Icon } = TONES[tone];
  return (
    <div
      className={`${box} border border-solid rounded-[12px] flex items-center p-[8px] w-full ${className}`}
      data-testid={testId}
    >
      <div className="flex flex-1 gap-[8px] items-start min-w-px">
        <Icon />
        <div className="flex flex-1 flex-col justify-center min-w-px gap-[4px]">
          {title && (
            <p className={`${FONT} font-semibold leading-[16px] ${text} text-[14px]`}>{title}</p>
          )}
          <div className={`${FONT} font-medium leading-[16px] ${text} text-[14px] [word-break:break-word]`}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Something failed, is incomplete, or needs the user's attention. */
export function AlertCallout(props: CalloutProps) {
  return <CalloutFrame tone="alert" {...props} />;
}

/**
 * A feature that is not built yet.
 *
 * Amber used to cover both this and real warnings, which meant "we haven't
 * shipped this" and "this broke" looked identical. Crimson would now read as a
 * failure, so honest not-yet-available notices get the neutral frame instead:
 * still a callout, but plainly not an error.
 */
export function MutedCallout(props: CalloutProps) {
  return <CalloutFrame tone="muted" {...props} />;
}
