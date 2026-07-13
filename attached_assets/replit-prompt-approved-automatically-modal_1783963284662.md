# Replit Prompt — Approved Automatically Modal (v2, builds on the Needs Review modal)

Paste everything below into Replit. This assumes the Needs Review proposal
detail modal from the previous prompt already exists — do not rebuild it from
scratch. Extend the same component.

---

## Goal

The "Your Review" screen has a second tab, **Approved Automatically**, listing
things Brain already acted on without needing a human decision (screenshot
attached separately). Tapping one of these rows currently opens nothing. It
should open a modal that answers a different question than the Needs Review
modal: not *"should I approve this?"* but *"what happened, and can I undo it?"*

Reuse the exact same modal component and shell. Do not build a second modal.
Branch on `status` inside the one component.

## Why this isn't just the same modal with buttons removed

A completed action needs different information than a pending one:

- "Why Brain suggested this" becomes **why it didn't need a human** — which
  policy threshold it met, not just what triggered it.
- "What happens next" (forward-looking, hypothetical) becomes **outcome**
  (past tense, factual — what was actually sent/posted/moved, and when).
- The footer changes from a 3-way decision to, at most, a single **Undo**,
  and only when undoing is actually possible. Some actions can't be undone
  (an email was sent, evidence was submitted to a processor) — those get an
  honest "this can't be undone" state instead of a fake button.

## Schema addition

Add one optional object to the existing proposal record schema, present only
when `status: "approved_automatically"`:

```json
{
  "approved_automatically_meta": {
    "approved_at": "ISO timestamp",
    "auto_approval_reason": "plain-language sentence: which policy/threshold this met, e.g. 'Under $500 and confidence above 90% for this risk category.'",
    "outcome": {
      "summary": "plain-language sentence, past tense: what actually happened",
      "linked_source": {
        "type": "invoice | payment | counterparty | bank_feed | account | forecast | vendor_document | app_usage | subscription | receivable",
        "id": "id of the resulting record (the sent email, the posted entry, the executed transfer)",
        "deep_link": "brain://{type}/{id}"
      }
    },
    "reversibility": "reversible | irreversible | informational",
    "undo_action": "plain-language description of what Undo does — null unless reversibility is 'reversible'"
  }
}
```

`reversibility` meanings:
- **reversible** — the action can still be cancelled or reverted (a scheduled
  payment not yet settled, a journal entry that can be reversed, a
  cancellation that can be re-added).
- **irreversible** — it already happened in the outside world (an email was
  sent, evidence was submitted to a processor). No Undo button; show a plain
  statement instead.
- **informational** — nothing was actually done, Brain just published an
  observation (a forecast refresh, a revenue insight). No Undo needed at all,
  just an acknowledgment.

## Mock data — approved-automatically version of all 11 agents

```json
[
  {
    "id": "aa_001",
    "agent_key": "vendor_risk",
    "agent_display_name": "Vendor Risk",
    "category": "business",
    "execution_mode": "propose",
    "risk_level": "low",
    "status": "approved_automatically",
    "title": "Bank details verified with vendor",
    "subtitle": "Bright Futures Studio · change confirmed",
    "amount": 3200,
    "confidence": 0.97,
    "why_suggested": {
      "trigger": "The flagged bank account change was confirmed directly with the vendor's known contact.",
      "evidence": [
        {
          "text": "Vendor confirmed new account by phone using the number on file, not the number from the invoice",
          "linked_source": { "type": "counterparty", "id": "counterparty_aa_001_1", "deep_link": "brain://counterparty/counterparty_aa_001_1" }
        },
        {
          "text": "Confirmation logged before the payment's scheduled send time",
          "linked_source": { "type": "payment", "id": "payment_aa_001_2", "deep_link": "brain://payment/payment_aa_001_2" }
        }
      ]
    },
    "scenario_module": "account_comparison",
    "recommended_action": "Release the held payment now that the new account is verified.",
    "what_happens_next": { "if_approved": null, "if_edited": null, "if_rejected": null },
    "risk_note": "Verification closed the loop that made this look risky.",
    "source": "ledger_payments, ledger_counterparties",
    "created_at": "2026-07-11T14:02:00Z",
    "approved_automatically_meta": {
      "approved_at": "2026-07-11T16:40:00Z",
      "auto_approval_reason": "Vendor verification completed via a contact method independent of the flagged invoice, matching policy for auto-release.",
      "outcome": {
        "summary": "Payment released and sent to the newly verified account.",
        "linked_source": { "type": "payment", "id": "payment_aa_001_release", "deep_link": "brain://payment/payment_aa_001_release" }
      },
      "reversibility": "irreversible",
      "undo_action": null
    }
  },
  {
    "id": "aa_002",
    "agent_key": "payment",
    "agent_display_name": "Payment",
    "category": "business",
    "execution_mode": "propose",
    "risk_level": "low",
    "status": "approved_automatically",
    "title": "3 vendor invoices batched and scheduled",
    "subtitle": "Payment · due within 5 days · no exceptions found",
    "amount": 14850,
    "confidence": 0.93,
    "why_suggested": {
      "trigger": "Invoices matched 1:1 to approved purchase orders with no amount or vendor mismatches.",
      "evidence": [
        { "text": "All 3 invoices matched to open purchase orders", "linked_source": { "type": "invoice", "id": "invoice_aa_002_1", "deep_link": "brain://invoice/invoice_aa_002_1" } },
        { "text": "Combined batch fits within this week's operating cash buffer", "linked_source": { "type": "account", "id": "account_aa_002_2", "deep_link": "brain://account/account_aa_002_2" } }
      ]
    },
    "scenario_module": "document_stack",
    "recommended_action": "Batch and schedule payment for all 3 invoices on their due dates.",
    "what_happens_next": { "if_approved": null, "if_edited": null, "if_rejected": null },
    "risk_note": "Routine batch, no flagged exceptions.",
    "source": "ledger_invoices, ledger_purchase_orders",
    "created_at": "2026-07-11T09:15:00Z",
    "approved_automatically_meta": {
      "approved_at": "2026-07-11T09:15:30Z",
      "auto_approval_reason": "Under the auto-pay threshold: matched PO, no exceptions, confidence above 90%.",
      "outcome": {
        "summary": "Payments scheduled for Jul 14, Jul 15, and Jul 16.",
        "linked_source": { "type": "payment", "id": "payment_batch_aa_002", "deep_link": "brain://payment/payment_batch_aa_002" }
      },
      "reversibility": "reversible",
      "undo_action": "Cancel any of the 3 scheduled payments that haven't settled yet."
    }
  },
  {
    "id": "aa_003",
    "agent_key": "collections",
    "agent_display_name": "Collections",
    "category": "business",
    "execution_mode": "propose",
    "risk_level": "low",
    "status": "approved_automatically",
    "title": "Overdue invoice reminder sent",
    "subtitle": "Collections · Northstar Design · reminder delivered",
    "amount": 6200,
    "confidence": 0.88,
    "why_suggested": {
      "trigger": "Invoice passed net-30 due date with no payment or dispute logged.",
      "evidence": [
        { "text": "No partial payment or dispute on file", "linked_source": { "type": "receivable", "id": "receivable_aa_003_1", "deep_link": "brain://receivable/receivable_aa_003_1" } }
      ]
    },
    "scenario_module": "message_preview",
    "recommended_action": "Send a first reminder referencing the invoice number and due date.",
    "what_happens_next": { "if_approved": null, "if_edited": null, "if_rejected": null },
    "risk_note": "Low risk — a message, not a fund movement.",
    "source": "ledger_receivables",
    "created_at": "2026-07-10T18:40:00Z",
    "approved_automatically_meta": {
      "approved_at": "2026-07-10T18:40:05Z",
      "auto_approval_reason": "First reminders under standard tone are pre-approved by policy — no dollar or relationship risk.",
      "outcome": {
        "summary": "Reminder email delivered to Northstar Design's billing contact.",
        "linked_source": { "type": "receivable", "id": "receivable_aa_003_sent", "deep_link": "brain://receivable/receivable_aa_003_sent" }
      },
      "reversibility": "irreversible",
      "undo_action": null
    }
  },
  {
    "id": "aa_004",
    "agent_key": "treasury",
    "agent_display_name": "Treasury",
    "category": "business",
    "execution_mode": "propose",
    "risk_level": "standard",
    "status": "approved_automatically",
    "title": "Idle cash swept to treasury yield",
    "subtitle": "Treasury · Operating ••4821 → Treasury (T-Bills)",
    "amount": 100000,
    "confidence": 0.9,
    "why_suggested": {
      "trigger": "Operating balance stayed above the working-capital floor for 21 straight days.",
      "evidence": [
        { "text": "Balance exceeded 60-day average obligations by $118,000", "linked_source": { "type": "account", "id": "account_aa_004_1", "deep_link": "brain://account/account_aa_004_1" } }
      ]
    },
    "scenario_module": "account_flow",
    "recommended_action": "Sweep $100,000 into short-duration T-Bills.",
    "what_happens_next": { "if_approved": null, "if_edited": null, "if_rejected": null },
    "risk_note": "Within pre-approved sweep policy for this account.",
    "source": "ledger_balances, wiki_cash_policy",
    "created_at": "2026-07-11T07:00:00Z",
    "approved_automatically_meta": {
      "approved_at": "2026-07-11T07:00:20Z",
      "auto_approval_reason": "Sweep amount and duration fall within the standing treasury policy pre-authorized for this account.",
      "outcome": {
        "summary": "Transfer initiated with the banking partner; settlement expected within 1 business day.",
        "linked_source": { "type": "account", "id": "account_aa_004_transfer", "deep_link": "brain://account/account_aa_004_transfer" }
      },
      "reversibility": "reversible",
      "undo_action": "Recall the transfer if it hasn't settled with the banking partner yet."
    }
  },
  {
    "id": "aa_005",
    "agent_key": "cash_forecast",
    "agent_display_name": "Cash Forecasting",
    "category": "business",
    "execution_mode": "propose",
    "risk_level": "low",
    "status": "approved_automatically",
    "title": "13-week cash forecast refreshed",
    "subtitle": "Cash Forecasting · no shortfall risk · variance under 4%",
    "amount": null,
    "confidence": 0.9,
    "why_suggested": {
      "trigger": "Weekly forecast refresh ran on schedule.",
      "evidence": [
        { "text": "No week in the 13-week window dips below the working-capital floor", "linked_source": { "type": "forecast", "id": "forecast_aa_005_1", "deep_link": "brain://forecast/forecast_aa_005_1" } }
      ]
    },
    "scenario_module": "forecast_chart",
    "recommended_action": "No action needed — informational.",
    "what_happens_next": { "if_approved": null, "if_edited": null, "if_rejected": null },
    "risk_note": "None.",
    "source": "ledger_payroll, ledger_payments, ledger_receivables",
    "created_at": "2026-07-11T06:00:00Z",
    "approved_automatically_meta": {
      "approved_at": "2026-07-11T06:00:00Z",
      "auto_approval_reason": "Read-only informational update — nothing to approve.",
      "outcome": {
        "summary": "Forecast published to your dashboard as the current view.",
        "linked_source": { "type": "forecast", "id": "forecast_aa_005_1", "deep_link": "brain://forecast/forecast_aa_005_1" }
      },
      "reversibility": "informational",
      "undo_action": null
    }
  },
  {
    "id": "aa_006",
    "agent_key": "dispute",
    "agent_display_name": "Dispute",
    "category": "business",
    "execution_mode": "propose",
    "risk_level": "standard",
    "status": "approved_automatically",
    "title": "Chargeback evidence submitted",
    "subtitle": "Dispute · response filed · deadline met",
    "amount": 840,
    "confidence": 0.9,
    "why_suggested": {
      "trigger": "Chargeback notification ingested with a response deadline; matching evidence was found.",
      "evidence": [
        { "text": "Matching invoice and delivery confirmation found", "linked_source": { "type": "invoice", "id": "invoice_aa_006_1", "deep_link": "brain://invoice/invoice_aa_006_1" } }
      ]
    },
    "scenario_module": "document_stack",
    "recommended_action": "Submit matched invoice and delivery confirmation as dispute evidence.",
    "what_happens_next": { "if_approved": null, "if_edited": null, "if_rejected": null },
    "risk_note": "Missing the window would have meant an automatic loss.",
    "source": "ledger_payments, wiki_fulfillment_records",
    "created_at": "2026-07-09T11:20:00Z",
    "approved_automatically_meta": {
      "approved_at": "2026-07-09T11:20:10Z",
      "auto_approval_reason": "Complete, unambiguous evidence match found before the response deadline — standard auto-file policy.",
      "outcome": {
        "summary": "Evidence package submitted to the payment processor's dispute portal.",
        "linked_source": { "type": "payment", "id": "payment_aa_006_dispute", "deep_link": "brain://payment/payment_aa_006_dispute" }
      },
      "reversibility": "irreversible",
      "undo_action": null
    }
  },
  {
    "id": "aa_007",
    "agent_key": "compliance",
    "agent_display_name": "Compliance",
    "category": "business",
    "execution_mode": "notify_only",
    "risk_level": "low",
    "status": "approved_automatically",
    "title": "W-9 received and filed",
    "subtitle": "Compliance · vendor now compliant · tax form on file",
    "amount": null,
    "confidence": 0.98,
    "why_suggested": {
      "trigger": "Vendor submitted the previously missing W-9.",
      "evidence": [
        { "text": "Signed W-9 received and matched to the vendor record", "linked_source": { "type": "vendor_document", "id": "vendor_document_aa_007_1", "deep_link": "brain://vendor_document/vendor_document_aa_007_1" } }
      ]
    },
    "scenario_module": "document_checklist",
    "recommended_action": "No action needed — informational.",
    "what_happens_next": { "if_approved": null, "if_edited": null, "if_rejected": null },
    "risk_note": "None.",
    "source": "wiki_vendor_documents",
    "created_at": "2026-07-08T16:00:00Z",
    "approved_automatically_meta": {
      "approved_at": "2026-07-12T10:00:00Z",
      "auto_approval_reason": "Notify-only agent — this closes the earlier flag automatically once the document is on file.",
      "outcome": {
        "summary": "Vendor file updated to compliant; earlier flag cleared.",
        "linked_source": { "type": "vendor_document", "id": "vendor_document_aa_007_1", "deep_link": "brain://vendor_document/vendor_document_aa_007_1" }
      },
      "reversibility": "informational",
      "undo_action": null
    }
  },
  {
    "id": "aa_008",
    "agent_key": "revenue_intel",
    "agent_display_name": "Revenue Intelligence",
    "category": "business",
    "execution_mode": "notify_only",
    "risk_level": "low",
    "status": "approved_automatically",
    "title": "Revenue segment analysis published",
    "subtitle": "Revenue Intelligence · enterprise +12% MoM · 2 upsells, no churn",
    "amount": null,
    "confidence": 0.87,
    "why_suggested": {
      "trigger": "Monthly revenue rollup flagged a notable segment-level change.",
      "evidence": [
        { "text": "Two existing accounts upgraded tier this month", "linked_source": { "type": "subscription", "id": "subscription_aa_008_1", "deep_link": "brain://subscription/subscription_aa_008_1" } }
      ]
    },
    "scenario_module": "trend_chart",
    "recommended_action": "No action needed — informational.",
    "what_happens_next": { "if_approved": null, "if_edited": null, "if_rejected": null },
    "risk_note": "None.",
    "source": "ledger_receivables, wiki_subscriptions",
    "created_at": "2026-07-11T05:00:00Z",
    "approved_automatically_meta": {
      "approved_at": "2026-07-11T05:00:00Z",
      "auto_approval_reason": "Read-only informational insight — nothing to approve.",
      "outcome": {
        "summary": "Analysis published to your dashboard.",
        "linked_source": { "type": "subscription", "id": "subscription_aa_008_1", "deep_link": "brain://subscription/subscription_aa_008_1" }
      },
      "reversibility": "informational",
      "undo_action": null
    }
  },
  {
    "id": "aa_009",
    "agent_key": "reconciliation",
    "agent_display_name": "Reconciliation",
    "category": "agnostic",
    "execution_mode": "propose",
    "risk_level": "low",
    "status": "approved_automatically",
    "title": "Bank fee auto-matched and posted",
    "subtitle": "Reconciliation · correcting entry posted",
    "amount": 184,
    "confidence": 0.9,
    "why_suggested": {
      "trigger": "Unmatched bank line closely matched a recurring merchant-fee pattern.",
      "evidence": [
        { "text": "Amount and date matched a merchant fee pattern seen in prior months", "linked_source": { "type": "bank_feed", "id": "bank_feed_aa_009_1", "deep_link": "brain://bank_feed/bank_feed_aa_009_1" } }
      ]
    },
    "scenario_module": "line_diff",
    "recommended_action": "Post a correcting entry for the unmatched $184 merchant fee.",
    "what_happens_next": { "if_approved": null, "if_edited": null, "if_rejected": null },
    "risk_note": "Very low risk — small, recurring, well-matched pattern.",
    "source": "ledger_bank_feed, ledger_gl",
    "created_at": "2026-07-11T12:10:00Z",
    "approved_automatically_meta": {
      "approved_at": "2026-07-11T12:10:05Z",
      "auto_approval_reason": "Under $200 with a high-confidence recurring pattern match — within auto-post policy.",
      "outcome": {
        "summary": "Correcting entry posted; period marked reconciled.",
        "linked_source": { "type": "bank_feed", "id": "bank_feed_aa_009_posted", "deep_link": "brain://bank_feed/bank_feed_aa_009_posted" }
      },
      "reversibility": "reversible",
      "undo_action": "Reverse the posted entry and reopen the period."
    }
  },
  {
    "id": "aa_010",
    "agent_key": "subscription",
    "agent_display_name": "Subscription",
    "category": "agnostic",
    "execution_mode": "propose",
    "risk_level": "low",
    "status": "approved_automatically",
    "title": "Unused Figma seat cancelled before renewal",
    "subtitle": "Subscription · saved $180",
    "amount": 180,
    "confidence": 0.85,
    "why_suggested": {
      "trigger": "Seat showed no login activity for 60+ days with renewal approaching.",
      "evidence": [
        { "text": "No login recorded in 63 days", "linked_source": { "type": "app_usage", "id": "app_usage_aa_010_1", "deep_link": "brain://app_usage/app_usage_aa_010_1" } }
      ]
    },
    "scenario_module": "usage_timeline",
    "recommended_action": "Cancel the unused seat before renewal.",
    "what_happens_next": { "if_approved": null, "if_edited": null, "if_rejected": null },
    "risk_note": "Low risk — the seat can be re-added later if needed.",
    "source": "wiki_subscriptions, wiki_app_usage",
    "created_at": "2026-07-10T09:30:00Z",
    "approved_automatically_meta": {
      "approved_at": "2026-07-10T09:30:15Z",
      "auto_approval_reason": "Under $250/mo and 60+ days inactive — within auto-cancel policy for unused seats.",
      "outcome": {
        "summary": "Cancellation request submitted to Figma's billing portal.",
        "linked_source": { "type": "subscription", "id": "subscription_aa_010_cancelled", "deep_link": "brain://subscription/subscription_aa_010_cancelled" }
      },
      "reversibility": "reversible",
      "undo_action": "Re-add the seat before the plan's renewal date."
    }
  },
  {
    "id": "aa_011",
    "agent_key": "fraud_anomaly",
    "agent_display_name": "Fraud & Anomaly",
    "category": "agnostic",
    "execution_mode": "notify_only",
    "risk_level": "elevated",
    "status": "approved_automatically",
    "title": "Vendor contact overlap logged for audit",
    "subtitle": "Fraud & Anomaly · reviewed, no further action taken",
    "amount": null,
    "confidence": 0.68,
    "why_suggested": {
      "trigger": "Two vendors shared a phone number on file.",
      "evidence": [
        { "text": "Same phone number listed on both vendor records", "linked_source": { "type": "counterparty", "id": "counterparty_aa_011_1", "deep_link": "brain://counterparty/counterparty_aa_011_1" } }
      ]
    },
    "scenario_module": "entity_comparison",
    "recommended_action": "Manually verify both vendors are legitimate.",
    "what_happens_next": { "if_approved": null, "if_edited": null, "if_rejected": null },
    "risk_note": "Moderate confidence — logged for the audit trail rather than acted on automatically.",
    "source": "ledger_counterparties",
    "created_at": "2026-07-09T20:45:00Z",
    "approved_automatically_meta": {
      "approved_at": "2026-07-10T08:00:00Z",
      "auto_approval_reason": "Notify-only agents never execute — this entry auto-closes into the audit log after the review window passes with no manual action.",
      "outcome": {
        "summary": "Logged to the audit trail; no payments were blocked or vendors changed.",
        "linked_source": { "type": "counterparty", "id": "counterparty_aa_011_1", "deep_link": "brain://counterparty/counterparty_aa_011_1" }
      },
      "reversibility": "informational",
      "undo_action": null
    }
  }
]
```

## Wireframe — approved automatically modal (same shell, different content)

```
┌─────────────────────────────────────────────┐
│  ✕                            [Auto-approved]│  ← green pill instead of risk pill
│                                               │
│  [agent icon]  Vendor Risk                   │  ← unchanged
│                                               │
│  Bank details verified with vendor           │  ← unchanged pattern
│  Bright Futures Studio · change confirmed    │
│                                               │
│                                    $3,200     │  ← unchanged
│                                               │
│  ─────────────────────────────────────────   │
│                                               │
│  WHY THIS DIDN'T NEED REVIEW                 │  ← relabeled section, same
│  ↗ Vendor confirmed new account by phone     │     linked-evidence pattern as
│    using the number on file                  │     Needs Review modal
│  ↗ Confirmation logged before scheduled      │
│    send time                                 │
│                                               │
│  Auto-approved because: Vendor verification  │  ← new line, muted, replaces
│  completed independently of the flagged      │     the confidence bar — this
│  invoice, matching policy for auto-release.  │     is a policy statement, not
│                                               │     a probability
│  ─────────────────────────────────────────   │
│                                               │
│  [ SCENARIO MODULE — completed state ]       │  ← same module type as Needs
│  e.g. account comparison now shows a         │     Review for this agent, but
│  checkmark + "confirmed" instead of a        │     rendered in its resolved/
│  pending diff                                │     completed state, not the
│                                               │     pending one
│  ─────────────────────────────────────────   │
│                                               │
│  OUTCOME                                     │  ← relabeled from "what          
│  Payment released and sent to the newly      │     happens next" — past tense,
│  verified account.                           │     factual, links to the
│  ↗ View payment record                       │     resulting record
│                                               │
│  Jul 11, 4:40 PM                             │  ← approved_at timestamp, muted
│                                               │
├─────────────────────────────────────────────┤
│         This action can't be undone.         │  ← reversibility == irreversible:
│                                               │     plain statement, no button
└─────────────────────────────────────────────┘
```

Footer varies by `reversibility`:

| reversibility | footer |
|---|---|
| `reversible` | single outline-style button: **[ Undo ]** (secondary weight, not violet-filled — undo is not the primary action a user is expected to take) |
| `irreversible` | centered muted text: *"This action can't be undone."* No button. |
| `informational` | centered muted text: *"No action was taken — this is for your records."* No button, or a single **[ Got it ]** dismiss button if you want an explicit close affordance beyond ✕. |

Tapping **Undo** opens a one-line confirmation ("Cancel the scheduled payment
to Bright Futures Studio?") before executing — undo is still a state-changing
action and should not fire on a single tap.

## Consistency rules with the Needs Review modal

- Same component, same header layout, same section order, same scenario
  module set and same linked-evidence pattern — a returning user should
  recognize this as "the same modal, different tab," not a new screen.
- Risk pill (Needs Review) and Auto-approved pill (Approved Automatically) sit
  in the same top-right slot so the eye knows where to look for status either
  way. Auto-approved pill uses green — Brain's "passed" status color.
- The confidence bar is Needs-Review-only. In Approved Automatically it's
  replaced by the one-line auto-approval policy statement — showing "97%
  confidence" after the fact reads as Brain congratulating itself; showing
  *why the policy allowed it to proceed* is more useful and more honest.
- Do not add a Reject option to completed items — rejecting something that
  already happened isn't a real action; Undo (when available) is the honest
  equivalent.

## Acceptance criteria

- [ ] All 11 approved-automatically mock records render in the Approved
      Automatically tab.
- [ ] Tapping a row opens the same modal component used for Needs Review,
      branching on `status` to show the right section labels and footer.
- [ ] Evidence links behave identically in both modal states.
- [ ] Scenario module renders its completed/resolved visual state when
      `status === "approved_automatically"`, pending state otherwise.
- [ ] Footer renders correctly for all 3 `reversibility` values, with no
      button shown for `irreversible` or `informational`.
- [ ] Undo requires a one-line confirmation before executing.
- [ ] No new top-level component was created — this extends the existing
      modal via conditional sections, not a fork.
