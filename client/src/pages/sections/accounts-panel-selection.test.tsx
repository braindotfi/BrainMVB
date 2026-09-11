// @vitest-environment jsdom
/**
 * Rendering tests for selecting an account in the right-hand accounts rail.
 *
 * The sibling suite (accounts-panel-figma-guards.test.ts) is a source scan. It
 * can prove a handler is spelled correctly in the file and still pass while the
 * wiring behind it is dead — an unreachable branch, a value that never reaches
 * the card, a threshold that swallows every gesture. So the behaviour the user
 * actually asked for is pinned here, against a real render:
 *
 *   - the card shows the SELECTED account, and its identifier caption is named
 *     from that account's kind rather than a fixed string;
 *   - tapping a pagination dot, pressing an arrow key on it, and swiping the
 *     card all change which account that is;
 *   - a short drag is not a swipe;
 *   - the transaction list under the card is that account's activity only;
 *   - an agent account renders the green card, and nothing else does;
 *   - transactions the feed never attributed to an account are declared even
 *     when the resulting list is empty, which is the case a reader is most
 *     likely to misread as "there is nothing here".
 *
 * The two ledger reads are mocked at the hook so the component renders from
 * fixed rows with no network and no polling.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ACCOUNTS = [
  {
    id: "acct_agent",
    name: "Payment Agent",
    account_type: "agent",
    currency: "USD",
    institution: "Brain",
    external_account_id: "1610040032016993",
    current_balance: "2040.30000000",
    status: "active",
  },
  {
    id: "acct_wallet",
    name: "Brightline Treasury Wallet",
    account_type: "onchain",
    currency: "ETH",
    institution: "Base Sepolia",
    external_account_id: "0x361978A2C737dB5Ae78746555760695ae5B49Aa2",
    current_balance: "0.00500000",
    status: "active",
  },
  {
    id: "acct_operating",
    name: "Operating",
    account_type: "bank_checking",
    currency: "USD",
    institution: "First Meridian Bank",
    external_account_id: "AE070331234567890123456",
    current_balance: "1687200.00000000",
    status: "active",
  },
];

const TRANSACTIONS = [
  {
    id: "tx_agent_in",
    amount: "48000.00000000",
    currency: "USD",
    direction: "inflow",
    transaction_date: "2026-08-26T00:00:00.000Z",
    description_normalized: "BigCo Industries payment",
    account_id: "acct_agent",
  },
  {
    id: "tx_operating_out",
    amount: "900.00000000",
    currency: "USD",
    direction: "outflow",
    transaction_date: "2026-08-20T09:05:00.000Z",
    description_normalized: "Office rent",
    account_id: "acct_operating",
  },
  {
    id: "tx_unlinked_null",
    amount: "77.00000000",
    currency: "USD",
    direction: "inflow",
    transaction_date: "2026-08-19T09:05:00.000Z",
    description_normalized: "Unlinked movement",
    account_id: null,
  },
  {
    id: "tx_unlinked_blank",
    amount: "12.00000000",
    currency: "USD",
    direction: "inflow",
    transaction_date: "2026-08-18T09:05:00.000Z",
    description_normalized: "Blank account id",
    account_id: "",
  },
];

/**
 * The accounts read is switchable so the rail can be rendered in all four of
 * the states it distinguishes — a selection, a read still running, a read that
 * failed, and a read that finished and returned nothing.
 */
type AccountsReadState = "rows" | "loading" | "failed" | "empty";
let accountsReadState: AccountsReadState = "rows";

vi.mock("@/lib/ledgerRead", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/ledgerRead")>();
  return {
    ...real,
    usePagedLedgerRead: (path: string) => {
      if (path.includes("transactions")) {
        return { read: { rows: TRANSACTIONS, complete: true }, failed: false, ingesting: false };
      }
      if (accountsReadState === "loading") return { read: null, failed: false, ingesting: false };
      if (accountsReadState === "failed") return { read: null, failed: true, ingesting: false };
      const rows = accountsReadState === "empty" ? [] : ACCOUNTS;
      return { read: { rows, complete: true }, failed: false, ingesting: false };
    },
  };
});

import { AccountsPanel } from "./AccountsPanel";

let container: HTMLDivElement;
let root: Root;
let toggles: number;

function render() {
  // A test that switches the read state re-renders from scratch, so drop any
  // instance already standing rather than leaking it past the test.
  if (root) {
    act(() => root.unmount());
    container.remove();
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  toggles = 0;
  act(() => {
    root.render(<AccountsPanel collapsed={false} onToggle={() => { toggles += 1; }} />);
  });
}

/**
 * Re-render the SAME component instance collapsed, so whichever account the
 * card was showing is still the selected one. That is the only way to reach
 * the rail's bank colourway, since the rail itself offers no way to switch.
 */
function collapse() {
  act(() => {
    root.render(<AccountsPanel collapsed onToggle={() => { toggles += 1; }} />);
  });
}

function click(testId: string) {
  act(() => {
    q(testId)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/**
 * The two artworks a rail button carries: the one shown at rest and the one
 * CSS reveals on hover. Both are in the DOM, distinguished by their classes,
 * so the pairing is read off the classes rather than off document order.
 */
function railIcons(testId: string): { normal: string; active: string } {
  const images = Array.from(q(testId)!.querySelectorAll("img"));
  const atRest = images.find((img) => img.className.includes("group-hover:hidden"));
  const onHover = images.find((img) => img.className.includes("group-hover:block"));
  return { normal: atRest?.getAttribute("src") ?? "", active: onHover?.getAttribute("src") ?? "" };
}

/**
 * Vite inlines these SVGs as data URLs, so the filename is gone by the time
 * the icon reaches the DOM. Assert on what is actually drawn instead: the disc
 * colour and the glyph. That is the claim anyway — the rail has to be in the
 * colourway of the selected card, and lit on hover.
 */
const DATA_URL_PREFIX = "data:image/svg+xml,";
function svgOf(src: string): string {
  return src.startsWith(DATA_URL_PREFIX) ? decodeURIComponent(src.slice(DATA_URL_PREFIX.length)) : src;
}

function discFill(src: string): string {
  return svgOf(src).match(/<circle[^>]*fill='(#[0-9A-Fa-f]{6})'/)?.[1] ?? "";
}

/** Deep disc with a bright glyph at rest; the two swap when it lights up. */
const RAIL_TONES = {
  bank: { deep: "#4A2300", bright: "#FF9400" },
  agent: { deep: "#123509", bright: "#2A6B22" },
};

function expectColourway(testId: string, tone: keyof typeof RAIL_TONES) {
  const { normal, active } = railIcons(testId);
  expect(discFill(normal)).toBe(RAIL_TONES[tone].deep);
  expect(discFill(active)).toBe(RAIL_TONES[tone].bright);
  // The glyph inverts with the disc, so the pair is never the same image.
  expect(normal).not.toBe(active);
  expect(svgOf(active)).toContain(RAIL_TONES[tone].deep);
}

function q(testId: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${testId}"]`);
}

/**
 * The rail popups render through a Radix portal, so they land on
 * document.body rather than inside `container`. Anything asserted about a
 * popup has to be looked up here, or it reads as absent.
 */
function qPortal(testId: string): HTMLElement | null {
  return document.body.querySelector(`[data-testid="${testId}"]`);
}

function clickPortal(testId: string) {
  act(() => {
    qPortal(testId)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function text(testId: string): string {
  return q(testId)?.textContent?.trim() ?? "";
}

function dots(): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>('[data-testid="account-card-pagination"] button'),
  );
}

function openTransactions() {
  const tab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((t) =>
    t.textContent?.includes("Transactions"),
  );
  act(() => {
    tab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** Drag the card horizontally by `dx` pixels, the way a thumb would. */
function dragCard(dx: number) {
  const card = q("account-card")!;
  const start = 200;
  const opts = (clientX: number) => ({ bubbles: true, clientX, clientY: 100 });
  act(() => {
    card.dispatchEvent(new (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent("pointerdown", opts(start)));
    card.dispatchEvent(new (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent("pointerup", opts(start + dx)));
  });
}

beforeEach(() => {
  // jsdom has no PointerEvent; the panel only reads clientX/clientY off it.
  if (!(window as unknown as { PointerEvent?: unknown }).PointerEvent) {
    (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  }
  accountsReadState = "rows";
  render();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  accountsReadState = "rows";
});

describe("selecting an account", () => {
  it("gives one dot per account and marks the selected one", () => {
    expect(dots()).toHaveLength(ACCOUNTS.length);
    expect(dots().map((d) => d.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    expect(dots().map((d) => d.getAttribute("aria-label"))).toEqual(ACCOUNTS.map((a) => a.name));
  });

  it("moves the card to the account whose dot was tapped", () => {
    act(() => {
      dots()[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(text("text-account-identifier")).toContain("AE0703");
    expect(text("text-account-name")).toBe("Operating");
    expect(dots().map((d) => d.getAttribute("aria-selected"))).toEqual(["false", "false", "true"]);
  });

  it("moves the card with the arrow keys", () => {
    act(() => {
      dots()[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(text("text-account-name")).toBe("Brightline Treasury Wallet");
    act(() => {
      dots()[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    expect(text("text-account-name")).toBe("Payment Agent");
  });

  it("moves the card on a swipe, in the direction of the swipe", () => {
    dragCard(-120); // right-to-left: forward
    expect(text("text-account-name")).toBe("Brightline Treasury Wallet");
    dragCard(120); // left-to-right: back
    expect(text("text-account-name")).toBe("Payment Agent");
  });

  it("does not treat a short drag as a swipe", () => {
    dragCard(-15);
    expect(text("text-account-name")).toBe("Payment Agent");
  });

  it("stops at the ends instead of wrapping", () => {
    dragCard(120); // already first
    expect(text("text-account-name")).toBe("Payment Agent");
    act(() => {
      dots()[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    dragCard(-120); // already last
    expect(text("text-account-name")).toBe("Operating");
  });

  it("picks the account from the drop-down too", () => {
    act(() => {
      q("button-account-selector")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const row = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')).find(
      (r) => r.textContent?.includes("Brightline"),
    );
    expect(row).toBeTruthy();
    act(() => {
      row!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(text("text-account-name")).toBe("Brightline Treasury Wallet");
  });
});

describe("the card follows the selected account", () => {
  it("names the identifier from that account's kind", () => {
    // The agent account states no ledger kind we can name, so the caption stays
    // neutral rather than guessing an instrument.
    expect(text("text-account-identifier-label")).toBe("Account Identifier");
    act(() => {
      dots()[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(text("text-account-identifier-label")).toBe("Crypto Wallet Address");
    act(() => {
      dots()[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(text("text-account-identifier-label")).toBe("Bank Account Number");
  });

  it("uses the green variant for an agent account and only for that", () => {
    expect(q("account-card")?.className).toContain("bg-brain-v1dark-green");
    act(() => {
      dots()[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(q("account-card")?.className).toContain("bg-brain-v1dark-orange");
    expect(q("account-card")?.className).not.toContain("bg-brain-v1dark-green");
  });
});

describe("transactions under the card", () => {
  it("shows only the selected account's activity", () => {
    openTransactions();
    expect(q("row-transaction-tx_agent_in")).toBeTruthy();
    expect(q("row-transaction-tx_operating_out")).toBeNull();
    act(() => {
      dots()[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(q("row-transaction-tx_operating_out")).toBeTruthy();
    expect(q("row-transaction-tx_agent_in")).toBeNull();
  });

  it("never shows an unattributed transaction under an account", () => {
    openTransactions();
    for (const dot of [0, 1, 2]) {
      act(() => {
        dots()[dot].dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(q("row-transaction-tx_unlinked_null")).toBeNull();
      expect(q("row-transaction-tx_unlinked_blank")).toBeNull();
    }
  });

  it("counts a blank account id as unattributed, not as an account", () => {
    openTransactions();
    expect(text("accounts-panel-unattributed-transactions")).toContain("2 transactions");
  });

  it("still declares the unattributed rows when the account's list is empty", () => {
    // The wallet has no transactions at all. An "empty" list here would
    // otherwise read as "nothing happened", while two rows are being withheld.
    openTransactions();
    act(() => {
      dots()[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(q("accounts-panel-transactions-empty")).toBeTruthy();
    expect(text("accounts-panel-unattributed-transactions")).toContain("2 transactions");
  });

  it("names the selected account in the empty state", () => {
    openTransactions();
    act(() => {
      dots()[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(text("accounts-panel-transactions-empty")).toContain("Brightline Treasury Wallet");
  });
});

describe("the collapsed rail", () => {
  it("carries the wallet avatar, the three actions and the two tabs", () => {
    collapse();
    expect(q("button-accounts-expand")).toBeTruthy();
    expect(q("button-collapsed-wallet")).toBeTruthy();
    for (const action of ["add", "send", "exchange"]) {
      expect(q(`button-collapsed-${action}`)).toBeTruthy();
    }
    expect(q("button-collapsed-tab-assets")).toBeTruthy();
    expect(q("button-collapsed-tab-transactions")).toBeTruthy();
  });

  it("uses the agent artwork while an agent account is selected", () => {
    collapse();
    expectColourway("button-collapsed-wallet", "agent");
    expect(svgOf(railIcons("button-collapsed-wallet").normal)).toContain("IconRobot");
    for (const action of ["add", "send", "exchange"]) {
      expectColourway(`button-collapsed-${action}`, "agent");
    }
  });

  it("falls back to the bank artwork for every other account", () => {
    act(() => {
      dots()[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    collapse();
    expectColourway("button-collapsed-wallet", "bank");
    expect(svgOf(railIcons("button-collapsed-wallet").normal)).toContain("id='bank'");
    for (const action of ["add", "send", "exchange"]) {
      expectColourway(`button-collapsed-${action}`, "bank");
    }
  });

  it("gives each action its own glyph", () => {
    collapse();
    const glyphs = ["add", "send", "exchange"].map((action) => railIcons(`button-collapsed-${action}`).normal);
    expect(new Set(glyphs).size).toBe(3);
    // The plus, straight from Figma's Add button.
    expect(svgOf(glyphs[0])).toContain("M20 12V20M20 20V28");
  });

  it("names the selected account on the avatar and opens its popup", () => {
    act(() => {
      dots()[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    collapse();
    expect(q("button-collapsed-wallet")?.getAttribute("aria-label")).toContain("Operating");
    expect(qPortal("popup-rail-accounts")).toBeNull();
    click("button-collapsed-wallet");
    // The rail opens the popup; the dedicated chevron is what expands.
    expect(toggles).toBe(0);
    const popup = qPortal("popup-rail-accounts");
    expect(popup).toBeTruthy();
    // …showing the account the rail named, not the first one in the read.
    expect(popup?.textContent).toContain("Operating");
    expect(popup?.textContent).not.toContain("Payment Agent");
  });

  it("leaves the three actions as unavailable as they are in the open panel", () => {
    collapse();
    for (const action of ["add", "send", "exchange"]) {
      const button = q(`button-collapsed-${action}`) as HTMLButtonElement;
      expect(button.getAttribute("aria-disabled")).toBe("true");
      expect(button.getAttribute("aria-label")).toContain("not available here yet");
      // A natively disabled button cannot be focused, which would leave the
      // explanation reachable only by hovering a mouse over it.
      expect(button.disabled).toBe(false);
      expect(button.getAttribute("title")).toContain("not available here yet");
      click(`button-collapsed-${action}`);
    }
    expect(toggles).toBe(0);
  });

  it("lights every icon with the same glyph it draws at rest", () => {
    collapse();
    for (const id of ["wallet", "add", "send", "exchange"]) {
      const { normal, active } = railIcons(`button-collapsed-${id}`);
      const glyphPath = (svg: string) => svg.replace(/<circle[^/]*\/>/, "").replace(/#[0-9A-Fa-f]{6}/g, "");
      expect(glyphPath(svgOf(active))).toBe(glyphPath(svgOf(normal)));
    }
  });

  it.each([
    ["loading", "Accounts are still loading"],
    ["failed", "Couldn't load accounts"],
    ["empty", "No connected accounts"],
  ] as const)("says %s rather than guessing an account", (state, expected) => {
    accountsReadState = state;
    render();
    collapse();
    const wallet = q("button-collapsed-wallet") as HTMLButtonElement;
    expect(wallet.getAttribute("aria-label")).toBe(expected);
    expect(wallet.getAttribute("aria-disabled")).toBe("true");
    click("button-collapsed-wallet");
    expect(toggles).toBe(0);
  });

  it("opens the popup for the tab that was tapped, and carries it into the panel", () => {
    collapse();
    click("button-collapsed-tab-transactions");
    expect(toggles).toBe(0);
    expect(qPortal("popup-rail-transactions")).toBeTruthy();
    expect(qPortal("popup-rail-assets")).toBeNull();
    // Closing it and expanding lands on the tab that was tapped, so the rail
    // and the panel never disagree about which surface the user chose.
    clickPortal("popup-rail-transactions-close");
    act(() => {
      root.render(<AccountsPanel collapsed={false} onToggle={() => { toggles += 1; }} />);
    });
    // The pagination dots are tabs too, so pick the panel tab by its label.
    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const transactionsTab = tabs.find((tab) => tab.textContent?.includes("Transactions"));
    const assetsTab = tabs.find((tab) => tab.textContent?.includes("Assets"));
    expect(transactionsTab?.getAttribute("aria-selected")).toBe("true");
    expect(assetsTab?.getAttribute("aria-selected")).toBe("false");
  });

  it("lights the two tab glyphs with the panel's own active artwork", () => {
    collapse();
    for (const tab of ["assets", "transactions"]) {
      const { normal, active } = railIcons(`button-collapsed-tab-${tab}`);
      expect(normal).toBeTruthy();
      expect(active).toBeTruthy();
      // A real artwork swap, not the same file twice behind a tint.
      expect(normal).not.toBe(active);
    }
    // …and the two tabs do not share one glyph.
    expect(railIcons("button-collapsed-tab-assets").active).not.toBe(
      railIcons("button-collapsed-tab-transactions").active,
    );
  });
});

/**
 * The three popups the rail opens. They are the point of the rail — a
 * collapsed panel that only expands is the old behaviour — so what they
 * actually render is pinned here rather than left to the source scan.
 */
describe("the rail popups", () => {
  beforeEach(() => {
    accountsReadState = "rows";
    render();
  });

  function openRail(testId: string) {
    collapse();
    click(testId);
  }

  it("shows the selected account's card in the Accounts popup", () => {
    openRail("button-collapsed-wallet");
    const popup = qPortal("popup-rail-accounts")!;
    expect(popup.querySelector('[data-testid="account-card"]')).toBeTruthy();
    // Header names the surface, and the close control is reachable.
    expect(popup.textContent).toContain("Accounts");
    expect(qPortal("popup-rail-accounts-close")).toBeTruthy();
  });

  it("shows the asset rows and their filters in the Assets popup", () => {
    openRail("button-collapsed-tab-assets");
    const popup = qPortal("popup-rail-assets")!;
    expect(popup.textContent).toContain("Assets");
    // The three Figma pills, wired to the same filter the panel uses.
    const pills = Array.from(popup.querySelectorAll<HTMLButtonElement>("[aria-pressed]"));
    expect(pills.map((pill) => pill.textContent?.trim())).toEqual(["all", "cash", "crypto"]);
    // Real rows from the mocked read, not an empty frame.
    expect(popup.textContent).toContain("Ethereum");
    expect(popup.textContent).toContain("Dollar");
    // …and the pills are wired, not decorative.
    act(() => {
      pills[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const filtered = qPortal("popup-rail-assets")!;
    expect(filtered.textContent).toContain("Ethereum");
    expect(filtered.textContent).not.toContain("Dollar");
  });

  it("scopes the Transactions popup to the selected account", () => {
    act(() => {
      dots()[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    openRail("button-collapsed-tab-transactions");
    const popup = qPortal("popup-rail-transactions")!;
    expect(popup.textContent).toContain("Transactions");
    // Same rule as the panel: the list under the named account is that
    // account's activity, and nothing else's.
    expect(popup.textContent).toContain("Office rent");
    expect(popup.textContent).not.toContain("BigCo Industries payment");
    // Rows the feed never attributed are declared rather than dropped.
    expect(popup.textContent).toContain("aren't linked to an account");
  });

  it("names an account read that failed instead of showing an empty popup", () => {
    accountsReadState = "failed";
    render();
    collapse();
    // The wallet button is inert without an account, so the popup is reached
    // through a tab — which must still explain itself rather than go blank.
    click("button-collapsed-tab-assets");
    const popup = qPortal("popup-rail-assets")!;
    expect(popup.textContent).toContain("Couldn't load");
  });

  it("opens one popup at a time", () => {
    openRail("button-collapsed-tab-assets");
    expect(qPortal("popup-rail-assets")).toBeTruthy();
    click("button-collapsed-tab-transactions");
    expect(qPortal("popup-rail-assets")).toBeNull();
    expect(qPortal("popup-rail-transactions")).toBeTruthy();
  });
});
