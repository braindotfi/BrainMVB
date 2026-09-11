import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./AccountsPanel.tsx", import.meta.url), "utf8");

describe("Figma accounts panel", () => {
  it("keeps the Figma rail anchors and geometry", () => {
    expect(source).toContain('data-node-id="6519:54025"');
    expect(source).toContain('left-[7px] top-[7px]');
    expect(source).toContain('left-[55px] top-[7px] z-20 w-[322px]');
    expect(source).toContain('bottom-[7px] top-[63px]');
    expect(source).toContain('h-[290px] w-full max-w-[370px]');
    expect(source).toContain('h-[200px] touch-pan-y overflow-hidden rounded-panel');
    expect(source).toContain('min-h-[754px] flex-col items-center gap-[24px]');
  });

  it("reads every live account and transaction page", () => {
    expect(source).toContain('usePagedLedgerRead<BrainAccountDTO>("/api/brain/ledger/accounts", "accounts")');
    expect(source).toContain('usePagedLedgerRead<BrainTransactionDTO>("/api/brain/ledger/transactions", "transactions")');
    expect(source).toContain("Some accounts couldn't be loaded");
    expect(source).toContain("Some transactions couldn't be loaded");
    expect(source).not.toContain("Transactions aren't available here yet");
  });

  it("uses durable local artwork and exposes real interaction state", () => {
    expect(source).not.toContain("www.figma.com/api/mcp/asset");
    expect(source).toContain("@assets/BankCard_1789001100273.png");
    expect(source).toContain('aria-expanded={accountMenuOpen}');
    expect(source).toContain('aria-pressed={filter === item}');
    expect(source).toContain("navigator.clipboard.writeText(selected.external_account_id)");
    expect(source).toContain('data-testid="account-card-linear-stroke"');
    // Measured off Figma 6519:54130: corner-to-corner, bright at both ends,
    // transparent through the middle. A single-direction fade is wrong.
    expect(source).toContain("linear-gradient(to bottom right, rgba(255, 149, 0, 0.45) 0%");
    expect(source).toContain("rgba(255, 149, 0, 0.58) 100%)");
    expect(source).not.toContain("linear-gradient(135deg");
  });

  it("renders transaction rows to Figma 4062:56400", () => {
    // 40px tinted circle + 20px arrow, outgoing arrow is the down-right glyph flipped.
    expect(source).toContain("@assets/tx-arrow-out.svg");
    expect(source).toContain("@assets/tx-arrow-in.svg");
    expect(source).toContain("@assets/tx-dot.svg");
    expect(source).toContain('"bg-brain-v1dark-pink-red"');
    expect(source).toContain('"bg-brain-v1dark-green"');
    expect(source).toContain('style={flow === "out" ? { transform: "scaleY(-1)" } : undefined}');
    // 20px JetBrains Mono amount, red out / green in.
    expect(source).toContain("text-[20px] font-medium leading-5");
    expect(source).toContain('"text-brain-v1pink-red"');
    expect(source).toContain('"text-brain-v1asset-green"');
    expect(source).toContain("formatTransactionAmount(transaction.amount, transaction.currency, flow)");
    // Every figure and date goes through the tested formatters, never a local
    // ad-hoc one. Their behaviour is covered in lib/accountsPanelFormat.test.ts.
    expect(source).toContain('from "@/lib/accountsPanelFormat"');
    expect(source).not.toMatch(/function (transactionMeta|shortenIdentifier|signedTransactionLabel)\(/);
  });

  it("renders and wires the four transaction filters from Figma 4062:56277", () => {
    expect(source).toContain('data-node-id="2663:26526"');
    expect(source).toContain('{ value: "all", label: "All" }');
    expect(source).toContain('{ value: "trades", label: "Trades" }');
    expect(source).toContain('{ value: "deposits", label: "Deposits" }');
    expect(source).toContain('{ value: "withdrawals", label: "Withdrawals" }');
    expect(source).toContain('aria-disabled={item.value === "trades" ? "true" : undefined}');
    expect(source).toContain('aria-describedby={item.value === "trades" ? "accounts-trades-unavailable" : undefined}');
    expect(source).toContain('role="status"');
    expect(source).toContain('item.value === "deposits" ? "w-[99px]" : "w-[124px]"');
    expect(source).toContain("transactionMatchesFilter(transaction.direction, transactionFilter)");
    expect(source).toContain("filteredTransactions.map");
    expect(source).toContain("Other transaction types are hidden by this filter.");
    expect(source).toContain("Matching activity may be missing from this filtered view.");
  });

  it("restyles the account selector to Figma 3759:50250", () => {
    expect(source).toContain('data-node-id="3759:50251"');
    // Closed control: 40px pill on baby-blue-15 with the baby-blue-30 stroke.
    expect(source).toContain("rounded-[40px] border border-solid border-brain-v1baby-blue-30 bg-brain-v1baby-blue-15");
    // Open panel: 12px radius, stroke-2 border, dropdown background, 8px padding.
    expect(source).toContain("rounded-row border border-solid border-brain-v1stroke-2 bg-brain-v1highlight-dropdown-bg p-2");
    // Rows carry the identifier chip and the selected row carries the tick.
    expect(source).toContain("shortenIdentifier(account.external_account_id)");
    expect(source).toContain('aria-checked={account.id === selected?.id}');
    expect(source).toContain('alt="Selected"');
    // The purple row is rendered, but it is honestly inert rather than a
    // placeholder that pretends to create an account.
    expect(source).toContain('data-testid="button-add-agent-account"');
    expect(source).toContain('aria-disabled="true"');
    expect(source).toContain("Agent accounts can't be created from here yet.");
    expect(source).toContain("@assets/dropdown-add-agent.svg");
    expect(source).toContain("@assets/wallet-icon-bank-32.svg");
    expect(source).toContain("@assets/wallet-icon-agent-32.svg");
  });

  it("gives an agent account the green card from Figma 3759:50590", () => {
    expect(source).toContain("isAgentAccount");
    expect(source).toContain('agentSelected ? "bg-brain-v1dark-green" : "bg-brain-v1dark-orange"');
    expect(source).toContain("@assets/account-card-glow-green.svg");
    expect(source).toContain("@assets/wallet-icon-agent-48.svg");
    expect(source).toContain("linear-gradient(to bottom right, rgba(66, 191, 35, 0.45) 0%");
    expect(source).toContain("rgba(66, 191, 35, 0.58) 100%)");
    // Green captions use the asset-green token, orange keeps light-orange.
    expect(source).toContain('agentSelected ? "text-brain-v1asset-green" : "text-brain-v1light-orange"');
    // The second column only appears when the ledger states a status.
    expect(source).toContain("agentSelected && selected?.status");
  });

  it("makes the card pagination selectable and swipeable", () => {
    expect(source).toContain('data-testid="account-card-pagination"');
    expect(source).toContain("onClick={() => setSelectedAccountId(account.id)}");
    // One dot per account, not a hardcoded three.
    expect(source).not.toContain('<span className="size-[6px] rounded-full bg-brain-v1light-orange" />');
    expect(source).toContain("accounts.map((account, index) =>");
    // Keyboard and pointer both move the selection.
    expect(source).toContain('event.key === "ArrowRight"');
    expect(source).toContain("onPointerDown={onCardPointerDown}");
    expect(source).toContain("onPointerUp={onCardPointerUp}");
    expect(source).toContain("selectAccountByOffset(dx < 0 ? 1 : -1)");
  });

  it("scopes the transaction list to the selected account", () => {
    expect(source).toContain("transactionBelongsToAccount(transaction.account_id, selectedAccountKey)");
    expect(source).toContain("accountTransactions.filter((transaction) => transactionMatchesFilter");
    // Unattributed rows are named, not silently dropped.
    expect(source).toContain('data-testid="accounts-panel-unattributed-transactions"');
    expect(source).toContain("isn't linked to an account, so it isn't shown here.");
  });

  it("labels the card identifier from the account kind", () => {
    expect(source).toContain("accountIdentifierLabel(selected?.account_type)");
    // The wording lives in the tested helper, never inline in the component.
    expect(source).not.toContain('"Crypto Wallet Address"');
    expect(source).not.toContain('"Bank Account Number"');
  });

  it("builds the collapsed rail from Figma 3759:50795 and 3759:54130", () => {
    // The frame is anchored to whichever variant the selection calls for.
    expect(source).toContain('data-node-id={agentSelected ? "3759:54130" : "3759:50795"}');
    // Section label, then the wallet avatar above the three actions, then the
    // two tab icons, each block separated by a stroke-2 rule.
    expect(source).toContain("Wallet\n              </span>");
    expect(source).toContain('data-testid="button-collapsed-wallet"');
    expect(source).toContain('data-testid={`button-collapsed-${action.label.toLowerCase()}`}');
    expect(source).toContain('data-testid={`button-collapsed-tab-${item.tab}`}');
    // Every rail icon ships in both colourways so the artwork follows the card.
    expect(source).toContain("@assets/sidebar-wallet-bank-40.svg");
    expect(source).toContain("@assets/sidebar-wallet-agent-40.svg");
    expect(source).toContain("@assets/sidebar-action-add-bank.svg");
    expect(source).toContain("@assets/sidebar-action-send-agent.svg");
    expect(source).toContain("@assets/sidebar-action-exchange-agent.svg");
    expect(source).toContain('const railArtwork = agentSelected ? "agent" : "bank"');
    expect(source).toContain("action[railArtwork]");
  });

  it("swaps the collapsed rail icons to their active artwork on hover", () => {
    // Both artworks are in the DOM; CSS decides which one shows.
    expect(source).toContain("group-hover:hidden group-focus-visible:hidden");
    expect(source).toContain("group-hover:block group-focus-visible:block");
    expect(source).toContain("@assets/sidebar-action-add-bank-active.svg");
    expect(source).toContain("@assets/sidebar-action-send-bank-active.svg");
    expect(source).toContain("@assets/sidebar-action-exchange-bank-active.svg");
    expect(source).toContain("@assets/sidebar-action-add-agent-active.svg");
    expect(source).toContain("@assets/sidebar-wallet-bank-40-active.svg");
    expect(source).toContain("@assets/sidebar-wallet-agent-40-active.svg");
  });

  it("keeps the collapsed rail honest about what it can do", () => {
    // The three actions are as unavailable here as in the open panel.
    expect(source).toContain('aria-label={action.title}');
    expect(source).toContain("cursor-not-allowed rounded-full");
    // The avatar names a real account or says why it cannot.
    expect(source).toContain("Couldn't load accounts");
    expect(source).toContain("Accounts are still loading");
    expect(source).toContain("disabled={!selected}");
    // The tab icons do something real: open the panel on that tab.
    expect(source).toContain("setTab(item.tab);");
  });

  it("shortens the card identifier the way Figma 4062:57086 does", () => {
    expect(source).toContain("shortenIdentifier(selected.external_account_id)");
    // Copy still hands over the full value, never the shortened one.
    expect(source).toContain("navigator.clipboard.writeText(selected.external_account_id)");
  });
});