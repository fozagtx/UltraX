import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  paymentMiddleware,
  x402ResourceServer,
} from "@okxweb3/x402-express";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";
import { OKXFacilitatorClient } from "@okxweb3/x402-core";
import { buildCatalog } from "./catalog.js";
import { CHAIN_ID, PRICE_USD } from "./config.js";
import {
  buildPreIpo,
  buildPreview,
  buildRunners,
  buildSignal,
  buildUniverse,
} from "./intel/builders.js";
import {
  validatePreIpoInput,
  validateRunnersInput,
  validateSignalInput,
} from "./intel/input.js";
import type { UniverseProvider } from "./intel/types.js";
import { isNyseOpen } from "./core/rules/marketHours.js";
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
  universe: UniverseProvider;
  facilitator?: { apiKey: string; secretKey: string; passphrase: string } | FakeFacilitator;
  syncFacilitatorOnStart?: boolean;
  payments?: () => PaymentScanState;
}

const startedAt = Date.now();

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json());
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("access-control-allow-origin", deps.env.WEB_ORIGIN);
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    res.setHeader(
      "access-control-allow-headers",
      "content-type, payment-signature, x-payment",
    );
    res.setHeader(
      "access-control-expose-headers",
      "PAYMENT-REQUIRED, PAYMENT-RESPONSE",
    );
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
    const universe = deps.universe.status?.() ?? {
      ready: deps.universe.snapshot() !== null,
      perps: 0,
      spots: 0,
      preIpo: 0,
      candlesRefreshedAt: null,
      tickersRefreshedAt: null,
    };
    res.json({
      status: "ok",
      service: "UltraX",
      network: deps.env.NETWORK,
      payTo: deps.env.PAY_TO,
      paymentsConfigured: Boolean(
        deps.facilitator && "apiKey" in deps.facilitator,
      ),
      universe,
      usMarketOpen: market.open,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
    });
  });

  app.get("/catalog", (_req, res) => {
    res.json(
      buildCatalog(
        deps.env.PUBLIC_API_BASE_URL,
        deps.env.NETWORK,
        deps.env.PAY_TO,
      ),
    );
  });

  app.get("/universe", (_req, res) => {
    const snapshot = deps.universe.snapshot();
    if (!snapshot) {
      res.status(503).json({ error: "universe warming up" });
      return;
    }
    res.json(buildUniverse(snapshot));
  });

  app.get("/preview", async (_req, res) => {
    const snapshot = deps.universe.snapshot();
    if (!snapshot) {
      res.status(503).json({ error: "universe warming up" });
      return;
    }
    res.json(await buildPreview(snapshot));
  });

  app.get("/payments/recent", (req, res) => {
    const requestedLimit = Number(req.query.limit ?? 20);
    const limit = Math.min(
      Number.isFinite(requestedLimit) ? Math.max(1, requestedLimit) : 20,
      50,
    );
    const snap = deps.payments?.() ?? {
      warming: false,
      scannedFrom: null,
      lastScanned: null,
      payments: [],
    };
    const recent = snap.payments.filter(
      (payment) => payment.timestamp >= Date.now() - 86_400_000,
    );
    res.json({
      payTo: deps.env.PAY_TO,
      count24h: recent.length,
      totalUsd24h:
        Math.round(
          recent.reduce((sum, payment) => sum + payment.amountUsd, 0) * 100,
        ) / 100,
      warming: snap.warming,
      scannedFrom: snap.scannedFrom,
      lastScanned: snap.lastScanned,
      payments: snap.payments.slice(0, limit),
    });
  });

  const respondValidation = (
    res: Response,
    validation:
      | { ok: true }
      | { ok: false; error: string }
      | { ok: false; missing: string[]; required: unknown },
  ) => {
    if (validation.ok) return false;
    if ("missing" in validation) {
      res.status(400).json({
        status: "input_required",
        missing: validation.missing,
        required: validation.required,
      });
      return true;
    }
    const hint = validation.error.includes("symbol")
      ? { hint: "GET /universe" }
      : {};
    res.status(400).json({ error: validation.error, ...hint });
    return true;
  };

  app.post("/runners", (req, res, next) => {
    const validation = validateRunnersInput(req.body);
    if (respondValidation(res, validation)) return;
    if (!deps.universe.snapshot()) {
      res.status(503).json({ error: "universe warming up" });
      return;
    }
    next();
  });
  app.post("/signal", (req, res, next) => {
    const snapshot = deps.universe.snapshot();
    const validation = validateSignalInput(req.body, snapshot ?? undefined);
    if (respondValidation(res, validation)) return;
    if (!snapshot) {
      res.status(503).json({ error: "universe warming up" });
      return;
    }
    next();
  });
  app.post("/preipo", (req, res, next) => {
    const snapshot = deps.universe.snapshot();
    const validation = validatePreIpoInput(req.body, snapshot ?? undefined);
    if (respondValidation(res, validation)) return;
    if (!snapshot) {
      res.status(503).json({ error: "universe warming up" });
      return;
    }
    next();
  });

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
  const paymentServer = new x402ResourceServer(
    facilitator as unknown as ConstructorParameters<typeof x402ResourceServer>[0],
  ).register(
    deps.env.NETWORK as `${string}:${string}`,
    new ExactEvmScheme(),
  );
  paymentServer.onAfterSettle(async (ctx) => {
    const result = ctx.result as {
      transaction?: string;
      payer?: string;
      amount?: string;
    };
    log("info", "payment settled", {
      txHash: result.transaction,
      payer: result.payer,
      amount: result.amount,
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
        "POST /runners": {
          accepts: [
            {
              scheme: "exact",
              network: deps.env.NETWORK as `${string}:${string}`,
              payTo: deps.env.PAY_TO as `0x${string}`,
              price: `$${PRICE_USD.runners}`,
            },
          ],
          description: "OKX stock market runners",
          mimeType: "application/json",
        },
        "POST /signal": {
          accepts: [
            {
              scheme: "exact",
              network: deps.env.NETWORK as `${string}:${string}`,
              payTo: deps.env.PAY_TO as `0x${string}`,
              price: `$${PRICE_USD.signal}`,
            },
          ],
          description: "OKX stock predictive intelligence signal",
          mimeType: "application/json",
        },
        "POST /preipo": {
          accepts: [
            {
              scheme: "exact",
              network: deps.env.NETWORK as `${string}:${string}`,
              payTo: deps.env.PAY_TO as `0x${string}`,
              price: `$${PRICE_USD.preipo}`,
            },
          ],
          description: "OKX stock pre-IPO intelligence",
          mimeType: "application/json",
        },
      },
      paymentServer,
      undefined,
      undefined,
      deps.syncFacilitatorOnStart ?? true,
    ),
  );

  app.post("/runners", (req: Request, res: Response) => {
    const validation = validateRunnersInput(req.body);
    const snapshot = deps.universe.snapshot();
    if (!validation.ok || !snapshot) {
      res.status(503).json({ error: "universe warming up" });
      return;
    }
    res.json(buildRunners(snapshot, validation.value));
  });
  app.post("/signal", async (req: Request, res: Response) => {
    const snapshot = deps.universe.snapshot();
    if (!snapshot) {
      res.status(503).json({ error: "universe warming up" });
      return;
    }
    const validation = validateSignalInput(req.body, snapshot);
    if (!validation.ok) {
      respondValidation(res, validation);
      return;
    }
    try {
      res.json(
        await buildSignal(
          snapshot,
          validation.value.symbol,
          validation.value.period,
          (instId) => deps.universe.positioning(instId),
          deps.universe.orderBook
            ? (instId) => deps.universe.orderBook!(instId)
            : undefined,
        ),
      );
    } catch (error) {
      log("error", "signal failed", { err: String(error) });
      res.status(503).json({ error: "signal unavailable" });
    }
  });
  app.post("/preipo", async (req: Request, res: Response) => {
    const snapshot = deps.universe.snapshot();
    if (!snapshot) {
      res.status(503).json({ error: "universe warming up" });
      return;
    }
    const validation = validatePreIpoInput(req.body, snapshot);
    if (!validation.ok) {
      respondValidation(res, validation);
      return;
    }
    try {
      res.json(
        await buildPreIpo(
          snapshot,
          validation.value.symbol,
          deps.universe.orderBook
            ? (instId) => deps.universe.orderBook!(instId)
            : undefined,
        ),
      );
    } catch (error) {
      log("error", "pre-IPO request failed", { err: String(error) });
      res.status(503).json({ error: "pre-IPO data unavailable" });
    }
  });

  return app;
}
