/**
 * THE OPERATOR'S CIVIL DAY. ONE DEFINITION, FOR EVERYTHING THAT SAYS "TODAY".
 *
 * This exists because "today" was computed independently in six places and two
 * of them were wrong in the same way. `new Date().toISOString().slice(0, 10)`
 * is a UTC civil date; the operator's day is a civil date in the configured
 * zone. From 17:00 Pacific those are different days, so every UTC-derived
 * "today" silently reset seven hours early:
 *
 *   - the daily operating report covered 17:00-17:00 and lost ~96% of the day
 *     (1 run and 10 governed actions, for a day that had 28 and 230)
 *   - the dashboard's *_today counters read 193 against a real day of 2333
 *
 * Neither errored. Neither could, because each producer was correct about the
 * question it was actually answering - it was answering the wrong one.
 *
 * PR #921 fixed the report by giving its window one owner. This module is that
 * owner, extracted so the dashboard cannot grow a seventh copy of the
 * arithmetic and drift from reporting the first time either moves.
 *
 * TWO RULES THIS MODULE WILL NOT BEND:
 *
 *   1. NO HOST-ZONE FALLBACK. Defaulting to the machine's zone would quietly
 *      make "wherever this Mac happens to be" a product contract, and the day
 *      would change meaning the first time the fleet moved or a second host
 *      appeared. Unconfigured is answered, not guessed.
 *   2. AN INVALID ZONE REFUSES. It does not degrade to UTC. A wrong day that
 *      looks right is the whole defect class this module was written for.
 */

/**
 * The configured operator zone, or null.
 *
 * Unset is NOT an error and not an operator obligation - it is a day that
 * cannot be named yet, and every caller here reports that rather than
 * substituting one.
 */
export function resolveOperatorTimezone(env = process.env) {
  const tz = String(env?.VACILANDO_REPORT_TIMEZONE ?? "").trim();
  return tz || null;
}

/** True if the runtime recognises this IANA zone. */
export function isValidTimezone(timeZone) {
  if (!timeZone || typeof timeZone !== "string") return false;
  try { new Intl.DateTimeFormat("en-CA", { timeZone }); return true; }
  catch { return false; }
}

/**
 * The civil date ("YYYY-MM-DD") at an instant, in a named zone.
 * Throws on an unusable zone - callers that must not throw use
 * `resolveCivilDayWindow`, which turns that into a stated reason.
 */
export function civilDayInZone(at, timeZone) {
  // en-CA renders ISO-shaped civil dates, which is the whole reason it is here.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(at instanceof Date ? at : new Date(at));
}

/** Zone offset in ms at a given instant (positive east of UTC). */
function offsetMsAt(at, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const asIfUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second),
  );
  return asIfUtc - at.getTime();
}

/** Civil-date arithmetic, with no zone and therefore no DST to get wrong. */
export function shiftCivilDay(dayKey, deltaDays) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + deltaDays)).toISOString().slice(0, 10);
}

/**
 * The UTC instant of local midnight beginning `dayKey` in `timeZone`.
 *
 * Two passes because the offset that applies is the offset AT the answer, not
 * at the guess - one pass is wrong by an hour across a DST boundary, which is
 * exactly the day an operator is most likely to be looking.
 */
export function civilDayStart(dayKey, timeZone) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const civilMs = Date.UTC(y, m - 1, d, 0, 0, 0);
  let ms = civilMs - offsetMsAt(new Date(civilMs), timeZone);
  ms = civilMs - offsetMsAt(new Date(ms), timeZone);
  return new Date(ms);
}

/**
 * THE PRIMITIVE. A civil-day window in the configured zone.
 *
 * `spanDays` is how many civil days the window covers, counting BACK from and
 * including `day` - 1 for a day, 7 for a week. The end is the start of the
 * next civil day rather than start + 24h, so a DST day is 23 or 25 hours and
 * neither clips an hour nor counts one twice.
 *
 * Throws on an unusable zone. Use `resolveCivilDayWindow` where a refusal must
 * be reported rather than raised.
 */
export function civilDayWindow({ at = new Date(), timeZone, dayKey = null, spanDays = 1 } = {}) {
  if (!isValidTimezone(timeZone)) {
    throw new RangeError(`civilDayWindow: unusable timezone ${JSON.stringify(timeZone)}`);
  }
  const day = dayKey || civilDayInZone(at, timeZone);
  const startKey = spanDays > 1 ? shiftCivilDay(day, -(spanDays - 1)) : day;
  const start = civilDayStart(startKey, timeZone);
  const end = civilDayStart(shiftCivilDay(day, 1), timeZone);
  return {
    day,
    timezone: timeZone,
    start: start.toISOString(),
    end: end.toISOString(),
    startMs: start.getTime(),
    endMs: end.getTime(),
  };
}

/**
 * The same window, with refusal reported instead of thrown.
 *
 * Returns `{ ok: true, ...window }` or `{ ok: false, reason, setting }`. A
 * consumer that cannot name the day must say so - it must NOT fall back to a
 * UTC day and present it as the operator's, which is the defect this module
 * exists to make unrepresentable.
 */
export function resolveCivilDayWindow({ at = new Date(), timeZone = undefined, dayKey = null, spanDays = 1, env = process.env } = {}) {
  const tz = timeZone === undefined ? resolveOperatorTimezone(env) : timeZone;
  if (!tz) {
    return { ok: false, reason: "timezone_not_configured", setting: "VACILANDO_REPORT_TIMEZONE" };
  }
  if (!isValidTimezone(tz)) {
    return { ok: false, reason: "timezone_invalid", setting: "VACILANDO_REPORT_TIMEZONE", timezone: tz };
  }
  try { return { ok: true, ...civilDayWindow({ at, timeZone: tz, dayKey, spanDays }) }; }
  catch (err) {
    return { ok: false, reason: "window_unresolved", setting: "VACILANDO_REPORT_TIMEZONE", timezone: tz, detail: String(err?.message || err).slice(0, 200) };
  }
}

/**
 * Does `isoTimestamp` fall inside the window? Missing or unparseable is false.
 *
 * Every "today" counter should filter with THIS rather than by comparing date
 * prefixes: `String(t).slice(0, 10) === dayKey` compares a UTC prefix against a
 * zoned key and is how the original defect was written six times.
 */
export function withinCivilDay(window, isoTimestamp) {
  if (!window?.ok && !window?.startMs) return false;
  const t = Date.parse(isoTimestamp || "");
  if (Number.isNaN(t)) return false;
  return t >= window.startMs && t < window.endMs;
}
