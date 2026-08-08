import { Slot } from "@radix-ui/react-slot";
import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../lib/utils";

/**
 * THE BUTTON PRIMITIVE
 *
 * See CLAUDE.md → "Buttons" for when to reach for each variant and size. The
 * short version, because the two rules that matter are easy to re-break:
 *
 *   SIZE IS PADDING + THE LINE BOX, NOT A HEIGHT.
 *   `default` is py-10 + a 20px line = 40px. `compact` is py-6 + 20 = 32px.
 *   Only `large` pins an explicit height, because at 48px the text no longer
 *   drives the box. Do not add an `h-*` to the other sizes "to be safe" — it
 *   decouples the box from the text and the two drift apart silently.
 *
 *   TYPE FOLLOWS THE #133 SCALE, WHICH KEYS OFF CONTROL HEIGHT.
 *   16px is reserved for controls >=44px tall, so `large` is 16/24 and
 *   everything below it is 14/20. There is no 18px button tier.
 *
 * Layout is NOT a variant. A modal footer pair that fills its row is
 * `className="flex-1"` at the call site; it is the same 40px button.
 *
 * `outline` and the `default` alias exist only for the vendored shadcn files
 * under this directory (alert-dialog, calendar, pagination). Product code
 * should use the named intents.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center shrink-0 whitespace-nowrap",
    // 8px label gap and 16px icons, everywhere, at every size.
    "gap-[8px] [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:pointer-events-none",
    "rounded-pill font-semibold",
    // transition-colors, never transition-opacity: the hover is a fill change.
    "transition-colors",
    // The app's focus convention (92 sites), not shadcn's ring-1/ring-ring (11).
    // Variants that carry their own semantic colour override the ring below.
    "focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple",
    // The one disabled treatment. Never add disabled:pointer-events-none —
    // it suppresses the cursor and silently cancels cursor-not-allowed.
    "disabled:opacity-60 disabled:cursor-not-allowed",
  ].join(" "),
  {
    variants: {
      variant: {
        /**
         * The ONE solid treatment, reserved for the single highest-emphasis
         * action on a screen (sign up, connect a bank, create the thing).
         * Every other intent is tonal — a dark tinted fill with bright tinted
         * text. If a screen has two `cta`s, one of them is wrong.
         */
        cta: "bg-brain-v1purple text-brain-v1white hover:bg-brain-v1purple-hover",
        primary:
          "bg-brain-v1dark-purple text-brain-v1purple hover:bg-brain-v1dark-purple-hover",
        secondary:
          "bg-brain-v1baby-blue-15 text-brain-v1baby-blue-60 hover:bg-brain-v1baby-blue-15-hover",
        /**
         * Quieter than `secondary`. For the receding half of a pair where
         * secondary would compete — Dismiss beside Accept, Cancel beside Save.
         * There is no baby-blue-5-hover token; hovering lifts to baby-blue-15.
         */
        subtle:
          "bg-brain-v1baby-blue-5 text-brain-v1baby-blue-60 hover:bg-brain-v1baby-blue-15",
        destructive:
          "bg-brain-v1dark-pink-red text-brain-v1pink-red hover:bg-brain-v1dark-pink-red-hover focus-visible:ring-brain-v1pink-red",
        success:
          "bg-brain-v1dark-green text-brain-v1green hover:bg-brain-v1dark-green-hover focus-visible:ring-brain-v1green",
        warning:
          "bg-brain-v1dark-orange text-brain-v1light-orange hover:bg-brain-v1dark-orange-hover",
        ghost:
          "text-brain-v1baby-blue-60 hover:bg-brain-v1baby-blue-15",
        /** Vendored-shadcn compatibility. Not for product code. */
        outline:
          "border border-brain-v1stroke-2 text-brain-v1baby-blue-60 hover:bg-brain-v1baby-blue-15",
        /** Vendored-shadcn compatibility alias of `secondary`. */
        default:
          "bg-brain-v1baby-blue-15 text-brain-v1baby-blue-60 hover:bg-brain-v1baby-blue-15-hover",
      },
      size: {
        /** 32px — inline actions inside rows, cards and table cells. */
        compact: "py-[6px] px-[12px] text-[14px] leading-[20px]",
        /** 40px — the action pill, and modal confirm/cancel. */
        default: "py-[10px] px-[20px] text-[14px] leading-[20px]",
        /** 48px — full-width auth and onboarding CTAs. */
        large: "h-[48px] px-[24px] text-[16px] leading-[24px]",
        /** Square icon-only, matching the two text sizes. */
        icon: "h-[40px] w-[40px]",
        iconCompact: "h-[32px] w-[32px]",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        // A <button> inside a <form> defaults to type="submit". Nearly every
        // button here is an action, not a submit, and the implicit default has
        // caused accidental form submissions. Callers can still pass "submit".
        type={asChild ? undefined : (type ?? "button")}
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
