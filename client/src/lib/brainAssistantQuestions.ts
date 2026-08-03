import { useQuery } from "@tanstack/react-query";

/* ── Tenant-aware Brain Assistant suggestion chips ────────────────────────────
   Replaces the hardcoded SUGGESTED_QUESTIONS list in BrainAssistant.tsx with
   whatever brain-core says this tenant may usefully ask.

   PATH DRIFT — read before changing the URL. The brief specified
   `GET /wiki/suggested-questions`. That route does not exist: brain-core
   answers `404 route_not_found` for `/v1/wiki/suggested-questions`. The
   deployed surface is **`GET /assistant/questions`** — tagged `Wiki`, requires
   `wiki:read`, takes an optional `limit` (default 50, max 100). Verified
   against the live spec at https://api.brain.fi/v1/openapi.yaml AND by calling
   both paths against a real tenant, because the published spec under-reports
   (see .agents/memory/brain-api-surface-wiring.md). It reaches us through the
   BFF's generic GET passthrough, so no new proxy route is needed.

   RANKING — the `AssistantQuestion` schema carries **no** rank, score,
   priority or position field. "Ranked" therefore means exactly one thing: the
   order brain-core returned. We preserve array order and never re-sort. A
   sort key invented here would be *us* deciding the ranking, which is the
   thing this change exists to prevent.

   ELIGIBILITY — `status` is one of `suggested | answered | dismissed`. Only
   `suggested` is eligible to render as a prompt chip; an answered question is
   spent and a dismissed one was explicitly rejected. A row whose status is
   absent or unrecognised is NOT eligible — reads arrive unnormalized through
   the passthrough, so "I could not confirm this is suggested" must fail
   closed rather than guess its way onto the screen.

   WHY NO HAND-AUTHORED STRINGS — the point of this change is that a chip can
   never again promise a capability the backend lacks (the assistant once
   offered "Forecast cash flow" against a trailing-actuals-only endpoint; see
   .agents/memory/assistant-answer-status.md). Every chip drawn from this hook
   is a question brain-core itself proposed for this tenant. The only strings
   that may stand in are the pre-existing vetted fallbacks the component
   already shipped — never new copy written to fill a gap. */

/** One row of `GET /assistant/questions`. Only the fields we actually consume
 *  are declared; everything is optional because the BFF relays brain-core
 *  verbatim and a client type for a proxied read describes what we hope
 *  arrives, not what does. */
export interface AssistantQuestionRow {
  id?: unknown;
  question?: unknown;
  status?: unknown;
}

/** A chip we are willing to render: real text, confirmed-suggested, stable key. */
export interface EligibleQuestion {
  id: string;
  question: string;
}

/** The single status brain-core uses for "not yet asked, still worth asking". */
const ELIGIBLE_STATUS = "suggested";

/**
 * Narrow a raw `/assistant/questions` payload to the chips we may render.
 *
 * Order is preserved verbatim — see the RANKING note above. Duplicates (by
 * normalised question text) are dropped, keeping the FIRST occurrence, so the
 * highest-ranked copy survives and React keys stay unique.
 */
export function eligibleAssistantQuestions(raw: unknown): EligibleQuestion[] {
  const rows = (raw as { questions?: unknown } | null | undefined)?.questions;
  if (!Array.isArray(rows)) return [];

  const out: EligibleQuestion[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    if (typeof row !== "object" || row === null) return;
    const { question, status, id } = row as AssistantQuestionRow;

    // Fail closed: only an explicit "suggested" qualifies.
    if (typeof status !== "string" || status.trim().toLowerCase() !== ELIGIBLE_STATUS) return;

    if (typeof question !== "string") return;
    const text = question.trim();
    if (text.length === 0) return;

    const dedupeKey = text.toLowerCase();
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    /* Prefer upstream's id for the React key, but never trust it to be present
       or unique — fall back to the index, which is stable for a given payload. */
    const key = typeof id === "string" && id.trim().length > 0 ? id.trim() : `q-${index}`;
    out.push({ id: key, question: text });
  });

  return out;
}

/** Where the rendered chips came from. Lets a caller (and a test) tell a
 *  tenant-sourced row from the vetted stand-in without re-deriving the rule. */
export type SuggestionChipSource = "tenant" | "fallback";

export interface SuggestionChipState {
  /** Exact strings to render, in render order. */
  chips: string[];
  source: SuggestionChipSource;
}

/**
 * Decide which suggestion chips the assistant renders.
 *
 * The component maps this 1:1 onto buttons, so chip order IS button order and
 * this function is the whole contract:
 *
 *   - eligible tenant questions exist → render them, in brain-core's order
 *   - none eligible / still loading / read failed → render the vetted fallback
 *
 * Collapsing loading + failure + genuinely-empty onto the same fallback is
 * deliberate here, and is NOT the "unreachable data renders as all-clear" bug
 * (.agents/memory/unreachable-data-all-clear.md). That rule governs surfaces
 * that make a *claim* about the tenant's money or setup. These chips claim
 * nothing — they are affordances, every fallback string routes through the
 * same assistant pipe and works regardless of this read, and the alternative
 * (an empty or flickering row) reads as broken. The hook still exposes
 * `isError` separately for any caller that does need to tell them apart.
 */
export function resolveSuggestionChips(params: {
  questions: EligibleQuestion[];
  isLoading: boolean;
  isError: boolean;
  fallback: readonly string[];
}): SuggestionChipState {
  const { questions, fallback } = params;

  if (questions.length > 0) {
    return { chips: questions.map((q) => q.question), source: "tenant" };
  }

  return { chips: [...fallback], source: "fallback" };
}

export interface UseAssistantQuestionsResult {
  /** Eligible, upstream-ranked questions. Empty when none qualify OR the read failed. */
  questions: EligibleQuestion[];
  /** The read is still in flight — callers must not treat `questions` as an answer yet. */
  isLoading: boolean;
  /** The read failed. Distinct from "answered with nothing" on purpose. */
  isError: boolean;
}

/**
 * Live suggestion chips for the current tenant.
 *
 * Deliberately surfaces `isLoading` and `isError` separately rather than
 * collapsing both into an empty array: a caller has to be able to tell
 * "this tenant has no suggestions" from "we could not ask".
 */
export function useAssistantQuestions(): UseAssistantQuestionsResult {
  const query = useQuery<unknown>({
    queryKey: ["/api/brain/assistant/questions"],
    retry: false,
  });

  return {
    questions: eligibleAssistantQuestions(query.data),
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
