export type MarketReason =
  | "open"
  | "weekend"
  | "holiday"
  | "pre-market"
  | "after-hours"
  | "early-close";

export interface MarketState {
  open: boolean;
  reason: MarketReason;
  nextChange: string; // ISO timestamp
}

// NYSE 2026 full-day closures (month-day keys, ET)
const HOLIDAYS: Record<string, Set<string>> = {
  "2026": new Set([
    "01-01",
    "01-19",
    "02-16",
    "04-03",
    "05-25",
    "06-19",
    "07-03",
    "09-07",
    "11-26",
    "12-25",
  ]),
  "2027": new Set(["01-01", "01-18"]),
};

// NYSE 13:00 ET early closes
const EARLY_CLOSES: Record<string, Set<string>> = {
  "2026": new Set(["11-27", "12-24"]),
};

const OPEN_MIN = 9 * 60 + 30;
const CLOSE_MIN = 16 * 60;
const EARLY_CLOSE_MIN = 13 * 60;

interface NyParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
  ms: number; // UTC instant corresponding to the NY wall-clock reading
}

const dtf = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function nyParts(date: Date): NyParts {
  const parts = dtf.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = Number(get("hour")) % 24;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: Number(get("minute")),
    weekday: WEEKDAYS[get("weekday")] ?? 0,
    ms: date.getTime(),
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isHoliday(p: NyParts): boolean {
  return HOLIDAYS[String(p.year)]?.has(`${pad2(p.month)}-${pad2(p.day)}`) ?? false;
}

function isEarlyClose(p: NyParts): boolean {
  return (
    EARLY_CLOSES[String(p.year)]?.has(`${pad2(p.month)}-${pad2(p.day)}`) ?? false
  );
}

// Convert an NY wall-clock time on the same NY date as `date` back to a UTC instant.
// Uses the UTC offset derived from `date` (stable within a day; sessions never
// straddle a DST transition boundary).
function nyWallClockToUtc(date: Date, p: NyParts, minutes: number): Date {
  const nyNowMinutes = p.hour * 60 + p.minute;
  const offsetMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - p.ms;
  return new Date(
    Date.UTC(p.year, p.month - 1, p.day, 0, 0) +
      minutes * 60_000 -
      offsetMs,
  );
}

// Advance to the same wall-clock reading the next NY calendar day.
function nextNyDay(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function isNyseOpen(date: Date): MarketState {
  const p = nyParts(date);
  const minutes = p.hour * 60 + p.minute;
  const weekend = p.weekday === 0 || p.weekday === 6;
  const holiday = isHoliday(p);
  const early = isEarlyClose(p);
  const closeMin = early ? EARLY_CLOSE_MIN : CLOSE_MIN;

  const nextOpenDay = (from: Date): Date => {
    let d = nextNyDay(from, 1);
    for (let i = 0; i < 10; i++) {
      const q = nyParts(d);
      const qWeekend = q.weekday === 0 || q.weekday === 6;
      if (!qWeekend && !isHoliday(q)) return d;
      d = nextNyDay(d, 1);
    }
    return d;
  };

  if (weekend) {
    const n = nextOpenDay(date);
    return {
      open: false,
      reason: "weekend",
      nextChange: nyWallClockToUtc(n, nyParts(n), OPEN_MIN).toISOString(),
    };
  }
  if (holiday) {
    const n = nextOpenDay(date);
    return {
      open: false,
      reason: "holiday",
      nextChange: nyWallClockToUtc(n, nyParts(n), OPEN_MIN).toISOString(),
    };
  }
  if (minutes < OPEN_MIN) {
    return {
      open: false,
      reason: "pre-market",
      nextChange: nyWallClockToUtc(date, p, OPEN_MIN).toISOString(),
    };
  }
  if (minutes >= closeMin) {
    const reason: MarketReason = early ? "early-close" : "after-hours";
    const n = nextOpenDay(date);
    return {
      open: false,
      reason,
      nextChange: nyWallClockToUtc(n, nyParts(n), OPEN_MIN).toISOString(),
    };
  }
  return {
    open: true,
    reason: "open",
    nextChange: nyWallClockToUtc(date, p, closeMin).toISOString(),
  };
}
