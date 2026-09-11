import { useMemo, useState } from "react";
import collapseBtnIcon from "@assets/Collapse_1781818197054.png";
import expandBtnIcon from "@assets/Expand_Button_1781817819809.png";
import assetsActiveIcon from "@assets/Icon=Assets,_State=Active_1789001100274.png";
import assetsNormalIcon from "@assets/Icon=Assets,_State=Normal_1789001100274.png";
import transactionsActiveIcon from "@assets/Icon=Transactions,_State=Active_1789001100274.png";
import transactionsNormalIcon from "@assets/Icon=Transactions,_State=Normal_1789001100274.png";
import binanceIcon from "@assets/binance_1789001191831.png";
import polygonIcon from "@assets/polygon_1789001191833.png";
import dollarIcon from "@assets/dollar_1789001191833.png";
import ethereumIcon from "@assets/ethereum_1789001191833.png";
import completeIcon from "@assets/Icons_1789001270032.png";
import walletIcon from "@assets/Wallet_Icons_1789001270033.png";
import dropdownActiveIcon from "@assets/Dropdown_Active_1789001286488.png";
import dropdownInactiveIcon from "@assets/Dropdown_Inactive_1789001286488.png";
import accountCardGlow from "@assets/account-card-glow.svg";
import accountCardGlowGreen from "@assets/account-card-glow-green.svg";
import accountCardCopyIcon from "@assets/account-card-copy.svg";
import transactionOutIcon from "@assets/tx-arrow-out.svg";
import transactionInIcon from "@assets/tx-arrow-in.svg";
import transactionDotIcon from "@assets/tx-dot.svg";
import walletBankIcon from "@assets/wallet-icon-bank-32.svg";
import walletAgentIcon from "@assets/wallet-icon-agent-32.svg";
import walletAgentLargeIcon from "@assets/wallet-icon-agent-48.svg";
import addAgentIcon from "@assets/dropdown-add-agent.svg";
import sidebarWalletBankIcon from "@assets/sidebar-wallet-bank-40.svg";
import sidebarWalletBankActiveIcon from "@assets/sidebar-wallet-bank-40-active.svg";
import sidebarWalletAgentIcon from "@assets/sidebar-wallet-agent-40.svg";
import sidebarWalletAgentActiveIcon from "@assets/sidebar-wallet-agent-40-active.svg";
import sidebarTabAssetsIcon from "@assets/sidebar-tab-assets.svg";
import sidebarTabTransactionsIcon from "@assets/sidebar-tab-transactions.svg";
import { isAgentAccount, type BrainAccountDTO } from "@/lib/brainAccounts";
import { usePagedLedgerRead } from "@/lib/ledgerRead";
import {
  isTransactionAttributed,
  transactionBelongsToAccount,
  type TransactionFilter,
} from "@/lib/accountsPanelFormat";
import {
  AccountCardWithActions,
  AccountSelector,
  AssetFilterTabs,
  AssetsList,
  TransactionFilterTabs,
  TransactionNotices,
  TransactionsList,
  type AssetFilter,
  type BrainTransactionDTO,
} from "./accountsPanelParts";
import {
  AccountRailPopup,
  AssetsRailPopup,
  TransactionsRailPopup,
  type RailPopupAccounts,
} from "@/components/AccountsRailPopups";

interface AccountsPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

type PanelTab = "assets" | "transactions";
type RailPopupKind = "account" | "assets" | "transactions";

/**
 * The rail's two tab icons. Their lit artwork is the same pair the open panel
 * already uses for its selected tab (Figma "Icon=Assets, State=Active" and
 * "Icon=Transactions, State=Active"), so hovering the rail previews exactly
 * the icon the panel would show, rather than a second, invented highlight.
 */
const collapsedTabItems: Array<{ tab: PanelTab; label: string; icon: string; activeIcon: string }> = [
  { tab: "assets", label: "Assets", icon: sidebarTabAssetsIcon, activeIcon: assetsActiveIcon },
  { tab: "transactions", label: "Transactions", icon: sidebarTabTransactionsIcon, activeIcon: transactionsActiveIcon },
];

/**
 * Both artworks are always in the DOM and swapped with CSS, so the hover state
 * cannot flash a missing image the first time a pointer reaches the icon.
 */
function RailIcon({ normal, active }: { normal: string; active: string }) {
  return (
    <>
      <img src={normal} alt="" className="block size-10 group-hover:hidden group-focus-visible:hidden" />
      <img src={active} alt="" className="hidden size-10 group-hover:block group-focus-visible:block" />
    </>
  );
}

/** The same swap at the 24px size the two tab glyphs are drawn at. */
function RailTabIcon({ normal, active }: { normal: string; active: string }) {
  return (
    <>
      <img src={normal} alt="" className="block size-6 group-hover:hidden group-focus-visible:hidden" />
      <img src={active} alt="" className="hidden size-6 group-hover:block group-focus-visible:block" />
    </>
  );
}

export function AccountsPanel({ collapsed, onToggle }: AccountsPanelProps) {
  const [tab, setTab] = useState<PanelTab>("assets");
  const [filter, setFilter] = useState<AssetFilter>("all");
  const [transactionFilter, setTransactionFilter] = useState<TransactionFilter>("all");
  const [tradeFilterNotice, setTradeFilterNotice] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  // Which rail popup is open, if any, and the button that opened it. Only
  // one can be open, so this is a single value rather than three booleans
  // that could disagree — and the anchor travels with it, so the popup is
  // always placed against the control the reader actually pressed.
  const [railPopup, setRailPopup] = useState<{ kind: RailPopupKind; anchor: HTMLElement } | null>(null);
  const accountsRead = usePagedLedgerRead<BrainAccountDTO>("/api/brain/ledger/accounts", "accounts");
  const transactionsRead = usePagedLedgerRead<BrainTransactionDTO>("/api/brain/ledger/transactions", "transactions");

  const accounts = accountsRead.read?.rows ?? [];
  const isLoading = !accountsRead.read && !accountsRead.failed;
  const isError = accountsRead.failed;
  const isIncomplete = accountsRead.read?.complete === false;
  const transactions = transactionsRead.read?.rows ?? [];
  const transactionsLoading = !transactionsRead.read && !transactionsRead.failed;
  const transactionsIncomplete = transactionsRead.read?.complete === false;
  const selectedIndex = Math.max(
    0,
    accounts.findIndex((account) => account.id === selectedAccountId),
  );
  const selected = accounts[selectedIndex];
  const agentSelected = selected ? isAgentAccount(selected) : false;
  // The card names one account, so the list below it has to be that account's
  // activity. A transaction with no `account_id` cannot be placed under any
  // account, so it is left out and counted rather than silently dropped.
  const selectedAccountKey = selected?.id;
  const accountTransactions = useMemo(
    () =>
      selectedAccountKey
        ? transactions.filter((transaction) =>
            transactionBelongsToAccount(transaction.account_id, selectedAccountKey),
          )
        : [],
    [transactions, selectedAccountKey],
  );
  const unattributedTransactionCount = useMemo(
    () => transactions.filter((transaction) => !isTransactionAttributed(transaction.account_id)).length,
    [transactions],
  );
  /** What the three rail popups need to know about the accounts read. */
  const railPopupAccounts: RailPopupAccounts = {
    accounts,
    selectedIndex,
    selected,
    onSelectAccount: setSelectedAccountId,
    isLoading,
    isError,
    isIncomplete,
  };

  /**
   * The rail's popups. Mounted in the collapsed branch only: the expanded
   * panel already shows all three surfaces inline, so opening a modal over it
   * would be a second copy of what is on screen.
   */
  const railPopups = (
    <>
      <AccountRailPopup
        open={railPopup?.kind === "account"}
        onOpenChange={(next) => (next ? undefined : setRailPopup(null))}
        anchor={railPopup?.anchor ?? null}
        accountsRead={railPopupAccounts}
      />
      <AssetsRailPopup
        open={railPopup?.kind === "assets"}
        onOpenChange={(next) => (next ? undefined : setRailPopup(null))}
        anchor={railPopup?.anchor ?? null}
        accountsRead={railPopupAccounts}
        filter={filter}
        onFilterChange={setFilter}
      />
      <TransactionsRailPopup
        open={railPopup?.kind === "transactions"}
        onOpenChange={(next) => (next ? undefined : setRailPopup(null))}
        anchor={railPopup?.anchor ?? null}
        accountsRead={railPopupAccounts}
        transactions={accountTransactions}
        transactionsLoading={transactionsLoading}
        transactionsFailed={transactionsRead.failed}
        transactionsIncomplete={transactionsIncomplete}
        unattributedTransactionCount={unattributedTransactionCount}
        filter={transactionFilter}
        onFilterChange={(next) => {
          setTradeFilterNotice(false);
          setTransactionFilter(next);
        }}
        tradeFilterNotice={tradeFilterNotice}
        onTradesUnavailable={() => setTradeFilterNotice(true)}
      />
    </>
  );

  if (collapsed) {
    // The rail names the account the open panel would show, so an account the
    // read has not produced yet must not be drawn as though it had.
    const railArtwork = agentSelected ? "agent" : "bank";
    // A read that finished and returned nothing is not a read still running, so
    // the four states the open panel distinguishes are all named here too.
    const walletTitle = selected
      ? `${selected.name} — open account details`
      : isError
        ? "Couldn't load accounts"
        : isLoading
          ? "Accounts are still loading"
          : "No connected accounts";
    return (
      <div
        data-node-id={agentSelected ? "3759:54130" : "3759:50795"}
        data-rail-frame=""
        className="relative h-full w-[54px] flex-shrink-0 overflow-y-auto overflow-x-hidden rounded-panel border border-solid border-brain-v1stroke-2 bg-brain-v1baby-blue-5 p-[7px]"
      >
        <div className="flex w-[40px] flex-col items-start gap-4">
          <button data-testid="button-accounts-expand" onClick={onToggle} className="size-10" title="Expand accounts">
            <img src={expandBtnIcon} alt="Expand" className="block size-10" />
          </button>
          <div className="h-px w-full bg-brain-v1stroke-2" />

          <div className="flex flex-col gap-1">
            <div className="flex w-10 items-center justify-center px-2">
              {/* Figma draws this label in baby-blue-30, which is a 2.2:1
                  contrast failure the design-token suite forbids for text.
                  Baby-blue-60 is the sanctioned substitute. */}
              <span className="font-['Gilroy',sans-serif] text-xs font-semibold leading-4 text-brain-v1baby-blue-60">
                Wallet
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {/* aria-disabled rather than disabled: a natively disabled
                  button is unreachable by keyboard, which would put the only
                  explanation of why the avatar does nothing — no account came
                  back — behind a mouse hover. */}
              <button
                type="button"
                data-testid="button-collapsed-wallet"
                onClick={
                  selected
                    ? (event) => setRailPopup({ kind: "account", anchor: event.currentTarget })
                    : undefined
                }
                aria-disabled={!selected}
                title={walletTitle}
                aria-label={walletTitle}
                className={`group block size-10 rounded-full ${selected ? "" : "cursor-not-allowed"}`}
              >
                <RailIcon
                  normal={railArtwork === "agent" ? sidebarWalletAgentIcon : sidebarWalletBankIcon}
                  active={railArtwork === "agent" ? sidebarWalletAgentActiveIcon : sidebarWalletBankActiveIcon}
                />
              </button>
            </div>
          </div>

          <div className="h-px w-full bg-brain-v1stroke-2" />

          <div className="flex w-full flex-col gap-1">
            {collapsedTabItems.map((item) => (
              <button
                key={item.tab}
                type="button"
                data-testid={`button-collapsed-tab-${item.tab}`}
                onClick={(event) => {
                  setTab(item.tab);
                  setRailPopup({ kind: item.tab, anchor: event.currentTarget });
                }}
                title={`Open ${item.label}`}
                className="group flex items-center rounded-row bg-brain-v1baby-blue-5 p-2 hover:bg-brain-v1baby-blue-15"
              >
                <RailTabIcon normal={item.icon} active={item.activeIcon} />
                <span className="sr-only">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
        {railPopups}
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

      <div className="absolute inset-x-[7px] bottom-[7px] top-[63px] overflow-y-auto">
        <div className="relative flex min-h-[754px] flex-col items-center gap-[24px]">
          <AccountCardWithActions
            accounts={accounts}
            selectedIndex={selectedIndex}
            onSelectAccount={setSelectedAccountId}
          />

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
              {tab === "assets" && <AssetFilterTabs filter={filter} onChange={setFilter} />}
              {tab === "transactions" && (
                <>
                  <TransactionFilterTabs
                    filter={transactionFilter}
                    onChange={(next) => {
                      setTradeFilterNotice(false);
                      setTransactionFilter(next);
                    }}
                    onTradesUnavailable={() => setTradeFilterNotice(true)}
                  />
                  <TransactionNotices
                    tradeFilterNotice={tradeFilterNotice}
                    unattributedTransactionCount={unattributedTransactionCount}
                  />
                </>
              )}
            </div>

            {tab === "transactions" ? (
              <TransactionsList
                transactions={accountTransactions}
                filter={transactionFilter}
                selectedAccountName={selected?.name}
                isLoading={transactionsLoading}
                isError={transactionsRead.failed}
                isIncomplete={transactionsIncomplete}
              />
            ) : (
              <AssetsList
                selectedAccount={selected}
                filter={filter}
                isLoading={isLoading}
                isError={isError}
                isIncomplete={isIncomplete}
              />
            )}
          </div>
        </div>
      </div>

      <div className="absolute left-[55px] top-[7px] z-20 w-[322px]">
        <AccountSelector
          accounts={accounts}
          selected={selected}
          onSelectAccount={setSelectedAccountId}
          shape="pill"
        />
      </div>
    </div>
  );
}

export default AccountsPanel;