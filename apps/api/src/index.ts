import { createDb, runMigrations } from "@ultrax/metrics";
import { loadEnv } from "./env.js";
import { createRepo } from "./repo.js";
import { createApp } from "./server.js";
import { OkxClient } from "./okx/client.js";
import { startCollector, type CollectorHandle } from "./collector/index.js";
import { log } from "./log.js";

async function main() {
  const env = loadEnv();
  const { db, pool } = createDb(env.DATABASE_URL);
  await runMigrations(db);
  log("info", "migrations applied");

  const okx = new OkxClient({
    apiKey: env.OKX_API_KEY,
    secretKey: env.OKX_SECRET_KEY,
    passphrase: env.OKX_PASSPHRASE,
    baseUrl: env.OKX_BASE_URL,
  });
  const repo = createRepo(db, okx);

  let collector: CollectorHandle | null = null;
  const app = createApp({
    repo,
    env,
    facilitator:
      env.okxConfigured
        ? {
            apiKey: env.OKX_API_KEY!,
            secretKey: env.OKX_SECRET_KEY!,
            passphrase: env.OKX_PASSPHRASE!,
          }
        : undefined,
    syncFacilitatorOnStart: true,
    lastCollectorRun: () => collector?.lastRunAt() ?? null,
  });

  const server = app.listen(env.PORT, () => {
    log("info", `ultrax-api listening on :${env.PORT}`);
  });

  if (env.COLLECTOR_ENABLED) {
    setImmediate(() => {
      collector = startCollector({
        env,
        db,
        okx,
        rpcUrls: [env.XLAYER_RPC_URL, env.XLAYER_RPC_URL_BACKUP],
      });
    });
  }

  const shutdown = () => {
    log("info", "shutting down");
    collector?.stop();
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  log("error", "fatal startup error", { err: String(err) });
  process.exit(1);
});
