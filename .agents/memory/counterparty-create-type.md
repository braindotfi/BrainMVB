---
name: Counterparty create type
description: brain-core persists the counterparty type it is given (upsert key includes it), so the BFF must forward the client's type rather than supply one.
---

`POST /ledger/counterparties` requires an **explicit** `type`. brain-core accepts
`customer`, persists it unchanged, and its upsert key **includes** the type —
there is no defaulting, normalisation, or later coercion to repair a wrong value.

**Rule:** a create payload's `type` is an identity field and must survive the BFF
unmodified. Never let a proxy route supply the type on the client's behalf; a
default is only acceptable when the request names no type at all.

**Why:** the BFF's create route hardcoded `type: "vendor"` while sanitising the
body. The client's `type: "customer"` was silently discarded, so every row the
Add Customer builder created came back typed as a vendor and rendered in the
Vendors segment. The screen was not misgrouping — it was faithfully grouping a
row the write path had mistyped. Because the type is part of the upsert key, the
mistyped rows are not repairable by re-reading; they were created wrong.

**How to apply:**
- When a proxy route builds an allowlisted body, audit every field it sets as a
  *literal* rather than copying from the request. A literal in a sanitiser is a
  client value being thrown away, and it is invisible from the client side —
  the request looks correct and the response looks successful.
- Segment/grouping on the read side derives from the server's returned `type`
  only (never the form that created the row, never trust status). Keep it that
  way: if a row appears in the wrong group, suspect the write path first.
- Unknown types are rejected at the BFF instead of relayed, because a row
  created under a type no segment renders is unreachable in the UI forever.
  The tradeoff is that a newly-added upstream enum value needs this list
  updated before clients can use it.
