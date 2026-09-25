import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as schema from "./schema.js";

export type Db = NodePgDatabase<typeof schema>;

export function createDb(databaseUrl: string): { db: Db; pool: pg.Pool } {
  const host = new URL(databaseUrl).hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export async function runMigrations(db: Db): Promise<void> {
  const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  await migrate(db, { migrationsFolder: path.join(pkgDir, "drizzle") });
}
