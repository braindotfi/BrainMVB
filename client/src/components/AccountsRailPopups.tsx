/**
 * The three popups the collapsed Accounts rail opens.
 *
 * Figma 6519:52846 (Accounts), 6519:52446 (Assets) and 6519:52570
 * (Transactions), file cC2lQwC3g9hv96o5Wgy8Ek. All three are the same frame:
 * a titled header over a 8px-padded body whose first row is the account
 * selector. What follows differs — the account card, the asset list, the
 * transaction list — and every one of those is the component the open panel
 * already renders, imported rather than reproduced.
 *
 * These popups take the ledger read as props. The rail has already issued it,
 * so opening one costs no extra request and it cannot show a different answer
 * from the rail behind it.
 */

import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import closeIcon from "@assets/Close_1783293571882.png";
import type { BrainAccountDTO } from "@/lib/brainAccounts";
import type { TransactionFilter } from "@/lib/accountsPanelFormat";
import {
  AccountCard,
  AccountSelector,
  AssetFilterTabs,
  AssetsList,
  TransactionFilterTabs,
  TransactionNotices,
  TransactionsList,
  type AssetFilter,
  type BrainTransactionDTO,
} from "@/pages/sections/accountsPanelParts";

/** What every rail popup needs to know about the accounts read behind it. */
export interface RailPopupAccounts {
  accounts: BrainAccountDTO[];
  selectedIndex: number;
  selected?: BrainAccountDTO;
  onSelectAccount: (id: string) => void;
  isLoading: boolean;
  isError: boolean;
  isIncomplete: boolean;
}

/**
 * Shared chrome. 400px is the project's form-modal width (see
 * client/src/components/modalShell.test.ts); Figma draws 386, and the 14px
 * difference is absorbed by the 370px content column staying centred, so the
 * card and rows keep the exact geometry they have in the panel.
 */
function RailPopupShell({
  open,
  onOpenChange,
  title,
  description,
  nodeId,
  testId,
  children,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  /** Announced to screen readers on open; Figma shows no visible subtitle. */
  description: string;
  nodeId: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          data-testid={testId}
          data-node-id={nodeId}
          className="fixed left-[50%] top-[50%] z-50 flex max-h-[calc(100vh-32px)] w-[400px] max-w-[calc(100vw-32px)] translate-x-[-50%] translate-y-[-50%] flex-col items-start overflow-hidden rounded-panel border border-solid border-brain-v1stroke-2 bg-brain-v1highlight-dropdown-bg shadow-[0px_68px_27px_rgba(0,0,0,0.06),0px_38px_23px_rgba(0,0,0,0.2),0px_17px_17px_rgba(0,0,0,0.34),0px_4px_9px_rgba(0,0,0,0.39)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out"
        >
          <div className="flex w-full shrink-0 items-center justify-between border-b border-solid border-brain-v1stroke-2 bg-brain-v1highlight-dropdown-bg p-4 backdrop-blur-[10px]">
            <DialogPrimitive.Title asChild>
              <p className="whitespace-nowrap font-['Gilroy',sans-serif] text-[20px] font-semibold leading-6 text-brain-v1baby-blue-60">
                {title}
              </p>
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
            <DialogPrimitive.Close
              data-testid={`${testId}-close`}
              aria-label={`Close ${title}`}
              className="size-6 shrink-0 rounded-full p-0 transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
            >
              <img src={closeIcon} alt="" className="block size-6 rounded-full" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex w-full min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto p-2">
            <div className="flex w-full max-w-[370px] flex-col gap-2">{children}</div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * A read that finished and returned nothing is not a read still running, so
 * the popups name the four states apart rather than collapsing them into one
 * blank frame.
 */
function AccountsReadNotice({ isLoading, isError }: { isLoading: boolean; isError: boolean }) {
  if (isError) {
    return (
      <div
        data-testid="rail-popup-accounts-error"
        className="rounded-row bg-brain-v1baby-blue-15 px-4 py-4 text-sm leading-5 text-brain-v1error-text"
      >
        Couldn't load your accounts. Try again later.
      </div>
    );
  }
  if (isLoading) {
    return (
      <p
        data-testid="rail-popup-accounts-loading"
        className="rounded-row bg-brain-v1baby-blue-15 px-4 py-4 font-['Gilroy',sans-serif] text-sm leading-5 text-brain-v1baby-blue-60"
      >
        Accounts are still loading.
      </p>
    );
  }
  return (
    <p
      data-testid="rail-popup-accounts-empty"
      className="rounded-row bg-brain-v1baby-blue-15 px-4 py-4 font-['Gilroy',sans-serif] text-sm leading-5 text-brain-v1baby-blue-60"
    >
      No connected accounts yet.
    </p>
  );
}

/* ───────────────────────── Accounts (6519:52846) ───────────────────────── */

/**
 * The wallet button's popup: the selector, then the card for the chosen
 * account. An agent-operated account gets the green card and its Status
 * column automatically, because this is the panel's card component and the
 * colourway is derived from the account, not passed in.
 */
export function AccountRailPopup({
  open,
  onOpenChange,
  accountsRead,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  accountsRead: RailPopupAccounts;
}) {
  const { accounts, selectedIndex, selected, onSelectAccount, isLoading, isError, isIncomplete } = accountsRead;
  return (
    <RailPopupShell
      open={open}
      onOpenChange={onOpenChange}
      title="Accounts"
      description="The account you have selected, and its balance."
      nodeId="6519:52846"
      testId="popup-rail-accounts"
    >
      <AccountSelector
        accounts={accounts}
        selected={selected}
        onSelectAccount={onSelectAccount}
        shape="pill"
        idPrefix="rail-accounts"
      />
      {selected ? (
        <>
          {isIncomplete && (
            <p className="rounded-row bg-brain-v1baby-blue-15 px-4 py-3 font-['Gilroy',sans-serif] text-xs leading-4 text-brain-v1baby-blue-60">
              Some accounts couldn't be loaded, so this may not be all of them.
            </p>
          )}
          <AccountCard accounts={accounts} selectedIndex={selectedIndex} onSelectAccount={onSelectAccount} />
        </>
      ) : (
        <AccountsReadNotice isLoading={isLoading} isError={isError} />
      )}
    </RailPopupShell>
  );
}

/* ────────────────────────── Assets (6519:52446) ────────────────────────── */

export function AssetsRailPopup({
  open,
  onOpenChange,
  accountsRead,
  filter,
  onFilterChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  accountsRead: RailPopupAccounts;
  filter: AssetFilter;
  onFilterChange: (next: AssetFilter) => void;
}) {
  const { accounts, selected, onSelectAccount, isLoading, isError, isIncomplete } = accountsRead;
  return (
    <RailPopupShell
      open={open}
      onOpenChange={onOpenChange}
      title="Assets"
      description="The assets held across your connected accounts."
      nodeId="6519:52446"
      testId="popup-rail-assets"
    >
      <AccountSelector
        accounts={accounts}
        selected={selected}
        onSelectAccount={onSelectAccount}
        shape="row"
        idPrefix="rail-assets"
      />
      <div className="flex w-full flex-col gap-4">
        <AssetFilterTabs filter={filter} onChange={onFilterChange} />
        <AssetsList
          accounts={accounts}
          filter={filter}
          isLoading={isLoading}
          isError={isError}
          isIncomplete={isIncomplete}
        />
      </div>
    </RailPopupShell>
  );
}

/* ─────────────────────── Transactions (6519:52570) ─────────────────────── */

export function TransactionsRailPopup({
  open,
  onOpenChange,
  accountsRead,
  transactions,
  transactionsLoading,
  transactionsFailed,
  transactionsIncomplete,
  unattributedTransactionCount,
  filter,
  onFilterChange,
  tradeFilterNotice,
  onTradesUnavailable,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  accountsRead: RailPopupAccounts;
  /** Already narrowed to the selected account by the rail. */
  transactions: BrainTransactionDTO[];
  transactionsLoading: boolean;
  transactionsFailed: boolean;
  transactionsIncomplete: boolean;
  unattributedTransactionCount: number;
  filter: TransactionFilter;
  onFilterChange: (next: TransactionFilter) => void;
  tradeFilterNotice: boolean;
  onTradesUnavailable: () => void;
}) {
  const { accounts, selected, onSelectAccount } = accountsRead;
  return (
    <RailPopupShell
      open={open}
      onOpenChange={onOpenChange}
      title="Transactions"
      description="Recent activity on the account you have selected."
      nodeId="6519:52570"
      testId="popup-rail-transactions"
    >
      <AccountSelector
        accounts={accounts}
        selected={selected}
        onSelectAccount={onSelectAccount}
        shape="row"
        idPrefix="rail-transactions"
      />
      <div className="flex w-full flex-col gap-4">
        <div className="flex flex-col gap-2">
          <TransactionFilterTabs
            filter={filter}
            onChange={onFilterChange}
            onTradesUnavailable={onTradesUnavailable}
            idPrefix="rail-transactions"
          />
          <TransactionNotices
            tradeFilterNotice={tradeFilterNotice}
            unattributedTransactionCount={unattributedTransactionCount}
          />
        </div>
        <TransactionsList
          transactions={transactions}
          filter={filter}
          selectedAccountName={selected?.name}
          isLoading={transactionsLoading}
          isError={transactionsFailed}
          isIncomplete={transactionsIncomplete}
        />
      </div>
    </RailPopupShell>
  );
}
