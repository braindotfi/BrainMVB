/**
 * The pieces of the Accounts panel that are now drawn in more than one place.
 *
 * The collapsed rail's wallet / Assets / Transactions buttons open popups
 * (Figma 6519:52846, 6519:52446, 6519:52570) that show the same account card,
 * the same asset rows and the same transaction rows as the open panel. These
 * were lifted out of AccountsPanel unchanged rather than reproduced, so the
 * popup and the panel cannot drift apart: there is one account card in the
 * codebase, one asset row, one transaction row.
 *
 * Nothing here fetches. Every component is handed the ledger read its caller
 * already has, so opening a popup over the rail costs no extra request and
 * cannot disagree with the rail about what the ledger said.
 */

import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import addIcon from "@assets/add_1789001100272.png";
import sendIcon from "@assets/send_1789001100274.png";
import exchangeIcon from "@assets/exchange_1789001100274.png";
import bankCardIcon from "@assets/BankCard_1789001100273.png";
import binanceIcon from "@assets/binance_1789001191831.png";
import polygonIcon from "@assets/polygon_1789001191833.png";
import dollarIcon from "@assets/dollar_1789001191833.png";
import ethereumIcon from "@assets/ethereum_1789001191833.png";
import accountCardGlow from "@assets/account-card-glow.svg";
import accountCardGlowGreen from "@assets/account-card-glow-green.svg";
import accountCardCopyIcon from "@assets/account-card-copy.svg";
import transactionOutIcon from "@assets/tx-arrow-out.svg";
import transactionInIcon from "@assets/tx-arrow-in.svg";
import transactionDotIcon from "@assets/tx-dot.svg";
import walletAgentLargeIcon from "@assets/wallet-icon-agent-48.svg";
import walletBankIcon from "@assets/wallet-icon-bank-32.svg";
import walletAgentIcon from "@assets/wallet-icon-agent-32.svg";
import completeIcon from "@assets/Icons_1789001270032.png";
import dropdownActiveIcon from "@assets/Dropdown_Active_1789001286488.png";
import dropdownInactiveIcon from "@assets/Dropdown_Inactive_1789001286488.png";
import addAgentIcon from "@assets/dropdown-add-agent.svg";
import { ACCOUNT_KIND_LABEL, isAgentAccount, type BrainAccountDTO } from "@/lib/brainAccounts";
import {
  accountIdentifierLabel,
  formatTransactionAmount,
  shortenIdentifier,
  transactionFlow,
  transactionMatchesFilter,
  transactionMeta,
  type TransactionFilter,
} from "@/lib/accountsPanelFormat";

export type AssetFilter = "all" | "cash" | "crypto";

export interface BrainTransactionDTO {
  id: string;
  amount: string;
  currency: string;
  direction: "inflow" | "outflow" | "transfer" | "adjustment";
  transaction_date: string;
  description_normalized?: string | null;
  description_raw?: string | null;
  account_id?: string | null;
}

export function compactNumber(value: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return number.toLocaleString("en-US", {
    maximumFractionDigits: 8,
  });
}

export function formatUsd(value: string | number, fixedDecimals: boolean): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fixedDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(number);
}

export const ASSET_NAME: Record<string, string> = {
  ETH: "Ethereum",
  USD: "Dollar",
  MATIC: "Polygon",
  POL: "Polygon",
  BNB: "Binance",
};

export const TRANSACTION_DIRECTION_LABEL: Record<BrainTransactionDTO["direction"], string> = {
  inflow: "Incoming",
  outflow: "Outgoing",
  transfer: "Transfer",
  adjustment: "Adjustment",
};

export const TRANSACTION_FILTERS: Array<{ value: TransactionFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "trades", label: "Trades" },
  { value: "deposits", label: "Deposits" },
  { value: "withdrawals", label: "Withdrawals" },
];

/**
 * The 32px avatar used for an account in the selector.
 *
 * Figma 3759:50250 draws the wallet glyph in two colourways, Bank and Agent,
 * and uses the bank one for every account except the payment agent.
 */
export const selectorIconForAccount = (account: BrainAccountDTO) =>
  isAgentAccount(account) ? walletAgentIcon : walletBankIcon;

export const iconForAccount = (account: BrainAccountDTO) => {
  if (account.account_type === "onchain") {
    const currency = account.currency.toUpperCase();
    if (currency === "ETH") return ethereumIcon;
    if (currency === "MATIC" || currency === "POL") return polygonIcon;
    if (currency === "BNB") return binanceIcon;
  }
  return account.currency.toUpperCase() === "USD" ? dollarIcon : bankCardIcon;
};

export function filterAccounts(accounts: BrainAccountDTO[], filter: AssetFilter): BrainAccountDTO[] {
  return accounts.filter((account) => {
    if (filter === "cash") return account.account_type !== "onchain";
    if (filter === "crypto") return account.account_type === "onchain";
    return true;
  });
}

export function AccountPanelSkeleton() {
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

/* ─────────────────────────── Account card ─────────────────────────── */

interface AccountCardProps {
  accounts: BrainAccountDTO[];
  selectedIndex: number;
  onSelectAccount: (id: string) => void;
}

/**
 * The 370x200 account card from Figma 6519:54130, and its green agent
 * colourway from 3759:50590.
 *
 * Swiping the card moves between accounts in both places this card is drawn.
 * The dots remain direct and keyboard-accessible account selectors.
 */
export function AccountCard({ accounts, selectedIndex, onSelectAccount }: AccountCardProps) {
  const [copied, setCopied] = useState(false);
  const selected = accounts[selectedIndex];
  const agentSelected = selected ? isAgentAccount(selected) : false;
  // Figma 3759:50590 gives an agent-operated account its own green card. Every
  // other account keeps the orange one from 6519:54130.
  const cardLabelClass = agentSelected ? "text-brain-v1asset-green" : "text-brain-v1light-orange";

  const selectAccountByOffset = (offset: number) => {
    if (accounts.length < 2) return;
    // "Cycle" is literal: swiping forward from the last account returns to
    // the first, and swiping back from the first returns to the last.
    const nextIndex = (selectedIndex + offset + accounts.length) % accounts.length;
    const next = accounts[nextIndex];
    onSelectAccount(next.id);
  };

  const swipeStart = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const onCardPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Buttons on the card — especially the pagination dots — own their taps.
    // Capturing their pointer on the card retargets the eventual click away
    // from the button on touch browsers.
    if ((event.target as HTMLElement).closest("button")) return;
    swipeStart.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    // Capturing means a quick thumb swipe can finish outside the card without
    // losing the gesture. Selection happens during the swipe, not after a
    // tap-hold-drag-release sequence.
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Older touch browsers expose the method but reject capture. The card
      // still receives ordinary in-bounds pointer moves, so keep the gesture.
    }
  };
  const onCardPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    // Advance as soon as a deliberate horizontal swipe crosses the threshold.
    // Clearing first guarantees one account change per gesture.
    if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy)) return;
    event.preventDefault();
    swipeStart.current = null;
    selectAccountByOffset(dx < 0 ? 1 : -1);
  };
  const finishSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointerId = swipeStart.current?.pointerId ?? event.pointerId;
    swipeStart.current = null;
    if (event.currentTarget.hasPointerCapture?.(pointerId)) {
      event.currentTarget.releasePointerCapture(pointerId);
    }
  };

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

  return (
    <div
      data-testid="account-card"
      onPointerDown={onCardPointerDown}
      onPointerMove={onCardPointerMove}
      onPointerUp={finishSwipe}
      onPointerCancel={finishSwipe}
      className={`relative h-[200px] touch-pan-y overflow-hidden rounded-panel shadow-[0px_122px_34px_rgba(0,0,0,0.01),0px_78px_31px_rgba(0,0,0,0.04),0px_44px_26px_rgba(0,0,0,0.15),0px_20px_20px_rgba(0,0,0,0.26),0px_5px_11px_rgba(0,0,0,0.29)] ${
        agentSelected ? "bg-brain-v1dark-green" : "bg-brain-v1dark-orange"
      }`}
    >
      <div className="absolute left-[57.01px] top-[-242.2px] flex h-[506.984px] w-[470.86px] items-center justify-center" aria-hidden="true">
        <div className="flex-none rotate-[-52.17deg]">
          <div className="relative h-[246.071px] w-[450.814px]">
            <img src={agentSelected ? accountCardGlowGreen : accountCardGlow} alt="" className="absolute inset-[-30.07%_-16.41%] block size-auto max-w-none" />
          </div>
        </div>
      </div>
      <div
        data-testid="account-card-linear-stroke"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 rounded-panel p-[1.4px]"
        style={{
          // Measured off Figma 6519:54130: the stroke runs corner-to-corner
          // (top-left -> bottom-right, i.e. CSS "to bottom right", which puts the
          // other two corners at exactly 50%), bright at both ends and effectively
          // transparent through the middle.
          //
          // The agent card (3759:50590) is the same component in a green
          // colourway, so it reuses the measured stop positions with the green
          // hue rather than a second, differently-shaped stroke.
          background: agentSelected
            ? "linear-gradient(to bottom right, rgba(66, 191, 35, 0.45) 0%, rgba(66, 191, 35, 0.1) 30%, rgba(66, 191, 35, 0.02) 55%, rgba(66, 191, 35, 0.2) 78%, rgba(66, 191, 35, 0.58) 100%)"
            : "linear-gradient(to bottom right, rgba(255, 149, 0, 0.45) 0%, rgba(255, 149, 0, 0.1) 30%, rgba(255, 149, 0, 0.02) 55%, rgba(255, 149, 0, 0.2) 78%, rgba(255, 149, 0, 0.58) 100%)",
          WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
      />
      <div className="absolute left-[14.6px] top-[14.6px] flex w-[338px] items-center gap-4">
        <img src={agentSelected ? walletAgentLargeIcon : bankCardIcon} alt="" className="size-12 shrink-0" />
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
        <p
          data-testid="text-account-identifier-label"
          className={`font-['JetBrains_Mono',monospace] text-xs font-bold leading-3 ${cardLabelClass}`}
        >
          {accountIdentifierLabel(selected?.account_type)}
        </p>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <p
            data-testid="text-account-identifier"
            title={selected?.external_account_id ?? undefined}
            className="min-w-0 truncate font-['JetBrains_Mono',monospace] text-[20px] font-medium leading-6 text-white"
          >
            {selected?.external_account_id ? shortenIdentifier(selected.external_account_id) : "—"}
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
      <div className={`absolute left-[14.6px] top-[134.6px] ${agentSelected ? "w-[126px]" : "w-[338px]"}`}>
        <p className={`font-['JetBrains_Mono',monospace] text-xs font-bold leading-3 ${cardLabelClass}`}>Name</p>
        <p
          data-testid="text-account-name"
          className="mt-1 truncate font-['JetBrains_Mono',monospace] text-sm font-medium leading-4 text-white"
        >
          {selected?.name ?? "No connected account"}
        </p>
      </div>
      {/* Figma 3759:50590 puts a second column beside Name on the agent
          card. It only renders when the ledger actually states a status. */}
      {agentSelected && selected?.status && (
        <div className="absolute left-[148.6px] top-[134.6px] w-[204px]">
          <p className={`font-['JetBrains_Mono',monospace] text-xs font-bold leading-3 ${cardLabelClass}`}>Status</p>
          <p className="mt-1 truncate font-['JetBrains_Mono',monospace] text-sm font-medium capitalize leading-4 text-white">
            {selected.status.replace(/_/g, " ")}
          </p>
        </div>
      )}
      {accounts.length > 1 && (
        <div
          data-testid="account-card-pagination"
          role="tablist"
          aria-label="Choose the account shown on the card"
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") {
              event.preventDefault();
              selectAccountByOffset(1);
            } else if (event.key === "ArrowLeft") {
              event.preventDefault();
              selectAccountByOffset(-1);
            }
          }}
          className="absolute bottom-0 left-1/2 z-20 flex -translate-x-1/2 items-center"
        >
          {accounts.map((account, index) => {
            const current = index === selectedIndex;
            return (
              <button
                key={account.id}
                type="button"
                role="tab"
                aria-selected={current}
                tabIndex={current ? 0 : -1}
                aria-label={account.name}
                title={account.name}
                onClick={() => onSelectAccount(account.id)}
                // Keep Figma's 6px mark but give every dot a real 32x32 touch
                // target. A pseudo-element only made the old box 10x24 and
                // still let the card's pointer capture steal the tap.
                className="relative flex size-8 items-center justify-center rounded-full"
              >
                <span
                  aria-hidden="true"
                  className={`size-[6px] rounded-full ${
                    current
                      ? "bg-white"
                      : agentSelected
                        ? "bg-brain-v1asset-green opacity-40"
                        : "bg-brain-v1light-orange opacity-50"
                  }`}
                  style={{ mixBlendMode: "plus-lighter" }}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── Account card + actions ─────────────────────── */

/**
 * Figma draws Add / Send / Exchange on a 138px tray that the card overlaps,
 * so the two are one composite rather than two things a caller has to stack
 * in the right order.
 *
 * None of the three does anything yet, in the panel or in the popup, so each
 * stays disabled and says why. Inventing a destination for them would be a
 * worse answer than an honest dead control.
 */
const actionItems = [
  { label: "Add", image: addIcon, title: "Adding accounts is not available here yet" },
  { label: "Send", image: sendIcon, title: "Sending is not available here yet" },
  { label: "Exchange", image: exchangeIcon, title: "Exchange is not available here yet" },
];

/**
 * The card sitting on its action tray, as Figma 6540:64571 draws it: a 138px
 * panel at y=152 with the three actions at y=64 inside it, and the 200px card
 * laid over the top. 290px total.
 *
 * Both the open panel and the rail's Accounts popup render this, so the
 * actions cannot end up in one and not the other.
 */
export function AccountCardWithActions({ accounts, selectedIndex, onSelectAccount }: AccountCardProps) {
  return (
    <div data-node-id="6540:64571" className="relative h-[290px] w-full max-w-[370px] shrink-0">
      <div className="absolute top-[152px] h-[138px] w-full rounded-panel bg-brain-v1headerfooterbg">
        <div className="absolute left-4 right-4 top-16 flex items-center gap-2">
          {actionItems.map((action) => (
            <div
              key={action.label}
              className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1"
              title={action.title}
            >
              <button disabled aria-label={action.title} className="size-10 cursor-not-allowed">
                <img src={action.image} alt="" className="block size-10" />
              </button>
              <span className="font-['Gilroy',sans-serif] text-xs font-semibold leading-[14px] text-brain-v1baby-blue-60">
                {action.label}
              </span>
            </div>
          ))}
        </div>
      </div>
      <AccountCard accounts={accounts} selectedIndex={selectedIndex} onSelectAccount={onSelectAccount} />
    </div>
  );
}

/* ───────────────────────── Account selector ───────────────────────── */

interface AccountSelectorProps {
  accounts: BrainAccountDTO[];
  selected?: BrainAccountDTO;
  onSelectAccount: (id: string) => void;
  /**
   * "pill" is the open panel's 40px-radius control (Figma 3759:50250, and the
   * account popup's 6519:52851). "row" is the 8px-radius, 48px-tall variant the
   * Assets and Transactions popups use (6519:52451 / 6519:52575), which also
   * names the account's kind beside "Your Account".
   */
  shape?: "pill" | "row";
  /** Distinguishes this instance's sr-only text and test ids from the panel's. */
  idPrefix?: string;
}

export function AccountSelector({
  accounts,
  selected,
  onSelectAccount,
  shape = "pill",
  idPrefix = "accounts",
}: AccountSelectorProps) {
  const [open, setOpen] = useState(false);
  const [addAgentNotice, setAddAgentNotice] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuPlacement, setMenuPlacement] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const addAgentDescriptionId = `${idPrefix}-add-agent-unavailable`;
  // Figma writes "Debit" here. The ledger states an account kind rather than a
  // card product, so the kind is what gets shown — an account that states none
  // gets no second label instead of a guessed one.
  const kindLabel = selected ? ACCOUNT_KIND_LABEL[selected.account_type] : undefined;

  useLayoutEffect(() => {
    if (!open) {
      setMenuPlacement(null);
      return;
    }
    const place = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const margin = 8;
      const width = Math.min(rect.width, window.innerWidth - margin * 2);
      const left = Math.max(margin, Math.min(rect.left, window.innerWidth - margin - width));
      const top = rect.bottom + 4;
      setMenuPlacement({
        left,
        top,
        width,
        maxHeight: Math.max(80, Math.min(280, window.innerHeight - top - margin)),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return (
    <div
      className="w-full"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          event.currentTarget.querySelector<HTMLButtonElement>("[data-testid$='account-selector']")?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        data-testid={idPrefix === "accounts" ? "button-account-selector" : `button-${idPrefix}-account-selector`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={
          shape === "pill"
            ? "flex h-10 w-full items-center gap-2 rounded-[40px] border border-solid border-brain-v1baby-blue-30 bg-brain-v1baby-blue-15 p-1"
            : "flex h-12 w-full items-center gap-2 rounded-row bg-brain-v1baby-blue-15 p-2"
        }
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <img src={selected ? selectorIconForAccount(selected) : walletBankIcon} alt="" className="size-8 shrink-0" />
          <span className="truncate normal-case font-['Gilroy',sans-serif] text-base font-medium leading-5 text-brain-v1baby-blue-100">Your Account</span>
          {shape === "row" && kindLabel && (
            <>
              <span aria-hidden="true" className="size-[6px] shrink-0 rounded-full bg-brain-v1baby-blue-60" />
              <span className="truncate normal-case font-['Gilroy',sans-serif] text-base font-medium leading-5 text-brain-v1baby-blue-100">
                {kindLabel}
              </span>
            </>
          )}
        </div>
        {selected && <img src={completeIcon} alt="Connected" className="size-5 shrink-0" />}
        <img
          src={open ? dropdownActiveIcon : dropdownInactiveIcon}
          alt=""
          className={shape === "pill" ? "size-8 shrink-0" : "size-6 shrink-0"}
        />
      </button>
      {open && menuPlacement && createPortal(
        <>
          <button
            type="button"
            aria-label="Close account selector"
            data-testid={`${idPrefix}-account-selector-dimmer`}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[60] cursor-default bg-black/60 backdrop-blur-[2px]"
          />
          <div
          role="menu"
          aria-label="Choose account"
          data-node-id="3759:50251"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              triggerRef.current?.focus();
            }
          }}
          className="fixed z-[70] overflow-y-auto rounded-row border border-solid border-brain-v1stroke-2 bg-brain-v1highlight-dropdown-bg p-2"
          style={{
            ...menuPlacement,
            // Figma 3759:50251 stacks four shadows under the panel.
            boxShadow:
              "0px 68px 27px rgba(0,0,0,0.06), 0px 38px 23px rgba(0,0,0,0.2), 0px 17px 17px rgba(0,0,0,0.34), 0px 4px 9px rgba(0,0,0,0.39)",
          }}
        >
          <span id={addAgentDescriptionId} className="sr-only">
            Creating an agent account isn't available here yet.
          </span>
          <button
            type="button"
            aria-disabled="true"
            aria-describedby={addAgentDescriptionId}
            title="Creating an agent account isn't available here yet"
            onClick={() => setAddAgentNotice(true)}
            data-testid={idPrefix === "accounts" ? "button-add-agent-account" : `button-${idPrefix}-add-agent-account`}
            className="flex w-full cursor-not-allowed items-center gap-2 rounded-[8px] bg-brain-v1purple p-2 text-left"
          >
            <img src={addAgentIcon} alt="" className="size-8 shrink-0" />
            <span className="min-w-0 flex-1 truncate normal-case font-['Gilroy',sans-serif] text-base font-medium leading-5 text-brain-v1dark-purple">
              Add Agent Account
            </span>
          </button>
          {addAgentNotice && (
            <p role="status" className="px-2 py-1 font-['Gilroy',sans-serif] text-xs leading-4 text-brain-v1baby-blue-60">
              Agent accounts can't be created from here yet.
            </p>
          )}
          {accounts.length === 0 ? (
            <p className="px-2 py-1 font-['Gilroy',sans-serif] text-sm leading-5 text-brain-v1baby-blue-60">No connected accounts</p>
          ) : accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              role="menuitemradio"
              aria-checked={account.id === selected?.id}
              onClick={() => {
                onSelectAccount(account.id);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 rounded-[8px] p-2 text-left hover:bg-brain-v1item-hover"
            >
              <span className="flex min-w-0 items-center gap-2">
                <img src={selectorIconForAccount(account)} alt="" className="size-8 shrink-0" />
                <span className="min-w-0 truncate normal-case font-['Gilroy',sans-serif] text-base font-medium leading-5 text-brain-v1baby-blue-100">{account.name}</span>
                {account.external_account_id && (
                  <span
                    title={account.external_account_id}
                    className="shrink-0 rounded-[22px] border border-solid bg-brain-v1baby-blue-15 px-2 py-[3px] font-['Gilroy',sans-serif] text-xs font-semibold leading-[14px] text-brain-v1baby-blue-60"
                    style={{ borderColor: "rgba(108, 119, 157, 0.2)" }}
                  >
                    {shortenIdentifier(account.external_account_id)}
                  </span>
                )}
              </span>
              {account.id === selected?.id && (
                <img src={completeIcon} alt="Selected" className="size-5 shrink-0" />
              )}
            </button>
          ))}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

/* ─────────────────────────── Filter pills ─────────────────────────── */

export function AssetFilterTabs({
  filter,
  onChange,
}: {
  filter: AssetFilter;
  onChange: (next: AssetFilter) => void;
}) {
  return (
    <div className="flex w-full gap-0.5 rounded-pill bg-brain-v1headerfooterbg p-0.5">
      {(["all", "cash", "crypto"] as AssetFilter[]).map((item) => (
        <button
          key={item}
          type="button"
          aria-pressed={filter === item}
          onClick={() => onChange(item)}
          className={`flex-1 rounded-pill px-4 py-2 font-['Gilroy',sans-serif] text-sm font-semibold capitalize leading-4 ${
            filter === item ? "bg-brain-v1dark-orange text-brain-v1light-orange" : ""
          }`}
          style={filter === item ? undefined : { color: "var(--brain-v1baby-blue-30)" }}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

/**
 * `idPrefix` keeps the sr-only description's id unique when the rail popup and
 * the open panel are both mounted; two elements sharing an id would leave
 * `aria-describedby` pointing at whichever happened to be first in the DOM.
 */
export function TransactionFilterTabs({
  filter,
  onChange,
  onTradesUnavailable,
  idPrefix = "accounts",
}: {
  filter: TransactionFilter;
  onChange: (next: TransactionFilter) => void;
  onTradesUnavailable: () => void;
  idPrefix?: string;
}) {
  const tradesDescriptionId = `${idPrefix}-trades-unavailable`;
  return (
    <div
      data-node-id="2663:26526"
      className="flex w-full gap-0.5 overflow-hidden rounded-pill bg-brain-v1headerfooterbg p-0.5"
      role="group"
      aria-label="Filter transactions"
    >
      <span id={tradesDescriptionId} className="sr-only">
        Trade classification isn't available from the ledger yet.
      </span>
      {TRANSACTION_FILTERS.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-pressed={filter === item.value}
          aria-disabled={item.value === "trades" ? "true" : undefined}
          aria-describedby={item.value === "trades" ? tradesDescriptionId : undefined}
          title={item.value === "trades" ? "Trade classification isn't available from the ledger yet" : undefined}
          onClick={() => {
            if (item.value === "trades") {
              onTradesUnavailable();
              return;
            }
            onChange(item.value);
          }}
          className={`min-w-0 rounded-pill px-4 py-2 font-['Gilroy',sans-serif] text-sm font-semibold leading-4 ${
            item.value === "all" ? "w-[53px]" :
            item.value === "trades" ? "w-[84px]" :
            item.value === "deposits" ? "w-[99px]" : "w-[124px]"
          } ${
            filter === item.value
              ? "bg-brain-v1dark-green text-brain-v1asset-green"
              : "bg-brain-v1headerfooterbg"
          }`}
          style={filter === item.value ? undefined : { color: "var(--brain-v1baby-blue-30)" }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The two notes that sit above the transaction list.
 *
 * The unattributed-rows note sits OUTSIDE the list/empty/error branches on
 * purpose. Rows the feed never attributed to an account are invisible under
 * every account, so an empty list is exactly the case where a reader most
 * needs telling that some activity is being withheld — hiding the note there
 * turns "we can't place these" into a bare, and false, "No transactions yet".
 */
export function TransactionNotices({
  tradeFilterNotice,
  unattributedTransactionCount,
}: {
  tradeFilterNotice: boolean;
  unattributedTransactionCount: number;
}) {
  return (
    <>
      {tradeFilterNotice && (
        <p
          role="status"
          className="px-1 font-['Gilroy',sans-serif] text-xs leading-4 text-brain-v1baby-blue-60"
        >
          Trades will be available when the ledger provides transaction types.
        </p>
      )}
      {unattributedTransactionCount > 0 && (
        <p
          data-testid="accounts-panel-unattributed-transactions"
          className="rounded-row bg-brain-v1highlight-dropdown-bg px-4 py-3 font-['Gilroy',sans-serif] text-xs leading-4 text-brain-v1baby-blue-60"
        >
          {unattributedTransactionCount === 1
            ? "1 transaction isn't linked to an account, so it isn't shown here."
            : `${unattributedTransactionCount} transactions aren't linked to an account, so they aren't shown here.`}
        </p>
      )}
    </>
  );
}

/* ───────────────────────────── Asset rows ───────────────────────────── */

/**
 * The holdings of ONE account: the account the selector above the list names.
 *
 * The list used to render every account in the read, under a selector that
 * named a single one of them. On the demo tenant that put the wallet's ETH and
 * the payment agent's USD under a heading reading "Bank checking", and showed
 * "Dollar" twice because two accounts each hold USD — two different records
 * that render as the same row. The card and the transaction list under it are
 * both the selected account's, so this one is too.
 *
 * The ledger states one currency per account, so an account's holdings are
 * that account alone; the asset filter still applies, and an account the
 * filter hides says so rather than reading as an unconnected account.
 */
export function AssetsList({
  selectedAccount,
  filter,
  isLoading,
  isError,
  isIncomplete,
}: {
  /** The account named by the selector / card above the list. */
  selectedAccount?: BrainAccountDTO;
  filter: AssetFilter;
  isLoading: boolean;
  isError: boolean;
  isIncomplete: boolean;
}) {
  const holdings = useMemo(
    () => filterAccounts(selectedAccount ? [selectedAccount] : [], filter),
    [selectedAccount, filter],
  );

  if (isLoading) return <AccountPanelSkeleton />;
  if (isError) {
    return (
      <div data-testid="accounts-panel-error" className="rounded-row bg-brain-v1highlight-dropdown-bg px-4 py-4 text-sm leading-5 text-brain-v1error-text">Couldn't load live account activity. Try again later.</div>
    );
  }
  if (!selectedAccount) {
    return (
      <div data-testid="accounts-panel-empty" className="rounded-row bg-brain-v1highlight-dropdown-bg px-4 py-5 text-center">
        <p className="font-['Gilroy',sans-serif] text-sm font-semibold leading-5 text-brain-v1baby-blue-100">No assets connected yet</p>
        <p className="mt-1 font-['Gilroy',sans-serif] text-xs leading-4 text-brain-v1baby-blue-60">Live balances will appear here once an account is connected.</p>
      </div>
    );
  }
  if (holdings.length === 0) {
    return (
      <div data-testid="accounts-panel-assets-filtered-empty" className="rounded-row bg-brain-v1highlight-dropdown-bg px-4 py-5 text-center">
        <p className="font-['Gilroy',sans-serif] text-sm font-semibold leading-5 text-brain-v1baby-blue-100">
          No {filter} assets
        </p>
        <p className="mt-1 font-['Gilroy',sans-serif] text-xs leading-4 text-brain-v1baby-blue-60">
          {`${selectedAccount.name} holds no ${filter} assets, so this filter hides it.`}
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {isIncomplete && (
        <p className="rounded-row bg-brain-v1highlight-dropdown-bg px-4 py-3 font-['Gilroy',sans-serif] text-xs leading-4 text-brain-v1baby-blue-60">
          Some accounts couldn't be loaded, so you may not be able to select all of them.
        </p>
      )}
      {holdings.map((account, index) => (
        <div key={account.id} data-testid={`row-asset-${account.id}`} className="flex flex-col gap-4">
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
          {index < holdings.length - 1 && <div className="h-px w-full bg-brain-v1stroke-2" />}
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────── Transaction rows ─────────────────────────── */

export function TransactionsList({
  transactions,
  filter,
  selectedAccountName,
  isLoading,
  isError,
  isIncomplete,
}: {
  /** Already narrowed to the selected account by the caller. */
  transactions: BrainTransactionDTO[];
  filter: TransactionFilter;
  selectedAccountName?: string;
  isLoading: boolean;
  isError: boolean;
  isIncomplete: boolean;
}) {
  const filteredTransactions = useMemo(
    () => transactions.filter((transaction) => transactionMatchesFilter(transaction.direction, filter)),
    [transactions, filter],
  );

  if (isLoading) return <AccountPanelSkeleton />;
  if (isError) {
    return (
      <div data-testid="accounts-panel-transactions-error" className="rounded-row bg-brain-v1highlight-dropdown-bg px-4 py-4 text-sm leading-5 text-brain-v1error-text">
        Couldn't load live transactions. Try again later.
      </div>
    );
  }
  if (filteredTransactions.length === 0 && isIncomplete) {
    return (
      <div className="rounded-row bg-brain-v1highlight-dropdown-bg px-4 py-5 text-center">
        <p className="font-['Gilroy',sans-serif] text-sm font-semibold leading-5 text-brain-v1baby-blue-100">
          Couldn't load every transaction
        </p>
        <p className="mt-1 font-['Gilroy',sans-serif] text-xs leading-4 text-brain-v1baby-blue-60">
          Matching activity may be missing from this filtered view.
        </p>
      </div>
    );
  }
  if (filteredTransactions.length === 0) {
    return (
      <div data-testid="accounts-panel-transactions-empty" className="rounded-row bg-brain-v1highlight-dropdown-bg px-4 py-5 text-center">
        <p className="font-['Gilroy',sans-serif] text-sm font-semibold leading-5 text-brain-v1baby-blue-100">
          {filter === "all" ? "No transactions yet" : `No ${filter} yet`}
        </p>
        <p className="mt-1 font-['Gilroy',sans-serif] text-xs leading-4 text-brain-v1baby-blue-60">
          {filter === "all"
            ? selectedAccountName
              ? `Activity on ${selectedAccountName} will appear here.`
              : "Live account activity will appear here."
            : "Other transaction types are hidden by this filter."}
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {isIncomplete && (
        <p className="rounded-row bg-brain-v1highlight-dropdown-bg px-4 py-3 font-['Gilroy',sans-serif] text-xs leading-4 text-brain-v1baby-blue-60">
          Some transactions couldn't be loaded. The list below may be incomplete.
        </p>
      )}
      {filteredTransactions.map((transaction, index) => {
        const flow = transactionFlow(transaction.direction);
        const meta = transactionMeta(transaction.transaction_date);
        // A transfer or an adjustment states no direction, so its row
        // gets neither the red/green tint nor a directional arrow.
        const neutralIcon =
          transaction.currency.toUpperCase() === "USD" ? dollarIcon : bankCardIcon;
        return (
          <div key={transaction.id} className="flex flex-col gap-4">
            <div className="flex w-full items-center gap-2" data-testid={`row-transaction-${transaction.id}`}>
              <div
                className={`flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full ${
                  flow === "out"
                    ? "bg-brain-v1dark-pink-red"
                    : flow === "in"
                      ? "bg-brain-v1dark-green"
                      : "bg-brain-v1baby-blue-15"
                }`}
              >
                <img
                  src={
                    flow === "out"
                      ? transactionOutIcon
                      : flow === "in"
                        ? transactionInIcon
                        : neutralIcon
                  }
                  alt=""
                  className={flow === "neutral" ? "block size-10" : "block size-5"}
                  style={flow === "out" ? { transform: "scaleY(-1)" } : undefined}
                />
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="flex min-w-0 shrink flex-col gap-1">
                  <p className="truncate font-['Gilroy',sans-serif] text-base font-medium leading-5 text-brain-v1baby-blue-100">
                    {transaction.description_normalized ?? transaction.description_raw ?? TRANSACTION_DIRECTION_LABEL[transaction.direction]}
                  </p>
                  <div className="flex items-center gap-1">
                    {meta.map((part, partIndex) => (
                      <div key={part} className="flex items-center gap-1">
                        {partIndex > 0 && <img src={transactionDotIcon} alt="" className="block size-[3px] shrink-0" />}
                        <span
                          className="whitespace-nowrap font-['Gilroy',sans-serif] text-sm font-semibold leading-4"
                          style={{ color: "var(--brain-v1baby-blue-30)" }}
                        >
                          {part}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <p
                  className={`min-w-0 flex-1 truncate text-right font-['JetBrains_Mono',monospace] text-[20px] font-medium leading-5 ${
                    flow === "out"
                      ? "text-brain-v1pink-red"
                      : flow === "in"
                        ? "text-brain-v1asset-green"
                        : "text-brain-v1baby-blue-100"
                  }`}
                  title={`${transaction.amount} ${transaction.currency.toUpperCase()}`}
                >
                  {formatTransactionAmount(transaction.amount, transaction.currency, flow)}
                </p>
              </div>
            </div>
            {index < filteredTransactions.length - 1 && <div className="h-px w-full bg-brain-v1stroke-2" />}
          </div>
        );
      })}
    </div>
  );
}
