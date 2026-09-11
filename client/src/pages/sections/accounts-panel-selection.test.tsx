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

/** Swipe the card horizontally by `dx` pixels, the way a thumb would. */
function swipeCard(dx: number) {
  const card = q("account-card")!;
  const start = 200;
  const opts = (clientX: number) => ({ bubbles: true, clientX, clientY: 100 });
  act(() => {
    card.dispatchEvent(new (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent("pointerdown", opts(start)));
    card.dispatchEvent(new (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent("pointermove", opts(start + dx)));
    card.dispatchEvent(new (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent("pointerup", opts(start + dx)));
  });
}

/**
 * jsdom has neither ResizeObserver nor layout, so the placement maths would
 * otherwise run against all-zeros and every assertion below would pass with
 * the anchoring torn out. These two shims give it real numbers to work with.
 */
interface ObserverRecord {
  targets: Set<Element>;
  callback: () => void;
  disconnected: boolean;
}

const resizeObservers: ObserverRecord[] = [];

class StubResizeObserver {
  private record: ObserverRecord = { targets: new Set(), callback: () => {}, disconnected: false };
  constructor(callback: () => void) {
    this.record.callback = callback;
    resizeObservers.push(this.record);
  }
  observe(target: Element) {
    this.record.targets.add(target);
  }
  unobserve(target: Element) {
    this.record.targets.delete(target);
  }
  disconnect() {
    this.record.disconnected = true;
    this.record.targets.clear();
  }
}

/**
 * Only notifies observers that are live AND actually watching `target`, so a
 * test that fires a resize is really asserting the element was registered —
 * firing every callback blindly would keep passing with the observe() call
 * deleted.
 */
function fireResize(target: Element) {
  const live = resizeObservers.filter((o) => !o.disconnected && o.targets.has(target));
  expect(live.length).toBeGreaterThan(0);
  act(() => live.forEach((o) => o.callback()));
}

/** Per-element height, read by the offsetHeight shim installed in beforeEach. */
const stubHeights = new WeakMap<HTMLElement, number>();

function setStubHeight(el: HTMLElement, height: number) {
  stubHeights.set(el, height);
}

beforeEach(() => {
  // jsdom has no PointerEvent; the panel only reads clientX/clientY off it.
  if (!(window as unknown as { PointerEvent?: unknown }).PointerEvent) {
    (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  }
  resizeObservers.length = 0;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = StubResizeObserver;
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return stubHeights.get(this) ?? 0;
    },
  });
  accountsReadState = "rows";
  render();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  accountsReadState = "rows";
  delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight;
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
    swipeCard(-120); // right-to-left: forward
    expect(text("text-account-name")).toBe("Brightline Treasury Wallet");
    swipeCard(120); // left-to-right: back
    expect(text("text-account-name")).toBe("Payment Agent");
  });

  it("changes account during the swipe without waiting for pointer-up", () => {
    const card = q("account-card")!;
    const PointerEvent = (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent;
    act(() => {
      card.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 200, clientY: 100 }));
      card.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 80, clientY: 100 }));
    });
    expect(text("text-account-name")).toBe("Brightline Treasury Wallet");
  });

  it("does not treat a short drag as a swipe", () => {
    swipeCard(-15);
    expect(text("text-account-name")).toBe("Payment Agent");
  });

  it("cycles across both ends", () => {
    swipeCard(120); // back from first wraps to last
    expect(text("text-account-name")).toBe("Operating");
    act(() => {
      dots()[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    swipeCard(120); // and back from first wraps again
    expect(text("text-account-name")).toBe("Operating");
    swipeCard(-120); // forward from last wraps to first
    expect(text("text-account-name")).toBe("Payment Agent");
  });

  it("does not let card pointer capture steal a pagination tap", () => {
    const card = q("account-card")!;
    const dot = dots()[1];
    const capture = vi.fn();
    Object.defineProperty(card, "setPointerCapture", { configurable: true, value: capture });
    const PointerEvent = (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent;
    act(() => {
      dot.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      dot.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      dot.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(capture).not.toHaveBeenCalled();
    expect(text("text-account-name")).toBe("Brightline Treasury Wallet");
    expect(dot.className).toContain("size-[6px]");
    expect(dot.parentElement?.className).toContain("top-[180.6px]");
    expect(dot.parentElement?.className).toContain("gap-1");
  });

  it("cycles accounts from a real touch swipe without touch-generated pointer events", () => {
    const card = q("account-card")!;
    const touchEvent = (type: string, clientX: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "touches", {
        configurable: true,
        value: type === "touchend" ? [] : [{ clientX, clientY: 100 }],
      });
      return event;
    };
    act(() => {
      card.dispatchEvent(touchEvent("touchstart", 200));
      card.dispatchEvent(touchEvent("touchmove", 80));
      card.dispatchEvent(touchEvent("touchend", 80));
    });
    expect(text("text-account-name")).toBe("Brightline Treasury Wallet");
  });

  it("picks the account from the drop-down too", () => {
    act(() => {
      q("button-account-selector")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const row = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')).find(
      (r) => r.textContent?.includes("Brightline"),
    );
    expect(row).toBeTruthy();
    act(() => {
      row!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(text("text-account-name")).toBe("Brightline Treasury Wallet");
  });

  it("layers the drop-down over a dimmed UI instead of adding it to panel layout", () => {
    act(() => {
      q("button-account-selector")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const menu = document.body.querySelector<HTMLElement>('[role="menu"][aria-label="Choose account"]');
    const dimmer = qPortal("accounts-account-selector-dimmer");
    expect(menu).toBeTruthy();
    expect(dimmer).toBeTruthy();
    expect(menu?.parentElement).toBe(document.body);
    expect(menu?.className).toContain("fixed");
    expect(dimmer?.className).toContain("bg-black/60");
    expect(dimmer?.className).toContain("backdrop-blur-[2px]");
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

/**
 * The open panel's Assets tab and the rail's Assets popup are the same
 * component, so the rule the card states — this is the account you picked —
 * has to hold on both. Two of the three fixture accounts hold USD, which is
 * the case that produced two identical-looking "Dollar" rows.
 */
describe("assets under the card", () => {
  function assetRows(): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>('[data-testid^="row-asset-"]'));
  }

  it("shows only the selected account's holdings", () => {
    // The panel opens on the Assets tab, with the agent account selected.
    expect(assetRows().map((row) => row.getAttribute("data-testid"))).toEqual(["row-asset-acct_agent"]);
    expect(q("row-asset-acct_wallet")).toBeNull();
    expect(q("row-asset-acct_operating")).toBeNull();
    act(() => {
      dots()[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(assetRows().map((row) => row.getAttribute("data-testid"))).toEqual(["row-asset-acct_wallet"]);
    expect(text("row-asset-acct_wallet")).toContain("Ethereum");
  });

  it("draws one Dollar row, not one per account holding USD", () => {
    expect(assetRows().filter((row) => row.textContent?.includes("Dollar"))).toHaveLength(1);
    expect(text("row-asset-acct_agent")).toContain("$2,040.3");
    expect(container.textContent).not.toContain("$1,687,200");
    act(() => {
      dots()[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(assetRows().filter((row) => row.textContent?.includes("Dollar"))).toHaveLength(1);
    expect(text("row-asset-acct_operating")).toContain("$1,687,200");
  });

  it("says the filter hid the account rather than showing it as unconnected", () => {
    const cryptoPill = Array.from(container.querySelectorAll<HTMLButtonElement>("[aria-pressed]")).find(
      (pill) => pill.textContent?.trim() === "crypto",
    );
    act(() => {
      cryptoPill?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(assetRows()).toHaveLength(0);
    expect(q("accounts-panel-empty")).toBeNull();
    expect(text("accounts-panel-assets-filtered-empty")).toContain("Payment Agent holds no crypto assets");
    // The wallet is crypto, so the same filter shows its row.
    act(() => {
      dots()[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(q("accounts-panel-assets-filtered-empty")).toBeNull();
    expect(assetRows().map((row) => row.getAttribute("data-testid"))).toEqual(["row-asset-acct_wallet"]);
  });

  it("says no assets are connected when the read came back with none", () => {
    accountsReadState = "empty";
    render();
    expect(assetRows()).toHaveLength(0);
    expect(text("accounts-panel-empty")).toContain("No assets connected yet");
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
  it("carries the wallet avatar and the two tabs, and no longer the actions", () => {
    collapse();
    expect(q("button-accounts-expand")).toBeTruthy();
    expect(q("button-collapsed-wallet")).toBeTruthy();
    expect(q("button-collapsed-tab-assets")).toBeTruthy();
    expect(q("button-collapsed-tab-transactions")).toBeTruthy();
    // Add / Send / Exchange moved onto the card inside the Accounts popup
    // (Figma 6540:64571). Leaving a second copy on the rail would give the
    // reader two dead controls for the same unavailable action.
    for (const action of ["add", "send", "exchange"]) {
      expect(q(`button-collapsed-${action}`)).toBeNull();
    }
  });

  it("uses the agent artwork while an agent account is selected", () => {
    collapse();
    expectColourway("button-collapsed-wallet", "agent");
    expect(svgOf(railIcons("button-collapsed-wallet").normal)).toContain("IconRobot");
  });

  it("falls back to the bank artwork for every other account", () => {
    act(() => {
      dots()[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    collapse();
    expectColourway("button-collapsed-wallet", "bank");
    expect(svgOf(railIcons("button-collapsed-wallet").normal)).toContain("id='bank'");
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

  it("lights the wallet avatar with the same glyph it draws at rest", () => {
    collapse();
    const { normal, active } = railIcons("button-collapsed-wallet");
    const glyphPath = (svg: string) => svg.replace(/<circle[^/]*\/>/, "").replace(/#[0-9A-Fa-f]{6}/g, "");
    expect(glyphPath(svgOf(active))).toBe(glyphPath(svgOf(normal)));
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

describe("adding money", () => {
  function chooseAccount(accountId: string) {
    const select = qPortal("add-money-account-select") as HTMLSelectElement;
    act(() => {
      select.value = accountId;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function portalButton(label: string): HTMLButtonElement {
    const button = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    expect(button).toBeDefined();
    return button!;
  }

  function openAdd() {
    click("button-account-add");
    expect(qPortal("add-money-modal")?.getAttribute("data-node-id")).toBe("3608:34362");
  }

  it("keeps Next disabled until an account is chosen", () => {
    openAdd();
    expect(portalButton("Next").disabled).toBe(true);
    chooseAccount("acct_operating");
    expect(portalButton("Next").disabled).toBe(false);
  });

  it("shows the selected bank account's real funding details", () => {
    openAdd();
    chooseAccount("acct_operating");
    act(() => portalButton("Next").click());

    const modal = qPortal("add-money-modal");
    expect(modal?.getAttribute("data-node-id")).toBe("6543:55103");
    expect(modal?.textContent).toContain("Operating");
    expect(modal?.textContent).toContain("AE070331234567890123456");
    expect(qPortal("add-money-show-qr")).toBeNull();
  });

  it("shows the wallet address and opens a generated QR overlay", () => {
    openAdd();
    chooseAccount("acct_wallet");
    act(() => portalButton("Next").click());

    const modal = qPortal("add-money-modal");
    expect(modal?.getAttribute("data-node-id")).toBe("2979:41718");
    expect(modal?.textContent).toContain("0x3619");
    clickPortal("add-money-show-qr");

    const qr = qPortal("add-money-qr-modal");
    expect(qr?.getAttribute("data-node-id")).toBe("2979:42687");
    expect(qr?.querySelector("svg")).not.toBeNull();
    expect(qPortal("add-money-modal")).not.toBeNull();
  });

  it("dismisses on Escape and restores focus to Add", async () => {
    const trigger = q("button-account-add") as HTMLButtonElement;
    openAdd();
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await act(async () => {
      await Promise.resolve();
    });
    expect(qPortal("add-money-modal")).toBeNull();
    expect(document.activeElement).toBe(trigger);
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

  it("overlays and dims the Accounts popup while its selector is open", () => {
    openRail("button-collapsed-wallet");
    clickPortal("button-rail-accounts-account-selector");
    const popup = qPortal("popup-rail-accounts")!;
    const menu = document.body.querySelector<HTMLElement>('[role="menu"][aria-label="Choose account"]')!;
    const dimmer = qPortal("rail-accounts-account-selector-dimmer");
    expect(menu).toBeTruthy();
    expect(dimmer).toBeTruthy();
    // The menu is a body-level fixed layer, so it overlaps rather than adding
    // height to the popup's scrollable content.
    expect(menu.parentElement).toBe(document.body);
    expect(menu.className).toContain("z-[70]");
    expect(dimmer?.className).toContain("z-[60]");
    expect(popup.className).toContain("z-50");

    const row = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')).find(
      (item) => item.textContent?.includes("Brightline"),
    )!;
    act(() => row.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(qPortal("popup-rail-accounts")).toBeTruthy();
    expect(qPortal("rail-accounts-account-selector-dimmer")).toBeNull();
  });

  it("shows the asset rows and their filters in the Assets popup", () => {
    openRail("button-collapsed-tab-assets");
    const popup = qPortal("popup-rail-assets")!;
    expect(popup.textContent).toContain("Assets");
    // The three Figma pills, wired to the same filter the panel uses.
    const pills = Array.from(popup.querySelectorAll<HTMLButtonElement>("[aria-pressed]"));
    expect(pills.map((pill) => pill.textContent?.trim())).toEqual(["all", "cash", "crypto"]);
    // A real row from the mocked read, not an empty frame: the selected
    // account is the USD payment agent.
    expect(popup.textContent).toContain("Dollar");
    // …and the pills are wired, not decorative. The agent account holds no
    // crypto, so the crypto filter says that rather than showing nothing.
    act(() => {
      pills[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const filtered = qPortal("popup-rail-assets")!;
    expect(filtered.textContent).not.toContain("Dollar");
    expect(filtered.querySelector('[data-testid="accounts-panel-assets-filtered-empty"]')?.textContent).toContain(
      "Payment Agent holds no crypto assets",
    );
  });

  /**
   * The selector at the top of the popup names one account. Listing every
   * account's holdings under it put the wallet's ETH under a heading that
   * said "Bank checking", and drew "Dollar" twice — two different accounts
   * that happen to hold the same currency, indistinguishable as rows.
   */
  it("scopes the Assets popup to the selected account", () => {
    openRail("button-collapsed-tab-assets");
    const popup = qPortal("popup-rail-assets")!;
    expect(popup.querySelector('[data-testid="row-asset-acct_agent"]')).toBeTruthy();
    expect(popup.querySelector('[data-testid="row-asset-acct_wallet"]')).toBeNull();
    expect(popup.querySelector('[data-testid="row-asset-acct_operating"]')).toBeNull();
    expect(popup.textContent).not.toContain("Ethereum");
    // The agent's own balance, not the other USD account's.
    expect(popup.textContent).toContain("$2,040.3");
    expect(popup.textContent).not.toContain("$1,687,200");
  });

  it("never draws the same currency twice when two accounts hold it", () => {
    // acct_agent and acct_operating are both USD, so a tenant-wide list shows
    // two rows that read identically.
    openRail("button-collapsed-tab-assets");
    const rows = () =>
      Array.from(qPortal("popup-rail-assets")!.querySelectorAll('[data-testid^="row-asset-"]'));
    expect(rows()).toHaveLength(1);
    const dollarRows = () =>
      rows().filter((row) => row.textContent?.includes("Dollar"));
    expect(dollarRows()).toHaveLength(1);
    // …and picking the other USD account swaps the row rather than adding one.
    clickPortal("popup-rail-assets-close");
    act(() => {
      root.render(<AccountsPanel collapsed={false} onToggle={() => { toggles += 1; }} />);
    });
    act(() => {
      dots()[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    openRail("button-collapsed-tab-assets");
    expect(rows()).toHaveLength(1);
    expect(dollarRows()).toHaveLength(1);
    expect(qPortal("popup-rail-assets")!.textContent).toContain("$1,687,200");
    expect(qPortal("popup-rail-assets")!.textContent).not.toContain("$2,040.3");
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

  it("puts live Add and unavailable Send and Exchange actions on the card", () => {
    openRail("button-collapsed-wallet");
    const popup = qPortal("popup-rail-accounts")!;
    const actions = Array.from(popup.querySelectorAll<HTMLButtonElement>("button[aria-label]")).filter((b) =>
      /Add money|Sending|Exchange/.test(b.getAttribute("aria-label") ?? ""),
    );
    expect(actions).toHaveLength(3);
    // Figma 6540:64571 labels them under the glyphs; the labels are what the
    // reader actually reads, so assert those and not just the icons.
    for (const label of ["Add", "Send", "Exchange"]) {
      expect(popup.textContent).toContain(label);
    }
    const add = actions.find((action) => action.getAttribute("aria-label")?.startsWith("Add money"));
    expect(add?.disabled).toBe(false);
    // Send and Exchange remain honest dead controls until those flows exist.
    for (const action of actions.filter((candidate) => candidate !== add)) {
      expect(action.disabled).toBe(true);
      expect(action.getAttribute("aria-label")).toContain("not available here yet");
    }
  });

  /**
   * jsdom gives every element a zero rect, so the boxes the placement maths
   * reads have to be supplied by hand — otherwise it runs against all-zeros
   * and these tests would pass with the anchoring torn out.
   */
  function stubRect(el: HTMLElement, left: number, top: number, width: number, height: number) {
    el.getBoundingClientRect = () =>
      ({
        left,
        right: left + width,
        top,
        bottom: top + height,
        width,
        height,
        x: left,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;
  }

  function railFrame(): HTMLElement {
    return container.querySelector<HTMLElement>("[data-rail-frame]")!;
  }

  it("places the popup against the rail, level with the button that opened it", () => {
    collapse();
    stubRect(railFrame(), 900, 0, 54, 700);
    stubRect(q("button-collapsed-wallet") as HTMLElement, 907, 300, 40, 40);
    click("button-collapsed-wallet");
    const popup = qPortal("popup-rail-accounts")!;
    // Figma 6540:64629: the popup's right edge sits on the rail's OUTER edge,
    // not on the button inside it — 907 would cover the rail's own border.
    expect(popup.style.left).toBe(`${900 - 386}px`);
    // …and its header is centred on the button, so it reads as that button's
    // own surface rather than a panel that happens to be nearby.
    expect(popup.style.top).toBe(`${320 - 28}px`);
    // It is emphatically not the old viewport-centred modal.
    expect(popup.className).not.toContain("left-[50%]");
    expect(popup.className).not.toContain("top-[50%]");
  });

  it("flips to the other side of a rail with no room on its left", () => {
    collapse();
    stubRect(railFrame(), 20, 0, 54, 700);
    stubRect(q("button-collapsed-wallet") as HTMLElement, 27, 300, 40, 40);
    click("button-collapsed-wallet");
    const popup = qPortal("popup-rail-accounts")!;
    // 20 - 386 would be off-screen, so the popup goes to the rail's right.
    expect(popup.style.left).toBe("74px");
  });

  /**
   * Placement has to survive the popup changing size after it opens — the
   * account selector expanding, a filter emptying a list, a webfont swapping.
   * These use a real height so the bottom edge is a number that can be wrong.
   */
  function openTall(height: number) {
    collapse();
    stubRect(railFrame(), 900, 0, 54, 700);
    stubRect(q("button-collapsed-wallet") as HTMLElement, 907, 600, 40, 40);
    click("button-collapsed-wallet");
    const popup = qPortal("popup-rail-accounts")!;
    setStubHeight(popup, height);
    fireResize(popup);
    return popup;
  }

  it("caps the popup at the viewport and shows it once it is placed", () => {
    collapse();
    stubRect(railFrame(), 900, 0, 54, 700);
    stubRect(q("button-collapsed-wallet") as HTMLElement, 907, 300, 40, 40);
    click("button-collapsed-wallet");
    const popup = qPortal("popup-rail-accounts")!;
    // A popup taller than the screen scrolls inside its own body rather than
    // running off the bottom, so the cap is viewport-derived and always set.
    expect(popup.style.maxHeight).toBe(`${window.innerHeight - 16}px`);
    // The first pass is hidden while the height is measured; by the time the
    // popup is placed it has to be visible again, or it is a dimmed screen
    // with nothing on it.
    expect(popup.style.visibility).not.toBe("hidden");
  });

  it("keeps a popup that grows after opening inside the viewport", () => {
    const popup = openTall(400);
    const top = Number.parseInt(popup.style.top, 10);
    // Trigger centre is 620, so the unclamped top would be 592 and the
    // bottom 992 — well past a 768px viewport.
    expect(top + 400).toBeLessThanOrEqual(window.innerHeight - 8);
    expect(top).toBeGreaterThanOrEqual(8);
  });

  it("lets a popup that shrinks move back down to its trigger", () => {
    const popup = openTall(400);
    const clampedTop = Number.parseInt(popup.style.top, 10);
    setStubHeight(popup, 80);
    fireResize(popup);
    const relaxedTop = Number.parseInt(popup.style.top, 10);
    // Once it is short enough to fit, it goes back to sitting level with the
    // button rather than staying pinned where the clamp left it.
    expect(relaxedTop).toBeGreaterThan(clampedTop);
    expect(relaxedTop).toBe(620 - 28);
  });

  it("re-places when the window resizes", () => {
    collapse();
    const frame = railFrame();
    stubRect(frame, 900, 0, 54, 700);
    stubRect(q("button-collapsed-wallet") as HTMLElement, 907, 300, 40, 40);
    click("button-collapsed-wallet");
    const popup = qPortal("popup-rail-accounts")!;
    expect(popup.style.left).toBe("514px");
    // The rail moves with the window, so the popup has to follow it.
    stubRect(frame, 600, 0, 54, 700);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(popup.style.left).toBe("214px");
  });

  it("follows a surface that scrolls underneath it", () => {
    collapse();
    stubRect(railFrame(), 900, 0, 54, 700);
    const wallet = q("button-collapsed-wallet") as HTMLElement;
    stubRect(wallet, 907, 300, 40, 40);
    click("button-collapsed-wallet");
    const popup = qPortal("popup-rail-accounts")!;
    expect(popup.style.top).toBe("292px");
    // The rail scrolls internally, which a non-capturing window listener
    // would never see.
    stubRect(wallet, 907, 200, 40, 40);
    act(() => {
      container.dispatchEvent(new Event("scroll", { bubbles: false }));
    });
    expect(popup.style.top).toBe("192px");
  });

  it("stops listening once the popup closes", () => {
    const removed: string[] = [];
    // Bind the original first: calling EventTarget.prototype directly throws
    // "not a valid instance of EventTarget" and takes React's scheduler down
    // with it.
    const original = window.removeEventListener.bind(window);
    const spy = vi
      .spyOn(window, "removeEventListener")
      .mockImplementation(((type: string, listener: EventListener, options?: boolean) => {
        removed.push(type);
        original(type, listener, options);
      }) as typeof window.removeEventListener);
    try {
      collapse();
      click("button-collapsed-wallet");
      const popup = qPortal("popup-rail-accounts")!;
      expect(popup).toBeTruthy();
      // Baseline taken *after* opening: the callback ref arriving changes the
      // effect's deps, so opening already runs one cleanup and re-register.
      // Measuring from zero would let this pass with no teardown at all.
      removed.length = 0;
      const live = resizeObservers.filter((o) => !o.disconnected && o.targets.has(popup));
      expect(live).toHaveLength(1);

      clickPortal("popup-rail-accounts-close");

      expect(qPortal("popup-rail-accounts")).toBeNull();
      expect(removed).toContain("resize");
      expect(removed).toContain("scroll");
      // …and the observer that was watching this popup goes with them, or a
      // closed popup keeps measuring.
      expect(live[0].disconnected).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  /** Lets a few animation frames run inside act(). */
  async function settleFrames() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 48));
    });
  }

  it("follows the rail when it moves without changing size", async () => {
    collapse();
    const frame = railFrame();
    stubRect(frame, 900, 0, 54, 700);
    stubRect(q("button-collapsed-wallet") as HTMLElement, 907, 300, 40, 40);
    click("button-collapsed-wallet");
    const popup = qPortal("popup-rail-accounts")!;
    expect(popup.style.left).toBe("514px");

    // Let the watcher run first, so this cannot pass on a single deferred
    // placement: the move has to be picked up by a *later* frame, which only
    // happens if the loop reschedules itself.
    await settleFrames();
    expect(popup.style.left).toBe("514px");

    // Collapsing a sibling panel slides the rail sideways at the same width:
    // no resize, no scroll, and a ResizeObserver reports box sizes only.
    stubRect(frame, 700, 0, 54, 700);
    await settleFrames();
    expect(popup.style.left).toBe("314px");

    // And it keeps following, rather than tracking one move and stopping.
    stubRect(frame, 500, 0, 54, 700);
    await settleFrames();
    expect(popup.style.left).toBe("114px");
  });

  it("stops reading the anchor every frame once the popup closes", async () => {
    const cancelled: number[] = [];
    const scheduled: number[] = [];
    const realRaf = window.requestAnimationFrame.bind(window);
    // The cancel spy must delegate. Recording the id without cancelling would
    // leave this test's own loop running at 60fps into every test after it,
    // holding the closed popup's anchor and content.
    const realCancel = window.cancelAnimationFrame.bind(window);
    const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      const id = realRaf(cb);
      scheduled.push(id);
      return id;
    });
    const cancelSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      cancelled.push(id);
      realCancel(id);
    });
    try {
      collapse();
      click("button-collapsed-wallet");
      expect(qPortal("popup-rail-accounts")).toBeTruthy();
      await settleFrames();
      const outstanding = scheduled[scheduled.length - 1];
      expect(scheduled.length).toBeGreaterThan(1);

      clickPortal("popup-rail-accounts-close");

      // Without the cancel, the loop keeps measuring a closed popup forever
      // and holds on to the old anchor and content.
      expect(cancelled).toContain(outstanding);
      const afterClose = scheduled.length;
      await settleFrames();
      expect(scheduled.length).toBe(afterClose);
    } finally {
      rafSpy.mockRestore();
      cancelSpy.mockRestore();
    }
  });

  it("hands focus back to the button that opened it", async () => {
    collapse();
    const wallet = q("button-collapsed-wallet") as HTMLButtonElement;
    click("button-collapsed-wallet");
    expect(qPortal("popup-rail-accounts")).toBeTruthy();
    clickPortal("popup-rail-accounts-close");
    // Radix defers its unmount-autofocus handling by a macrotask.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // Radix has no DialogTrigger to restore to here, so without the explicit
    // handoff focus lands on <body> and the keyboard user loses their place.
    expect(document.activeElement).toBe(wallet);
  });

  it("keeps a popup anchored to a low trigger inside the viewport", () => {
    collapse();
    stubRect(railFrame(), 900, 0, 54, 700);
    stubRect(q("button-collapsed-tab-transactions") as HTMLElement, 907, 4000, 40, 40);
    click("button-collapsed-tab-transactions");
    const popup = qPortal("popup-rail-transactions")!;
    // Aligning the header with a trigger 4000px down would put the whole
    // popup below the fold; the clamp is what keeps it reachable.
    expect(Number.parseInt(popup.style.top, 10)).toBeLessThanOrEqual(window.innerHeight);
    expect(Number.parseInt(popup.style.top, 10)).toBeGreaterThanOrEqual(8);
  });
});
