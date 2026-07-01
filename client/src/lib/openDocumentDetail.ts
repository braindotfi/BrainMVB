import type { DocumentRecord } from "./documentTypes";
import { getDocument } from "./documentsStore";

/* ── Single source of truth for opening a document's EVIDENCE viewer ──────────
   Every document/record reference across the app (audit-log linked evidence,
   a proposal's source document, a settled receipt) resolves the same way: look
   the document up by id in the canonical documentsStore and — only if it
   resolves — hand it to a caller-supplied `open` callback (which shows the
   DocumentViewerPopup). Callers use `resolveDocument` to decide whether to
   render a tappable link or plain text; they never duplicate the lookup. An
   unresolved id is a bug (dangling reference) — we `console.warn` loudly rather
   than fail silently. This is the ONE code path for all DocKinds; the earlier
   invoice-only `openInvoiceDetail` folded into this. Mirrors
   openRuleDetail / openVendorDetail / openProposalDetail. */

export function resolveDocument(
  documentId: string | null | undefined,
): DocumentRecord | undefined {
  return getDocument(documentId);
}

/** Open a document's evidence viewer if (and only if) it resolves. Returns whether it did. */
export function openDocumentDetail(
  documentId: string | null | undefined,
  open: (doc: DocumentRecord) => void,
): boolean {
  const doc = resolveDocument(documentId);
  if (!doc) {
    console.warn(
      `openDocumentDetail: no document found for id '${documentId ?? ""}'`,
    );
    return false;
  }
  open(doc);
  return true;
}
