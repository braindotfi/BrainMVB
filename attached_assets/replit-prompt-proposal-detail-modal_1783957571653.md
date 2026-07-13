# Replit Prompt — Brain Proposal Detail Modal

Paste everything below into Replit as one prompt.

---

## Goal

I have a screen called **Your Review** (screenshot attached separately) that lists
items needing approval, grouped under "Needs Review" and "Approved Automatically."
Each row is a one-line summary of something an internal Brain agent proposed.

Build the **detail modal/popup** that opens when a user taps a row. It must answer
three questions the footer copy already promises: *why Brain suggested it, what
happens next, and what the risk is* — before the user approves anything.

Also seed the app with realistic mock proposal records, one per agent, covering
all 11 business and agnostic agents in Brain's catalog (not just the 4 already
visible in the screenshot). Use these to populate the "Needs Review" and
"Approved Automatically" lists so every agent type is represented at least once.

## Design system

Dark theme, matches the attached screenshot:

- Background: near-black (`#0B0B12`-ish), card surfaces one step lighter with a
  subtle 1px hairline border, not a hard box-shadow.
- Primary accent / CTA color: violet (`#7631EE`).
- Status colors: green = passed / low risk, amber-orange = attention / medium risk,
  crimson = blocked / high risk, violet = recommended / default action.
- Left-edge colored bar on a row or card indicates status at a glance (the "Bank
  details changed" row uses a red bar for elevated risk).
- Typography: a clean geometric sans for headings and UI copy, monospace for
  numbers, amounts, IDs, and evidence/data values (this is what makes `$3,200`
  and `$100,000` in the screenshot read as data rather than prose).
- Rounded pill badges for status/category tags ("Needs Review" pill, category
  labels).
- Tone: calm, plain-English row titles ("Move idle cash into treasury yield?")
  over an underlying technical record — the modal is where the technical detail
  surfaces, the list stays human-readable.

## Data schema

Each proposal record:

```json
{
  "id": "string",
  "agent_key": "vendor_risk | payment | collections | treasury | cash_forecast | dispute | compliance | revenue_intel | reconciliation | subscription | fraud_anomaly",
  "agent_display_name": "string",
  "category": "business | agnostic",
  "execution_mode": "propose | notify_only",
  "risk_level": "low | standard | elevated | high",
  "status": "needs_review | approved_automatically",
  "title": "plain-English row headline",
  "subtitle": "one-line context, matches screenshot style",
  "amount": "number or null (not every proposal has a dollar amount)",
  "confidence": "0.00–1.00",
  "why_suggested": {
    "trigger": "what event or pattern caused this to fire",
    "evidence": [
      {
        "text": "bullet, written in plain language",
        "linked_source": {
          "type": "invoice | payment | counterparty | bank_feed | account | forecast | vendor_document | app_usage | subscription | receivable",
          "id": "id of the underlying record",
          "deep_link": "brain://{type}/{id}"
        }
      }
    ]
  },
  "scenario_module": "account_comparison | document_stack | message_preview | account_flow | forecast_chart | line_diff | usage_timeline | document_checklist | trend_chart | entity_comparison",
  "recommended_action": "the specific action Brain proposes, in plain language",
  "what_happens_next": {
    "if_approved": "string — what the execution service will do",
    "if_edited": "string — what becomes editable before approval",
    "if_rejected": "string — what happens, e.g. dismissed and logged"
  },
  "risk_note": "one sentence, plain language, on what could go wrong",
  "source": "which ledger/wiki data this was derived from",
  "created_at": "ISO timestamp"
}
```

Notify-only agents (`compliance`, `revenue_intel`, `fraud_anomaly`) never reach
`default_authority: execute`, but they also don't get an Approve/Reject pair —
their modal shows the same why/what-next/risk structure with a single
**Acknowledge** action instead of Approve/Edit/Reject. Reflect that in the UI:
propose-mode records get three buttons, notify-only records get one.

## Mock data — one record per agent (11 total)

Each evidence line is a linked object, not a plain string — in the real app these
resolve to the underlying invoice, payment, bank line, or vendor record so the
user can verify the claim instead of trusting it blindly. `deep_link` values here
are placeholders (`brain://{type}/{id}`); wire them to actual detail views once
those exist. Each record also carries a `scenario_module` — the contextual UI
block described in the wireframe section below.

```json
[
  {
    "id": "pr_001",
    "agent_key": "vendor_risk",
    "agent_display_name": "Vendor Risk",
    "category": "business",
    "execution_mode": "propose",
    "risk_level": "high",
    "status": "needs_review",
    "title": "Bank details changed on a contractor invoice",
    "subtitle": "Bright Futures Studio \u00b7 new account flagged",
    "amount": 3200,
    "confidence": 0.71,
    "why_suggested": {
      "trigger": "Payment bank account on this invoice differs from the account used on this vendor's last 6 payments.",
      "evidence": [
        {
          "text": "New account number first seen 2 days ago",
          "linked_source": {
            "type": "counterparty",
            "id": "counterparty_pr_001_1",
            "deep_link": "brain://counterparty/counterparty_pr_001_1"
          }
        },
        {
          "text": "Vendor has no prior record of changing banking details",
          "linked_source": {
            "type": "counterparty",
            "id": "counterparty_pr_001_2",
            "deep_link": "brain://counterparty/counterparty_pr_001_2"
          }
        },
        {
          "text": "Invoice was submitted from a new email domain variant",
          "linked_source": {
            "type": "counterparty",
            "id": "counterparty_pr_001_3",
            "deep_link": "brain://counterparty/counterparty_pr_001_3"
          }
        }
      ]
    },
    "recommended_action": "Hold payment and confirm new bank details directly with the vendor before paying.",
    "what_happens_next": {
      "if_approved": "Payment is held; a verification request is logged for the vendor contact on file.",
      "if_edited": "You can mark the new account as verified if you've already confirmed it out of band.",
      "if_rejected": "Flag is dismissed and the original scheduled payment proceeds as-is."
    },
    "risk_note": "Paying to an unverified new account is the most common way invoice fraud succeeds.",
    "source": "ledger_payments, ledger_counterparties",
    "created_at": "2026-07-11T14:02:00Z",
    "scenario_module": "account_comparison"
  },
  {
    "id": "pr_002",
    "agent_key": "payment",
    "agent_display_name": "Payment",
    "category": "business",
    "execution_mode": "propose",
    "risk_level": "standard",
    "status": "needs_review",
    "title": "3 vendor invoices ready to batch and pay",
    "subtitle": "Due within 5 days \u00b7 no exceptions found",
    "amount": 14850,
    "confidence": 0.93,
    "why_suggested": {
      "trigger": "Invoices matched to approved POs and within normal payment terms are due soon.",
      "evidence": [
        {
          "text": "All 3 invoices matched 1:1 to open purchase orders",
          "linked_source": {
            "type": "invoice",
            "id": "invoice_pr_002_1",
            "deep_link": "brain://invoice/invoice_pr_002_1"
          }
        },
        {
          "text": "No amount, quantity, or vendor mismatches found",
          "linked_source": {
            "type": "invoice",
            "id": "invoice_pr_002_2",
            "deep_link": "brain://invoice/invoice_pr_002_2"
          }
        },
        {
          "text": "Combined batch fits within this week's operating cash buffer",
          "linked_source": {
            "type": "invoice",
            "id": "invoice_pr_002_3",
            "deep_link": "brain://invoice/invoice_pr_002_3"
          }
        }
      ]
    },
    "recommended_action": "Batch and schedule payment for all 3 invoices on their due dates.",
    "what_happens_next": {
      "if_approved": "Payment instructions are sent to the execution service and scheduled for each due date.",
      "if_edited": "You can remove individual invoices from the batch or change the pay date.",
      "if_rejected": "No payments are scheduled; invoices remain open for manual handling."
    },
    "risk_note": "Low risk \u2014 this is a routine batch with no flagged exceptions.",
    "source": "ledger_invoices, ledger_purchase_orders",
    "created_at": "2026-07-11T09:15:00Z",
    "scenario_module": "document_stack"
  },
  {
    "id": "pr_003",
    "agent_key": "collections",
    "agent_display_name": "Collections",
    "category": "business",
    "execution_mode": "propose",
    "risk_level": "standard",
    "status": "needs_review",
    "title": "Northstar Design invoice is 18 days overdue",
    "subtitle": "Receivable \u00b7 draft a reminder",
    "amount": 6200,
    "confidence": 0.88,
    "why_suggested": {
      "trigger": "Invoice passed its net-30 due date with no payment or dispute logged.",
      "evidence": [
        {
          "text": "No partial payment recorded",
          "linked_source": {
            "type": "receivable",
            "id": "receivable_pr_003_1",
            "deep_link": "brain://receivable/receivable_pr_003_1"
          }
        },
        {
          "text": "No dispute or credit memo on file",
          "linked_source": {
            "type": "receivable",
            "id": "receivable_pr_003_2",
            "deep_link": "brain://receivable/receivable_pr_003_2"
          }
        },
        {
          "text": "Customer's other invoices have historically paid within terms",
          "linked_source": {
            "type": "receivable",
            "id": "receivable_pr_003_3",
            "deep_link": "brain://receivable/receivable_pr_003_3"
          }
        }
      ]
    },
    "recommended_action": "Send a friendly first reminder referencing the invoice number and due date.",
    "what_happens_next": {
      "if_approved": "A reminder email is drafted and queued for your send, or sent automatically if auto-send is on.",
      "if_edited": "You can rewrite the reminder tone or push the send date back.",
      "if_rejected": "No reminder is sent; the invoice stays in aging without action."
    },
    "risk_note": "Low risk \u2014 this only sends a message, no funds move.",
    "source": "ledger_receivables",
    "created_at": "2026-07-10T18:40:00Z",
    "scenario_module": "message_preview"
  },
  {
    "id": "pr_004",
    "agent_key": "treasury",
    "agent_display_name": "Treasury",
    "category": "business",
    "execution_mode": "propose",
    "risk_level": "elevated",
    "status": "needs_review",
    "title": "Move idle cash into treasury yield?",
    "subtitle": "Operating \u2022\u20224821 \u2192 Treasury (T-Bills)",
    "amount": 100000,
    "confidence": 0.81,
    "why_suggested": {
      "trigger": "Operating balance has stayed above your working-capital floor for 21 straight days.",
      "evidence": [
        {
          "text": "Current balance exceeds 60-day average obligations by $118,000",
          "linked_source": {
            "type": "account",
            "id": "account_pr_004_1",
            "deep_link": "brain://account/account_pr_004_1"
          }
        },
        {
          "text": "No large payables or payroll runs scheduled in the next 10 days",
          "linked_source": {
            "type": "account",
            "id": "account_pr_004_2",
            "deep_link": "brain://account/account_pr_004_2"
          }
        },
        {
          "text": "Comparable balance is earning near-zero yield in the operating account",
          "linked_source": {
            "type": "account",
            "id": "account_pr_004_3",
            "deep_link": "brain://account/account_pr_004_3"
          }
        }
      ]
    },
    "recommended_action": "Sweep $100,000 into short-duration T-Bills, leaving the working-capital floor untouched.",
    "what_happens_next": {
      "if_approved": "A transfer proposal is sent to your banking/execution partner for you to authorize the actual movement.",
      "if_edited": "You can change the amount or choose a different instrument/maturity.",
      "if_rejected": "Cash stays in the operating account; Brain will re-check in the next cycle."
    },
    "risk_note": "Moving funds always needs a human to actually authorize the transfer \u2014 Brain only proposes the sweep.",
    "source": "ledger_balances, wiki_cash_policy",
    "created_at": "2026-07-11T07:00:00Z",
    "scenario_module": "account_flow"
  },
  {
    "id": "pr_005",
    "agent_key": "cash_forecast",
    "agent_display_name": "Cash Forecasting",
    "category": "business",
    "execution_mode": "propose",
    "risk_level": "low",
    "status": "approved_automatically",
    "title": "13-week cash forecast updated",
    "subtitle": "No shortfall risk detected",
    "amount": null,
    "confidence": 0.9,
    "why_suggested": {
      "trigger": "Weekly forecast refresh ran on schedule using latest ledger and payroll data.",
      "evidence": [
        {
          "text": "Payroll and recurring vendor payments projected against current balance",
          "linked_source": {
            "type": "forecast",
            "id": "forecast_pr_005_1",
            "deep_link": "brain://forecast/forecast_pr_005_1"
          }
        },
        {
          "text": "No week in the 13-week window dips below the working-capital floor",
          "linked_source": {
            "type": "forecast",
            "id": "forecast_pr_005_2",
            "deep_link": "brain://forecast/forecast_pr_005_2"
          }
        },
        {
          "text": "Forecast variance from last week's actuals was under 4%",
          "linked_source": {
            "type": "forecast",
            "id": "forecast_pr_005_3",
            "deep_link": "brain://forecast/forecast_pr_005_3"
          }
        }
      ]
    },
    "recommended_action": "No action needed \u2014 forecast is informational this cycle.",
    "what_happens_next": {
      "if_approved": "Forecast is published to your dashboard as the current view.",
      "if_edited": "You can adjust assumptions (e.g. add a known upcoming expense) and re-run.",
      "if_rejected": "Not applicable \u2014 this is a read-only update, not a proposal requiring approval."
    },
    "risk_note": "None \u2014 this is an informational update with no funds movement.",
    "source": "ledger_payroll, ledger_payments, ledger_receivables",
    "created_at": "2026-07-11T06:00:00Z",
    "scenario_module": "forecast_chart"
  },
  {
    "id": "pr_006",
    "agent_key": "dispute",
    "agent_display_name": "Dispute",
    "category": "business",
    "execution_mode": "propose",
    "risk_level": "standard",
    "status": "needs_review",
    "title": "Card charge disputed by customer, evidence ready",
    "subtitle": "Chargeback \u00b7 $840 \u00b7 response due in 6 days",
    "amount": 840,
    "confidence": 0.76,
    "why_suggested": {
      "trigger": "A chargeback notification was ingested with a response deadline.",
      "evidence": [
        {
          "text": "Matching invoice and delivery confirmation found in the ledger",
          "linked_source": {
            "type": "payment",
            "id": "payment_pr_006_1",
            "deep_link": "brain://payment/payment_pr_006_1"
          }
        },
        {
          "text": "No prior dispute history from this customer",
          "linked_source": {
            "type": "payment",
            "id": "payment_pr_006_2",
            "deep_link": "brain://payment/payment_pr_006_2"
          }
        },
        {
          "text": "Response window closes in 6 days",
          "linked_source": {
            "type": "payment",
            "id": "payment_pr_006_3",
            "deep_link": "brain://payment/payment_pr_006_3"
          }
        }
      ]
    },
    "recommended_action": "Submit the matched invoice and delivery confirmation as dispute evidence.",
    "what_happens_next": {
      "if_approved": "Evidence package is submitted to the payment processor's dispute portal.",
      "if_edited": "You can add or remove supporting documents before submission.",
      "if_rejected": "No evidence is submitted; the chargeback will likely resolve in the customer's favor by default."
    },
    "risk_note": "Missing the response window means an automatic loss regardless of merits.",
    "source": "ledger_payments, wiki_fulfillment_records",
    "created_at": "2026-07-09T11:20:00Z",
    "scenario_module": "document_stack"
  },
  {
    "id": "pr_007",
    "agent_key": "compliance",
    "agent_display_name": "Compliance",
    "category": "business",
    "execution_mode": "notify_only",
    "risk_level": "elevated",
    "status": "needs_review",
    "title": "New vendor missing a signed W-9",
    "subtitle": "Onboarded 3 days ago \u00b7 no tax form on file",
    "amount": null,
    "confidence": 0.95,
    "why_suggested": {
      "trigger": "A vendor was added and paid without a W-9 or equivalent tax form on record.",
      "evidence": [
        {
          "text": "No document tagged 'W-9' in this vendor's file",
          "linked_source": {
            "type": "vendor_document",
            "id": "vendor_document_pr_007_1",
            "deep_link": "brain://vendor_document/vendor_document_pr_007_1"
          }
        },
        {
          "text": "First payment already issued",
          "linked_source": {
            "type": "vendor_document",
            "id": "vendor_document_pr_007_2",
            "deep_link": "brain://vendor_document/vendor_document_pr_007_2"
          }
        },
        {
          "text": "Vendor classified as a US-based contractor",
          "linked_source": {
            "type": "vendor_document",
            "id": "vendor_document_pr_007_3",
            "deep_link": "brain://vendor_document/vendor_document_pr_007_3"
          }
        }
      ]
    },
    "recommended_action": "Request a signed W-9 from the vendor before year-end 1099 filing.",
    "what_happens_next": {
      "if_approved": "Not applicable \u2014 this is a flag, not an action Brain can take on its own.",
      "if_edited": "Not applicable.",
      "if_rejected": "Not applicable."
    },
    "risk_note": "Missing tax forms create year-end filing and penalty exposure, not immediate financial risk.",
    "source": "wiki_vendor_documents, ledger_payments",
    "created_at": "2026-07-08T16:00:00Z",
    "scenario_module": "document_checklist"
  },
  {
    "id": "pr_008",
    "agent_key": "revenue_intel",
    "agent_display_name": "Revenue Intelligence",
    "category": "business",
    "execution_mode": "notify_only",
    "risk_level": "low",
    "status": "approved_automatically",
    "title": "Enterprise segment revenue up 12% month over month",
    "subtitle": "Driven by 2 upsells, no churn this month",
    "amount": null,
    "confidence": 0.87,
    "why_suggested": {
      "trigger": "Monthly revenue rollup flagged a notable segment-level change.",
      "evidence": [
        {
          "text": "Two existing accounts upgraded tier this month",
          "linked_source": {
            "type": "subscription",
            "id": "subscription_pr_008_1",
            "deep_link": "brain://subscription/subscription_pr_008_1"
          }
        },
        {
          "text": "No cancellations recorded in the enterprise segment",
          "linked_source": {
            "type": "subscription",
            "id": "subscription_pr_008_2",
            "deep_link": "brain://subscription/subscription_pr_008_2"
          }
        },
        {
          "text": "Change exceeds the 10% month-over-month notification threshold",
          "linked_source": {
            "type": "subscription",
            "id": "subscription_pr_008_3",
            "deep_link": "brain://subscription/subscription_pr_008_3"
          }
        }
      ]
    },
    "recommended_action": "No action needed \u2014 informational insight only.",
    "what_happens_next": {
      "if_approved": "Not applicable \u2014 surfaced on the dashboard automatically.",
      "if_edited": "Not applicable.",
      "if_rejected": "Not applicable."
    },
    "risk_note": "None \u2014 informational only.",
    "source": "ledger_receivables, wiki_subscriptions",
    "created_at": "2026-07-11T05:00:00Z",
    "scenario_module": "trend_chart"
  },
  {
    "id": "pr_009",
    "agent_key": "reconciliation",
    "agent_display_name": "Reconciliation",
    "category": "agnostic",
    "execution_mode": "propose",
    "risk_level": "low",
    "status": "needs_review",
    "title": "A bank line doesn't match the ledger",
    "subtitle": "Reconciliation \u00b7 propose a correcting entry",
    "amount": 184,
    "confidence": 0.84,
    "why_suggested": {
      "trigger": "One bank statement line has no matching ledger entry within the normal 3-day matching window.",
      "evidence": [
        {
          "text": "Amount and date closely match a merchant fee pattern seen in prior months",
          "linked_source": {
            "type": "bank_feed",
            "id": "bank_feed_pr_009_1",
            "deep_link": "brain://bank_feed/bank_feed_pr_009_1"
          }
        },
        {
          "text": "No existing ledger entry for this transaction ID",
          "linked_source": {
            "type": "bank_feed",
            "id": "bank_feed_pr_009_2",
            "deep_link": "brain://bank_feed/bank_feed_pr_009_2"
          }
        },
        {
          "text": "All other lines this period matched cleanly",
          "linked_source": {
            "type": "bank_feed",
            "id": "bank_feed_pr_009_3",
            "deep_link": "brain://bank_feed/bank_feed_pr_009_3"
          }
        }
      ]
    },
    "recommended_action": "Post a correcting entry for the unmatched $184 merchant fee.",
    "what_happens_next": {
      "if_approved": "The correcting entry is posted to the ledger and the period is marked reconciled.",
      "if_edited": "You can change the entry's category or amount before posting.",
      "if_rejected": "The line stays unmatched and the period remains open."
    },
    "risk_note": "Very low risk \u2014 small amount, clear pattern match to a recurring known fee type.",
    "source": "ledger_bank_feed, ledger_gl",
    "created_at": "2026-07-11T12:10:00Z",
    "scenario_module": "line_diff"
  },
  {
    "id": "pr_010",
    "agent_key": "subscription",
    "agent_display_name": "Subscription",
    "category": "agnostic",
    "execution_mode": "propose",
    "risk_level": "standard",
    "status": "needs_review",
    "title": "Unused software seat renewing in 4 days",
    "subtitle": "Figma \u00b7 1 of 8 seats inactive 60+ days",
    "amount": 180,
    "confidence": 0.79,
    "why_suggested": {
      "trigger": "A paid seat has shown no login activity for over 60 days and renews soon.",
      "evidence": [
        {
          "text": "Seat assigned to a user with no login in 63 days",
          "linked_source": {
            "type": "app_usage",
            "id": "app_usage_pr_010_1",
            "deep_link": "brain://app_usage/app_usage_pr_010_1"
          }
        },
        {
          "text": "Renewal charge scheduled in 4 days",
          "linked_source": {
            "type": "app_usage",
            "id": "app_usage_pr_010_2",
            "deep_link": "brain://app_usage/app_usage_pr_010_2"
          }
        },
        {
          "text": "7 other seats on the same plan show regular weekly use",
          "linked_source": {
            "type": "app_usage",
            "id": "app_usage_pr_010_3",
            "deep_link": "brain://app_usage/app_usage_pr_010_3"
          }
        }
      ]
    },
    "recommended_action": "Cancel the unused seat before renewal to avoid the charge.",
    "what_happens_next": {
      "if_approved": "A cancellation request is sent to the vendor's billing portal before the renewal date.",
      "if_edited": "You can reassign the seat to someone else instead of cancelling it.",
      "if_rejected": "The seat renews as normal at full price."
    },
    "risk_note": "Low risk \u2014 worst case is simply re-adding the seat later if it turns out to be needed.",
    "source": "wiki_subscriptions, wiki_app_usage",
    "created_at": "2026-07-10T09:30:00Z",
    "scenario_module": "usage_timeline"
  },
  {
    "id": "pr_011",
    "agent_key": "fraud_anomaly",
    "agent_display_name": "Fraud & Anomaly",
    "category": "agnostic",
    "execution_mode": "notify_only",
    "risk_level": "high",
    "status": "needs_review",
    "title": "Two invoices from different vendors share a phone number",
    "subtitle": "Cross-vendor pattern \u00b7 possible shell entities",
    "amount": null,
    "confidence": 0.68,
    "why_suggested": {
      "trigger": "Contact details on two supposedly unrelated vendors overlap.",
      "evidence": [
        {
          "text": "Same phone number listed on both vendor records",
          "linked_source": {
            "type": "counterparty",
            "id": "counterparty_pr_011_1",
            "deep_link": "brain://counterparty/counterparty_pr_011_1"
          }
        },
        {
          "text": "Both vendors added within the same 10-day window",
          "linked_source": {
            "type": "counterparty",
            "id": "counterparty_pr_011_2",
            "deep_link": "brain://counterparty/counterparty_pr_011_2"
          }
        },
        {
          "text": "Combined billing to date across both vendors: $9,400",
          "linked_source": {
            "type": "counterparty",
            "id": "counterparty_pr_011_3",
            "deep_link": "brain://counterparty/counterparty_pr_011_3"
          }
        }
      ]
    },
    "recommended_action": "Manually verify both vendors are legitimate, separate businesses before further payments.",
    "what_happens_next": {
      "if_approved": "Not applicable \u2014 this is a flag, not an action Brain can take on its own.",
      "if_edited": "Not applicable.",
      "if_rejected": "Not applicable."
    },
    "risk_note": "Shared contact details across vendors is a common shell-vendor fraud pattern; confidence is moderate, so this needs human judgment, not automatic action.",
    "source": "ledger_counterparties",
    "created_at": "2026-07-09T20:45:00Z",
    "scenario_module": "entity_comparison"
  }
]
```

## Wireframe — proposal detail modal

Opens as a slide-up sheet on mobile / centered modal on desktop, over a dimmed
background. Structure top to bottom:

```
┌─────────────────────────────────────────────┐
│  ✕                                    [risk] │  ← close button, risk pill top-right
│                                               │     (color = risk_level)
│  [agent icon]  Vendor Risk                   │  ← small agent badge + display name
│                                               │
│  Bank details changed on a                   │  ← title, large, same wording as
│  contractor invoice                          │     the row that was tapped
│  Bright Futures Studio · new account flagged │  ← subtitle, muted
│                                               │
│                                    $3,200     │  ← amount, monospace, right-aligned
│                                               │     or omitted entirely if null
│  ─────────────────────────────────────────   │
│                                               │
│  WHY BRAIN SUGGESTED THIS                    │  ← section label, small caps, muted
│  ↗ New account number first seen 2 days ago  │  ← evidence bullets are LINKS:
│  ↗ Vendor has no prior record of changing    │     violet text + arrow icon, tap
│    banking details                           │     opens the underlying invoice /
│  ↗ Invoice submitted from a new email        │     payment / counterparty record
│    domain variant                            │     in a nested sheet
│                                               │
│  Confidence  ▓▓▓▓▓▓▓░░░  71%                 │  ← small horizontal bar, violet fill
│                                               │
│  ─────────────────────────────────────────   │
│                                               │
│  [ SCENARIO MODULE ]                         │  ← contextual block, swaps by
│  e.g. old account card | new account card    │     scenario_module. See table
│  side by side, differing fields highlighted  │     below. This is the one part
│                                               │     of the modal that isn't a
│                                               │     generic bullet list.
│                                               │
│  ─────────────────────────────────────────   │
│                                               │
│  RECOMMENDED ACTION                          │
│  Hold payment and confirm new bank details   │  ← plain sentence, no jargon
│  directly with the vendor before paying.     │
│                                               │
│  ─────────────────────────────────────────   │
│                                               │
│  WHAT HAPPENS NEXT                           │
│  ✓ Approve → Payment is held; a verification │
│    request is logged for the vendor on file. │
│  ✎ Edit → Mark the account as verified if    │
│    you've confirmed it separately.           │
│  ✕ Reject → Flag is dismissed and the        │
│    original payment proceeds.                │
│                                               │
│  ⚠ Paying to an unverified new account is    │  ← risk_note, single line,
│    the most common way invoice fraud         │     amber/crimson text depending
│    succeeds.                                 │     on risk_level
│                                               │
├─────────────────────────────────────────────┤
│   [ Reject ]   [ Edit ]   [ Approve → ]      │  ← sticky footer, 3 buttons
└─────────────────────────────────────────────┘
```

### Scenario module — what renders in that slot, per agent

The shell above (header → why → evidence → confidence → recommended action →
next steps → risk note → footer) never changes. Only this one slot does, and
each variant is still built from plain fields in the record, not bespoke logic:

| scenario_module | agents | what it shows |
|---|---|---|
| `account_comparison` | vendor_risk | old bank account vs new bank account, differing digits highlighted |
| `entity_comparison` | fraud_anomaly | two vendor cards side by side, shared field (e.g. phone number) highlighted in both |
| `document_stack` | payment, dispute | thumbnail chips for each linked document (invoice, PO, delivery confirmation); tap to preview |
| `message_preview` | collections | the actual draft reminder text, editable inline |
| `account_flow` | treasury | from-account → to-account diagram with balance before/after |
| `forecast_chart` | cash_forecast | small 13-week sparkline with the current balance marked |
| `line_diff` | reconciliation | two-column table: bank statement line vs ledger line, mismatched cell highlighted |
| `usage_timeline` | subscription | small timeline showing last login vs today, renewal date marked |
| `document_checklist` | compliance | checklist of required documents with missing ones flagged |
| `trend_chart` | revenue_intel | small line/bar chart of the metric that changed |

If a record's evidence and scenario module together would be redundant (e.g. a
very simple `line_diff` that's just two numbers), it's fine for the module to
be compact — the point is contextual relevance, not guaranteed visual weight.



Notify-only records (`compliance`, `revenue_intel`, `fraud_anomaly`) use the same
layout down through the risk note, but replace the "WHAT HAPPENS NEXT" list with
a single sentence ("This is a flag for your awareness — Brain doesn't take
action on it automatically.") and the footer becomes one centered button:
**[ Acknowledge ]**.

`approved_automatically` records open a lighter-weight version of the same modal:
same why/evidence/confidence sections, but the footer becomes a single disabled
state showing **"Approved automatically on [date]"** with a small **Undo** link
instead of action buttons, since no decision is pending.

## Interaction notes

- Tapping outside the modal or the ✕ closes it without side effects (equivalent
  to neither approving nor rejecting).
- Tapping a linked evidence line opens a nested sheet showing that underlying
  record (the invoice, the bank line, the counterparty) rather than navigating
  away from the proposal — closing the nested sheet returns to the modal.
- The confidence bar's fill color shifts with risk_level, not with the number
  itself — a high-confidence, high-risk item should still read as attention-
  worthy, not "safe because confidence is high."
- Edit should open an inline editable form for the fields relevant to that
  agent (amount for payment/treasury, reminder text for collections, entry
  category for reconciliation) rather than a separate screen. For agents with
  a `message_preview` module (collections), Edit and the module are the same
  surface — editing happens directly in the preview.
- Keep the shell (header, why, confidence, recommended action, next steps,
  risk note, footer) identical across all 11 agents. Only the `scenario_module`
  slot and its content differ — this is what keeps the experience feeling like
  one product instead of 11 bolted-together screens, while still giving each
  scenario the specific visual it needs to be understood at a glance.

## Acceptance criteria

- [ ] All 11 mock records above render correctly in Needs Review / Approved
      Automatically lists per their `status`.
- [ ] Tapping any row opens the modal populated from that record's data.
- [ ] Every evidence line is tappable and opens its `linked_source` in a
      nested sheet (mock/stub content is fine for now).
- [ ] The scenario module slot renders the correct variant per
      `scenario_module` for all 11 agent types, using the table above.
- [ ] Propose-mode records show 3 footer buttons; notify-only records show 1.
- [ ] Risk pill color and risk note text color both track `risk_level`.
- [ ] Confidence bar renders proportionally to `confidence`.
- [ ] Modal shell is a single reusable component; only the scenario module
      swaps per agent — no per-agent conditional layout branches elsewhere.
