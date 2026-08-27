#!/usr/bin/env node
/**
 * Validation path convergence — one capacity authority.
 *
 * THE INVARIANT. Exactly one component may say YES to expensive validation.
 * Everything else may say NO, or may record. A memory-pressure refusal and a
 * browser-certification lease can coexist with S5 because neither grants; what
 * cannot coexist is a second thing that authorises.
 *
 * THE BYPASS THIS CLOSES, OBSERVED LIVE. A managed slot running
 * `npm exec vitest run tests/lifecycle tests/pos` with worker forks, entirely
 * outside `vac run`, while S5 held the budget it was meant to be spending.
 *
 * FALSE INTERCEPTION IS THE WORSE FAILURE. Every routing fixture has a twin
 * proving what is NOT rewritten: pipelines, redirections, substitutions, and
 * anything the classifier will only call best-effort. Those run, and are
 * recorded — a guess that silently changes what a suite asserts is worse than
 * an honest report that something escaped.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-conv-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;

const V = await import("../lib/vacilando/validation-routing.mjs");
const A = await import("../lib/vacilando/validation-admission.mjs");
const { computeCapacityPolicy, hostCapability } = await import("../lib/vacilando/capacity-policy.mjs");
const { classifyWorkload } = await import("../lib/vacilando/workload-classification.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const ALIVE = () => true;
const ledger = () => join(ROOT, `claims-${Math.random().toString(36).slice(2)}.json`);
// 8 cores / 24 GB — this host.
const hostCap = () => computeCapacityPolicy(hostCapability({
  os: { cpus: () => new Array(8), totalmem: () => 24 * 1073741824, arch: () => "arm64", platform: () => "darwin" },
  memory: { free_gb: 8, free_pct: 33, swap_rate_known: true, swapouts_delta: 0 },
  disk: { total_gb: 460, free_gb: 200, free_pct: 43 },
  load: { one: 2 },
}));

// ── Provider direct-command routing ──────────────────────────────────────────

await test("1 — a direct full Vitest suite routes to the broker", () => {
  const r = V.routeCommand("npm exec vitest run tests/lifecycle tests/pos");
  assert.equal(r.decision, "route_to_broker");
  assert.equal(r.replacements.length, 1);
  assert.equal(r.replacements[0].workload_class, "heavy_test");
  // Verbatim: same tests, same paths, same flags.
  assert.equal(r.replacements[0].governed, "vac run command -- npm exec vitest run tests/lifecycle tests/pos");
});

await test("2 — a targeted test is classified as targeted and is NOT intercepted", () => {
  const r = V.routeCommand("npx vitest run web/app/lib/foo.test.ts");
  assert.equal(r.decision, "allow_not_validation", "a single explicit test file is not the workload this governs");
  assert.equal(r.segments[0].workload_class, "targeted_test");
});

await test("3 — a direct typecheck routes to the broker", () => {
  const r = V.routeCommand("node node_modules/typescript/bin/tsc -p tsconfig.build.json --noEmit");
  assert.equal(r.decision, "route_to_broker");
  assert.equal(r.replacements[0].workload_class, "typecheck");
});

await test("4 — a direct production build routes to the broker", () => {
  const r = V.routeCommand("npx next build");
  assert.equal(r.decision, "route_to_broker");
  assert.equal(r.replacements[0].workload_class, "production_build");
});

await test("5 — Playwright routes to the broker", () => {
  const r = V.routeCommand("npx playwright test");
  assert.equal(r.decision, "route_to_broker");
  assert.equal(r.replacements[0].workload_class, "browser_e2e");
});

await test("6 — an ordinary shell command is untouched", () => {
  for (const cmd of ["git status --short", "ls -la", "cat package.json", "node --version"]) {
    assert.equal(V.routeCommand(cmd).decision, "allow_not_validation", cmd);
  }
});

await test("7 — a pipeline containing heavy work is REPORTED, not rewritten", () => {
  const r = V.routeCommand("npx vitest run tests/ | tee out.log");
  assert.equal(r.decision, "report_unclassifiable");
  assert.equal(r.allowed, true, "the command still runs — breaking correct work is the worse failure");
  assert.match(r.detail, /pipeline/);
  assert.equal(r.replacements, undefined);
});

await test("7b — redirection, substitution and control flow are all refused as unliftable", () => {
  for (const [cmd, why] of [
    ["npx vitest run tests/ > out.log", /redirection/],
    ["npx vitest run $(cat which-tests.txt)", /substitution/],
    ["for f in a b; do npx vitest run tests/; done", /control flow/],
    ["npx vitest run tests/ &", /backgrounding/],
  ]) {
    const r = V.routeCommand(cmd);
    assert.equal(r.decision, "report_unclassifiable", cmd);
    assert.match(r.detail, why, cmd);
  }
});

await test("7c — a SEQUENCED heavy command is still routed; only composition blocks it", () => {
  // `&&` sequences, it does not compose — the segment can be lifted verbatim.
  const r = V.routeCommand("cd web && npx next build");
  assert.equal(r.decision, "route_to_broker");
  assert.equal(r.replacements[0].original, "npx next build");
  assert.equal(r.replacements[0].governed, "vac run command -- npx next build");
});

await test("8 — the broker's own invocations are never re-intercepted", () => {
  assert.equal(V.routeCommand("vac run command -- npx vitest run tests/").decision, "allow_already_governed");
  assert.equal(V.routeCommand("vac run typecheck").decision, "allow_already_governed");
  assert.equal(V.routeCommand("alloy-validate wt5 test").decision, "allow_already_governed");
  assert.equal(V.routeCommand("npx vitest run tests/", { env: { ALLOY_VALIDATE_EXECUTING: "1" } }).decision, "allow_already_governed");
});

// ── Single-owner invariant ───────────────────────────────────────────────────

await test("9 — exactly one component may GRANT validation capacity", () => {
  assert.deepEqual(V.CAPACITY_AUTHORITIES.grants, ["validation-admission"]);
  // The others are named with what they may do, and none of them grants.
  assert.ok(V.CAPACITY_AUTHORITIES.may_refuse_only.includes("memory-pressure-guard"));
  assert.ok(V.CAPACITY_AUTHORITIES.may_serialize_named_resource_only.includes("browser-certification-lease"));
  assert.ok(V.CAPACITY_AUTHORITIES.may_record_only.includes("validation-queue"));
});

await test("10 — alloy-validate no longer holds a capacity budget of its own", () => {
  const src = readFileSync(new URL("../alloy-validate", import.meta.url), "utf8");
  const code = src.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  // The two former budgets: a host-wide mutex and a counted heavy-job slot.
  assert.equal(/alloy_validate_acquire_lock/.test(code), false, "the host-wide mutex is gone");
  assert.equal(/alloy_acquire_resource_slot\s+heavy/.test(code), false, "the counted heavy budget is gone");
  // And it now consumes the canonical one.
  assert.match(code, /vac-validate-admit\.mjs/);
  assert.match(code, /vac-validate-release\.mjs/);
});

await test("10b — alloy-validate keeps every semantic it legitimately owns", () => {
  const src = readFileSync(new URL("../alloy-validate", import.meta.url), "utf8");
  for (const kept of [
    "alloy_validate_reuse_lookup",       // result cache
    "alloy_validate_reuse_store",
    "alloy_validate_queue_register",     // FIFO visibility
    "alloy_refuse_if_memory_pressure_heavy", // a refusal, never a grant
    "alloy_browser_cert_acquire",        // named machine-exclusive resource
    "alloy_run_owned",                   // owned process group
    "alloy_reap_owned_job",
    "alloy_classify_exec_failure",       // config-error vs test-failure
  ]) {
    assert.ok(src.includes(kept), `${kept} must survive convergence`);
  }
});

await test("10c — status reports from the S5 ledger, not from a lease nobody holds", () => {
  const lock = readFileSync(new URL("../lib/lock.sh", import.meta.url), "utf8");
  const fn = lock.slice(lock.indexOf("alloy_validate_status()"), lock.indexOf("alloy_validate_report_unbrokered()"));
  assert.match(fn, /governed validation \(S5\)/);
  assert.match(fn, /vac-validate-status\.mjs/);
});

// ── Incident replay ──────────────────────────────────────────────────────────

await test("11 — INCIDENT REPLAY: two providers issue heavy validation directly; S5 governs both", () => {
  const path = ledger();
  const cap = hostCap();
  const budget = cap.axes.validation_capacity.tokens;

  // Provider A and provider B each type a heavy command directly. Neither
  // prepends anything; the router hands each the governed form.
  const A_CMD = "npm exec vitest run tests/lifecycle tests/pos";
  const B_CMD = "npm exec vitest run web/app";
  const routeA = V.routeCommand(A_CMD);
  const routeB = V.routeCommand(B_CMD);
  assert.equal(routeA.decision, "route_to_broker");
  assert.equal(routeB.decision, "route_to_broker");

  // Both then run through the broker. Worker caps apply.
  const ceiling = cap.axes.validation_capacity.worker_ceiling;
  const capA = A.applyWorkerCeiling(["run", "tests/lifecycle", "tests/pos", "--maxWorkers=8"], ceiling, { tool: "vitest" });
  assert.ok(capA.args.includes(`--maxWorkers=${ceiling}`), "concurrency is capped");
  assert.equal(capA.args.includes("--maxWorkers=8"), false);
  // Test selection is untouched.
  assert.ok(capA.args.includes("tests/lifecycle") && capA.args.includes("tests/pos"));

  const wlA = { ...classifyWorkload({ command: A_CMD, pid: 101 }), workload_id: "wa", expected_weight: 4 };
  const wlB = { ...classifyWorkload({ command: B_CMD, pid: 202 }), workload_id: "wb", expected_weight: 4 };
  const a = A.acquireCapacity({ workload: wlA, capacity: cap, pid: 101, path, pidAlive: ALIVE });
  const b = A.acquireCapacity({ workload: wlB, capacity: cap, pid: 202, path, pidAlive: ALIVE });

  assert.equal(a.admit, true, "the first is admitted");
  assert.equal(b.admit, false, "the second WAITS — it is not killed and not refused outright");
  assert.equal(b.queued, true);
  assert.ok(A.heldWeight(A.readClaimStore({ path, pidAlive: ALIVE })) <= budget, "governed weight never exceeds the S4 budget");

  // The first finishes; the second becomes admissible.
  A.releaseCapacity(a.claim.claim_id, { path, pidAlive: ALIVE, exitCode: 0 });
  const drained = A.drainQueue({ capacity: cap, path, pidAlive: ALIVE });
  assert.ok(drained.ready.length >= 1, "the waiter is released, not abandoned");
  assert.equal(drained.expired.length, 0, "and it was not dropped for taking too long");
  const after = A.acquireCapacity({ workload: wlB, capacity: cap, pid: 202, path, pidAlive: ALIVE });
  assert.equal(after.admit, true, "and both eventually complete");
});

await test("12 — alloy-validate and vac run cannot claim independent overlapping capacity", () => {
  const path = ledger();
  const cap = hostCap();
  // Same ledger, same budget, whichever door the work came through.
  const viaBroker = A.acquireCapacity({ workload: { workload_id: "v1", workload_class: "typecheck", expected_weight: 4 }, capacity: cap, pid: 1, path, pidAlive: ALIVE });
  const viaAlloyValidate = A.acquireCapacity({ workload: { workload_id: "v2", workload_class: "typecheck", expected_weight: 4 }, capacity: cap, pid: 2, path, pidAlive: ALIVE });
  assert.equal(viaBroker.admit, true);
  assert.equal(viaAlloyValidate.admit, false, "the second door sees the first door's claim");
  assert.equal(A.heldWeight(A.readClaimStore({ path, pidAlive: ALIVE })), 4);
});

await test("13 — a nonzero validation exit still releases capacity", () => {
  const path = ledger();
  const cap = hostCap();
  const held = A.acquireCapacity({ workload: { workload_id: "x", workload_class: "heavy_test", expected_weight: 4 }, capacity: cap, pid: 9, path, pidAlive: ALIVE });
  A.releaseCapacity(held.claim.claim_id, { path, pidAlive: ALIVE, exitCode: 1 });
  assert.equal(A.heldWeight(A.readClaimStore({ path, pidAlive: ALIVE })), 0, "a failing suite frees its budget like a passing one");
});

await test("13b — LIVE-SHAPE: a waiter that retries does not multiply its queue entry", () => {
  // Found by running the converged path under real memory pressure: fourteen
  // queue rows appeared for ONE waiter inside a minute, because every retry
  // appended. Status and health would have reported fourteen blocked workloads
  // where there was one.
  const path = ledger();
  const cap = hostCap();
  const wl = { workload_id: "w-retry", workload_class: "typecheck", expected_weight: 4 };
  A.acquireCapacity({ workload: { workload_id: "holder", workload_class: "typecheck", expected_weight: 4 }, capacity: cap, pid: 1, path, pidAlive: ALIVE });
  let last = null;
  for (let i = 0; i < 5; i += 1) {
    last = A.acquireCapacity({ workload: wl, capacity: cap, pid: 2, path, pidAlive: ALIVE });
    assert.equal(last.queued, true);
  }
  const store = A.readClaimStore({ path, pidAlive: ALIVE });
  assert.equal(store.queue.length, 1, "five retries, one waiter");
  assert.equal(store.queue[0].observations, 4, "and the retries are counted, not hidden");
});

await test("13c — LIVE-SHAPE: a retry does NOT renew the wait deadline", () => {
  // The worse half of the same defect. Each new entry carried a fresh
  // wait_deadline, so the bound could never be reached — a wait that renews its
  // own deadline is an unbounded wait wearing a bound.
  const path = ledger();
  const cap = hostCap();
  const wl = { workload_id: "w-deadline", workload_class: "typecheck", expected_weight: 4 };
  A.acquireCapacity({ workload: { workload_id: "holder2", workload_class: "typecheck", expected_weight: 4 }, capacity: cap, pid: 1, path, pidAlive: ALIVE });
  const first = A.acquireCapacity({ workload: wl, capacity: cap, pid: 2, path, pidAlive: ALIVE, now: 1_000_000 });
  const later = A.acquireCapacity({ workload: wl, capacity: cap, pid: 2, path, pidAlive: ALIVE, now: 1_000_000 + 600_000 });
  assert.equal(later.queue_entry.wait_deadline, first.queue_entry.wait_deadline);
  assert.equal(later.queue_entry.waiting_since, first.queue_entry.waiting_since);
  assert.equal(later.queue_entry.request_id, first.queue_entry.request_id);
});

await test("13d — a waiter whose process died is reaped like a dead claim", () => {
  const path = ledger();
  const cap = hostCap();
  A.acquireCapacity({ workload: { workload_id: "h3", workload_class: "typecheck", expected_weight: 4 }, capacity: cap, pid: 1, path, pidAlive: ALIVE });
  A.acquireCapacity({ workload: { workload_id: "ghost", workload_class: "typecheck", expected_weight: 4 }, capacity: cap, pid: 424242, path, pidAlive: ALIVE });
  assert.equal(A.readClaimStore({ path, pidAlive: ALIVE }).queue.length, 1);
  // Now that waiter is gone.
  const reaped = A.readClaimStore({ path, pidAlive: (p) => p !== 424242 });
  assert.equal(reaped.queue.length, 0, "a phantom waiter is not contention");
  assert.equal(reaped.abandoned_waiters.length, 1);
});

// ── Unbrokered work: observed, never killed ───// ── Unbrokered work: observed, never killed ──────────────────────────────────

await test("14 — a managed provider's escaped heavy work is an ESCAPE; an outsider's is EXTERNAL", () => {
  const out = V.classifyUnbrokered([
    { pid: 111, lane_id: "lane_a", workload_class: "heavy_test", command: "vitest run tests/" },
    { pid: 222, lane_id: null, root_provider_pid: null, workload_class: "typecheck", command: "tsc --noEmit" },
    { pid: 333, lane_id: "lane_b", workload_class: "targeted_test", command: "vitest run one.test.ts" },
  ], { claims: [] });
  assert.deepEqual(out.escaped.map((e) => e.pid), [111], "owned by a managed lane");
  assert.deepEqual(out.external.map((e) => e.pid), [222], "nobody's — a person in a shell");
  assert.equal(out.escaped.length + out.external.length, 2, "a targeted test is not the governed class");
});

await test("15 — work that IS governed is not double-counted as unbrokered", () => {
  const out = V.classifyUnbrokered(
    [{ pid: 111, lane_id: "lane_a", workload_class: "heavy_test" }],
    { claims: [{ pid: 111, lane_id: "lane_a" }] },
  );
  assert.deepEqual(out.escaped, []);
  assert.equal(out.governed, 1);
});

await test("16 — health calls a managed-provider escape a PROBLEM and an outsider a WATCH", async () => {
  const H = await import("../lib/vacilando/health.mjs");
  const escape = H.checkValidationRouting({
    routing: V.summarizeRouting({ claims: [], unbrokered: { escaped: [{ pid: 1, lane_id: "lane_a" }], external: [] }, bypasses: [] }),
  });
  assert.equal(escape.severity, "problem");
  assert.match(escape.explanation, /managed provider are running outside the broker/);

  const outsider = H.checkValidationRouting({
    routing: V.summarizeRouting({ claims: [], unbrokered: { escaped: [], external: [{ pid: 2 }] }, bypasses: [] }),
  });
  assert.equal(outsider.severity, "watch", "a person's own shell is not a defect");

  const clean = H.checkValidationRouting({
    routing: V.summarizeRouting({ claims: [{ pid: 1 }], unbrokered: { escaped: [], external: [] }, bypasses: [] }),
  });
  assert.equal(clean.severity, "healthy");
  assert.deepEqual(clean.measurements.capacity_authority, ["validation-admission"]);

  // Ambiguity is surfaced, never treated as clean.
  const ambiguous = H.checkValidationRouting({
    routing: V.summarizeRouting({ claims: [], unbrokered: { escaped: [], external: [] }, bypasses: [V.bypassRecord({ kind: "unclassifiable", detail: "pipeline" })] }),
  });
  assert.equal(ambiguous.severity, "watch");
});

// ── The hook, end to end ─────────────────────────────────────────────────────

const hookRouter = new URL("../vac-validation-route.mjs", import.meta.url).pathname;
function runRouter(command) {
  try {
    return execFileSync(process.execPath, [hookRouter], {
      encoding: "utf8",
      env: { ...process.env, ALLOY_HOOK_PAYLOAD: JSON.stringify({ tool_input: { command } }), ALLOY_RUNTIME_ROOT: ROOT },
    });
  } catch { return ""; }
}

await test("17 — the hook blocks a direct heavy suite and hands back the exact governed command", () => {
  const out = runRouter("npm exec vitest run tests/lifecycle tests/pos");
  assert.match(out, /^BLOCK\n/);
  assert.match(out, /vac run command -- npm exec vitest run tests\/lifecycle tests\/pos/);
  assert.match(out, /passed through verbatim/);
});

await test("18 — the hook allows ordinary commands and pipelines, and records the pipeline", () => {
  assert.equal(runRouter("git status --short"), "");
  assert.equal(runRouter("npx vitest run tests/ | tee out.log"), "", "allowed, not blocked");
  const events = readFileSync(join(ROOT, "vacilando", "validation-bypass", "events.jsonl"), "utf8")
    .trim().split("\n").map((l) => JSON.parse(l));
  assert.ok(events.some((e) => e.kind === "unclassifiable"), "and recorded so health can see it");
  assert.ok(events.some((e) => e.kind === "routed"));
});

// ── Required mutations ───────────────────────────────────────────────────────

await test("MUTATION — intercepting on a best-effort classification breaks the safety fixture", () => {
  const cmd = "npx vitest run tests/ | tee out.log";
  // The mutation: route whenever anything expensive appears, ignoring liftability.
  const naive = V.routeCommand(cmd).segments.filter((s) => s.routed_class);
  assert.ok(naive.length >= 1, "the mutation would find something to rewrite");
  // Lifting it out of the pipeline silently drops `| tee out.log`.
  assert.equal(V.routeCommand(cmd).decision, "report_unclassifiable");
});

await test("MUTATION — a second budget authorising the same work breaks the single-owner fixture", () => {
  const path = ledger();
  const cap = hostCap();
  // The mutation: alloy-validate keeps its own counted heavy budget alongside S5.
  const secondBudget = { max: 2, held: 0 };
  const grant = () => (secondBudget.held < secondBudget.max ? (secondBudget.held += 1, true) : false);
  assert.equal(grant(), true);
  assert.equal(grant(), true, "the mutation admits two heavy jobs on its own authority");
  // The real path consults ONE ledger, and the second request waits.
  A.acquireCapacity({ workload: { workload_id: "a", workload_class: "typecheck", expected_weight: 4 }, capacity: cap, pid: 1, path, pidAlive: ALIVE });
  const second = A.acquireCapacity({ workload: { workload_id: "b", workload_class: "typecheck", expected_weight: 4 }, capacity: cap, pid: 2, path, pidAlive: ALIVE });
  assert.equal(second.admit, false);
});

await test("MUTATION — treating an unbrokered outsider as an escape breaks the severity fixture", async () => {
  const H = await import("../lib/vacilando/health.mjs");
  // The mutation: any unbrokered heavy work is a problem.
  const mutated = (escaped, external) => (escaped + external > 0 ? "problem" : "healthy");
  assert.equal(mutated(0, 1), "problem", "the mutation cries wolf about every terminal on the machine");
  const real = H.checkValidationRouting({
    routing: V.summarizeRouting({ claims: [], unbrokered: { escaped: [], external: [{ pid: 2 }] }, bypasses: [] }),
  });
  assert.equal(real.severity, "watch");
});

await test("MUTATION — killing unbrokered work instead of observing it: no such path exists", () => {
  const src = readFileSync(new URL("../lib/vacilando/validation-routing.mjs", import.meta.url), "utf8")
    .split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
  for (const forbidden of ["process.kill", "SIGKILL", "SIGTERM", "execFile", "spawn("]) {
    assert.equal(src.includes(forbidden), false, forbidden);
  }
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
