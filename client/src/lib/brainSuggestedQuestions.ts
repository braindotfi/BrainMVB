import { useQuery } from "@tanstack/react-query";

/* ── Tenant-aware Brain Assistant suggestion chips ────────────────────────────
   Renders whatever brain-core says THIS tenant may usefully ask, instead of a
   hardcoded list that can promise capabilities the backend lacks.

   ── THE ENDPOINT, AND HOW TO PROBE IT CORRECTLY ────────────────────────────
   Source of truth: **`GET /wiki/suggested-questions`** (tag `Wiki`, requires
   `wiki:read`). It is live and returns real rows.

   Do NOT use `GET /assistant/questions`. That is an unrelated legacy route over
   the old `assistant_questions` table; it answers `200 {"questions": []}` for
   every tenant and always will. The two differ in path, response field, and row
   shape, so a mistake here fails *silently* — the parse yields nothing, the
   fallback renders, and the row looks perfectly healthy. This module was
   originally wired to the legacy route for exactly that reason.

   When re-verifying, note that **an unauthenticated 401 proves nothing**.
   brain-core runs auth before routing, so every path — including
   `/wiki/__nonexistent__` — answers `401 auth_token_missing`. Only an
   authenticated call distinguishes a live route (`200`) from a dead one
   (`404 route_not_found`). Probe through the BFF with a real session:

       curl -b <cookie> localhost:5000/api/brain/wiki/suggested-questions

   ── NO BFF ROUTE IS NEEDED ─────────────────────────────────────────────────
   `server/brain/proxy.ts` ends in a generic catch-all GET passthrough that
   forwards any GET on the member token. This path already reaches core through
   it (verified `200`, real rows). Only WRITES need an allowlist entry; adding a
   dedicated read route here would be dead code shadowed by the passthrough.

   ── ELIGIBILITY IS THE SERVER'S JOB ────────────────────────────────────────
   The spec is explicit: "Returns only currently eligible questions backed by
   the deterministic Wiki-question registry." There is no `status` field to
   filter on, and inventing a client-side eligibility rule would re-suppress
   rows core already cleared. What remains here is *structural* validation only
   — a row without usable `display_text` is dropped, because reads arrive
   unnormalized through the passthrough and a blank chip is worse than no chip.

   ── ORDER IS THE RANKING; DO NOT SORT ──────────────────────────────────────
   Rows carry `usage_rank_score` — per the spec, "the tenant's all-time
   invocation count for that intent", which core "uses to rank otherwise
   eligible suggestions". Ranking is therefore already applied upstream and the
   returned order IS the answer. We render that order verbatim.

   Re-sorting by the score here would be actively wrong twice over: it is core's
   input to a ranking it has already performed (not the rank itself), and on a
   new tenant every count is 0, so a client sort would reshuffle a deliberate
   order into an arbitrary one. `usage_rank_score` is intentionally parsed but
   never used to order — see the test that pins this.

   ── WHY NO HAND-AUTHORED STRINGS ───────────────────────────────────────────
   Every chip is text core itself proposed for this tenant (the assistant once
   offered "Forecast cash flow" against a trailing-actuals-only endpoint; see
   .agents/memory/assistant-answer-status.md). The only strings that may stand
   in are the pre-existing vetted fallbacks the component already shipped —
   never new copy written to fill a gap. */

/** One row of `GET /wiki/suggested-questions` (`WikiSuggestedQuestion`).
 *
 *  The spec marks all three fields required, but every one is optional here on
 *  purpose: the BFF relays core verbatim, so a client type for a proxied read
 *  describes what we hope arrives, not what does. */
export interface WikiSuggestedQuestionRow {
  /** Enum upstream (`transaction_listing`, `cash_flow_listing`, …). Used as the
   *  React key — stable across renders in a way an array index is not. */
  intent_id?: unknown;
  /** The human-facing question text. The only field we actually render. */
  display_text?: unknown;
  /** All-time invocation count. Parsed for debugging; never used to sort. */
  usage_rank_score?: unknown;
}

/** A chip we are willing to render: real text and a stable key. */
export interface EligibleQuestion {
  id: string;
  question: string;
}

/**
 * Narrow a raw `/wiki/suggested-questions` payload to the chips we may render.
 *
 * Reads the `suggestions` array — NOT `questions`, which is the legacy route's
 * field and is always empty. Order is preserved verbatim (see the ordering note
 * above). Duplicates by normalised text are dropped keeping the FIRST
 * occurrence, so the highest-ranked copy survives and React keys stay unique.
 */
export function eligibleSuggestedQuestions(raw: unknown): EligibleQuestion[] {
  const rows = (raw as { suggestions?: unknown } | null | undefined)?.suggestions;
  if (!Array.isArray(rows)) return [];

  const out: EligibleQuestion[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    if (typeof row !== "object" || row === null) return;
    const { intent_id, display_text } = row as WikiSuggestedQuestionRow;

    /* Structural check only — core already decided eligibility. */
    if (typeof display_text !== "string") return;
    const text = display_text.trim();
    if (text.length === 0) return;

    const dedupeKey = text.toLowerCase();
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    /* Prefer upstream's intent_id for the React key, but never trust it to be
       present — fall back to the index, stable for a given payload. */
    const key =
      typeof intent_id === "string" && intent_id.trim().length > 0
        ? intent_id.trim()
        : `suggestion-${index}`;
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
 * deliberate, and is NOT the "unreachable data renders as all-clear" bug
 * (.agents/memory/unreachable-data-all-clear.md). That rule governs surfaces
 * that make a *claim* about the tenant's money or setup. These chips claim
 * nothing — they are affordances, every fallback string routes through the same
 * assistant pipe and works regardless of this read, and the alternative (an
 * empty or flickering row) reads as broken. The hook still exposes `isError`
 * separately for any caller that does need to tell them apart.
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

export interface UseSuggestedQuestionsResult {
  /** Eligible, upstream-ranked questions. Empty when none qualify OR the read failed. */
  questions: EligibleQuestion[];
  /** The read is still in flight — callers must not treat `questions` as an answer yet. */
  isLoading: boolean;
  /** The read failed. Distinct from "answered with nothing" on purpose. */
  isError: boolean;
}

/**
 * The one route these chips may read.
 *
 * Exported solely so a test can pin it. Repointing this at the legacy
 * `/api/brain/assistant/questions` is a silent no-op — every parser test still
 * passes, the fallback renders, and the bug is invisible — so the path needs an
 * assertion of its own. See the endpoint note in the module header.
 */
export const SUGGESTED_QUESTIONS_ENDPOINT = "/api/brain/wiki/suggested-questions";

/**
 * Live suggestion chips for the current tenant.
 *
 * Deliberately surfaces `isLoading` and `isError` separately rather than
 * collapsing both into an empty array: a caller has to be able to tell "this
 * tenant has no suggestions" from "we could not ask".
 */
export function useSuggestedQuestions(): UseSuggestedQuestionsResult {
  const query = useQuery<unknown>({
    queryKey: [SUGGESTED_QUESTIONS_ENDPOINT],
    retry: false,
  });

  return {
    questions: eligibleSuggestedQuestions(query.data),
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
