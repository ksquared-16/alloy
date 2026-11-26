#!/usr/bin/env node
/**
 * TWO THINGS THAT WERE TRUE BUT NOT OBSERVABLE, AND ONE THAT WAS OBSERVED WRONG.
 *
 * `stale_run_closed` is returned by the pre-send reconciler and rendered as a
 * notice, then forgotten. Twice I tried to confirm the lifecycle repair by
 * counting that phrase inside execution-run records and reported a live
 * positive. The matches were PROSE — a run's own instruction text, and the
 * agent report quoting it. No such field is persisted on a run, so what I
 * measured was my own writing. These cases make the decision readable as data,
 * and pin that it is never inferred from text.
 *
 * The impact-discovery tool reported WORKFLOW names while a check run lists JOB
 * names, which made a correct prediction look like a miss and put that false
 * conclusion in a mission report. It now reports both.
 *
 * And three host-integration suites have been triaged three times to the same
 * conclusion — they need host state, not code — with the finding lost each
 * time because nothing in the repository said so.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SEND_LIFECYCLE_SCHEMA, lastSendDecisionForLane, readSendLifecycleDecisions,
  recordSendLifecycleDecision, sendLifecycleLogPath,
} from "../lib/vacilando/send-lifecycle-log.mjs";
import {
  HOST_PREREQUISITES, PREREQUISITE_STATUS, TIER,
  blockedPrerequisiteReport, checkHostPrerequisites, prerequisiteFor,
} from "../lib/vacilando/host-prerequisites.mjs";
import { discoverImpact, workflowJobs } from "../lib/vacilando/impact-discovery.mjs";
import { LIFECYCLE_PHASES } from "../lib/vacilando/run-lifecycle.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const LIB = `${ROOT}/scripts/local-dev/lib/vacilando`;
const tmproot = () => mkdtempSync(join(tmpdir(), "vac-obs-"));

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/* ── WS1: the decision is data ────────────────────────────────────────────── */

test("A — a legitimate RESTING run records stale_run_closed = false", () => {
  const root = tmproot();
  recordSendLifecycleDecision({
    laneId: "lane_a", runId: "erun_a", phase: LIFECYCLE_PHASES.RESTING,
    phaseReason: "between_governed_steps", staleRunClosed: false,
    reason: "RESTING is not stale", root,
  });
  const row = lastSendDecisionForLane("lane_a", { root });
  assert.equal(row.stale_run_closed, false);
  assert.equal(row.prior_phase, LIFECYCLE_PHASES.RESTING);
  assert.equal(row.prior_phase_reason, "between_governed_steps");
});

test("B — a genuinely STRANDED run records stale_run_closed = true", () => {
  const root = tmproot();
  recordSendLifecycleDecision({
    laneId: "lane_b", runId: "erun_b", phase: LIFECYCLE_PHASES.STRANDED,
    phaseReason: "resting_without_session", staleRunClosed: true,
    reason: "STRANDED (resting_without_session)", root,
  });
  const row = lastSendDecisionForLane("lane_b", { root });
  assert.equal(row.stale_run_closed, true);
  assert.equal(row.prior_phase, LIFECYCLE_PHASES.STRANDED);
});

test("C — the answer is structured, never a substring of prose", () => {
  const root = tmproot();
  // The exact trap: a run whose INSTRUCTION talks about stale_run_closed.
  recordSendLifecycleDecision({
    laneId: "lane_c", runId: "erun_c", phase: LIFECYCLE_PHASES.RESTING,
    staleRunClosed: false, reason: "a note mentioning stale_run_closed in prose", root,
  });
  const raw = readFileSync(sendLifecycleLogPath(root), "utf8");
  assert.ok(raw.includes("stale_run_closed"), "the phrase appears twice — as a field AND inside prose");
  const row = lastSendDecisionForLane("lane_c", { root });
  assert.equal(row.stale_run_closed, false,
    "the field is read, so prose mentioning the phrase cannot change the answer");
  assert.equal(typeof row.stale_run_closed, "boolean", "a boolean, not a count of matches");
});

test("C2 — rows carry every dimension the question needs", () => {
  const root = tmproot();
  recordSendLifecycleDecision({ laneId: "lane_d", runId: "erun_d", phase: "RESTING", staleRunClosed: false, root });
  const row = lastSendDecisionForLane("lane_d", { root });
  for (const k of ["schema_version", "at", "lane_id", "run_id", "prior_phase", "stale_run_closed"]) {
    assert.ok(Object.prototype.hasOwnProperty.call(row, k), `missing ${k}`);
  }
  assert.equal(row.schema_version, SEND_LIFECYCLE_SCHEMA);
  assert.match(row.at, /^\d{4}-\d{2}-\d{2}T/);
});

test("D — telemetry cannot change lifecycle behaviour", () => {
  // An unwritable root must produce a failed WRITE, never a thrown send.
  const r = recordSendLifecycleDecision({ laneId: "x", root: "/proc/definitely/not/writable" });
  assert.equal(r.ok, false, "the write fails");
  assert.ok(r.entry, "and the entry is still returned rather than lost in a throw");
  const src = readFileSync(`${LIB}/execution-stale.mjs`, "utf8");
  const call = src.slice(src.indexOf("recordSendLifecycleDecision"));
  assert.match(call.slice(0, 600), /catch \{[^}]*\}/,
    "the call site must swallow: telemetry may never turn a send into a refusal");
});

test("D2 — the decision is recorded at the one place that makes it", () => {
  const src = readFileSync(`${LIB}/execution-stale.mjs`, "utf8");
  const record = src.indexOf("recordSendLifecycleDecision");
  const ret = src.indexOf("return result;");
  assert.ok(record > 0 && ret > record, "recorded before the result is returned, in reconcileLaneBeforeSend");
  assert.match(src, /phase: priorPhase/, "and the phase is the one captured BEFORE the close");
});

test("D3 — lane filtering keeps one lane's answer out of another's", () => {
  const root = tmproot();
  recordSendLifecycleDecision({ laneId: "lane_e", runId: "1", staleRunClosed: true, root });
  recordSendLifecycleDecision({ laneId: "lane_f", runId: "2", staleRunClosed: false, root });
  assert.equal(readSendLifecycleDecisions({ laneId: "lane_e", root }).length, 1);
  assert.equal(lastSendDecisionForLane("lane_f", { root }).stale_run_closed, false);
});

/* ── WS3: workflow AND job ────────────────────────────────────────────────── */

test("E — THE SPECIMEN: web-typecheck declares the job CI actually shows", () => {
  const jobs = workflowJobs(readFileSync(`${ROOT}/.github/workflows/web-typecheck.yml`, "utf8"));
  const names = jobs.map((j) => j.name);
  assert.ok(names.includes("Full graph (tests + scripts)"),
    "this is the check whose absence from a workflow-level prediction was mistaken for a miss");
  assert.ok(names.includes("Production graph"));
  assert.notDeepEqual(names, ["Web typecheck"], "a workflow name is not a check name");
});

test("E2 — a job's display name wins over its id", () => {
  const jobs = workflowJobs([
    "name: W", "on:", "  pull_request:", "jobs:",
    "  typecheck-tests:", "    name: Full graph (tests + scripts)", "    runs-on: ubuntu-latest",
  ].join("\n"));
  assert.equal(jobs[0].id, "typecheck-tests");
  assert.equal(jobs[0].name, "Full graph (tests + scripts)");
});

test("E3 — a job with no name falls back to its id, not to nothing", () => {
  const jobs = workflowJobs(["jobs:", "  build:", "    runs-on: ubuntu-latest"].join("\n"));
  assert.deepEqual(jobs.map((j) => j.name), ["build"]);
});

test("E4 — a conditional job is reported as conditional, not as certain", () => {
  const jobs = workflowJobs([
    "jobs:", "  maybe:", "    if: github.event_name == 'push'", "    runs-on: ubuntu-latest",
  ].join("\n"));
  assert.equal(jobs[0].conditional, true);
  assert.match(jobs[0].condition, /github.event_name/);
});

test("E5 — discoverImpact reports workflows AND jobs", () => {
  const out = discoverImpact(ROOT, { paths: ["web/scripts/anything.ts"] });
  assert.ok(Array.isArray(out.expected_workflows) && out.expected_workflows.length);
  assert.ok(Array.isArray(out.expected_jobs) && out.expected_jobs.length);
  assert.ok(out.expected_jobs.some((j) => j.check_name === "Full graph (tests + scripts)"),
    "the specimen must be predicted when its workflow is selected");
  for (const j of out.expected_jobs) {
    assert.ok(j.workflow && j.check_name, "every job row must name its workflow and its check");
  }
});

test("E6 — a workflow that does not trigger contributes no jobs", () => {
  const out = discoverImpact(ROOT, { paths: ["scripts/local-dev/tests/x.test.mjs"] });
  assert.ok(!out.expected_jobs.some((j) => j.workflow === "web-typecheck.yml"),
    "no web/** file changed, so its jobs must not be predicted");
});

/* ── WS4: prerequisites ───────────────────────────────────────────────────── */

test("F — all three suites have an explicit prerequisite contract", () => {
  for (const name of ["development-offline-lane", "development-provider-lifecycle", "development-session-bootstrap"]) {
    const c = prerequisiteFor(name);
    assert.ok(c, `${name} has no contract`);
    assert.equal(c.tier, TIER.HOST_INTEGRATION);
    assert.ok(c.capabilities.length, "a contract with no capability explains nothing");
    assert.ok(c.why.length > 40, "it must say why the host matters, not merely that it does");
    assert.ok(c.valid_environment.length > 20, "and what a valid certification environment is");
  }
  assert.equal(Object.keys(HOST_PREREQUISITES).length, 3);
});

test("G — an incapable host blocks with a reason rather than failing", () => {
  const r = checkHostPrerequisites("development-offline-lane", { probes: { registered_lane_worktree: () => false, free_lane_slot: () => false } });
  assert.equal(r.status, PREREQUISITE_STATUS.BLOCKED_PREREQUISITE);
  assert.equal(r.missing.length, 2);
  const report = blockedPrerequisiteReport(r);
  assert.match(report.line, /BLOCKED_PREREQUISITE HOST_INTEGRATION/);
  assert.equal(report.exitCode, 0, "a host that cannot answer is not a failing product");
  assert.match(r.summary, /valid certification environment/);
});

test("H — A CAPABLE HOST STILL RUNS EVERYTHING", () => {
  // The half a naive skip would destroy. Capability is decided from the host
  // alone, never from whether a case passed.
  const r = checkHostPrerequisites("development-offline-lane", { probes: { registered_lane_worktree: () => true, free_lane_slot: () => true } });
  assert.equal(r.status, PREREQUISITE_STATUS.CAPABLE);
  assert.deepEqual(r.missing, []);
});

test("I — an unprobed capability is MISSING, never assumed fine", () => {
  const r = checkHostPrerequisites("development-session-bootstrap", { probes: {} });
  assert.equal(r.status, PREREQUISITE_STATUS.BLOCKED_PREREQUISITE);
  assert.equal(r.missing[0].reason, "no probe registered",
    "\"nobody checked\" must never read as \"it is fine\"");
});

test("J — a throwing probe is missing, not capable", () => {
  const r = checkHostPrerequisites("development-provider-lifecycle", {
    probes: { second_live_provider_lane: () => { throw new Error("tmux gone"); } },
  });
  assert.equal(r.status, PREREQUISITE_STATUS.BLOCKED_PREREQUISITE);
});

test("K — a suite with no contract is unaffected", () => {
  const r = checkHostPrerequisites("development-run-lifecycle", { probes: {} });
  assert.equal(r.status, PREREQUISITE_STATUS.CAPABLE);
  assert.equal(r.contract, null);
});

test("L — nothing here allocates host capacity", () => {
  const src = readFileSync(`${LIB}/host-prerequisites.mjs`, "utf8");
  for (const forbidden of ["createDurableLane", "spawn", "execFileSync", "tmux"]) {
    assert.ok(!src.includes(forbidden),
      `manufacturing host load proves the test can be satisfied, not that the product works (${forbidden})`);
  }
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
