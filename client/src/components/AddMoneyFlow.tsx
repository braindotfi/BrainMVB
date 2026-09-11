import { useEffect, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { QRCodeSVG } from "qrcode.react";
import headerBackIcon from "@assets/Buttons_1789153208488.png";
import addIcon from "@assets/add_1789001100272.png";
import selectFieldButtonIcon from "@assets/figma_icons/add-money/select_field_btn_32.svg";
import chevronDownIcon from "@assets/figma_icons/add-money/chevron_down_24.svg";
import searchIcon from "@assets/figma_icons/add-money/search_24.svg";
import pickerCloseIcon from "@assets/figma_icons/add-money/popup_close_24.svg";
import qrButtonIcon from "@assets/figma_icons/add-money/btn_qr_32.svg";
import copyButtonIcon from "@assets/figma_icons/add-money/btn_copy_32.svg";
import copyGlyphIcon from "@assets/figma_icons/add-money/copy_glyph_24.svg";
import walletBankIcon from "@assets/wallet-icon-bank-32.svg";
import walletAgentIcon from "@assets/wallet-icon-agent-32.svg";
import { isAgentAccount, type BrainAccountDTO } from "@/lib/brainAccounts";
import { shortenIdentifier } from "@/lib/accountsPanelFormat";

interface AddMoneyFlowProps {
  accounts: BrainAccountDTO[];
}

/**
 * Every popup in this flow is authored at its Figma size and then displayed at
 * 75%. Scaling the rendered box beats dividing each value by hand: 322px,
 * 22px type and 39px gutters all have fractional three-quarter values, and
 * rounding each one separately drifts away from the frame. This way the source
 * still reads as the frame does, and the whole popup shrinks uniformly.
 */
const POPUP_SCALE = 0.75;

/** Radix centres with a translate; the scale has to ride on the same transform. */
const centredScaled = { transform: `translate(-50%, -50%) scale(${POPUP_SCALE})` } as const;

/** Room for the unscaled box, since the transform shrinks what is painted. */
const scaledMaxHeight = `calc((100vh - 16px) / ${POPUP_SCALE})`;

/**
 * Figma hangs each popup's 1px stroke OUTSIDE the frame (its border rect sits
 * at left/right/top -1px), so the frame number is the CONTENT width. Tailwind
 * is border-box, so a literal `w-[400px]` would spend two of those pixels on
 * the stroke and leave 320px between the 39px gutters instead of 322 — enough
 * to wrap "What account should we fund?" onto a second line and push the whole
 * modal 28px taller. Each width below is therefore the frame plus its stroke.
 */
const FRAME_W = { modal: "402px", picker: "306px", qr: "324px" } as const;

const overlayClass =
  "fixed inset-0 z-[70] bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0";

type FundingKind = "bank" | "wallet" | "unsupported";

/**
 * Which funding instructions, if any, can honestly be shown for an account.
 *
 * Only chequing and savings accounts have an IBAN to publish, and only on-chain
 * accounts have an address. Cards, loans, credit lines and payment-processor
 * accounts have neither: their `external_account_id` is a processor or card
 * reference, and printing it under "IBAN Bank Number" would invite someone to
 * send money to a number that cannot receive it. Those stay listed but
 * unselectable rather than being hidden, so the account is still accounted for.
 */
function fundingKind(account: BrainAccountDTO): FundingKind {
  const identifier = account.external_account_id?.trim() ?? "";
  if (account.account_type === "onchain") return "wallet";
  if (isAgentAccount(account) && /^0x/i.test(identifier)) return "wallet";
  if (account.account_type === "bank_checking" || account.account_type === "bank_savings") {
    return "bank";
  }
  return "unsupported";
}

function ModalHeader({ onBack }: { onBack: () => void }) {
  return (
    <div className="relative h-14 w-full shrink-0 border-b border-solid border-brain-v1stroke-2">
      <button
        type="button"
        aria-label="Close Add Money"
        onClick={onBack}
        className="absolute left-[11px] top-[11px] size-8 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
      >
        <img src={headerBackIcon} alt="" className="block size-8" />
      </button>
    </div>
  );
}

/** Icon + name + shortened identifier: the row shape the picker and the field share. */
function AccountIdentity({ account }: { account: BrainAccountDTO }) {
  const identifier = account.external_account_id?.trim() ?? "";
  return (
    <div className="flex min-w-0 items-center gap-2">
      <img
        src={isAgentAccount(account) ? walletAgentIcon : walletBankIcon}
        alt=""
        className="block size-8 shrink-0"
      />
      {/* `button { text-transform: capitalize }` in index.css applies to every
          descendant, and both call sites here sit inside a button. An account
          name is the tenant's own text, not a UI label — "Operating cash" must
          not be redrawn as "Operating Cash". Same for the identifier pill. */}
      <p className="truncate font-['Gilroy',sans-serif] text-base font-medium normal-case leading-5 text-brain-v1baby-blue-100">
        {account.name}
      </p>
      {identifier && (
        <span className="shrink-0 rounded-[22px] border border-solid border-[rgba(108,119,157,0.2)] bg-brain-v1baby-blue-15 px-2 py-[3px] text-center font-['Gilroy',sans-serif] text-[12px] font-semibold normal-case leading-[14px] text-brain-v1baby-blue-60">
          {shortenIdentifier(identifier)}
        </span>
      )}
    </div>
  );
}

/**
 * The account picker (Figma 6543:54913). A nested dialog rather than a menu
 * anchored to the field: it is its own popup in the design, and a portalled
 * dialog cannot be clipped by the modal it opens over.
 */
function AccountPicker({
  open,
  onOpenChange,
  accounts,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: BrainAccountDTO[];
  selectedId: string;
  onSelect: (account: BrainAccountDTO) => void;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return accounts;
    return accounts.filter((account) => {
      const identifier = account.external_account_id?.trim().toLowerCase() ?? "";
      return account.name.toLowerCase().includes(needle) || identifier.includes(needle);
    });
  }, [accounts, query]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay data-testid="add-money-picker-overlay" className="fixed inset-0 z-[75] bg-black/40" />
        <DialogPrimitive.Content
          data-testid="add-money-picker"
          data-node-id="6543:54913"
          style={{ ...centredScaled, maxHeight: scaledMaxHeight, width: FRAME_W.picker }}
          className="fixed left-1/2 top-1/2 z-[76] flex flex-col overflow-hidden rounded-panel border border-solid border-brain-v1stroke-2 bg-brain-v1highlight-dropdown-bg drop-shadow-[0px_68px_13.5px_rgba(0,0,0,0.06)] focus:outline-none"
        >
          <DialogPrimitive.Title className="sr-only">Select Account</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Choose which of your accounts you want to fund.
          </DialogPrimitive.Description>

          <div className="flex w-full shrink-0 items-center justify-between border-b border-solid border-brain-v1stroke-2 p-4 backdrop-blur-[10px]">
            <p className="font-['Gilroy',sans-serif] text-[20px] font-semibold leading-6 text-brain-v1baby-blue-60">
              Select Account
            </p>
            <DialogPrimitive.Close
              aria-label="Close account picker"
              className="size-6 shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
            >
              <img src={pickerCloseIcon} alt="" className="block size-6" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex w-full min-h-0 flex-col gap-2 overflow-y-auto p-2">
            <div className="flex w-full items-center gap-2 rounded-[8px] bg-brain-v1baby-blue-15 p-2">
              <img src={searchIcon} alt="" className="block size-6 shrink-0" />
              <input
                type="search"
                data-testid="add-money-picker-search"
                aria-label="Search accounts"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                className="min-w-0 flex-1 bg-transparent font-['Gilroy',sans-serif] text-base font-medium leading-5 text-brain-v1baby-blue-100 outline-none placeholder:text-brain-v1baby-blue-60"
              />
            </div>

            <div className="flex w-full items-center px-2">
              <p className="min-w-0 flex-1 font-['Mont',sans-serif] text-[15px] font-semibold leading-6 tracking-[-0.6px] text-brain-v1baby-blue-60">
                All Assets
              </p>
            </div>

            {matches.map((account) => {
              const unsupported = fundingKind(account) === "unsupported";
              const isSelected = account.id === selectedId;
              return (
                <button
                  key={account.id}
                  type="button"
                  data-testid={`add-money-picker-option-${account.id}`}
                  // aria-disabled rather than `disabled`: the row still has to
                  // be reachable and announced — its whole point is to explain
                  // why this account cannot be funded — and the refusal has to
                  // live in the handler, where it still holds if the attribute
                  // is ever dropped in a restyle.
                  aria-disabled={unsupported || undefined}
                  aria-current={isSelected || undefined}
                  onClick={() => {
                    if (unsupported) return;
                    onSelect(account);
                  }}
                  className={`flex w-full items-center rounded-[8px] p-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brain-v1purple ${
                    isSelected ? "bg-brain-v1baby-blue-5" : "hover:bg-brain-v1baby-blue-5"
                  } ${unsupported ? "cursor-not-allowed opacity-50 hover:bg-transparent" : ""}`}
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <AccountIdentity account={account} />
                    {unsupported && (
                      <span className="pl-10 font-['Gilroy',sans-serif] text-[12px] font-medium normal-case leading-[14px] text-brain-v1baby-blue-60">
                        No funding details to show
                      </span>
                    )}
                  </span>
                </button>
              );
            })}

            {matches.length === 0 && (
              <p
                data-testid="add-money-picker-empty"
                className="px-2 py-2 font-['Gilroy',sans-serif] text-base font-medium leading-5 text-brain-v1baby-blue-60"
              >
                {accounts.length === 0 ? "No accounts yet" : "No accounts match that search"}
              </p>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function PillButton({
  children,
  variant,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  variant: "primary" | "secondary";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`h-12 min-w-0 flex-1 rounded-pill px-4 font-['Mont',sans-serif] text-lg font-semibold leading-6 tracking-[-0.72px] disabled:cursor-not-allowed disabled:opacity-50 ${
        variant === "primary"
          ? "bg-brain-v1dark-orange text-brain-v1light-orange"
          : "bg-brain-v1baby-blue-15 text-brain-v1baby-blue-60"
      }`}
    >
      {children}
    </button>
  );
}

function ReadonlyField({
  label,
  value,
  mono,
  actions,
}: {
  label: string;
  value: string;
  mono?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-1">
      {/* Figma paints this label in Baby Blue 30; that hex is a 2.2:1 text
          contrast failure and the repo's token guard rejects it, so the
          sanctioned Baby Blue 60 stands in. */}
      <p className="font-['Gilroy',sans-serif] text-base font-semibold leading-6 text-brain-v1baby-blue-60">{label}</p>
      <div className="flex h-14 items-center gap-2 rounded-panel bg-brain-v1baby-blue-15 px-4 py-[10px]">
        <p
          className={`min-w-0 flex-1 truncate text-[20px] leading-6 text-white ${
            mono ? "font-['JetBrains_Mono',monospace] font-semibold" : "font-['Gilroy',sans-serif] font-medium"
          }`}
        >
          {value}
        </p>
        {actions && <span className="flex shrink-0 items-center gap-2">{actions}</span>}
      </div>
    </div>
  );
}

export function AddMoneyFlow({ accounts }: AddMoneyFlowProps) {
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const copyTimer = useRef<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const qrTriggerRef = useRef<HTMLButtonElement | null>(null);
  const selected = useMemo(() => accounts.find((account) => account.id === accountId), [accounts, accountId]);
  const fundable = useMemo(
    () => accounts.filter((account) => fundingKind(account) !== "unsupported"),
    [accounts],
  );

  const reset = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setAccountId("");
      setCopyStatus("idle");
    } else {
      setPickerOpen(false);
      setQrOpen(false);
      if (copyTimer.current != null) window.clearTimeout(copyTimer.current);
      // The trigger is hand-rendered rather than a separate Radix component in
      // the caller. Restore it explicitly after the portal starts unmounting so
      // Escape, the scrim, and either Close control all return to the same place.
      queueMicrotask(() => triggerRef.current?.focus());
    }
  };

  /**
   * One guarded path for every copy control. `navigator.clipboard` is absent on
   * insecure origins and `writeText` rejects when the document is not focused
   * or permission is denied, so an unguarded call is either a thrown TypeError
   * or an unhandled rejection — and in both cases the button looks like it
   * worked. A failure has to be said out loud.
   */
  const copyText = async (text: string) => {
    const value = text.trim();
    if (!value) return;
    if (copyTimer.current != null) window.clearTimeout(copyTimer.current);
    try {
      if (typeof navigator.clipboard?.writeText !== "function") {
        throw new Error("clipboard unavailable");
      }
      await navigator.clipboard.writeText(value);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
    copyTimer.current = window.setTimeout(() => setCopyStatus("idle"), 1600);
  };

  const identifier = selected?.external_account_id?.trim() ?? "";
  const kind = selected ? fundingKind(selected) : undefined;
  const wallet = kind === "wallet";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={reset}>
      <DialogPrimitive.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          data-testid="button-account-add"
          aria-label="Add money to an account"
          disabled={fundable.length === 0}
          className="size-10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <img src={addIcon} alt="" className="block size-10" />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay data-testid="add-money-overlay" className={overlayClass} />
        <DialogPrimitive.Content
          data-testid="add-money-modal"
          data-node-id={!selected ? "3608:34362" : wallet ? "6543:55164" : "6543:55103"}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
          style={{ ...centredScaled, maxHeight: scaledMaxHeight, width: FRAME_W.modal }}
          className="fixed left-1/2 top-1/2 z-[71] flex flex-col overflow-y-auto rounded-modal border border-solid border-brain-v1stroke-2 bg-brain-v1highlight-dropdown-bg focus:outline-none"
        >
          <DialogPrimitive.Title className="sr-only">Add Money</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Choose an account and view the information needed to fund it.</DialogPrimitive.Description>
          <ModalHeader onBack={() => reset(false)} />

          <div className="flex flex-col gap-6 px-[39px] pb-[39px] pt-[23px]">
            <div>
              <p className="font-['Gilroy',sans-serif] text-[32px] font-semibold leading-10 text-brain-v1baby-blue-100">Add Money</p>
              <p className="font-['Gilroy',sans-serif] text-[22px] font-medium leading-7 text-brain-v1baby-blue-60">What account should we fund?</p>
            </div>

            <button
              type="button"
              data-testid="add-money-account-select"
              aria-haspopup="dialog"
              aria-label="Account to fund"
              onClick={() => setPickerOpen(true)}
              className="flex h-14 w-full items-center gap-2 rounded-panel bg-brain-v1baby-blue-15 px-4 py-[10px] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brain-v1purple"
            >
              {selected ? (
                <>
                  <span className="min-w-0 flex-1">
                    <AccountIdentity account={selected} />
                  </span>
                  <img src={chevronDownIcon} alt="" className="block size-6 shrink-0" />
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 font-['Gilroy',sans-serif] text-[20px] font-medium normal-case leading-6 text-brain-v1baby-blue-100">
                    Select Account
                  </span>
                  <img src={selectFieldButtonIcon} alt="" className="block size-8 shrink-0" />
                </>
              )}
            </button>

            {selected && (
              kind === "wallet" ? (
                <ReadonlyField
                  label="Wallet Address"
                  value={identifier ? shortenIdentifier(identifier) : "Address unavailable"}
                  mono
                  actions={
                    identifier ? (
                      <>
                        <button
                          ref={qrTriggerRef}
                          type="button"
                          data-testid="add-money-show-qr"
                          aria-label="Show QR code for wallet address"
                          onClick={() => setQrOpen(true)}
                          className="size-8 shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
                        >
                          <img src={qrButtonIcon} alt="" className="block size-8" />
                        </button>
                        <button
                          type="button"
                          aria-label="Copy Wallet Address"
                          onClick={() => void copyText(identifier)}
                          className="size-8 shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
                        >
                          <img src={copyButtonIcon} alt="" className="block size-8" />
                        </button>
                      </>
                    ) : undefined
                  }
                />
              ) : kind === "bank" ? (
                <div className="flex flex-col gap-6">
                  <ReadonlyField
                    label="Recipient Name"
                    value={selected.name}
                    actions={
                      <button
                        type="button"
                        aria-label="Copy Recipient Name"
                        onClick={() => void copyText(selected.name)}
                        className="size-8 shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
                      >
                        <img src={copyButtonIcon} alt="" className="block size-8" />
                      </button>
                    }
                  />
                  <ReadonlyField
                    label="IBAN Bank Number"
                    value={identifier || "IBAN unavailable"}
                    mono
                    actions={
                      identifier ? (
                        <button
                          type="button"
                          aria-label="Copy IBAN Bank Number"
                          onClick={() => void copyText(identifier)}
                          className="size-8 shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
                        >
                          <img src={copyButtonIcon} alt="" className="block size-8" />
                        </button>
                      ) : undefined
                    }
                  />
                </div>
              ) : (
                <p
                  data-testid="add-money-unsupported"
                  className="font-['Gilroy',sans-serif] text-base font-medium leading-6 text-brain-v1baby-blue-60"
                >
                  This account type has no funding details to show.
                </p>
              )
            )}

            {selected ? (
              <div className="flex items-center">
                <DialogPrimitive.Close asChild>
                  <PillButton variant="primary">Close</PillButton>
                </DialogPrimitive.Close>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <DialogPrimitive.Close asChild>
                  <PillButton variant="secondary">Cancel</PillButton>
                </DialogPrimitive.Close>
                {/* Choosing in the picker is what advances the flow, so Next has
                    nothing left to do once an account is set — it only ever
                    shows here, disabled, exactly as Figma 3611:34423 draws it. */}
                <PillButton variant="primary" disabled>
                  Next
                </PillButton>
              </div>
            )}

            <span data-testid="add-money-copy-status" aria-live="polite" className="sr-only">
              {copyStatus === "copied"
                ? "Copied to clipboard"
                : copyStatus === "failed"
                  ? "Couldn't copy. Select the text and copy it manually."
                  : ""}
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>

      <AccountPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        accounts={accounts}
        selectedId={accountId}
        onSelect={(account) => {
          if (fundingKind(account) === "unsupported") return;
          setAccountId(account.id);
          setPickerOpen(false);
          setCopyStatus("idle");
        }}
      />

      <DialogPrimitive.Root open={qrOpen} onOpenChange={setQrOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay data-testid="add-money-qr-overlay" className="fixed inset-0 z-[80] bg-black/60" />
          <DialogPrimitive.Content
            data-testid="add-money-qr-modal"
            data-node-id="2979:42687"
            onCloseAutoFocus={(event) => {
              // This nested root has no Radix Trigger to return to, so Escape
              // and the scrim would otherwise drop focus to the document body
              // while the outer dialog is still open.
              event.preventDefault();
              qrTriggerRef.current?.focus();
            }}
            style={{ ...centredScaled, maxHeight: scaledMaxHeight, width: FRAME_W.qr }}
            className="fixed left-1/2 top-1/2 z-[81] flex flex-col items-center justify-center gap-4 rounded-modal border border-solid border-brain-v1stroke-2 bg-brain-v1highlight-dropdown-bg p-6 focus:outline-none"
          >
            <DialogPrimitive.Title className="sr-only">Wallet address QR code</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Scan this code to copy the selected wallet address.</DialogPrimitive.Description>
            {identifier && (
              <QRCodeSVG
                value={identifier}
                title={`QR code for wallet address ${identifier}`}
                size={274}
                // Figma draws the code in Baby Blue 30 straight onto the popup,
                // not as a white tile — 2979:42688 has no background fill.
                bgColor="transparent"
                fgColor="#414965"
                level="M"
                className="block h-[274px] w-[274px] shrink-0"
              />
            )}
            <p className="max-w-full truncate font-['JetBrains_Mono',monospace] text-[20px] font-medium leading-6 text-white">{identifier ? shortenIdentifier(identifier) : ""}</p>
            <button
              type="button"
              onClick={() => void copyText(identifier)}
              className="flex w-full items-center justify-center gap-2 rounded-pill bg-brain-v1dark-orange px-5 py-2 font-['Gilroy',sans-serif] text-base font-semibold leading-5 text-brain-v1light-orange"
            >
              <img src={copyGlyphIcon} alt="" className="block size-6" />
              {copyStatus === "copied"
                ? "Address Copied"
                : copyStatus === "failed"
                  ? "Couldn't Copy"
                  : "Copy Address"}
            </button>
            <span aria-live="polite" className="sr-only">
              {copyStatus === "copied"
                ? "Wallet address copied to clipboard"
                : copyStatus === "failed"
                  ? "Couldn't copy. Select the address and copy it manually."
                  : ""}
            </span>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </DialogPrimitive.Root>
  );
}
