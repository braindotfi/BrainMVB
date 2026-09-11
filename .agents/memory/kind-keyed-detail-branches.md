---
name: Kind-keyed detail branches
description: Why a boolean "is it X" test over a multi-member kind enum silently misrepresents the members nobody thought about.
---

A branch that decides *which details to publish* from an account/record kind
must enumerate the unsupported kinds explicitly and have a third outcome.

**Why:** `AccountKind` has seven members but only `bank_checking`,
`bank_savings` and `onchain` have funding details that exist. A boolean
`accountIsWallet()` with a bank `else` meant `card`, `loan`, `line_of_credit`
and `payment_processor` were all rendered as bank accounts, captioning a card
or processor reference as "IBAN Bank Number" — an invitation to send money to
a number that cannot receive it. Every one of those kinds is legal and
reachable; none of them appeared in the panel's test fixture, so the whole
suite passed.

**How to apply:** when branching on a kind to choose what to *show*, return a
three-way verdict (supported-A / supported-B / unsupported) rather than a
boolean, and give the unsupported case its own honest, visibly-disabled
rendering. Widening the enum should then surface as an unsupported row, not as
a wrong caption. Test the kinds the shared fixture omits — drive the component
directly with its own props rather than growing the shared fixture, which
moves unrelated assertions.
