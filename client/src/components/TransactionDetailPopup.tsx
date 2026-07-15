import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
// lucide-react removed - close icon uses asset
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useCurrency } from "@/lib/currencyContext";
import arrowIcon from "@assets/arrow_1783201262245.png";
import closeIcon from "@assets/Close_1783293571882.png";

/** Subset of brain-core's Transaction we render (mirrors FinancesPage). */
export interface BrainTransactionDTO {
  id: string;
  amount: string;
  currency: string;
  direction: "inflow" | "outflow" | "transfer" | "adjustment";
  transaction_date: string;
  description_normalized?: string | null;
  description_raw?: string | null;
  account_id?: string | null;
  counterparty_id?: string | null;
  reconciliation_status?: string | null;
}
interface BrainTransactionsResponse {
  transactions: BrainTransactionDTO[];
  next_cursor?: string | null;
}

interface AccountLite { id: string; name?: string | null }
interface AccountsLiteResponse { accounts: AccountLite[] }
interface CounterpartyLite { id: string; name?: string | null }
interface CounterpartiesLiteResponse { counterparties: CounterpartyLite[] }

const DIRECTION_LABEL: Record<BrainTransactionDTO["direction"], string> = {
  inflow: "Incoming",
  outflow: "Outgoing",
  transfer: "Transfer",
  adjustment: "Adjustment",
};

function formatFullDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

/* ── Details table row, matching AccountDetailPopup's Provenance rows ── */
function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center w-full border-b border-[#1d2132] last:border-b-0">
      <div className="flex flex-col justify-center px-[12px] py-[8px] w-[140px] shrink-0">
        <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[20px] text-[#6c779d]">
          {label}
        </span>
      </div>
      <div className="flex flex-1 flex-col justify-center px-[12px] py-[8px] min-w-px">
        <span className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[20px] text-[#a8b9f4] break-all">
          {value}
        </span>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-[8px] items-center w-full">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[14px] text-[#6c779d] whitespace-nowrap">
        {children}
      </p>
      <div className="flex-1 h-px bg-[#1d2132]" />
    </div>
  );
}

/**
 * Centered detail popup for a single Ledger transaction (DialogPrimitive),
 * pixel-matched to Figma "Transaction Details" (node-id 5477-60088,
 * file cC2lQwC3g9hv96o5Wgy8Ek). Resolves the row by id from the shared
 * React Query cache. Previous/Next cycle through the same transactions list.
 */
export function TransactionDetailPopup({
  txId,
  onClose,
  onSelectTransaction,
  hidePager,
}: {
  txId: string | null;
  onClose: () => void;
  onSelectTransaction?: (id: string) => void;
  hidePager?: boolean;
}) {
  const { format } = useCurrency();
  const { data } = useQuery<BrainTransactionsResponse>({
    queryKey: ["/api/brain/ledger/transactions"],
    enabled: txId != null,
    retry: false,
  });
  const { data: acctData } = useQuery<AccountsLiteResponse>({
    queryKey: ["/api/brain/ledger/accounts"],
    enabled: txId != null,
    retry: false,
  });
  const { data: cpData } = useQuery<CounterpartiesLiteResponse>({
    queryKey: ["/api/brain/ledger/counterparties"],
    enabled: txId != null,
    retry: false,
  });

  const allTx = data?.transactions ?? [];
  const tx = allTx.find((t) => t.id === txId) ?? null;
  const open = txId != null;

  const currentIdx = tx ? allTx.findIndex((t) => t.id === tx.id) : -1;
  const prevTx = currentIdx > 0 ? allTx[currentIdx - 1] : null;
  const nextTx = currentIdx >= 0 && currentIdx < allTx.length - 1 ? allTx[currentIdx + 1] : null;

  const positive = tx?.direction === "inflow";
  const amount = tx ? Number(tx.amount) : 0;
  const label = tx?.description_normalized ?? tx?.description_raw ?? "Transaction";
  const accountName = tx?.account_id
    ? acctData?.accounts?.find((a) => a.id === tx.account_id)?.name ?? null
    : null;
  const counterpartyName = tx?.counterparty_id
    ? cpData?.counterparties?.find((c) => c.id === tx.counterparty_id)?.name ?? null
    : null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] border-solid flex flex-col items-start overflow-hidden rounded-[24px] w-[480px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out">
          {/* Title and Controls */}
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-[#1d2132] border-solid h-[56px] relative shrink-0 w-full">
            <DialogPrimitive.Title asChild>
              <p className="-translate-x-1/2 absolute font-['Gilroy',sans-serif] font-semibold leading-[24px] left-1/2 not-italic text-[#a8b9f4] text-[20px] text-center top-[calc(50%-12px)] whitespace-nowrap">
                Transaction Details
              </p>
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="absolute right-[12px] top-[12px] size-[32px] p-0 hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
              data-testid="button-close-transaction-popup"
            >
              <img src={closeIcon} alt="" className="size-[32px] rounded-full" />
            </DialogPrimitive.Close>
          </div>

          {tx ? (
            <>
              {/* Label / amount / currency */}
              <div className="border-b border-[#1d2132] border-solid flex flex-col items-start p-[24px] relative shrink-0 w-full">
                <div className="flex flex-col gap-[8px] items-start w-full">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]" data-testid="text-transaction-label">
                    {label}
                  </p>
                  <div className="flex gap-[8px] items-center w-full">
                    <p className="[font-family:'JetBrains_Mono',monospace] font-normal leading-[32px] text-[#a8b9f4] text-[32px] tracking-[-2px]" data-testid="text-transaction-amount">
                      {format(Math.abs(Number.isFinite(amount) ? amount : 0))}
                    </p>
                    <div className="bg-[#222737] border border-[rgba(108,119,157,0.2)] border-solid flex items-center justify-center px-[8px] py-[3px] rounded-[22px] shrink-0">
                      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#6c779d] text-[12px] text-center whitespace-nowrap">
                        {tx.currency}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Container */}
              <div className="flex flex-col gap-[16px] items-start p-[24px] relative w-full overflow-y-auto" data-testid="transaction-detail-popup-content">
                <SectionLabel>Details</SectionLabel>
                <div className="bg-[#0a0c10] border border-[#1d2132] border-solid flex flex-col items-start rounded-[12px] w-full">
                  <Row label="Direction" value={DIRECTION_LABEL[tx.direction] ?? tx.direction} />
                  {counterpartyName && <Row label={positive ? "From" : "To"} value={counterpartyName} />}
                  {accountName && <Row label="Account" value={accountName} />}
                  <Row label="Date" value={formatFullDate(tx.transaction_date)} />
                  {tx.reconciliation_status && (
                    <Row
                      label="Reconciliation"
                      value={tx.reconciliation_status === "reconciled" ? "Reconciled with the bank" : "Not yet reconciled"}
                    />
                  )}
                  {tx.description_raw && tx.description_raw !== tx.description_normalized && (
                    <Row label="Original description" value={tx.description_raw} />
                  )}
                  <Row
                    label="Transaction ID"
                    value={<span className="[font-family:'JetBrains_Mono',monospace] text-[13px] text-[#a8b9f4]">{tx.id}</span>}
                  />
                </div>
              </div>

              {!hidePager && (
                <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-t border-[#1d2132] border-solid flex flex-col items-start p-[24px] relative shrink-0 w-full">
                  <div className="flex gap-[16px] items-center w-full">
                    <button
                      type="button"
                      disabled={!prevTx}
                      data-testid="button-transaction-previous"
                      onClick={() => prevTx && onSelectTransaction?.(prevTx.id)}
                      className="bg-[#222737] flex flex-1 gap-[8px] items-center justify-center px-[20px] py-[8px] rounded-[100px] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                    >
                      <img src={arrowIcon} alt="" className="size-[16px] rotate-180" />
                      <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">
                        Previous
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={!nextTx}
                      data-testid="button-transaction-next"
                      onClick={() => nextTx && onSelectTransaction?.(nextTx.id)}
                      className="bg-[#222737] flex flex-1 gap-[8px] items-center justify-center px-[20px] py-[8px] rounded-[100px] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                    >
                      <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">
                        Next
                      </span>
                      <img src={arrowIcon} alt="" className="size-[16px]" />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col gap-[8px] items-start p-[24px] w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px]">
                This record isn't in your recent transactions.
              </p>
              {txId && (
                <span className="[font-family:'JetBrains_Mono',monospace] text-[13px] text-[#6c779d] break-words">
                  {txId}
                </span>
              )}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
