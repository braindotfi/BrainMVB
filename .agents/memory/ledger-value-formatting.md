---
name: Formatters are where invented figures get in
description: The three ways a display formatter silently misstates live ledger data, and the rules that block them.
---

# Formatters are where invented figures get in

A formatter looks like presentation, so it escapes the scrutiny a data path gets.
These three defects all shipped past review as "just formatting", and all three
change what the tenant is told:

1. **A date-only value is a calendar date, not an instant.** `new Date("2026-07-05")`
   parses as UTC midnight, so `getDate()` renders the 4th in every western
   timezone. Read the `YYYY-MM-DD` fields directly and format with
   `timeZone: "UTC"`. Also guard the roll-over: `Date.UTC(2026, 1, 31)` silently
   becomes 2 March, so round-trip the parts and show an impossible date verbatim.
   Separately: only render a clock time when the string actually carries one.
2. **Amounts arrive as decimal strings; `Number` is lossy.** Coercion rounds past
   the format's `maximumFractionDigits`, drops integer precision above 2^53, and
   turns an unreadable value into `$0`. Group the integer digits as text, keep the
   fraction as sent (trailing zeros may go — they are not precision), and print
   anything non-numeric verbatim with its currency instead of as a figure.
3. **A direction field is the polarity; the amount is only the magnitude.** When
   the feed carries `inflow`/`outflow` alongside `transfer`/`adjustment`, an
   unsigned transfer is not incoming. Rendering "everything that is not an
   outflow" as green with a `+` asserts a direction the source never stated. Give
   the undirected kinds neutral colour, a non-directional icon, and no sign.

**Why:** each of these produces a confident, well-formatted, wrong number. There
is no error state to notice — the row looks exactly like a correct one.

**How to apply:** keep these helpers in a plain module with unit tests, not inside
the component. A source-scan guard can check that a component *calls* the
formatter, but it cannot see any of the three defects above; only behavioural
tests over timezone, precision, malformed input, and every direction value can.
