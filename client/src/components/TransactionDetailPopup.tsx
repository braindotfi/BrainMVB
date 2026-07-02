import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useCurrency } from "@/lib/currencyContext";

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
  inflow: "Money in",
  outflow: "Money out",
  transfer: "Transfer",
  adjustment: "Adjustment",
};

function formatFullDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-[4px]">
    <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[12px] uppercase tracking-[0.5px]">
      {label}
    </p>
    <div className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[15px] break-words">{children}</div>
  </div>
);

/**
 * Centered detail popup for a single Ledger transaction (DialogPrimitive),
 * matching VendorDetailPopup / AuditRecordPopup styling.
 * Resolves the row by id from the shared React Query cache.
 */
export function TransactionDetailPopup({ txId, onClose }: { txId: string | null; onClose: () => void }) {
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
  const tx = data?.transactions?.find((t) => t.id === txId) ?? null;
  const open = txId != null;

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
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] border-solid flex flex-col items-start overflow-hidden rounded-[24px] w-[520px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out">
          {/* Header */}
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-[#1d2132] border-b border-solid flex items-center gap-[12px] px-[20px] py-[14px] relative shrink-0 w-full">
            <div className="flex items-center gap-[8px] flex-1 min-w-px">
              <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[16px] text-[#a8b9f4]">Transaction detail</span>
            </div>
            <DialogPrimitive.Close
              className="size-[32px] rounded-full bg-[#222737] flex items-center justify-center hover:bg-[#2c3247] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] shrink-0"
              data-testid="button-close-transaction-popup"
            >
              <X size={14} className="text-[#a8b9f4]" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex flex-col gap-[24px] items-start p-[24px] w-full overflow-y-auto" data-testid="transaction-detail-popup-content">
            {tx ? (
              <div className="flex flex-col gap-[20px] w-full">
                <div className="flex flex-col gap-[4px]">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[18px]">{label}</p>
                  <p className="[font-family:'JetBrains_Mono',monospace] font-medium text-[#a8b9f4] text-[24px]">
                    {positive ? "+" : "-"}
                    {format(Math.abs(Number.isFinite(amount) ? amount : 0))}
                  </p>
                  <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]">
                    {Number.isFinite(amount) ? Math.abs(amount).toLocaleString() : tx.amount} {tx.currency}
                  </p>
                </div>
                <div className="h-px w-full bg-[#1d2132]" />
                <Field label="Direction">{DIRECTION_LABEL[tx.direction] ?? tx.direction}</Field>
                {counterpartyName && <Field label={positive ? "From" : "To"}>{counterpartyName}</Field>}
                {accountName && <Field label="Account">{accountName}</Field>}
                <Field label="Date">{formatFullDate(tx.transaction_date)}</Field>
                {tx.reconciliation_status && (
                  <Field label="Reconciliation">
                    {tx.reconciliation_status === "reconciled" ? "Reconciled with the bank" : "Not yet reconciled"}
                  </Field>
                )}
                {tx.description_raw && tx.description_raw !== tx.description_normalized && (
                  <Field label="Original description">{tx.description_raw}</Field>
                )}
                <Field label="Transaction ID">
                  <span className="[font-family:'JetBrains_Mono',monospace] text-[13px] text-[#6c779d]">{tx.id}</span>
                </Field>
              </div>
            ) : (
              <div className="flex flex-col gap-[8px]">
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
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
