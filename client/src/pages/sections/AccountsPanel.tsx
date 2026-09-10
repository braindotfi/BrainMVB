import { useMemo, useState } from "react";
import { Copy } from "lucide-react";
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
import { ACCOUNT_KIND_LABEL, type BrainAccountDTO } from "@/lib/brainAccounts";
import { usePagedLedgerRead } from "@/lib/ledgerRead";
import { useCurrency } from "@/lib/useCurrency";

interface AccountsPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

type PanelTab = "assets" | "transactions";
type AssetFilter = "all" | "cash" | "crypto";

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
  const { format } = useCurrency();
  const [tab, setTab] = useState<PanelTab>("assets");
  const [filter, setFilter] = useState<AssetFilter>("all");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const accountsRead = usePagedLedgerRead<BrainAccountDTO>("/api/brain/ledger/accounts", "accounts");

  const accounts = accountsRead.read?.rows ?? [];
  const isLoading = !accountsRead.read && !accountsRead.failed;
  const isError = accountsRead.failed;
  const isIncomplete = accountsRead.read?.complete === false;
  const selected = accounts.find((account) => account.id === selectedAccountId) ?? accounts[0];
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
                    <button disabled aria-label={action.title} className="size-10 cursor-not-allowed opacity-55">
                      <img src={action.image} alt="" className="block size-10" />
                    </button>
                    <span className="font-['Gilroy',sans-serif] text-xs font-semibold leading-[14px] text-brain-v1baby-blue-60">{action.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="relative h-[200px] overflow-hidden rounded-panel border-[1.4px] border-solid border-[rgba(255,149,0,0.7)] bg-brain-v1dark-orange shadow-[0px_122px_34px_rgba(0,0,0,0.01),0px_78px_31px_rgba(0,0,0,0.04),0px_44px_26px_rgba(0,0,0,0.15),0px_20px_20px_rgba(0,0,0,0.26),0px_5px_11px_rgba(0,0,0,0.29)]"
              style={{ background: "radial-gradient(circle at 78% 26%, #c96b00 0%, #8a4500 36%, #4a2300 76%)" }}
            >
              <div className="absolute left-[15px] right-[15px] top-[15px] flex items-center gap-4">
                <img src={bankCardIcon} alt="" className="size-12 shrink-0" />
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <p className="truncate font-['Gilroy',sans-serif] text-[32px] font-medium leading-8 text-white">
                    {selected?.current_balance != null
                      ? selected.currency.toUpperCase() === "USD"
                        ? format(Number(selected.current_balance))
                        : selected.current_balance
                      : "—"}
                  </p>
                  {selected?.currency && <span className="rounded-pill bg-brain-v1white-30 px-1.5 py-0.5 font-['Gilroy',sans-serif] text-xs font-semibold leading-3 text-white">{selected.currency.toUpperCase()}</span>}
                </div>
              </div>
              <div className="absolute left-[15px] right-[15px] top-[79px]">
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
                      <Copy className="mx-auto size-5" strokeWidth={2} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
              <div className="absolute left-[15px] right-[15px] top-[135px]">
                <p className="font-['JetBrains_Mono',monospace] text-xs font-bold leading-3 text-brain-v1light-orange">Name</p>
                <p className="mt-1 truncate font-['JetBrains_Mono',monospace] text-sm font-medium leading-4 text-white">
                  {selected?.name ?? "No connected account"}
                </p>
              </div>
              <div className="absolute bottom-[8px] left-1/2 flex -translate-x-1/2 items-center gap-1" aria-hidden="true">
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
                    <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)} className={`flex-1 rounded-pill px-4 py-2 font-['Gilroy',sans-serif] text-sm font-semibold capitalize leading-4 ${filter === item ? "bg-brain-v1dark-orange text-brain-v1light-orange" : "text-brain-v1baby-blue-60"}`}>{item}</button>
                  ))}
                </div>
              )}
            </div>

            {tab === "transactions" ? (
              <div data-testid="accounts-panel-transactions-empty" className="rounded-row bg-brain-v1highlight-dropdown-bg px-4 py-5 text-center">
                <img src={transactionsNormalIcon} alt="" className="mx-auto mb-2 size-6 opacity-70" />
                <p className="font-['Gilroy',sans-serif] text-sm font-semibold leading-5 text-brain-v1baby-blue-100">Transactions aren't available here yet</p>
                <p className="mt-1 font-['Gilroy',sans-serif] text-xs leading-4 text-brain-v1baby-blue-60">Open Ledger to view your live transaction history.</p>
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
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-['Gilroy',sans-serif] text-base font-medium leading-5 text-brain-v1baby-blue-100">{account.name}</p>
                          <p className="font-['Gilroy',sans-serif] text-sm font-semibold leading-4 text-brain-v1baby-blue-60">{account.currency.toUpperCase()}</p>
                        </div>
                        <div className="text-right font-['JetBrains_Mono',monospace]">
                          <p className="text-base leading-5 text-brain-v1green/50">{account.current_balance != null ? (account.currency.toUpperCase() === "USD" ? format(Number(account.current_balance)) : `${account.current_balance} ${account.currency.toUpperCase()}`) : "Balance unavailable"}</p>
                          <p className="text-sm leading-4 text-brain-v1baby-blue-60">{account.institution ?? ACCOUNT_KIND_LABEL[account.account_type]}</p>
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