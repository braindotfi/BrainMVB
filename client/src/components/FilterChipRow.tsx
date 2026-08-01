/**
 * A secondary filter control, deliberately not a tab bar.
 *
 * When Vendors and Rules became Ledger tabs, their own tab bars would have sat
 * directly under the Ledger's — two near-identical pill rows, where the top one
 * changes the page and the bottom one filters a list. That is the tabs-within-tabs
 * pattern this restructure is removing everywhere else.
 *
 * These controls were never really tabs anyway: Trusted / Needs Review / New are
 * filters over one vendor list, and Default / Automations / Guardrails / Suggested
 * are filters over one rule set. So they render as filters — quieter, square, no
 * enclosing track — and the orange pill bar stays the single signal for "this
 * changes which page you are on".
 *
 * `aria-pressed` rather than `role="tab"` for the same reason: they are toggles
 * over a list, not a tabbed region, and mislabelling them makes a screen reader
 * announce a second set of page tabs.
 */

export interface FilterChip {
  value: string;
  label: string;
  /** Omitted when a count would be misleading — e.g. a list that has not loaded. */
  count?: number;
  /**
   * "amber"  → warning/attention treatment (orange tones when active).
   * Omit for neutral (default blue-grey treatment).
   */
  variant?: "amber";
  /** Optional icon rendered before the label. */
  icon?: React.ReactNode;
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
    <div role="group" aria-label={label} className="flex gap-[6px] items-center flex-wrap shrink-0">
      {chips.map((chip) => {
        const active = chip.value === value;
        const amber = chip.variant === "amber";

        // Active colours depend on semantic variant.
        const activeBg    = amber ? "#4a2300"              : "#11141b";
        const activeBorder = amber ? "rgba(255,148,0,0.25)" : "#1d2132";
        const activeText  = amber ? "#ff9500"              : "#a8b9f4";
        const activeBadgeBg   = amber ? "rgba(255,148,0,0.15)" : "#414965";
        const activeBadgeText = amber ? "#ff9500"              : "#a8b9f4";

        // Inactive colours: amber pills get a subtle orange hint so they're
        // semantically distinguishable even when not selected.
        const inactiveText  = amber ? "#ff9500" : "#414965";
        const inactiveBadgeBg   = "#0a0c10";
        const inactiveBadgeText = amber ? "#ff9500" : "#414965";

        return (
          <button
            key={chip.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(chip.value)}
            data-testid={`${testIdPrefix}-${chip.value.toLowerCase().replace(/\s+/g, "-")}`}
            /* border is always present so toggling never shifts layout by a pixel;
               only its colour changes. */
            className={[
              "flex items-center gap-[6px] px-[10px] py-[5px] rounded-[8px] border border-solid transition-colors",
              "outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]",
              active ? "" : "bg-transparent border-transparent hover:bg-[#0a0c10]",
            ].join(" ")}
            style={active ? { background: activeBg, borderColor: activeBorder } : undefined}
          >
            {chip.icon && (
              <span className="shrink-0 flex items-center" style={{ color: active ? activeText : inactiveText }}>
                {chip.icon}
              </span>
            )}
            <span
              className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[13px] whitespace-nowrap transition-colors"
              style={{ color: active ? activeText : inactiveText }}
            >
              {chip.label}
            </span>
            {chip.count != null && (
              <span
                className="[font-family:'Gilroy',sans-serif] font-semibold leading-[12px] text-[11px] px-[5px] py-[2px] rounded-[4px]"
                style={{
                  background: active ? activeBadgeBg : inactiveBadgeBg,
                  color: active ? activeBadgeText : inactiveBadgeText,
                }}
              >
                {chip.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
