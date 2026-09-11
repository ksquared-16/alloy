#!/usr/bin/env node
/**
 * A TERMINAL FAILURE NOBODY WAS TOLD ABOUT.
 *
 * THE INCIDENT, Documentation/API Thread 5. A worker filed three
 * `database.apply_migration` requests against certification. Authoritative
 * state, read from the store afterwards:
 *
 *   gar_5a2bf7ecb186fe  failed  source_sha_not_reachable   279s after filing
 *   gar_45807eabb8fa95  failed  environment_not_allowed     73s after filing
 *   gar_21028bc35a23f3  failed  source_sha_not_reachable   176s after filing
 *
 * NONE of them was ever awaiting approval. All three reached a terminal FAILED
 * state on the trusted host, minutes later, and not one of those outcomes ever
 * reached the worker. `vac governed-action` printed `requested <id>` and exited.
 *
 * What the worker could see was: no database change. So it concluded the
 * request was malformed, went looking for the accepted `environment` values,
 * found `DIRECTOR_ELIGIBLE_ENVIRONMENTS` — a different contract, describing who
 * may APPROVE rather than what may be TARGETED — and filed
 * `development_certification`. That is the second row above.
 *
 * Two separate defects, and neither is "the worker guessed badly":
 *
 *   1. filing reported a state and then went silent, so "still working" and
 *      "already dead" looked identical from the lane;
 *   2. discovery listed WHICH inputs an action needs and never WHICH VALUES,
 *      so the accepted enum genuinely was not available anywhere the worker
 *      could reach.
 *
 * These controls pin both, and pin the rule that turned one stuck migration
 * into three: every non-terminal state must tell the worker not to refile.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../vac-governed-action.mjs", import.meta.url));
const ROOT = mkdtempSync(join(tmpdir(), "vac-gav-"));
mkdirSync(join(ROOT, "vacilando", "governed-actions"), { recursive: true });

const R = await import("../lib/vacilando/governed-action-request.mjs");
const REG = await import("../lib/vacilando/trusted-host-action-registry.mjs");
const MIG = await import("../lib/vacilando/trusted-host-migrate.mjs");

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/** Seed one request in a throwaway store and ask the CLI about it. */
function statusOf(record) {
  writeFileSync(
    join(ROOT, "vacilando", "governed-actions", "requests.json"),
    JSON.stringify({ schema_version: R.GOVERNED_ACTION_SCHEMA, requests: [record] }),
    "utf8",
  );
  try {
    return execFileSync(process.execPath, [CLI, "--status", record.request_id],
      { env: { ...process.env, ALLOY_RUNTIME_ROOT: ROOT }, encoding: "utf8" });
  } catch (e) {
    // A failed request exits non-zero on purpose; its stdout is the report.
    return `${e.stdout || ""}${e.stderr || ""}`;
  }
}

const base = {
  schema_version: R.GOVERNED_ACTION_SCHEMA,
  request_id: "gar_test000000001", lane_id: "lane_x", run_id: "erun_x",
  action_key: "database.apply_migration", created_at: "2026-09-11T15:00:00.000Z",
  updated_at: "2026-09-11T15:04:00.000Z", inputs: {},
};

// ── 1. every state the engine can reach has a worker story ───────────────────
test("G1. every canonical status is explained to the worker", () => {
  for (const status of R.GOVERNED_STATUSES) {
    const out = statusOf({ ...base, status });
    assert.match(out, new RegExp(`status : ${status}`), `${status} is reported`);
    assert.ok(!/undefined/.test(out), `${status} produced an undefined field`);
    // The label must add meaning, not echo the raw token back.
    const line = out.split("\n").find((l) => l.includes("status :")) || "";
    assert.ok(line.includes("—"), `${status} has no human label`);
  }
});

test("G2. no non-terminal state leaves the worker without instruction", () => {
  for (const status of R.GOVERNED_STATUSES) {
    if (status === "complete" || status === "failed") continue;
    const out = statusOf({ ...base, status });
    assert.match(out, /Do NOT refile/, `${status} must say not to refile — refiling is what made three requests out of one`);
    assert.match(out, /No worker action is required/, `${status} must say the worker is not blocked on itself`);
  }
});

test("G3. approval states say a human must act, not that work is happening", () => {
  const out = statusOf({ ...base, status: "awaiting_operator" });
  assert.match(out, /Awaiting operator approval/);
  assert.match(out, /cannot progress until they act/, "and that polling will not help");
});

// ── 2. a refusal must carry the contract it refused against ──────────────────
test("G4. a failed request shows the action contract in the same output", () => {
  const out = statusOf({
    ...base, status: "failed",
    failure_code: "environment_not_allowed",
    failure_reason: "environment must be one of: staging, certification, cert",
  });
  assert.match(out, /failure: environment_not_allowed/);
  assert.match(out, /Contract for database\.apply_migration/, "the contract travels with the refusal");
  assert.match(out, /environment must be one of: staging \| certification \| cert/);
});

test("G5. the worker is told a terminal failure is terminal", () => {
  const out = statusOf({ ...base, status: "failed", failure_code: "source_sha_not_reachable" });
  assert.match(out, /terminal/i);
  assert.match(out, /Refiling an identical request fails identically/,
    "the exact mistake Thread 5 made, named");
});

// ── 3. discovery exposes WHICH VALUES, not just which inputs ─────────────────
test("G6. discovery publishes the accepted environment values", () => {
  const a = REG.listRegisteredActions().find((x) => x.actionType === "database.apply_migration");
  assert.ok(a, "the action is discoverable");
  assert.deepEqual(a.requiredInputs, ["environment", "expectedSha", "migrations"]);
  assert.deepEqual(a.acceptedValues?.environment, ["staging", "certification", "cert"],
    "the enum the worker could not find anywhere");
});

test("G7. the published enum IS the validator's own constant — it cannot drift", () => {
  const a = REG.listRegisteredActions().find((x) => x.actionType === "database.apply_migration");
  assert.deepEqual(a.acceptedValues.environment, [...MIG.ALLOWED_ENVIRONMENTS],
    "discovery and refusal must read the same source");
  // And the value Thread 5 actually filed is refused by both.
  assert.ok(!a.acceptedValues.environment.includes("development_certification"));
});

test("G8. --contract answers the question the worker asked the wrong file", () => {
  const out = execFileSync(process.execPath, [CLI, "--contract", "database.apply_migration"],
    { env: { ...process.env, ALLOY_RUNTIME_ROOT: ROOT }, encoding: "utf8" });
  assert.match(out, /environment must be one of: staging \| certification \| cert/);
  assert.match(out, /nested under "inputs"/, "the other thing that is easy to get wrong");
});

// ── 4. and nothing that already worked was broken ────────────────────────────
test("G9. the machine-readable first line is unchanged", () => {
  // Existing callers and tests parse `governed-action <status> <id> ...`. A
  // nicer report is not worth breaking them, so it stays first and unchanged.
  const src = execFileSync("cat", [CLI], { encoding: "utf8" });
  const line = src.split("\n").find((l) => l.includes("governed-action ${st} ${out.request.request_id}"));
  assert.ok(line, "the original line is still emitted verbatim");
  const idx = src.indexOf("governed-action ${st}");
  const reportIdx = src.indexOf("Governed action filed");
  assert.ok(idx < reportIdx, "and it is emitted BEFORE the human report");
});

test("G10. state is read from the store, never inferred from elapsed time", () => {
  const src = execFileSync("cat", [CLI], { encoding: "utf8" });
  const fn = src.slice(src.indexOf("async function reportStatus"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  assert.match(body, /listGovernedActions/, "authoritative store read");
  assert.ok(!/Date\.now\(\)|elapsed|since/.test(body),
    "no timestamp heuristic may decide a lifecycle state");
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* */ }
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
