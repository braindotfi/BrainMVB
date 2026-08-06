---
name: QA row selection and tenant exhaustion
description: Why live-tenant UI checks must select rows by the action they need, and how to tell a spent tenant from a real regression.
---

## Never select a fixture row by position

A live-tenant UI check that does `rows.first()` and then asserts what the popup
offers has silently encoded an assumption about **queue composition**, not about
the product. Queues are not homogeneous.

**Why:** in the counterparty Needs Review queue, a high/sanctioned risk level
keeps a row queued regardless of what the user already decided. So the queue
accumulates rows that are *already* trusted or acknowledged and therefore offer
a different action set. Every run for weeks happened to find an ordinary
unreviewed row in position 0. Once earlier steps consumed those, three separate
assertions failed at once while the app was entirely correct — including one
asserting "granting trust removes the row from the queue", which is simply not
the rule (trusting a counterparty is not an answer to a sanctions hit).

**How to apply:** select the row by the action the check needs — iterate rows,
open each, and take the first whose required control is present *and enabled*.
The check then states a property of the control rather than of the tenant. When
an assertion's truth depends on the row's category (risk-marked vs ordinary),
read the category off the row *before* acting and assert both branches; do not
pick the branch that happens to pass.

## A missing row has two opposite meanings

"No row offers this action" is ambiguous: the control may be broken, or the
tenant may be spent. Resolve it with a read that does not depend on the widget
under test (here, the counterparties API), then:

- eligible rows exist, control absent → **fail**
- no eligible rows → **skip**, and say the tenant needs re-provisioning
- the resolving read itself failed → **fail**; a read that did not happen cannot
  clear anything

Softening the first case into a skip is how a suite rots quietly.

## Irreversible steps exhaust a demo tenant

Grant and acknowledge have no inverse; pause/restore is self-reversing. A walk
that exercises all of them therefore consumes rows every run and the tenant
trends toward a state where only ineligible rows remain. Expect it, detect it,
and name it in the output instead of letting it read as a product bug.

## Re-entering a demo tenant after a logout

Demo users have no password, so a logged-out demo session cannot be recovered by
logging in, and provisioning a new one creates an upstream tenant that cannot be
deleted. Inserting a fresh session row for the existing user id is the cheap way
back in; the cookie is the signed form derived from the session secret, so it
must be computed at run time and passed by env, never written down.
