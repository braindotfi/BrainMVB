import { ShieldCheck, Clock, ExternalLink } from "lucide-react";
import type { AnchorProof } from "@/lib/auditTypes";

/* ── Shared AnchorStatus component ───────────────────────────────────────────────────────────
   One component, two modes, honest batched-anchoring progression.
   - mode="status" → quiet status line for operational surfaces
   - mode="proof"  → full merkle/tx/block block for the canonical audit record */

export function AnchorStatus({
  anchor,
  mode = "status",
  onVerify,
  onViewFullRecord,
}: {
  anchor: AnchorProof;
  mode?: "status" | "proof";
  onVerify?: () => void;
  onViewFullRecord?: () => void;
}) {
  const isAnchored = anchor.status === "anchored";
  const pending = !isAnchored;

  const Icon = pending ? Clock : ShieldCheck;
  const iconColor = pending ? "#6c779d" : "#42bf23";
  const statusLabel = pending
    ? "Recorded · anchoring in next batch"
    : "Anchored · tamper-evident";
  const guarantee = pending
    ? "This record will be anchored on Base in the next batch and then be independently verifiable."
    : "This record is anchored on Base and can't be altered. Confirm it independently, without trusting Brain.";

  return (
    <div className="flex flex-col gap-[12px] w-full">
      <div className="flex items-center gap-[8px] w-full">
        <Icon size={16} style={{ color: iconColor }} className="shrink-0" />
        <span className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[18px]" style={{ color: iconColor }}>
          {statusLabel}
        </span>
      </div>

      <p className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] text-[#6c779d] w-full">
        {guarantee}
      </p>

      {/* Hash block — shown only in proof mode when anchored */}
      {mode === "proof" && (
        <div className="bg-[#0a0c10] rounded-[8px] p-[12px] flex flex-col gap-[8px] w-full">
          <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] leading-[16px] text-[#6c779d] w-full">
            Audit ID: {anchor.auditId}
          </p>
          {pending ? (
            <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] leading-[16px] text-[#414965] w-full">
              Hashes pending next batch
            </p>
          ) : (
            <>
              <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] leading-[16px] text-[#6c779d] w-full">
                Merkle root: {anchor.merkleRoot}
              </p>
              <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] leading-[16px] text-[#6c779d] w-full">
                Base tx: {anchor.baseTx}
              </p>
              <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] leading-[16px] text-[#6c779d] w-full">
                Block: {anchor.block?.toLocaleString()}
              </p>
              <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] leading-[16px] text-[#414965] w-full">
                Anchored at {anchor.anchoredAtLabel}
              </p>
            </>
          )}
        </div>
      )}

      {/* Action row: Verify button in proof mode; inline verify link in status mode */}
      {mode === "proof" ? (
        <button
          type="button"
          onClick={onVerify}
          disabled={pending}
          data-testid="button-verify-on-chain"
          className="flex items-center justify-center gap-[6px] px-[16px] py-[8px] rounded-[100px] bg-[#7631ee] hover:bg-[#8a4ef4] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[13px] text-white w-fit focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
        >
          Verify on-chain
          <ExternalLink size={13} />
        </button>
      ) : (
        <div className="flex gap-[12px] items-center w-full">
          <button
            type="button"
            onClick={onVerify}
            disabled={pending}
            data-testid="button-verify-inline"
            className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] text-[#7631ee] hover:text-[#a8b9f4] disabled:text-[#414965] disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
          >
            Verify
          </button>
          {onViewFullRecord && (
            <button
              type="button"
              onClick={onViewFullRecord}
              data-testid="button-view-full-record"
              className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] text-[#7631ee] hover:text-[#a8b9f4] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
            >
              View full record in Audit Log
            </button>
          )}
        </div>
      )}
    </div>
  );
}
