/**
 * First bookable calendar day for customer self-serve booking (book-v2).
 * Matches product QA examples (Wed→Tue, Sun→Fri, Sat→Fri, Mon→next Mon):
 * - Sunday: add 5 calendar days in the booking timezone, then roll off weekends.
 * - Any other weekday: add 6 calendar days, then roll off weekends.
 * "Roll off weekends": while the candidate falls on Sat/Sun, advance by one calendar day.
 *
 * Calendar stepping uses repeated +24h from a noon anchor in the target timezone (acceptable
 * for US zones; rare DST edge cases may differ by an hour but the calendar date intent holds).
 */

export function createInstantForLocalClock(
  timezone: string,
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number
): Date {
  const dateStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
  let candidate = new Date(`${dateStr}Z`);
  for (let i = 0; i < 10; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(candidate);

    const tzYear = parseInt(parts.find((p) => p.type === "year")!.value);
    const tzMonth = parseInt(parts.find((p) => p.type === "month")!.value) - 1;
    const tzDay = parseInt(parts.find((p) => p.type === "day")!.value);
    const tzHour = parseInt(parts.find((p) => p.type === "hour")!.value);
    const tzMinute = parseInt(parts.find((p) => p.type === "minute")!.value);

    if (tzYear === year && tzMonth === monthIndex && tzDay === day && tzHour === hour && tzMinute === minute) {
      break;
    }

    const targetLocal = new Date(year, monthIndex, day, hour, minute, 0);
    const tzLocal = new Date(tzYear, tzMonth, tzDay, tzHour, tzMinute, 0);
    const diffMs = targetLocal.getTime() - tzLocal.getTime();
    candidate = new Date(candidate.getTime() + diffMs);
    if (Math.abs(diffMs) < 1000) break;
  }
  return candidate;
}

export function formatYmdInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function weekdayShortInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(date);
}

/** Add whole calendar days by stepping from noon local (see module doc). */
export function addCalendarDaysInTimezone(timezone: string, ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  let t = createInstantForLocalClock(timezone, y, m - 1, d, 12, 0);
  for (let i = 0; i < days; i++) {
    t = new Date(t.getTime() + 24 * 60 * 60 * 1000);
  }
  return formatYmdInTimezone(t, timezone);
}

/**
 * @param now - typically `new Date()`; injectable for tests
 */
export function computeCustomerMinBookableDateYmd(timezone: string, now: Date = new Date()): string {
  const todayYmd = formatYmdInTimezone(now, timezone);
  const dow = weekdayShortInTimezone(now, timezone);
  const initialOffset = dow === "Sun" ? 5 : 6;
  let candidate = addCalendarDaysInTimezone(timezone, todayYmd, initialOffset);

  for (let i = 0; i < 14; i++) {
    const [cy, cm, cd] = candidate.split("-").map(Number);
    const noon = createInstantForLocalClock(timezone, cy, cm - 1, cd, 12, 0);
    const w = weekdayShortInTimezone(noon, timezone);
    if (w !== "Sat" && w !== "Sun") break;
    candidate = addCalendarDaysInTimezone(timezone, candidate, 1);
  }
  return candidate;
}

/** Long label for a calendar date key `YYYY-MM-DD` in the booking timezone (e.g. "Tuesday, May 5"). */
export function formatDateKeyDisplayLong(dateKey: string, timezone: string): string {
  const parts = dateKey.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return dateKey;
  const [y, m, d] = parts;
  const noon = createInstantForLocalClock(timezone, y, m - 1, d, 12, 0);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  }).format(noon);
}

/** Short label for lists/chips (e.g. "Tue, May 5"). */
export function formatDateKeyDisplayShort(dateKey: string, timezone: string): string {
  const parts = dateKey.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return dateKey;
  const [y, m, d] = parts;
  const noon = createInstantForLocalClock(timezone, y, m - 1, d, 12, 0);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: timezone,
  }).format(noon);
}

export function isWeekendDateKey(dateKey: string, timezone: string): boolean {
  const parts = dateKey.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return false;
  const [y, m, d] = parts;
  const noon = createInstantForLocalClock(timezone, y, m - 1, d, 12, 0);
  const w = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(noon);
  return w === "Sat" || w === "Sun";
}
