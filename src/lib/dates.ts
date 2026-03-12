/**
 * Date utilities for NslNotes.
 * All dates use ISO 8601 format (YYYY-MM-DD) for consistency with frontmatter.
 */

/**
 * ISO date regex pattern (YYYY-MM-DD)
 */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Milliseconds in a day
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Convert a Date object to ISO date string (YYYY-MM-DD).
 * Uses local timezone.
 *
 * @param date - The date to format
 * @returns ISO date string in YYYY-MM-DD format
 */
export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse an ISO date string (YYYY-MM-DD) to a Date object.
 * Returns null for invalid formats or invalid dates.
 *
 * @param str - ISO date string to parse
 * @returns Date object set to midnight local time, or null if invalid
 */
export function parseISODate(str: string): Date | null {
  // Validate format
  if (!ISO_DATE_PATTERN.test(str)) {
    return null;
  }

  const [yearStr, monthStr, dayStr] = str.split("-");
  if (!yearStr || !monthStr || !dayStr) {
    return null;
  }

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // JS months are 0-indexed
  const day = parseInt(dayStr, 10);

  // Create date and validate it's a real date
  const date = new Date(year, month, day);

  // Check if the date components match (catches invalid dates like 2026-02-30)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

/**
 * Get today's date at midnight (local timezone).
 *
 * @returns Date object set to today at midnight
 */
export function getToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Get today's date as an ISO string (YYYY-MM-DD).
 *
 * @returns Today's date in YYYY-MM-DD format
 */
export function getTodayISO(): string {
  return toISODate(new Date());
}

/**
 * Calculate the number of days between a date and today.
 * Positive = future, negative = past (overdue).
 *
 * @param date - The date to compare (Date object or ISO string)
 * @returns Number of days relative to today
 */
export function getRelativeDays(date: Date | string): number {
  const targetDate = typeof date === "string" ? parseISODate(date) : date;
  if (!targetDate) {
    return 0;
  }

  const today = getToday();
  const diffMs = targetDate.getTime() - today.getTime();
  return Math.round(diffMs / MS_PER_DAY);
}

/**
 * Check if a date is within N days from today (inclusive).
 * Only checks future dates - past dates return false.
 *
 * @param date - The date to check (Date object or ISO string)
 * @param days - Number of days threshold
 * @returns True if date is today or within N days in the future
 */
export function isWithinDays(date: Date | string, days: number): boolean {
  const relativeDays = getRelativeDays(date);
  return relativeDays >= 0 && relativeDays <= days;
}

/**
 * Check if a date is overdue (before today).
 *
 * @param date - The date to check (Date object or ISO string)
 * @returns True if date is before today
 */
export function isOverdue(date: Date | string): boolean {
  return getRelativeDays(date) < 0;
}

/**
 * Check if a date is today.
 *
 * @param date - The date to check (Date object or ISO string)
 * @returns True if date is today
 */
export function isToday(date: Date | string): boolean {
  return getRelativeDays(date) === 0;
}

/**
 * Check if a date is within the past N days (inclusive of today).
 * Used for "active topic" calculation (90-day rule).
 *
 * @param date - The date to check (Date object or ISO string)
 * @param days - Number of days threshold
 * @returns True if date is within the past N days or today
 */
export function isWithinPastDays(date: Date | string, days: number): boolean {
  const relativeDays = getRelativeDays(date);
  return relativeDays >= -days && relativeDays <= 0;
}

/**
 * Format a relative day count as a human-readable string.
 * E.g., -2 → "-2d", 0 → "Today", 3 → "Thu" or "Mar 15"
 *
 * @param date - The date to format (Date object or ISO string)
 * @returns Human-readable relative date string
 */
export function formatRelativeDate(date: Date | string): string {
  const relativeDays = getRelativeDays(date);
  const targetDate = typeof date === "string" ? parseISODate(date) : date;

  if (!targetDate) {
    return "";
  }

  if (relativeDays === 0) {
    return "Today";
  }

  if (relativeDays === 1) {
    return "Tomorrow";
  }

  if (relativeDays === -1) {
    return "Yesterday";
  }

  // Overdue: show negative days
  if (relativeDays < 0) {
    return `${relativeDays}d`;
  }

  // Within a week: show day name
  if (relativeDays <= 7) {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return dayNames[targetDate.getDay()] ?? "";
  }

  // Further out: show month and day
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${monthNames[targetDate.getMonth()]} ${targetDate.getDate()}`;
}

/**
 * Format a date as a human-readable long form.
 * E.g., "March 10, 2026" or "Today, March 10"
 *
 * @param date - The date to format (Date object or ISO string)
 * @param includeYear - Whether to include the year
 * @returns Human-readable date string
 */
export function formatLongDate(
  date: Date | string,
  includeYear = true
): string {
  const targetDate = typeof date === "string" ? parseISODate(date) : date;

  if (!targetDate) {
    return "";
  }

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const month = monthNames[targetDate.getMonth()];
  const day = targetDate.getDate();

  if (includeYear) {
    return `${month} ${day}, ${targetDate.getFullYear()}`;
  }

  return `${month} ${day}`;
}

/**
 * Add days to a date.
 *
 * @param date - The base date
 * @param days - Number of days to add (can be negative)
 * @returns New Date object
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Check if an ISO date string is valid.
 *
 * @param str - String to validate
 * @returns True if valid ISO date
 */
export function isValidISODate(str: string): boolean {
  return parseISODate(str) !== null;
}
