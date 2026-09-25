import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp, challengeOnlyFacilitator } from "./server.js";
import type { CheckDeps } from "./core/index.js";

const ENV = {
  NETWORK: "eip155:196",
  PAY_TO: "0x000000000000000000000000000000000000dEaD",
  PUBLIC_API_BASE_URL: "http://localhost:8080",
  WEB_ORIGIN: "*",
};

function makeCheckDeps(): CheckDeps {
  return {
    stockPrice: async () => ({ price: 200, asOf: Date.now() }),
    okxTicker: async () => ({ last: 221, ts: Date.now() }),
    xlayerPrice: async () => ({ price: 220.5, time: Date.now() }),
    multiplier: async () => 1.1,
    tokenDecimals: async () => 18,
    dexQuote: async () => ({
      toTokenAmount: 494_000_000n,
      priceImpactPct: -0.2,
      toDecimals: 6,
    }),
  };
}

const app = createApp({
  env: ENV,
  checkDeps: makeCheckDeps(),
  facilitator: challengeOnlyFacilitator(ENV.NETWORK),
});

describe("api", () => {
  it("GET /health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.chainId).toBe(196);
    expect(res.body.payTo).toBe(ENV.PAY_TO);
  });

  it("GET /catalog", async () => {
    const res = await request(app).get("/catalog");
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Know What You Hold");
    expect(res.body.inputRequired.required.ticker.enum).toContain("NVDAx");
    expect(res.body.tokens).toHaveLength(3);
    expect(res.body.verdictRules).toHaveLength(3);
  });

  it("GET /status returns token rows", async () => {
    const res = await request(app).get("/status");
    expect(res.status).toBe(200);
    expect(res.body.tokens).toHaveLength(3);
    const t = res.body.tokens[0];
    expect(t.ticker).toBe("NVDAx");
    expect(t.realStock).toBe(200);
    expect(t.multiplier).toBe(1.1);
  });

  it("GET /payments/recent returns empty list", async () => {
    const res = await request(app).get("/payments/recent");
    expect(res.status).toBe(200);
    expect(res.body.payTo).toBe(ENV.PAY_TO);
    expect(res.body.payments).toEqual([]);
  });

  it("POST /check {} -> 400 input_required with 3 fields", async () => {
    const res = await request(app).post("/check").send({});
    expect(res.status).toBe(400);
    expect(res.body.status).toBe("input_required");
    expect(res.body.missing.sort()).toEqual(["side", "sizeUSD", "ticker"]);
    expect(res.body.required.ticker.enum).toContain("TSLAx");
  });

  it("POST /check invalid ticker -> 400", async () => {
    const res = await request(app)
      .post("/check")
      .send({ ticker: "FOO", side: "sell", sizeUSD: 500 });
    // fields present so stage-1 passes; stage-3 validation rejects
    expect(res.status).toBe(400);
  });

  it("POST /check valid unpaid -> 402 with PAYMENT-REQUIRED", async () => {
    const res = await request(app)
      .post("/check")
      .send({ ticker: "NVDAx", side: "sell", sizeUSD: 500 });
    expect(res.status).toBe(402);
    const hdr = res.headers["payment-required"];
    expect(hdr).toBeTruthy();
    const decoded = JSON.parse(
      Buffer.from(hdr, "base64").toString("utf8"),
    ) as { accepts: { amount: string; asset: string; payTo: string }[] };
    expect(decoded.accepts[0].amount).toBe("5000");
    expect(decoded.accepts[0].asset.toLowerCase()).toBe(
      "0x779ded0c9e1022225f8e0630b35a9b54be713736",
    );
    expect(decoded.accepts[0].payTo.toLowerCase()).toBe(ENV.PAY_TO.toLowerCase());
  });
});
