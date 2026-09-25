import { sql } from "drizzle-orm";
import {
  alerts,
  getDailySeries,
  getWhaleTransfers,
  getSnapshot,
  getCache,
  setCache,
  USDT0_ADDRESS,
  type Db,
} from "@ultrax/metrics";
import type { OkxClient, TopHoldersResult } from "./okx/client.js";

export interface Repo {
  ping(): Promise<void>;
  getDailySeries(metricId: string, days: number): Promise<unknown>;
  getWhaleTransfers(opts: {
    minUsd?: number;
    limit?: number;
  }): Promise<unknown>;
  getSnapshot(): Promise<unknown>;
  getHolderConcentration(token: string): Promise<unknown>;
  createAlert(input: {
    webhookUrl: string;
    minUsd: number;
    expiresAt: Date;
  }): Promise<{ id: string; webhookUrl: string; minUsd: number; expiresAt: string }>;
}

export function createRepo(db: Db, okx: OkxClient): Repo {
  return {
    async ping() {
      await db.execute(sql`select 1`);
    },
    getDailySeries: (metricId, days) => getDailySeries(db, metricId, days),
    getWhaleTransfers: (opts) => getWhaleTransfers(db, opts),
    getSnapshot: () => getSnapshot(db),
    async getHolderConcentration(token: string) {
      const cacheKey = `holder-concentration:${token.toLowerCase()}`;
      const cached = await getCache(db, cacheKey);
      if (cached) return cached;
      const result: TopHoldersResult = await okx.topHolders(token);
      const payload = {
        metric: "holder-concentration",
        chain: "xlayer",
        chainId: 196,
        token: result.token,
        top10Pct: result.top10Pct,
        top50Pct: result.top50Pct,
        top100Pct: result.top100Pct,
        top20Pct: result.top20Pct,
        holders: result.holders,
        source: result.source,
        updatedAt: new Date().toISOString(),
      };
      await setCache(db, cacheKey, payload, 3600);
      if (token.toLowerCase() === USDT0_ADDRESS) {
        await setCache(db, "holder-concentration:usdt0", payload, 3600);
      }
      return payload;
    },
    async createAlert(input) {
      const rows = await db
        .insert(alerts)
        .values({
          webhookUrl: input.webhookUrl,
          minUsd: String(input.minUsd),
          expiresAt: input.expiresAt,
        })
        .returning();
      const r = rows[0]!;
      return {
        id: r.id,
        webhookUrl: r.webhookUrl,
        minUsd: Number(r.minUsd),
        expiresAt: r.expiresAt.toISOString(),
      };
    },
  };
}
