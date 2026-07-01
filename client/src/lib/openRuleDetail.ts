import type { AutoRule } from "./proposalTypes";
import { getRule } from "./rulesStore";

/* ── Single source of truth for opening a rule's RuleDetail ───────────────────
   Every RULE REFERENCE across the app (auto-handled receipt, Audit Log record
   popup, Rules page, settled record card) resolves the same way: look the rule
   up by id in the rules store, and — only if it resolves — navigate to its
   existing `/rules/:id` route. Callers use `resolveRule` to decide whether to
   render a tappable link or plain "(rule unavailable)" text; they never
   duplicate the lookup. Navigation uses wouter's push `navigate`, so the browser
   back button returns the user to wherever they came from (receipt, audit
   record). An unresolved id is a bug (dangling reference) — we `console.warn`
   loudly rather than fail silently. */

export function resolveRule(
  ruleId: string | null | undefined,
): AutoRule | undefined {
  if (!ruleId) return undefined;
  return getRule(ruleId);
}

/** Open a rule's detail if (and only if) it resolves. Returns whether it did. */
export function openRuleDetail(
  ruleId: string | null | undefined,
  navigate: (to: string) => void,
): boolean {
  const rule = resolveRule(ruleId);
  if (!rule) {
    console.warn(`openRuleDetail: no rule found for id '${ruleId ?? ""}'`);
    return false;
  }
  navigate(`/rules/${rule.id}`);
  return true;
}
