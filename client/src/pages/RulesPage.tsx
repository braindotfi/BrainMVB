import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRuleSuggestions, toggleSuggestion as toggleSuggestionStore } from "@/lib/rule-suggestions";
import { useCurrency } from "@/lib/currencyContext";

import { INLINE_FIGMA } from "@/assets/inline-figma-icons";
const IMG_DIVIDER = INLINE_FIGMA.rulesDivider;

type SwitchProps = { active?: boolean; onChange?: () => void };

function Switch({ active = false, onChange }: SwitchProps) {
  return (
    <button
      onClick={onChange}
      className="relative shrink-0 h-[24px] w-[40px] flex-shrink-0 transition-all"
      style={{ borderRadius: active ? "100px" : "12px" }}
      data-testid="rule-toggle"
    >
      <div
        className="absolute h-[20px] left-[2px] rounded-[100px] top-[2px] w-[36px] transition-colors"
        style={{ background: active ? "#123509" : "#222737" }}
      />
      <div
        className="absolute rounded-[100px] size-[16px] top-[4px] transition-all"
        style={{
          background: active ? "#42bf23" : "#06070a",
          left: active ? "20px" : "4px",
        }}
      />
    </button>
  );
}

type Rule = { id: number; title: string | JSX.Element; description: string | JSX.Element; active: boolean };

function buildInitialRules(symbol: string): Rule[] {
  return [
    {
      id: 1,
      title: "Pay recurring bills automatically",
      description: "Utilities, phone, software subscriptions that you've paid before.",
      active: false,
    },
    {
      id: 2,
      title: "Move extra cash to savings",
      description: (
        <span>
          When checking has more than{" "}
          <span className="underline [text-decoration-skip-ink:none] text-[#a8b9f4]">{symbol}25,000</span>
          , move the extra to your high-yield account.
        </span>
      ),
      active: true,
    },
    {
      id: 3,
      title: (
        <span>
          Ask me before paying anything over{" "}
          <span className="underline [text-decoration-skip-ink:none]">{symbol}500</span>
        </span>
      ),
      description: "I'll show you the bill and ask. No surprises.",
      active: true,
    },
    {
      id: 4,
      title: "Flag any strange behavior",
      description: "Charges from new vendors, amounts that don't match a bill, or anything that doesn't fit normal pattern.",
      active: true,
    },
    {
      id: 5,
      title: "Chase overdue invoices",
      description: "Automatically email customers when an invoice is 7+ days late.",
      active: false,
    },
  ];
}

export function RulesPage() {
  const { symbol } = useCurrency();
  const [activeMap, setActiveMap] = useState<Record<number, boolean>>(
    () => Object.fromEntries(buildInitialRules("$").map(r => [r.id, r.active])),
  );
  const rules = buildInitialRules(symbol).map(r => ({ ...r, active: activeMap[r.id] ?? r.active }));
  const suggestions = useRuleSuggestions();

  const toggleRule = (id: number) => setActiveMap(m => ({ ...m, [id]: !(m[id] ?? false) }));
  const toggleSuggestion = (id: number) => toggleSuggestionStore(id);

  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[40px] items-start pb-[16px] pt-[40px] px-[16px] w-full">

          {/* Header */}
          <div className="flex flex-col items-start relative shrink-0 w-full">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#6c779d] text-[20px] whitespace-nowrap">Your Rules</p>
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] text-[#a8b9f4] text-[32px] whitespace-nowrap">Tell me how I should help you.</p>
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#414965] text-[16px] whitespace-nowrap">
              I learn from your habits and preferences to suggest rules that fit you.
            </p>
          </div>

          <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">

            {/* Rules list */}
            <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip p-[8px] relative rounded-[16px] shrink-0 w-full">
              <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
                <div className="flex flex-col gap-[8px] items-start relative shrink-0 w-full">
                  {rules.map((rule, idx) => (
                    <div key={rule.id} className="w-full">
                      <div className="bg-[#0a0c10] flex gap-[16px] items-start p-[8px] relative rounded-[8px] shrink-0 w-full">
                        <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
                          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] w-full">
                            {rule.title}
                          </p>
                          <div className="flex items-center relative shrink-0 w-full">
                            <p className="flex-1 min-w-px [font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px]">
                              {rule.description}
                            </p>
                          </div>
                        </div>
                        <Switch active={rule.active} onChange={() => toggleRule(rule.id)} />
                      </div>
                      {idx < rules.length - 1 && (
                        <div className="h-px my-[4px] relative shrink-0 w-full" style={{ background: "#1d2132" }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* New Rule Suggestions */}
            <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
              <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
                <div className="flex flex-1 items-center min-w-px relative">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px] whitespace-nowrap">New Rule Suggestions</p>
                </div>
              </div>
              <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
                <div className="flex flex-col items-start relative shrink-0 w-full">
                  {suggestions.map((rule) => (
                    <div key={rule.id} className="bg-[#0a0c10] flex gap-[16px] items-start p-[8px] relative rounded-[8px] shrink-0 w-full">
                      <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
                        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">{rule.title}</p>
                        <div className="flex items-center relative shrink-0 w-full">
                          <p className="flex-1 min-w-px [font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px]">{rule.description}</p>
                        </div>
                      </div>
                      <Switch active={rule.active} onChange={() => toggleSuggestion(rule.id)} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Plain English Note */}
            <div
              className="flex items-center p-[8px] relative rounded-[8px] shrink-0 w-full"
              style={{ background: "#240757", border: "1px solid rgba(118,49,238,0.2)" }}
            >
              <div className="flex flex-1 items-start min-w-px relative">
                <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
                  <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#7631ee] text-[14px] w-full">
                    Rules written in plain English, not code. Brain turns your answers into enforceable policies for every agent you use, then keeps learning, monitoring, and suggesting new rules to personalize your financial journey.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
