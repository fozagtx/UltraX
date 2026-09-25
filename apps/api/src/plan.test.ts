import { describe, it, expect } from "vitest";
import {
  planScan,
  filterAlertableTransfers,
} from "./collector/plan.js";

describe("planScan", () => {
  it("no state: init head/tail to latest+1, backfill from latest, no catch-up", () => {
    const plan = planScan(null, 10_000, 2000);
    expect(plan.init).toEqual({ headBlock: 10001, tailBlock: 10001 });
    expect(plan.catchUp).toBeNull();
    expect(plan.backfill).toEqual({ from: 8001, to: 10000 });
  });

  it("complete state: only catch-up range", () => {
    const plan = planScan(
      { headBlock: 9000, tailBlock: 100, backfillComplete: true, source: "rpc" },
      10_000,
      2000,
    );
    expect(plan.init).toBeNull();
    expect(plan.catchUp).toEqual({ from: 9001, to: 10000 });
    expect(plan.backfill).toBeNull();
  });

  it("partial state: both catch-up and backfill", () => {
    const plan = planScan(
      { headBlock: 9000, tailBlock: 5000, backfillComplete: false, source: "rpc" },
      10_000,
      2000,
    );
    expect(plan.catchUp).toEqual({ from: 9001, to: 10000 });
    expect(plan.backfill).toEqual({ from: 3000, to: 4999 });
  });

  it("up-to-date head: no catch-up", () => {
    const plan = planScan(
      { headBlock: 10_000, tailBlock: 5000, backfillComplete: false, source: "rpc" },
      10_000,
      2000,
    );
    expect(plan.catchUp).toBeNull();
    expect(plan.backfill).toEqual({ from: 3000, to: 4999 });
  });

  it("backfill clamps at block 0", () => {
    const plan = planScan(
      { headBlock: 10_000, tailBlock: 100, backfillComplete: false, source: "rpc" },
      10_000,
      2000,
    );
    expect(plan.backfill).toEqual({ from: 0, to: 99 });
  });
});

describe("filterAlertableTransfers", () => {
  it("excludes transfers older than 1 hour", () => {
    const now = 1_000_000_000_000;
    const fresh = {
      txHash: "0x1",
      logIndex: 0,
      ts: new Date(now - 30 * 60_000),
      amount: "1",
    };
    const old = {
      txHash: "0x2",
      logIndex: 0,
      ts: new Date(now - 2 * 3600_000),
      amount: "1",
    };
    expect(filterAlertableTransfers([fresh, old], now)).toEqual([fresh]);
  });
});
