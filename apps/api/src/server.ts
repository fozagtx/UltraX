import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import {
  paymentMiddleware,
  x402ResourceServer,
} from "@okxweb3/x402-express";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";
import { OKXFacilitatorClient } from "@okxweb3/x402-core";
import type { RouteConfig, RoutesConfig } from "@okxweb3/x402-core/server";
import {
  ALL_ENDPOINTS,
  METRIC_CATALOG,
  WHALE_ALERT_EVENT_SHAPE,
  CHAIN_ID,
  USDT0_ADDRESS,
} from "@ultrax/metrics";
import type { Repo } from "./repo.js";
import { log } from "./log.js";

export interface AppDeps {
  repo: Repo;
  env: {
    NETWORK: string;
    PAY_TO_ADDRESS: string;
    PUBLIC_API_BASE_URL: string;
    COLLECTOR_ENABLED: boolean;
  };
  facilitator?: { apiKey: string; secretKey: string; passphrase: string } | FakeFacilitator;
  syncFacilitatorOnStart?: boolean;
  paymentsDisabled?: boolean;
  lastCollectorRun?: () => string | null;
}

export interface FakeFacilitator {
  getSupported(): Promise<unknown>;
  verify(): Promise<unknown>;
  settle(): Promise<unknown>;
}

/**
 * Local facilitator that only advertises the exact/eip155:196 kind so the
 * middleware can issue 402 challenges. verify/settle always fail, so no
 * payment is ever accepted while OKX keys are absent.
 */
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

const daysSchema = z.coerce.number().int().min(1).max(30).default(7);
const whaleQuerySchema = z.object({
  minUsd: z.coerce.number().min(0).default(100000),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const holderQuerySchema = z.object({
  token: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "token must be a 0x 40-hex address"),
});
const alertBodySchema = z.object({
  webhookUrl: z.string().url().refine((u) => u.startsWith("https://"), {
    message: "webhookUrl must be https",
  }),
  minUsd: z.number().min(100000),
  days: z.number().int().min(1).max(30).default(30),
});

function buildRoutes(network: string, payTo: string): RoutesConfig {
  const net = network as `${string}:${string}`;
  const routes: Record<string, RouteConfig> = {};
  for (const m of ALL_ENDPOINTS) {
    routes[`${m.method} ${m.path}`] = {
      accepts: [
        {
          scheme: "exact",
          network: net,
          payTo,
          price: `$${m.priceUsd.toFixed(2)}`,
        },
      ],
      description: m.description,
      mimeType: "application/json",
    };
  }
  return routes;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json());
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("access-control-allow-origin", "*");
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

  app.get("/health", async (_req, res) => {
    let dbStatus: "ok" | "error" = "ok";
    try {
      await deps.repo.ping();
    } catch {
      dbStatus = "error";
    }
    res.status(dbStatus === "ok" ? 200 : 503).json({
      status: dbStatus === "ok" ? "ok" : "error",
      chainId: CHAIN_ID,
      network: deps.env.NETWORK,
      db: dbStatus,
      lastCollectorRun: deps.lastCollectorRun?.() ?? null,
      collectorEnabled: deps.env.COLLECTOR_ENABLED,
    });
  });

  app.get("/catalog", (_req, res) => {
    const base = deps.env.PUBLIC_API_BASE_URL.replace(/\/$/, "");
    res.json({
      network: deps.env.NETWORK,
      chainId: CHAIN_ID,
      payTo: deps.env.PAY_TO_ADDRESS,
      paymentScheme: "x402 exact",
      asset: `USDT0 (${USDT0_ADDRESS})`,
      whaleAlertEventShape: WHALE_ALERT_EVENT_SHAPE,
      endpoints: ALL_ENDPOINTS.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        unit: m.unit,
        priceUsd: m.priceUsd,
        method: m.method,
        url: `${base}${m.path}`,
        params: m.params,
        okxSource: m.okxSource,
        computeNote: m.computeNote,
      })),
    });
  });

  if (!deps.paymentsDisabled) {
    const usingRealFacilitator = Boolean(
      deps.facilitator && "apiKey" in deps.facilitator,
    );
    const facilitator = usingRealFacilitator
      ? new OKXFacilitatorClient(
          deps.facilitator as { apiKey: string; secretKey: string; passphrase: string },
        )
      : ((deps.facilitator as FakeFacilitator | undefined) ??
        challengeOnlyFacilitator(deps.env.NETWORK));
    const server = new x402ResourceServer(
      facilitator as unknown as ConstructorParameters<typeof x402ResourceServer>[0],
    ).register(deps.env.NETWORK as `${string}:${string}`, new ExactEvmScheme());
    const sync = deps.syncFacilitatorOnStart ?? true;
    if (!usingRealFacilitator) {
      log("warn", "payments cannot be verified; 402 challenges still issued", {
        job: "x402",
      });
    }
    app.use(
      paymentMiddleware(
        buildRoutes(deps.env.NETWORK, deps.env.PAY_TO_ADDRESS),
        server,
        undefined,
        undefined,
        sync,
      ),
    );
  }

  const badRequest = (res: Response, error: z.ZodError | string) => {
    res.status(400).json({
      error: typeof error === "string" ? error : "invalid parameters",
      details: typeof error === "string" ? undefined : error.issues,
    });
  };
  const dataError = (res: Response, err: unknown) => {
    log("error", "data-layer error", { job: "handler", err: String(err) });
    res.status(503).json({ error: "data unavailable" });
  };

  for (const m of METRIC_CATALOG) {
    if (m.id === "whale-transfers" || m.id === "holder-concentration") continue;
    app.get(m.path, async (req, res) => {
      const parsed = daysSchema.safeParse(req.query.days);
      if (!parsed.success) return badRequest(res, parsed.error);
      try {
        res.json(await deps.repo.getDailySeries(m.id, parsed.data));
      } catch (err) {
        dataError(res, err);
      }
    });
  }

  app.get("/v1/metrics/whale-transfers", async (req, res) => {
    const parsed = whaleQuerySchema.safeParse(req.query);
    if (!parsed.success) return badRequest(res, parsed.error);
    try {
      res.json(await deps.repo.getWhaleTransfers(parsed.data));
    } catch (err) {
      dataError(res, err);
    }
  });

  app.get("/v1/metrics/holder-concentration", async (req, res) => {
    const parsed = holderQuerySchema.safeParse(req.query);
    if (!parsed.success) return badRequest(res, parsed.error);
    try {
      res.json(await deps.repo.getHolderConcentration(parsed.data.token));
    } catch (err) {
      dataError(res, err);
    }
  });

  app.post("/v1/alerts/subscribe", async (req, res) => {
    const parsed = alertBodySchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    try {
      const expiresAt = new Date(
        Date.now() + parsed.data.days * 86_400_000,
      );
      const created = await deps.repo.createAlert({
        webhookUrl: parsed.data.webhookUrl,
        minUsd: parsed.data.minUsd,
        expiresAt,
      });
      res.json({ ...created, eventShape: WHALE_ALERT_EVENT_SHAPE });
    } catch (err) {
      dataError(res, err);
    }
  });

  app.get("/v1/snapshot", async (_req, res) => {
    try {
      res.json(await deps.repo.getSnapshot());
    } catch (err) {
      dataError(res, err);
    }
  });

  return app;
}
