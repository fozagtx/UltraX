import { loadEnv } from "./env.js";
import { createApp, makeLiveCheckDeps } from "./server.js";
import { createPaymentScanner } from "./payments.js";
import { makeXLayerClient, OkxClient } from "./core/index.js";
import { log } from "./log.js";

async function main() {
  const env = loadEnv();
  const rpcUrls = [env.XLAYER_RPC_URL, env.XLAYER_RPC_URL_BACKUP].filter(Boolean);
  const chain = makeXLayerClient(rpcUrls);
  const okx = new OkxClient({
    apiKey: env.OKX_API_KEY,
    secretKey: env.OKX_SECRET_KEY,
    passphrase: env.OKX_PASSPHRASE,
    baseUrl: env.OKX_BASE_URL,
  });

  const checkDeps = await makeLiveCheckDeps({
    okx,
    chain,
    tokenDecimals: new Map(),
  });

  const app = createApp({
    env,
    checkDeps,
    okxConfigured: env.okxConfigured,
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
    log("info", `kwyh-api listening on :${env.PORT}`, {
      okxConfigured: env.okxConfigured,
    });
  });
}

main().catch((err) => {
  log("error", "fatal", { err: String(err) });
  process.exit(1);
});
