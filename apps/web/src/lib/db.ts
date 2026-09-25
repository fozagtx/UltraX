import { createDb, type Db } from "@ultrax/metrics";
import type pg from "pg";

const g = globalThis as unknown as { __ultraxDb?: { db: Db; pool: pg.Pool } };

export function getDb(): Db {
  if (!g.__ultraxDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    g.__ultraxDb = createDb(url);
  }
  return g.__ultraxDb.db;
}
