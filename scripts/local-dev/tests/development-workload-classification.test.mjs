#!/usr/bin/env node
/**
 * S3 — authoritative workload classification.
 *
 * THE INCIDENT THIS ENCODES. `isUnbrokeredHeavyCommand` matched tsc and
 * next build and nothing else. Vitest was allowlisted because focused runs are
 * cheap — so `vitest run one.test.ts` and `vitest run tests/` were the same
 * string to it. Both suites that drove this host to load 54.47 were vitest, and
 * both were invisible to a broker built to stop exactly that.
 *
 * WHAT MUST NEVER REGRESS. A binary name is not a workload; SCOPE is. The same
 * vitest binary must produce different classes for different scopes, `next dev`
 * must never become a production build, and an invocation the classifier does
 * not recognise must stay `unknown` rather than being promoted into the nearest
 * known class — because future enforcement will act on the class.
 */
import assert from "node:assert/strict";

const C = await import("../lib/vacilando/workload-classification.mjs");
const O = await import("../lib/vacilando/workload-observation.mjs");

let pass = 0;
let fail = 0;
const started = [];
function test(name, fn) {
  const p = (async () => {
    try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
    catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
  })();
  started.push(p);
  return p;
}

const cls = (command, attribution = null) => C.classifyWorkload({ command, pid: 1, attribution, now: "2026-01-01T00:00:00.000Z" });

// ── 1–17: required fixture matrix ────────────────────────────────────────────

await test("1 — one Vitest file is a targeted test", () => {
  const r = cls("node /w/node_modules/.bin/vitest run tests/unit/one.test.ts");
  assert.equal(r.workload_class, "targeted_test");
  assert.equal(r.confidence, "authoritative");
  assert.equal(r.classification_basis, "runner_scope:1_explicit_file");
  assert.equal(r.expected_weight, 2);
});

await test("2 — several explicit files stay targeted", () => {
  const r = cls("vitest run a.test.ts b.test.ts c.spec.tsx");
  assert.equal(r.workload_class, "targeted_test");
  assert.equal(r.scope_files, 3);
  assert.equal(r.expected_weight, 2);
});

await test("3 — a DIRECTORY scope is a heavy suite", () => {
  const r = cls("vitest run tests/commands");
  assert.equal(r.workload_class, "heavy_test");
  assert.equal(r.classification_basis, "runner_scope:directory");
  // The live incident's shape.
  assert.equal(cls("vitest run tests/commands tests/lifecycle").workload_class, "heavy_test");
});

await test("4 — a full suite with no scope is heavy", () => {
  const r = cls("vitest run");
  assert.equal(r.workload_class, "heavy_test");
  assert.equal(r.classification_basis, "runner_scope:no_scope_full_suite");
  // Default workers assumed, and labelled as assumed.
  assert.equal(r.workers_requested, null);
  assert.equal(r.workers_default, C.WEIGHT_POLICY.default_workers);
  assert.equal(r.expected_weight, C.WEIGHT_POLICY.default_workers * 2);
});

await test("5 — Jest behaves identically on scope", () => {
  assert.equal(cls("jest one.test.js").workload_class, "targeted_test");
  assert.equal(cls("jest src/").workload_class, "heavy_test");
  assert.equal(cls("jest").workload_class, "heavy_test");
  assert.equal(cls("jest --runInBand").workers_requested, 1);
});

await test("6 — an explicit worker cap is captured and changes expected weight", () => {
  const two = cls("vitest run --maxWorkers=2");
  assert.equal(two.workers_requested, 2);
  assert.equal(two.expected_weight, 4);
  const eight = cls("vitest run --maxWorkers=8");
  assert.equal(eight.workers_requested, 8);
  assert.equal(eight.expected_weight, 16);
  assert.equal(cls("jest --maxWorkers 4").workers_requested, 4);
  assert.equal(cls("vitest run --pool=forks").worker_flag, "--pool=forks");
});

await test("7 — default fan-out is observed, not assumed, when measured", () => {
  const rows = [
    { pid: 100, ppid: 1, command: "node .../vitest run" },
    { pid: 101, ppid: 100, command: "node tinypool worker" },
    { pid: 102, ppid: 100, command: "node tinypool worker" },
    { pid: 103, ppid: 100, command: "node tinypool worker" },
    { pid: 104, ppid: 999, command: "unrelated" },
  ];
  const kids = O.descendantsOf(100, rows);
  assert.equal(kids.length, 3);
  assert.equal(O.countWorkers(kids), 3);
});

await test("8 — typecheck", () => {
  assert.equal(cls("node --max-old-space-size=8192 node_modules/typescript/bin/tsc -p tsconfig.build.json --noEmit").workload_class, "typecheck");
  assert.equal(cls("npm run typecheck").workload_class, "typecheck");
  assert.equal(cls("tsc --noEmit").expected_weight, 4);
});

await test("9 — tests typecheck", () => {
  const r = cls("npm run typecheck:tests");
  assert.equal(r.workload_class, "typecheck");
  assert.equal(r.classification_basis, "npm_script:typecheck:tests");
  assert.equal(r.confidence, "authoritative");
});

await test("10 — production build", () => {
  assert.equal(cls("next build").workload_class, "production_build");
  assert.equal(cls("npx next build").workload_class, "production_build");
  assert.equal(cls("npm run build").workload_class, "production_build");
  assert.equal(cls("next build").expected_weight, 6);
});

await test("11 — next dev is NOT a production build", () => {
  const dev = cls("next dev");
  assert.equal(dev.workload_class, "interactive");
  assert.notEqual(dev.workload_class, "production_build");
  assert.equal(cls("npm run dev").workload_class, "interactive");
  assert.equal(cls("next dev -p 3015").workload_class, "interactive");
});

await test("12 — Playwright / browser E2E", () => {
  assert.equal(cls("npx playwright test").workload_class, "browser_e2e");
  assert.equal(cls("playwright test --project=chromium").expected_weight, 4);
  assert.equal(cls("alloy-agent-verify 5 authenticated-home").workload_class, "browser_e2e");
});

await test("13 — machine-exclusive consumes all validation capacity", () => {
  const r = cls("alloy-runtime-timing-certification run");
  assert.equal(r.workload_class, "machine_exclusive");
  assert.equal(r.expected_weight, Infinity, "exclusive must not read as merely expensive");
});

await test("14 — off-worktree provider-owned validation classifies normally", () => {
  // THE INCIDENT SHAPE: no worktree, full ownership, and scope still decides.
  const attribution = {
    root_provider_pid: 89207, lane_id: "lane_surfaces", lane_name: "Surfaces",
    execution_run_id: "erun_s", repository_id: "repo_alloy",
    worktree_path: "/w/wt6", execution_location: "outside_worktree",
  };
  const r = cls("node /private/tmp/fin-base/web/node_modules/.bin/vitest run tests/commands", attribution);
  assert.equal(r.workload_class, "heavy_test");
  assert.equal(r.confidence, "authoritative");
  assert.equal(r.lane_id, "lane_surfaces");
  assert.equal(r.execution_run_id, "erun_s");
  assert.equal(r.execution_location, "outside_worktree");
});

await test("15 — unattributed validation still classifies, with no owner invented", () => {
  const r = cls("vitest run tests/", null);
  assert.equal(r.workload_class, "heavy_test");
  assert.equal(r.lane_id, null);
  assert.equal(r.root_provider_pid, null);
  assert.equal(r.execution_run_id, null);
});

await test("16 — an unknown invocation stays unknown", () => {
  for (const cmd of ["./scripts/do-a-thing.sh", "python analyse.py", "cargo build", "make all"]) {
    const r = cls(cmd);
    assert.equal(r.confidence, "unknown", `${cmd} must not be classified`);
    assert.equal(r.workload_class, null);
    assert.equal(r.expected_weight, null);
  }
});

await test("17 — two providers' workloads stay independently attributed", () => {
  const a = cls("vitest run tests/", { root_provider_pid: 111, lane_id: "lane_a" });
  const b = cls("next build", { root_provider_pid: 222, lane_id: "lane_b" });
  assert.equal(a.lane_id, "lane_a");
  assert.equal(b.lane_id, "lane_b");
  const cost = O.concurrentWeightedCost([a, b]);
  assert.equal(cost.total_weight, C.WEIGHT_POLICY.default_workers * 2 + 6);
  assert.deepEqual(Object.keys(cost.by_lane).sort(), ["lane_a", "lane_b"]);
});

// ── Required negative controls / mutations ───────────────────────────────────

await test("NEGATIVE — binary-name-only classification is provably insufficient", () => {
  // Identical tool, identical flags. ONLY the scope differs. If a classifier
  // keyed on the binary name, these would be equal — which is the original bug.
  const one = cls("vitest run one.test.ts");
  const all = cls("vitest run");
  assert.equal(one.tool, all.tool, "same binary");
  assert.notEqual(one.workload_class, all.workload_class, "scope must decide the class");
  assert.ok(all.expected_weight > one.expected_weight);
});

await test("NEGATIVE — cwd cannot determine workload class", () => {
  const inWorktree = { execution_location: "inside_worktree", lane_id: "lane_a" };
  const outside = { execution_location: "outside_worktree", lane_id: "lane_a" };
  // Same command, opposite locations: the class must be identical.
  assert.equal(cls("vitest run tests/", inWorktree).workload_class,
    cls("vitest run tests/", outside).workload_class);
  // And a cheap command in a worktree must not become heavy.
  assert.equal(cls("vitest run one.test.ts", inWorktree).workload_class, "targeted_test");
});

await test("NEGATIVE — next dev can never become production_build", () => {
  for (const cmd of ["next dev", "next dev -p 3015", "npm run dev", "npx next dev --turbo"]) {
    assert.notEqual(cls(cmd).workload_class, "production_build", `${cmd} must not be a build`);
  }
});

await test("NEGATIVE — removing scope interpretation breaks the fixtures", () => {
  // Simulate a classifier that ignores scope: both shapes collapse to one class.
  const ignoreScope = (command) => {
    const n = C.normalizeInvocation(command);
    return n.tool === "vitest" ? "heavy_test" : null;
  };
  assert.equal(ignoreScope("vitest run one.test.ts"), ignoreScope("vitest run"));
  // The real classifier must NOT behave that way.
  assert.notEqual(cls("vitest run one.test.ts").workload_class, cls("vitest run").workload_class);
});

await test("NEGATIVE — worker count changes heavy-test expected weight", () => {
  const w = (n) => C.expectedWeight("heavy_test", { workers: n });
  assert.equal(w(1), 2);
  assert.equal(w(4), 8);
  assert.equal(w(12), 24);
  assert.notEqual(w(2), w(8), "weight must move with workers");
  // Fixed classes must NOT move with workers.
  assert.equal(C.expectedWeight("typecheck", { workers: 12 }), 4);
  assert.equal(C.expectedWeight("production_build", { workers: 12 }), 6);
});

await test("NEGATIVE — an unknown invocation is never promoted into a known class", () => {
  const r = cls("./weird-thing --with vitest-in-the-name-but-not-the-tool");
  // The word "vitest" appears in the string; the TOOL is not vitest.
  assert.equal(r.tool, "weird-thing");
  assert.equal(r.confidence, "unknown");
  assert.equal(r.workload_class, null);
});

// ── Weight policy, drift, measurement ────────────────────────────────────────

await test("weights are centralised and versioned, not scattered", () => {
  assert.equal(C.WEIGHT_POLICY.version, "v1");
  assert.ok(C.WEIGHT_POLICY.source);
  for (const k of Object.keys(C.WORKLOAD_CLASSES)) {
    assert.ok(k in C.WEIGHT_POLICY.weights, `weight policy missing class ${k}`);
  }
  // A revised policy flows through without touching the classifier.
  const revised = { ...C.WEIGHT_POLICY, version: "v2", heavy_test_per_worker: 3 };
  assert.equal(C.expectedWeight("heavy_test", { workers: 4, policy: revised }), 12);
});

await test("classification drift is recorded, never enforced", () => {
  const declared = cls("vitest run one.test.ts");
  const drift = C.detectClassificationDrift(declared, { observed_workers: 12 });
  assert.ok(drift, "a targeted test fanning to 12 workers must be flagged");
  assert.equal(drift.declared_class, "targeted_test");
  assert.equal(drift.observed_workers, 12);
  assert.equal(drift.action, "recorded_for_s5");
  assert.match(drift.notes[0], /fanned out/);
  // Behaving as declared produces no drift.
  assert.equal(C.detectClassificationDrift(declared, { observed_workers: 1 }), null);
});

await test("an unmeasured workload is recorded as unmeasured, not as cheap", () => {
  const rec = cls("vitest run tests/");
  const obs = O.observationRecord({
    record: rec, startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T00:00:05.000Z",
    exitCode: 0, sampler: { state: { samples: 0, failed_samples: 2, peak_descendants: 0, peak_workers: 0 } },
  });
  assert.equal(obs.duration_ms, 5000);
  assert.equal(obs.measurement_complete, false);
  assert.equal(obs.observed_workers, null, "unknown, not zero");
  assert.equal(obs.workload_class, "heavy_test", "classification survives failed measurement");
});

await test("concurrent weighted cost is computed, and exclusivity is not a number", () => {
  const excl = cls("alloy-runtime-timing-certification run");
  const cost = O.concurrentWeightedCost([excl, cls("next build")]);
  assert.equal(cost.machine_exclusive_present, true);
  assert.equal(cost.total_weight, 6, "Infinity must not pollute the sum");
});

await test("S3 classifies and measures but cannot throttle", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  // Scan CODE, not prose. The first version of this test failed on the word
  // "throttle" inside the comment that promises never to throttle — a guard
  // that cannot tell a promise from a call is not a guard.
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  for (const f of ["workload-classification.mjs", "workload-observation.mjs"]) {
    const code = stripComments(readFileSync(join(here, "..", "lib", "vacilando", f), "utf8"));
    for (const forbidden of ["process.kill", "SIGKILL", "SIGTERM", "execFile", "spawn(", "writeFileSync"]) {
      assert.equal(code.includes(forbidden), false, `${f} must not contain ${forbidden}`);
    }
  }
});

await test("brokered invocations are marked so enforcement can trust them later", () => {
  assert.equal(cls("vac run typecheck").brokered, true);
  assert.equal(cls("alloy-validate wt1 build").brokered, true);
  assert.equal(cls("vitest run tests/").brokered, false);
});

await Promise.all(started);
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
