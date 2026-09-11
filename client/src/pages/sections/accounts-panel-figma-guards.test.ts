import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panelSource = readFileSync(new URL("./AccountsPanel.tsx", import.meta.url), "utf8");
const partsSource = readFileSync(new URL("./accountsPanelParts.tsx", import.meta.url), "utf8");
const popupSource = readFileSync(new URL("../../components/AccountsRailPopups.tsx", import.meta.url), "utf8");

/**
 * The card, the selector, the filter pills and both lists were lifted into
 * accountsPanelParts so the rail popups can render the same markup. Assertions
 * about *what is drawn* therefore have to search both files; assertions about
 * where it is drawn stay scoped to one.
 */
const source = `${panelSource}\n${partsSource}`;

/**
 * Just the collapsed branch. A bare `source.toContain` would happily match the
 * open panel — both render a wallet avatar and the same three actions — so an
 * assertion about the rail has to be scoped to the rail, or it can pass while
 * the rail itself is empty.
 */
function railSource(): string {
  const start = panelSource.indexOf("  if (collapsed) {");
  const end = panelSource.indexOf("\n  return (", start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return panelSource.slice(start, end);
}

describe("Figma accounts panel", () => {
  it("keeps the Figma rail anchors and geometry", () => {
    expect(panelSource).toContain('data-node-id="6519:54025"');
    expect(panelSource).toContain('left-[7px] top-[7px]');
    expect(panelSource).toContain('left-[55px] top-[7px] z-20 w-[322px]');
    expect(panelSource).toContain('bottom-[7px] top-[63px]');
    expect(partsSource).toContain('h-[290px] w-full max-w-[370px]');
    expect(partsSource).toContain('h-[200px] touch-pan-y overflow-hidden rounded-panel');
    expect(panelSource).toContain('min-h-[754px] flex-col items-center gap-[24px]');
  });

  it("reads every live account and transaction page", () => {
    expect(panelSource).toContain('usePagedLedgerRead<BrainAccountDTO>("/api/brain/ledger/accounts", "accounts")');
    expect(panelSource).toContain('usePagedLedgerRead<BrainTransactionDTO>("/api/brain/ledger/transactions", "transactions")');
    expect(source).toContain("Some accounts couldn't be loaded");
    expect(source).toContain("Some transactions couldn't be loaded");
    expect(source).not.toContain("Transactions aren't available here yet");
  });

  it("uses durable local artwork and exposes real interaction state", () => {
    expect(source).not.toContain("www.figma.com/api/mcp/asset");
    expect(popupSource).not.toContain("www.figma.com/api/mcp/asset");
    expect(partsSource).toContain("@assets/BankCard_1789001100273.png");
    expect(partsSource).toContain("aria-expanded={open}");
    expect(partsSource).toContain('aria-pressed={filter === item}');
    expect(partsSource).toContain("navigator.clipboard.writeText(selected.external_account_id)");
    expect(partsSource).toContain('data-testid="account-card-linear-stroke"');
    // Measured off Figma 6519:54130: corner-to-corner, bright at both ends,
    // transparent through the middle. A single-direction fade is wrong.
    expect(partsSource).toContain("linear-gradient(to bottom right, rgba(255, 149, 0, 0.45) 0%");
    expect(partsSource).toContain("rgba(255, 149, 0, 0.58) 100%)");
    expect(source).not.toContain("linear-gradient(135deg");
  });

  it("renders transaction rows to Figma 4062:56400", () => {
    // 40px tinted circle + 20px arrow, outgoing arrow is the down-right glyph flipped.
    expect(partsSource).toContain("@assets/tx-arrow-out.svg");
    expect(partsSource).toContain("@assets/tx-arrow-in.svg");
    expect(partsSource).toContain("@assets/tx-dot.svg");
    expect(partsSource).toContain('"bg-brain-v1dark-pink-red"');
    expect(partsSource).toContain('"bg-brain-v1dark-green"');
    expect(partsSource).toContain('style={flow === "out" ? { transform: "scaleY(-1)" } : undefined}');
    // 20px JetBrains Mono amount, red out / green in.
    expect(partsSource).toContain("text-[20px] font-medium leading-5");
    expect(partsSource).toContain('"text-brain-v1pink-red"');
    expect(partsSource).toContain('"text-brain-v1asset-green"');
    expect(partsSource).toContain("formatTransactionAmount(transaction.amount, transaction.currency, flow)");
    // Every figure and date goes through the tested formatters, never a local
    // ad-hoc one. Their behaviour is covered in lib/accountsPanelFormat.test.ts.
    expect(partsSource).toContain('from "@/lib/accountsPanelFormat"');
    expect(source).not.toMatch(/function (transactionMeta|shortenIdentifier|signedTransactionLabel)\(/);
  });

  it("renders and wires the four transaction filters from Figma 4062:56277", () => {
    expect(partsSource).toContain('data-node-id="2663:26526"');
    expect(partsSource).toContain('{ value: "all", label: "All" }');
    expect(partsSource).toContain('{ value: "trades", label: "Trades" }');
    expect(partsSource).toContain('{ value: "deposits", label: "Deposits" }');
    expect(partsSource).toContain('{ value: "withdrawals", label: "Withdrawals" }');
    expect(partsSource).toContain('aria-disabled={item.value === "trades" ? "true" : undefined}');
    expect(partsSource).toContain('aria-describedby={item.value === "trades" ? tradesDescriptionId : undefined}');
    expect(partsSource).toContain('role="status"');
    expect(partsSource).toContain('item.value === "deposits" ? "w-[99px]" : "w-[124px]"');
    expect(partsSource).toContain("transactionMatchesFilter(transaction.direction, filter)");
    expect(partsSource).toContain("filteredTransactions.map");
    expect(partsSource).toContain("Other transaction types are hidden by this filter.");
    expect(partsSource).toContain("Matching activity may be missing from this filtered view.");
  });

  it("restyles the account selector to Figma 3759:50250", () => {
    expect(partsSource).toContain('data-node-id="3759:50251"');
    // Closed control: 40px pill on baby-blue-15 with the baby-blue-30 stroke.
    expect(partsSource).toContain("rounded-[40px] border border-solid border-brain-v1baby-blue-30 bg-brain-v1baby-blue-15");
    // Open panel: 12px radius, stroke-2 border, dropdown background, 8px padding.
    expect(partsSource).toContain("rounded-row border border-solid border-brain-v1stroke-2 bg-brain-v1highlight-dropdown-bg p-2");
    // Rows carry the identifier chip and the selected row carries the tick.
    expect(partsSource).toContain("shortenIdentifier(account.external_account_id)");
    expect(partsSource).toContain('aria-checked={account.id === selected?.id}');
    expect(partsSource).toContain('alt="Selected"');
    // The purple row is rendered, but it is honestly inert rather than a
    // placeholder that pretends to create an account.
    expect(partsSource).toContain('button-add-agent-account');
    expect(partsSource).toContain('aria-disabled="true"');
    expect(partsSource).toContain("Agent accounts can't be created from here yet.");
    expect(partsSource).toContain("@assets/dropdown-add-agent.svg");
    expect(partsSource).toContain("@assets/wallet-icon-bank-32.svg");
    expect(partsSource).toContain("@assets/wallet-icon-agent-32.svg");
  });

  it("gives an agent account the green card from Figma 3759:50590", () => {
    expect(partsSource).toContain("isAgentAccount");
    expect(partsSource).toContain('agentSelected ? "bg-brain-v1dark-green" : "bg-brain-v1dark-orange"');
    expect(partsSource).toContain("@assets/account-card-glow-green.svg");
    expect(partsSource).toContain("@assets/wallet-icon-agent-48.svg");
    expect(partsSource).toContain("linear-gradient(to bottom right, rgba(66, 191, 35, 0.45) 0%");
    expect(partsSource).toContain("rgba(66, 191, 35, 0.58) 100%)");
    // Green captions use the asset-green token, orange keeps light-orange.
    expect(partsSource).toContain('agentSelected ? "text-brain-v1asset-green" : "text-brain-v1light-orange"');
    // The second column only appears when the ledger states a status.
    expect(partsSource).toContain("agentSelected && selected?.status");
  });

  it("makes the card pagination selectable and swipeable", () => {
    expect(partsSource).toContain('data-testid="account-card-pagination"');
    expect(partsSource).toContain("onClick={() => onSelectAccount(account.id)}");
    // One dot per account, not a hardcoded three.
    expect(partsSource).not.toContain('<span className="size-[6px] rounded-full bg-brain-v1light-orange" />');
    expect(partsSource).toContain("accounts.map((account, index) =>");
    // Keyboard and pointer both move the selection.
    expect(partsSource).toContain('event.key === "ArrowRight"');
    expect(partsSource).toContain("onPointerDown={onCardPointerDown}");
    expect(partsSource).toContain("onPointerMove={onCardPointerMove}");
    expect(partsSource).toContain("onPointerUp={finishSwipe}");
    expect(partsSource).toContain("selectAccountByOffset(dx < 0 ? 1 : -1)");
  });

  it("scopes the transaction list to the selected account", () => {
    expect(panelSource).toContain("transactionBelongsToAccount(transaction.account_id, selectedAccountKey)");
    expect(partsSource).toContain("transactions.filter((transaction) => transactionMatchesFilter");
    // Unattributed rows are named, not silently dropped.
    expect(partsSource).toContain('data-testid="accounts-panel-unattributed-transactions"');
    expect(partsSource).toContain("isn't linked to an account, so it isn't shown here.");
  });

  it("labels the card identifier from the account kind", () => {
    expect(partsSource).toContain("accountIdentifierLabel(selected?.account_type)");
    // The wording lives in the tested helper, never inline in the component.
    expect(source).not.toContain('"Crypto Wallet Address"');
    expect(source).not.toContain('"Bank Account Number"');
  });

  it("builds the collapsed rail from Figma 3759:50795 and 3759:54130", () => {
    // The frame is anchored to whichever variant the selection calls for.
    expect(panelSource).toContain('data-node-id={agentSelected ? "3759:54130" : "3759:50795"}');
    // Section label, then the wallet avatar above the three actions, then the
    // two tab icons, each block separated by a stroke-2 rule.
    expect(panelSource).toContain("Wallet\n              </span>");
    expect(panelSource).toContain('data-testid="button-collapsed-wallet"');
    expect(panelSource).toContain('data-testid={`button-collapsed-tab-${item.tab}`}');
    // Both wallet colourways ship so the avatar follows the selected card.
    expect(panelSource).toContain("@assets/sidebar-wallet-bank-40.svg");
    expect(panelSource).toContain("@assets/sidebar-wallet-agent-40.svg");
    expect(panelSource).toContain('const railArtwork = agentSelected ? "agent" : "bank"');
  });

  it("no longer draws Add, Send or Exchange on the rail", () => {
    // They live on the card inside the Accounts popup now (Figma 6540:64571).
    // Two copies of the same unavailable action is one too many, and the
    // twelve rail artworks that drew them are no longer imported anywhere.
    expect(panelSource).not.toContain("sidebar-action-");
    expect(partsSource).not.toContain("sidebar-action-");
    expect(panelSource).not.toContain("collapsedActionItems");
    expect(railSource()).not.toContain("button-collapsed-${action");
  });

  it("draws the card on its action tray from Figma 6540:64571", () => {
    // One composite, rendered by the open panel and by the popup, so the
    // actions cannot end up on one surface and not the other.
    expect(partsSource).toContain('data-node-id="6540:64571"');
    expect(partsSource).toContain("export function AccountCardWithActions");
    expect(partsSource).toContain("absolute top-[152px] h-[138px] w-full rounded-panel bg-brain-v1headerfooterbg");
    expect(partsSource).toContain("absolute left-4 right-4 top-16 flex items-center gap-2");
    expect(panelSource).toContain("<AccountCardWithActions");
    expect(popupSource).toContain("<AccountCardWithActions");
    // The panel must not keep a second, hand-rolled copy of the tray.
    expect(panelSource).not.toContain("bg-brain-v1headerfooterbg");
    // Still honest: none of the three works yet, on either surface.
    expect(partsSource).toContain('title: "Adding accounts is not available here yet"');
    expect(partsSource).toContain('title: "Sending is not available here yet"');
    expect(partsSource).toContain('title: "Exchange is not available here yet"');
  });

  it("keeps the collapsed rail on its 40px column", () => {
    // 7px gutter each side of a 40px content column. Figma draws 56px, but
    // the shipped rail is 54px and widening it would shift the whole app
    // layout by 2px, so the gutter is what matches, not the outer width.
    const rail = railSource();
    expect(rail).toContain("w-[54px]");
    expect(rail).toContain("p-[7px]");
    expect(rail).toContain('className="flex w-[40px] flex-col items-start gap-4"');
    // A short viewport scrolls the rail instead of clipping the tab icons.
    expect(rail).toContain("overflow-y-auto");
    // 8px between the avatar and the three actions, 4px between the tabs.
    expect(rail).toContain('className="flex flex-col gap-2"');
    expect(rail).toContain('className="flex w-full flex-col gap-1"');
    // Every icon button is a 40px square; the tab glyphs are 24px in 8px pads.
    expect(rail.match(/size-10/g)?.length).toBeGreaterThanOrEqual(3);
    expect(rail).toContain("<RailTabIcon");
  });

  it("swaps the collapsed rail icons to their active artwork on hover", () => {
    // Both artworks are in the DOM; CSS decides which one shows.
    expect(panelSource).toContain("group-hover:hidden group-focus-visible:hidden");
    expect(panelSource).toContain("group-hover:block group-focus-visible:block");
    expect(panelSource).toContain("@assets/sidebar-wallet-bank-40-active.svg");
    expect(panelSource).toContain("@assets/sidebar-wallet-agent-40-active.svg");
    // The two tab glyphs reuse the open panel's own selected-tab artwork
    // rather than a second, invented highlight.
    expect(panelSource).toContain("activeIcon: assetsActiveIcon");
    expect(panelSource).toContain("activeIcon: transactionsActiveIcon");
    // …and the 24px swap is a real swap, not a background tint.
    expect(panelSource).toContain('className="block size-6 group-hover:hidden group-focus-visible:hidden"');
    expect(panelSource).toContain('className="hidden size-6 group-hover:block group-focus-visible:block"');
  });

  it("keeps the collapsed rail honest about what it can do", () => {
    const rail = railSource();
    // `aria-disabled` must not be a bare `disabled` anywhere in the rail, or
    // the explanation becomes reachable only by hovering a mouse.
    expect(rail).not.toMatch(/\n\s+disabled[\s=}]/);
    // The avatar names a real account or says which of the three reasons it
    // cannot — a finished read with no rows is not a read still running.
    expect(rail).toContain("Couldn't load accounts");
    expect(rail).toContain("Accounts are still loading");
    expect(rail).toContain("No connected accounts");
    expect(rail).toContain("aria-disabled={!selected}");
    // Every rail button hands the popup the element it was pressed on, so
    // the popup is placed against that control and not the viewport centre.
    expect(rail).toContain('setRailPopup({ kind: "account", anchor: event.currentTarget })');
    expect(rail).toContain("setRailPopup({ kind: item.tab, anchor: event.currentTarget });");
  });

  it("shortens the card identifier the way Figma 4062:57086 does", () => {
    expect(partsSource).toContain("shortenIdentifier(selected.external_account_id)");
    // Copy still hands over the full value, never the shortened one.
    expect(partsSource).toContain("navigator.clipboard.writeText(selected.external_account_id)");
  });
});

describe("rail popups (Figma 6519:52846 / 52446 / 52570)", () => {
  it("anchors each popup to its Figma node", () => {
    expect(popupSource).toContain('nodeId="6519:52846"');
    expect(popupSource).toContain('nodeId="6519:52446"');
    expect(popupSource).toContain('nodeId="6519:52570"');
    expect(popupSource).toContain('title="Accounts"');
    expect(popupSource).toContain('title="Assets"');
    expect(popupSource).toContain('title="Transactions"');
  });

  it("uses the project's Radix modal shell, not a bare div", () => {
    expect(popupSource).toContain('from "@radix-ui/react-dialog"');
    expect(popupSource).toContain("DialogPrimitive.Overlay");
    expect(popupSource).toContain("DialogPrimitive.Title");
    expect(popupSource).toContain("DialogPrimitive.Close");
    // The shell standard's overlay blur. The width is Figma's 386, not one
    // of the centred-modal widths: an anchored flyout is not a form modal,
    // which is why this file is outside modalShell's WIDTH_FILES.
    expect(popupSource).toContain("backdrop-blur-[2px]");
    expect(popupSource).toContain("w-[386px]");
    expect(popupSource).not.toContain("backdrop-blur-sm");
    // Figma's header: 20px Gilroy SemiBold in baby-blue-60 over a stroke-2 rule.
    expect(popupSource).toContain("text-[20px] font-semibold leading-6 text-brain-v1baby-blue-60");
    expect(popupSource).toContain("border-b border-solid border-brain-v1stroke-2");
  });

  it("anchors the popup to its trigger instead of the viewport centre (Figma 6540:64629)", () => {
    expect(popupSource).toContain("const POPUP_WIDTH = 386");
    expect(popupSource).toContain('data-anchored="rail"');
    expect(popupSource).toContain("anchor.getBoundingClientRect()");
    // Right edge flush against the rail's OUTER border — anchoring to the
    // button instead would slide the popup over the rail's 7px padding.
    expect(popupSource).toContain('const RAIL_FRAME_SELECTOR = "[data-rail-frame]"');
    expect(popupSource).toContain("anchor.closest(RAIL_FRAME_SELECTOR)");
    expect(popupSource).toContain("frame.left - POPUP_WIDTH");
    // …and the rail has to publish that edge, or the fallback silently
    // reverts to the button and nobody notices.
    expect(railSource()).toContain('data-rail-frame=""');
    expect(popupSource).toContain("trigger.top + trigger.height / 2 - HEADER_CENTRE");
    // `fixed` escapes the rail's clip but keeps nothing on screen, so the
    // shell owns its own clamp, its flip, and a height it can actually fit.
    expect(popupSource).toContain("window.innerWidth - VIEWPORT_MARGIN - POPUP_WIDTH");
    expect(popupSource).toContain("viewportHeight - VIEWPORT_MARGIN - height");
    expect(popupSource).toContain('window.addEventListener("resize"');
    expect(popupSource).toContain('window.addEventListener("scroll", onChange, true)');
    // The old centred placement must be gone, not merely overridden.
    expect(popupSource).not.toContain("left-[50%]");
    expect(popupSource).not.toContain("translate-x-[-50%]");
  });

  it("keeps each popup pointed at the control that opened it", () => {
    // A single shared anchor would place all three against whichever button
    // was pressed last, which is the failure this guards.
    expect(popupSource.match(/anchor: HTMLElement \| null;/g)?.length).toBe(4);
    expect(popupSource.match(/anchor=\{anchor\}/g)?.length).toBe(3);
    expect(panelSource.match(/anchor=\{railPopup\?\.anchor \?\? null\}/g)?.length).toBe(3);
  });
  it("renders the panel's own components rather than a second copy", () => {
    // If any of these stops being imported, the popup has grown its own
    // markup and the two surfaces can drift.
    for (const part of [
      "AccountCard",
      "AccountSelector",
      "AssetFilterTabs",
      "AssetsList",
      "TransactionFilterTabs",
      "TransactionNotices",
      "TransactionsList",
    ]) {
      expect(popupSource).toContain(part);
    }
    expect(popupSource).toContain('from "@/pages/sections/accountsPanelParts"');
    // No fetching here: the rail hands over the read it already has, so the
    // popup cannot disagree with the rail behind it.
    expect(popupSource).not.toContain("useQuery");
    expect(popupSource).not.toContain("usePagedLedgerRead");
  });

  it("names the four account read states apart in the account popup", () => {
    expect(popupSource).toContain("Couldn't load your accounts.");
    expect(popupSource).toContain("Accounts are still loading.");
    expect(popupSource).toContain("No connected accounts yet.");
    // The card only renders for an account that actually came back.
    expect(popupSource).toContain("{selected ? (");
    // An incomplete read says so rather than presenting a partial list as whole.
    expect(popupSource).toContain("Some accounts couldn't be loaded, so this may not be all of them.");
  });

  it("gives the Assets and Transactions popups the 48px selector variant", () => {
    // Figma 6519:52451 / 6519:52575: 8px radius, 48px tall, and the account's
    // kind beside "Your Account".
    expect(popupSource).toContain('shape="row"');
    expect(partsSource).toContain("flex h-12 w-full items-center gap-2 rounded-row bg-brain-v1baby-blue-15 p-2");
    expect(partsSource).toContain("ACCOUNT_KIND_LABEL[selected.account_type]");
    // Figma writes a literal "Debit" there; the ledger states a kind, so a
    // kindless account gets no second label rather than a guessed one.
    expect(partsSource).not.toContain('>Debit<');
    // The account popup keeps the pill.
    expect(popupSource).toContain('shape="pill"');
  });

  it("keeps each popup's ids distinct from the open panel's", () => {
    // Two elements sharing an id would leave aria-describedby pointing at
    // whichever happened to be first in the DOM.
    expect(popupSource).toContain('idPrefix="rail-accounts"');
    expect(popupSource).toContain('idPrefix="rail-assets"');
    expect(popupSource).toContain('idPrefix="rail-transactions"');
    expect(partsSource).toContain("`${idPrefix}-trades-unavailable`");
    expect(partsSource).toContain("`${idPrefix}-add-agent-unavailable`");
  });

  it("mounts the popups only where the rail can open them", () => {
    // The expanded panel already shows all three surfaces inline; a modal
    // over it would be a second copy of what is already on screen.
    const rail = railSource();
    expect(rail).toContain("{railPopups}");
    const expanded = panelSource.slice(panelSource.indexOf("\n  return (", panelSource.indexOf("  if (collapsed) {")));
    expect(expanded).not.toContain("{railPopups}");
  });
});
