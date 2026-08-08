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
      className={`flex gap-[12px] items-center px-[16px] py-[12px] relative rounded-[8px] shrink-0 w-full bg-brain-v1highlight-dropdown-bg border border-solid border-brain-v1stroke-2 ${className}`}
      data-testid={testId}
    >
      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-brain-v1light-orange text-[16px] flex-1">
        {children}
      </p>
    </div>
  );
}

/**
 * Geometry lives in the tone table, not in the frame, because the tones are not
 * all the same kind of message. `alert` and `muted` are short one-line notices;
 * `policy` carries multi-sentence prose, and squeezing that to 16px leading on
 * 14px text reads as a wall. The padding/leading pair is therefore declared per
 * tone — still one place to change, but honest about the difference.
 */
const TONES = {
  alert: {
    box: "bg-brain-v1dark-pink-red border-[rgba(210,3,68,0.2)]",
    pad: "p-[8px]",
    gap: "gap-[8px]",
    leading: "leading-[16px]",
    text: "text-brain-v1pink-red",
    Icon: () => <AlertIcon />,
  },
  muted: {
    box: "bg-brain-v1highlight-dropdown-bg border-brain-v1stroke-2",
    pad: "p-[8px]",
    gap: "gap-[8px]",
    leading: "leading-[16px]",
    text: "text-brain-v1baby-blue-60",
    Icon: () => <InfoIcon color="#6c779d" />,
  },
  policy: {
    box: "bg-brain-v1dark-purple border-[rgba(118,49,238,0.2)]",
    pad: "p-[12px]",
    gap: "gap-[10px]",
    leading: "leading-[18px]",
    text: "text-brain-v1purple",
    Icon: () => <InfoIcon className="mt-[2px]" />,
  },
} as const;

function CalloutFrame({
  tone,
  title,
  children,
  testId,
  className = "",
}: CalloutProps & { tone: keyof typeof TONES }) {
  const { box, pad, gap, leading, text, Icon } = TONES[tone];
  return (
    <div
      className={`${box} border border-solid rounded-row flex items-center ${pad} w-full ${className}`}
      data-testid={testId}
    >
      <div className={`flex flex-1 ${gap} items-start min-w-px`}>
        <Icon />
        <div className="flex flex-1 flex-col justify-center min-w-px gap-[4px]">
          {title && (
            <p className={`${FONT} font-semibold leading-[16px] ${text} text-[14px]`}>{title}</p>
          )}
          <div className={`${FONT} font-medium ${leading} ${text} text-[14px] [word-break:break-word]`}>
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

/**
 * Explains how Brain's own policy layer behaves — core default rules, what the
 * Inbox is for, how keys are enforced. Informational, never a failure, so it
 * takes the product purple rather than crimson or grey.
 *
 * This shape had been hand-rolled in eight places across five files with the
 * same #240757 fill, the same 20%-opacity #7631EE hairline, and the same
 * `InfoIcon` nudged down 2px.
 */
export function PolicyCallout(props: CalloutProps) {
  return <CalloutFrame tone="policy" {...props} />;
}
