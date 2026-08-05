import { describe, it, expect } from "vitest";
import { subLabel, dueLabel, amountLabel } from "./obligationRows";

const fmt = (n: string | number) =>
  `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The row's trailing detail. Small, but it is the only place the obligation's KIND
 * (bill / payroll / tax) is visible, and the reference tenant contains a counterparty
 * literally named "Payroll" — which is what makes the duplicate case real rather than
 * hypothetical.
 */
describe("subLabel", () => {
  it("shows the obligation kind alongside a resolved counterparty", () => {
    expect(subLabel("bill", "CloudOps Inc", "cp_1")).toBe("Bill");
    expect(subLabel("tax", "IRS", "cp_2")).toBe("Tax");
  });

  it("drops the kind when it would merely restate the name", () => {
    expect(subLabel("payroll", "Payroll", "cp_3")).toBe("");
    expect(subLabel("PAYROLL", "payroll", "cp_3")).toBe("");
    expect(subLabel("payroll", "  Payroll  ", "cp_3")).toBe("");
  });

  it("falls back to the raw id when the counterparty could not be resolved", () => {
    // Keeps an unresolved row traceable: the bulk counterparty read is capped
    // upstream, so on a large tenant some ids genuinely will not resolve.
    expect(subLabel("bill", null, "cp_01KZ7MYT7NWB7BH39VFZF5V8M8")).toBe("cp_01KZ7MYT7NWB7BH39VFZF5V8M8");
  });

  it("still names the kind when there is neither a name nor an id", () => {
    expect(subLabel("bill", null, null)).toBe("Bill");
  });

  it("shows nothing rather than guessing when the record carried no kind", () => {
    // `kind` is null whenever the wire sent no `type`, or sent a direction word there.
    expect(subLabel(null, "CloudOps Inc", "cp_1")).toBe("");
    expect(subLabel(null, null, null)).toBe("");
  });

  it("still surfaces the id for an unresolved counterparty with no kind", () => {
    expect(subLabel(null, null, "cp_9")).toBe("cp_9");
  });
});

describe("amountLabel", () => {
  it("strips the wire format's trailing precision instead of printing it", () => {
    // The defect: passing the raw string through rendered "$4,800.00000000".
    expect(amountLabel("4800.00000000", fmt)).toBe("$4,800.00");
    expect(amountLabel("8894.63000000", fmt)).toBe("$8,894.63");
  });

  it("says so rather than rendering $NaN when the amount is unparseable", () => {
    expect(amountLabel("not-a-number", fmt)).toBe("Amount unavailable");
    expect(amountLabel("", fmt)).toBe("Amount unavailable");
  });
});

describe("dueLabel", () => {
  it("formats an ISO timestamp as a plain date", () => {
    expect(dueLabel("2026-08-09T00:14:08.226Z")).toBe("Due 9 Aug 2026");
    expect(dueLabel("2026-04-15T00:00:00.000Z")).toBe("Due 15 Apr 2026");
  });

  it("does not invent a date it does not have", () => {
    expect(dueLabel(null)).toBe("No due date recorded");
    expect(dueLabel("not-a-date")).toBe("No due date recorded");
  });
});
