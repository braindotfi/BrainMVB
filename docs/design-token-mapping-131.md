# #131 — Unmapped hex mapping proposal

**Status:** Proposal for review. No code changed. Blocks the implementation of #131, which is itself
blocked on #89 (#130) merging to main.

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

Of 113 unmapped occurrences, only **6 new `brain-v1*` tokens** are actually needed. The rest are
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
| `brain-v1stroke-2-hover` | `#252a3d` | `brain-v1stroke-2` `#1d2132` | `#262b3d` (ΔE 0.4) | 6 |
| `brain-v1highlight-dropdown-bg-hover` | `#151926` | `brain-v1highlight-dropdown-bg` `#0a0c10` | `#0d0f16`, `#0d1018` | 6 |
| `brain-v1dark-green-hover` | `#174710` | `brain-v1dark-green` `#123509` | `#173e0b` (ΔE 5.0), `#194d0d` (ΔE 5.4) | 5 |
| `brain-v1headerfooterbg-hover` | `#101218` | `brain-v1headerfooterbg` `#06070a` | — | 1 |

**`#4a0018` is already canonical** — `CLAUDE.md:1180` states the destructive hover is *"**always**
`#4a0018`"*. It was decided in #129 and simply never given a token. 12 uses across
`DeleteConfirmDialog`, `ProposalCardParts`, `ProposalDetail`, `ReviewItems`, `RuleDetail`,
`SecurityModals`, `NavigationMenuSection`, `DevelopersSection`, `AccountSection`.

**Three drifting dark-green hovers** (`#174710`, `#173e0b`, `#194d0d`) all sit on
`bg-brain-v1dark-green`. `#174710` wins on usage (3 of 5).

**Needs a decision — the card-surface hover has three competing lifts.** `#151926` (3 uses),
`#0d1018` (2) and `#0d0f16` (1) are all hovers over the `#0a0c10` card surface, but `#151926` is a
much stronger lift than the other two (ΔE 4.9 vs ~2). Collapsing all three to `#151926` makes two
Settings rows and one ProposalDetail card visibly more reactive on hover. That is the "one value per
role" outcome, but it is the single most visible change in this document. The alternative is two
tokens (a subtle and a strong card hover), which re-admits the ambiguity #129 removed. **Recommend
one token at `#151926`; flagging because it is a deliberate visual change, not a neutral swap.**

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
| `#2a3050` | `brain-v1baby-blue-15-hover` | 7.6 | 8 | see caveat below |
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

### Caveat — `#2a3050` (8 uses) is a visible change

ΔE 7.6 from `brain-v1baby-blue-15-hover`. It is unambiguously the same *role* (hover partner of
`bg-brain-v1baby-blue-15`, four identical `AddAccountModal` rows plus `AgentProposalModal`,
`LiveInsightModal`, `LiveEvidenceRecordPopup`, `ProposalCardParts`), so one-value-per-role says
collapse. But it is a perceptible shift, unlike the ΔE ~1 pairs. Worth a visual check on
AddAccountModal specifically.

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
| `:1216-1226` | hex→token table — add the 6 new `brain-v1*` rows |
| `:1228-1234` | radius section — unchanged, but state that `rounded-[12\|16\|24\|100px]` is now enforced |
| `:1236-1241` | "Hover tokens are not in Figma yet" — currently names 4; becomes 9. Same reconciliation caveat applies to all |
| `:1243-1252` | "Where raw hex is still legitimate" — add `brand-*` and `doc-paper-*` as named-not-excepted; the four existing categories stand |
| `:1254-1271` | "One value per role" table — add the hover-grey, dark-green-hover and success-green collapses |

New section to add: how to fix a violation (the rule's error message should point at it), and the
statement that the check is a vitest suite, not a linter, so `npm test` is the reproduction command.

---

## Net effect on the token layer

| | before | after |
|---|---|---|
| `brain-v1*` colour tokens | 25 | 31 |
| `brand-*` | 0 | 2 |
| `doc-paper-*` | 0 | 12 |
| Raw hex in class strings | 124 | 8 (all `/NN` alpha) |

Remaining 8 are the documented Tailwind-3 alpha-channel limitation — unchanged from #130 and the
only standing exception in the rule.

---

## Open questions for review

1. **Card-surface hover** (§1) — one token at `#151926`, or two lifts? One token is the correct
   principle but is a visible change to Settings rows.
2. **`#2a3050`** (§5) — confirm the ΔE 7.6 collapse is acceptable on AddAccountModal.
3. **`#8b95b8`** (§5) — collapse and accept 3.62:1, or keep a token to preserve 5.60:1?
4. **BrainAssistant error placeholder** (§6) — re-express in the destructive family, or mint three
   tokens?
5. **`doc-paper-*`** (§4) — agreed as a namespaced sub-palette rather than 12 `brain-v1*` additions?
