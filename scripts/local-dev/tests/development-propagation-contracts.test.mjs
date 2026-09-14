#!/usr/bin/env node
/**
 * THE FINAL CONSUMER, NOT THE PRODUCER.
 *
 * Five times in one day a value was produced correctly and did not arrive:
 *
 *   1. the toolkit convergence block, dropped by an explicit result field list
 *   2. the S6 wait envelope, dropped by the run writer's own allowlist
 *   3. the governed terminal outcome, never projected onto the run at all
 *   4. the operating-report stage, run outside the record that proves it ran
 *   5. the same stage, then placed behind a branch normal ticks never reach
 *
 * Every one of them had a passing test at the PRODUCER. None had a test that
 * followed the value through the real serializer, writer or branch to the thing
 * that actually reads it. That is the gap these lock.
 *
 * "Defined and imported and tested" does not mean "reached". "Returned by the
 * producer" does not mean "present in the result".
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { operatingReportWindow } from "../lib/vacilando/operating-report.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}
const lib = (f) => readFileSync(new URL(`../lib/vacilando/${f}`, import.meta.url), "utf8");

/* ── BOUNDARY 1: trusted-host producer -> action.result ──────────────────── */

test("P1. every field the install producer returns reaches the action result", () => {
  /*
   * The convergence defect, generalised. `action.result` is an explicit list,
   * which is legitimate - secrets must not pass - but it means a new producer
   * field arrives nowhere until someone edits this list. So the list is checked
   * AGAINST the producer rather than admired on its own.
   */
  const conv = lib("toolkit-convergence.mjs");
  const exec = lib("trusted-host-actions.mjs");
  // Anchored on executeToolkitInstall specifically. An earlier version matched a
  // convergence-STATUS view further up the file and compared the action result
  // against the wrong producer entirely - a test can point at the wrong thing
  // just as easily as a serializer can drop the right one.
  const fn = conv.slice(conv.indexOf("export function executeToolkitInstall"));
  const produced = fn.slice(fn.indexOf("const gw = observeGatewayExecution"));
  // The `};` must be found AFTER the return, not before it: the convergence
  // block is declared above and closes with the same two characters, so a naive
  // indexOf sliced backwards and found nothing at all.
  const from = produced.indexOf("return {");
  const returned = produced.slice(from, produced.indexOf("};", from));
  const fields = [...returned.matchAll(/^\s{4}([a-z_]+):/gm)].map((m) => m[1]);
  assert.ok(fields.length >= 7, `expected the producer's field list, found ${fields.length}`);

  const block = exec.slice(exec.indexOf("installed_sha: out.installed_sha"));
  const result = block.slice(0, block.indexOf("};"));
  const missing = fields.filter((f) => f !== "ok" && !result.includes(`${f}:`));
  assert.deepEqual(missing, [],
    `the install producer returns ${missing.join(", ")} and the result does not carry it`);
});

test("P2. the reconciliation executor's provenance reaches the governed result", () => {
  // Boundary: runRegisteredReconciliation -> fulfil leg -> completeTrustedAction.
  const exec = lib("trusted-host-actions.mjs");
  const block = exec.slice(exec.indexOf("reconciliation_key: out.reconciliation_key"));
  const result = block.slice(0, block.indexOf("}, { nowMs })"));
  for (const field of ["dry_run", "exit_code", "counts", "provenance", "stdout_tail"]) {
    assert.match(result, new RegExp(`${field}:`), `the result must carry ${field}`);
  }
  // And a FAILURE must carry it too - that is the case that needs it most.
  const failLeg = exec.slice(exec.indexOf("return failTrustedAction(action, out.error"));
  assert.match(failLeg.slice(0, 400), /provenance/, "a failed reconciliation must still say where it ran");
});

/* ── BOUNDARY 2: wait descriptor -> run record -> Governor ───────────────── */

test("P3. the machine wait reason survives the run writer's allowlist", () => {
  /*
   * `waitProjection` builds a correct descriptor and the writer rebuilt
   * resource_wait from a presentation allowlist with no `reason` in it. The
   * Governor then read the stored wait and failed the run.
   */
  const run = lib("execution-run.mjs");
  const block = run.slice(run.indexOf('if (to === "WAITING_RESOURCE")'));
  const written = block.slice(0, block.indexOf("} else if"));
  for (const field of ["reason", "bound_policy", "resolution_state", "owner", "waiting_since"]) {
    assert.match(written, new RegExp(`${field}:`), `the stored wait must keep ${field}`);
  }
  // And an undeclared reason must not be stored as though it were declared.
  assert.match(written, /isDeclaredWaitReason/, "an unknown reason stays unknown");
});

test("P4. leaving a wait resolves it rather than leaving it 'waiting'", () => {
  const run = lib("execution-run.mjs");
  const exit = run.slice(run.indexOf('} else if (to !== "WAITING_RESOURCE" && from === "WAITING_RESOURCE")'));
  const body = exit.slice(0, exit.indexOf("\n  }"));
  assert.match(body, /resolution_state: "resolved"/);
  assert.match(body, /resolved_at/);
  // Resolved, not erased: the forensic record has to survive a terminal failure.
  assert.doesNotMatch(body, /found\.resource_wait = null/, "the evidence must not be deleted");
});

/* ── BOUNDARY 3: governed terminal -> run projection ─────────────────────── */

test("P5. a terminal governed action projects onto its run, success and failure", () => {
  const gov = lib("governed-action-request.mjs");
  // Success: the completion path patches the run and stamps visibility.
  const complete = gov.slice(gov.indexOf('rec.status = "complete"'));
  const window = complete.slice(0, 4000);
  assert.match(window, /patchRunFields\(rec\.run_id, \{ governed_action/, "success must project");
  assert.match(window, /stampDecisionTimingOnce\(rec, "projection_visible_at"\)/);
  // Failure: a refusal is a settlement, and it is what an operator most needs.
  const failure = gov.slice(gov.indexOf("function releaseRunAfterGovernedFailure"));
  const fwin = failure.slice(0, 2600);
  assert.match(fwin, /patchRunFields\(rec\.run_id, \{ governed_action: pub \}/);
  assert.match(fwin, /stampDecisionTimingOnce\(rec, "projection_visible_at"\)/);
});

/* ── BOUNDARY 4: canonical state -> the API the surfaces read ────────────── */

test("P6. the lane payload carries the canonical operator state", () => {
  const api = lib("v2-api.mjs");
  const route = api.slice(api.indexOf('if (path === "/api/v2/lanes"'));
  const body = route.slice(0, route.indexOf('if (path === "/api/v2/lane-folders"'));
  assert.match(body, /attachLaneOperatingState|attachLaneOperatorState/, "the route asks the canonical producer");
  // And decides nothing itself.
  assert.doesNotMatch(body, /awaiting_operator/);
  assert.doesNotMatch(body, /NEEDS_INPUT/);
});

/* ── BOUNDARY 5: periodic stage -> durable evidence, and REACHABILITY ────── */

test("P7. THE CLASS: the report stage is above every gate that is not its own", () => {
  /*
   * Placed wrongly twice. Its contract needs a runtime root and nothing else -
   * not hygiene being due, not a healthy control plane. An operator wants the
   * report MOST on the day the control plane was unwell, which is exactly when
   * a health gate would have removed it.
   */
  const src = lib("host-steward-run.mjs");
  const stage = src.indexOf("runOperatingReportStage({ root, nowMs })");
  const hygieneGate = src.indexOf("if (!hygiene || !root) return");
  const recoveryGate = src.indexOf("if (recoveryBlocking) {");
  const hygieneDue = src.indexOf("const due = forceHygiene");
  assert.ok(stage > 0 && hygieneGate > 0 && recoveryGate > 0 && hygieneDue > 0, "landmarks present");
  assert.ok(stage < hygieneGate, "must run before the hygiene:false gate");
  assert.ok(stage < recoveryGate, "must run before the control-plane health gate");
  assert.ok(stage < hygieneDue, "must run before the hygiene-due branch");
});

test("P8. and every path that records an outcome records the cadence with it", () => {
  // A stage that ran and left no evidence is indistinguishable from one that
  // did not run. Three recorders, three records.
  const src = lib("host-steward-run.mjs");
  const recorders = [...src.matchAll(/recordStageOutcome\(\{[\s\S]{0,400}?\} \}\);/g)].map((m) => m[0]);
  const outcomeRecorders = recorders.filter((r) => r.includes("ok: true"));
  assert.ok(outcomeRecorders.length >= 3, `expected the success recorders, found ${outcomeRecorders.length}`);
  for (const r of outcomeRecorders) {
    assert.match(r, /reports: reportsSummary\(reports\)/, `a success path records no cadence:\n${r.slice(0, 160)}`);
  }
});

test("P9. a governed FAILURE leaves the wait readable, resolved, not deleted", () => {
  /*
   * The last case of the older "terminal failure erases resource_wait" debt.
   * The failure path nulled the wait immediately after the transition had
   * marked it resolved - so on the one path where an operator most wants to
   * know what the run was waiting for, the evidence was removed a line after
   * being preserved.
   *
   * The resolved-wait contract already prevents the thing clearing was for: a
   * run that has left a wait cannot carry an ACTIVE one.
   */
  const gov = lib("governed-action-request.mjs");
  const fn = gov.slice(gov.indexOf("function releaseRunAfterGovernedFailure"));
  const body = fn.slice(0, fn.indexOf("\nfunction "));
  assert.match(body, /transitionExecutionRun\(rec\.run_id, "NEEDS_INPUT"/, "it still leaves the wait");
  assert.doesNotMatch(body, /patchRunResourceWait\(rec\.run_id, null/,
    "and must not delete the record it just resolved");
});

/* ── BOUNDARY 10: configured report zone -> the window the report describes ─ */

/*
 * Instance seven, and the only one found while auditing rather than while
 * debugging. VACILANDO_REPORT_TIMEZONE was resolved correctly and honoured by
 * the CADENCE - the daily report fired at 18:30 Pacific exactly as designed.
 * Both callers then derived the WINDOW themselves in UTC, where 18:30 Pacific
 * is already the next day. Produced, not carried, and the consumer behaved as
 * though no zone had ever been set.
 *
 * These assert the window a report covers, not the way it is computed, so they
 * survive the next refactor of how.
 */
const TZ = "America/Los_Angeles";
// 18:30 PDT on 2026-09-12 - the cadence instant, already tomorrow in UTC.
const FIRES_AT = new Date("2026-09-13T01:30:00.000Z");

test("P10 the daily window is the configured zone's day, not UTC's", () => {
  const w = operatingReportWindow("daily", FIRES_AT, { timeZone: TZ });
  assert.equal(w.day, "2026-09-12", "the day being reported on is the local day");
  assert.notEqual(w.day, FIRES_AT.toISOString().slice(0, 10),
    "and is precisely NOT the UTC day, which is the defect");
  assert.equal(w.windowStart, "2026-09-12T07:00:00.000Z", "local midnight, resolved in zone");
  assert.equal(w.windowEnd, "2026-09-13T07:00:00.000Z");
});

test("P10 the instant the report fires is inside the window it reports", () => {
  const w = operatingReportWindow("daily", FIRES_AT, { timeZone: TZ });
  assert.ok(FIRES_AT.toISOString() > w.windowStart && FIRES_AT.toISOString() < w.windowEnd,
    `18:30 local must fall inside its own day, got ${w.windowStart}..${w.windowEnd}`);
  // The pre-fix window started at 17:00 local the same evening: 90 minutes.
  const hours = (Date.parse(w.windowEnd) - Date.parse(w.windowStart)) / 3600000;
  assert.equal(hours, 24, "a daily report covers a day");
});

test("P10 the weekly window is seven local days ending with the reported day", () => {
  const w = operatingReportWindow("weekly", FIRES_AT, { timeZone: TZ });
  assert.equal(w.day, "2026-09-12");
  assert.equal(w.windowStart, "2026-09-06T07:00:00.000Z");
  assert.equal(w.windowEnd, "2026-09-13T07:00:00.000Z");
});

test("P10 a DST day is its real length, not a fixed 24 hours", () => {
  // 2026-11-01 is the US fall-back: a 25-hour local day. A start+24h window
  // would have stopped an hour before the day did.
  const w = operatingReportWindow("daily", new Date("2026-11-02T01:30:00.000Z"), { timeZone: TZ });
  assert.equal(w.day, "2026-11-01");
  const hours = (Date.parse(w.windowEnd) - Date.parse(w.windowStart)) / 3600000;
  assert.equal(hours, 25, "the window is as long as the day actually was");
});

test("P10 no caller derives a report day from UTC any more", () => {
  for (const [name, src] of [
    ["host-steward-run.mjs", lib("host-steward-run.mjs")],
    ["vac-operating-report.mjs", readFileSync(new URL("../vac-operating-report.mjs", import.meta.url), "utf8")],
  ]) {
    assert.match(src, /operatingReportWindow\(/, `${name} must ask the owner for its window`);
    assert.doesNotMatch(src, /const (day|start) = .*toISOString\(\)\.slice\(0, 10\)/,
      `${name} must not compute a report day in UTC`);
    assert.doesNotMatch(src, /T00:00:00\.000Z/,
      `${name}: midnight of a local day key is not midnight UTC`);
  }
});

test("P10 no zone configured is a non-answer, never a UTC guess", () => {
  assert.equal(operatingReportWindow("daily", FIRES_AT, { timeZone: null }), null,
    "silently falling back to UTC is how this defect would come back");
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
