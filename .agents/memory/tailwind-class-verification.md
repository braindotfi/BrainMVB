---
name: Verifying a Tailwind class change actually reaches the browser
description: How to prove utility-class edits (arbitrary values, CSS vars, hover/disabled variants) are really generated, and the client/public trap when building a static QA page.
---

# Prove the class was generated, don't assume it

A utility-class edit can typecheck, lint, hot-reload and still do nothing, because Tailwind only
emits the classes it finds by scanning `content` globs. Two failure modes worth checking by hand:

- **Arbitrary values / CSS vars** — `bg-[var(--action-bg)]` works, but only once something in a
  scanned file literally contains that string. Build it dynamically and you get no rule at all,
  and the element renders with no background.
- **A variant does not imply its base.** `hover:bg-[#4a0018]` emits
  `.hover\:bg-\[\#4a0018\]:hover` and *nothing else*. Plain `bg-[#4a0018]` is a separate class that
  may not exist.

## The cheap check
In dev, the served stylesheet is real CSS — fetch and grep it:

```
curl -s http://127.0.0.1:5000/src/index.css -o /tmp/app.css
```

Then search for the *selector*, not the value. Escaping is the trap: the file contains
`.disabled\:opacity-60:disabled`, so a shell `grep` with the backslash usually returns 0 and looks
like a missing rule. Search with a script (python `str.find`) on the raw text instead of fighting
quoting — an early pass here reported every class as absent purely because of escaping.

## client/public is NOT scanned
`tailwind.config.ts` scans `./client/index.html` and `./client/src/**/*.{js,jsx,ts,tsx}`. A static
QA/preview page dropped in `client/public/` is served by Vite but is **outside** the content globs,
so any class it uses that the app does not already ship somewhere gets no rule. Symptom: the page
renders half-styled and you start debugging a bug that isn't in the app.

**How to apply:** in such a page, use only classes the real components already use, and use inline
`style` for anything you are merely *illustrating* (e.g. showing what a `:hover` colour looks like
side by side with the rest colour). Link the stylesheet with
`<script type="module" src="/src/index.css">`.

**Why:** this is a genuinely useful way to eyeball a design-token change across many controls at
once without logging in — the app-preview screenshot tool cannot carry a session, so auth-gated
surfaces are otherwise unreachable. Just delete the page when done.
