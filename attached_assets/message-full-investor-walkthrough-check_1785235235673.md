# Message — Full Investor-Walkthrough Verification (Fresh Demo Tenant)

Copy/paste the block below into Replit.

---

A lot has landed recently (obligations/invoices projection, agent-policy decision recording,
the acknowledged-insight leak fix, relative seed dates, the reading-screen refresh fix). Rather
than checking each in isolation, walk through a fresh "Continue with Demo" session the way an
investor or prospect actually would, and report what you see at each stop.

## Setup

Create a genuinely fresh demo session (not a previously-used tenant). Let the seed fully settle
before evaluating anything (per the new projection-status/refresh work — give it a real chance
to finish, not just a first-glance check).

## Walk through and report on each surface

1. **Home** — does "Money in all accounts" show a real number? Are Brain Detected / Brain Did
   non-zero, or still empty? What specifically appears in each, if anything?
2. **Finances → Accounts** — bank account present, real balance?
3. **Finances → Bills / other tabs that would read from invoices/obligations** — do these now
   show real data from the AR aging and payroll uploads, or still empty?
4. **Inbox → Needs Review** — does anything appear at all now that the policy/subject_id fix is
   live? If empty, check the audit log for whether treasury/cash_forecast actually ran and what
   they produced.
5. **Vendors** — any real vendor data surfaced from the AR aging upload?
6. **Audit Log** — spot-check a record's anchor status (expect it to likely still show
   "pending" — this is a known, not-yet-fully-resolved limitation, not a new bug to chase).
7. **Sources: Connected badges** — confirm all 5 (bank, crypto, accounting, payroll, tax) still
   show correctly after everything else that's shipped since they were last verified.

## Report format

For each of the 7 items: what you saw, real vs. still-empty, and anything surprising. Don't
just confirm "the API returns data" — describe what actually renders on the page, since that's
what an investor would see. Flag anything that looks broken, empty, or inconsistent even if it
wasn't explicitly on this checklist.

---
