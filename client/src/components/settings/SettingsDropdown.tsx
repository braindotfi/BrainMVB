import { useEffect, useRef, useState } from "react";
import chevronDownIcon from "@/assets/chevron_down_dropdown.png";

export interface SettingsDropdownOption {
  value: string;
  label: string;
}

function titleCase(label: string): string {
  return label.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/**
 * Settings uses the same compact filter language as Inbox: 14px Gilroy
 * medium, a8b9f4 text, 20px line height, and the same dark menu surface.
 *
 * The menu uses `position: fixed` (not absolute) so it escapes ancestor
 * overflow:hidden / overflow:clip containers — e.g. the Card wrapper in
 * SourcesSection. Coordinates are computed from the trigger's
 * getBoundingClientRect() on open and recalculated on scroll/resize so the
 * menu follows the button if the page moves under it. The right edge is
 * aligned with the trigger, placing the menu directly beneath its arrow.
 */
export function SettingsDropdown({
  value,
  options,
  onChange,
  testId,
  ariaLabel,
  open,
  onOpenChange,
  matchMenuWidth = false,
}: {
  value: string;
  options: readonly SettingsDropdownOption[];
  onChange: (value: string) => void;
  testId: string;
  ariaLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matchMenuWidth?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  // Fixed-position anchor in viewport coords. The menu is right-aligned with
  // the trigger so its right edge sits beneath the dropdown arrow.
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; right: number; width: number } | null>(null);

  /** Recompute anchor from the trigger button's current bounding rect. */
  const reanchor = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setMenuAnchor({
      top: r.bottom + 4,
      right: Math.max(8, window.innerWidth - r.right),
      width: r.width,
    });
  };

  // Reanchor whenever the menu opens or the page scrolls/resizes under it.
  useEffect(() => {
    if (!open) { setMenuAnchor(null); return; }
    reanchor();
    window.addEventListener("scroll", reanchor, { passive: true, capture: true });
    window.addEventListener("resize", reanchor, { passive: true });
    return () => {
      window.removeEventListener("scroll", reanchor, { capture: true });
      window.removeEventListener("resize", reanchor);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on outside pointer-down or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  const menuWidth = matchMenuWidth && menuAnchor ? menuAnchor.width : 208;

  return (
    <div ref={rootRef} className="relative w-full shrink-0">
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        data-testid={testId}
        onClick={() => onOpenChange(!open)}
        className="bg-brain-v1baby-blue-15 rounded-[8px] p-[8px] flex items-center gap-[8px] w-full text-left outline-none hover:bg-[#2a3045] transition-colors focus-visible:ring-2 focus-visible:ring-brain-v1purple"
      >
        <span className="flex-1 min-w-0 [font-family:'Gilroy',sans-serif] font-semibold text-brain-v1baby-blue-100 text-[14px] leading-[20px] whitespace-nowrap truncate">
          {titleCase(selected?.label ?? "")}
        </span>
        <img src={chevronDownIcon} alt="" aria-hidden="true" className="shrink-0 h-[7px] w-auto" />
      </button>

      {open && menuAnchor && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          style={{
            position: "fixed",
            top: menuAnchor.top,
            right: menuAnchor.right,
            width: menuWidth,
            zIndex: 9999,
          }}
          className="bg-brain-v1highlight-dropdown-bg border border-brain-v1stroke-2 border-solid flex flex-col items-start p-[8px] rounded-row shadow-[0px_68px_13.5px_rgba(0,0,0,0.06),0px_38px_11.5px_rgba(0,0,0,0.2),0px_17px_8.5px_rgba(0,0,0,0.34),0px_4px_4.5px_rgba(0,0,0,0.39)]"
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                onOpenChange(false);
              }}
              className="flex items-center p-[8px] rounded-[8px] shrink-0 w-full text-left [font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-100 text-[14px] whitespace-nowrap outline-none hover:bg-brain-v1baby-blue-15 focus-visible:bg-brain-v1baby-blue-15"
              data-testid={`${testId}-option-${option.value}`}
            >
              {titleCase(option.label)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
