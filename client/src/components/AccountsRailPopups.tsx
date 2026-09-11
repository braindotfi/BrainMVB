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
 * Figma 6540:64629 places the frame beside the rail rather than in the middle
 * of the screen, so each popup is anchored to the button that opened it. That
 * makes it read as that button's own surface, and it keeps the rail visible
 * so the other two are one click away.
 *
 * These popups take the ledger read as props. The rail has already issued it,
 * so opening one costs no extra request and it cannot show a different answer
 * from the rail behind it.
 */

import { useCallback, useLayoutEffect, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import closeIcon from "@assets/Close_1783293571882.png";
import type { BrainAccountDTO } from "@/lib/brainAccounts";
import type { TransactionFilter } from "@/lib/accountsPanelFormat";
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
 * Figma 6540:64629 measures 386px, with the popup's right edge flush against
 * the rail's left edge and its header centred on the button that opened it.
 */
const POPUP_WIDTH = 386;
/** p-4 + a 24px title line: the distance from the popup's top to its header's centre. */
const HEADER_CENTRE = 28;
/** Smallest gap kept between the popup and any viewport edge. */
const VIEWPORT_MARGIN = 8;
/** The rail frame, whose outer edge the popup is placed against. */
const RAIL_FRAME_SELECTOR = "[data-rail-frame]";

interface Placement {
  left: number;
  top: number;
  maxHeight: number;
}

/**
 * Places the popup beside its trigger.
 *
 * `fixed` escapes the rail's own `overflow` clip, but it also means nothing
 * keeps the popup on screen, so this owns the clamping: left of the rail by
 * default, flipped to its right if the left side cannot hold it, and pinned
 * inside the viewport vertically using the popup's measured height.
 *
 * The popup's height is not known until it is in the DOM, so placement takes
 * two passes and the first one is hidden. The element arrives through a
 * callback ref rather than a `useRef`: Radix mounts the content in its own
 * commit, so a ref object can still be empty when a layout effect runs and
 * nothing would ever re-run it. State re-renders, which is what makes the
 * second pass happen at all.
 */
function useAnchoredPlacement(anchor: HTMLElement | null, open: boolean) {
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  const place = useCallback(() => {
    if (!anchor || !content) return;
    const trigger = anchor.getBoundingClientRect();
    // Figma butts the popup against the rail's outer border, not against the
    // button inside it, so the horizontal edge comes from the frame the
    // button sits in. Anchoring to the button alone would slide the popup
    // over the rail's padding and hide its border.
    const frame = (anchor.closest(RAIL_FRAME_SELECTOR) ?? anchor).getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const maxHeight = viewportHeight - VIEWPORT_MARGIN * 2;

    // Left of the rail is the Figma placement. Flip only when the space there
    // genuinely cannot hold the popup.
    let left = frame.left - POPUP_WIDTH;
    if (left < VIEWPORT_MARGIN) {
      const flipped = frame.right;
      left = flipped + POPUP_WIDTH <= window.innerWidth - VIEWPORT_MARGIN ? flipped : VIEWPORT_MARGIN;
    }
    left = Math.min(left, window.innerWidth - VIEWPORT_MARGIN - POPUP_WIDTH);
    left = Math.max(VIEWPORT_MARGIN, left);

    // Figma lines the header up with the button, so the popup reads as that
    // button's surface rather than as a panel that happens to be nearby.
    const height = Math.min(content.offsetHeight, maxHeight);
    let top = trigger.top + trigger.height / 2 - HEADER_CENTRE;
    top = Math.min(top, viewportHeight - VIEWPORT_MARGIN - height);
    top = Math.max(VIEWPORT_MARGIN, top);

    setPlacement({ left, top, maxHeight });
  }, [anchor, content]);

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    place();
  }, [open, place]);

  useLayoutEffect(() => {
    if (!open) return;
    const onChange = () => place();
    window.addEventListener("resize", onChange);
    // `capture` matters: these surfaces scroll internally, and a non-capturing
    // window listener never sees a scroll inside the rail or the centre column.
    window.addEventListener("scroll", onChange, true);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [open, place]);

  return { setContent, placement };
}

/**
 * Shared chrome: an anchored flyout rather than a centred modal, so the modal
 * width standard's 480/400/375 rule does not apply to it. Figma's own 386px
 * is used instead, which is what lets the 370px content column inside keep the
 * exact geometry it has in the open panel.
 */
function RailPopupShell({
  open,
  onOpenChange,
  anchor,
  title,
  description,
  nodeId,
  testId,
  children,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** The rail button that opened this popup; the popup is placed against it. */
  anchor: HTMLElement | null;
  title: string;
  /** Announced to screen readers on open; Figma shows no visible subtitle. */
  description: string;
  nodeId: string;
  testId: string;
  children: ReactNode;
}) {
  const { setContent, placement } = useAnchoredPlacement(anchor, open);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          ref={setContent}
          data-testid={testId}
          data-node-id={nodeId}
          data-anchored="rail"
          style={{
            left: placement?.left ?? 0,
            top: placement?.top ?? 0,
            maxHeight: placement?.maxHeight,
            // One frame unplaced while the height is measured. Hidden rather
            // than unmounted, so there is a box to measure at all.
            visibility: placement ? undefined : "hidden",
          }}
          className="fixed z-50 flex w-[386px] max-w-[calc(100vw-16px)] flex-col items-start overflow-hidden rounded-panel border border-solid border-brain-v1stroke-2 bg-brain-v1highlight-dropdown-bg shadow-[0px_68px_27px_rgba(0,0,0,0.06),0px_38px_23px_rgba(0,0,0,0.2),0px_17px_17px_rgba(0,0,0,0.34),0px_4px_9px_rgba(0,0,0,0.39)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out"
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
  anchor,
  accountsRead,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  anchor: HTMLElement | null;
  accountsRead: RailPopupAccounts;
}) {
  const { accounts, selectedIndex, selected, onSelectAccount, isLoading, isError, isIncomplete } = accountsRead;
  return (
    <RailPopupShell
      open={open}
      onOpenChange={onOpenChange}
      anchor={anchor}
      title="Accounts"
      description="The account you have selected, its balance, and what you can do with it."
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
          <AccountCardWithActions
            accounts={accounts}
            selectedIndex={selectedIndex}
            onSelectAccount={onSelectAccount}
          />
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
  anchor,
  accountsRead,
  filter,
  onFilterChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  anchor: HTMLElement | null;
  accountsRead: RailPopupAccounts;
  filter: AssetFilter;
  onFilterChange: (next: AssetFilter) => void;
}) {
  const { accounts, selected, onSelectAccount, isLoading, isError, isIncomplete } = accountsRead;
  return (
    <RailPopupShell
      open={open}
      onOpenChange={onOpenChange}
      anchor={anchor}
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
  anchor,
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
  anchor: HTMLElement | null;
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
      anchor={anchor}
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
