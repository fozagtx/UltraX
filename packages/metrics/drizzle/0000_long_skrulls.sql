CREATE TABLE "alert_deliveries" (
	"alert_id" uuid NOT NULL,
	"tx_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"delivered_at" timestamp with time zone DEFAULT now(),
	"status_code" integer,
	CONSTRAINT "alert_deliveries_alert_id_tx_hash_log_index_pk" PRIMARY KEY("alert_id","tx_hash","log_index")
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_url" text NOT NULL,
	"min_usd" numeric(38, 6) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"last_delivered_at" timestamp with time zone,
	"failures" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cache" (
	"key" text PRIMARY KEY NOT NULL,
	"json" jsonb,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "collector_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "daily_stablecoin" (
	"date" date PRIMARY KEY NOT NULL,
	"volume_usd" numeric(38, 6),
	"mint_usd" numeric(38, 6),
	"burn_usd" numeric(38, 6),
	"netflow_usd" numeric(38, 6),
	"transfer_count" integer,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "daily_stats" (
	"date" date PRIMARY KEY NOT NULL,
	"new_addresses" bigint,
	"tx_count" bigint,
	"contract_calls" bigint,
	"fee_okb" numeric(38, 18),
	"fee_usd" numeric(38, 6),
	"utilization" numeric(10, 6),
	"source" text,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"tx_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"block_number" bigint NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"from_addr" text NOT NULL,
	"to_addr" text NOT NULL,
	"amount" numeric(38, 6) NOT NULL,
	"token" text DEFAULT 'USDT0' NOT NULL,
	CONSTRAINT "transfers_tx_hash_log_index_pk" PRIMARY KEY("tx_hash","log_index")
);
--> statement-breakpoint
CREATE INDEX "transfers_ts_idx" ON "transfers" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "transfers_amount_idx" ON "transfers" USING btree ("amount");