import { useEffect, useRef } from "react";
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
 */
export function SettingsDropdown({
  value,
  options,
  onChange,
  testId,
  ariaLabel,
  open,
  onOpenChange,
}: {
  value: string;
  options: readonly SettingsDropdownOption[];
  onChange: (value: string) => void;
  testId: string;
  ariaLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

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

  return (
    <div ref={rootRef} className="relative w-full shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        data-testid={testId}
        onClick={() => onOpenChange(!open)}
        className="bg-[#222737] rounded-[8px] p-[8px] flex items-center gap-[8px] w-full text-left outline-none hover:bg-[#2a3045] transition-colors focus-visible:ring-2 focus-visible:ring-[#7631EE]"
      >
        <span className="flex-1 min-w-0 [font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[14px] leading-[20px] whitespace-nowrap truncate">
          {titleCase(selected?.label ?? "")}
        </span>
        <img src={chevronDownIcon} alt="" aria-hidden="true" className="shrink-0 h-[7px] w-auto" />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="absolute right-0 top-[calc(100%+4px)] z-50 bg-[#0a0c10] border border-[#1d2132] border-solid flex flex-col items-start p-[8px] rounded-[12px] w-[208px] shadow-[0px_68px_13.5px_rgba(0,0,0,0.06),0px_38px_11.5px_rgba(0,0,0,0.2),0px_17px_8.5px_rgba(0,0,0,0.34),0px_4px_4.5px_rgba(0,0,0,0.39)]"
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
              className="flex items-center p-[8px] rounded-[8px] shrink-0 w-full text-left [font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[14px] whitespace-nowrap outline-none hover:bg-[#222737] focus-visible:bg-[#222737]"
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