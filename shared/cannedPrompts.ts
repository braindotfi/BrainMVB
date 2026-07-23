/** Canned prompts the BFF sends to brain-core's wiki/question on the app's
 *  own initiative (not typed by a user). The audit log must never hide what
 *  was actually sent — but it should lead with a human title/description and
 *  show the exact prompt as secondary text. Matching is by EXACT prompt text:
 *  user-typed questions never match and render verbatim as before. */

export interface CannedPrompt {
  /** The exact prompt text sent to brain-core (match key). */
  prompt: string;
  /** Short human title for audit record cards and popup headings. */
  title: string;
  /** One-line human description of what the app did and why. */
  description: string;
}

/** Canned prompt for the HomePage "Brain's take" line - one specific, numeric insight. */
export const RECOMMENDATION_PROMPT =
  "In one sentence, give me the single most important and specific thing to know about my " +
  "money right now (a cash-flow, spending, or receivable item). Be concrete and numeric; do " +
  "not greet or add commentary.";

export const CANNED_PROMPTS: ReadonlyArray<CannedPrompt> = [
  {
    prompt: RECOMMENDATION_PROMPT,
    title: "Brain generated your money insight",
    description:
      "Brain scanned your cash flow, spending, and receivables to pick the single most " +
      "important item for your dashboard.",
  },
];

/** Exact-match lookup. Returns undefined for anything not on the canned list
 *  (i.e. every user-typed question). */
export function matchCannedPrompt(question: string | undefined | null): CannedPrompt | undefined {
  if (!question) return undefined;
  return CANNED_PROMPTS.find((c) => c.prompt === question);
}
