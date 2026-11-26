#!/usr/bin/env node
/**
 * ONE DEFINITION OF THE OPERATOR'S DAY.
 *
 * "Today" was computed independently in six places. Two were wrong the same
 * way - a UTC civil date standing in for a zoned one - and from 17:00 Pacific
 * both reset seven hours early:
 *
 *   report:    1 run and 10 governed actions, for a day that had 28 and 230
 *   dashboard: 193 commands "today", for a Pacific day that had 2333
 *
 * These lock the SEMANTICS, not the arithmetic, so they survive a refactor of
 * how the window is computed. The 17:01 case is the one that matters most: it
 * is the exact instant the old code changed days and the operator did not.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  civilDayInZone, civilDayWindow, resolveCivilDayWindow, withinCivilDay,
  shiftCivilDay, isValidTimezone,
} from "../lib/vacilando/civil-day.mjs";
import { operatingReportWindow, buildOperatingReport, reportId } from "../lib/vacilando/operating-report.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}
const LA = "America/Los_Angeles";
const src = (f) => readFileSync(new URL(`../lib/${f}`, import.meta.url), "utf8");

/* ── the UTC rollover cannot move the operator's day ─────────────────────── */

test("16:59 Pacific is today", () => {
  // 16:59 PDT = 23:59 UTC, still the same UTC date too - the easy case.
  assert.equal(civilDayInZone(new Date("2026-09-13T23:59:00Z"), LA), "2026-09-13");
});

test("17:01 Pacific is STILL today, though UTC has moved on", () => {
  // 17:01 PDT = 00:01 UTC the NEXT day. This is the instant the old code
  // changed days and the operator did not; it is the whole defect.
  const at = new Date("2026-09-14T00:01:00Z");
  assert.equal(at.toISOString().slice(0, 10), "2026-09-14", "UTC has rolled over");
  assert.equal(civilDayInZone(at, LA), "2026-09-13", "the operator's day has not");
});

test("23:59 Pacific is still the same day", () => {
  assert.equal(civilDayInZone(new Date("2026-09-14T06:59:00Z"), LA), "2026-09-13");
});

test("00:01 Pacific is the next day", () => {
  assert.equal(civilDayInZone(new Date("2026-09-14T07:01:00Z"), LA), "2026-09-14");
});

test("two reads either side of UTC midnight share one Pacific day key", () => {
  const before = resolveCivilDayWindow({ at: new Date("2026-09-13T23:58:00Z"), timeZone: LA });
  const after = resolveCivilDayWindow({ at: new Date("2026-09-14T00:02:00Z"), timeZone: LA });
  assert.equal(before.day, after.day, "UTC midnight must not split one operator day");
  assert.equal(before.start, after.start);
  assert.equal(before.end, after.end);
});

/* ── DST: the day is as long as it actually was ──────────────────────────── */

const hours = (w) => (Date.parse(w.end) - Date.parse(w.start)) / 3600000;

test("a spring-forward day is 23 hours", () => {
  // 2026-03-08: US DST begins, 02:00 local never happens.
  const w = civilDayWindow({ at: new Date("2026-03-08T20:00:00Z"), timeZone: LA });
  assert.equal(w.day, "2026-03-08");
  assert.equal(hours(w), 23, "start + 24h would have run an hour past the day");
});

test("a fall-back day is 25 hours", () => {
  // 2026-11-01: US DST ends, 01:00 local happens twice.
  const w = civilDayWindow({ at: new Date("2026-11-01T20:00:00Z"), timeZone: LA });
  assert.equal(w.day, "2026-11-01");
  assert.equal(hours(w), 25, "start + 24h would have clipped an hour off the day");
});

test("an ordinary day is 24 hours", () => {
  assert.equal(hours(civilDayWindow({ at: new Date("2026-09-13T20:00:00Z"), timeZone: LA })), 24);
});

test("the boundaries of a DST day still contain it", () => {
  const w = civilDayWindow({ at: new Date("2026-11-01T20:00:00Z"), timeZone: LA });
  assert.equal(civilDayInZone(new Date(Date.parse(w.start)), LA), "2026-11-01", "first instant is in the day");
  assert.equal(civilDayInZone(new Date(Date.parse(w.end) - 1), LA), "2026-11-01", "last instant is in the day");
  assert.equal(civilDayInZone(new Date(Date.parse(w.end)), LA), "2026-11-02", "the end belongs to the next day");
});

/* ── refusal, never a guess ──────────────────────────────────────────────── */

test("an invalid timezone refuses instead of degrading to UTC", () => {
  assert.equal(isValidTimezone("Mars/Olympus"), false);
  const r = resolveCivilDayWindow({ timeZone: "Mars/Olympus" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "timezone_invalid");
  assert.throws(() => civilDayWindow({ timeZone: "Mars/Olympus" }), RangeError);
});

test("an unset timezone is answered, not guessed", () => {
  const r = resolveCivilDayWindow({ timeZone: null });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "timezone_not_configured");
  assert.equal(r.setting, "VACILANDO_REPORT_TIMEZONE");
  assert.equal(r.day, undefined, "a refusal must not carry a day it could not name");
});

test("there is no host-zone fallback anywhere in the primitive", () => {
  const s = src("vacilando/civil-day.mjs");
  assert.doesNotMatch(s, /resolvedOptions\(\)\.timeZone/,
    "reading the host zone would make 'wherever this Mac is' a product contract");
});

/* ── every *_today in one response means one day ─────────────────────────── */

test("the dashboard resolves the civil day ONCE per response", () => {
  const s = src("vacilando-server.mjs");
  const route = s.slice(s.indexOf('if (path === "/api/dashboard")'));
  const body = route.slice(0, route.indexOf('\n    if (path === "'));
  assert.equal((body.match(/resolveCivilDayWindow\(/g) || []).length, 1,
    "five counters calling Date.now() independently is how they drift apart at midnight");
  assert.doesNotMatch(body, /toISOString\(\)\.slice\(0, 10\)/, "no UTC day key in the dashboard");
  for (const f of ["commands_today", "succeeded_today", "failed_today", "reviews_resolved_today", "interventions_today"]) {
    assert.match(body, new RegExp(`${f}: countedToday\\(`), `${f} must count inside the shared window`);
  }
});

test("the dashboard publishes the day its counters mean", () => {
  const s = src("vacilando-server.mjs");
  assert.match(s, /civil_day\s*=\s*dayKnown/, "the window must be inspectable, not implied");
  assert.match(s, /window_start: civilDay\.start/);
  assert.match(s, /window_end: civilDay\.end/);
});

test("usage counts inside the window it is GIVEN, not one of its own", () => {
  const s = src("vacilando/usage.mjs");
  assert.match(s, /export function collectUsage\(\{ civilDay = null \} = \{\}\)/,
    "the caller's window must be accepted");
  assert.match(s, /withinCivilDay\(win, r\.occurred_at\)/);
  assert.doesNotMatch(s, /slice\(0, 10\) === today/, "no date-prefix comparison");
});

test("an unnameable day yields null counters, never zero", () => {
  const s = src("vacilando/usage.mjs");
  assert.match(s, /calls_today: dayKnown \? b\.calls_today : null/);
  assert.match(s, /total_calls_today: dayKnown \?/);
  // Zero would assert a measured quiet day. Null says the day has no name yet.
});

test("withinCivilDay is half-open and rejects unparseable stamps", () => {
  const w = civilDayWindow({ at: new Date("2026-09-13T20:00:00Z"), timeZone: LA });
  assert.equal(withinCivilDay(w, w.start), true, "the first instant is inside");
  assert.equal(withinCivilDay(w, w.end), false, "the end belongs to the next day");
  assert.equal(withinCivilDay(w, null), false);
  assert.equal(withinCivilDay(w, "not a date"), false);
});

/* ── the report did not move ─────────────────────────────────────────────── */

test("REGRESSION: the 2026-09-13 Pacific daily window is unchanged", () => {
  const w = operatingReportWindow("daily", new Date("2026-09-14T00:30:00Z"), { timeZone: LA });
  assert.equal(w.day, "2026-09-13");
  assert.equal(w.windowStart, "2026-09-13T07:00:00.000Z");
  assert.equal(w.windowEnd, "2026-09-14T07:00:00.000Z");
  assert.equal(w.timezone, LA);
});

test("REGRESSION: the weekly window is still seven civil days", () => {
  const w = operatingReportWindow("weekly", new Date("2026-09-14T00:30:00Z"), { timeZone: LA });
  assert.equal(w.windowStart, "2026-09-07T07:00:00.000Z");
  assert.equal(w.windowEnd, "2026-09-14T07:00:00.000Z");
  assert.equal((Date.parse(w.windowEnd) - Date.parse(w.windowStart)) / 3600000, 168);
});

test("REGRESSION: report identity did not change because helper code moved", () => {
  const w = operatingReportWindow("daily", new Date("2026-09-14T00:30:00Z"), { timeZone: LA });
  const r = buildOperatingReport({
    kind: "daily", windowStart: w.windowStart, windowEnd: w.windowEnd,
    timezone: w.timezone, day: w.day,
  });
  // Pinned: this is the id the pre-extraction code produced for this window.
  assert.equal(r.report_id, reportId({ kind: "daily", windowStart: w.windowStart, windowEnd: w.windowEnd }));
  assert.equal(r.report_id, "vrep_f8c9a30127dc",
    "a moved helper must not silently give today a second report file");
});

test("the report delegates rather than keeping a second copy of the math", () => {
  const s = src("vacilando/operating-report.mjs");
  assert.match(s, /from "\.\/civil-day\.mjs"/);
  assert.doesNotMatch(s, /function zonedDayStart/, "the extracted helper must not survive as a copy");
  assert.doesNotMatch(s, /function offsetMsAt/);
});

test("shiftCivilDay crosses months and years without a zone", () => {
  assert.equal(shiftCivilDay("2026-09-13", 1), "2026-09-14");
  assert.equal(shiftCivilDay("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftCivilDay("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftCivilDay("2026-11-01", -6), "2026-10-26");
});

/* ── a day is counted, not sampled ───────────────────────────────────────── */

/*
 * The second half of the same defect. These counters filtered a 300-event tail
 * for "today", so the number saturated at 300 and was presented as a day total.
 * Fixing the timezone alone would have left a right window over a truncated
 * read - measured on the live host: 2344 audit events in the Pacific day, of
 * which a 300-tail could show at most 300.
 */
{
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");

  const root = mkdtempSync(join(tmpdir(), "civil-day-counts-"));
  mkdirSync(join(root, "vacilando"), { recursive: true });
  const prevRoot = process.env.ALLOY_RUNTIME_ROOT;
  process.env.ALLOY_RUNTIME_ROOT = root;

  const win = civilDayWindow({ at: new Date("2026-09-13T20:00:00Z"), timeZone: LA });
  const at = (iso, outcome) => JSON.stringify({ occurred_at: iso, outcome });
  const lines = [];
  // 400 events inside the Pacific day - more than any tail would have shown.
  for (let i = 0; i < 400; i++) {
    lines.push(at(new Date(win.startMs + 1000 + i * 1000).toISOString(), i % 4 === 0 ? "succeeded" : "other"));
  }
  // One just before the window and one just after: neither is today.
  lines.unshift(at(new Date(win.startMs - 1000).toISOString(), "succeeded"));
  lines.push(at(new Date(win.endMs + 1000).toISOString(), "failed"));
  // A corrupt line must not stop the count.
  lines.splice(50, 0, "{not json");
  writeFileSync(join(root, "vacilando", "audit.jsonl"), lines.join("\n") + "\n");

  const { countAuditEventsInWindow } = await import("../lib/vacilando/commands/audit.mjs");

  test("a day is counted in full, not sampled from a tail", () => {
    const c = countAuditEventsInWindow({ startMs: win.startMs, endMs: win.endMs });
    assert.equal(c.total, 400, "a 300-event tail would have reported 300 and looked plausible");
    assert.equal(c.succeeded, 100);
    assert.equal(c.complete, true);
  });

  test("events outside the civil day are not today", () => {
    const c = countAuditEventsInWindow({ startMs: win.startMs, endMs: win.endMs });
    assert.equal(c.failed, 0, "the event after the window must not count");
    assert.equal(c.total, 400, "nor the one before it");
  });

  test("the scan is bounded by the day, not by history", () => {
    const c = countAuditEventsInWindow({ startMs: win.startMs, endMs: win.endMs });
    assert.ok(c.scanned <= 403, `stopped at the window edge, scanned ${c.scanned}`);
  });

  test("a count that hits its bound SAYS it is partial", () => {
    const c = countAuditEventsInWindow({ startMs: win.startMs, endMs: win.endMs, scanCap: 10 });
    assert.equal(c.complete, false, "a floor presented as a total is the same defect again");
    assert.ok(c.total < 400);
  });

  test("an unusable window counts nothing and admits it", () => {
    const c = countAuditEventsInWindow({ startMs: NaN, endMs: NaN });
    assert.equal(c.total, 0);
    assert.equal(c.complete, false);
  });

  test("the dashboard counts the day rather than filtering a tail", () => {
    const d = src("vacilando-server.mjs");
    const route = d.slice(d.indexOf('if (path === "/api/dashboard")'));
    const body = route.slice(0, route.indexOf('\n    if (path === "'));
    assert.match(body, /countAuditEventsInWindow\(\{ startMs: civilDay\.startMs/);
    assert.match(body, /countReviewsInWindow\(\{ startMs: civilDay\.startMs/);
    assert.doesNotMatch(body, /audit\.filter\(/, "filtering the 300-tail is what under-counted the day");
    assert.match(body, /counts_complete:/, "the payload must be able to admit a partial count");
  });

  if (prevRoot === undefined) delete process.env.ALLOY_RUNTIME_ROOT;
  else process.env.ALLOY_RUNTIME_ROOT = prevRoot;
  rmSync(root, { recursive: true, force: true });
}

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
