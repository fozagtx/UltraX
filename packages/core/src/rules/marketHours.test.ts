import { describe, expect, it } from "vitest";
import { isNyseOpen } from "./marketHours.js";

describe("isNyseOpen", () => {
  it("open on a weekday midday", () => {
    // 2026-09-23 (Wed) 15:00Z = 11:00 ET
    const r = isNyseOpen(new Date("2026-09-23T15:00:00Z"));
    expect(r.open).toBe(true);
    expect(r.reason).toBe("open");
    expect(r.nextChange).toBe("2026-09-23T20:00:00.000Z");
  });

  it("pre-market at 09:29 ET", () => {
    // 13:29Z = 09:29 ET
    const r = isNyseOpen(new Date("2026-09-23T13:29:00Z"));
    expect(r.open).toBe(false);
    expect(r.reason).toBe("pre-market");
    expect(r.nextChange).toBe("2026-09-23T13:30:00.000Z");
  });

  it("after-hours at 16:00 ET", () => {
    const r = isNyseOpen(new Date("2026-09-23T20:00:00Z"));
    expect(r.open).toBe(false);
    expect(r.reason).toBe("after-hours");
    expect(r.nextChange).toBe("2026-09-24T13:30:00.000Z");
  });

  it("closed on Saturday, opens Monday 09:30", () => {
    // 2026-09-26 is a Saturday
    const r = isNyseOpen(new Date("2026-09-26T15:00:00Z"));
    expect(r.open).toBe(false);
    expect(r.reason).toBe("weekend");
    expect(r.nextChange).toBe("2026-09-28T13:30:00.000Z");
  });

  it("closed on Thanksgiving 2026-11-26", () => {
    const r = isNyseOpen(new Date("2026-11-26T17:00:00Z"));
    expect(r.open).toBe(false);
    expect(r.reason).toBe("holiday");
    // next trading day is early-close Friday Nov 27, still opens 09:30
    expect(r.nextChange).toBe("2026-11-27T14:30:00.000Z");
  });

  it("early-close day closed at 13:30 ET", () => {
    // 2026-11-27 18:30Z = 13:30 EST
    const r = isNyseOpen(new Date("2026-11-27T18:30:00Z"));
    expect(r.open).toBe(false);
    expect(r.reason).toBe("early-close");
    expect(r.nextChange).toBe("2026-11-30T14:30:00.000Z");
  });

  it("early-close day still open at 12:30 ET", () => {
    const r = isNyseOpen(new Date("2026-11-27T17:30:00Z"));
    expect(r.open).toBe(true);
    expect(r.nextChange).toBe("2026-11-27T18:00:00.000Z"); // 13:00 EST
  });

  it("DST spring: 2026-03-09 14:00Z = 10:00 EDT, open", () => {
    const r = isNyseOpen(new Date("2026-03-09T14:00:00Z"));
    expect(r.open).toBe(true);
    expect(r.reason).toBe("open");
  });

  it("DST fall: 2026-11-02 14:00Z = 09:00 EST, closed pre-market", () => {
    const r = isNyseOpen(new Date("2026-11-02T14:00:00Z"));
    expect(r.open).toBe(false);
    expect(r.reason).toBe("pre-market");
    expect(r.nextChange).toBe("2026-11-02T14:30:00.000Z");
  });

  it("2027 New Year holiday", () => {
    const r = isNyseOpen(new Date("2027-01-01T16:00:00Z"));
    expect(r.open).toBe(false);
    expect(r.reason).toBe("holiday");
  });
});
