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

function accountIsWallet(account: BrainAccountDTO): boolean {
  const identifier = account.external_account_id?.trim() ?? "";
  return account.account_type === "onchain" || (isAgentAccount(account) && /^0x/i.test(identifier));
}

function accountLabel(account: BrainAccountDTO): string {
  if (accountIsWallet(account)) return isAgentAccount(account) ? "Agent Wallet" : "Your Wallet";
  return "Bank Account";
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
          src={accountIsWallet(selected) ? walletAgentIcon : walletBankIcon}
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
        {accounts.map((account) => (
          <option key={account.id} value={account.id} className="bg-brain-v1highlight-dropdown-bg">
            {account.name}
          </option>
        ))}
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
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const selected = useMemo(() => accounts.find((account) => account.id === accountId), [accounts, accountId]);

  const reset = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setStep("select");
      setAccountId("");
      setCopied(false);
    } else {
      setQrOpen(false);
      if (copyTimer.current != null) window.clearTimeout(copyTimer.current);
      // The trigger is hand-rendered rather than a separate Radix component in
      // the caller. Restore it explicitly after the portal starts unmounting so
      // Escape, the scrim, and either Close control all return to the same place.
      queueMicrotask(() => triggerRef.current?.focus());
    }
  };

  const copyAddress = async () => {
    const address = selected?.external_account_id?.trim();
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      if (copyTimer.current != null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const identifier = selected?.external_account_id?.trim() ?? "";
  const wallet = selected ? accountIsWallet(selected) : false;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={reset}>
      <DialogPrimitive.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          data-testid="button-account-add"
          aria-label="Add money to an account"
          disabled={accounts.length === 0}
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
              wallet ? (
                <ReadonlyField
                  label="Wallet Address"
                  value={identifier ? shortenIdentifier(identifier) : "Address unavailable"}
                  mono
                  onCopy={identifier ? copyAddress : undefined}
                />
              ) : (
                <div className="flex flex-col gap-6">
                  <ReadonlyField label="Recipient Name" value={selected.name} onCopy={() => void navigator.clipboard.writeText(selected.name)} />
                  <ReadonlyField label="IBAN Bank Number" value={identifier || "IBAN unavailable"} mono onCopy={identifier ? () => void navigator.clipboard.writeText(identifier) : undefined} />
                </div>
              )
            )}

            {step === "select" ? (
              <div className="flex gap-4">
                <DialogPrimitive.Close asChild>
                  <button type="button" className="h-12 min-w-0 flex-1 rounded-full bg-brain-v1baby-blue-15 px-4 font-['Mont',sans-serif] text-lg font-semibold leading-6 tracking-[-0.72px] text-brain-v1baby-blue-60">
                    Cancel
                  </button>
                </DialogPrimitive.Close>
                <PrimaryButton disabled={!selected} onClick={() => setStep("details")}>Next</PrimaryButton>
              </div>
            ) : wallet ? (
              <div className="flex flex-col gap-3">
                {identifier && (
                  <button
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
                <span aria-live="polite" className="sr-only">{copied ? "Wallet address copied" : ""}</span>
              </div>
            ) : (
              <DialogPrimitive.Close asChild><PrimaryButton>Close</PrimaryButton></DialogPrimitive.Close>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>

      <DialogPrimitive.Root open={qrOpen} onOpenChange={setQrOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay data-testid="add-money-qr-overlay" className="fixed inset-0 z-[80] bg-black/60" />
          <DialogPrimitive.Content
            data-testid="add-money-qr-modal"
            data-node-id="2979:42687"
            className="fixed left-1/2 top-1/2 z-[81] flex w-[322px] max-w-[calc(100vw-16px)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-4 rounded-modal border border-solid border-brain-v1stroke-2 bg-brain-v1highlight-dropdown-bg p-6 focus:outline-none"
          >
            <DialogPrimitive.Title className="sr-only">Wallet address QR code</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Scan this code to copy the selected wallet address.</DialogPrimitive.Description>
            {identifier && <QRCodeSVG value={identifier} size={274} bgColor="#ffffff" fgColor="#000000" level="M" className="h-auto w-full rounded-[4px]" />}
            <p className="max-w-full truncate font-['JetBrains_Mono',monospace] text-[20px] font-medium leading-6 text-white">{identifier ? shortenIdentifier(identifier) : ""}</p>
            <button
              type="button"
              onClick={copyAddress}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-brain-v1dark-orange px-5 font-['Gilroy',sans-serif] text-base font-semibold leading-5 text-brain-v1light-orange"
            >
              <img src={copyIcon} alt="" className="size-6" />
              {copied ? "Address Copied" : "Copy Address"}
            </button>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </DialogPrimitive.Root>
  );
}