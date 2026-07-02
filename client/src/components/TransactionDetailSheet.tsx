import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
 * Right-slide detail panel for a single Ledger transaction. Resolves the row by
 * id from the shared `["/api/brain/ledger/transactions"]` React Query cache, so it
 * works whether opened from the Finances list or from an assistant evidence link
 * (no extra fetch when the cache is warm). `txId === null` keeps it closed.
 */
export function TransactionDetailSheet({ txId, onClose }: { txId: string | null; onClose: () => void }) {
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
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="bg-[#0a0c10] border-[#1d2132] text-[#a8b9f4] w-full sm:max-w-[420px] flex flex-col gap-[20px] overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[20px]">
            Transaction detail
          </SheetTitle>
        </SheetHeader>

        {tx ? (
          <div className="flex flex-col gap-[20px]">
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
      </SheetContent>
    </Sheet>
  );
}
