import { loadEnv } from "./env.js";
import { createApp } from "./server.js";
import { createPaymentScanner } from "./payments.js";
import { OkxClient } from "./okx/client.js";
import { UniverseService } from "./intel/universe.js";
import { log } from "./log.js";

async function main() {
  const env = loadEnv();
  const rpcUrls = [env.XLAYER_RPC_URL, env.XLAYER_RPC_URL_BACKUP].filter(Boolean);
  const universe = new UniverseService(
    new OkxClient(env.OKX_REST_BASE),
  );

  const app = createApp({
    env,
    universe,
    facilitator: env.okxConfigured
      ? {
          apiKey: env.OKX_API_KEY!,
          secretKey: env.OKX_SECRET_KEY!,
          passphrase: env.OKX_PASSPHRASE!,
        }
      : undefined,
    payments: (() => {
      // extra public endpoints give the scan more rate budget
      const scanner = createPaymentScanner({
        rpcUrls: [
          ...rpcUrls,
          "https://196.rpc.thirdweb.com",
          "https://xlayer.drpc.org",
        ],
        payTo: env.PAY_TO,
      });
      scanner.start();
      return () => scanner.state;
    })(),
  });

  app.listen(env.PORT, () => {
    log("info", `listening on :${env.PORT}`, {
      paymentsConfigured: env.okxConfigured,
    });
  });
  const refresh = () => {
    universe.refresh().catch((error) =>
      log("error", "universe refresh failed", { err: String(error) }),
    );
  };
  refresh();
  setInterval(refresh, 60_000);
}

main().catch((err) => {
  log("error", "fatal", { err: String(err) });
  process.exit(1);
});
