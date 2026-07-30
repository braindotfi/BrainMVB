---
name: Proposal card design system
description: Where the live proposal card's spacing/colour primitives live, and the display-vs-source currency split that governs anything quoted to a third party.
---

## The card is assembled only from shared primitives

`client/src/components/ProposalCardParts.tsx` holds the section heading, callout boxes, fact
table, evidence row, confidence meter, action buttons and pager. The live card composes those
and nothing else.

**Why:** the card is one component serving ~19 proposal types, and every section that hand-rolled
its own wrapper drifted a few pixels from the rest. Encoding the rhythm in the primitives
(32px between sections, 16px heading→body, 8px between stacked rows) makes "consistent spacing"
structural instead of a review item.

**How to apply:** adding a section means adding a `CardSection`, never a bare `div` with its own
padding. If a new section needs a shape that does not exist, add the primitive.

## Linked evidence is a record link

Evidence rows show only the resolved record title and a chevron. They are tappable: transactions,
accounts, counterparties, and invoices open their existing detail popups; evidence types without
a dedicated by-id surface open a read-only facts popup using only facts carried by the proposal.

**Why:** evidence is useful for verification only if the approver can inspect the record, and a
visible chevron on a dead row would be misleading.

**How to apply:** preserve the title-only row. Add new entity kinds to the existing popup routing
or the honest read-only fallback; never add a subtitle/fact preview back into the row.

## Display currency vs source currency

Everything on the card renders through `useCurrency().formatText`, which converts to the
operator's active display currency at the app's FX rate. Anything the card quotes **back to a
third party** must instead use `formatSourceAmount` (the record's own currency).

**Why:** a chase note that tells a customer they owe €5,023 on a USD invoice is wrong, even
though the same figure is correct in the operator's own view above it.

**How to apply:** ask who reads the string. Operator → display currency. Customer, vendor,
regulator, or anything destined for an outbound message → source currency.

## Never round a displayed value through `Number()`

Digit grouping and money formatting for fact tables is string-based. A leading zero means the
value is a code, not a quantity, and is left alone.

**Why:** `Number(x).toLocaleString()` silently rounds past 2^53 and eats leading zeros. On a
screen sitting above an Approve button, changing a digit is worse than showing it unformatted.

## Bare amounts in brain-core prose

Core writes unmarked amounts into its own narratives ("… for 50000.00 scored 0.70"). Only a
number with 4+ integer digits and exactly two decimals is treated as money, and only when the
record itself cites a currency — that leaves scores, percentages, counts and versions alone.
The same caution applies to fact labels: the strict money-noun list deliberately excludes
"payment" and "value", which head non-money facts like "Payment Terms: 30".

## Client-composed outbound text

The Collections "Message Draft" is composed in the client from resolved facts, with every clause
dropped when its fact is missing and the whole section withheld when there is nothing concrete
to chase. A caption states that core generates the final wording at execution.

**Why:** core composes outbound text at *execution* time, so a pending proposal carries no
message — but an approver still has to know what they are approving. The template is the
compromise, not a licence to invent content.

**How to apply:** never add a template clause that is not backed by a fact on the record. When
core exposes a propose-time draft field, bind to it and delete the template.
