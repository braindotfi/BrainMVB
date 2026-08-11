import { describe, it, expect } from "vitest";
import { cashEventRecordIndex } from "./cashEventRecords";
import { CASH_EVENT_PREFIX } from "./cashProjection";
import type { RawObligation } from "./brainObligations";
import type { RawInvoice } from "./receivables";
import type { BrainInvoiceDTO } from "@/components/BillDetailPopup";

/* Fixtures use the wire spellings deliberately: obligations arrive unnormalized
   (amount_due is a string, direction rides on `type`), and a resolver that only
   works against tidied-up objects would pass here and fail on the real feed. */

const obligation = (o: Partial<RawObligation> = {}): RawObligation => ({
  id: "obl_1",
  type: "payable",
  kind: "bill",
  counterparty_id: "cp_1",
  amount_due: "187000.00",
  currency: "USD",
  due_date: "2026-08-13",
  status: "pending",
  ...o,
});

const bill = (b: Partial<BrainInvoiceDTO> = {}): BrainInvoiceDTO => ({
  id: "inv_ap_1",
  invoice_number: "AP-1",
  counterparty_id: "cp_1",
  amount_due: "187000.00",
  currency: "USD",
  due_date: "2026-08-13",
  status: "pending",
  ...b,
});

const arInvoice = (i: Partial<RawInvoice> = {}): RawInvoice => ({
  id: "inv_ar_1",
  invoice_number: "AR-9",
  counterparty_id: "cp_2",
  amount_due: "5000.00",
  amount_paid: "0",
  currency: "USD",
  due_date: "2026-08-20",
  status: "sent",
  metadata: { scenario: "ar" },
  ...i,
});

const OBL = `${CASH_EVENT_PREFIX.obligation}obl_1`;
const AR = `${CASH_EVENT_PREFIX.invoice}inv_ar_1`;

describe("cashEventRecordIndex", () => {
  it("opens a payable with no invoice behind it as a payable", () => {
    const idx = cashEventRecordIndex({ obligations: [obligation()], invoices: [], bills: [] });
    const hit = idx.get(OBL);
    expect(hit?.kind).toBe("payable");
    if (hit?.kind === "payable") {
      expect(hit.payable.id).toBe("obl_1");
      /* The invoice feed WAS read and held nothing matching, so this is a fact,
         not an unknown — the popup may say so. */
      expect(hit.invoicesUnknown).toBe(false);
    }
  });

  /* The Payables tab makes exactly this choice for exactly this row. If the two
     diverge, the same debt shows a different record depending on the screen it
     was opened from, and neither screen looks wrong by itself. */
  it("opens a payable that IS backed by an invoice as the bill, matching the Ledger", () => {
    const idx = cashEventRecordIndex({ obligations: [obligation()], invoices: [], bills: [bill()] });
    const hit = idx.get(OBL);
    expect(hit?.kind).toBe("bill");
    if (hit?.kind === "bill") {
      expect(hit.bill.id).toBe("inv_ap_1");
      expect(hit.obligation.id).toBe("obl_1");
    }
  });

  /* A near-miss must NOT be presented as this debt's invoice: the popup would
     show another record's number, PO and document under this row's name. */
  it("does not attach an invoice that differs in amount", () => {
    const idx = cashEventRecordIndex({
      obligations: [obligation()],
      invoices: [],
      bills: [bill({ amount_due: "187000.01" })],
    });
    expect(idx.get(OBL)?.kind).toBe("payable");
  });

  it("opens a customer invoice as a receivable", () => {
    const idx = cashEventRecordIndex({ obligations: [], invoices: [arInvoice()], bills: [] });
    const hit = idx.get(AR);
    expect(hit?.kind).toBe("receivable");
    if (hit?.kind === "receivable") {
      expect(hit.receivable.id).toBe("inv_ar_1");
      expect(hit.receivable.outstanding).toBe(5000);
    }
  });

  /* The unresolvable case is the one that decides whether a chip is a control
     at all, so it is pinned in every direction it can happen. */
  describe("returns nothing to open when it cannot be sure", () => {
    it("for an event whose record is not in the feed", () => {
      const idx = cashEventRecordIndex({ obligations: [obligation()], invoices: [], bills: [] });
      expect(idx.get(`${CASH_EVENT_PREFIX.obligation}obl_missing`)).toBeUndefined();
      expect(idx.get(`${CASH_EVENT_PREFIX.invoice}inv_missing`)).toBeUndefined();
    });

    it("when the feeds have not been read at all", () => {
      expect(cashEventRecordIndex({ obligations: null, invoices: null, bills: null }).size).toBe(0);
      expect(cashEventRecordIndex({ obligations: undefined, invoices: undefined, bills: undefined }).size).toBe(0);
    });

    it("for an unprefixed or foreign id", () => {
      const idx = cashEventRecordIndex({ obligations: [obligation()], invoices: [arInvoice()], bills: [] });
      expect(idx.get("obl_1")).toBeUndefined();
      expect(idx.get("txn:obl_1")).toBeUndefined();
    });
  });

  /* An unread invoice DTO feed is not evidence that nothing backs the payable.
     Without this the popup tells the tenant a bill has no invoice on file
     whenever that endpoint is merely down. */
  it("marks the invoice question unknown when the bill feed was never read", () => {
    const idx = cashEventRecordIndex({ obligations: [obligation()], invoices: [], bills: null });
    const hit = idx.get(OBL);
    expect(hit?.kind).toBe("payable");
    if (hit?.kind === "payable") expect(hit.invoicesUnknown).toBe(true);
  });

  /* Settled records leave the projection, so they must leave the index with it —
     otherwise a chip could outlive the row it points at. */
  it("indexes only the records the projection itself would draw", () => {
    const idx = cashEventRecordIndex({
      obligations: [obligation({ id: "obl_paid", status: "paid" })],
      invoices: [arInvoice({ id: "inv_paid", status: "paid" })],
      bills: [],
    });
    expect(idx.size).toBe(0);
  });

  /* Two identical debts, one invoiced: matching is one-for-one, so exactly one
     opens the bill and the other stays a payable rather than both claiming it. */
  it("never lets one invoice back two obligations", () => {
    const idx = cashEventRecordIndex({
      obligations: [obligation({ id: "obl_a" }), obligation({ id: "obl_b" })],
      invoices: [],
      bills: [bill()],
    });
    const kinds = [
      idx.get(`${CASH_EVENT_PREFIX.obligation}obl_a`)?.kind,
      idx.get(`${CASH_EVENT_PREFIX.obligation}obl_b`)?.kind,
    ].sort();
    expect(kinds).toEqual(["bill", "payable"]);
  });
});
