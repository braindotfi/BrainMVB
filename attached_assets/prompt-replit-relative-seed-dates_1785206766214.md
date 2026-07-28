# Replit Prompt — Make Demo Seed Dates Relative to Now, Not Hardcoded June 2026

Copy/paste the block below into Replit (BrainMVB repo).

---

## Problem, confirmed and time-sensitive

The demo seed (`server/assets/demo-seed/*`, generated via `scripts/generate-demo-seed.ts`) is a
fixed June 2026 snapshot. Any trailing-window surface (e.g. `ledger/cash_flows`, a ~30-day
window) decays as real wall-clock time passes since the fixed seed dates. As of today
(2026-07-28), a 30-day trailing window already only catches 3 of 15 transactions. Once
wall-clock passes ~30 days after the seed's 2026-06-30 end date — i.e. around 2026-07-30, within
days of this prompt — trailing-window surfaces will show nothing from the seed at all. This
needs fixing before that happens, not as a someday cleanup.

## Task

Make the demo seed's dates relative to "now" (or to tenant-creation time) instead of hardcoded
to June 2026, so trailing-window surfaces always show a full, representative window of data
regardless of when a demo tenant is created or how much time has passed since this ships.

### Requirements

- **All five documents must stay internally consistent with each other**, the same constraint
  that applied when the crypto wallet and tax return were added — dates, running balances, and
  cross-document figures (the bank statement's rent/insurance/hosting/Stripe-fee lines feeding
  the 1120, the AR aging's figures, etc.) all need to shift together as one coherent "seed
  month," not drift independently.
- **Decide and document which approach fits this codebase better**, given you know it best:
  (a) generate the seed documents dynamically at seed-time (when a demo tenant is provisioned),
  computing the reference month from the current date each time, rather than shipping
  pre-committed static files; or (b) keep committed static files but regenerate and re-commit
  them periodically (e.g. a scheduled job that re-runs `generate-demo-seed.ts` monthly). Pick
  whichever is lower-risk and more maintainable given how `seedTenantDocuments` currently works
  — don't feel obligated to do the more invasive option if the simpler one covers the actual
  requirement.
- **The reference month should be recent enough that trailing windows are always full** — e.g.
  "the most recently completed calendar month" relative to whenever seeding happens, so a
  30-day (or similar) trailing window from "now" always captures the full seed dataset.
- Preserve everything already correct in the current bundle (Brightline Systems Inc./First
  Meridian Bank ****7302, the 3→5 document expansion, the category-vocabulary fix, the
  `whenSeedsSettle()` barrier) — this is a change to *when the dates are*, not a change to the
  underlying company/dataset/story.

### Explicitly out of scope

- Don't touch anything on the brain-core side — this is purely how BrainMVB generates and seeds
  its own demo documents.
- Don't change the real-account (non-demo) path.

### Process requirements

- `git fetch` and `git pull` before starting, work on a new feature branch.
- Before writing code, state which of the two approaches above you're going with and why.
- Keep a done/pending checklist as you go.
- Update `CLAUDE.md` with how the seed's date-relativity works, so this doesn't quietly regress
  again in the future.
- Definition of done: a fresh demo tenant created at any point in time shows a full, populated
  trailing-window (e.g. `cash_flows`) regardless of how long it's been since this shipped;
  existing tests updated/passing; PR merged to main with CI green.

---
