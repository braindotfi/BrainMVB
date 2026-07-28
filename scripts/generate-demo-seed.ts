/**
 * Writes the demo seed documents to server/assets/demo-seed/ so you can open them and
 * check how they look. Run with: npx tsx scripts/generate-demo-seed.ts [YYYY-MM-DD]
 *
 * THIS IS A DEBUGGING AID, NOT A BUILD STEP. Nothing reads these files at runtime any
 * more - server/brain/seed.ts generates the bytes in memory at seed time so the dates
 * are relative to when each tenant is created. The output directory is gitignored;
 * committing a snapshot of it would just re-create the staleness this replaced.
 *
 * Pass a date to see what a tenant seeded on that day would get:
 *   npx tsx scripts/generate-demo-seed.ts 2027-02-03
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildScenario } from "../server/brain/demo-seed/scenario";
import { renderSeedDocuments } from "../server/brain/demo-seed/documents";

const OUT = join(process.cwd(), "server", "assets", "demo-seed");

const arg = process.argv[2];
if (arg && !/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
  console.error(`Expected a YYYY-MM-DD date, got "${arg}"`);
  process.exit(1);
}
const now = arg ? new Date(`${arg}T00:00:00Z`) : new Date();
if (Number.isNaN(now.getTime())) {
  console.error(`"${arg}" is not a real date`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

const scenario = buildScenario(now);
const documents = await renderSeedDocuments(scenario);

for (const doc of documents) {
  writeFileSync(join(OUT, doc.filename), doc.bytes);
  console.log(`wrote ${join(OUT, doc.filename)} (${doc.bytes.length} bytes)`);
}

console.log("");
console.log(`period            ${scenario.periodStart} to ${scenario.periodEnd}`);
console.log(`opening balance   ${scenario.openingBalance.toFixed(2)}`);
console.log(`closing balance   ${scenario.closingBalance.toFixed(2)}`);
console.log(`transactions      ${scenario.transactions.length}`);
console.log(`payroll net/run   ${scenario.payrollNetPerRun.toFixed(2)}`);
console.log(`AR outstanding    ${scenario.invoices.reduce((a, i) => a + i.amount, 0).toFixed(2)}`);
console.log(`tax year          FY${scenario.tax.fiscalYear} (filed ${scenario.tax.filedOn})`);
