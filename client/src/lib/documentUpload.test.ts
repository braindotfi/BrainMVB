import { describe, it, expect } from "vitest";
import { suggestObjectTypeFromFilename, suggestObjectType, type DocumentObjectType } from "./documentUpload";

/**
 * Every file that has actually failed in live testing (tax_obligations.csv,
 * receivables_invoices.csv, counterparties.csv, payroll_runs.csv) was named
 * exactly after the declared type it needed -- this pins that the filename
 * suggestion actually catches those real cases, not just synthetic ones.
 */
describe("suggestObjectTypeFromFilename", () => {
  const cases: Array<[string, DocumentObjectType]> = [
    ["tax_obligations.csv", "tax_obligations"],
    ["receivables_invoices.csv", "receivables_invoices"],
    ["counterparties.csv", "counterparties"],
    ["payroll_runs.csv", "payroll_runs"],
    ["ap-invoices-june-2026.xlsx", "payables_invoices"],
    ["bank-transactions-july.csv", "bank_transactions"],
    ["Q3_Payable_Ledger.xlsx", "payables_invoices"],
  ];

  it.each(cases)("suggests %s -> %s", (filename, expected) => {
    expect(suggestObjectTypeFromFilename(filename)).toBe(expected);
  });

  it("returns null for a filename with no recognizable shape", () => {
    expect(suggestObjectTypeFromFilename("vertex_cloud_msa.pdf")).toBeNull();
    expect(suggestObjectTypeFromFilename("compliance_test_invoices.csv")).toBeNull();
  });

  it("leaves an AR aging filename alone, even when it also mentions receivables", () => {
    // brain-core already auto-detects AR aging reports by header keyword; forcing
    // a declared type here would trade a working auto-detect for a strict header
    // check the file was never built to pass. There's no reliable way to make the
    // same call for "payroll" filenames specifically (an auto-detect-shaped
    // payroll register and a declared-type one are both just named "payroll_..."),
    // so payroll_runs is suggested as a default there regardless - the user can
    // always switch back to Auto-Detect if the guess is wrong.
    expect(suggestObjectTypeFromFilename("ar-aging-june-2026.xlsx")).toBeNull();
    expect(suggestObjectTypeFromFilename("ar_aging_receivables_report.csv")).toBeNull();
  });
});

describe("suggestObjectType", () => {
  const file = (name: string) => new File(["x"], name, { type: "text/csv" });

  it("prefers the filename suggestion over the category default", () => {
    expect(suggestObjectType(file("tax_obligations.csv"), "payroll")).toBe("tax_obligations");
  });

  it("falls back to the category default when the filename suggests nothing", () => {
    expect(suggestObjectType(file("q3_export.csv"), "payroll")).toBe("payroll_runs");
    expect(suggestObjectType(file("q3_export.csv"), "documents")).toBeNull();
  });
});
