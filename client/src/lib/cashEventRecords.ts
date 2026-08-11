/**
 * Turning a cash-projection event back into the ledger record it stands for.
 *
 * Every chip in Overview's projection strip is drawn from a record that already
 * has a detail popup on the Ledger page. This module is the join: it takes the
 * same reads the projection is built from and returns, per event id, which
 * popup opens and with which record.
 *
 * ## Why it mirrors the Ledger instead of deciding for itself
 *
 * A payable backed by an invoice opens the Bill popup; one with no invoice
 * behind it opens the Payable popup. That choice is made on the Payables tab by
 * `matchObligationsToInvoices`, and it is reproduced here by CALLING that same
 * function rather than re-deriving the rule. If the two ever disagreed, the same
 * debt would open two different-looking records depending on which screen you
 * tapped it from, and neither screen would look wrong on its own.
 *
 * ## Why a missing record is a first-class outcome
 *
 * Given today's wiring every event DOES resolve: the index is built from the
 * same two feeds, through the same transforms, that the projection drew the
 * events from, so it is a superset of what the strip can show. A missing bill
 * DTO only downgrades a bill to a payable — it never leaves an event without a
 * record.
 *
 * That is a property of how the caller happens to be wired, not a guarantee, and
 * it is one line away from stopping being true — sourcing either side from a
 * different read, or filtering one and not the other, breaks it silently and in
 * the direction that opens SOMETHING for a record that is no longer there. So a
 * miss is a real return value rather than an assertion, and the caller must
 * render the chip as plainly not tappable. An empty popup, or one showing a
 * neighbouring record, is worse than a chip that does not offer to open.
 */

import { CASH_EVENT_PREFIX } from "@/lib/cashProjection";
import { payableObligations } from "@/lib/liabilities";
import { arReceivables, type RawInvoice, type Receivable } from "@/lib/receivables";
import { matchObligationsToInvoices } from "@/lib/debtIdentity";
import type { RawObligation, Obligation } from "@/lib/brainObligations";
import type { BrainInvoiceDTO } from "@/components/BillDetailPopup";

/** Which popup an event opens, and the record to open it with. */
export type CashEventRecord =
  | {
      kind: "bill";
      /** The invoice behind the payable — what BillDetailPopup renders. */
      bill: BrainInvoiceDTO;
      /** Kept so the caller can name the counterparty exactly as the row does. */
      obligation: Obligation;
    }
  | {
      kind: "payable";
      payable: Obligation;
      /**
       * True when the invoice DTO feed could not be read, so "no invoice backs
       * this" is an unknown rather than a fact. Passed straight through to the
       * popup, which otherwise states a bill has no invoice on file whenever
       * that endpoint happens to be down.
       */
      invoicesUnknown: boolean;
    }
  | { kind: "receivable"; receivable: Receivable };

export interface CashEventSources {
  /** Raw obligations feed — the same rows the projection's outflows come from. */
  obligations: readonly RawObligation[] | null | undefined;
  /** Raw invoice feed — the same rows the projection's inflows come from. */
  invoices: readonly RawInvoice[] | null | undefined;
  /**
   * The Ledger's normalized invoice DTOs, used ONLY to find the bill behind a
   * payable. `null` means that read has not landed, which is why `payable`
   * carries `invoicesUnknown` rather than this being treated as "no invoice".
   */
  bills: readonly BrainInvoiceDTO[] | null | undefined;
}

/**
 * Index every event id that can be opened.
 *
 * Built once per render pass rather than resolved per click, so the chip can ask
 * "is this openable?" before it decides whether to be a control at all — the
 * alternative is a button that discovers on activation that it has nothing to
 * show.
 */
export function cashEventRecordIndex(src: CashEventSources): Map<string, CashEventRecord> {
  const out = new Map<string, CashEventRecord>();

  /* Same transform, same filters, same order as the projection's outflow loop
     and the Payables tab's list. Re-running it here (instead of accepting a
     prepared list) keeps this module usable from a component that only holds
     the raw reads. */
  const payables = payableObligations(src.obligations ?? null);
  const invoicesUnknown = src.bills == null;
  const billOf = matchObligationsToInvoices(payables, src.bills ?? null);

  for (const o of payables) {
    const bill = billOf.get(o.id);
    out.set(
      `${CASH_EVENT_PREFIX.obligation}${o.id}`,
      bill ? { kind: "bill", bill, obligation: o } : { kind: "payable", payable: o, invoicesUnknown },
    );
  }

  for (const r of arReceivables(src.invoices ?? null)) {
    out.set(`${CASH_EVENT_PREFIX.invoice}${r.id}`, { kind: "receivable", receivable: r });
  }

  return out;
}
