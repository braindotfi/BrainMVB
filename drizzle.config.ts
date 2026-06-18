import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // `user_sessions` is created at runtime by connect-pg-simple (createTableIfMissing),
  // not in the Drizzle schema. Exclude it so `db:push` never tries to drop it.
  tablesFilter: ["!user_sessions"],
});
