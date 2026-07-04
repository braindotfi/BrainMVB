import { useQuery } from "@tanstack/react-query";
import { Info, ChevronLeft, ChevronRight, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useCurrency } from "@/lib/currencyContext";

/* ── Read-only Account detail popup ───────────────────────────────────────────────────────────
   Centered modal (DialogPrimitive) pixel-matched to Figma "Account Details"
   (node-id 5473-60415, file cC2lQwC3g9hv96o5Wgy8Ek).
   Opened from an Accounts-tab row. Renders ONE brain-core Ledger account: its
   balance, a provenance block, and its recent activity. No action buttons —
   Previous/Next only cycle between accounts in the same list. */

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
  return trimmed;
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Row({ label, value }: { label: string; value: string }) {
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-[8px] items-center w-full">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[14px] text-[#6c779d] whitespace-nowrap">
        {children}
      </p>
      <div className="flex-1 h-px bg-[#1d2132]" />
    </div>
  );
}

export function AccountDetailPopup({
  accountId,
  onClose,
  onOpenTransaction,
  onSelectAccount,
}: {
  accountId: string | null;
  onClose: () => void;
  onOpenTransaction: (txId: string) => void;
  onSelectAccount?: (id: string) => void;
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

  const allAccounts = acctData?.accounts ?? [];
  const account = allAccounts.find((a) => a.id === accountId) ?? null;
  const open = accountId != null;

  const currentIdx = account ? allAccounts.findIndex((a) => a.id === account.id) : -1;
  const prevAccount = currentIdx > 0 ? allAccounts[currentIdx - 1] : null;
  const nextAccount = currentIdx >= 0 && currentIdx < allAccounts.length - 1 ? allAccounts[currentIdx + 1] : null;

  const activity = (txData?.transactions ?? [])
    .filter((t) => t.account_id === accountId)
    .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime())
    .slice(0, 5);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] border-solid flex flex-col items-start overflow-hidden rounded-[24px] w-[480px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out">
          {/* Title and Controls */}
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-[#1d2132] border-solid h-[56px] relative shrink-0 w-full">
            <DialogPrimitive.Title asChild>
              <p className="-translate-x-1/2 absolute font-['Gilroy',sans-serif] font-semibold leading-[24px] left-1/2 not-italic text-[#a8b9f4] text-[20px] text-center top-[calc(50%-12px)] whitespace-nowrap">
                Account Details
              </p>
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="absolute right-[12px] top-[12px] size-[32px] rounded-full bg-[#222737] flex items-center justify-center hover:bg-[#2c3247] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
              data-testid="button-close-account-popup"
            >
              <X size={14} className="text-[#a8b9f4]" />
            </DialogPrimitive.Close>
          </div>

          {account ? (
            <>
              {/* Name / balance / role */}
              <div className="border-b border-[#1d2132] border-solid flex flex-col items-start p-[24px] relative shrink-0 w-full">
                <div className="flex flex-col gap-[8px] items-start w-full">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]" data-testid="text-account-name">
                    {account.name}
                  </p>
                  <div className="flex gap-[8px] items-center w-full">
                    <p className="[font-family:'JetBrains_Mono',monospace] font-normal leading-[32px] text-[#a8b9f4] text-[32px] tracking-[-2px]" data-testid="text-account-balance">
                      {balanceLabel(account, format)}
                    </p>
                    <div className="bg-[#222737] border border-[rgba(108,119,157,0.2)] border-solid flex items-center justify-center px-[8px] py-[3px] rounded-[22px] shrink-0">
                      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#6c779d] text-[12px] text-center whitespace-nowrap">
                        {account.currency}
                      </p>
                    </div>
                  </div>
                  <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px] w-full">
                    {roleOf(account)}
                  </p>
                </div>
              </div>

              {/* Container */}
              <div className="flex flex-col gap-[32px] items-start p-[24px] relative shrink-0 w-full overflow-y-auto">
                {/* Provenance */}
                <div className="flex flex-col gap-[16px] items-start w-full" data-testid="account-provenance">
                  <SectionLabel>Provenance</SectionLabel>
                  <div className="bg-[#0a0c10] border border-[#1d2132] border-solid flex flex-col items-start rounded-[12px] w-full">
                    <Row label="Source" value={`${account.institution ?? "—"} · ${KIND_LABEL[account.account_type] ?? account.account_type}`} />
                    <Row label="Account" value={accountRef(account)} />
                    {account.status && <Row label="Status" value={account.status} />}
                    {typeof account.confidence === "number" && (
                      <Row label="Confidence" value={`${Math.round(account.confidence * 100)}%`} />
                    )}
                    {account.provenance && <Row label="Channel" value={account.provenance} />}
                    <Row label="Synced" value={formatDate(account.updated_at)} />
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="flex flex-col gap-[16px] items-start w-full" data-testid="account-recent-activity">
                  <SectionLabel>Recent Activity</SectionLabel>
                  {activity.length > 0 ? (
                    <div className="flex flex-col gap-[6px] w-full">
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
                            className="flex gap-[12px] items-center p-[10px] rounded-[8px] bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#151926] hover:border-[#1d2132] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] w-full"
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
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px] w-full">
                      No recent activity on this account yet.
                    </p>
                  )}
                </div>

                {/* Info banner */}
                <div className="border border-[#1d2132] border-solid rounded-[12px] w-full">
                  <div className="flex items-start gap-[8px] p-[8px] w-full">
                    <Info size={16} className="text-[#6c779d] shrink-0 mt-[2px]" />
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[14px] flex-1 min-w-px">
                      A read-only view. Brain reads this balance from your ledger; your bank owns the account.
                    </p>
                  </div>
                </div>
              </div>

              {/* Previous / Next */}
              <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-t border-[#1d2132] border-solid flex flex-col items-start p-[24px] relative shrink-0 w-full">
                <div className="flex gap-[16px] items-center w-full">
                  <button
                    type="button"
                    disabled={!prevAccount}
                    data-testid="button-account-previous"
                    onClick={() => prevAccount && onSelectAccount?.(prevAccount.id)}
                    className="bg-[#222737] flex flex-1 gap-[8px] items-center justify-center px-[20px] py-[8px] rounded-[100px] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                  >
                    <ChevronLeft size={16} className="text-[#6c779d]" />
                    <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">
                      Previous
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={!nextAccount}
                    data-testid="button-account-next"
                    onClick={() => nextAccount && onSelectAccount?.(nextAccount.id)}
                    className="bg-[#222737] flex flex-1 gap-[8px] items-center justify-center px-[20px] py-[8px] rounded-[100px] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                  >
                    <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">
                      Next
                    </span>
                    <ChevronRight size={16} className="text-[#6c779d]" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-[24px] items-start p-[24px] w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px]">
                This account isn't in your current ledger.
              </p>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
