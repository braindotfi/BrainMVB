import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (error) => {
  // An idle PostgreSQL client can be terminated during a managed database
  // restart. `pg` removes that client from the pool, but the pool itself must
  // have an error listener or Node treats the event as an unhandled error and
  // terminates the web server.
  console.error("[db] PostgreSQL pool client error:", error);
});

export const db = drizzle(pool, { schema });
