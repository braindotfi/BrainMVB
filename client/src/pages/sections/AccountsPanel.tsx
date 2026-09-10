import { useMemo, useState } from "react";
import collapseBtnIcon from "@assets/Collapse_1781818197054.png";
import expandBtnIcon from "@assets/Expand_Button_1781817819809.png";
import addIcon from "@assets/add_1789001100272.png";
import bankCardIcon from "@assets/BankCard_1789001100273.png";
import exchangeIcon from "@assets/exchange_1789001100274.png";
import assetsActiveIcon from "@assets/Icon=Assets,_State=Active_1789001100274.png";
import assetsNormalIcon from "@assets/Icon=Assets,_State=Normal_1789001100274.png";
import transactionsActiveIcon from "@assets/Icon=Transactions,_State=Active_1789001100274.png";
import transactionsNormalIcon from "@assets/Icon=Transactions,_State=Normal_1789001100274.png";
import sendIcon from "@assets/send_1789001100274.png";
import binanceIcon from "@assets/binance_1789001191831.png";
import polygonIcon from "@assets/polygon_1789001191833.png";
import dollarIcon from "@assets/dollar_1789001191833.png";
import ethereumIcon from "@assets/ethereum_1789001191833.png";
import completeIcon from "@assets/Icons_1789001270032.png";
import walletIcon from "@assets/Wallet_Icons_1789001270033.png";
import dropdownActiveIcon from "@assets/Dropdown_Active_1789001286488.png";
import dropdownInactiveIcon from "@assets/Dropdown_Inactive_1789001286488.png";
import accountCardGlow from "@assets/account-card-glow.svg";
import accountCardCopyIcon from "@assets/account-card-copy.svg";
import { ACCOUNT_KIND_LABEL, type BrainAccountDTO } from "@/lib/brainAccounts";
import { usePagedLedgerRead } from "@/lib/ledgerRead";

interface AccountsPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

type PanelTab = "assets" | "transactions";
type AssetFilter = "all" | "cash" | "crypto";

interface BrainTransactionDTO {
  id: string;
  amount: string;
  currency: string;
  direction: "inflow" | "outflow" | "transfer" | "adjustment";
  transaction_date: string;
  description_normalized?: string | null;
  description_raw?: string | null;
  account_id?: string | null;
}

const actionItems = [
  { label: "Add", image: addIcon, title: "Adding accounts is not available here yet" },
  { label: "Send", image: sendIcon, title: "Sending is not available here yet" },
  { label: "Exchange", image: exchangeIcon, title: "Exchange is not available here yet" },
];

const iconForAccount = (account: BrainAccountDTO) => {
  if (account.account_type === "onchain") {
    const currency = account.currency.toUpperCase();
    if (currency === "ETH") return ethereumIcon;
    if (currency === "MATIC" || currency === "POL") return polygonIcon;
    if (currency === "BNB") return binanceIcon;
  }
  return account.currency.toUpperCase() === "USD" ? dollarIcon : bankCardIcon;
};

const ASSET_NAME: Record<string, string> = {
  ETH: "Ethereum",
  USD: "Dollar",
  MATIC: "Polygon",
  POL: "Polygon",
  BNB: "Binance",
};

const TRANSACTION_DIRECTION_LABEL: Record<BrainTransactionDTO["direction"], string> = {
  inflow: "Incoming",
  outflow: "Outgoing",
  transfer: "Transfer",
  adjustment: "Adjustment",
};

function compactNumber(value: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return number.toLocaleString("en-US", {
    maximumFractionDigits: 8,
  });
}

function formatUsd(value: string | number, fixedDecimals: boolean): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fixedDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(number);
}

function shortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function signedTransactionAmount(transaction: BrainTransactionDTO): number | string {
  const amount = Number(transaction.amount);
  if (Number.isFinite(amount)) {
    if (transaction.direction === "outflow") return -Math.abs(amount);
    if (transaction.direction === "inflow") return Math.abs(amount);
    return amount;
  }
  const unsigned = transaction.amount.replace(/^-/, "");
  return transaction.direction === "outflow" ? `-${unsigned}` : transaction.amount;
}

function AccountPanelSkeleton() {
  return (
    <div className="space-y-4 px-1" data-testid="accounts-panel-loading">
      {[1, 2, 3].map((item) => (
        <div key={item} className="flex items-center gap-2 animate-pulse">
          <div className="size-10 rounded-full bg-brain-v1baby-blue-15" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 rounded bg-brain-v1baby-blue-15" />
            <div className="h-3 w-14 rounded bg-brain-v1baby-blue-15" />
          </div>
          <div className="h-4 w-16 rounded bg-brain-v1baby-blue-15" />
        </div>
      ))}
    </div>
  );
}

export function AccountsPanel({ collapsed, onToggle }: AccountsPanelProps) {
  const [tab, setTab] = useState<PanelTab>("assets");
  const [filter, setFilter] = useState<AssetFilter>("all");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const accountsRead = usePagedLedgerRead<BrainAccountDTO>("/api/brain/ledger/accounts", "accounts");
  const transactionsRead = usePagedLedgerRead<BrainTransactionDTO>("/api/brain/ledger/transactions", "transactions");

  const accounts = accountsRead.read?.rows ?? [];
  const isLoading = !accountsRead.read && !accountsRead.failed;
  const isError = accountsRead.failed;
  const isIncomplete = accountsRead.read?.complete === false;
  const transactions = transactionsRead.read?.rows ?? [];
  const transactionsLoading = !transactionsRead.read && !transactionsRead.failed;
  const transactionsIncomplete = transactionsRead.read?.complete === false;
  const selected = accounts.find((account) => account.id === selectedAccountId) ?? accounts[0];
  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const filteredAccounts = useMemo(
    () => accounts.filter((account) => {
      if (filter === "cash") return account.account_type !== "onchain";
      if (filter === "crypto") return account.account_type === "onchain";
      return true;
    }),
    [accounts, filter],
  );

  const copyAccountIdentifier = async () => {
    if (!selected?.external_account_id) return;
    try {
      await navigator.clipboard.writeText(selected.external_account_id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  if (collapsed) {
    return (
      <div className="relative h-full w-[54px] flex-shrink-0 overflow-hidden rounded-panel border border-solid border-brain-v1stroke-2 bg-brain-v1baby-blue-5">
        <div className="absolute left-[7px] top-[7px] flex w-[40px] flex-col items-start gap-4">
          <button data-testid="button-accounts-expand" onClick={onToggle} className="size-10" title="Expand accounts">
            <img src={expandBtnIcon} alt="Expand" className="block size-10" />
          </button>
          <div className="h-px w-full bg-brain-v1stroke-2" />
        </div>
      </div>
    );
  }

  return (
    <div
      data-node-id="6519:54025"
      className="relative flex h-full w-full max-w-[390px] flex-shrink-0 flex-col overflow-hidden rounded-panel border border-solid border-brain-v1stroke-2 bg-brain-v1baby-blue-5"
    >
      <button
        data-testid="button-accounts-collapse"
        onClick={onToggle}
        className="absolute left-[7px] top-[7px] z-20 size-10"
        title="Collapse accounts"
      >
        <img src={collapseBtnIcon} alt="Collapse" className="block size-10" />
      </button>

      <div className="absolute inset-x-[7px] bottom-[7px] top-[55px] overflow-y-auto">
        <div className="relative flex min-h-[754px] flex-col items-center gap-[24px]">
          <div className="relative h-[290px] w-full max-w-[370px] shrink-0">
            <div className="absolute top-[152px] h-[138px] w-full rounded-panel bg-brain-v1headerfooterbg">
              <div className="absolute left-4 right-4 top-16 flex items-center gap-2">
                {actionItems.map((action) => (
                  <div key={action.label} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1" title={action.title}>
                    <button disabled aria-label={action.title} className="size-10 cursor-not-allowed">
                      <img src={action.image} alt="" className="block size-10" />
                    </button>
                    <span className="font-['Gilroy',sans-serif] text-xs font-semibold leading-[14px] text-brain-v1baby-blue-60">{action.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="relative h-[200px] overflow-hidden rounded-panel bg-brain-v1dark-orange shadow-[0px_122px_34px_rgba(0,0,0,0.01),0px_78px_31px_rgba(0,0,0,0.04),0px_44px_26px_rgba(0,0,0,0.15),0px_20px_20px_rgba(0,0,0,0.26),0px_5px_11px_rgba(0,0,0,0.29)]"
            >
              <div className="absolute left-[57.01px] top-[-242.2px] flex h-[506.984px] w-[470.86px] items-center justify-center" aria-hidden="true">
                <div className="flex-none rotate-[-52.17deg]">
                  <div className="relative h-[246.071px] w-[450.814px]">
                    <img src={accountCardGlow} alt="" className="absolute inset-[-30.07%_-16.41%] block size-auto max-w-none" />
                  </div>
                </div>
              </div>
              <div
                data-testid="account-card-linear-stroke"
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-10 rounded-panel p-[1.4px]"
                style={{
                  background: "linear-gradient(135deg, rgba(255, 149, 0, 0.35) 0%, rgba(255, 149, 0, 0.82) 52%, rgba(255, 149, 0, 0.4) 100%)",
                  WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                  WebkitMaskComposite: "xor",
                  maskComposite: "exclude",
                }}
              />
              <div className="absolute left-[14.6px] top-[14.6px] flex w-[338px] items-center gap-4">
                <img src={bankCardIcon} alt="" className="size-12 shrink-0" />
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <p className="truncate font-['Gilroy',sans-serif] text-[32px] font-medium leading-8 text-white">
                    {selected?.current_balance != null
                      ? selected.currency.toUpperCase() === "USD"
                        ? formatUsd(selected.current_balance, true)
                        : selected.current_balance
                      : "—"}
                  </p>
                  {selected?.currency && <span className="rounded-pill bg-brain-v1white-30 px-1.5 py-0.5 font-['Gilroy',sans-serif] text-xs font-semibold leading-3 text-white">{selected.currency.toUpperCase()}</span>}
                </div>
              </div>
              <div className="absolute left-[14.6px] top-[78.6px] w-[338px]">
                <p className="font-['JetBrains_Mono',monospace] text-xs font-bold leading-3 text-brain-v1light-orange">
                  {selected?.account_type === "onchain" ? "Crypto Wallet Address" : "Account Identifier"}
                </p>
                <div className="mt-1 flex min-w-0 items-center gap-2">
                  <p className="min-w-0 truncate font-['JetBrains_Mono',monospace] text-[20px] font-medium leading-6 text-white">
                    {selected?.external_account_id ?? "—"}
                  </p>
                  {selected?.external_account_id && (
                    <button
                      type="button"
                      onClick={copyAccountIdentifier}
                      aria-label={copied ? "Account identifier copied" : "Copy account identifier"}
                      title={copied ? "Copied" : "Copy account identifier"}
                      className="size-6 shrink-0 rounded-[4px] text-white hover:bg-white/10"
                    >
                      <img src={accountCardCopyIcon} alt="" className="block size-6" />
                    </button>
                  )}
                </div>
              </div>
              <div className="absolute left-[14.6px] top-[134.6px] w-[338px]">
                <p className="font-['JetBrains_Mono',monospace] text-xs font-bold leading-3 text-brain-v1light-orange">Name</p>
                <p className="mt-1 truncate font-['JetBrains_Mono',monospace] text-sm font-medium leading-4 text-white">
                  {selected?.name ?? "No connected account"}
                </p>
              </div>
              <div className="absolute left-1/2 top-[180.6px] flex -translate-x-1/2 items-center gap-1" aria-hidden="true">
                <span className="size-[6px] rounded-full bg-brain-v1light-orange" />
                <span className="size-[6px] rounded-full bg-white" />
                <span className="size-[6px] rounded-full bg-brain-v1light-orange opacity-50" />
              </div>
            </div>
          </div>

          <div className="flex w-full max-w-[370px] flex-col gap-4">
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-4" role="tablist" aria-label="Account activity">
                  <button role="tab" aria-selected={tab === "assets"} onClick={() => setTab("assets")} className={`flex items-center gap-1 font-['Gilroy',sans-serif] text-base leading-6 ${tab === "assets" ? "text-white" : "text-brain-v1baby-blue-60"}`}>
                  <img src={tab === "assets" ? assetsActiveIcon : assetsNormalIcon} alt="" className="size-6" /> Assets
                </button>
                  <button role="tab" aria-selected={tab === "transactions"} onClick={() => setTab("transactions")} className={`flex items-center gap-1 font-['Gilroy',sans-serif] text-base leading-6 ${tab === "transactions" ? "text-white" : "text-brain-v1baby-blue-60"}`}>
                  <img src={tab === "transactions" ? transactionsActiveIcon : transactionsNormalIcon} alt="" className="size-6" /> Transactions
                </button>
              </div>
              {tab === "assets" && (
                <div className="flex w-full gap-0.5 rounded-pill bg-brain-v1headerfooterbg p-0.5">
                   {(["all", "cash", "crypto"] as AssetFilter[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={filter === item}
                      onClick={() => setFilter(item)}
                      className={`flex-1 rounded-pill px-4 py-2 font-['Gilroy',sans-serif] text-sm font-semibold capitalize leading-4 ${
                        filter === item ? "bg-brain-v1dark-orange text-brain-v1light-orange" : ""
                      }`}
                      style={filter === item ? undefined : { color: "var(--brain-v1baby-blue-30)" }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {tab === "transactions" ? transactionsLoading ? (
              <AccountPanelSkeleton />
            ) : transactionsRead.failed ? (
              <div data-testid="accounts-panel-transactions-error" className="rounded-row bg-brain-v1highlight-dropdown-bg px-4 py-4 text-sm leading-5 text-brain-v1error-text">
                Couldn't load live transactions. Try again later.
              </div>
            ) : transactions.length === 0 ? (
              <div data-testid="accounts-panel-transactions-empty" className="rounded-row bg-brain-v1highlight-dropdown-bg px-4 py-5 text-center">
                <p className="font-['Gilroy',sans-serif] text-sm font-semibold leading-5 text-brain-v1baby-blue-100">No transactions yet</p>
                <p className="mt-1 font-['Gilroy',sans-serif] text-xs leading-4 text-brain-v1baby-blue-60">Live account activity will appear here.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {transactionsIncomplete && (
                  <p className="rounded-row bg-brain-v1highlight-dropdown-bg px-4 py-3 font-['Gilroy',sans-serif] text-xs leading-4 text-brain-v1baby-blue-60">
                    Some transactions couldn't be loaded. The list below may be incomplete.
                  </p>
                )}
                {transactions.map((transaction, index) => {
                  const account = transaction.account_id ? accountById.get(transaction.account_id) : undefined;
                  const currency = transaction.currency.toUpperCase();
                  const signedAmount = signedTransactionAmount(transaction);
                  return (
                    <div key={transaction.id} className="flex flex-col gap-4">
                      <div className="flex items-center gap-2">
                        <img src={account ? iconForAccount(account) : currency === "USD" ? dollarIcon : bankCardIcon} alt="" className="size-10 shrink-0" />
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <div className="flex min-w-0 shrink flex-col gap-1">
                            <p className="truncate font-['Gilroy',sans-serif] text-base font-medium leading-5 text-brain-v1baby-blue-100">
                              {transaction.description_normalized ?? transaction.description_raw ?? TRANSACTION_DIRECTION_LABEL[transaction.direction]}
                            </p>
                            <p className="truncate font-['Gilroy',sans-serif] text-sm font-semibold leading-4" style={{ color: "var(--brain-v1baby-blue-30)" }}>
                              {TRANSACTION_DIRECTION_LABEL[transaction.direction]}
                            </p>
                          </div>
                          <div className="min-w-0 flex-1 text-right font-['JetBrains_Mono',monospace] font-medium">
                            <p className={`truncate text-base leading-5 ${transaction.direction === "outflow" ? "text-brain-v1error-text" : "text-brain-v1asset-green"}`}>
                              {currency === "USD" ? formatUsd(signedAmount, false) : `${compactNumber(String(signedAmount))} ${currency}`}
                            </p>
                            <p className="truncate text-sm leading-4" style={{ color: "var(--brain-v1baby-blue-30)" }}>
                              {shortDate(transaction.transaction_date)}
                            </p>
                          </div>
                        </div>
                      </div>
                      {index < transactions.length - 1 && <div className="h-px w-full bg-brain-v1stroke-2" />}
                    </div>
                  );
                })}
              </div>
            ) : isLoading ? <AccountPanelSkeleton /> : isError ? (
              <div data-testid="accounts-panel-error" className="rounded-row bg-brain-v1highlight-dropdown-bg px-4 py-4 text-sm leading-5 text-brain-v1error-text">Couldn't load live account activity. Try again later.</div>
            ) : filteredAccounts.length === 0 ? (
              <div data-testid="accounts-panel-empty" className="rounded-row bg-brain-v1highlight-dropdown-bg px-4 py-5 text-center">
                <p className="font-['Gilroy',sans-serif] text-sm font-semibold leading-5 text-brain-v1baby-blue-100">No assets connected yet</p>
                <p className="mt-1 font-['Gilroy',sans-serif] text-xs leading-4 text-brain-v1baby-blue-60">Live balances will appear here once an account is connected.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {isIncomplete && (
                  <p className="rounded-row bg-brain-v1highlight-dropdown-bg px-4 py-3 font-['Gilroy',sans-serif] text-xs leading-4 text-brain-v1baby-blue-60">
                    Some accounts couldn't be loaded. The list below may be incomplete.
                  </p>
                )}
                {filteredAccounts.map((account, index) => (
                  <div key={account.id} className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                      <img src={iconForAccount(account)} alt="" className="size-10 shrink-0" />
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <div className="flex min-w-0 shrink flex-col gap-1">
                          <p className="truncate font-['Gilroy',sans-serif] text-base font-medium leading-5 text-brain-v1baby-blue-100">
                            {ASSET_NAME[account.currency.toUpperCase()] ?? account.name}
                          </p>
                          <p className="font-['Gilroy',sans-serif] text-sm font-semibold leading-4" style={{ color: "var(--brain-v1baby-blue-30)" }}>
                            {account.currency.toUpperCase()}
                          </p>
                        </div>
                        <div className="min-w-0 flex-1 text-right font-['JetBrains_Mono',monospace] font-medium">
                          <p className="truncate text-base leading-5 text-brain-v1asset-green">
                            {account.current_balance != null
                              ? account.currency.toUpperCase() === "USD"
                                ? formatUsd(account.current_balance, false)
                                : `${compactNumber(account.current_balance)} ${account.currency.toUpperCase()}`
                              : "Balance unavailable"}
                          </p>
                          <p className="truncate text-sm leading-4" style={{ color: "var(--brain-v1baby-blue-30)" }}>
                            {account.current_balance != null
                              ? compactNumber(account.available_balance ?? account.current_balance)
                              : account.institution ?? ACCOUNT_KIND_LABEL[account.account_type]}
                          </p>
                        </div>
                      </div>
                    </div>
                    {index < filteredAccounts.length - 1 && <div className="h-px w-full bg-brain-v1stroke-2" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="absolute left-[55px] top-[7px] z-20 w-[322px]"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setAccountMenuOpen(false);
            event.currentTarget.querySelector<HTMLButtonElement>("[data-testid='button-account-selector']")?.focus();
          }
        }}
      >
        <button
          type="button"
          data-testid="button-account-selector"
          aria-expanded={accountMenuOpen}
          onClick={() => setAccountMenuOpen((open) => !open)}
          className="flex h-10 w-full items-center gap-2 rounded-[40px] bg-brain-v1baby-blue-15 p-1"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <img src={walletIcon} alt="" className="size-8" />
            <span className="truncate normal-case font-['Gilroy',sans-serif] text-base font-medium leading-5 text-brain-v1baby-blue-100">Your Account</span>
          </div>
          {selected && <img src={completeIcon} alt="Connected" className="size-5 shrink-0" />}
          <img src={accountMenuOpen ? dropdownActiveIcon : dropdownInactiveIcon} alt="" className="size-8 shrink-0" />
        </button>
        {accountMenuOpen && (
          <div role="menu" aria-label="Choose account" className="mt-1 max-h-[280px] overflow-y-auto rounded-row border border-solid border-brain-v1stroke-2 bg-brain-v1highlight-dropdown-bg p-2 shadow-lg">
            {accounts.length === 0 ? (
              <p className="px-2 py-1 font-['Gilroy',sans-serif] text-sm leading-5 text-brain-v1baby-blue-60">No connected accounts</p>
            ) : accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                role="menuitemradio"
                aria-checked={account.id === selected?.id}
                onClick={() => {
                  setSelectedAccountId(account.id);
                  setAccountMenuOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-[8px] p-2 text-left hover:bg-brain-v1baby-blue-15 ${
                  account.id === selected?.id ? "bg-brain-v1baby-blue-15" : ""
                }`}
              >
                <img src={iconForAccount(account)} alt="" className="size-8 shrink-0" />
                <span className="min-w-0 flex-1 truncate normal-case font-['Gilroy',sans-serif] text-sm font-medium leading-5 text-brain-v1baby-blue-100">{account.name}</span>
                <span className="font-['JetBrains_Mono',monospace] text-xs text-brain-v1baby-blue-60">{account.currency.toUpperCase()}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AccountsPanel;