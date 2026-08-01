/**
 * The secondary filter control used by the Ledger's Vendors and Rules tabs.
 *
 * Visually this is an enclosed pill track (a #06070a rail holding rounded-[100px]
 * pills), matching the Figma tab component. Semantically it is still a filter,
 * not a tab bar: Needs Review / New / Trusted / Suggested are filters over one
 * vendor list, and Default / Automations / Guardrails / Suggested are filters
 * over one rule set.
 *
 * That distinction is why these stay `role="group"` + `aria-pressed` rather than
 * `role="tab"`. The Ledger's own orange pill bar is the real tab bar; announcing
 * a second tabbed region here would tell a screen-reader user they had changed
 * page when they had only narrowed a list.
 */

export interface FilterChip {
  value: string;
  label: string;
  /**
   * "amber" → attention treatment: the label keeps its orange tone even when the
   * pill is not selected, so a filter worth noticing stays visible when inactive.
   * Omit for neutral.
   */
  variant?: "amber";
}

interface Props {
  chips: readonly FilterChip[];
  value: string;
  onChange: (value: string) => void;
  /** Accessible name for the group, e.g. "Filter vendors". */
  label: string;
  testIdPrefix: string;
}

export function FilterChipRow({ chips, value, onChange, label, testIdPrefix }: Props): JSX.Element {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex gap-[2px] items-center p-[2px] rounded-[400px] shrink-0 w-fit max-w-full flex-wrap"
      style={{ background: "#06070a" }}
    >
      {chips.map((chip) => {
        const active = chip.value === value;
        // Selected is always the amber pill; an unselected amber chip keeps its
        // orange label so attention filters read as such from across the row.
        const text = active ? "#ff9400" : chip.variant === "amber" ? "#ff9400" : "#414965";

        return (
          <button
            key={chip.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(chip.value)}
            data-testid={`${testIdPrefix}-${chip.value.toLowerCase().replace(/\s+/g, "-")}`}
            className={[
              "flex items-center justify-center px-[16px] py-[8px] rounded-[100px] shrink-0 transition-colors",
              "outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]",
              active ? "" : "hover:bg-[#11141b]",
            ].join(" ")}
            style={{ background: active ? "#4a2300" : "transparent" }}
          >
            <span
              className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[14px] whitespace-nowrap transition-colors"
              style={{ color: text }}
            >
              {chip.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
