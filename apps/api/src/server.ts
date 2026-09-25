import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import {
  paymentMiddleware,
  x402ResourceServer,
} from "@okxweb3/x402-express";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";
import { OKXFacilitatorClient } from "@okxweb3/x402-core";
import {
  buildCatalog,
  CHAIN_ID,
  CHECK_INPUT_FIELDS,
  getMultiplier,
  getOkxTicker,
  getStockPrice,
  getXLayerPrice,
  INPUT_REQUIRED,
  isNyseOpen,
  OkxClient,
  PRICE_USD,
  quote as dexQuote,
  readTokenMeta,
  runCheck,
  XSTOCKS,
  validateCheckRequest,
  type CheckDeps,
  type CheckRequest,
} from "@kwyh/core";
import { log } from "./log.js";
import type { PaymentScanState } from "./payments.js";

export interface FakeFacilitator {
  getSupported(): Promise<unknown>;
  verify(): Promise<unknown>;
  settle(): Promise<unknown>;
}

export function challengeOnlyFacilitator(network: string): FakeFacilitator {
  return {
    async getSupported() {
      return {
        kinds: [
          {
            x402Version: 2,
            scheme: "exact",
            network: network as `${string}:${string}`,
          },
        ],
        extensions: [],
        signers: {},
      };
    },
    async verify() {
      throw new Error("payments not configured");
    },
    async settle() {
      throw new Error("payments not configured");
    },
  };
}

export interface AppDeps {
  env: {
    NETWORK: string;
    PAY_TO: string;
    PUBLIC_API_BASE_URL: string;
    WEB_ORIGIN: string;
  };
  checkDeps: CheckDeps;
  facilitator?: { apiKey: string; secretKey: string; passphrase: string } | FakeFacilitator;
  syncFacilitatorOnStart?: boolean;
  okxConfigured?: boolean;
  payments?: () => PaymentScanState;
}

const startedAt = Date.now();

interface StatusCache {
  at: number;
  body: unknown;
}
let statusCache: StatusCache | null = null;
const STATUS_TTL_MS = 30_000;


export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json());
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("access-control-allow-origin", deps.env.WEB_ORIGIN);
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type, payment-signature, x-payment");
    res.setHeader("access-control-expose-headers", "PAYMENT-REQUIRED, PAYMENT-RESPONSE");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use((req: Request, _res: Response, next: NextFunction) => {
    log("info", "request", { method: req.method, path: req.path });
    next();
  });

  app.get("/health", (_req, res) => {
    const market = isNyseOpen(new Date());
    res.json({
      status: "ok",
      chainId: CHAIN_ID,
      network: deps.env.NETWORK,
      payTo: deps.env.PAY_TO,
      okxConfigured: deps.okxConfigured ?? false,
      marketOpen: market.open,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
    });
  });

  app.get("/catalog", (_req, res) => {
    res.json(buildCatalog(deps.env.PUBLIC_API_BASE_URL, deps.env.NETWORK));
  });

  app.get("/status", async (_req, res) => {
    if (statusCache && Date.now() - statusCache.at < STATUS_TTL_MS) {
      res.json(statusCache.body);
      return;
    }
    const now = new Date();
    const market = isNyseOpen(now);
    const tokens = await Promise.all(
      XSTOCKS.map(async (t) => {
        const [stock, ticker, mult] = await Promise.allSettled([
          deps.checkDeps.stockPrice(t.redstoneId),
          deps.checkDeps.okxTicker(t.okxInstId),
          deps.checkDeps.multiplier(t.wrapper),
        ]);
        return {
          ticker: t.ticker,
          realStock: stock.status === "fulfilled" ? stock.value.price : null,
          stockPriceAsOf:
            stock.status === "fulfilled"
              ? new Date(stock.value.asOf).toISOString()
              : null,
          okxExchange: ticker.status === "fulfilled" ? ticker.value.last : null,
          okxTs:
            ticker.status === "fulfilled"
              ? new Date(ticker.value.ts).toISOString()
              : null,
          multiplier: mult.status === "fulfilled" ? mult.value : null,
        };
      }),
    );
    const body = {
      marketOpen: market.open,
      marketReason: market.reason,
      nextChange: market.nextChange,
      tokens,
      updatedAt: now.toISOString(),
    };
    statusCache = { at: Date.now(), body };
    res.json(body);
  });

  app.get("/payments/recent", (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 20) || 20, 50);
    const snap = deps.payments?.() ?? {
      warming: false,
      scannedFrom: null,
      lastScanned: null,
      payments: [],
    };
    const dayAgo = Date.now() - 86_400_000;
    const recent = snap.payments.filter((p) => p.timestamp >= dayAgo);
    res.json({
      payTo: deps.env.PAY_TO,
      count24h: recent.length,
      totalUsd24h:
        Math.round(recent.reduce((s, p) => s + p.amountUsd, 0) * 100) / 100,
      warming: snap.warming,
      scannedFrom: snap.scannedFrom,
      lastScanned: snap.lastScanned,
      payments: snap.payments.slice(0, limit),
    });
  });

  // --- POST /check: validate -> pay -> run ---

  // Stage 1: schema validation BEFORE payment so unpaid callers get a useful 400.
  app.post("/check", (req: Request, res: Response, next: NextFunction) => {
    const b = req.body as Record<string, unknown> | undefined;
    const missing = CHECK_INPUT_FIELDS.filter((f) => b?.[f] === undefined);
    if (missing.length > 0) {
      res.status(400).json({
        ...INPUT_REQUIRED,
        missing,
      });
      return;
    }
    const parsed = validateCheckRequest(b);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    next();
  });

  // Stage 2: payment middleware for the paid route only.
  {
    const usingRealFacilitator = Boolean(
      deps.facilitator && "apiKey" in deps.facilitator,
    );
    const facilitator = usingRealFacilitator
      ? new OKXFacilitatorClient({
          ...(deps.facilitator as {
            apiKey: string;
            secretKey: string;
            passphrase: string;
          }),
          syncSettle: true,
        })
      : ((deps.facilitator as FakeFacilitator | undefined) ??
        challengeOnlyFacilitator(deps.env.NETWORK));
    const server = new x402ResourceServer(
      facilitator as unknown as ConstructorParameters<typeof x402ResourceServer>[0],
    ).register(deps.env.NETWORK as `${string}:${string}`, new ExactEvmScheme());
    server.onAfterSettle(async (ctx) => {
      const r = ctx.result as {
        transaction?: string;
        payer?: string;
        amount?: string;
      };
      log("info", "payment settled", {
        txHash: r.transaction,
        payer: r.payer,
        amount: r.amount,
      });
    });
    if (!usingRealFacilitator) {
      log("warn", "payments cannot be verified; 402 challenges still issued", {
        job: "x402",
      });
    }
    app.use(
      paymentMiddleware(
        {
          "POST /check": {
            accepts: [
              {
                scheme: "exact",
                network: deps.env.NETWORK as `${string}:${string}`,
                payTo: deps.env.PAY_TO as `0x${string}`,
                price: `$${PRICE_USD}`,
              },
            ],
            description: "xStock pre-trade check on X Layer",
            mimeType: "application/json",
          },
        },
        server,
        undefined,
        undefined,
        deps.syncFacilitatorOnStart ?? true,
      ),
    );
  }

  // Stage 3: the handler itself.
  app.post("/check", async (req: Request, res: Response) => {
    if (!deps.okxConfigured) {
      res.status(503).json({ error: "data sources not configured" });
      return;
    }
    const parsed = validateCheckRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    try {
      const body = await runCheck(deps.checkDeps, parsed.value as CheckRequest);
      res.json(body);
    } catch (err) {
      log("error", "check failed", { err: String(err) });
      res.status(503).json({
        error: "check unavailable",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return app;
}

export interface LiveSources {
  okx: OkxClient;
  chain: import("@kwyh/core").XLayerClient;
  tokenDecimals: Map<string, number>;
}

export async function makeLiveCheckDeps(s: LiveSources): Promise<CheckDeps> {
  for (const t of XSTOCKS) {
    try {
      const meta = await readTokenMeta(s.chain, t.wrapper);
      t.decimals = meta.decimals;
      s.tokenDecimals.set(t.wrapper.toLowerCase(), meta.decimals);
      log("info", "token meta", {
        ticker: t.ticker,
        symbol: meta.symbol,
        decimals: meta.decimals,
      });
    } catch (err) {
      log("warn", "token meta read failed", {
        ticker: t.ticker,
        err: String(err),
      });
    }
  }
  return {
    stockPrice: (id) => getStockPrice(id),
    okxTicker: (inst) => getOkxTicker(inst),
    xlayerPrice: (w) => getXLayerPrice(s.okx, w),
    multiplier: (w) => getMultiplier(s.chain, w as `0x${string}`),
    tokenDecimals: async (w) => {
      const hit = s.tokenDecimals.get(w.toLowerCase());
      if (hit !== undefined) return hit;
      const meta = await readTokenMeta(s.chain, w as `0x${string}`);
      s.tokenDecimals.set(w.toLowerCase(), meta.decimals);
      return meta.decimals;
    },
    dexQuote: (opts) => dexQuote(s.okx, opts),
  };
}
