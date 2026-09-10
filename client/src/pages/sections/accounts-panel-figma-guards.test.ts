import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./AccountsPanel.tsx", import.meta.url), "utf8");

describe("Figma accounts panel", () => {
  it("keeps the Figma rail anchors and geometry", () => {
    expect(source).toContain('data-node-id="6519:54025"');
    expect(source).toContain('left-[7px] top-[7px]');
    expect(source).toContain('left-[55px] top-[7px] z-20 w-[322px]');
    expect(source).toContain('bottom-[7px] top-[55px]');
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
    expect(source).toContain("linear-gradient(135deg");
  });
});