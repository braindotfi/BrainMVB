---
name: First-run walkthrough copy contract
description: Why the onboarding explainer reads the live policy, keeps pending/failed/404 apart, and freezes copy per step.
---

The first-run walkthrough explains the propose-only model, so every specific it
states is read from the tenant's live approval policy. Inventing a threshold on
the one screen whose job is to establish trust undermines the screen itself.

**Rule:** the policy read has four outcomes and the copy must keep them apart —
pending, failed, honest-404, and known. Only a policy that was actually read may
be described as automating nothing; a failed read must make no claim about the
tenant in either direction, and only a 404 may say "yet".

**Why:** the reassuring failure is the dangerous one. "Nothing runs
automatically" rendered because the policy service was down tells a new user
Brain is inert. This is the same defect as a failed search rendering "no
matches", but with worse consequences, since it is the user's first impression
of what the system is allowed to do.

**How to apply:** an explainer is not a data surface — a failed read gets
fallback copy, not an error state, because the surfaces that own that data
(Inbox, Settings, bulk approve) already report their own degraded reads. Any
illustrative row must carry a visible "Example" marker, or a fresh tenant reads
it as their own history.

**Copy freeze:** each step's text is captured the first time that step is shown.
A read that lands mid-step would otherwise rewrite the sentence someone is
reading. Later steps still pick up the resolved values; already-seen steps keep
what they said.

**Replay:** Settings replays the walkthrough by clearing the first-visit flag and
navigating Home, reusing the existing detection. A second way to open the flow
would be a second thing to keep in sync.
