#!/usr/bin/env node
/**
 * A SCHEDULE, ON A CLOCK SOMEONE CHOSE, RIDING A TIMER THAT ALREADY EXISTS.
 *
 * Three things had to be true and none of them was obvious:
 *
 *   - THERE IS NO HOST TIMER. The machine has exactly one launchd entry for
 *     Vacilando and it is a KeepAlive daemon with no schedule. The only periodic
 *     owner is the steward, every five minutes inside the Gateway, whose own
 *     comment says it is wired into the timers the server already owns "rather
 *     than a second scheduler". So that is where this rides.
 *
 *   - THERE IS NO CANONICAL TIMEZONE. Not in the alloy-dev config, not anywhere
 *     in the library. Defaulting to the host's would quietly make "wherever this
 *     Mac happens to be" a product contract, and the day the fleet moves or a
 *     second host appears the reports would silently change which day they
 *     describe. So it is required and explicit, and unset is reported rather
 *     than guessed.
 *
 *   - NOT_DUE IS THE ANSWER 287 TIMES OUT OF 288. It is an outcome, not a
 *     fault, and a report that fails to write is recorded rather than raised.
 */
import assert from "node:assert/strict";

import {
  OPERATING_REPORT_SCHEDULE, reportIsDue, resolveReportTimezone,
  runDueOperatingReports, reportId,
} from "../lib/vacilando/operating-report.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}
async function atest(name, fn) {
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const TZ = "America/Los_Angeles";
// 2026-09-13 is a Sunday. 18:30 Pacific is 01:30Z the next day.
const at = (iso) => new Date(iso);

/* ── TIMEZONE ────────────────────────────────────────────────────────────── */

test("T1. THE STOP CONDITION: no configured timezone means no cadence, not a guess", () => {
  const out = reportIsDue("daily", new Date(), { timeZone: null });
  assert.equal(out.due, false);
  assert.equal(out.reason, "timezone_not_configured");
  assert.equal(out.setting, "VACILANDO_REPORT_TIMEZONE", "and it names the one setting needed");
});

test("T2. an unusable timezone is refused, not silently replaced", () => {
  const out = reportIsDue("daily", new Date(), { timeZone: "Mars/Olympus" });
  assert.equal(out.due, false);
  assert.equal(out.reason, "timezone_invalid");
});

test("T3. the setting is read from the environment, and absence is null", () => {
  assert.equal(resolveReportTimezone({}), null);
  assert.equal(resolveReportTimezone({ VACILANDO_REPORT_TIMEZONE: "  " }), null);
  assert.equal(resolveReportTimezone({ VACILANDO_REPORT_TIMEZONE: TZ }), TZ);
});

test("T4. the cadence is evaluated in the CONFIGURED zone, not the host's", () => {
  // 01:30Z on the 14th is 18:30 on the 13th in Pacific. A host on UTC would
  // call this the wrong day AND the wrong hour.
  const due = reportIsDue("daily", at("2026-09-14T01:30:00Z"), { timeZone: TZ });
  assert.equal(due.due, true, JSON.stringify(due));
  assert.equal(due.timezone, TZ);
  const utc = reportIsDue("daily", at("2026-09-14T01:30:00Z"), { timeZone: "UTC" });
  assert.equal(utc.due, false, "the same instant is not due in another zone");
});

/* ── CADENCE ─────────────────────────────────────────────────────────────── */

test("T5. daily 18:30, weekly Sunday 18:30", () => {
  assert.equal(OPERATING_REPORT_SCHEDULE.daily.hour, 18);
  assert.equal(OPERATING_REPORT_SCHEDULE.daily.minute, 30);
  assert.deepEqual([...OPERATING_REPORT_SCHEDULE.weekly.days], [0]);
  // Sunday 18:30 Pacific.
  assert.equal(reportIsDue("weekly", at("2026-09-14T01:30:00Z"), { timeZone: TZ }).due, true);
  // Monday, same wall time.
  assert.equal(reportIsDue("weekly", at("2026-09-15T01:30:00Z"), { timeZone: TZ }).due, false);
});

test("T6. a five-minute cadence cannot miss a thirty-minute window", () => {
  // Every steward cycle inside the window answers due; the one before does not.
  for (const m of [30, 35, 40, 55, 59]) {
    const d = reportIsDue("daily", at(`2026-09-14T01:${String(m).padStart(2, "0")}:00Z`), { timeZone: TZ });
    assert.equal(d.due, true, `18:${m} must be inside the window`);
  }
  assert.equal(reportIsDue("daily", at("2026-09-14T01:29:00Z"), { timeZone: TZ }).due, false);
  assert.equal(reportIsDue("daily", at("2026-09-14T02:05:00Z"), { timeZone: TZ }).due, false);
});

/* ── IDEMPOTENCY ─────────────────────────────────────────────────────────── */

await atest("T7. THE PROPERTY THAT MATTERS: many evaluations, one report", async () => {
  /*
   * Six steward cycles fall inside a thirty-minute window. Identity is derived
   * from the WINDOW, so all six resolve to one report and rewrite one file.
   */
  const written = [];
  const build = (kind) => ({ report_id: reportId({ kind, windowStart: "A", windowEnd: "B" }), kind });
  const write = (r) => { written.push(r.report_id); return `/tmp/${r.report_id}.json`; };
  for (const m of [30, 35, 40, 45, 50, 55]) {
    await runDueOperatingReports({
      now: at(`2026-09-14T01:${m}:00Z`), build, write, kinds: ["daily"], timeZone: TZ,
    });
  }
  assert.equal(written.length, 6, "every cycle in the window did run");
  assert.equal(new Set(written).size, 1, "and all six wrote the SAME report");
});

await atest("T8. NOT_DUE writes nothing and is not a failure", async () => {
  let wrote = false;
  const out = await runDueOperatingReports({
    now: at("2026-09-14T10:00:00Z"), timeZone: TZ,
    build: () => ({ report_id: "x" }), write: () => { wrote = true; return "x"; },
  });
  assert.equal(wrote, false);
  for (const r of out.results) {
    assert.equal(r.ran, false);
    assert.equal(r.error, undefined, "not due is an outcome, never an error");
  }
});

await atest("T9. a failing report is recorded, and does not throw", async () => {
  // An end-of-day report that cannot be written is not a reason to interrupt
  // anybody's development.
  const out = await runDueOperatingReports({
    now: at("2026-09-14T01:30:00Z"), timeZone: TZ,
    build: () => { throw new Error("disk is full"); },
    write: () => "unused",
    kinds: ["daily"],
  });
  const daily = out.results[0];
  assert.equal(daily.ran, false);
  assert.equal(daily.error, "report_failed");
  assert.match(daily.detail, /disk is full/, "and it says what went wrong");
});

/* ── THE OWNER ───────────────────────────────────────────────────────────── */

test("T10. the steward owns it, and no second scheduler was introduced", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../lib/vacilando/host-steward-run.mjs", import.meta.url), "utf8");
  assert.match(src, /runOperatingReportStage/, "the existing cycle runs the due check");
  assert.match(src, /runDueOperatingReports/);
  assert.doesNotMatch(src, /setInterval|setTimeout\(/, "the steward must not grow a timer of its own");
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
