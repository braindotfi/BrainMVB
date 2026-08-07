import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  debtKey,
  isoDay,
  absAmount,
  matchObligationsToInvoices,
  type DebtObligationLike,
  type DebtInvoiceLike,
} from "./debtIdentity";

/* An obligation carries no reference to the invoice that billed it — `source_ids`
   points at the raw document — so the link is inferred from the debt itself. These
   pin the inference, because getting it wrong sends a row to a popup describing a
   DIFFERENT record's invoice number, PO and document. */

const OBL = (o: Partial<DebtObligationLike> & { id: string }): DebtObligationLike => ({
  counterparty_id: "cp_1",
  amount_due: "100.00",
  due_date: "2026-08-01T00:00:00.000Z",
  ...o,
});

const INV = (o: Partial<DebtInvoiceLike> & { id: string }): DebtInvoiceLike => ({
  counterparty_id: "cp_1",
  amount_due: "100.00",
  due_date: "2026-08-01T00:00:00.000Z",
  status: "sent",
  metadata: { scenario: "ap" },
  ...o,
});

describe("debt identity", () => {
  it("reduces a timestamp to its day, because the two feeds differ in precision", () => {
    // Observed live: the obligation says 00:14:08.226Z, the invoice says the same —
    // but nothing guarantees that, and a mismatch of milliseconds is not two debts.
    expect(isoDay("2026-08-01T00:14:08.226Z")).toBe("2026-08-01");
    expect(isoDay("2026-08-01")).toBe("2026-08-01");
    expect(isoDay(null)).toBe("");
  });

  it("treats a non-numeric amount as 0 rather than NaN", () => {
    // NaN.toFixed(2) is "NaN", which is equal to itself, so a NaN amount would make
    // every junk-amount record match every other one.
    expect(absAmount("nonsense")).toBe(0);
    expect(absAmount("-4800.00000000")).toBe(4800);
    expect(absAmount(4800)).toBe(4800);
  });

  it("ignores trailing-zero differences in the wire amount", () => {
    // brain-core sends "4800.00000000" on one feed and "4800.00" on the other.
    expect(debtKey("cp_1", absAmount("4800.00000000"), "2026-08-01")).toBe(
      debtKey("cp_1", absAmount("4800.00"), "2026-08-01"),
    );
  });
});

describe("matching payables to the invoice that billed them", () => {
  it("links an obligation to its invoice twin", () => {
    const inv = INV({ id: "inv_1" });
    const m = matchObligationsToInvoices([OBL({ id: "obl_1" })], [inv]);
    expect(m.get("obl_1")).toBe(inv);
  });

  it("matches across the precision difference the two feeds actually carry", () => {
    const inv = INV({ id: "inv_1", due_date: "2026-08-01T00:14:08.226Z" });
    const m = matchObligationsToInvoices([OBL({ id: "obl_1", due_date: "2026-08-01" })], [inv]);
    expect(m.get("obl_1")).toBe(inv);
  });

  it("leaves payroll and tax unmatched — they were never invoiced", () => {
    const m = matchObligationsToInvoices(
      [OBL({ id: "payroll", counterparty_id: "cp_staff", amount_due: "33564.38" })],
      [INV({ id: "inv_1" })],
    );
    expect(m.has("payroll")).toBe(false);
  });

  it("spends each invoice once, so a second identical debt is not claimed as invoiced", () => {
    /* A tenant owing the same counterparty the same amount on the same day twice —
       one invoiced, one not — has TWO debts. A presence check would mark both as
       invoiced and open the wrong record's invoice document for the second. */
    const inv = INV({ id: "inv_1" });
    const m = matchObligationsToInvoices([OBL({ id: "first" }), OBL({ id: "second" })], [inv]);
    expect(m.get("first")).toBe(inv);
    expect(m.has("second")).toBe(false);
  });

  it("matches two invoices to two identical obligations", () => {
    const m = matchObligationsToInvoices(
      [OBL({ id: "first" }), OBL({ id: "second" })],
      [INV({ id: "inv_1" }), INV({ id: "inv_2" })],
    );
    expect(m.size).toBe(2);
    expect(new Set([m.get("first")?.id, m.get("second")?.id])).toEqual(new Set(["inv_1", "inv_2"]));
  });

  it("never backs a payable with a receivable invoice", () => {
    // An AR invoice is money owed TO the tenant. Presenting one as the bill behind a
    // payable would invert who owes whom. AR is a POSITIVE marker (see lib/liabilities.ts)
    // — an invoice only counts as receivable when `scenario` is literally "ar".
    const m = matchObligationsToInvoices(
      [OBL({ id: "obl_1" })],
      [INV({ id: "inv_ar", metadata: { scenario: "ar" } })],
    );
    expect(m.has("obl_1")).toBe(false);
  });

  it("still backs a payable with an unmarked invoice — AP is never positively marked on a real tenant", () => {
    const inv = INV({ id: "inv_1", metadata: null });
    const m = matchObligationsToInvoices([OBL({ id: "obl_1" })], [inv]);
    expect(m.get("obl_1")).toBe(inv);
  });

  it("never backs an outstanding payable with an already-paid invoice", () => {
    const m = matchObligationsToInvoices(
      [OBL({ id: "obl_1" })],
      [INV({ id: "inv_paid", status: "paid" })],
    );
    expect(m.has("obl_1")).toBe(false);
  });

  it("returns an empty map when the invoice feed could not be read", () => {
    // The caller must render this as "unknown", not as "no invoice exists".
    expect(matchObligationsToInvoices([OBL({ id: "obl_1" })], null).size).toBe(0);
    expect(matchObligationsToInvoices(null, [INV({ id: "inv_1" })]).size).toBe(0);
  });
});

/* ── the two popups must stay one popup ────────────────────────────────────────
   The Payables tab opens Bill Details for an invoice-backed row and a reduced
   version of the SAME shell for a row with no invoice. If either grows its own
   frame the two drift apart visually, which is the thing this design was meant to
   avoid, and no unit test of behaviour would notice. */

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, p), "utf8");

describe("payable and bill detail popups share one shell", () => {
  const BILL = "../components/BillDetailPopup.tsx";
  const PAYABLE = "../components/PayableDetailPopup.tsx";

  it("both build their frame from components/detailPopup", () => {
    for (const f of [BILL, PAYABLE]) {
      expect(read(f), `${f} must use the shared shell`).toContain("DetailPopupShell");
      expect(read(f), `${f} must import it rather than redefine it`).toMatch(
        /from "@\/components\/detailPopup"/,
      );
    }
  });

  it("neither popup declares its own dialog frame", () => {
    // A local DialogPrimitive.Content is how a shared shell quietly becomes two.
    for (const f of [BILL, PAYABLE]) {
      expect(read(f), `${f} must not hand-roll the modal frame`).not.toContain(
        "DialogPrimitive.Content",
      );
    }
  });

  it("the no-invoice popup shows no invoice-only field", () => {
    /* Omitted, not blanked: rendering "Invoice  -" claims an invoice exists and its
       number is missing. These are the fields the user asked to be left out. */
    const src = read(PAYABLE);
    for (const banned of ["invoice_number", "View invoice document", "DocumentViewerPopup", '"PO"']) {
      expect(src, `PayableDetailPopup must not render ${banned}`).not.toContain(banned);
    }
  });

  it("the no-invoice popup distinguishes 'no invoice' from 'could not check'", () => {
    /* With the invoice feed down every row looks uninvoiced. Asserting "has none on
       file" then would be a false statement produced by an outage. */
    expect(read(PAYABLE)).toContain("invoicesUnknown");
    expect(read("../components/PayablesTab.tsx"), "the tab must pass the unknown state through")
      .toContain("invoicesUnknown");
  });

  it("the no-invoice popup takes its header chip from the record's status", () => {
    /* Not from the due date. A tax payable dated in the past but still marked `due`
       showed "Due" in the list and "Overdue" in the popup opened from it. */
    const src = read(PAYABLE);
    expect(src).toContain("statusChip(payable.status)");
    expect(src, "a date-derived chip is what caused the disagreement").not.toContain("dueChip");
  });

  it("Payables rows are actually openable", () => {
    // The gap this closed: the rows rendered as plain divs with no handler.
    const src = read("../components/PayablesTab.tsx");
    expect(src).toContain("setOpenBill");
    expect(src).toContain("setOpenPayable");
    expect(src, "rows need a keyboard path, not just onClick").toContain("onKeyDown");
  });
});
