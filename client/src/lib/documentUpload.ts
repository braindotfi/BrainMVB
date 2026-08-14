import type { CategoryId } from "@/lib/sourceCategories";

/** File types shown and accepted by the document upload surfaces. */
export const DOCUMENT_ACCEPT =
  ".pdf,.csv,.xls,.xlsx,.txt,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp";

const SUPPORTED_DOCUMENT_EXTENSIONS = new Set([
  ".pdf",
  ".csv",
  ".xls",
  ".xlsx",
  ".txt",
  ".doc",
  ".docx",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
]);

export const DOCUMENT_FORMAT_LABEL = "PDF, CSV, XLSX, TXT, DOCX, etc.";

export function isSupportedDocumentFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const extension = name.slice(name.lastIndexOf("."));
  return SUPPORTED_DOCUMENT_EXTENSIONS.has(extension);
}

export function sourceTypeForDocument(
  file: File,
): "pdf_upload" | "csv_upload" | "xlsx_upload" | "txt_upload" {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return "csv_upload";
  if (name.endsWith(".xls") || name.endsWith(".xlsx")) return "xlsx_upload";
  if (name.endsWith(".txt")) return "txt_upload";
  return "pdf_upload";
}

/* ── Declared CSV/XLSX document types ──────────────────────────────────────────
   brain-core's structured spreadsheet interpreter only auto-detects two shapes
   (AR aging, payroll register) by scanning header keywords. Everything else --
   including a plain AP invoice ledger -- fails closed unless the caller declares
   an `object_type` brain-core recognizes (services/raw/src/interpreters/upload.ts,
   customerAssertedCsvOutput). That path requires an EXACT match on the normalized
   header names below -- no fuzzy aliasing -- so the template CSV matters as much
   as the declared type itself: it's the fastest way to get a working upload
   without hand-guessing brain-core's schema. */

export type DocumentObjectType =
  | "payables_invoices"
  | "receivables_invoices"
  | "payroll_runs"
  | "tax_obligations"
  | "counterparties"
  | "bank_transactions";

export interface DocumentObjectTypeSpec {
  id: DocumentObjectType;
  label: string;
  /** Normalized header names brain-core requires, verbatim (customerAssertedCsvOutput). */
  requiredHeaders: readonly string[];
  /** A minimal, valid CSV: header row + one example row, matching requiredHeaders exactly. */
  templateCsv: string;
}

function csvTemplate(headers: readonly string[], exampleRow: readonly string[]): string {
  return `${headers.join(",")}\n${exampleRow.join(",")}\n`;
}

export const DOCUMENT_OBJECT_TYPES: readonly DocumentObjectTypeSpec[] = [
  {
    id: "payables_invoices",
    label: "AP invoices",
    requiredHeaders: ["invoice_id", "counterparty_id", "amount", "currency", "issued_date", "due_date", "status"],
    templateCsv: csvTemplate(
      ["invoice_id", "counterparty_id", "amount", "currency", "issued_date", "due_date", "status"],
      ["inv_0001", "cp_acme_legal", "4820.00", "USD", "2026-07-01", "2026-07-31", "open"],
    ),
  },
  {
    id: "receivables_invoices",
    label: "AR invoices",
    requiredHeaders: ["invoice_id", "counterparty_id", "amount", "currency", "issued_date", "due_date", "status"],
    templateCsv: csvTemplate(
      ["invoice_id", "counterparty_id", "amount", "currency", "issued_date", "due_date", "status"],
      ["inv_0001", "cp_meridian_retail", "12400.00", "USD", "2026-07-01", "2026-07-31", "open"],
    ),
  },
  {
    id: "payroll_runs",
    label: "Payroll register",
    requiredHeaders: ["run_id", "gross_amount", "currency", "status"],
    templateCsv: csvTemplate(
      ["run_id", "gross_amount", "currency", "status"],
      ["run_2026_07a", "24500.00", "USD", "paid"],
    ),
  },
  {
    id: "tax_obligations",
    label: "Tax obligations",
    requiredHeaders: ["obligation_id", "counterparty_id", "amount", "currency", "due_date", "status"],
    templateCsv: csvTemplate(
      ["obligation_id", "counterparty_id", "amount", "currency", "due_date", "status"],
      ["obl_0001", "cp_state_franchise_board", "3200.00", "USD", "2026-08-15", "open"],
    ),
  },
  {
    id: "counterparties",
    label: "Counterparties",
    requiredHeaders: ["counterparty_id", "name", "type"],
    templateCsv: csvTemplate(
      ["counterparty_id", "name", "type"],
      ["cp_acme_legal", "Acme Legal Partners LLP", "vendor"],
    ),
  },
  {
    id: "bank_transactions",
    label: "Bank transactions",
    requiredHeaders: ["transaction_id", "account_id", "date", "description", "amount", "direction", "currency"],
    templateCsv: csvTemplate(
      ["transaction_id", "account_id", "date", "description", "amount", "direction", "currency"],
      ["txn_0001", "acct_operations", "2026-07-01", "Wire to Acme Legal", "4820.00", "outflow", "USD"],
    ),
  },
];

export function documentObjectTypeSpec(id: string | null | undefined): DocumentObjectTypeSpec | null {
  return DOCUMENT_OBJECT_TYPES.find((t) => t.id === id) ?? null;
}

/**
 * A reasonable pre-selected declared type for a CSV/XLSX upload, based on the
 * Category the user already picked in the upload flow. Purely a UX default --
 * the user can change or clear it. Categories with no obvious CSV shape (bank,
 * crypto, payments, documents) default to no selection, i.e. today's AR/payroll
 * auto-detect behavior.
 */
export function defaultObjectTypeForCategory(category: CategoryId): DocumentObjectType | null {
  switch (category) {
    case "payroll":
      return "payroll_runs";
    case "tax":
      return "tax_obligations";
    case "accounting":
      return "payables_invoices";
    default:
      return null;
  }
}