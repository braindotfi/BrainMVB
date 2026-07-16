import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type IntentOutcome = "allow" | "confirm" | "reject";

/** A PaymentIntent proposed (and possibly declined) in this browser session. */
export interface IntentRecord {
  intentId: string;
  invoiceId: string;
  vendor: string;
  invoiceNumber: string;
  /** Amount in the intent's source currency. */
  amount: number;
  currency: string;
  /** The §6/Policy gate outcome (derived from the intent status). */
  outcome: IntentOutcome;
  status: string;
  /** Roles required to approve (for a `confirm` outcome). */
  requiredApprovers: string[];
  /** True once an operator declined a non-rejected proposal. */
  declined: boolean;
  /** Human-approval progress, set from brain-core's approve response.
      "awaiting_second" - one approval recorded, core still needs another;
      "approved"        - core accepted it (leaves the needs-review queue). */
  approvalState?: "awaiting_second" | "approved";
}

interface IntentsContextValue {
  intents: IntentRecord[];
  addProposed: (rec: Omit<IntentRecord, "declined">) => void;
  markDeclined: (intentId: string) => void;
  setApprovalState: (intentId: string, state: "awaiting_second" | "approved") => void;
}

const IntentsContext = createContext<IntentsContextValue | null>(null);

/**
 * Session-scoped feed of PaymentIntents proposed (and declined) in this browser
 * session. Shared by the Bills inbox (writer) and the Review / Activity pages
 * (readers) so the propose → review → decline story spans the whole app.
 *
 * Deliberately NOT persisted: the demo tenant is ephemeral and a reload
 * re-provisions a fresh one, so there is nothing durable to hydrate from.
 */
export function IntentsProvider({ children }: { children: ReactNode }) {
  const [intents, setIntents] = useState<IntentRecord[]>([]);

  const addProposed = useCallback((rec: Omit<IntentRecord, "declined">) => {
    setIntents((prev) => [
      { ...rec, declined: false },
      ...prev.filter((r) => r.intentId !== rec.intentId),
    ]);
  }, []);

  const markDeclined = useCallback((intentId: string) => {
    setIntents((prev) => prev.map((r) => (r.intentId === intentId ? { ...r, declined: true } : r)));
  }, []);

  const setApprovalState = useCallback((intentId: string, state: "awaiting_second" | "approved") => {
    setIntents((prev) => prev.map((r) => (r.intentId === intentId ? { ...r, approvalState: state } : r)));
  }, []);

  return (
    <IntentsContext.Provider value={{ intents, addProposed, markDeclined, setApprovalState }}>
      {children}
    </IntentsContext.Provider>
  );
}

export function useIntents(): IntentsContextValue {
  const ctx = useContext(IntentsContext);
  if (!ctx) throw new Error("useIntents must be used within an IntentsProvider");
  return ctx;
}
