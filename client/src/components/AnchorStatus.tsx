import clockIcon from "@assets/clock_1784932797624.png";
import anchoredIcon from "@assets/anchored_1783385308122.png";
import type { AnchorProof } from "@/lib/auditTypes";

/* ── Shared AnchorStatus component ───────────────────────────────────────────────────────────
   One component, two modes, honest batched-anchoring progression.
   mode="status" means quiet status line for operational surfaces
   mode="proof" means full merkle/tx/block block for the canonical audit record */

function HashRow({
  label,
  value,
  first = false,
  valueDim = false,
}: {
  label: string;
  value: string | undefined;
  first?: boolean;
  valueDim?: boolean;
}) {
  return (
    <div className={`content-stretch flex items-start relative shrink-0 w-full${first ? "" : " border-t border-[#1d2132]"}`}>
      {/* Label column — fixed 140px, Gilroy SemiBold 12px #6c779d */}
      <div className="content-stretch flex flex-col items-start justify-center px-[12px] py-[8px] shrink-0 w-[140px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[12px] whitespace-nowrap">
          {label}
        </p>
      </div>
      {/* Value column — Gilroy Medium 13px #a8b9f4 (or #6c779d when dim) */}
      <div className="content-stretch flex flex-[1_0_0] flex-col items-start justify-center min-w-px px-[12px] py-[8px]">
        <p className={`[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[13px] break-all ${valueDim ? "text-[#6c779d]" : "text-[#a8b9f4]"}`}>
          {value ?? "—"}
        </p>
      </div>
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
  /* Three honest states (see AnchorStatus type in auditTypes.ts):
     anchored                → green, immutability claim, Verify On-Chain rendered.
     recorded_pending_anchor → amber, "verifiable, on-chain anchor pending", NO Verify button.
     pending_next_batch      → neutral, proof incomplete, NO Verify button. */
  const isAnchored = anchor.status === "anchored" && !!anchor.baseTx;
  const isRecorded = anchor.status === "recorded_pending_anchor";
  const pending = !isAnchored;

  const statusLabel = isAnchored
    ? "Anchored · tamper-evident"
    : isRecorded
      ? "Recorded & verifiable — on-chain anchor pending."
      : "Proof incomplete. This record hasn't been anchored on-chain yet.";

  const statusColor = isAnchored ? "text-[#42bf23]" : isRecorded ? "text-[#f59e0b]" : "text-[#a8b9f4]";

  /* The on-chain-immutability claim is ONLY made when a real, linkable tx
     exists. The recorded state claims exactly what is true: sealed in the
     append-only audit chain, cryptographically verifiable, anchor pending. */
  const guarantee = isAnchored
    ? "This record is anchored on Base and can't be altered. Confirm it independently, without trusting Brain."
    : isRecorded
      ? "This record is sealed in Brain's append-only audit chain and can be verified cryptographically. The on-chain anchor to Base is pending."
      : "Once anchored on Base, this record becomes independently verifiable.";

  return (
    <div className="flex flex-col gap-[16px] w-full">

      {/* Status line: icon + label */}
      <div className="content-stretch flex gap-[8px] items-start relative shrink-0 w-full">
        {pending ? (
          <img src={clockIcon} alt="Pending" className="size-[16px] shrink-0 object-contain" />
        ) : (
          <img src={anchoredIcon} alt="Anchored" className="size-[16px] shrink-0 mt-[2px]" />
        )}
        <p className={`[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[16px] flex-[1_0_0] min-w-px ${statusColor}`}>
          {statusLabel}
        </p>
      </div>

      {/* Guarantee sub-line */}
      <div className="content-stretch flex items-center relative shrink-0 w-full">
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px] flex-[1_0_0] min-w-px">
          {guarantee}
        </p>
      </div>

      {/* Hash table — proof mode only; two-column label/value rows */}
      {mode === "proof" && (
        <div className="bg-[#0a0c10] border border-[#1d2132] border-solid content-stretch flex flex-col items-start relative rounded-[12px] shrink-0 w-full overflow-hidden">
          <HashRow first label="Audit ID" value={anchor.auditId} />
          {(isAnchored || isRecorded) && (
            <HashRow label="Merkle root" value={anchor.merkleRoot} />
          )}
          {isAnchored && (
            <>
              <HashRow label="Base tx" value={anchor.baseTx} />
              <HashRow label="Block" value={anchor.block?.toLocaleString()} />
              <HashRow label="Anchored at" value={anchor.anchoredAtLabel} valueDim />
            </>
          )}
          {isRecorded && (
            <HashRow label="Recorded at" value={anchor.recordedAtLabel} valueDim />
          )}
        </div>
      )}

      {/* Action row */}
      {mode === "proof" ? (
        <div className="flex flex-col gap-[12px] w-full mt-[4px]">
          {/* Verify On-Chain is CONDITIONALLY RENDERED, never a dead/disabled
              link — it only exists when a confirmed tx hash backs it. */}
          {isAnchored && (
            <button
              type="button"
              onClick={onVerify}
              data-testid="button-verify-on-chain"
              className="flex items-center justify-center gap-[6px] px-[20px] py-[10px] rounded-[100px] transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[16px] w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
              style={{ background: "#240757", color: "#7631ee" }}
            >
              Verify On-Chain
            </button>
          )}
          {pending && (
            <p data-testid="text-verify-pending-caption" className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] text-[#6c779d]">
              On-chain verification opens once anchored.
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
