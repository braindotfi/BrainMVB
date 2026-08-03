---
name: Counterparty trust is not a state machine brain-core has
description: Why the Ledger's Trusted tier is underivable, which counterparty fields are real vs rejected, and the one-predicate rule for the review queue.
---

# The trust state machine DOES exist now — the section below is history

Trust transitions shipped upstream: grant / pause / restore / acknowledge per
counterparty, member principal + `ledger:write`. There is **no** revoke.

The durable lesson is about the BFF, not the route list: the generic brain-core
passthrough is **GET-only**, and every write it does not recognise gets a 405
saying only GET is proxied. That message reads like a policy ("writes are off in
this build") but it is really "this path is missing from the write allowlist".

**Why:** the misreading sends you to look for a feature flag or a disabled-writes
switch, when the fix is one allowlist entry. It also tempts a wildcard write
proxy, which would forward *any* method to *any* upstream path.

**How to apply:** add one explicit entry per endpoint, never a wildcard. Register
write routes BEFORE the GET passthrough and the 405 catch-all or the catch-all
shadows them. Pick the principal deliberately — these routes are user-principal
only, so they must carry the member session token; the platform shared secret and
API keys are rejected upstream, and the shared secret's only job is minting the
session in the first place.

The rest of this file's opening argument is kept as the record of what was true
before those PRs, because the *reasoning* about underivable tiers still applies
to any field brain-core derives server-side.

## (Historical) There was no trust state machine upstream

brain-core's ledger counterparty surface was: list, create, get by id, patch, get
resolved. There was no grant-trust, revoke, pause or restore — not in the
api-surface artifact, not in the deployed `openapi.yaml`, not in the service
routes. Do not go looking for one because a PR title mentions counterparties;
the "manual counterparty" PRs add create/patch, not trust.

Worse, brain-core **actively rejects** writes to `provenance`, `confidence`,
`verified_status` and `risk_level` on both create and patch (there is an
explicit reject-trust-fields guard, and the manual-counterparty contract doc
states these are server-derived). So probing "can I set verified_status?"
fails by design — it is not a permissions problem to work around.

**Why:** this means a "Trusted" tier is *underivable*. Nothing the user or the
app can do could ever produce it, so rendering it as an ordinary empty list
("no trusted vendors yet") implies a path that does not exist. The tab must say
granting trust is unavailable. Likewise "mark as reviewed" cannot be persisted —
it would be a trust-field write — so any `reviewed = false` clause in a spec is
permanently false and should be documented as such rather than faked in local
state.

**How to apply:** before designing any counterparty trust/approval affordance,
assume the write does not exist and check the api-surface artifact first. If a
control cannot be backed by a real endpoint, ship it visibly disabled with
honest copy rather than wiring it to local state.

## What IS real on a counterparty list read

`payment_count` and `payment_total` are real and deployed. `payment_total`
arrives as a decimal **string**, and reads are proxied without normalization, so
coerce both defensively — an unparseable value must read as "no payments", never
`NaN` or a fabricated `$0.00`.

These two fields are the only honest basis for a tier above "new": no risk plus
real payments = a "known"/suggested counterparty. Risk must outrank history — a
flagged payee stays under review no matter how often it has been paid, and must
never be suggested for trust.

`type` splits the list into Vendors vs Customers. Only `customer` is a customer;
everything else (including `other` and future unknown types) belongs in the
vendor segment, so no row can fall through the split and become invisible.

## One predicate behind a count and the list it opens

This screen shipped a red banner and a filter chip driven by *different*
predicates, so the page warned about N rows and then showed a different set when
you clicked through.

**Why:** a count that describes rows the active filter refuses to show teaches
the user the number is noise. It is worse than no warning.

**How to apply:** any "N items need attention" signal and the list it opens must
come from one exported predicate over one already-scoped collection. Pin it with
a test that asserts *badge value === rendered row count*, and re-assert it after
scoping (segment/tab) changes — the unit test proves the function agrees with
itself, so a DOM-level check is what actually proves the component renders what
it counted.

## Extend the one-predicate rule to the whole chip row

Once there is more than one settled tier, "one predicate" is not enough: two
chips can both have a claim on the same row. Assign a tier with a single ordered
classifier returning one tier (or null), bucket in one pass, and let each chip
read its own bucket.

**Why:** overlapping chips reintroduce the original bug in a subtler form — two
counts describing the same work, so acting on a row makes an unrelated number
move. Filtering per-chip invites the overlap; partitioning forbids it.

**How to apply:** order the classifier by *urgency*, so the unfinished tier wins
over the parked one (a risk-flagged row someone also paused is still unfinished
business). Return null rather than dumping an unmatched row into a tier whose
copy would misdescribe it, and surface null as a dev warning — a row that
matches nothing silently disappears from every chip. Test exclusivity directly:
bucket a spread of rows and assert `total === rows.length` **and**
`new Set(all buckets).size === rows.length`.

## Label-only segment aliases, and clamping a retired chip

Renaming a tier per segment ("Trusted" for vendors, "Confirmed" for customers)
must change the *label* only — same tier, same state, same endpoint. Keep the
chip's `value` stable across segments and vary only what is rendered.

**Why:** if the value changes too, a segment switch silently reinterprets which
rows the user is looking at, and every test id moves with the copy.

**How to apply:** when a segment hides a chip that is currently selected, derive
an effective tab (`selected is hidden ? fallback : selected`) instead of
correcting it in a `useEffect`. An effect fixes the selection one render late,
so the list paints once showing a tier no visible chip is highlighting. Leaving
the underlying state untouched also restores the user's filter when they switch
back. Hide a rare chip only while it is empty — hiding one that has rows hides
the rows.

## Reading a trust state that does not exist yet

When upstream promises a review field (e.g. `trust_status`), read it defensively
now and keep **absent** distinguishable from any known value: validate against
the known set and return `undefined` for missing/unrecognised, so "the field was
not reported" can still fall back to the local derivation while a reported value
overrides it.

**Why:** coercing an unknown string into a review state turns a schema change
into a silent misclassification of audited state.

**How to apply:** document the forthcoming routes at ONE mount point — the
component that will own the fetch — not as exported constants nothing imports,
and not copied into every surface that shows the actions. A detail popup opened
from a list takes the handlers as props; two call sites means two places to get
invalidation, optimistic state and error handling right, and they will drift.

Watch the interaction between a default value and the queue predicate: if the
field defaults to "unreviewed" and the queue is `unreviewed OR risk-flagged`,
every row lands in the queue on day one and any *suggested* tier empties out —
raise that with the contract owner rather than resolving it in the client.

## A parked control still has to be honest, and so does the frame around it

A Figma frame is not a licence to ship a button with no endpoint. Where a design
specifies an action the backend cannot perform, the decision wins over the frame:
disable it, and say why in visible copy — a `title` tooltip alone is
undiscoverable on touch, and a disabled button swallows the hover events that
would surface it, so put the tooltip on a wrapper and the reason on the page.
Prefer the real `disabled` attribute over `aria-disabled` so assistive tech and
tests read the same fact.

**Why:** a control that appears live and silently changes nothing is worse than
an absent one — and if the list behind it already shows no actions, the popup
contradicting it teaches the user that neither surface can be trusted.

**How to apply:** when you park an action, delete the confirmation dialogs and
state that only its enabled path could reach, rather than leaving them as
unreachable branches to rot. Keep any sibling action that IS backed by a real
endpoint visually distinct from the parked ones. And check the whole frame, not
just the button: titles, chip labels and body copy that name the old action or
the wrong segment noun are the same inconsistency one layer up.

## Display copy vs wire value on a state name

The acknowledged state reads "No action" to a human while `acknowledged` remains
the enum, the stored `trustState`, and the `/trust/acknowledge` verb.

**Why:** state names get renamed for clarity far more often than the protocol
does, and a find-and-replace on the word will silently rewrite the route string
that is built from the action name (`/trust/${action}`), turning a copy change
into a 404 that only shows up live.

**How to apply:** pin BOTH halves in one test — the enum/route literals AND the
rendered copy — so a future rename cannot move only one. When sweeping copy,
scope it to the trust surface: "acknowledge"/"dismiss" also name unrelated
things (insight acknowledgement, proposal reject, audit outcomes) that must not
change. Note the chip's own word was "Reviewed", not "Acknowledged" — grep for
what renders, not for the enum, or the sweep misses the string the user sees.
