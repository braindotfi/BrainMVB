/* ── Shared wire shapes for BrainMVB's three LOCAL source surfaces ─────────────
   These are the records BrainMVB itself owns: Plaid bank connections, tool
   connections, and uploaded documents. brain-core's own connector registry is a
   fourth, disjoint population parsed in lib/brainSources.ts.

   They live here rather than beside any one screen because Settings → Sources and
   the connect screens both render them, and a second definition of these shapes is
   exactly how the two surfaces would drift apart. */

export type BankAccountInfo = {
  accountId: string;
  name: string;
  mask: string | null;
  subtype: string | null;
  type: string | null;
};

export type BankConnectionInfo = {
  itemId: string;
  institutionId: string | null;
  institutionName: string;
  accounts: BankAccountInfo[];
  /** When the user linked this institution. NOT a sync time - see lib/sourceRows.ts. */
  connectedAt: string;
};

export type ToolConnection = {
  userId: string;
  toolId: string;
  status: "connected" | "error";
  accountLabel?: string;
  /** When the tool was connected. NOT a sync time - see lib/sourceRows.ts. */
  connectedAt: string;
};

export type ExtractStatus =
  | "pending" | "ingested" | "extracting" | "extracted"
  | "failed" | "unsupported" | "unavailable" | null;

export type SourceDocument = {
  id: string;
  userId: string;
  name: string;
  size: number;
  mimeType: string | null;
  category: string | null;
  rawId: string | null;
  sha256: string | null;
  sourceType: string | null;
  extractStatus: ExtractStatus;
  projectionStatus: string | null;
  parsedId: string | null;
  confidence: string | null;
  uploadedAt: string;
};
