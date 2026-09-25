import { z } from "zod";

const envSchema = z.object({
  PAY_TO: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "PAY_TO must be a 0x address"),
  NETWORK: z.string().default("eip155:196"),
  XLAYER_RPC_URL: z.string().default("https://rpc.xlayer.tech"),
  XLAYER_RPC_URL_BACKUP: z.string().default("https://xlayerrpc.okx.com"),
  PORT: z.coerce.number().int().default(8080),
  PUBLIC_API_BASE_URL: z.string().default("http://localhost:8080"),
  WEB_ORIGIN: z.string().default("*"),
  OKX_REST_BASE: z.string().default("https://www.okx.com"),
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
