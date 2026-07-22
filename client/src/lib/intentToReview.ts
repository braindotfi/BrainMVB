import type { ReviewItemType } from "@/components/ReviewItems";
import type { IntentRecord } from "./intentsStore";

/**
 * Map a session-scoped PaymentIntent (from intentsStore) to the ReviewItemType
 * consumed by ReviewModal and the Inbox / Home "Brain Detected" widgets.
 */
export function intentToReview(
  rec: IntentRecord,
  fmt: (v: string | number) => string,
): ReviewItemType {
  const amountStr = fmt(rec.amount);
  const approvers =
    rec.requiredApprovers.length > 0
      ? rec.requiredApprovers.map((a) => a.toUpperCase()).join(" + ")
      : "OWNER + CFO";
  return {
    id: rec.intentId,
    live: true,
    intentId: rec.intentId,
    title: `Approve payment to ${rec.vendor}?`,
    vendor: rec.vendor,
    amount: amountStr,
    due: "Needs approval",
    question: `Should I pay ${rec.vendor} ${amountStr}?`,
    description: `Brain flagged this payment (${rec.invoiceNumber}) and the §6 policy gate flagged it for human sign-off. It is above your auto-pay limit and needs approval from ${approvers} before it can settle.`,
    who: rec.vendor,
    amountFull: amountStr,
    dueBy: "Awaiting approval",
    from: "Brain Smart Account",
    autoLabel: "Always require approval for large payments",
  };
}
