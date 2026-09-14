---
name: Display currency vs source currency
description: useCurrency().format converts as if its input were USD, so quoting a record's own currency through it mislabels the figure. When to convert and when not to.
---

## The rule

`useCurrency().format` is a **display-currency converter**, not a money formatter. It
assumes its input is USD, applies a rate for the currency the user picked, and returns a
symbol-prefixed string.

So it may only be used for figures the app itself owns and denominates in USD — running
totals, projections, aggregates computed from USD ledger data.

It must **never** be used for a figure lifted off an upstream record that carries its own
currency code (an obligation, an invoice, a conflict observation, anything quoted to or by
a third party). Those render unconverted, in their own currency.

**Why:** appending the record's currency code after `format()` produces a converted number
labelled with the currency it was converted *from* — a EUR payable rendered
`$8,894.63 EUR`, and with the display currency on EUR a USD record rendered `€… USD`. Both
state a figure nobody owes. There is also no FX table for anything outside the provider's
small hardcoded set, so for most currencies conversion is not merely wrong-headed, it is
undefined.

**How to apply:** for obligations use `sourceAmountLabel(raw, currency)` in
`lib/obligationRows.ts`. For a new surface, decide first which of the two things the figure
is. If a third party could read the number and disagree with it, it is a source figure.

## Fix every surface quoting the record, in one go

A list row and the detail view it opens are one claim about one record. Fixing the
detail view alone leaves the two disagreeing, which is worse than both being wrong —
and the row is what most people read. Route both through one formatter rather than two
call sites that each decide, including any "drop the code for our own currency" tweak.

**Why:** the currency bug class is invisible on a single-currency tenant, so a partial
fix looks finished for as long as it takes another currency to appear.

## A total under source-currency rows is a subtotal, not a sum

Once rows are quoted in their own currencies, any running total beneath them spans
currencies — see cross-currency-totals.md. Total one currency, state the figure in it,
and caption what was left out as a count and a code, never an amount. Pick the currency
by a rule that does not depend on the order rows paged in, or the figure changes
between loads.

**Why:** a surface whose rows are honest and whose total is not is harder to catch than
one that is wrong throughout — the rows vouch for the total.

**How to apply:** narrowing a figure is only honest where the surface can say what it
dropped. Before narrowing a shared view-model field, check every consumer: a metric
card with one caption line, already spent on the state of the read, has nowhere to put
the disclosure, and silently loses rows. Name the two figures apart so each surface has
to choose, rather than leaving one field meaning different things to different readers.

## A shared detail view's currency basis belongs to the list that opened it

One detail popup can be opened from several lists. Migrating it to source currency
fixes it for the list you were working on and breaks its agreement with every list that
still converts. Make the basis an explicit, required prop rather than a default, so each
call site states it and the ones still converting are greppable.

**Why:** the agreement between a row and the record it opens is what a reader actually
checks; a default silently inherits whichever answer the last editor needed.

**How to apply:** only "the row quotes no amount at all" lets a caller take the honest
basis for free. Otherwise the caller's rows have to migrate first.

## Currency is part of a debt's identity, not a label on its amount

Where two feeds are joined on the debt they describe rather than an id — because no
reference exists between them — the match key must include the normalized currency.
Without it the same figure in two currencies is one debt, and a row opens a detail view
for a record the tenant does not have.

**Why:** amount, counterparty and date all agree on a lookalike, so the join looks
correct on every single-currency tenant and on most mixed ones too.

**How to apply:** normalize a missing code to the ledger default on both sides. Neither
feed states the currency on every record, so treating absent as its own identity
unmatches every pair where only one side spells it out.

Normalize through one exported helper, and use it at every boundary that reads the
code — the row, each detail view, the currency pill, the join. A join that defaults an
absent code while a renderer reads it raw puts a currency-less figure under a row that
named one, for the same record.

## Two traps inside the formatter itself

- Format the **decimal string**, never `Number(raw)`. brain-core sends eight trailing
  places (`"4800.00000000"`), and the tidy-up coercion is where a large amount silently
  loses its last digits.
- Always show the currency code when there is no symbol for the code. `1,200.00` alone
  names no currency. The symbol is only self-sufficient for the handful of codes with one.
