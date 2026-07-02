import { useQuery } from "@tanstack/react-query";
import { Landmark, PiggyBank, Wallet, Coins, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useCurrency } from "@/lib/currencyContext";

/* ── Read-only Account detail popup ───────────────────────────────────────────────────────────
   Centered modal (DialogPrimitive) matching VendorDetailPopup / AuditRecordPopup.
   Opened from an Accounts-tab row. Renders ONE brain-core Ledger account: its
   balance, a provenance block, and its recent activity. No action buttons. */

type AccountKind =
  | "bank_checking"
  | "bank_savings"
  | "card"
  | "loan"
  | "line_of_credit"
  | "onchain"
  | "payment_processor";

interface BrainAccountDTO {
  id: string;
  name: string;
  account_type: AccountKind;
  currency: string;
  institution?: string | null;
  external_account_id?: string | null;
  current_balance?: string | null;
  available_balance?: string | null;
  status?: string | null;
  provenance?: string | null;
  confidence?: number | null;
  updated_at?: string | null;
}
interface BrainAccountsResponse {
  accounts: BrainAccountDTO[];
}

interface BrainTransactionDTO {
  id: string;
  account_id?: string | null;
  amount: string;
  currency: string;
  direction: "inflow" | "outflow" | "transfer" | "adjustment";
  transaction_date: string;
  description_normalized?: string | null;
  description_raw?: string | null;
}
interface BrainTransactionsResponse {
  transactions: BrainTransactionDTO[];
}

const KIND_LABEL: Record<AccountKind, string> = {
  bank_checking: "Bank checking",
  bank_savings: "Savings",
  card: "Card",
  loan: "Loan",
  line_of_credit: "Line of credit",
  onchain: "On-chain balance",
  payment_processor: "Payment processor",
};

const KIND_ICON: Record<AccountKind, typeof Landmark> = {
  bank_checking: Landmark,
  bank_savings: PiggyBank,
  card: Wallet,
  loan: Wallet,
  line_of_credit: Wallet,
  onchain: Coins,
  payment_processor: Wallet,
};

function roleOf(a: BrainAccountDTO): string {
  if (a.account_type === "onchain") return "On-chain smart account";
  if (a.account_type === "bank_savings") return "Reserve / savings";
  if (a.account_type === "bank_checking") {
    return /operating/i.test(a.name) ? "Primary operating account" : "Checking account";
  }
  return KIND_LABEL[a.account_type] ?? a.account_type;
}

function truncAddr(addr: string): string {
  return addr.length > 14 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function accountRef(a: BrainAccountDTO): string {
  const ext = a.external_account_id ?? "";
  if (a.account_type === "onchain" && ext.startsWith("0x")) return truncAddr(ext);
  return ext || "—";
}

function balanceLabel(a: BrainAccountDTO, format: (n: string | number) => string): string {
  const raw = a.current_balance != null ? Number(a.current_balance) : 0;
  const value = Number.isFinite(raw) ? raw : 0;
  if (a.currency === "USD") return format(value);
  const trimmed = Number(value.toFixed(6)).toString();
  return `${trimmed} ${a.currency}`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-[8px]">
      <span className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase text-[#414965] tracking-[0.04em] shrink-0">
        {label}
      </span>
      <span className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] text-[#a8b9f4] text-right break-all">
        {value}
      </span>
    </div>
  );
}

export function AccountDetailPopup({
  accountId,
  onClose,
  onOpenTransaction,
}: {
  accountId: string | null;
  onClose: () => void;
  onOpenTransaction: (txId: string) => void;
}) {
  const { format } = useCurrency();
  const { data: acctData } = useQuery<BrainAccountsResponse>({
    queryKey: ["/api/brain/ledger/accounts"],
    enabled: accountId != null,
    retry: false,
  });
  const { data: txData } = useQuery<BrainTransactionsResponse>({
    queryKey: ["/api/brain/ledger/transactions"],
    enabled: accountId != null,
    retry: false,
  });

  const account = acctData?.accounts?.find((a) => a.id === accountId) ?? null;
  const open = accountId != null;

  const activity = (txData?.transactions ?? [])
    .filter((t) => t.account_id === accountId)
    .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime())
    .slice(0, 5);

  const Icon = account ? KIND_ICON[account.account_type] : Landmark;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] border-solid flex flex-col items-start overflow-hidden rounded-[24px] w-[520px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out">
          {/* Header */}
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-[#1d2132] border-b border-solid flex items-center gap-[12px] px-[20px] py-[14px] relative shrink-0 w-full">
            <div className="flex items-center gap-[8px] flex-1 min-w-px">
              <span className="flex items-center justify-center size-[28px] rounded-[8px] bg-[#0d1523] shrink-0">
                <Icon size={14} className="text-[#a8b9f4]" />
              </span>
              <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[16px] text-[#a8b9f4]">
                Account detail
              </span>
            </div>
            <DialogPrimitive.Close
              className="size-[32px] rounded-full bg-[#222737] flex items-center justify-center hover:bg-[#2c3247] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] shrink-0"
              data-testid="button-close-account-popup"
            >
              <X size={14} className="text-[#a8b9f4]" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex flex-col gap-[24px] items-start p-[24px] w-full overflow-y-auto" data-testid="account-detail-popup-content">
            {account ? (
              <div className="flex flex-col gap-[20px] w-full">
                {/* Headline */}
                <div className="flex flex-col gap-[4px]">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[18px]">{account.name}</p>
                  <p className="[font-family:'JetBrains_Mono',monospace] font-medium text-[#a8b9f4] text-[26px]" data-testid="text-account-balance">
                    {balanceLabel(account, format)}
                  </p>
                  <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]">{roleOf(account)}</p>
                </div>

                <div className="h-px w-full bg-[#1d2132]" />

                {/* Provenance */}
                <div className="flex flex-col gap-[8px] w-full" data-testid="account-provenance">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#414965] uppercase tracking-[0.04em]">Provenance</p>
                  <div className="bg-[#0d1017] rounded-[8px] px-[12px] py-[10px] flex flex-col gap-[6px]">
                    <Row label="source" value={`${account.institution ?? "—"} · ${KIND_LABEL[account.account_type] ?? account.account_type}`} />
                    <Row label="account" value={accountRef(account)} />
                    {account.status && <Row label="status" value={account.status} />}
                    {typeof account.confidence === "number" && (
                      <Row label="confidence" value={`${Math.round(account.confidence * 100)}%`} />
                    )}
                    {account.provenance && <Row label="channel" value={account.provenance} />}
                    <Row label="synced" value={formatDate(account.updated_at)} />
                  </div>
                </div>

                {/* Recent activity */}
                <div className="flex flex-col gap-[8px] w-full" data-testid="account-recent-activity">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#414965] uppercase tracking-[0.04em]">Recent activity</p>
                  {activity.length > 0 ? (
                    <div className="flex flex-col gap-[6px]">
                      {activity.map((t) => {
                        const positive = t.direction === "inflow";
                        const amt = Number(t.amount);
                        const label = t.description_normalized ?? t.description_raw ?? (positive ? "Incoming payment" : "Outgoing payment");
                        return (
                          <div
                            key={t.id}
                            role="button"
                            tabIndex={0}
                            data-testid={`account-activity-${t.id}`}
                            onClick={() => onOpenTransaction(t.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenTransaction(t.id); }
                            }}
                            className="flex gap-[12px] items-center p-[10px] rounded-[8px] bg-[#0d1017] border border-transparent transition-colors hover:bg-[#151926] hover:border-[#1d2132] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                          >
                            <div className="flex flex-1 flex-col min-w-px">
                              <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#a8b9f4] truncate">{label}</p>
                              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] text-[#6c779d]">{shortDate(t.transaction_date)}</p>
                            </div>
                            <p
                              className="[font-family:'JetBrains_Mono',monospace] font-medium text-[15px] shrink-0"
                              style={{ color: positive ? "#42bf23" : "#a8b9f4" }}
                            >
                              {positive ? "+" : "-"}{format(Math.abs(Number.isFinite(amt) ? amt : 0))}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px]">
                      No recent activity on this account yet.
                    </p>
                  )}
                </div>

                {/* Viewer-not-owner caption */}
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[11px] leading-[16px] text-[#6c779d]">
                  A read-only view — Brain reads this balance from your ledger; your bank owns the account.
                </p>
              </div>
            ) : (
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px]">
                This account isn't in your current ledger.
              </p>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
