import { and, eq } from "drizzle-orm";
import { db } from "../server/db";
import { bankConnections } from "../shared/schema";
import { encryptPlaidAccessToken, isEncryptedPlaidToken } from "../server/tokenCrypto";

async function main(): Promise<void> {
  const rows = await db.select().from(bankConnections);
  let migrated = 0;

  for (const row of rows) {
    if (isEncryptedPlaidToken(row.accessToken)) continue;
    await db
      .update(bankConnections)
      .set({ accessToken: encryptPlaidAccessToken(row.accessToken) })
      .where(and(
        eq(bankConnections.userId, row.userId),
        eq(bankConnections.itemId, row.itemId),
      ));
    migrated++;
  }

  console.log(`Plaid token encryption backfill migrated ${migrated} row${migrated === 1 ? "" : "s"}.`);
}

main().catch((err) => {
  console.error("Plaid token encryption backfill failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
