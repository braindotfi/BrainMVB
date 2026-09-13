---
name: The global button capitalize rule
description: Why button text renders in Title Case regardless of the string, and why re-casing text in JS is the wrong fix.
---

`client/src/index.css` sets `button { text-transform: capitalize }` in
`@layer base`. It applies to **every** button in the app, so any button whose
label is a sentence, a question, or tenant data renders Title Cased no matter
what the source string says.

**Why this bites:** the source reads "Show recent cash flow" and the screen
reads "Show Recent Cash Flow". Nothing in the component explains it, so the
obvious diagnosis is that the text arrived Title Cased from upstream, and the
obvious fix is a re-casing pass in JS. Both are wrong.

**How to apply:**

- Rendered casing does not match the source string → check this rule first,
  before touching the string or suspecting the API.
- The fix is `normal-case` on the element carrying the text. It is a utility, so
  it beats the base layer. Put it on the element the text actually lives on: a
  `<span>` inside the button needs its own opt-out, because the button's own
  computed `text-transform` stays `capitalize` either way.
- The rule is right for command labels ("Save Changes") and wrong for prose,
  questions, and anything sourced from the ledger. Watch for the same string
  rendering two ways depending on whether it happens to be clickable — a
  linkable evidence excerpt is a button, an unlinkable one is a span.

**Never re-case upstream or tenant text from capitals alone.** No rule that
inspects capitalisation can tell a service's Title Case from a counterparty's
name: a guard requiring two capitalised words still turns "Pay Acme Corp" into
"Pay acme corp". If a service genuinely sends the wrong case, that is its copy
to fix, not the client's to guess at.
