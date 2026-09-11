---
name: Accounts rail — selecting an account
description: What the ledger does and does not tell the right-hand accounts panel about agent accounts, per-account holdings, and which account a transaction sits on.
---

## There is no agent-account signal in the ledger

`/v1/ledger/accounts` publishes no field that says an account is operated by an
agent. The api-surface artifact documents an `account_type` query filter but
publishes no enum for it, and the shipped `AccountKind` union has no agent
member.

**Why:** the design has a distinct green card for an agent account, so the
temptation is to infer it — from the account name, the institution string, or a
balance pattern. Do not. This card is the answer to "who moves this money", and
a wrong answer there is a real harm, not a cosmetic one.

**How to apply:** gate the agent variant on an explicit upstream discriminator.
Until brain-core publishes one, the branch is preparatory and unreachable, and
that has to be stated as unfinished rather than papered over with a guess.

## Per-account holdings live at `/ledger/balances`, which is empty

`GET /v1/ledger/balances` accepts `account_id?` and `as_of?` and is reachable
through the generic BFF proxy. On a live tenant it answers `{"balances": []}`
both unfiltered and per-account.

**Why:** the Assets tab in the design shows several holdings under one account
card, which the accounts feed cannot produce — it models one currency per
account, so scoping the current Assets list to the selected account yields
exactly one row. `balances` is the surface that would make the design's shape
real, and it publishes nothing yet.

**How to apply:** treat "scope Assets to the selected account" as blocked on
upstream data, not as a client-side filter to write. The existing Assets list is
accounts-as-assets, which is a stand-in for the real holdings feed.

## `account_id` on a transaction has three states, not two

The transactions feed does carry `account_id`. Reading it as "matches / does not
match" loses the third case: the feed named no account at all (missing, null, or
an empty string).

**Why:** an unattributed row is invisible under *every* account. If it is merely
filtered out, it disappears from the product with nothing anywhere saying so —
and the account whose list is empty reads as "nothing happened here", which is
the most misleading possible rendering of "we are withholding rows we could not
place".

**How to apply:** derive "belongs to this account" and "is attributed at all"
from one predicate so they cannot drift, count the unattributed rows, and render
that count *outside* the list/empty/error branches so the empty case still
declares it.

## Rail artwork: assert the drawing, not the filename

The collapsed rail carries every icon twice — the resting artwork and the
hover ("active") artwork — swapped with `group-hover:hidden` /
`group-hover:block` so the lit state cannot flash a missing image. The two
files differ only by swapping the deep disc and bright glyph colours, which
means an active/inactive pair can be generated from one Figma export.

**Why:** Vite inlines these SVGs as `data:` URLs, so by the time an icon
reaches the DOM its filename is gone and a `src` assertion against
`sidebar-action-send-bank.svg` fails against a rendered component. Worse, a
filename assertion would pass even if the two artworks were identical.

**How to apply:** in rendering tests decode the data URL and assert the disc
`fill` and the glyph id — that is the actual claim (the rail is in the
colourway of the selected card, and inverts on hover). Keep filename
assertions to the source scan, where they guard the import.
