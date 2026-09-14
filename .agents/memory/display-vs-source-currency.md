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

## Two traps inside the formatter itself

- Format the **decimal string**, never `Number(raw)`. brain-core sends eight trailing
  places (`"4800.00000000"`), and the tidy-up coercion is where a large amount silently
  loses its last digits.
- Always show the currency code when there is no symbol for the code. `1,200.00` alone
  names no currency. The symbol is only self-sufficient for the handful of codes with one.
