import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  toISODate,
  parseISODate,
  getToday,
  getTodayISO,
  getRelativeDays,
  isWithinDays,
  isOverdue,
  isToday,
  isWithinPastDays,
  formatRelativeDate,
  formatLongDate,
  addDays,
  isValidISODate,
} from "./dates";

describe("toISODate", () => {
  it("formats date as YYYY-MM-DD", () => {
    const date = new Date(2026, 2, 10); // March 10, 2026
    expect(toISODate(date)).toBe("2026-03-10");
  });

  it("pads single-digit month and day", () => {
    const date = new Date(2026, 0, 5); // January 5, 2026
    expect(toISODate(date)).toBe("2026-01-05");
  });

  it("handles year boundaries", () => {
    const date = new Date(2025, 11, 31); // December 31, 2025
    expect(toISODate(date)).toBe("2025-12-31");
  });

  it("handles leap year", () => {
    const date = new Date(2024, 1, 29); // February 29, 2024 (leap year)
    expect(toISODate(date)).toBe("2024-02-29");
  });
});

describe("parseISODate", () => {
  it("parses valid ISO date", () => {
    const date = parseISODate("2026-03-10");
    expect(date).not.toBeNull();
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(2); // March (0-indexed)
    expect(date?.getDate()).toBe(10);
  });

  it("returns null for invalid format", () => {
    expect(parseISODate("March 10, 2026")).toBeNull();
    expect(parseISODate("10-03-2026")).toBeNull();
    expect(parseISODate("2026/03/10")).toBeNull();
    expect(parseISODate("2026-3-10")).toBeNull();
    expect(parseISODate("2026-03-1")).toBeNull();
  });

  it("returns null for invalid dates", () => {
    expect(parseISODate("2026-02-30")).toBeNull(); // Feb 30 doesn't exist
    expect(parseISODate("2026-13-01")).toBeNull(); // Month 13
    expect(parseISODate("2026-00-10")).toBeNull(); // Month 0
    expect(parseISODate("2026-03-32")).toBeNull(); // Day 32
  });

  it("handles leap year validation", () => {
    expect(parseISODate("2024-02-29")).not.toBeNull(); // Leap year
    expect(parseISODate("2025-02-29")).toBeNull(); // Not a leap year
  });

  it("returns null for empty string", () => {
    expect(parseISODate("")).toBeNull();
  });

  it("round-trips with toISODate", () => {
    const original = "2026-03-10";
    const parsed = parseISODate(original);
    expect(parsed).not.toBeNull();
    expect(toISODate(parsed!)).toBe(original);
  });
});

describe("getToday and getTodayISO", () => {
  it("getToday returns midnight local time", () => {
    const today = getToday();
    expect(today.getHours()).toBe(0);
    expect(today.getMinutes()).toBe(0);
    expect(today.getSeconds()).toBe(0);
    expect(today.getMilliseconds()).toBe(0);
  });

  it("getTodayISO returns valid ISO string", () => {
    const todayISO = getTodayISO();
    expect(todayISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(parseISODate(todayISO)).not.toBeNull();
  });

  it("getTodayISO matches getToday", () => {
    const today = getToday();
    const todayISO = getTodayISO();
    expect(toISODate(today)).toBe(todayISO);
  });
});

describe("getRelativeDays", () => {
  let mockDate: Date;

  beforeEach(() => {
    // Mock "today" as March 10, 2026
    mockDate = new Date(2026, 2, 10);
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 0 for today", () => {
    expect(getRelativeDays("2026-03-10")).toBe(0);
    expect(getRelativeDays(new Date(2026, 2, 10))).toBe(0);
  });

  it("returns positive for future dates", () => {
    expect(getRelativeDays("2026-03-11")).toBe(1);
    expect(getRelativeDays("2026-03-17")).toBe(7);
    expect(getRelativeDays("2026-04-10")).toBe(31);
  });

  it("returns negative for past dates", () => {
    expect(getRelativeDays("2026-03-09")).toBe(-1);
    expect(getRelativeDays("2026-03-03")).toBe(-7);
    expect(getRelativeDays("2026-02-10")).toBe(-28);
  });

  it("handles year boundaries", () => {
    // December 31, 2025 from March 10, 2026
    expect(getRelativeDays("2025-12-31")).toBe(-69);
  });

  it("returns 0 for invalid string", () => {
    expect(getRelativeDays("invalid")).toBe(0);
  });
});

describe("isWithinDays", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 10)); // March 10, 2026
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true for today", () => {
    expect(isWithinDays("2026-03-10", 7)).toBe(true);
    expect(isWithinDays("2026-03-10", 0)).toBe(true);
  });

  it("returns true for dates within range", () => {
    expect(isWithinDays("2026-03-11", 7)).toBe(true);
    expect(isWithinDays("2026-03-17", 7)).toBe(true);
  });

  it("returns false for dates beyond range", () => {
    expect(isWithinDays("2026-03-18", 7)).toBe(false);
    expect(isWithinDays("2026-04-01", 7)).toBe(false);
  });

  it("returns false for past dates", () => {
    expect(isWithinDays("2026-03-09", 7)).toBe(false);
    expect(isWithinDays("2026-03-01", 7)).toBe(false);
  });

  it("works with custom day range", () => {
    expect(isWithinDays("2026-03-15", 5)).toBe(true);
    expect(isWithinDays("2026-03-16", 5)).toBe(false);
  });
});

describe("isOverdue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 10)); // March 10, 2026
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true for past dates", () => {
    expect(isOverdue("2026-03-09")).toBe(true);
    expect(isOverdue("2026-02-01")).toBe(true);
  });

  it("returns false for today", () => {
    expect(isOverdue("2026-03-10")).toBe(false);
  });

  it("returns false for future dates", () => {
    expect(isOverdue("2026-03-11")).toBe(false);
    expect(isOverdue("2027-01-01")).toBe(false);
  });
});

describe("isToday", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 10)); // March 10, 2026
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true for today", () => {
    expect(isToday("2026-03-10")).toBe(true);
    expect(isToday(new Date(2026, 2, 10))).toBe(true);
  });

  it("returns false for other dates", () => {
    expect(isToday("2026-03-09")).toBe(false);
    expect(isToday("2026-03-11")).toBe(false);
  });
});

describe("isWithinPastDays", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 10)); // March 10, 2026
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true for today", () => {
    expect(isWithinPastDays("2026-03-10", 90)).toBe(true);
  });

  it("returns true for dates within past range", () => {
    expect(isWithinPastDays("2026-03-09", 7)).toBe(true);
    expect(isWithinPastDays("2026-03-03", 7)).toBe(true);
  });

  it("returns false for dates beyond past range", () => {
    expect(isWithinPastDays("2026-03-02", 7)).toBe(false);
    expect(isWithinPastDays("2025-01-01", 90)).toBe(false);
  });

  it("returns false for future dates", () => {
    expect(isWithinPastDays("2026-03-11", 90)).toBe(false);
  });

  it("works for 90-day active topic rule", () => {
    expect(isWithinPastDays("2025-12-10", 90)).toBe(true); // Exactly 90 days ago
    expect(isWithinPastDays("2025-12-09", 90)).toBe(false); // 91 days ago
  });
});

describe("formatRelativeDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 10)); // March 10, 2026 (Tuesday)
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Today" for today', () => {
    expect(formatRelativeDate("2026-03-10")).toBe("Today");
  });

  it('returns "Tomorrow" for tomorrow', () => {
    expect(formatRelativeDate("2026-03-11")).toBe("Tomorrow");
  });

  it('returns "Yesterday" for yesterday', () => {
    expect(formatRelativeDate("2026-03-09")).toBe("Yesterday");
  });

  it("returns negative days for overdue", () => {
    expect(formatRelativeDate("2026-03-08")).toBe("-2d");
    expect(formatRelativeDate("2026-03-03")).toBe("-7d");
  });

  it("returns day name for within a week", () => {
    expect(formatRelativeDate("2026-03-12")).toBe("Thu"); // Thursday
    expect(formatRelativeDate("2026-03-15")).toBe("Sun"); // Sunday
  });

  it("returns month and day for beyond a week", () => {
    expect(formatRelativeDate("2026-03-20")).toBe("Mar 20");
    expect(formatRelativeDate("2026-04-15")).toBe("Apr 15");
  });

  it("returns empty string for invalid date", () => {
    expect(formatRelativeDate("invalid")).toBe("");
  });
});

describe("formatLongDate", () => {
  it("formats date with year", () => {
    expect(formatLongDate("2026-03-10")).toBe("March 10, 2026");
    expect(formatLongDate("2026-01-01")).toBe("January 1, 2026");
    expect(formatLongDate("2026-12-25")).toBe("December 25, 2026");
  });

  it("formats date without year", () => {
    expect(formatLongDate("2026-03-10", false)).toBe("March 10");
  });

  it("returns empty string for invalid date", () => {
    expect(formatLongDate("invalid")).toBe("");
  });
});

describe("addDays", () => {
  it("adds positive days", () => {
    const date = new Date(2026, 2, 10);
    const result = addDays(date, 5);
    expect(result.getDate()).toBe(15);
    expect(result.getMonth()).toBe(2);
  });

  it("adds negative days", () => {
    const date = new Date(2026, 2, 10);
    const result = addDays(date, -5);
    expect(result.getDate()).toBe(5);
  });

  it("handles month overflow", () => {
    const date = new Date(2026, 2, 30); // March 30
    const result = addDays(date, 5);
    expect(result.getMonth()).toBe(3); // April
    expect(result.getDate()).toBe(4);
  });

  it("handles year overflow", () => {
    const date = new Date(2026, 11, 30); // December 30
    const result = addDays(date, 5);
    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(4);
  });

  it("does not mutate original date", () => {
    const date = new Date(2026, 2, 10);
    const originalTime = date.getTime();
    addDays(date, 5);
    expect(date.getTime()).toBe(originalTime);
  });
});

describe("isValidISODate", () => {
  it("returns true for valid dates", () => {
    expect(isValidISODate("2026-03-10")).toBe(true);
    expect(isValidISODate("2024-02-29")).toBe(true); // Leap year
  });

  it("returns false for invalid formats", () => {
    expect(isValidISODate("2026-3-10")).toBe(false);
    expect(isValidISODate("03-10-2026")).toBe(false);
    expect(isValidISODate("invalid")).toBe(false);
  });

  it("returns false for invalid dates", () => {
    expect(isValidISODate("2026-02-30")).toBe(false);
    expect(isValidISODate("2025-02-29")).toBe(false); // Not leap year
  });
});
