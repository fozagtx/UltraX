import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import {
  okxSign,
  parseLogListPage,
  parseStatsHistoryPage,
  parseSupportedChains,
} from "./okx.js";

describe("okxSign", () => {
  it("signs GET prehash timestamp+GET+path", () => {
    const ts = "2026-09-25T00:00:00.000Z";
    const path = "/api/v6/explorer/info/stats?chainIndex=196&limit=30";
    const expected = crypto
      .createHmac("sha256", "secret")
      .update(`${ts}GET${path}`)
      .digest("base64");
    expect(okxSign("secret", ts, "GET", path)).toBe(expected);
  });

  it("signs POST prehash timestamp+POST+path+body", () => {
    const ts = "2026-09-25T00:00:00.000Z";
    const path = "/api/v6/dex/index/current-price";
    const body = JSON.stringify([
      { chainIndex: "196", tokenContractAddress: "" },
    ]);
    const expected = crypto
      .createHmac("sha256", "secret")
      .update(`${ts}POST${path}${body}`)
      .digest("base64");
    expect(okxSign("secret", ts, "POST", path + body)).toBe(expected);
  });
});

describe("parseLogListPage", () => {
  it("unwraps data[0].logList into RawLogs", () => {
    const data = [
      {
        limit: "100",
        cursor: "next-page",
        logList: [
          {
            height: "71528056",
            address: "0x779ded0c9e1022225f8e0630b35a9b54be713736",
            topics: ["0xddf252ad", "0xaaa", "0xbbb"],
            data: "0x0001",
            methodId: "0x",
            blockHash: "0xhash",
            transactionTime: "1758758400000",
            logIndex: "7",
            txId: "0xdeadbeef",
          },
        ],
      },
    ];
    const { logs, cursor } = parseLogListPage(data);
    expect(cursor).toBe("next-page");
    expect(logs).toHaveLength(1);
    expect(logs[0]!.txHash).toBe("0xdeadbeef");
    expect(logs[0]!.logIndex).toBe(7);
    expect(logs[0]!.blockNumber).toBe(71528056n);
    expect(logs[0]!.timestampMs).toBe(1758758400000);
    expect(logs[0]!.topics).toHaveLength(3);
  });

  it("returns empty cursor at the last page", () => {
    const { logs, cursor } = parseLogListPage([
      { limit: "100", cursor: "", logList: [] },
    ]);
    expect(logs).toHaveLength(0);
    expect(cursor).toBe("");
  });
});

describe("parseStatsHistoryPage", () => {
  it("unwraps statsHistoryList and derives UTC dates", () => {
    const data = [
      {
        limit: "30",
        cursor: "",
        statsHistoryList: [
          {
            time: "1758758400000",
            newAddressCount: "1234",
            totalTransactionCount: "56789",
            totalContractCalls: "100",
            transactionFee: "12.5",
            networkUtilization: "0.4",
          },
        ],
      },
    ];
    const items = parseStatsHistoryPage(data);
    expect(items).toHaveLength(1);
    expect(items[0]!.date).toBe("2025-09-25");
    expect(items[0]!.newAddressCount).toBe(1234);
    expect(items[0]!.totalTransactionCount).toBe(56789);
    expect(items[0]!.transactionFee).toBe(12.5);
  });
});

describe("parseSupportedChains", () => {
  it("extracts chainIndex values", () => {
    const data = [
      { name: "X Layer", logoUrl: "", shortName: "xlayer", chainIndex: "196" },
      { name: "Ethereum", logoUrl: "", shortName: "eth", chainIndex: "1" },
    ];
    expect(parseSupportedChains(data)).toEqual(["196", "1"]);
  });
});
