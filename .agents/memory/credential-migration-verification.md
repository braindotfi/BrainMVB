---
name: Credential migration verification
description: How to prove a migrated machine credential works without mutating production, and why absent evidence must never count as passing evidence.
---

## A verifier must not create records to prove a negative

Proving "this credential CANNOT do X" is tempting to demonstrate by attempting a
real X. Don't. A denial probe aimed at a real record leaves a permanent trail —
intent rows, policy decisions, audit evidence — with no delete path, on a live
tenant.

**Why:** a verifier that mutates has to be run somewhere safe, which means it is
never run where it matters. The safe form is a probe against a syntactically valid
but unassigned id, so the request authorizes and refuses before it resolves
anything.

**How to apply:** any migration/rotation verifier. Also get the upstream service to
commit to a side-effect-free authorization surface (scope introspection, or a
documented reserved probe id); until it does, the probe is safe by convention only
and should be documented as unproven rather than treated as safe.

## A refusal status is not a reason

`403` is returned for a scope failure, a policy denial, and a tenant restriction
alike. Asserting only on the status lets an unrelated denial masquerade as scope
evidence, and the receipt then claims something nobody checked.

**Why:** the whole point of the probe is to distinguish *which* mechanism refused.

**How to apply:** require the denial reason to name the mechanism under test.
Likewise a `404` means the service resolved before authorizing, so denial is
unproven — report that, never fall back to a mutating probe.

## Absent evidence is not passing evidence

Three variants of the same bug, all found in one review:

- an omitted `revoked_at` accepted as "not revoked"
- an omitted provenance field accepted as "not a demo tenant"
- a re-decode of the token you just received accepted as "the resource server
  accepts it" — a token only ever proves what it says about itself

**How to apply:** require the field to be PRESENT and hold the expected value, and
pair every self-describing claim with one real authenticated read. A response
about a *different* subject than the one asked about is also absent evidence.

## Rollback windows must cover the whole operation, and be re-checked

Checking "the old credential is still valid" once, before issuing the new one, is
not enough: issuance and verification take time, and the old credential can die in
between. Worse, restoring an already-revoked credential is a rollback that looks
like it worked and leaves the tenant offline.

**How to apply:** require a margin (minutes, not seconds) on both the credential's
own expiry and any scheduled revocation deadline, re-check at rollback time, and
when the window has closed *leave the new credential in place unrevoked* and
escalate loudly. Put the `try` immediately after issuance so no failure path can
orphan an issued credential.

## Source-scan tests cannot witness a refusal

A suite of `expect(source).toContain(...)` pins passed in full while three separate
guards were disabled. Grep-style tests describe shape; they say nothing about
behaviour.

**How to apply:** for anything that must REFUSE, write a behavioural test with the
dependencies mocked, and confirm each test fails when its guard is removed. Keep
source scans only for structural invariants a behavioural test cannot express
(ordering of calls, absence of a forbidden import).

## Classification fields: normalise to refuse, compare exactly to accept

A gate that reads an upstream classification record (is this a demo tenant? is this
data synthetic?) has two kinds of check, and they must not share a comparison
style:

- **Denylist (refusal)** — trim, lower-case, and match markers as *substrings*.
  `"  Synthetic_Brightline "` and `"acme_demo_copy"` must not walk past an exact,
  case-sensitive set. Loosening a refusal check can only ever refuse more, so
  false positives are acceptable; they hold a candidate back rather than let one
  through.
- **Allowlist (acceptance)** — compare the raw value. `" production"` and
  `"Production"` are malformed, and malformed is unknown. Normalising here
  manufactures passes.

**Why:** the instinct is to normalise everything for consistency. That is exactly
backwards — it tightens nothing and loosens the acceptance path.

**How to apply:** also decide per field which kind it is, and say so in the docs.
A field whose production vocabulary is open-ended (a data-profile label) can only
be a denylist, which means an unrecognised well-formed value PASSES. Do not
describe such a gate as "refuses every unknown" — it refuses every *malformed*
answer and every *recognised* bad one. State the gap, and log the record that
cleared so a human can decide what the gate could not.

## `null` from an upstream classifier is the common case, not an edge case

When a service adds classification fields, every record created before that ships
returns them as `null` — including the real production records you were hoping to
clear. `null` means *nobody established this*, which is not *confirmed safe*.

**Why:** a gate written against the happy-path shape will hold 100% of real
tenants and look broken, and the pressure to "just let null through" arrives
immediately. It is the wrong fix: on one live system a known demo tenant
self-reported `kind: "production"` with all classification fields `null`, so null
was the only thing standing between it and a production credential.

**How to apply:** treat null as a refusal, and escalate the real blocker upstream —
the missing work is classifying the data, not softening the gate.

## An unauthenticated probe cannot prove a route exists

If auth middleware runs before routing, a real endpoint and a nonsense path return
byte-identical 401s. "I called it and got 401, so it's there" is not evidence.

**How to apply:** when you cannot mint the credential needed to reach a route, say
the contract is unverified rather than implying you checked it — and make sure
every wrong answer fails closed, so a wrong assumption stops the operation instead
of passing it.
