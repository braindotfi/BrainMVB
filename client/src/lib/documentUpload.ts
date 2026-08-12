/** File types shown and accepted by the document upload surfaces. */
export const DOCUMENT_ACCEPT =
  ".pdf,.csv,.xls,.xlsx,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp";

const SUPPORTED_DOCUMENT_EXTENSIONS = new Set([
  ".pdf",
  ".csv",
  ".xls",
  ".xlsx",
  ".doc",
  ".docx",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
]);

export const DOCUMENT_FORMAT_LABEL = "PDF, CSV, XLSX, DOCX, etc.";

export function isSupportedDocumentFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const extension = name.slice(name.lastIndexOf("."));
  return SUPPORTED_DOCUMENT_EXTENSIONS.has(extension);
}

export function sourceTypeForDocument(file: File): "pdf_upload" | "csv_upload" {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".xls") || name.endsWith(".xlsx")) {
    return "csv_upload";
  }
  return "pdf_upload";
}