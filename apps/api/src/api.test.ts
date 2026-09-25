import { describe, it, expect } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { decodeTransfer } from "./collector/decode.js";
import { okxSign } from "@ultrax/metrics";
import { createApp } from "./server.js";
import type { Repo } from "./repo.js";

const fakeRepo: Repo = {
  ping: async () => {},
  getDailySeries: async (metricId, days) => ({
    metric: metricId,
    chain: "xlayer",
    chainId: 196,
    unit: "x",
    updatedAt: null,
    series: [],
    days,
  }),
  getWhaleTransfers: async () => ({ metric: "whale-transfers", items: [] }),
  getSnapshot: async () => ({ metrics: {}, updatedAt: null }),
  getHolderConcentration: async () => ({ metric: "holder-concentration" }),
  createAlert: async (input) => ({
    id: "11111111-1111-1111-1111-111111111111",
    webhookUrl: input.webhookUrl,
    minUsd: input.minUsd,
    expiresAt: input.expiresAt.toISOString(),
  }),
};

const env = {
  NETWORK: "eip155:196",
  PAY_TO_ADDRESS: "0x000000000000000000000000000000000000dEaD",
  PUBLIC_API_BASE_URL: "http://localhost:8080",
  COLLECTOR_ENABLED: false,
};

describe("decodeTransfer", () => {
  it("decodes a real-shaped USDT0 Transfer log", () => {
    const log = {
      topics: [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        "0x000000000000000000000000AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "0x000000000000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ],
      data: "0x00000000000000000000000000000000000000000000000000000000000f4240",
      transactionHash:
        "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      logIndex: 3,
      blockNumber: 12345n,
    };
    const d = decodeTransfer(log)!;
    expect(d.amount).toBe("1.000000");
    expect(d.from).toBe("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(d.to).toBe("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    expect(d.txHash).toBe(log.transactionHash);
    expect(d.logIndex).toBe(3);
  });

  it("detects mints (from zero address) and skips malformed logs", () => {
    const mint = decodeTransfer({
      topics: [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0x000000000000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ],
      data: "0x00000000000000000000000000000000000000000000000000000000000f4240",
      transactionHash: "0xabc",
      logIndex: 0,
      blockNumber: 1n,
    })!;
    expect(mint.from).toBe("0x0000000000000000000000000000000000000000");
    expect(
      decodeTransfer({ topics: ["0xddf2"], data: "0x" }),
    ).toBeNull();
  });
});

describe("okxSign", () => {
  it("produces expected base64 for fixed timestamp and path", () => {
    const ts = "2026-01-01T00:00:00.000Z";
    const path = "/api/v6/explorer/info/stats?chainIndex=196";
    const expected = crypto
      .createHmac("sha256", "secret")
      .update(`${ts}GET${path}`)
      .digest("base64");
    expect(okxSign("secret", ts, "GET", path)).toBe(expected);
  });
});

describe("http", () => {
  it("GET /health returns 200", async () => {
    const app = createApp({ repo: fakeRepo, env });
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.chainId).toBe(196);
  });

  it("GET /health returns 503 when DB ping fails", async () => {
    const app = createApp({
      repo: { ...fakeRepo, ping: async () => Promise.reject(new Error("down")) },
      env,
    });
    const res = await request(app).get("/health");
    expect(res.status).toBe(503);
  });

  it("GET /catalog returns 9 endpoints with prices", async () => {
    const app = createApp({ repo: fakeRepo, env });
    const res = await request(app).get("/catalog");
    expect(res.status).toBe(200);
    expect(res.body.endpoints).toHaveLength(9);
    const holder = res.body.endpoints.find(
      (e: { id: string }) => e.id === "holder-concentration",
    );
    expect(holder.priceUsd).toBe(0.02);
    const snapshot = res.body.endpoints.find(
      (e: { id: string }) => e.id === "snapshot",
    );
    expect(snapshot.priceUsd).toBe(0.05);
    const alerts = res.body.endpoints.find(
      (e: { id: string }) => e.id === "alerts-subscribe",
    );
    expect(alerts.priceUsd).toBe(0.1);
    expect(res.body.endpoints[0].url).toMatch(/^http:\/\/localhost:8080\//);
  });

  it("GET /v1/metrics/new-addresses without payment returns 402", async () => {
    const app = createApp({ repo: fakeRepo, env });
    const res = await request(app).get("/v1/metrics/new-addresses");
    expect(res.status).toBe(402);
    const paymentRequired =
      res.headers["payment-required"] ?? res.body.paymentRequired ?? res.body;
    expect(paymentRequired).toBeTruthy();
  });

  it("invalid params return 400 when payments disabled", async () => {
    const app = createApp({ repo: fakeRepo, env, paymentsDisabled: true });
    const res = await request(app).get("/v1/metrics/new-addresses?days=99");
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("POST /v1/alerts/subscribe validates body", async () => {
    const app = createApp({ repo: fakeRepo, env, paymentsDisabled: true });
    const httpRes = await request(app)
      .post("/v1/alerts/subscribe")
      .send({ webhookUrl: "http://example.com/hook", minUsd: 100000 });
    expect(httpRes.status).toBe(400);
    const lowRes = await request(app)
      .post("/v1/alerts/subscribe")
      .send({ webhookUrl: "https://example.com/hook", minUsd: 5000 });
    expect(lowRes.status).toBe(400);
    const okRes = await request(app)
      .post("/v1/alerts/subscribe")
      .send({ webhookUrl: "https://example.com/hook", minUsd: 100000 });
    expect(okRes.status).toBe(200);
    expect(okRes.body.webhookUrl).toBe("https://example.com/hook");
    expect(okRes.body.eventShape.metric).toBe("whale-transfers");
  });
});
