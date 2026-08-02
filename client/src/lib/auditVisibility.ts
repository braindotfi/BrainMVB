/**
 * Splitting audit records into pipeline traffic and everything else.
 *
 * The audit log is overwhelmingly pipeline noise — wiki regenerations, router
 * selections, policy evaluations, ingest dedupes — and a person reading it
 * usually wants the handful of records that say who decided what. So the two
 * need telling apart.
 *
 * WHAT THIS MODULE NO LONGER DOES, deliberately: an earlier design hid pipeline
 * events behind a "Show system activity" toggle that was ON by default, and
 * this file carried the empty-state copy and the persisted per-user preference
 * for it. That design is gone. Settings → Audit Log now shows the complete
 * trail with NO filter applied at load, and the Inbox shows decisions only.
 *
 * The old helpers were deleted rather than left lying around because they
 * encoded the opposite rule — copy like "97 system events are hidden" and a
 * stored hide-by-default preference — and a filter that is on before anyone
 * asks for it turns an empty list into a fact about the filter rather than a
 * fact about the tenant. That is the bug this codebase keeps re-introducing;
 * leaving the scaffolding for it in place is an invitation to do it again.
 *
 * What remains is the classifier itself, which is still exactly what the new
 * surface needs to badge each row.
 */

import { isSystemActivity } from "./auditTypes";
import type { AuditRecord } from "./auditTypes";

export interface AuditPartition {
  /** Decisions and human activity: what a reader is usually looking for. */
  visible: AuditRecord[];
  /** Pipeline/system events. */
  system: AuditRecord[];
}

export function partitionSystemActivity(records: AuditRecord[]): AuditPartition {
  const visible: AuditRecord[] = [];
  const system: AuditRecord[] = [];
  for (const r of records) (isSystemActivity(r) ? system : visible).push(r);
  return { visible, system };
}
