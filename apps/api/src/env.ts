import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PAY_TO_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "PAY_TO_ADDRESS must be a 0x address"),
  NETWORK: z.string().default("eip155:196"),
  XLAYER_RPC_URL: z.string().default("https://rpc.xlayer.tech"),
  XLAYER_RPC_URL_BACKUP: z.string().default("https://xlayerrpc.okx.com"),
  PORT: z.coerce.number().int().default(8080),
  PUBLIC_API_BASE_URL: z.string().default("http://localhost:8080"),
  COLLECTOR_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  OKX_BASE_URL: z.string().default("https://web3.okx.com"),
  BACKFILL_DAYS: z.coerce.number().int().min(1).default(30),
  OKX_API_KEY: z.string().optional(),
  OKX_SECRET_KEY: z.string().optional(),
  OKX_PASSPHRASE: z.string().optional(),
});

export type Env = z.infer<typeof envSchema> & { okxConfigured: boolean };

export function loadEnv(): Env {
  const parsed = envSchema.parse(process.env);
  const okxConfigured = Boolean(
    parsed.OKX_API_KEY && parsed.OKX_SECRET_KEY && parsed.OKX_PASSPHRASE,
  );
  return { ...parsed, okxConfigured };
}
