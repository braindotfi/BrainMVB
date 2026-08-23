---
name: Source-scan test patterns
description: Pitfalls and conventions when writing tests that grep over source files (readFileSync + indexOf/match).
---

## Rule
Source-scan tests (readFileSync + indexOf / match) are the fastest way to pin wiring without a test harness, but have sharp edges.

**Why:** Three separate failures in the same session from the same root causes — wrong window size, wrong regex, wrong anchor point.

## How to apply

### indexOf starts at the top of the file, not the handler
`src.indexOf("myFunction")` matches the *first* occurrence — usually the import line, not the call site.

Fix: anchor to the handler first, then search within the slice:
```typescript
const handlerStart = src.indexOf('app.post("/api/some/route"');
const handlerSrc = src.slice(handlerStart, handlerStart + 2000);
const callIdx = handlerSrc.indexOf("myFunction");
```

For route registrations themselves, use `.match(/app\.post\(...\)/)` to capture the whole registration including middleware args.

### [^)]* stops at the first closing paren — arrow functions break it
`/\.filter\([^)]*!m\.isContextNote[^)]*\)/` fails on `.filter((m) => !m.isContextNote)` because `[^)]*` stops at the `)` inside `(m)`.

Fix: use a pattern that allows the inner parens explicitly:
```typescript
/\.filter\(\(m\)[^)]*!m\.isContextNote\)/
```
Or use `[\s\S]*?` with a narrow window to avoid catastrophic backtracking.

### Handler windows must cover nested blocks
A `try { … } catch { … }` inside another `try` block can push content 1500+ chars into the handler. Use at least 2000 chars for DELETE /api/account-style handlers with inner try/catch blocks.

### Route-registration requireAuth check
`requireAuth` appears as an argument on the same line as the route path, so `indexOf("requireAuth", chatIdx)` finds it far away (the import or a different route). Use `.match(/app\.(post|delete)\([^)]+\)/)` to capture the full registration, then check the captured string contains `requireAuth`.

### Variable names in URL-manipulation code vary
`sp.delete("tx")`, `params.delete("tx")`, `searchParams.delete("tx")` — all valid. Match `.delete(["'\`]tx["'\`])` to handle any receiver name.
