import { useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { QRCodeSVG } from "qrcode.react";
import closeIcon from "@assets/Close_1783293571882.png";
import addIcon from "@assets/add_1789001100272.png";
import qrIcon from "@assets/qr_1789144401960.png";
import copyIcon from "@assets/copy_1789144401961.png";
import dropdownIcon from "@assets/dropdown_1789144401961.png";
import walletBankIcon from "@assets/wallet-icon-bank-32.svg";
import walletAgentIcon from "@assets/wallet-icon-agent-32.svg";
import { isAgentAccount, type BrainAccountDTO } from "@/lib/brainAccounts";
import { shortenIdentifier } from "@/lib/accountsPanelFormat";

type Step = "select" | "details";

interface AddMoneyFlowProps {
  accounts: BrainAccountDTO[];
}

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

function ModalHeader() {
  return (
    <div className="relative h-14 w-full shrink-0 border-b border-solid border-brain-v1stroke-2">
      <DialogPrimitive.Close
        aria-label="Close Add Money"
        className="absolute left-[11px] top-[11px] size-8 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
      >
        <img src={closeIcon} alt="" className="block size-8" />
      </DialogPrimitive.Close>
    </div>
  );
}

function AccountSelect({
  accounts,
  value,
  onChange,
}: {
  accounts: BrainAccountDTO[];
  value: string;
  onChange: (id: string) => void;
}) {
  const selected = accounts.find((account) => account.id === value);
  return (
    <div className="relative h-14 w-full rounded-row bg-brain-v1baby-blue-15">
      {selected && (
        <img
          src={fundingKind(selected) === "wallet" ? walletAgentIcon : walletBankIcon}
          alt=""
          className="pointer-events-none absolute left-4 top-3 z-10 size-8"
        />
      )}
      <select
        data-testid="add-money-account-select"
        aria-label="Account to fund"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`h-full w-full cursor-pointer appearance-none rounded-row bg-transparent pr-12 font-['Gilroy',sans-serif] font-medium text-brain-v1baby-blue-100 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brain-v1purple ${
          selected ? "pl-14 text-base leading-5" : "pl-4 text-[20px] leading-6"
        }`}
      >
        <option value="" className="bg-brain-v1highlight-dropdown-bg">Select Account</option>
        {accounts.map((account) => {
          const unsupported = fundingKind(account) === "unsupported";
          return (
            <option
              key={account.id}
              value={account.id}
              disabled={unsupported}
              className="bg-brain-v1highlight-dropdown-bg"
            >
              {unsupported ? `${account.name} — no funding details` : account.name}
            </option>
          );
        })}
      </select>
      <img src={dropdownIcon} alt="" className="pointer-events-none absolute right-3 top-3 size-8" />
    </div>
  );
}

function PrimaryButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-12 min-w-0 flex-1 rounded-full bg-brain-v1dark-orange px-4 font-['Mont',sans-serif] text-lg font-semibold leading-6 tracking-[-0.72px] text-brain-v1light-orange disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function ReadonlyField({
  label,
  value,
  mono,
  onCopy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onCopy?: () => void;
}) {
  return (
    <div className="flex w-full flex-col gap-1">
      <p className="font-['Gilroy',sans-serif] text-base font-semibold leading-6 text-brain-v1baby-blue-60">{label}</p>
      <div className="flex h-14 items-center gap-2 rounded-row bg-brain-v1baby-blue-15 px-4">
        <p className={`min-w-0 flex-1 truncate text-[20px] leading-6 text-white ${mono ? "font-['JetBrains_Mono',monospace]" : "font-['Gilroy',sans-serif] font-medium"}`}>
          {value}
        </p>
        {onCopy && (
          <button
            type="button"
            aria-label={`Copy ${label}`}
            onClick={onCopy}
            className="size-8 shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
          >
            <img src={copyIcon} alt="" className="block size-8" />
          </button>
        )}
      </div>
    </div>
  );
}

export function AddMoneyFlow({ accounts }: AddMoneyFlowProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("select");
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
      setStep("select");
      setAccountId("");
      setCopyStatus("idle");
    } else {
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
          data-node-id={step === "select" ? "3608:34362" : wallet ? "2979:41718" : "6543:55103"}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
          className="fixed left-1/2 top-1/2 z-[71] flex max-h-[calc(100vh-16px)] w-[400px] max-w-[calc(100vw-16px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-modal border border-solid border-brain-v1stroke-2 bg-brain-v1highlight-dropdown-bg focus:outline-none"
        >
          <DialogPrimitive.Title className="sr-only">Add Money</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Choose an account and view the information needed to fund it.</DialogPrimitive.Description>
          <ModalHeader />

          <div className="flex flex-col gap-6 px-[39px] pb-7 pt-[23px]">
            <div>
              <p className="font-['Gilroy',sans-serif] text-[32px] font-semibold leading-10 text-brain-v1baby-blue-100">Add Money</p>
              <p className="font-['Gilroy',sans-serif] text-[22px] font-medium leading-7 text-brain-v1baby-blue-60">What account should we fund?</p>
            </div>

            <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />

            {step === "details" && selected && (
              kind === "wallet" ? (
                <ReadonlyField
                  label="Wallet Address"
                  value={identifier ? shortenIdentifier(identifier) : "Address unavailable"}
                  mono
                  onCopy={identifier ? () => void copyText(identifier) : undefined}
                />
              ) : kind === "bank" ? (
                <div className="flex flex-col gap-6">
                  <ReadonlyField
                    label="Recipient Name"
                    value={selected.name}
                    onCopy={() => void copyText(selected.name)}
                  />
                  <ReadonlyField
                    label="IBAN Bank Number"
                    value={identifier || "IBAN unavailable"}
                    mono
                    onCopy={identifier ? () => void copyText(identifier) : undefined}
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

            {step === "select" ? (
              <div className="flex gap-4">
                <DialogPrimitive.Close asChild>
                  <button type="button" className="h-12 min-w-0 flex-1 rounded-full bg-brain-v1baby-blue-15 px-4 font-['Mont',sans-serif] text-lg font-semibold leading-6 tracking-[-0.72px] text-brain-v1baby-blue-60">
                    Cancel
                  </button>
                </DialogPrimitive.Close>
                <PrimaryButton
                  disabled={!selected || kind === "unsupported"}
                  onClick={() => setStep("details")}
                >
                  Next
                </PrimaryButton>
              </div>
            ) : wallet ? (
              <div className="flex flex-col gap-3">
                {identifier && (
                  <button
                    ref={qrTriggerRef}
                    type="button"
                    data-testid="add-money-show-qr"
                    onClick={() => setQrOpen(true)}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brain-v1dark-purple px-5 font-['Gilroy',sans-serif] text-base font-semibold leading-5 text-brain-v1purple"
                  >
                    <img src={qrIcon} alt="" className="size-6" />
                    Show QR Code
                  </button>
                )}
                <DialogPrimitive.Close asChild><PrimaryButton>Close</PrimaryButton></DialogPrimitive.Close>
              </div>
            ) : (
              <DialogPrimitive.Close asChild><PrimaryButton>Close</PrimaryButton></DialogPrimitive.Close>
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
            className="fixed left-1/2 top-1/2 z-[81] flex w-[322px] max-w-[calc(100vw-16px)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-4 rounded-modal border border-solid border-brain-v1stroke-2 bg-brain-v1highlight-dropdown-bg p-6 focus:outline-none"
          >
            <DialogPrimitive.Title className="sr-only">Wallet address QR code</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Scan this code to copy the selected wallet address.</DialogPrimitive.Description>
            {identifier && (
              <QRCodeSVG
                value={identifier}
                title={`QR code for wallet address ${identifier}`}
                size={274}
                bgColor="#ffffff"
                fgColor="#000000"
                level="M"
                className="h-auto w-full rounded-[4px]"
              />
            )}
            <p className="max-w-full truncate font-['JetBrains_Mono',monospace] text-[20px] font-medium leading-6 text-white">{identifier ? shortenIdentifier(identifier) : ""}</p>
            <button
              type="button"
              onClick={() => void copyText(identifier)}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-brain-v1dark-orange px-5 font-['Gilroy',sans-serif] text-base font-semibold leading-5 text-brain-v1light-orange"
            >
              <img src={copyIcon} alt="" className="size-6" />
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