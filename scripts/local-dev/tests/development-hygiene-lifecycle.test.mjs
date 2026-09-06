#!/usr/bin/env node
/**
 * V3 PHASE 4 — retention, reclamation and hygiene lifecycle.
 *
 * The gates A–J of the mission, plus the two defects this phase found on the
 * live host before either could fire:
 *
 *   1. S7's worktree observation filters `/^wt/`, so four permanent lanes were
 *      not classified at all — not preserved, not UNKNOWN, absent.
 *   2. Two MANAGED slot worktrees scored a clean retirement `candidate`. Every
 *      git fact about them was true; retiring them would still have broken two
 *      slots whose `metadata/*.env` names their path.
 *
 * EVERY DESTRUCTIVE CASE RUNS IN A TEMPORARY GIT REPOSITORY. Nothing here reads
 * or writes the live runtime root, the canonical checkout or the toolkit, and a
 * control asserts that the helpers refuse to run without an explicit root.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const A = await import("../lib/vacilando/artifact-retention.mjs");
const C = await import("../lib/vacilando/hygiene-classification.mjs");
const L = await import("../lib/vacilando/hygiene-reclaim.mjs");
const X = await import("../lib/vacilando/hygiene-execute.mjs");
const O = await import("../lib/vacilando/hygiene-observe.mjs");
const Y = await import("../lib/vacilando/hygiene-cycle.mjs");
const T = await import("../lib/vacilando/toolkit-retention.mjs");
const S = await import("../lib/vacilando/host-steward.mjs");
const W = await import("../lib/vacilando/worktree-retirement.mjs");

const HOUR = 3600_000;
const DAY = 24 * HOUR;

function sh(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/**
 * A real repository with a canonical branch and N worktrees.
 *
 * Real git, because every claim in this phase is about what git actually does:
 * that `worktree prune` touches no refs, that `worktree remove` refuses a dirty
 * tree, that removing a checkout leaves its branch.
 */
function repoHarness() {
  // realpath, because macOS resolves /var to /private/var and git reports the
  // resolved form. Comparing an unresolved path to git's own output silently
  // matches nothing, and a test that finds no worktree asserts nothing.
  const base = realpathSync(mkdtempSync(join(tmpdir(), "hyg-repo-")));
  const origin = join(base, "origin.git");
  const canonical = join(base, "canonical");
  const parent = join(base, "worktrees");
  mkdirSync(parent, { recursive: true });
  sh("git", ["init", "--bare", "-b", "staging", origin], base);
  sh("git", ["clone", origin, canonical], base);
  sh("git", ["config", "user.email", "t@example.com"], canonical);
  sh("git", ["config", "user.name", "T"], canonical);
  writeFileSync(join(canonical, "README"), "base\n");
  sh("git", ["add", "-A"], canonical);
  sh("git", ["commit", "-m", "base"], canonical);
  sh("git", ["push", "origin", "staging"], canonical);
  return { base, origin, canonical, parent };
}

/** Add a worktree on `branch`; `merged` pushes its commit into staging first. */
function addWorktree(h, name, { merged = true, commit = true } = {}) {
  const path = join(h.parent, name);
  sh("git", ["worktree", "add", "-b", `promote/${name}`, path, "staging"], h.canonical);
  sh("git", ["config", "user.email", "t@example.com"], path);
  sh("git", ["config", "user.name", "T"], path);
  if (commit) {
    writeFileSync(join(path, `${name}.txt`), `${name}\n`);
    sh("git", ["add", "-A"], path);
    sh("git", ["commit", "-m", `work in ${name}`], path);
  }
  if (merged) {
    sh("git", ["fetch", "origin"], h.canonical);
    sh("git", ["merge", "--no-edit", "--ff-only", `promote/${name}`], h.canonical);
    sh("git", ["push", "origin", "staging"], h.canonical);
    sh("git", ["fetch", "origin"], path);
  }
  return path;
}

/**
 * A runtime root that looks like a real one.
 *
 * The empty stores matter: `observeRetirementCandidates` returns null — which
 * means UNMEASURED, which blocks — when a store file is absent, so a bare
 * temporary directory classifies every worktree UNKNOWN. That is correct
 * behaviour and it makes a bare directory the wrong fixture.
 */
function runtimeRoot() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "hyg-root-")));
  for (const [rel, body] of [
    ["vacilando/execution-runs/runs.json", { lanes: {} }],
    ["vacilando/governed-actions/requests.json", { requests: [] }],
    ["vacilando/lanes/lanes.json", { lanes: {} }],
  ]) {
    const p = join(root, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, `${JSON.stringify(body)}\n`);
  }
  return root;
}

/** Measure one worktree exactly as the cycle does, with an injectable process table. */
function classifyOne(h, root, name, { processes = [], requestingWorktree = "/nowhere/else" } = {}) {
  const rows = O.readGitWorktrees(h.canonical);
  return O.observeWorktreeHygiene({
    root, canonicalRoot: h.canonical, worktreeParent: h.parent,
    requestingWorktree, processes, gitWorktrees: rows, withBytes: false,
  }).find((w) => w.resource_id === name);
}

/* ── A — a genuinely reclaimable worktree is retired through the real lifecycle ── */

await test("A — a merged, clean, unreferenced worktree is retired and its branch survives", async () => {
  const h = repoHarness();
  const root = runtimeRoot();
  const path = addWorktree(h, "wt-safe", { merged: true });

  const before = classifyOne(h, root, "wt-safe");
  assert.equal(before.hygiene_state, "RECLAIMABLE", before.reason);
  assert.equal(before.safety_state, "candidate");
  assert.equal(before.durability, "merged");
  // Every gate measured AND passed. Not "no failures" — measured.
  const rowsBefore = O.readGitWorktrees(h.canonical);
  assert.ok(rowsBefore.some((r) => r.path === path));
  const refsBefore = X.refSnapshot(h.canonical);

  const out = await X.reclaimWorktree({
    root, resource: before, canonicalRoot: h.canonical, worktreeParent: h.parent,
    requestingWorktree: "/nowhere/else",
  });
  assert.equal(out.ok, true, JSON.stringify(out.performed || out.after));

  // Postconditions, measured.
  assert.equal(existsSync(path), false, "the path is gone");
  assert.equal(O.readGitWorktrees(h.canonical).some((r) => r.path === path), false, "the registration is gone");
  assert.equal(out.after.branch_retained, true, "the branch survived");
  assert.match(sh("git", ["rev-parse", "--verify", "refs/heads/promote/wt-safe"], h.canonical), /^[0-9a-f]{40}/);
  // The retained history still holds the work.
  assert.match(sh("git", ["log", "--oneline", "origin/staging"], h.canonical), /work in wt-safe/);
  // And the audit exists, with a before-state and a measured after-state.
  const ledger = L.readLedger(root);
  const intent = ledger.records.find((r) => r.phase === "intended" && r.resource_id === "wt-safe");
  const outcome = ledger.records.find((r) => r.phase === "verified" && r.reclamation_id === intent.reclamation_id);
  assert.ok(intent && outcome, "both halves of the audit are present");
  assert.equal(intent.before.registered, true);
  assert.equal(outcome.after.path_absent, true);
});

/* ── B, C, D — the three protections ─────────────────────────────────────── */

await test("B — a dirty worktree is not reclaimed", async () => {
  const h = repoHarness();
  const root = runtimeRoot();
  const path = addWorktree(h, "wt-dirty", { merged: true });
  writeFileSync(join(path, "uncommitted.txt"), "work nobody has\n");
  sh("git", ["add", "-A"], path);

  const cls = classifyOne(h, root, "wt-dirty");
  assert.notEqual(cls.hygiene_state, "RECLAIMABLE");
  assert.equal(cls.hygiene_state, "NEEDS_ATTENTION");
  assert.ok(cls.blocked_by.includes("tree_clean_or_handled"));

  const out = await X.reclaimWorktree({ root, resource: cls, canonicalRoot: h.canonical, worktreeParent: h.parent });
  assert.equal(out.ok, false);
  assert.equal(out.error, "not_reclaimable");
  assert.equal(existsSync(path), true, "the worktree is untouched");
  assert.equal(L.readLedger(root).records.length, 0, "a refusal writes no intent");
});

await test("C — a worktree holding unique local commits is not reclaimed", async () => {
  const h = repoHarness();
  const root = runtimeRoot();
  const path = addWorktree(h, "wt-unique", { merged: false });

  const cls = classifyOne(h, root, "wt-unique");
  assert.equal(cls.durability, "unique_local_commits");
  assert.equal(cls.hygiene_state, "NEEDS_ATTENTION");
  assert.ok(cls.blocked_by.includes("unique_commits_recoverable"));

  const out = await X.reclaimWorktree({ root, resource: cls, canonicalRoot: h.canonical, worktreeParent: h.parent });
  assert.equal(out.ok, false);
  assert.equal(existsSync(path), true);
  // The commit is still reachable in the worktree.
  assert.match(sh("git", ["log", "--oneline", "-1"], path), /work in wt-unique/);
});

await test("D — an actively referenced worktree is HEALTHY, not reclaimable", async () => {
  const h = repoHarness();
  const root = runtimeRoot();
  const path = addWorktree(h, "wt-busy", { merged: true });

  const cls = classifyOne(h, root, "wt-busy", {
    processes: [{ pid: 999_001, ppid: 1, command: `node ${path}/server.mjs` }],
  });
  assert.equal(cls.hygiene_state, "HEALTHY", cls.reason);
  assert.ok(cls.blocked_by.includes("no_live_provider"));

  const out = await X.reclaimWorktree({ root, resource: cls, canonicalRoot: h.canonical, worktreeParent: h.parent });
  assert.equal(out.ok, false);
  assert.equal(existsSync(path), true);
});

await test("D2 — naming a worktree is not using it", () => {
  const h = repoHarness();
  const root = runtimeRoot();
  addWorktree(h, "wt-named", { merged: true });
  // A command that merely CONTAINS the name must not count as occupancy.
  const cls = classifyOne(h, root, "wt-named", {
    processes: [{ pid: 999_002, ppid: 1, command: "vac hygiene --kind worktree --target wt-named" }],
  });
  assert.equal(cls.hygiene_state, "RECLAIMABLE");
});

/* ── E — unknown fails closed ────────────────────────────────────────────── */

await test("E — withheld evidence preserves rather than reclaims", () => {
  // Every gate that cannot be measured is null, and null must block.
  for (const withheld of ["existsInGit", "liveProviders", "activeRuns", "dirtyPaths", "durability"]) {
    const inputs = {
      path: "wt-x", branch: "promote/x", headSha: "a".repeat(40),
      existsInGit: true, liveProviders: [], liveDevServer: false, activeRuns: [],
      activeGovernedActions: [], activeLanes: [], dirtyPaths: [], untrackedPaths: [],
      untrackedReproducible: true, durability: "merged",
      requestingWorktree: "/elsewhere", operatorHold: false, governanceException: false,
    };
    delete inputs[withheld];
    const safety = W.evaluateRetirementSafety(inputs);
    const cls = C.classifyWorktreeHygiene(safety);
    assert.equal(cls.hygiene_state, "UNKNOWN", `withholding ${withheld} must not produce ${cls.hygiene_state}`);
  }
  // And with everything measured it is reclaimable — so the test above is not
  // passing because the fixture is broken.
  const full = W.evaluateRetirementSafety({
    path: "wt-x", branch: "promote/x", headSha: "a".repeat(40),
    existsInGit: true, liveProviders: [], liveDevServer: false, activeRuns: [],
    activeGovernedActions: [], activeLanes: [], dirtyPaths: [], untrackedPaths: [],
    untrackedReproducible: true, durability: "merged",
    requestingWorktree: "/elsewhere", operatorHold: false, governanceException: false,
  });
  assert.equal(C.classifyWorktreeHygiene(full).hygiene_state, "RECLAIMABLE");
});

await test("E2 — an artefact whose required evidence was not measured is UNKNOWN", () => {
  const noEvidence = A.classifyArtifactPath({ relPath: "logs/x.log", bytes: 99 * 1024 * 1024, mtimeMs: 0 });
  assert.equal(noEvidence.retention_class, "UNKNOWN");
  assert.deepEqual(noEvidence.unmeasured, ["writer_live"]);
  assert.equal(noEvidence.reclaimable, false);
  // A path nothing declares is UNKNOWN however ordinary its name looks.
  assert.equal(A.classifyArtifactPath({ relPath: "vacilando/something-new.json" }).retention_class, "UNKNOWN");
});

/* ── F — stale registration reconciliation destroys nothing ──────────────── */

await test("F — a stale registration is reconciled and no ref is touched", async () => {
  const h = repoHarness();
  const root = runtimeRoot();
  const path = addWorktree(h, "wt-stale", { merged: false });
  const head = sh("git", ["rev-parse", "HEAD"], path).trim();
  // Make it stale the way reality does: the directory disappears.
  rmSync(path, { recursive: true, force: true });

  const rows = O.readGitWorktrees(h.canonical);
  const row = rows.find((r) => r.path === path);
  assert.equal(row.path_exists, false);
  const cls = C.classifyRegistrationHygiene({ path, pathExists: false, prunableByGit: row.prunable });
  assert.equal(cls.hygiene_state, "RECONCILE");

  const refsBefore = X.refSnapshot(h.canonical);
  const out = await X.reclaimRegistrations({
    root, canonicalRoot: h.canonical, resource: { resource_id: path, reason: cls.reason },
  });
  assert.equal(out.ok, true, JSON.stringify(out.after || out.performed));
  assert.equal(O.readGitWorktrees(h.canonical).some((r) => r.path === path), false);

  // The proof that matters: refs identical, and the commit still exists.
  const refsAfter = X.refSnapshot(h.canonical);
  assert.deepEqual(refsAfter, refsBefore, "reconciliation changed a ref");
  assert.match(sh("git", ["rev-parse", "--verify", "refs/heads/promote/wt-stale"], h.canonical), /^[0-9a-f]{40}/);
  assert.equal(sh("git", ["cat-file", "-t", head], h.canonical).trim(), "commit", "the commit survives");
});

await test("F2 — reconciliation is not retirement and never deletes a branch", () => {
  const src = readFileSync(new URL("../lib/vacilando/hygiene-execute.mjs", import.meta.url), "utf8");
  for (const forbidden of ["branch\", \"-D", "branch\", \"-d", "push\", \"--delete", "--force", "rmSync", "rimraf"]) {
    assert.equal(src.includes(forbidden), false, `${forbidden} must not appear in the hygiene executor`);
  }
});

/* ── G — toolkit retention ───────────────────────────────────────────────── */

await test("G — retention keeps current, live pins, the rollback window and the floor", () => {
  const now = Date.UTC(2026, 8, 6);
  const versions = [];
  for (let i = 0; i < 40; i += 1) {
    versions.push({
      version: `v${String(i).padStart(2, "0")}`,
      // Two per day: the measured sprint cadence compressed.
      installed_at: now - i * 12 * HOUR,
      provenance: { source_commit: `c${i}` },
      disk_bytes: 16 * 1024 * 1024,
    });
  }
  const pins = T.resolveProcessPins({ processes: [{ pid: 7, ppid: 1, command: "node /r/toolkit/v30/host.mjs" }] });
  const inv = T.buildInventory({ versions, currentSha: "v00", pins, pinnedVersions: ["v35"], now });
  const plan = T.planPrune({ inventory: inv, currentSha: "v00", pins, now });

  const by = Object.fromEntries(inv.map((r) => [r.version, r]));
  assert.equal(by.v00.prunable, false, "current is retained");
  assert.deepEqual(by.v00.protection_reasons.includes("current"), true);
  assert.equal(by.v30.prunable, false, "a live-pinned version is retained");
  assert.equal(by.v35.prunable, false, "an explicit pin is retained");
  // The time window: 72h at two installs a day is six versions, which is FEWER
  // than keep_n — so the count floor is what protects here and both apply.
  assert.equal(by.v05.prunable, false, "inside the 72h window");
  assert.equal(by.v09.prunable, false, "inside keep_n");
  assert.equal(by.v20.prunable, true, "outside both is prunable");
  assert.equal(plan.rollback_window_hours, 72);

  const verified = T.verifyAfterPrune({
    inventory: inv, currentSha: "v00", pins,
    removed: plan.prune.map((p) => p.version),
  });
  assert.equal(verified.ok, true, verified.problems.join("; "));
  assert.equal(verified.live_pins_intact, true);
});

await test("G2 — the time window protects a busy day that keep_n alone would not", () => {
  const now = Date.UTC(2026, 8, 6);
  // The measured shape: 30 installs in one day.
  const versions = Array.from({ length: 30 }, (_, i) => ({
    version: `b${String(i).padStart(2, "0")}`,
    installed_at: now - i * 40 * 60_000,
    provenance: { source_commit: `c${i}` },
    disk_bytes: 1024,
  }));
  const pins = { pins: {}, unresolved: [] };
  const v1 = T.buildInventory({ versions, currentSha: "b00", pins, policy: T.RETENTION_POLICY_V1, now });
  const v2 = T.buildInventory({ versions, currentSha: "b00", pins, policy: T.RETENTION_POLICY_V2, now });
  const retained = (inv) => inv.filter((r) => !r.prunable).length;
  assert.ok(retained(v1) < retained(v2), "v2 must retain more of a busy day than v1");
  // Under v1 a version from twelve hours ago is already prunable; under v2 it is not.
  const twelveHoursAgo = versions.find((v) => now - v.installed_at >= 12 * HOUR).version;
  assert.equal(v1.find((r) => r.version === twelveHoursAgo).prunable, true, "v1 releases yesterday's rollback target");
  assert.equal(v2.find((r) => r.version === twelveHoursAgo).prunable, false, "v2 keeps it");
});

await test("G3 — an unresolvable live pin blocks every prune, not only its own", () => {
  const versions = [{ version: "v1", installed_at: 1, provenance: {}, disk_bytes: 1 }];
  const pins = T.resolveProcessPins({ processes: [{ pid: 3, ppid: 1, command: "node /r/toolkit/current/host.mjs" }] });
  const plan = T.planPrune({ inventory: T.buildInventory({ versions, currentSha: "v9", pins }), currentSha: "v9", pins });
  assert.equal(plan.execution_blocked, true);
  assert.equal(plan.prunable_count, 0);
  assert.deepEqual(plan.prune, []);
});

/* ── H — artefact retention: one class reclaimed, one preserved ──────────── */

await test("H — a transient class is reclaimed while durable evidence is preserved", async () => {
  const root = runtimeRoot();
  mkdirSync(join(root, "logs"), { recursive: true });
  const log = join(root, "logs", "wt-example.log");
  writeFileSync(log, "x".repeat(12 * 1024 * 1024));
  const audit = join(root, "vacilando", "audit.jsonl");
  writeFileSync(audit, `${JSON.stringify({ event: "must survive" })}\n`);

  const now = Date.now();
  const logCls = A.classifyArtifactPath({
    relPath: "logs/wt-example.log", evidence: { writer_live: false },
    bytes: statSync(log).size, mtimeMs: now, now,
  });
  assert.equal(logCls.retention_class, "RECENT_DIAGNOSTIC");
  assert.equal(logCls.reclaimable, true, "an oversized log with no writer is reclaimable");
  assert.equal(logCls.mechanism, "truncate_to_tail");

  const auditCls = A.classifyArtifactPath({ relPath: "vacilando/audit.jsonl", bytes: statSync(audit).size, mtimeMs: 0, now });
  assert.equal(auditCls.retention_class, "DURABLE_EVIDENCE");
  assert.equal(auditCls.reclaimable, false);

  const out = await X.reclaimLog({
    root, resource: { resource_id: "logs/wt-example.log", path: log, retention_class: "RECENT_DIAGNOSTIC", reason: "test" },
  });
  assert.equal(out.ok, true, JSON.stringify(out.after));
  const after = statSync(log).size;
  assert.ok(after < 12 * 1024 * 1024, "the log shrank");
  assert.ok(after >= A.LOG_TAIL_BYTES, "the tail is preserved");
  assert.equal(readFileSync(audit, "utf8").includes("must survive"), true, "durable evidence untouched");
  assert.equal(statSync(audit).size > 0, true);
});

await test("H2 — a log with a live writer is never rewritten", () => {
  const root = runtimeRoot();
  mkdirSync(join(root, "logs"), { recursive: true });
  const log = join(root, "logs", "live.log");
  writeFileSync(log, "y".repeat(9 * 1024 * 1024));
  const before = statSync(log).size;
  assert.equal(X.truncateLogToTail({ path: log, root, hasWriter: () => true }).error, "live_writer_present");
  // And an UNMEASURABLE writer state is also a refusal, not a permission.
  assert.equal(X.truncateLogToTail({ path: log, root, hasWriter: () => null }).error, "writer_state_unmeasured");
  assert.equal(statSync(log).size, before);
});

await test("H3 — the log rewriter refuses anything outside its own logs directory", () => {
  const root = runtimeRoot();
  mkdirSync(join(root, "logs"), { recursive: true });
  const outside = join(root, "vacilando", "audit.jsonl");
  writeFileSync(outside, "audit\n");
  assert.equal(X.truncateLogToTail({ path: outside, root, hasWriter: () => false }).error, "path_outside_logs_dir");
  const notALog = join(root, "logs", "notes.txt");
  writeFileSync(notALog, "z".repeat(9 * 1024 * 1024));
  assert.equal(X.truncateLogToTail({ path: notALog, root, hasWriter: () => false }).error, "not_a_log_file");
  assert.equal(readFileSync(outside, "utf8"), "audit\n");
});

/* ── I — restart durability ──────────────────────────────────────────────── */

await test("I — the ledger, its evidence and its open intents survive a restart", async () => {
  const root = runtimeRoot();
  await L.reclaimOne({
    root, kind: "artifact", resourceId: "logs/a.log", action: "reclaim_diagnostic_log",
    before: { bytes: 100 }, perform: async () => ({ ok: true }), verify: async () => ({ ok: true, bytes_reclaimed: 60 }),
  });
  L.recordIntent({ root, kind: "worktree", resourceId: "wt-interrupted", action: "retire_worktree", before: { registered: true, path_exists: true } });

  // "Restart" is a fresh import with no in-process state; the ledger is a file.
  const reread = await import(`../lib/vacilando/hygiene-reclaim.mjs?restart=${Date.now()}`);
  const ledger = reread.readLedger(root);
  assert.equal(ledger.ok, true);
  assert.equal(ledger.records.filter((r) => r.phase === "verified").length, 1);
  const open = reread.openReclamations(root);
  assert.equal(open.open.length, 1, "the interrupted intent is still open after a restart");
  assert.equal(open.open[0].resource_id, "wt-interrupted");
  assert.equal(reread.lastCycleSummary(root).bytes_reclaimed, 60);
});

await test("I2 — an interrupted reclamation is resolved by re-measuring, never by assuming", () => {
  const root = runtimeRoot();
  L.recordIntent({ root, kind: "worktree", resourceId: "wt-a", action: "retire_worktree", before: { registered: true, path_exists: true } });
  L.recordIntent({ root, kind: "worktree", resourceId: "wt-b", action: "retire_worktree", before: { registered: true, path_exists: true } });
  L.recordIntent({ root, kind: "worktree", resourceId: "wt-c", action: "retire_worktree", before: { registered: true, path_exists: true } });
  L.recordIntent({ root, kind: "worktree", resourceId: "wt-d", action: "retire_worktree", before: { registered: true, path_exists: true } });

  const answers = {
    "wt-a": { matches_intended_end_state: true },                 // it completed
    "wt-b": { matches_before: true },                             // it never ran
    "wt-c": { matches_before: false, matches_intended_end_state: false }, // half done
    "wt-d": { unmeasurable: true, detail: "git unreadable" },     // cannot say
  };
  const out = L.reconcileInterrupted({ root, measure: (i) => answers[i.resource_id] });
  const byId = Object.fromEntries(out.resolved.map((r) => [r.reclamation_id, r.phase]));
  const ids = Object.fromEntries(L.readLedger(root).records
    .filter((r) => r.phase === "intended").map((r) => [r.resource_id, r.reclamation_id]));
  assert.equal(byId[ids["wt-a"]], "reconciled_completed");
  assert.equal(byId[ids["wt-b"]], "reconciled_not_performed");
  assert.equal(byId[ids["wt-c"]], "reconciled_partial");
  assert.equal(byId[ids["wt-d"]], "still_open", "an unmeasurable resource stays open rather than being invented");
  assert.equal(out.needs_attention.length, 1, "a partial is a fact for a human, not a retry");
  // The unmeasurable one is STILL open on a second pass.
  assert.equal(L.openReclamations(root).open.length, 1);
});

await test("I3 — the intent is durable BEFORE the action runs", async () => {
  const root = runtimeRoot();
  let ledgerAtActionTime = null;
  await L.reclaimOne({
    root, kind: "artifact", resourceId: "logs/ordering.log", action: "reclaim_diagnostic_log",
    before: { bytes: 1 },
    perform: async () => { ledgerAtActionTime = L.readLedger(root).records.length; return { ok: true }; },
    verify: async () => ({ ok: true }),
  });
  assert.equal(ledgerAtActionTime, 1, "the intention must already be on disk when the action begins");
});

await test("I4 — a perform that lies is caught by the verifier", async () => {
  const root = runtimeRoot();
  const out = await L.reclaimOne({
    root, kind: "worktree", resourceId: "wt-liar", action: "retire_worktree", before: { registered: true },
    perform: async () => ({ ok: true }),
    verify: async () => ({ ok: false, error: "still_present" }),
  });
  assert.equal(out.ok, false);
  assert.equal(L.readLedger(root).records.find((r) => r.phase === "failed").error, "still_present");
});

await test("I5 — no verifier is a failure, not a success by omission", async () => {
  const root = runtimeRoot();
  const out = await L.reclaimOne({
    root, kind: "artifact", resourceId: "x", action: "reclaim_diagnostic_log",
    before: { bytes: 1 }, perform: async () => ({ ok: true }),
  });
  assert.equal(out.ok, false);
  assert.equal(out.after.error, "no_verifier");
});

/* ── J — test isolation and fail-closed targeting ────────────────────────── */

await test("J — the CLI refuses --apply without an explicit target", () => {
  const cli = readFileSync(new URL("../vac-hygiene.mjs", import.meta.url), "utf8");
  assert.match(cli, /--apply requires either --cycle or an explicit --kind <k> --target <id>/);
  // There is no --force to mistype into: it is not an accepted option and no
  // branch tests for it. Asserted on the code rather than the prose, since the
  // prose mentions it by name.
  const code = cli.split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
  assert.equal(/["'`]--force["'`]/.test(code), false, "there is no --force");
  assert.equal(code.includes("KNOWN = [\"--json\", \"--plan\", \"--apply\", \"--cycle\", \"--kind\", \"--target\", \"--reconcile\", \"--no-bytes\"]"), true);
  // And an unrecognised option never falls through into a mutation path.
  assert.match(cli, /unknown option/);
});

await test("J2 — a target narrows the selection and never widens it", async () => {
  const h = repoHarness();
  const root = runtimeRoot();
  addWorktree(h, "wt-dirty-target", { merged: true });
  writeFileSync(join(h.parent, "wt-dirty-target", "u.txt"), "x");
  const out = await Y.runHygieneCycle({
    root, canonicalRoot: h.canonical, worktreeParent: h.parent,
    requestingWorktree: "/nowhere", dryRun: true, withBytes: false,
    only: { kind: "worktree", resourceId: "wt-dirty-target" },
  });
  assert.equal(out.planned.length, 0, "naming a blocked resource does not make it eligible");
});

await test("J3 — no hygiene module defaults a destructive path to the live root", () => {
  for (const file of ["hygiene-execute.mjs", "hygiene-cycle.mjs", "hygiene-reclaim.mjs"]) {
    const src = readFileSync(new URL(`../lib/vacilando/${file}`, import.meta.url), "utf8");
    assert.equal(/root\s*=\s*runtimeRoot\(\)/.test(src), false, `${file} must not default root to the live runtime root`);
  }
  // And the cycle refuses outright without one.
  return Y.runHygieneCycle({}).then((out) => {
    assert.equal(out.ok, false);
    assert.equal(out.error, "missing_runtime_root");
  });
});

/* ── The two live-host defects this phase found ──────────────────────────── */

await test("LIVE — every worktree is enumerated, not only the ones named wtN", () => {
  const h = repoHarness();
  sh("git", ["worktree", "add", "-b", "agent/permanent", join(h.parent, "troubleshooting"), "staging"], h.canonical);
  const pop = O.worktreePopulation({ canonicalRoot: h.canonical, worktreeParent: h.parent });
  assert.ok(pop.some((w) => w.name === "troubleshooting"), "a lane whose name does not start with wt must still be classified");
  // The filter that hid four permanent lanes, asserted so it cannot come back
  // through this path.
  const src = readFileSync(new URL("../lib/vacilando/hygiene-observe.mjs", import.meta.url), "utf8")
    .split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
  assert.equal(/\/\^wt\//.test(src), false, "the hygiene population must carry no name filter");
});

await test("LIVE — a managed slot's worktree is intentionally retained, however clean it is", () => {
  // The exact live shape: every gate passed, and it must still not be reclaimed.
  const safety = W.evaluateRetirementSafety({
    path: "troubleshooting", branch: "agent/troubleshooting", headSha: "b".repeat(40),
    existsInGit: true, liveProviders: [], liveDevServer: false, activeRuns: [],
    activeGovernedActions: [], activeLanes: [], dirtyPaths: [], untrackedPaths: [],
    untrackedReproducible: true, durability: "merged",
    requestingWorktree: "/elsewhere", operatorHold: false, governanceException: false,
  });
  assert.equal(safety.state, "candidate", "the retirement gates genuinely pass — that is the point");
  assert.equal(C.classifyWorktreeHygiene(safety, { managed: false }).hygiene_state, "RECLAIMABLE");
  const managed = C.classifyWorktreeHygiene(safety, { managed: true, provenance: "managed" });
  assert.equal(managed.hygiene_state, "EXPECTED");
  assert.match(managed.reason, /durable configuration/);

  // And retention must not swallow a real problem. A managed worktree holding
  // unique local commits is still NEEDS_ATTENTION: "intentionally retained"
  // answers whether it may be removed, not whether there is unheld work in it.
  const atRisk = W.evaluateRetirementSafety({
    path: "wt4-enrollment", branch: "agent/enrollment", headSha: "c".repeat(40),
    existsInGit: true, liveProviders: [], liveDevServer: false, activeRuns: [],
    activeGovernedActions: [], activeLanes: [], dirtyPaths: [], untrackedPaths: [],
    untrackedReproducible: true, durability: "unique_local_commits",
    requestingWorktree: "/elsewhere", operatorHold: false, governanceException: false,
  });
  const cls = C.classifyWorktreeHygiene(atRisk, { managed: true, provenance: "managed" });
  assert.equal(cls.hygiene_state, "NEEDS_ATTENTION");
  assert.equal(cls.durability, "unique_local_commits", "the evidence travels with the classification");
});

/* ── Policy, bounds and the vocabulary ───────────────────────────────────── */

await test("every classification ends in exactly one declared state", () => {
  const seen = [
    C.classifyWorktreeHygiene(null),
    C.classifyToolkitHygiene(null),
    C.classifyArtifactHygiene(null),
    C.classifyRegistrationHygiene({}),
    C.classifyToolkitHygiene({ version: "v", protection_reasons: [], prunable: true }),
    C.classifyToolkitHygiene({ version: "v", protection_reasons: ["current"] }),
    C.classifyToolkitHygiene({ version: "v", protection_reasons: ["rollback_window"] }),
    C.classifyToolkitHygiene({ version: "v", protection_reasons: ["unknown_provenance"] }),
  ];
  for (const s of seen) assert.ok(C.HYGIENE_STATES.includes(s.hygiene_state), `${s.hygiene_state} is not a declared state`);
  assert.equal(C.classifyToolkitHygiene(null).hygiene_state, "UNKNOWN");
});

await test("a blocked toolkit plan makes every version unknown, not only the unresolved one", () => {
  const blocked = { execution_blocked: true, blocked_reason: "a pin could not be resolved" };
  const cls = C.classifyToolkitHygiene({ version: "v1", protection_reasons: [], prunable: true }, blocked);
  assert.equal(cls.hygiene_state, "UNKNOWN");
});

await test("the blast radius is bounded per kind, and an unknown kind selects nothing", () => {
  assert.equal(L.boundCandidates("worktree", [1, 2, 3, 4, 5]).selected.length, L.MAX_PER_CYCLE.worktree);
  assert.equal(L.boundCandidates("worktree", [1, 2, 3, 4, 5]).deferred.length, 5 - L.MAX_PER_CYCLE.worktree);
  const unknownKind = L.boundCandidates("mystery", [1, 2, 3]);
  assert.deepEqual(unknownKind.selected, [], "a kind with no declared bound selects nothing");
  assert.match(unknownKind.reason, /no bound is defined/);

  // The toolkit is the one kind this module does NOT bound, and it says so
  // rather than carrying a number it cannot enforce: the prune is one delegated
  // call that recomputes and verifies the whole plan.
  assert.deepEqual(L.DELEGATED_BOUND_KINDS, ["toolkit"]);
  assert.equal(L.MAX_PER_CYCLE.toolkit, undefined, "no unenforceable number is declared for the toolkit");
  const delegated = L.boundCandidates("toolkit", [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(delegated.selected.length, 7);
  assert.equal(delegated.limit, "delegated");
});

await test("policy is read from the Steward's allowlist rather than restated", () => {
  for (const kind of ["worktree", "registration", "artifact", "toolkit"]) {
    const p = Y.actionPermitted(kind);
    assert.equal(p.ok, true, `${kind}: ${p.reason}`);
    assert.ok(S.AUTONOMOUS_ACTIONS.includes(p.action));
    assert.equal(S.OPERATOR_ONLY_ACTIONS.includes(p.action), false);
  }
  // The invariant the Steward already had must still hold.
  for (const a of S.OPERATOR_ONLY_ACTIONS) assert.equal(S.AUTONOMOUS_ACTIONS.includes(a), false);
  // Deleting a branch stayed operator-only even though retiring a worktree did not.
  assert.ok(S.OPERATOR_ONLY_ACTIONS.includes("delete_branch"));
});

await test("the scoreboard counts what was measured and never invents a byte", () => {
  const board = C.hygieneScoreboard({
    worktrees: [
      { hygiene_state: "RECLAIMABLE", bytes: 1000, durability: "merged", blocked_by: [] },
      { hygiene_state: "NEEDS_ATTENTION", bytes: null, durability: "unique_local_commits", blocked_by: ["unique_commits_recoverable"] },
      { hygiene_state: "NEEDS_ATTENTION", bytes: 5, durability: "merged", blocked_by: ["tree_clean_or_handled"] },
    ],
    toolkits: [{ hygiene_state: "RECLAIMABLE", bytes: 7 }],
    artifacts: [{ hygiene_state: "EXPECTED", retention_class: "DURABLE_EVIDENCE", bytes: 9 }],
    registrations: [{ hygiene_state: "RECONCILE" }],
  });
  assert.equal(board.worktrees.total, 3);
  assert.equal(board.worktrees.estate_bytes, 1005, "an unmeasured size is not counted as zero");
  assert.equal(board.worktrees.estate_bytes_unmeasured, 1);
  assert.equal(board.worktrees.unique_commit_protected, 1);
  assert.equal(board.worktrees.dirty_protected, 1);
  assert.equal(board.registrations.stale, 1);
  assert.equal(board.artifacts.by_retention_class.DURABLE_EVIDENCE.bytes, 9);
});

await test("the Director hears about ownership and repetition, not about routine success", () => {
  const quiet = C.hygieneDirectorAttention(C.hygieneScoreboard({
    worktrees: [{ hygiene_state: "RECLAIMABLE", bytes: 1, durability: "merged", blocked_by: [] }],
  }));
  assert.deepEqual(quiet, [], "a safely reclaimable worktree is not an escalation");

  const loud = C.hygieneDirectorAttention(
    C.hygieneScoreboard({ worktrees: [{ hygiene_state: "NEEDS_ATTENTION", durability: "unique_local_commits", blocked_by: [] }] }),
    { cycles: [{ failed: [{ resource_key: "k" }] }, { failed: [{ resource_key: "k" }] }, { failed: [{ resource_key: "k" }] }] },
  );
  assert.ok(loud.some((i) => i.kind === "ATTENTION" && /commits no retained history/.test(i.why)));
  assert.ok(loud.some((i) => i.kind === "STUCK"));
});

await test("age alone never authorises removal", () => {
  // An ancient log with an unmeasured writer stays UNKNOWN.
  const ancient = A.classifyArtifactPath({ relPath: "logs/old.log", mtimeMs: 0, bytes: 1024, now: Date.now() });
  assert.equal(ancient.reclaimable, false);
  // An ancient DURABLE_EVIDENCE artefact is never reclaimable at any age.
  const oldEvidence = A.classifyArtifactPath({ relPath: "vacilando/capacity-cert/x.json", mtimeMs: 0, bytes: 1, now: Date.now() });
  assert.equal(oldEvidence.retention_class, "DURABLE_EVIDENCE");
  assert.equal(oldEvidence.reclaimable, false);
  assert.equal(A.RETENTION_WINDOWS_MS.DURABLE_EVIDENCE, null);
  // An old toolkit version with nothing referencing it is prunable because
  // nothing references it — the reason is never the date.
  const cls = C.classifyToolkitHygiene({ version: "v", protection_reasons: [], prunable: true });
  assert.equal(cls.hygiene_state, "RECLAIMABLE");
  assert.match(cls.reason, /no protection reason/);
});

await test("Capacity V2 evidence and the ceiling ledger are never reclaimable", () => {
  for (const p of [
    "vacilando/capacity-cert/PAYMENTS_SURFACES_LIVE_CERTIFICATION.json",
    "vacilando/capacity-experiment/ceiling-changes.jsonl",
    "vacilando/operational-findings/findings.json",
    "evidence/msn_0e24196324d1441ac2",
  ]) {
    const c = A.classifyArtifactPath({ relPath: p, bytes: 1, mtimeMs: 0 });
    assert.equal(c.retention_class, "DURABLE_EVIDENCE", p);
    assert.equal(c.reclaimable, false, p);
  }
});
