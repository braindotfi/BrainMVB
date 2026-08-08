# #131 — Unmapped hex mapping proposal

**Status:** Reviewed. Decisions recorded inline (§1, §5). No code changed. Blocks the implementation
of #131, which is itself blocked on #89 (#130) merging to main.

**Resolved in review:** card-surface hover → two role-named tokens (§1); `#2a3050` → collapse 7 fill
hovers, border hover gets its own token (§5); inline-style violations → **out of scope for #131**,
deferred (§8).
**Still open:** `#8b95b8` contrast (§5), `BrainAssistant` error placeholder (§6), `doc-paper-*` (§4).

**Measured against:** `origin/feat/design-tokens-130` @ `f8a507c` (post-#130 state), `client/src/**/*.tsx`.

**Method:** every arbitrary-value hex in a class string (`prop-[#hex]`, including variant prefixes) was
extracted with its file, line, utility and full class context. Each value was converted to CIE L\*a\*b\*
and ranked against the 25 tokens in `client/src/index.css` by ΔE76. Contrast ratios are WCAG 2.1
relative luminance against the actual surface the value sits on.

Reproduce: `/tmp/tok/analyze.mjs`, `rank.mjs`, `ctx.mjs` (throwaway scripts, not committed).

---

## Totals

| | count |
|---|---|
| Arbitrary-hex class hits | 124 |
| — with `/NN` alpha modifier (documented-legitimate, out of scope) | 8 |
| — **mapped to an existing token → violations today** | **3** |
| — unmapped | 113 |
| Distinct unmapped values | 50 |

### Correction to my earlier report

I previously said mapped violations post-#130 were **0**. They are **3** — I had excluded white from
the token list when grepping. All three are `#fff`/`#ffffff` where `brain-v1white` exists:

- `components/ContactUpdateModal.tsx:151`, `:407` — `text-[#fff]`
- `pages/sections/HeaderFooterSection.tsx:13` — `text-[#ffffff]`

This does not change the conclusion — zero-tolerance is still reachable, these are three one-word
edits — but the rule does **not** pass on the #130 branch as-is.

---

## Headline

Of 113 unmapped occurrences, only **7 new `brain-v1*` tokens** are actually needed. The rest are
drift (47 occurrences collapsing into tokens that already exist), a self-contained sub-palette
(27), third-party brand colours (2), and one three-value component state (3).

Five of the six new tokens are **hover partners** — the exact gap #130 filled for four surfaces and
stopped. Every one of them follows the same shape: `bg-<token>` paired with a `hover:bg-[#raw]` that
was never named.

---

## 1. New hover tokens — 30 occurrences

Same rationale and naming convention as the four hover tokens added in #130. Each is the hover
partner of an existing base token, currently typed raw at every call site.

| New token | Value | Base it partners | Absorbs | Uses |
|---|---|---|---|---|
| `brain-v1dark-pink-red-hover` | `#4a0018` | `brain-v1dark-pink-red` `#350011` | — | 12 |
| `brain-v1stroke-2-hover` | `#252a3d` | `brain-v1stroke-2` `#1d2132` | `#262b3d` (ΔE 0.4), `#2a3050` **as a border** (§5) | 7 |
| `brain-v1row-hover` | `#0d1018` | `brain-v1highlight-dropdown-bg` `#0a0c10` | `#0d0f16` (ΔE 1.1) | 3 |
| `brain-v1item-hover` | `#151926` | `brain-v1highlight-dropdown-bg` `#0a0c10` | — | 3 |
| `brain-v1dark-green-hover` | `#174710` | `brain-v1dark-green` `#123509` | `#173e0b` (ΔE 5.0), `#194d0d` (ΔE 5.4) | 5 |
| `brain-v1headerfooterbg-hover` | `#101218` | `brain-v1headerfooterbg` `#06070a` | — | 1 |

**`#4a0018` is already canonical** — `CLAUDE.md:1180` states the destructive hover is *"**always**
`#4a0018`"*. It was decided in #129 and simply never given a token. 12 uses across
`DeleteConfirmDialog`, `ProposalCardParts`, `ProposalDetail`, `ReviewItems`, `RuleDetail`,
`SecurityModals`, `NavigationMenuSection`, `DevelopersSection`, `AccountSection`.

**Three drifting dark-green hovers** (`#174710`, `#173e0b`, `#194d0d`) all sit on
`bg-brain-v1dark-green`. `#174710` wins on usage (3 of 5).

### RESOLVED — the card-surface hover is two roles, not one

My earlier recommendation (one token at `#151926`) was wrong, and the measurement says so. All three
values sit on the same base, `brain-v1highlight-dropdown-bg` `#0a0c10` (L\*=3.30). Measured as lift
off that base:

| Value | ΔL\* off base | ΔE off base | Call sites |
|---|---|---|---|
| `#151926` | **+5.65** | 9.59 | `AccountDetailPopup:228`, `DocumentViewerPopup:764`, `:784` |
| `#0d1018` | +1.42 | 3.57 | `settings/AuditLogSection:424`, `pages/SettingsPage:252` |
| `#0d0f16` | +1.09 | 2.56 | `ProposalDetail:800` |

`#0d0f16` vs `#0d1018` is **ΔE 1.06** — below the just-noticeable threshold. Same intent typed twice;
these two are genuinely interchangeable and collapse.

`#151926` is a **4.0× stronger lift**, ΔE 6.16 from the subtle pair. That is not a rounding artefact,
and the call sites split cleanly along the same line:

- **Strong lift** sits on items that are chrome-less at rest (`border border-transparent`) and gain a
  *full outline* on hover — discrete objects sitting on the panel.
- **Subtle lift** sits on rows in a continuous divided stack (Settings and Audit rows, separated by
  `h-px bg-brain-v1stroke-2`, with no border change on hover), or on a card that already carries its
  own persistent `border-brain-v1stroke-2` (ProposalDetail).

So the subtle value is a *positional highlight within a list*; the strong value is *elevation of a
detached item*. Collapsing them damages one or the other: either every Settings and Audit row starts
jumping 4×, or the dropdown items' hover drops to near-invisible. This is not the ambiguity #129
removed — it is two distinct roles that were never named.

**Decision: two role-named tokens — `brain-v1row-hover` (`#0d1018`) and `brain-v1item-hover`
(`#151926`).** Role names rather than `-hover` / `-hover-strong`, because "strong" invites a
"stronger" later.

**Excluded from both:** `GlobalSearch.tsx:256` also uses `#151926`, but it is a *keyboard-selected*
state on a **transparent** base, set via an inline `style` object — not a hover, not a class string,
and therefore not visible to this rule at all. Left alone as a separate concern (see §8).

---

## 2. New role token, forced by accessibility — 4 occurrences

| New token | Value | Uses |
|---|---|---|
| `brain-v1error-text` | `#f4607a` | 4 |

`#f4607a` is the auth-surface form error text (`CompanySetupPage:209,241`, `SignupPage:315`).

**This cannot collapse into `brain-v1pink-red`.** On the `#11141b` page background:

| | ratio | WCAG AA (4.5:1 normal text) |
|---|---|---|
| `#f4607a` (today) | **5.97:1** | pass |
| `#d20344` (`brain-v1pink-red`) | **3.37:1** | **fail** |

`brain-v1pink-red` is a *fill and accent* colour, not a body-text colour. Collapsing here would be a
regression, so the role genuinely needs its own token.

`#fca5a5` (`SourceConnectScreens.tsx:257`, error caption, 9.71:1) folds into this token — 5.97:1
still clears AA.

---

## 3. Third-party brand constants — 2 occurrences

| Token | Value | Where |
|---|---|---|
| `brand-telegram` | `#0088cc` | `ShareModal.tsx:242` |
| `brand-whatsapp` | `#075e54` | `ShareModal.tsx:250` |

These are the share buttons' external brand identities — verified against their `handleSocial`
handlers (`t.me/share`, `wa.me`). They must never be recoloured to fit our palette, and they must
never be collapsed into `brain-v1dark-green` (ΔE 28.9 — they are not our green).

Tokenising rather than carving out is what keeps your "zero known exceptions" goal literally true:
the rule stays fail-on-any, and these two are legitimately named values rather than a whitelist.
Deliberately namespaced `brand-*`, not `brain-v1*`, so nobody reuses them as app colours.

---

## 4. `DocumentViewerPopup` paper sub-palette — 27 occurrences, 12 values

This component renders a **simulated scanned paper document** — a cream/sepia palette that is not app
chrome and must not be reconciled against the dark UI tokens. Nearest-token distances are meaningless
here (`#7a6a50` → `brain-v1dark-orange-hover` at ΔE 31.6).

Proposal: namespace as `doc-paper-*`, defined in `index.css` next to but clearly separate from the
`brain-v1*` block, with a comment saying it models printed paper and is intentionally outside the
product palette.

| Role | Values |
|---|---|
| Paper surfaces (`bg`) | `#f9f7f2`, `#f3f0e8`, `#ece8d8` |
| Ink (`text`) | `#1a1205`, `#2a2010`, `#3a2e1e`, `#5a5040`, `#7a6a50`, `#8a7a60` |
| Rules / dividers (`border`) | `#d8d2be`, `#ddd8c8`, `#e8e2d4` |

Six ink values for one document is itself drift and could reduce to three or four, but that is a
visual judgement on a facsimile — **not proposing collapses inside this palette**; naming it is
enough to make the lint rule pass and to stop it leaking.

**Three values in this file are *not* paper** and are handled as app chrome above/below:
`#151926` (hover, §1), `#0a2a0a` (success chip, §5), `#0d1523` (icon tile, §5).

---

## 5. Collapses into existing tokens — 47 occurrences

Visually neutral unless noted. ΔE < 2.0 is imperceptible side by side; 2–6 is perceptible only on
direct comparison.

| Raw | → Token | ΔE | Uses | Note |
|---|---|---|---|---|
| `#2a3050` *(fill hover)* | `brain-v1baby-blue-15-hover` | 7.6 | 7 | **resolved**, see caveat |
| `#2a3050` *(border hover)* | `brain-v1stroke-2-hover` (§1) | — | 1 | `ProposalCardParts:427`, see caveat |
| `#2a3045` | `brain-v1baby-blue-15-hover` | 0.9 | 2 | |
| `#2a3145` | `brain-v1baby-blue-15-hover` | 1.0 | 2 | |
| `#e8eaf0` | `brain-v1white` | 8.0 | 9 | auth headings/inputs; 15.32:1 → 18.43:1 |
| `#22c55e` | `brain-v1green` | 21.9 | 3 | ShareModal "copied"; pair below |
| `#0d3320` | `brain-v1dark-green` | 14.7 | 3 | 6.10:1 → 5.66:1, AA holds |
| `#0a2a0a` | `brain-v1dark-green` | 8.3 | 3 | paid-status chip |
| `#4ade80` | `brain-v1green` | 29.3 | 1 | WalkthroughStep; element is `opacity-50` disabled |
| `#0f2f1c` | `brain-v1dark-green` | 14.8 | 1 | pair of the above |
| `#1a2235` | `brain-v1stroke-2` | 1.9 | 2 | SignupPage hover; see pair caveat |
| `#131828` | `brain-v1baby-blue-5` | 7.2 | 2 | SignupPage base; see pair caveat |
| `#161b28` | `brain-v1stroke-2` | 4.2 | 1 | avatar circle |
| `#1a1e2e` | `brain-v1stroke-2` | 1.6 | 1 | inline `<code>` bg |
| `#1b1e2a` | `brain-v1stroke-2` | 3.8 | 1 | dashed placeholder bg |
| `#3a4060` | `brain-v1baby-blue-30` | 4.8 | 2 | 1.83:1 → 2.08:1, see a11y note |
| `#1a0d33` | `brain-v1dark-dark-purple` | 3.6 | 1 | |
| `#c5d2ff` | `brain-v1baby-blue-100` | 12.0 | 1 | link hover; 12.32:1 → 9.57:1 |
| `#c8d4f0` | `brain-v1baby-blue-100` | 19.4 | 1 | 11.57:1 → 8.29:1 |
| `#8b95b8` | `brain-v1baby-blue-60` | 11.8 | 1 | **5.60:1 → 3.62:1, see a11y note** |
| `#d9d9d9` | `brain-v1white` | 13.3 | 1 | card-graphic border, `BillingModals:350` |
| `#0d1523` | `brain-v1baby-blue-5` | 5.6 | 1 | icon tile |
| `#fff`, `#ffffff` | `brain-v1white` | 0 | 3 | today's 3 real violations |

### RESOLVED — `#2a3050`: the ΔE 7.6 headline is misleading; 7 of 8 uses collapse

Rendered before/after on `AddAccountModal` (rest / current / proposed, side by side and butted):
`screenshots/token-2a3050-compare.jpg`. Decomposing the difference:

| | ΔE | ΔL\* | Δchroma |
|---|---|---|---|
| rest `#222737` → **current** `#2a3050` | 11.59 | +4.94 | +10.33 |
| rest `#222737` → **proposed** `#2c3247` | 6.04 | **+5.27** | +2.95 |
| current → proposed | 7.57 | **+0.33** | **−7.38** |

The 7.6 is **~97% chroma and essentially zero lightness**. The hover *lift* — the component a user
reads as "this is responding to me" — is fully preserved and fractionally stronger. What is lost is
an indigo saturation spike. The render agrees: both hovers are equally legible against rest; the
current one is merely bluer.

What settles it is that the codebase already disagrees with `#2a3050`. `brain-v1baby-blue-15-hover`
is used correctly at **32 call sites**, and the other raw hovers on the same base — `#2a3045`
(L\* 20.2, chroma 14.4, hue −76°) and `#2a3145` — are already ≈ the proposed token (`#2c3247`:
L\* 21.1, chroma 14.3, hue −76°). `#2a3050` is the lone outlier, and only in chroma. That is drift,
not intent.

**Decision: collapse the 7 fill-hover sites** — four identical `AddAccountModal` rows plus
`AgentProposalModal`, `LiveInsightModal`, `LiveEvidenceRecordPopup`.

**The 8th use is a different role and does not fold in.** `ProposalCardParts.tsx:427` is
`hover:border-[#2a3050]` — a **border**, on a shell whose rest border is `border-brain-v1stroke-2`.
That is a stroke brightening, not a fill hover; routing it into a *background* token would be a
category error. **Decision: it maps to `brain-v1stroke-2-hover` (§1)** as a border-hover, which is
the same brightening role its rest value already belongs to.

### Caveat — the SignupPage button pair must not both collapse to `stroke-2`

`SignupPage.tsx:202,345` are `bg-[#131828] hover:bg-[#1a2235] border border-brain-v1stroke-2`. Both
raw values sit near `stroke-2`, so the naive nearest-token answer collapses **both**, which would
(a) destroy the hover distinction and (b) make the background equal to its own border, erasing the
outline. Mapping the base one step darker to `brain-v1baby-blue-5` and the hover to
`brain-v1stroke-2` preserves both the hover delta and the border.

This is the trap in doing this mapping purely by ΔE, and the reason it is worth reviewing by hand.

### Accessibility notes — two pre-existing failures this pass would touch

1. **`#8b95b8` → `brain-v1baby-blue-60` drops 5.60:1 to 3.62:1** (`BrainAssistant.tsx:990`, dashed
   placeholder text). That crosses AA in the wrong direction. Options: accept (it is a placeholder,
   arguably not body copy), keep it as a token, or lighten the surface. **Not collapsing this one
   without your call** — flagged rather than decided.
2. **`#3a4060` is 1.83:1 today** (`SignupPage:365`, `CompanySetupPage:267`, the "already have an
   account?" line). Collapsing to `brain-v1baby-blue-30` moves it to 2.08:1 — still far below AA.
   The collapse is not the problem and shouldn't be blocked on it, but this text is effectively
   unreadable and belongs on the #132 contrast list rather than being silently normalised.

---

## 6. Needs a decision — `BrainAssistant` error placeholder, 3 occurrences

`BrainAssistant.tsx:992` is a single element using three raw values found nowhere else:

```
bg-[#211c22] border border-dashed border-[#8b5362] text-[#b99aa5]
```

It is the error variant of the neutral dashed placeholder on the line above (which uses
`#1b1e2a` / `brain-v1baby-blue-60` / `#8b95b8`). Warm mauve, unrelated to any current token.

Three new tokens for one call site is poor value. Recommend re-expressing it in the existing
destructive family (`brain-v1dark-pink-red` surface, `brain-v1pink-red` accent, `brain-v1error-text`
from §2) rather than naming these three. That is a small visual change to one element, so it needs
your sign-off rather than my judgement.

---

## 7. `CLAUDE.md` changes required in lockstep

Tokenising `#4a0018` makes the documentation itself violate the new rule. These must land in the
same commit:

| Location | Change |
|---|---|
| `:1180` | *"The hover is **always** `#4a0018`"* → name the token instead of the value |
| `:1191` | **Code example is `hover:bg-[#4a0018]` — this literally fails the new rule.** → `hover:bg-brain-v1dark-pink-red-hover` |
| `:1216-1226` | hex→token table — add the 7 new `brain-v1*` rows |
| `:1228-1234` | radius section — unchanged, but state that `rounded-[12\|16\|24\|100px]` is now enforced |
| `:1236-1241` | "Hover tokens are not in Figma yet" — currently names 4; becomes 10. Same reconciliation caveat applies to all |
| `:1243-1252` | "Where raw hex is still legitimate" — add `brand-*` and `doc-paper-*` as named-not-excepted; the four existing categories stand |
| `:1254-1271` | "One value per role" table — add the hover-grey, dark-green-hover and success-green collapses |

New section to add: how to fix a violation (the rule's error message should point at it), and the
statement that the check is a vitest suite, not a linter, so `npm test` is the reproduction command.

---

## 8. Out of scope for #131 — inline-style hex, deferred

**This section is a finding, not a proposal. Recorded here so it is not lost; the work belongs to the
deferred inline-style conversion task (#134), not to #131.**

Everything above scans **class strings**. It cannot see `style={{ ... }}` objects. Those contain
**153 raw hex occurrences across 29 files**, of which **141 are values that already have a token** —
47× the 3 mapped violations §Totals reports for class strings.

| Raw | Existing token | Inline occurrences |
|---|---|---|
| `#6c779d` | `brain-v1baby-blue-60` | 21 |
| `#1d2132` | `brain-v1stroke-2` | 18 |
| `#a8b9f4` | `brain-v1baby-blue-100` | 11 |
| `#0a0c10` | `brain-v1highlight-dropdown-bg` | 10 |
| `#ff9500` | `brain-v1light-orange` | 9 |
| `#222737` | `brain-v1baby-blue-15` | 9 |
| — | remainder across 23 further values | 63 |
| — | **no existing token** | 12 |

Notable, because they are the same surface §1 is about: `pages/SettingsPage:614`,
`settings/AuditLogSection:384`, `settings/DevelopersSection:152`, `settings/SourcesSection:51`, `:60`
all hardcode `#0a0c10` inline — the exact value of `brain-v1highlight-dropdown-bg`.

**Consequence to be explicit about:** #131 ships a rule that is green while 141 live violations of the
same standard remain, because they are written in a form the scan does not read. That is an accepted,
recorded limitation of #131's scope — not an oversight — and `CLAUDE.md` should say so plainly rather
than implying the standard is fully enforced.

---

## Net effect on the token layer

| | before | after |
|---|---|---|
| `brain-v1*` colour tokens | 25 | 32 |
| `brand-*` | 0 | 2 |
| `doc-paper-*` | 0 | 12 |
| Raw hex in class strings | 124 | 8 (all `/NN` alpha) |

Remaining 8 are the documented Tailwind-3 alpha-channel limitation — unchanged from #130 and the
only standing exception in the rule.

---

## Open questions for review

### Resolved

1. ~~**Card-surface hover** (§1) — one token or two?~~ → **Two role-named tokens**,
   `brain-v1row-hover` `#0d1018` and `brain-v1item-hover` `#151926`. The two lifts are 4.0× apart in
   L\* and map to two distinct interaction contexts. `GlobalSearch:256` left alone.
2. ~~**`#2a3050`** (§5) — confirm the ΔE 7.6 collapse.~~ → **Accepted for the 7 fill hovers**; the
   difference is ~97% chroma and ~0 lightness, verified on a rendered AddAccountModal comparison.
   `ProposalCardParts:427` splits off to `brain-v1stroke-2-hover` as a border hover.
3. ~~**Inline-style hex**~~ → **Out of scope for #131**, deferred to the inline-style conversion task
   (#134). Finding recorded in §8.

### Still open

4. **`#8b95b8`** (§5) — collapse and accept 3.62:1, or keep a token to preserve 5.60:1?
5. **BrainAssistant error placeholder** (§6) — re-express in the destructive family, or mint three
   tokens?
6. **`doc-paper-*`** (§4) — agreed as a namespaced sub-palette rather than 12 `brain-v1*` additions?
