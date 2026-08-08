import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { EvidenceTile } from "@/lib/proposalCards";

/** Read-only record surface for evidence kinds that do not yet have a dedicated
 * ledger popup (currently obligations/payables). It deliberately renders only
 * the resolved title and facts carried by the proposal. */
export function LiveEvidenceRecordPopup({
  evidence,
  open,
  onOpenChange,
}: {
  evidence: EvidenceTile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          data-testid="live-evidence-record-popup"
          className="fixed left-[50%] top-[50%] z-[60] translate-x-[-50%] translate-y-[-50%] bg-brain-v1baby-blue-5 border border-brain-v1stroke-2 border-solid flex flex-col items-start overflow-hidden rounded-modal w-[480px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none"
        >
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-brain-v1stroke-2 border-solid h-[56px] relative shrink-0 w-full flex items-center justify-center px-[16px]">
            <DialogPrimitive.Title className="[font-family:'Gilroy',sans-serif] font-semibold text-[20px] leading-[24px] text-brain-v1baby-blue-100 text-center truncate max-w-[calc(100%-64px)]">
              {evidence?.label ?? "Evidence"}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close"
              data-testid="button-live-evidence-record-close"
              className="absolute right-[11px] top-[11px] size-[32px] flex items-center justify-center rounded-full bg-brain-v1baby-blue-15 hover:bg-brain-v1baby-blue-15-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
            >
              <X size={16} className="text-brain-v1baby-blue-60" />
            </DialogPrimitive.Close>
          </div>

          {evidence && (
            <div className="flex flex-col gap-[16px] p-[24px] w-full overflow-y-auto">
              <div className="flex flex-col gap-[8px]">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[20px] leading-[28px] text-brain-v1baby-blue-100">
                  {evidence.display}
                </p>
                <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] leading-[16px] text-brain-v1baby-blue-30 break-all">
                  {evidence.kind}
                </p>
              </div>
              {evidence.facts.length > 0 && (
                <div className="bg-brain-v1highlight-dropdown-bg border border-solid border-brain-v1stroke-2 rounded-row overflow-hidden">
                  {evidence.facts.map((fact, index) => (
                    <div
                      key={`${fact.label}-${index}`}
                      className={`flex items-start w-full ${index < evidence.facts.length - 1 ? "border-b border-solid border-brain-v1stroke-2" : ""}`}
                    >
                      <div className="px-[12px] py-[8px] w-[140px] shrink-0">
                        <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] text-brain-v1baby-blue-60">
                          {fact.label}
                        </span>
                      </div>
                      <div className="px-[12px] py-[8px] min-w-0 flex-1">
                        <span className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-brain-v1baby-blue-100 break-words">
                          {fact.value}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}