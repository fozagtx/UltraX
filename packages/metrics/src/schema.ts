import {
  pgTable,
  date,
  bigint,
  numeric,
  text,
  timestamp,
  integer,
  jsonb,
  uuid,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const dailyStats = pgTable("daily_stats", {
  date: date("date").primaryKey(),
  newAddresses: bigint("new_addresses", { mode: "bigint" }),
  txCount: bigint("tx_count", { mode: "bigint" }),
  contractCalls: bigint("contract_calls", { mode: "bigint" }),
  feeOkb: numeric("fee_okb", { precision: 38, scale: 18 }),
  feeUsd: numeric("fee_usd", { precision: 38, scale: 6 }),
  utilization: numeric("utilization", { precision: 10, scale: 6 }),
  source: text("source"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const transfers = pgTable(
  "transfers",
  {
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    fromAddr: text("from_addr").notNull(),
    toAddr: text("to_addr").notNull(),
    amount: numeric("amount", { precision: 38, scale: 6 }).notNull(),
    token: text("token").notNull().default("USDT0"),
  },
  (t) => [
    primaryKey({ columns: [t.txHash, t.logIndex] }),
    index("transfers_ts_idx").on(t.ts),
    index("transfers_amount_idx").on(t.amount),
  ],
);

export const dailyStablecoin = pgTable("daily_stablecoin", {
  date: date("date").primaryKey(),
  volumeUsd: numeric("volume_usd", { precision: 38, scale: 6 }),
  mintUsd: numeric("mint_usd", { precision: 38, scale: 6 }),
  burnUsd: numeric("burn_usd", { precision: 38, scale: 6 }),
  netflowUsd: numeric("netflow_usd", { precision: 38, scale: 6 }),
  transferCount: integer("transfer_count"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const cache = pgTable("cache", {
  key: text("key").primaryKey(),
  json: jsonb("json"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const alerts = pgTable("alerts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  webhookUrl: text("webhook_url").notNull(),
  minUsd: numeric("min_usd", { precision: 38, scale: 6 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  lastDeliveredAt: timestamp("last_delivered_at", { withTimezone: true }),
  failures: integer("failures").notNull().default(0),
});

export const alertDeliveries = pgTable(
  "alert_deliveries",
  {
    alertId: uuid("alert_id").notNull(),
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }).defaultNow(),
    statusCode: integer("status_code"),
  },
  (t) => [primaryKey({ columns: [t.alertId, t.txHash, t.logIndex] })],
);

export const collectorState = pgTable("collector_state", {
  key: text("key").primaryKey(),
  value: jsonb("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
