import type { DocumentRecord, DocKind } from "./documentTypes";
import { apiRequest } from "./queryClient";

/* ── Canonical document store ─────────────────────────────────────────────────
   ONE place every evidence document is looked up from, mirroring rulesStore.
   Read-only, backed by the tenant's live uploads (GET /api/integrations/documents)
   rather than mockDocuments — documents are source evidence Brain reads, not app
   state it mutates. Starts empty; `hydrateDocuments` below fetches once. resolveDocument
   / getDocument is the single lookup used by openDocumentDetail, the viewer's compare
   toggle, and the dev coherence guards. mockDocuments.ts stays for other still-mocked
   surfaces (proposals/audit records) until they're wired to live data — an id that
   only exists there will honestly fail to resolve here (openDocumentDetail's
   resolve-or-plain-text contract). */

/** Shape of a row from GET /api/integrations/documents (server SourceDocument). */
interface SourceDocumentDTO {
  id: string;
  name: string;
  size: number;
  mimeType: string | null;
  category: string | null;
  rawId: string | null;
  sourceType: string | null;
  extractStatus: string | null;
  uploadedAt: string;
}

function fmtUploadDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "unknown date"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* category is a free-text bucket ("bank" | "accounting" | "payroll" | "tax" |
   "payments" | "general") the upload flow assigns — it doesn't map 1:1 onto
   DocKind. Only "bank" has an unambiguous kind; everything else lands on
   "invoice" (the closest generic financial-document pane — its optional fields
   like lineItems/vendorId are simply left undefined below, so nothing invented
   renders). Extraction (parsedId) would let this be precise; that round-trip is
   out of scope here. */
function inferKind(category: string | null): DocKind {
  return category === "bank" ? "bank_transaction" : "invoice";
}

function toDocumentRecord(doc: SourceDocumentDTO): DocumentRecord {
  const sourceLabel = doc.sourceType === "csv_upload" ? "CSV upload" : "Document upload";
  return {
    id: doc.id,
    kind: inferKind(doc.category),
    title: doc.name,
    dateLabel: `Uploaded ${fmtUploadDate(doc.uploadedAt)}`,
    dateCaption: "Uploaded",
    provenance: {
      source: sourceLabel,
      ingestedAtLabel: `Uploaded ${fmtUploadDate(doc.uploadedAt)}`,
      enum: "DOCUMENT_UPLOAD",
      ledgerRef: doc.rawId ?? doc.id,
    },
    rawId: doc.rawId ?? undefined,
  };
}

let documents: DocumentRecord[] = [];

export function allDocuments(): DocumentRecord[] {
  return documents;
}

export function getDocument(
  id: string | null | undefined,
): DocumentRecord | undefined {
  if (!id) return undefined;
  return documents.find((d) => d.id === id);
}

/* Fetch this account's live uploaded-document catalogue once per session
   (retried on the next call if it fails). Fails soft — a failed fetch just
   leaves the catalogue empty, never fabricated. Mirrors rulesStore's
   hydrateUserRules. */
let hydrated = false;
export async function hydrateDocuments(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const res = await apiRequest("GET", "/api/integrations/documents");
    const rows: SourceDocumentDTO[] = await res.json();
    documents = rows.map(toDocumentRecord);
  } catch (err) {
    hydrated = false; // allow a retry on the next mount
    console.warn("[documentsStore] failed to hydrate documents", err);
  }
}
