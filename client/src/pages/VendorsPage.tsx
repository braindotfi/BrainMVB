import { useLocation } from "wouter";
import { ArrowLeft, ShieldCheck } from "lucide-react";

/* Placeholder destination for "trust first →" in the rule builder. Trusting a
   new vendor is a deliberate step that lives here — it is never granted inline
   from the builder. */
export function VendorsPage() {
  const [, navigate] = useLocation();
  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col items-center justify-center gap-[16px] p-[24px]">
      <div className="flex size-[48px] items-center justify-center rounded-[12px] bg-[#240757]">
        <ShieldCheck size={22} className="text-[#7631ee]" />
      </div>
      <div className="flex flex-col items-center gap-[6px] max-w-[420px] text-center">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[20px] leading-[26px]">
          Trusted vendors
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px] leading-[20px]">
          This is where you'll review and trust new vendors before any rule can pay them
          automatically. Trust is granted deliberately here — never from inside a rule.
        </p>
      </div>
      <button
        type="button"
        onClick={() => navigate("/rules")}
        data-testid="button-back-to-rules"
        className="flex items-center gap-[8px] px-[16px] py-[10px] rounded-[100px] bg-[#240757] border border-[rgba(118,49,238,0.35)] hover:bg-[#2e0a6b] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#7631ee]"
      >
        <ArrowLeft size={16} /> Back to rules
      </button>
    </div>
  );
}
