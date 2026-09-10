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
    expect(source).toContain('h-[200px] overflow-hidden rounded-panel');
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

  it("shortens the card identifier the way Figma 4062:57086 does", () => {
    expect(source).toContain("shortenIdentifier(selected.external_account_id)");
    // Copy still hands over the full value, never the shortened one.
    expect(source).toContain("navigator.clipboard.writeText(selected.external_account_id)");
  });
});