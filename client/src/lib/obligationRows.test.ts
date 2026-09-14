import { describe, it, expect } from "vitest";
import { subLabel, dueLabel, glanceAmountLabel, pilledAmountLabel, sourceAmountLabel, statusColors, statusChip } from "./obligationRows";

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

/**
 * The glance formatter — list rows, the popup's one-line summary, the running total.
 *
 * It replaced `amountLabel(raw, format)`, which handed the record's own amount to the
 * display-currency converter. That is what made a EUR bill render as a dollar figure
 * in the Payables list while the popup it opened quoted euros.
 */
describe("glanceAmountLabel", () => {
  it("strips the wire format's trailing precision instead of printing it", () => {
    // The original defect this formatter inherited: "$4,800.00000000".
    expect(glanceAmountLabel("4800.00000000", "USD")).toBe("$4,800.00");
    expect(glanceAmountLabel("8894.63000000", "USD")).toBe("$8,894.63");
  });

  it("quotes a foreign record in ITS currency, never in dollars", () => {
    // The row and the popup previously disagreed here: "$8,894.63" against "€8,894.63 EUR".
    expect(glanceAmountLabel("8894.63000000", "EUR")).toBe("€8,894.63 EUR");
    expect(glanceAmountLabel("1200", "SEK")).toBe("1,200.00 SEK");
  });

  it("drops the code only for USD, where the symbol already carries it", () => {
    expect(glanceAmountLabel("100", "usd")).toBe("$100.00");
    // Not a prefix match on the symbol: every other currency keeps its code, because a
    // bare "€8,894.63" in a column of dollar rows is the confusion this prevents.
    expect(glanceAmountLabel("100", "EUR")).toBe("€100.00 EUR");
  });

  it("says so rather than rendering $NaN when the amount is unparseable", () => {
    expect(glanceAmountLabel("not-a-number", "USD")).toBe("Amount unavailable");
    expect(glanceAmountLabel("", "USD")).toBe("Amount unavailable");
    expect(glanceAmountLabel(null, "EUR")).toBe("Amount unavailable");
  });
});

describe("pilledAmountLabel — the figure beside a currency pill", () => {
  it("omits the code, because the pill next to it states the code", () => {
    expect(pilledAmountLabel("8894.63000000", "EUR")).toBe("€8,894.63");
    expect(pilledAmountLabel("1200", "SEK")).toBe("1,200.00");
    expect(pilledAmountLabel("4800.00000000", "USD")).toBe("$4,800.00");
  });

  it("is the same digits as the other two labels — never a converted figure", () => {
    /* The bill popup's header used to run the amount through the display-currency
       converter and then label the result with the record's own code, so the popup
       and the row that opened it quoted two different numbers for one invoice. */
    const raw = "8894.63000000";
    expect(glanceAmountLabel(raw, "EUR")).toBe(`${pilledAmountLabel(raw, "EUR")} EUR`);
    expect(sourceAmountLabel(raw, "EUR")).toBe(`${pilledAmountLabel(raw, "EUR")} EUR`);
  });

  it("refuses an unparseable amount rather than showing a bare symbol", () => {
    expect(pilledAmountLabel("not-a-number", "EUR")).toBe("Amount unavailable");
    expect(pilledAmountLabel(null, "EUR")).toBe("Amount unavailable");
  });
});

/**
 * The source-currency formatter, used wherever a figure is quoted as the record
 * states it rather than in whatever currency the user is browsing in.
 */
describe("sourceAmountLabel", () => {
  it("names the currency the record is actually denominated in", () => {
    // The defect: useCurrency().format assumes its input is USD and converts. Passing
    // a EUR obligation through it and appending the record's code rendered
    // "$8,894.63 EUR" — a converted number labelled with the currency it came FROM.
    expect(sourceAmountLabel("8894.63000000", "EUR")).toBe("€8,894.63 EUR");
    expect(sourceAmountLabel("8894.63000000", "USD")).toBe("$8,894.63 USD");
  });

  it("still names a currency it has no symbol for", () => {
    // "1,200.00" on its own names no currency at all.
    expect(sourceAmountLabel("1200", "SEK")).toBe("1,200.00 SEK");
    expect(sourceAmountLabel("1200", "sek")).toBe("1,200.00 SEK");
  });

  it("does not convert, whatever the display currency is set to", () => {
    // There is no rate table for arbitrary currencies, and this figure is what a
    // third party is owed. The only honest render is the number on the record.
    expect(sourceAmountLabel("100.00", "EUR")).toContain("100.00");
  });

  it("keeps precision the value actually carries instead of rounding it away", () => {
    expect(sourceAmountLabel("4800.00000000", "USD")).toBe("$4,800.00 USD");
    expect(sourceAmountLabel("1234.5", "USD")).toBe("$1,234.50 USD");
    // Four real decimal places survive; truncating to two would restate the debt.
    expect(sourceAmountLabel("1234.5678", "USD")).toBe("$1,234.5678 USD");
  });

  it("groups thousands without routing the value through Number()", () => {
    // A value past 2^53 would lose its last digits as a float.
    expect(sourceAmountLabel("9007199254740993.01", "USD")).toBe("$9,007,199,254,740,993.01 USD");
  });

  it("handles a negative amount without losing the sign", () => {
    expect(sourceAmountLabel("-250.00", "USD")).toBe("-$250.00 USD");
  });

  it("refuses rather than rendering a zero or a NaN it was never given", () => {
    for (const bad of ["", "   ", "not-a-number", "1.2.3", "$100", null]) {
      expect(sourceAmountLabel(bad, "USD")).toBe("Amount unavailable");
    }
    // A real zero is still a real figure.
    expect(sourceAmountLabel("0", "USD")).toBe("$0.00 USD");
  });

  it("renders the number when the record carries no currency at all", () => {
    // Inventing "$" for a currency-less record would assert dollars.
    expect(sourceAmountLabel("100", null)).toBe("100.00");
    expect(sourceAmountLabel("100", "  ")).toBe("100.00");
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

/**
 * The status badge's colours and the detail popup's header chip come from here for
 * one reason: they used to be computed separately, and the list said "Due" for a
 * record whose popup said "Overdue". One record, one screen, two answers.
 */
describe("payable status presentation", () => {
  it("gives the popup chip the same colours the list badge uses", () => {
    const c = statusColors("overdue");
    expect(statusChip("overdue")).toEqual({
      text: "Overdue",
      color: c.fg,
      bg: c.bg,
      border: c.border,
    });
  });

  it("reports the status brain-core sent, not one inferred from a date", () => {
    // A payable dated in the past that brain-core still calls `due` is "Due" here.
    // Whether that is right is brain-core's call; contradicting it on one surface
    // while echoing it on another is not.
    expect(statusChip("due")?.text).toBe("Due");
    expect(statusChip("upcoming")?.text).toBe("Upcoming");
  });

  it("colours an unrecognised status neutrally rather than dropping it", () => {
    // Verbatim apart from casing — the shared capitalCase leaves the underscore
    // alone. Pinned as-is rather than prettified: an unknown status is brain-core's
    // word, and reshaping it here would only make the two surfaces diverge again.
    expect(statusChip("in_dispute")?.text).toBe("In_dispute");
    expect(statusColors("in_dispute")).toEqual(statusColors("upcoming"));
  });

  it("renders no chip at all when there is no status", () => {
    // An empty pill would read as a state.
    expect(statusChip("")).toBeNull();
    expect(statusChip("   ")).toBeNull();
  });

  it("is case- and whitespace-insensitive, like the badge lookup", () => {
    expect(statusColors(" OVERDUE ")).toEqual(statusColors("overdue"));
  });
});
