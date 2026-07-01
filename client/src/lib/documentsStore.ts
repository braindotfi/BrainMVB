import { MOCK_DOCUMENTS } from "./mockDocuments";
import type { DocumentRecord } from "./documentTypes";

/* ── Canonical document store ─────────────────────────────────────────────────
   ONE place every evidence document is looked up from, mirroring rulesStore /
   MOCK_VENDORS. Read-only (seeded from mockDocuments) — documents are source
   evidence Brain reads, not app state it mutates. resolveDocument / getDocument
   is the single lookup used by openDocumentDetail, the viewer's compare toggle,
   and the dev coherence guards. */

export function allDocuments(): DocumentRecord[] {
  return MOCK_DOCUMENTS;
}

export function getDocument(
  id: string | null | undefined,
): DocumentRecord | undefined {
  if (!id) return undefined;
  return MOCK_DOCUMENTS.find((d) => d.id === id);
}
