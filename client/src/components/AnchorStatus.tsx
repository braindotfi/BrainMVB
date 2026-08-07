import clockIcon from "@assets/clock_1784932797624.png";
import anchoredIcon from "@assets/anchored_1785799770049.png";
import type { AnchorProof } from "@/lib/auditTypes";

/* ── Shared AnchorStatus component ───────────────────────────────────────────────────────────
   One component, two modes, honest batched-anchoring progression.
   mode="status" means quiet status line for operational surfaces
   mode="proof" means full merkle/tx/block block for the canonical audit record */

/* Figma 5734:71784 — two-column row in the hash evidence table.
   Each row except the LAST gets border-b (matching the frame which puts the
   divider on the bottom of each non-terminal row, not the top of the next). */
function HashRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string | undefined;
  last?: boolean;
}) {
  return (
    <div className={`content-stretch flex items-start relative shrink-0 w-full${last ? "" : " border-b border-[#1d2132]"}`}>
      {/* Label column — fixed 140px, Gilroy SemiBold 12px/20 #6c779d */}
      <div className="content-stretch flex flex-col items-start justify-center px-[12px] py-[8px] shrink-0 w-[140px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[12px] whitespace-nowrap">
          {label}
        </p>
      </div>
      {/* Value column — Gilroy Medium 13px/20 #a8b9f4.
          `break-all` keeps real merkle roots / tx hashes inside the cell;
          the Figma sample values are pre-truncated, real ones are not. */}
      <div className="content-stretch flex flex-[1_0_0] flex-col items-start justify-center min-w-px px-[12px] py-[8px]">
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[13px] break-all text-[#a8b9f4]">
          {value ?? "-"}
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
  /* Four honest states (see AnchorStatus type in auditTypes.ts):
     anchored                → green, immutability claim, Verify On-Chain rendered.
     recorded_pending_anchor → amber, "verifiable, on-chain anchor pending", NO Verify button.
     pending_next_batch      → neutral, proof incomplete, NO Verify button.
     not_recorded            → neutral, and must NOT say "yet": this record never reached
                               brain-core's audit log, so no anchor will ever cover it.
                               Promising a future anchor here is the same class of overclaim
                               the green-badge fix removed, one state further down. */
  const isAnchored = anchor.status === "anchored" && !!anchor.baseTx;
  const isRecorded = anchor.status === "recorded_pending_anchor";
  const isNotRecorded = anchor.status === "not_recorded";
  const pending = !isAnchored;

  const statusLabel = isAnchored
    ? "Anchored · Tamper-Evident"
    : isRecorded
      ? "Recorded and verifiable. On-chain anchor pending."
      : isNotRecorded
        ? "Not in the audit log. This activity has no on-chain proof."
        : "Proof incomplete. This record hasn't been anchored on-chain yet.";

  /* All non-anchored states share the clock icon (#a8b9f4 baby blue), so the
     status label matches it regardless of whether we're recorded-pending or
     just waiting for the next batch. Using amber for "recorded" was visually
     inconsistent: the icon didn't change but the text did. */
  const statusColor = isAnchored ? "text-[#42bf23]" : "text-[#a8b9f4]";

  /* The on-chain-immutability claim is ONLY made when a real, linkable tx
     exists. The recorded state claims exactly what is true: sealed in the
     append-only audit chain, cryptographically verifiable, anchor pending. */
  const guarantee = isAnchored
    ? "This record is anchored on Base and can't be altered. Confirm it independently, without trusting Brain."
    : isRecorded
      ? "This record is sealed in Brain's append-only audit chain and can be verified cryptographically. The on-chain anchor to Base is pending."
      : isNotRecorded
        ? "This activity was handled outside Brain's audit log, so there is nothing to anchor or verify on-chain."
        : "Once anchored on Base, this record becomes independently verifiable.";

  return (
    <div className="flex flex-col gap-[16px] w-full">

      {/* Status line: icon + label */}
      <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full">
        {pending ? (
          <img src={clockIcon} alt={isNotRecorded ? "Not recorded" : "Pending"} className="size-[16px] shrink-0 object-contain" />
        ) : (
          <img src={anchoredIcon} alt="Anchored" className="size-[16px] shrink-0" />
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

      {/* Hash table — proof mode only; two-column label/value rows (Figma 5734:71798).
          Border-b on all rows except the last so the table's own outer border
          closes cleanly without a double-line at the bottom. */}
      {mode === "proof" && (
        <div className="bg-[#0a0c10] border border-[#1d2132] border-solid content-stretch flex flex-col items-start relative rounded-[12px] shrink-0 w-full overflow-hidden">
          {isAnchored ? (
            <>
              <HashRow label="Audit ID"    value={anchor.auditId} />
              <HashRow label="Merkle Root" value={anchor.merkleRoot} />
              <HashRow label="Base TX"     value={anchor.baseTx} />
              <HashRow label="Block"       value={anchor.block?.toLocaleString()} />
              <HashRow label="Anchored On" value={anchor.anchoredAtLabel} last />
            </>
          ) : isRecorded ? (
            <>
              <HashRow label="Audit ID"    value={anchor.auditId} />
              <HashRow label="Merkle Root" value={anchor.merkleRoot} />
              <HashRow label="Recorded On" value={anchor.recordedAtLabel} last />
            </>
          ) : (
            <HashRow label="Audit ID" value={anchor.auditId} last />
          )}
        </div>
      )}

      {/* mode="status" action row — inline Verify / pending caption / view-record link.
          mode="proof" no longer renders a button here: the Verify On-Chain CTA
          belongs in a dedicated footer in the popup (Figma 5734:71827) separated
          by a border-t, not inside the scrollable content area. */}
      {mode !== "proof" && (
        <div className="flex gap-[12px] items-center w-full">
          {isNotRecorded ? (
            <span
              data-testid="text-not-recorded-caption"
              className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] text-[#414965]"
            >
              No on-chain proof. This activity was never recorded in Brain's audit log.
            </span>
          ) : pending ? (
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
