// @vitest-environment jsdom
/**
 * Behavioural tests for the Add Money modal.
 *
 * The sibling suite (pages/sections/accounts-panel-selection.test.tsx) already
 * pins the flow as the panel renders it, against the panel's shared account
 * fixture. What that fixture cannot cheaply express is the set of ledger
 * account kinds the panel happens not to hold: `card`, `loan`,
 * `line_of_credit` and `payment_processor` are all legal `AccountKind` values
 * (client/src/lib/brainAccounts.ts), and adding one to the shared fixture
 * would move the asset-row and currency assertions in a dozen unrelated tests.
 *
 * AddMoneyFlow takes its accounts as a prop, so those cases are driven here
 * directly. The thing being defended is narrow and worth stating plainly: an
 * account with no IBAN and no wallet address must never be presented as though
 * it had one. Before this suite existed, every non-bank, non-onchain kind fell
 * through to the bank branch and its `external_account_id` — a card or
 * processor reference — was captioned "IBAN Bank Number".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { AddMoneyFlow } from "./AddMoneyFlow";
import type { BrainAccountDTO } from "@/lib/brainAccounts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BANK: BrainAccountDTO = {
  id: "acct_bank",
  name: "Operating",
  account_type: "bank_checking",
  currency: "USD",
  institution: "First Meridian Bank",
  external_account_id: "AE070331234567890123456",
};

const WALLET: BrainAccountDTO = {
  id: "acct_wallet",
  name: "Treasury Wallet",
  account_type: "onchain",
  currency: "ETH",
  institution: "Base Sepolia",
  external_account_id: "0x361978A2C737dB5Ae78746555760695ae5B49Aa2",
};

/** A card's external id is a card reference. It cannot receive a transfer. */
const CARD: BrainAccountDTO = {
  id: "acct_card",
  name: "Corporate Card",
  account_type: "card",
  currency: "USD",
  institution: "First Meridian Bank",
  external_account_id: "4111111111111111",
};

const PROCESSOR: BrainAccountDTO = {
  id: "acct_stripe",
  name: "Stripe Balance",
  account_type: "payment_processor",
  currency: "USD",
  institution: "Stripe",
  external_account_id: "acct_1QxyzPROCESSOR",
};

let container: HTMLDivElement;
let root: Root;

function render(accounts: BrainAccountDTO[]) {
  act(() => {
    root.render(<AddMoneyFlow accounts={accounts} />);
  });
}

function q(testId: string): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
}

function click(testId: string) {
  const el = q(testId);
  expect(el, `missing [data-testid="${testId}"]`).not.toBeNull();
  act(() => {
    el!.click();
  });
}

function portalButton(label: string): HTMLButtonElement {
  const button = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  expect(button, `missing button labelled "${label}"`).toBeDefined();
  return button!;
}

/**
 * React installs a value tracker on the input node, so assigning `.value`
 * directly and firing `input` is swallowed as a no-op change. Go through the
 * prototype setter the tracker wraps.
 */
function type(testId: string, value: string) {
  const input = q(testId) as HTMLInputElement;
  expect(input, `missing [data-testid="${testId}"]`).not.toBeNull();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Opening the field opens the picker popup; the picker is where a choice is made. */
function openPicker() {
  click("add-money-account-select");
}

function optionFor(accountId: string): HTMLButtonElement {
  const option = q(`add-money-picker-option-${accountId}`) as HTMLButtonElement | null;
  expect(option, `missing picker row for ${accountId}`).not.toBeNull();
  return option!;
}

/** Choosing in the picker is what advances the flow — there is no Next to press. */
function choose(accountId: string) {
  openPicker();
  click(`add-money-picker-option-${accountId}`);
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("which accounts can be funded", () => {
  it("offers bank and wallet accounts as selectable", () => {
    render([BANK, WALLET, CARD]);
    click("button-account-add");
    expect(document.body.querySelector('[aria-label="Close Add Money"]')).toBeNull();
    openPicker();
    expect(optionFor("acct_bank").getAttribute("aria-disabled")).toBeNull();
    expect(optionFor("acct_wallet").getAttribute("aria-disabled")).toBeNull();
  });

  it("lists a card account but will not let it be chosen, and says why", () => {
    render([BANK, CARD]);
    click("button-account-add");
    openPicker();
    const option = optionFor("acct_card");
    // Listed, not hidden — the account still exists and a reader looking for
    // it should find it rather than wonder where it went.
    expect(option.getAttribute("aria-disabled")).toBe("true");
    expect(option.textContent).toContain("No funding details");
  });

  it("never captions a card's reference as an IBAN", () => {
    render([BANK, CARD]);
    click("button-account-add");
    // The row is aria-disabled rather than `disabled`, so the click really is
    // delivered — this proves the handler refuses, not just the attribute.
    choose("acct_card");

    const modal = q("add-money-modal");
    expect(modal?.textContent).not.toContain("IBAN");
    expect(modal?.textContent).not.toContain("4111111111111111");
    // Nothing was selected, so the flow is still on its first step.
    expect(modal?.getAttribute("data-node-id")).toBe("3608:34362");
  });

  it("treats a payment-processor balance the same way", () => {
    render([BANK, PROCESSOR]);
    click("button-account-add");
    openPicker();
    expect(optionFor("acct_stripe").getAttribute("aria-disabled")).toBe("true");
    choose("acct_stripe");
    expect(q("add-money-modal")?.getAttribute("data-node-id")).toBe("3608:34362");
  });

  it("still reaches the details step for a real bank account", () => {
    render([BANK, CARD]);
    click("button-account-add");
    choose("acct_bank");
    const modal = q("add-money-modal");
    expect(modal?.getAttribute("data-node-id")).toBe("6543:55103");
    expect(modal?.textContent).toContain("IBAN Bank Number");
    expect(modal?.textContent).toContain("AE070331234567890123456");
  });

  it("filters the picker by name and by identifier", () => {
    render([BANK, WALLET]);
    click("button-account-add");
    openPicker();
    type("add-money-picker-search", "0x361978");
    expect(q("add-money-picker-option-acct_wallet")).not.toBeNull();
    expect(q("add-money-picker-option-acct_bank")).toBeNull();

    type("add-money-picker-search", "nothing here");
    expect(q("add-money-picker-empty")?.textContent).toContain("No accounts match");
  });

  it("still opens, and explains itself, when nothing on the list can be funded", () => {
    // A dead Add button says nothing. The reason each account cannot be
    // funded is written on its picker row, so the flow has to be reachable
    // for a reader to ever see it.
    render([CARD, PROCESSOR]);
    expect((q("button-account-add") as HTMLButtonElement).disabled).toBe(false);
    click("button-account-add");
    openPicker();
    expect(optionFor("acct_card").textContent).toContain("No funding details");
    expect(optionFor("acct_stripe").textContent).toContain("No funding details");
  });

  it("disables Add only when there are no accounts at all", () => {
    render([]);
    expect((q("button-account-add") as HTMLButtonElement).disabled).toBe(true);
  });

  // Twice now the picker has shipped at a size nobody asked for, because
  // nothing failed when it drifted. The frame is a fixed 320 x 424 and the
  // rows scroll inside it, so pin both numbers and the scroll together. This
  // reads the inline style rather than a layout, which jsdom does not do.
  it("keeps the picker at its fixed frame size, with the list scrolling inside", () => {
    render([BANK, WALLET, CARD, PROCESSOR]);
    click("button-account-add");
    openPicker();

    const picker = q("add-money-picker") as HTMLElement;
    expect(picker.style.width).toBe("320px");
    expect(picker.style.height).toBe("424px");

    // The rows list, not the popup, is what absorbs a long account list.
    const rows = optionFor("acct_bank").parentElement as HTMLElement;
    expect(rows.className).toContain("overflow-y-auto");
    expect(rows.className).toContain("flex-1");
  });

  it("scales only step 1 to its 301.5px painted width", () => {
    render([BANK, WALLET]);
    click("button-account-add");

    const modal = q("add-money-modal") as HTMLElement;
    const modalScale = Number(modal.style.transform.match(/scale\(([^)]+)\)/)?.[1]);
    expect(Number.parseFloat(modal.style.width) * modalScale).toBeCloseTo(301.5, 8);

    choose("acct_bank");
    expect((q("add-money-modal") as HTMLElement).style.transform).toBe("translate(-50%, -50%)");
  });
});

describe("focus when the picker closes", () => {
  /**
   * The picker is a controlled Radix root with no Dialog.Trigger, so Radix
   * suppresses its own restoration and focus lands on <body> unless the
   * component puts it back. Every close path is checked, because they run
   * through different Radix code and only one of them was ever exercised.
   */
  /**
   * Restoration is deferred with a timer (see the comment on the picker's
   * onCloseAutoFocus), so flushing microtasks alone reads the frame before it
   * happens and every one of these would pass for the wrong reason.
   */
  async function settle() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }

  it("returns focus to the field after choosing an account", async () => {
    render([BANK]);
    click("button-account-add");
    const field = q("add-money-account-select") as HTMLButtonElement;
    openPicker();
    click("add-money-picker-option-acct_bank");
    await settle();
    expect(q("add-money-picker")).toBeNull();
    expect(document.activeElement).toBe(q("add-money-account-select"));
    expect(q("add-money-account-select")).toBe(field);
  });

  it("returns focus to the field on Escape, leaving the modal open", async () => {
    render([BANK]);
    click("button-account-add");
    openPicker();
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await settle();
    // Escape closes only the topmost layer.
    expect(q("add-money-picker")).toBeNull();
    expect(q("add-money-modal")).not.toBeNull();
    expect(document.activeElement).toBe(q("add-money-account-select"));
  });

  it("returns focus to the field from the close glyph", async () => {
    render([BANK]);
    click("button-account-add");
    openPicker();
    const close = document.body.querySelector<HTMLButtonElement>('[aria-label="Close account picker"]');
    expect(close).not.toBeNull();
    act(() => close!.click());
    await settle();
    expect(q("add-money-picker")).toBeNull();
    expect(document.activeElement).toBe(q("add-money-account-select"));
  });
});

describe("copying funding details", () => {
  function stubClipboard(impl: (() => Promise<void>) | null) {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: impl ? { writeText: vi.fn(impl) } : undefined,
    });
  }

  async function settle() {
    await act(async () => {
      await Promise.resolve();
    });
  }

  it("announces a successful copy", async () => {
    stubClipboard(() => Promise.resolve());
    render([BANK]);
    click("button-account-add");
    choose("acct_bank");

    const copy = document.body.querySelector<HTMLButtonElement>('[aria-label="Copy IBAN Bank Number"]');
    expect(copy).not.toBeNull();
    act(() => copy!.click());
    await settle();
    expect(q("add-money-copy-status")?.textContent).toContain("Copied");
  });

  it("says so when the clipboard rejects, instead of looking like it worked", async () => {
    stubClipboard(() => Promise.reject(new Error("denied")));
    render([BANK]);
    click("button-account-add");
    choose("acct_bank");

    const copy = document.body.querySelector<HTMLButtonElement>('[aria-label="Copy IBAN Bank Number"]');
    act(() => copy!.click());
    await settle();
    expect(q("add-money-copy-status")?.textContent).toContain("Couldn't copy");
  });

  it("survives a browser with no clipboard API at all", async () => {
    // Insecure origins expose no navigator.clipboard. An unguarded call throws
    // a TypeError straight out of the click handler.
    stubClipboard(null);
    render([BANK]);
    click("button-account-add");
    choose("acct_bank");

    const copy = document.body.querySelector<HTMLButtonElement>('[aria-label="Copy IBAN Bank Number"]');
    expect(() => act(() => copy!.click())).not.toThrow();
    await settle();
    expect(q("add-money-copy-status")?.textContent).toContain("Couldn't copy");
  });
});

describe("the QR overlay", () => {
  it("gives the generated code an accessible name and returns focus on close", async () => {
    render([WALLET]);
    click("button-account-add");
    choose("acct_wallet");

    const qrTrigger = q("add-money-show-qr") as HTMLButtonElement;
    act(() => qrTrigger.click());

    const qr = q("add-money-qr-modal");
    expect(qr).not.toBeNull();
    expect(qr?.querySelector("svg title")?.textContent).toContain(WALLET.external_account_id!);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Escape closes only the QR overlay; the funding details stay open and
    // focus lands back on the control that opened it.
    expect(q("add-money-qr-modal")).toBeNull();
    expect(q("add-money-modal")).not.toBeNull();
    expect(document.activeElement).toBe(qrTrigger);
  });
});
