import { Clock, ExternalLink } from "lucide-react";
import anchoredIcon from "@assets/anchored_1783385308122.png";
import type { AnchorProof } from "@/lib/auditTypes";

/* ── Shared AnchorStatus component ───────────────────────────────────────────────────────────
   One component, two modes, honest batched-anchoring progression.
   mode="status" means quiet status line for operational surfaces
   mode="proof" means full merkle/tx/block block for the canonical audit record */

function HashRow({
  label,
  value,
  dim = false,
  first = false,
}: {
  label: string;
  value: string | undefined;
  dim?: boolean;
  first?: boolean;
}) {
  return (
    <div className={`flex items-start gap-[8px] px-[12px] py-[8px]${first ? "" : " border-t border-[#1d2132]"}`}>
      <span className="[font-family:'JetBrains_Mono',monospace] text-[12px] leading-[18px] text-[#414965] shrink-0 whitespace-nowrap">
        {label}
      </span>
      <span className={`[font-family:'JetBrains_Mono',monospace] text-[12px] leading-[18px] break-all min-w-0 ${dim ? "text-[#414965]" : "text-[#6c779d]"}`}>
        {value ?? "—"}
      </span>
    </div>
  );
}

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

  const iconColor = pending ? "#6c779d" : "#42bf23";
  const statusLabel = pending
    ? "Not yet anchored. It usually completes within a few hours."
    : "Anchored · tamper-evident";
  const guarantee = pending
    ? "Once anchored on Base, this record becomes independently verifiable."
    : "This record is anchored on Base and can't be altered. Confirm it independently, without trusting Brain.";

  return (
    <div className="flex flex-col gap-[12px] w-full">
      <div className="flex items-center gap-[8px] w-full">
        {pending ? (
          <Clock size={16} style={{ color: iconColor }} className="shrink-0" />
        ) : (
          <img src={anchoredIcon} alt="Anchored" className="size-[16px] shrink-0" />
        )}
        <span className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[18px]" style={{ color: iconColor }}>
          {statusLabel}
        </span>
      </div>

      <p className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] text-[#6c779d] w-full">
        {guarantee}
      </p>

      {/* Hash table — proof mode only; row-divided, label dim / value muted */}
      {mode === "proof" && (
        <div className="bg-[#0a0c10] border border-[#1d2132] rounded-[8px] overflow-hidden w-full">
          <HashRow first label="Audit ID" value={anchor.auditId} />
          {pending ? (
            <HashRow label="Status" value="Not yet anchored" dim />
          ) : (
            <>
              <HashRow label="Merkle root" value={anchor.merkleRoot} />
              <HashRow label="Base tx" value={anchor.baseTx} />
              <HashRow label="Block" value={anchor.block?.toLocaleString()} />
              <HashRow label="Anchored at" value={anchor.anchoredAtLabel} dim />
            </>
          )}
        </div>
      )}

      {/* Action row */}
      {mode === "proof" ? (
        <div className="flex flex-col gap-[12px] w-full mt-[20px]">
          <span
            className="w-full"
            title={pending ? "Verification isn't available yet — this record hasn't been anchored on-chain." : undefined}
          >
            <button
              type="button"
              onClick={pending ? undefined : onVerify}
              disabled={pending}
              aria-disabled={pending}
              data-testid="button-verify-on-chain"
              className="flex items-center justify-center gap-[6px] px-[20px] py-[10px] rounded-[100px] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[16px] w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
              style={
                pending
                  ? { background: "#1a1c24", color: "#6c779d" }
                  : { background: "#240757", color: "#7631ee" }
              }
            >
              Verify On-Chain
            </button>
          </span>
          {pending && (
            <p data-testid="text-verify-pending-caption" className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] text-[#6c779d]">
              Verification opens once anchored.
            </p>
          )}
        </div>
      ) : (
        <div className="flex gap-[12px] items-center w-full">
          {pending ? (
            <span
              data-testid="text-verify-pending-caption"
              className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] text-[#414965]"
            >
              Verification opens once anchored.
            </span>
          ) : (
            <button
              type="button"
              onClick={onVerify}
              data-testid="button-verify-inline"
              className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] text-[#7631ee] hover:text-[#a8b9f4] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
            >
              Verify
            </button>
          )}
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
