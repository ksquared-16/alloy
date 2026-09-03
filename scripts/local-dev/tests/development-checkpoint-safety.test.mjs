#!/usr/bin/env node
/**
 * Reporting run state must never mutate Git.
 *
 * THE INCIDENT THIS LOCKS OUT. In wt5-runtime-performance-ux-completion,
 * `vac run-status --checkpoint-ready …` created a commit whose message was the
 * status summary and swept ~67 unrelated dirty files into the lane branch —
 * including `scripts/local-dev/**` and `web/next-env.d.ts`. Twice, across two
 * runs, repaired by hand both times. The path was:
 *
 *   reportRunState() → afterCheckpointReport() → maybeCreateCheckpoint()
 *     → commitWorktreeCheckpoint() → git add -A && git commit -m "<summary>"
 *
 * Every test here runs against a REAL git repository in a temp directory, and
 * the invariant is checked the only way that actually proves it: a full
 * before/after snapshot of HEAD, the index tree, porcelain status, and the
 * sha256 of every file. A test that asserted "no error was thrown" would have
 * passed against the broken code.
 *
 * The suite ends with a POSITIVE CONTROL that restores the former behaviour and
 * demonstrates the guards catching it — without which a suite that refuses
 * everything is indistinguishable from a suite that refuses the right things.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const STATE_ROOT = mkdtempSync(join(tmpdir(), "vac-ckpt-state-"));
process.env.ALLOY_RUNTIME_ROOT = STATE_ROOT;
mkdirSync(join(STATE_ROOT, "vacilando"), { recursive: true });

const {
  createQueuedRun,
  transitionExecutionRun,
  getExecutionRun,
  patchRunFields,
  resetExecutionRunsForTests,
} = await import("../lib/vacilando/execution-run.mjs");
const { createDurableLane, resetDevelopmentLanesForTests } =
  await import("../lib/vacilando/development-lane.mjs");
const {
  evaluateCheckpointReadiness,
  captureRunGitBaseline,
  attributeDirtyPaths,
  READINESS_REASONS,
} = await import("../lib/vacilando/checkpoint-readiness.mjs");
const {
  createCheckpoint,
  CHECKPOINT_REFUSALS,
  validateManifestPath,
  checkpointRootsFor,
  pathAllowedByProfile,
} = await import("../lib/vacilando/checkpoint-create.mjs");
const { readWorktreeGitState, parsePorcelainZ, MUTATING_GIT_VERBS } =
  await import("../lib/vacilando/git-worktree-state.mjs");
const { commitWorktreeCheckpoint } = await import("../lib/vacilando/alloy-dev-adapter.mjs");
const { repositoryStorePath } = await import("../lib/vacilando/repository-registry.mjs");

let pass = 0;
let fail = 0;

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}

/** A real repository: committed baseline, then whatever dirt the test wants. */
function makeRepo({ preexisting = [], staged = [], untracked = [], toolkitDirt = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "vac-ckpt-repo-"));
  git(["init", "-q", "-b", "main", "."], dir);
  git(["config", "user.email", "t@example.com"], dir);
  git(["config", "user.name", "Test"], dir);
  mkdirSync(join(dir, "scripts", "local-dev"), { recursive: true });
  mkdirSync(join(dir, "web"), { recursive: true });
  writeFileSync(join(dir, "scripts", "local-dev", "tool.mjs"), "toolkit\n");
  writeFileSync(join(dir, "web", "next-env.d.ts"), "declare\n");
  for (const f of preexisting) writeFileSync(join(dir, f), `original ${f}\n`);
  git(["add", "-A"], dir);
  git(["commit", "-q", "-m", "baseline"], dir);

  // Dirt that exists BEFORE the run starts — foreign by definition.
  for (const f of preexisting) writeFileSync(join(dir, f), `original ${f}\npre-existing edit\n`);
  if (toolkitDirt) {
    writeFileSync(join(dir, "scripts", "local-dev", "tool.mjs"), "toolkit\nedited\n");
    writeFileSync(join(dir, "web", "next-env.d.ts"), "declare\nregenerated\n");
  }
  for (const f of staged) {
    writeFileSync(join(dir, f), `staged foreign ${f}\n`);
    git(["add", "--", f], dir);
  }
  for (const f of untracked) writeFileSync(join(dir, f), `untracked foreign ${f}\n`);
  return dir;
}

/** HEAD, commit count, index tree, status, and every file's sha256. */
function snapshot(dir) {
  const files = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (name === ".git") continue;
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.push(relative(dir, full));
    }
  };
  walk(dir);
  files.sort();
  return {
    head: git(["rev-parse", "HEAD"], dir).trim(),
    commits: git(["rev-list", "--count", "HEAD"], dir).trim(),
    indexTree: git(["write-tree"], dir).trim(),
    status: git(["status", "--porcelain=v1"], dir).split("\n").filter(Boolean).sort().join("\n"),
    hashes: files.map((f) => `${createHash("sha256").update(readFileSync(join(dir, f))).digest("hex")}  ${f}`).join("\n"),
  };
}

function assertNoGitMutation(before, after, label) {
  assert.equal(after.head, before.head, `${label}: HEAD moved`);
  assert.equal(after.commits, before.commits, `${label}: a commit was created`);
  assert.equal(after.indexTree, before.indexTree, `${label}: the index changed`);
  assert.equal(after.status, before.status, `${label}: working-tree status changed`);
  assert.equal(after.hashes, before.hashes, `${label}: file contents changed`);
}

async function test(name, fn) {
  resetExecutionRunsForTests(STATE_ROOT);
  resetDevelopmentLanesForTests(STATE_ROOT);
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

/** A started run bound to `dir`, with its baseline captured synchronously. */
async function runFor(dir, { repositoryId = null } = {}) {
  const made = createDurableLane({ name: "checkpoint lane", repository_id: repositoryId, root: STATE_ROOT });
  const laneId = made.lane?.lane_id || made.lane_id;
  const queued = createQueuedRun({
    laneId, instruction: "work", worktreePath: dir, origin: "operator", root: STATE_ROOT,
  });
  transitionExecutionRun(queued.run.run_id, "EXECUTING", {
    origin: "system", root: STATE_ROOT, reason: "delivered", worktreePath: dir,
  });
  // The EXECUTING transition schedules its own async capture. Let it settle, so
  // this test's deterministic baseline is not racing a second write.
  await new Promise((r) => setTimeout(r, 250));
  const cap = await captureRunGitBaseline({ worktreePath: dir, laneId });
  assert.equal(cap.ok, true, cap.error);
  patchRunFields(queued.run.run_id, { git_baseline: cap.baseline }, { root: STATE_ROOT });
  assert.equal(getExecutionRun(queued.run.run_id, STATE_ROOT).git_baseline.captured_at, cap.baseline.captured_at);
  return { laneId, runId: queued.run.run_id };
}

// ------------------------------------------------- the mutation invariant

await test("readiness on a clean tree changes no Git state", async () => {
  const dir = makeRepo({ toolkitDirt: false });
  const { runId, laneId } = await runFor(dir);
  const before = snapshot(dir);
  const out = await evaluateCheckpointReadiness({
    worktreePath: dir, baseline: getExecutionRun(runId, STATE_ROOT).git_baseline, runId, laneId,
  });
  assertNoGitMutation(before, snapshot(dir), "clean readiness");
  assert.equal(out.checkpoint_ready, false);
  assert.equal(out.reason, READINESS_REASONS.CLEAN);
  assert.equal(out.mutations_performed, "none");
});

await test("readiness on a dirty tree changes no Git state", async () => {
  const dir = makeRepo({
    preexisting: ["a.txt", "b.txt", "c.txt"],
    staged: ["staged-foreign.txt"],
    untracked: ["untracked-foreign.txt"],
  });
  const { runId, laneId } = await runFor(dir);
  writeFileSync(join(dir, "owned.txt"), "this run's work\n");
  const before = snapshot(dir);
  const out = await evaluateCheckpointReadiness({
    worktreePath: dir, baseline: getExecutionRun(runId, STATE_ROOT).git_baseline, runId, laneId,
  });
  assertNoGitMutation(before, snapshot(dir), "dirty readiness");
  assert.equal(out.checkpoint_ready, false);
  assert.equal(out.reason, READINESS_REASONS.FOREIGN);
  // The one file this run made is attributed to it; the rest are not.
  assert.deepEqual(out.owned.paths, ["owned.txt"]);
  assert.ok(out.foreign.count >= 5, `foreign was ${out.foreign.count}`);
  assert.ok(out.foreign.paths.includes("scripts/local-dev/tool.mjs"));
  assert.ok(out.foreign.paths.includes("web/next-env.d.ts"));
});

await test("67 foreign files cannot be swept into a checkpoint", async () => {
  // The incident shape, at its actual scale.
  const many = Array.from({ length: 67 }, (_, i) => `foreign-${String(i).padStart(3, "0")}.txt`);
  const dir = makeRepo({ preexisting: many });
  const { runId, laneId } = await runFor(dir);
  writeFileSync(join(dir, "owned.txt"), "the only file this run made\n");
  const before = snapshot(dir);

  const readiness = await evaluateCheckpointReadiness({
    worktreePath: dir, baseline: getExecutionRun(runId, STATE_ROOT).git_baseline, runId, laneId,
  });
  assertNoGitMutation(before, snapshot(dir), "67-file readiness");
  assert.equal(readiness.checkpoint_ready, false);
  assert.equal(readiness.reason, READINESS_REASONS.FOREIGN);
  assert.equal(readiness.foreign.count, 69, "67 pre-existing plus the two toolkit files");
  assert.deepEqual(readiness.owned.paths, ["owned.txt"]);

  // And creation refuses to take them even when they are named explicitly.
  const forced = await createCheckpoint({
    runId,
    expectedHead: before.head,
    message: "feat: sweep everything",
    paths: [...many, "owned.txt"],
    root: STATE_ROOT,
  });
  assert.equal(forced.ok, false);
  assert.equal(forced.error, CHECKPOINT_REFUSALS.FOREIGN_PATH);
  assert.equal(forced.count, 67);
  assertNoGitMutation(before, snapshot(dir), "67-file forced creation");
});

await test("a missing baseline attributes nothing to the run", async () => {
  const dir = makeRepo({ preexisting: ["a.txt"] });
  writeFileSync(join(dir, "new.txt"), "x\n");
  const before = snapshot(dir);
  const out = await evaluateCheckpointReadiness({ worktreePath: dir, baseline: null });
  assert.equal(out.checkpoint_ready, false);
  assert.equal(out.reason, READINESS_REASONS.NO_BASELINE);
  // Silence is never ownership.
  assert.equal(out.owned.count, 0);
  assert.equal(attributeDirtyPaths({ untracked: ["x"] }, null).owned.length, 0);
  assertNoGitMutation(before, snapshot(dir), "no-baseline readiness");
});

await test("readiness is truthful when the branch moved", async () => {
  const dir = makeRepo({ preexisting: ["a.txt"] });
  const { runId, laneId } = await runFor(dir);
  const baseline = getExecutionRun(runId, STATE_ROOT).git_baseline;
  writeFileSync(join(dir, "owned.txt"), "x\n");
  git(["add", "--", "owned.txt"], dir);
  git(["commit", "-q", "-m", "someone else committed"], dir);
  writeFileSync(join(dir, "owned2.txt"), "y\n");
  const before = snapshot(dir);
  const out = await evaluateCheckpointReadiness({ worktreePath: dir, baseline, runId, laneId });
  assert.equal(out.checkpoint_ready, false);
  assert.equal(out.reason, READINESS_REASONS.MOVED_HEAD);
  assertNoGitMutation(before, snapshot(dir), "moved-head readiness");
});

// ------------------------------------------------- explicit creation

await test("creation rejects an absent manifest", async () => {
  const dir = makeRepo({ preexisting: ["a.txt"] });
  const { runId } = await runFor(dir);
  const before = snapshot(dir);
  for (const paths of [[], null, undefined, [""], ["   "]]) {
    const out = await createCheckpoint({
      runId, expectedHead: before.head, message: "feat: x", paths, root: STATE_ROOT,
    });
    assert.equal(out.ok, false);
    assert.equal(out.error, CHECKPOINT_REFUSALS.NO_MANIFEST, `paths=${JSON.stringify(paths)}`);
  }
  assertNoGitMutation(before, snapshot(dir), "absent manifest");
});

await test("creation rejects unexpected staged files", async () => {
  const dir = makeRepo({ staged: ["staged-foreign.txt"] });
  const { runId } = await runFor(dir);
  writeFileSync(join(dir, "owned.txt"), "x\n");
  const before = snapshot(dir);
  const out = await createCheckpoint({
    runId, expectedHead: before.head, message: "feat: only mine", paths: ["owned.txt"], root: STATE_ROOT,
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, CHECKPOINT_REFUSALS.UNEXPECTED_STAGED);
  assert.deepEqual(out.paths, ["staged-foreign.txt"]);
  assertNoGitMutation(before, snapshot(dir), "unexpected staged");
});

await test("compare-and-swap rejects a moved HEAD", async () => {
  const dir = makeRepo();
  const { runId } = await runFor(dir);
  writeFileSync(join(dir, "owned.txt"), "x\n");
  const before = snapshot(dir);
  const out = await createCheckpoint({
    runId,
    expectedHead: "0".repeat(40),
    message: "feat: x",
    paths: ["owned.txt"],
    root: STATE_ROOT,
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, CHECKPOINT_REFUSALS.HEAD_MOVED);
  assert.equal(out.actual, before.head);
  assertNoGitMutation(before, snapshot(dir), "head CAS");
});

await test("creation commits only allowlisted paths", async () => {
  const dir = makeRepo({ preexisting: ["a.txt", "b.txt"], untracked: ["untracked-foreign.txt"] });
  const { runId } = await runFor(dir);
  writeFileSync(join(dir, "owned.txt"), "mine\n");
  writeFileSync(join(dir, "also-mine.txt"), "mine too\n");
  const before = snapshot(dir);
  const out = await createCheckpoint({
    runId, expectedHead: before.head, message: "feat(x): only the manifest",
    paths: ["owned.txt"], root: STATE_ROOT,
  });
  assert.equal(out.ok, true, out.error);
  const landed = git(["show", "--name-only", "--pretty=format:", "HEAD"], dir)
    .split("\n").map((l) => l.trim()).filter(Boolean);
  assert.deepEqual(landed, ["owned.txt"], "the commit must contain exactly the manifest");

  const after = snapshot(dir);
  assert.notEqual(after.head, before.head, "a commit was supposed to happen");
  // Everything not named is byte-identical and still dirty.
  for (const f of ["a.txt", "b.txt", "untracked-foreign.txt", "also-mine.txt",
    "scripts/local-dev/tool.mjs", "web/next-env.d.ts"]) {
    const beforeLine = before.hashes.split("\n").find((l) => l.endsWith(`  ${f}`));
    const afterLine = after.hashes.split("\n").find((l) => l.endsWith(`  ${f}`));
    assert.equal(afterLine, beforeLine, `${f} was modified`);
  }
  assert.match(after.status, /a\.txt/);
  assert.match(after.status, /untracked-foreign\.txt/);
});

await test("retries cannot duplicate a commit", async () => {
  const dir = makeRepo();
  const { runId } = await runFor(dir);
  writeFileSync(join(dir, "owned.txt"), "mine\n");
  const head0 = snapshot(dir).head;
  const first = await createCheckpoint({
    runId, expectedHead: head0, message: "feat(x): once", paths: ["owned.txt"], root: STATE_ROOT,
  });
  assert.equal(first.ok, true, first.error);
  const afterFirst = snapshot(dir);

  const retry = await createCheckpoint({
    runId, expectedHead: afterFirst.head, message: "feat(x): once", paths: ["owned.txt"], root: STATE_ROOT,
  });
  assert.equal(retry.ok, true, retry.error);
  assert.equal(retry.already, true, "a retry must report the existing commit, not refuse");
  assertNoGitMutation(afterFirst, snapshot(dir), "idempotent retry");
});

await test("a path dirty before the run is refused", async () => {
  const dir = makeRepo({ preexisting: ["a.txt"] });
  const { runId } = await runFor(dir);
  const before = snapshot(dir);
  const out = await createCheckpoint({
    runId, expectedHead: before.head, message: "feat: adopt", paths: ["a.txt"], root: STATE_ROOT,
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, CHECKPOINT_REFUSALS.FOREIGN_PATH);
  assertNoGitMutation(before, snapshot(dir), "foreign path");
});

await test("manifest paths cannot escape or glob", () => {
  for (const bad of ["../escape", "/etc/passwd", "a/../../b", "*.txt", "src/**", "a;rm -rf /", "x`id`"]) {
    const v = validateManifestPath(bad);
    assert.equal(v.ok, false, `${bad} was accepted`);
  }
  // POSITIVE CONTROL: ordinary paths are accepted.
  for (const good of ["a.txt", "scripts/local-dev/x.mjs", "web/next-env.d.ts"]) {
    assert.equal(validateManifestPath(good).ok, true, `${good} was refused`);
  }
});

// ------------------------------------------------- profiles

await test("generic repositories are fail-closed", async () => {
  // A generic Git repository has no convention that says which paths a lane
  // owns, so no path may be checkpointed there.
  assert.deepEqual(checkpointRootsFor({ id: "generic", governed_promotion: false }), []);
  assert.equal(pathAllowedByProfile("a.txt", []), false);
  assert.deepEqual(checkpointRootsFor({ id: "alloy", governed_promotion: true }), ["*"]);
  assert.equal(pathAllowedByProfile("a.txt", ["*"]), true);

  const dir = makeRepo();
  writeFileSync(repositoryStorePath(STATE_ROOT), `${JSON.stringify({
    schema_version: "vacilando.repository.v1",
    repositories: {
      repo_plain: {
        repository_id: "repo_plain", name: "Notes", profile: "generic", state: "ACTIVE",
        root: dir, git_common_dir: join(dir, ".git"), worktree_parent: dir, default_branch: "main",
      },
    },
  }, null, 2)}\n`, "utf8");
  const { runId } = await runFor(dir, { repositoryId: "repo_plain" });
  writeFileSync(join(dir, "owned.txt"), "mine\n");
  const before = snapshot(dir);
  const out = await createCheckpoint({
    runId, expectedHead: before.head, message: "feat: x", paths: ["owned.txt"], root: STATE_ROOT,
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, CHECKPOINT_REFUSALS.PATH_OUTSIDE_PROFILE);
  assertNoGitMutation(before, snapshot(dir), "generic profile");
  writeFileSync(repositoryStorePath(STATE_ROOT), `${JSON.stringify({ schema_version: "vacilando.repository.v1", repositories: {} }, null, 2)}\n`, "utf8");
});

await test("multi-repository baselines stay isolated", async () => {
  const a = makeRepo({ preexisting: ["a.txt"] });
  const b = makeRepo({ preexisting: ["b.txt"] });
  const runA = await runFor(a);
  const runB = await runFor(b);
  const baseA = getExecutionRun(runA.runId, STATE_ROOT).git_baseline;
  const baseB = getExecutionRun(runB.runId, STATE_ROOT).git_baseline;
  assert.notEqual(baseA.worktree_path, baseB.worktree_path);
  // B's dirt must never be attributed to A.
  writeFileSync(join(a, "owned.txt"), "x\n");
  const outA = await evaluateCheckpointReadiness({ worktreePath: a, baseline: baseA });
  assert.deepEqual(outA.owned.paths, ["owned.txt"]);
  assert.equal(outA.foreign.paths.includes("b.txt"), false);
});

// ------------------------------------------------- durability

await test("a recorded baseline and readiness survive a reload", async () => {
  const dir = makeRepo({ preexisting: ["a.txt"] });
  const { runId, laneId } = await runFor(dir);
  writeFileSync(join(dir, "owned.txt"), "x\n");
  const result = await evaluateCheckpointReadiness({
    worktreePath: dir, baseline: getExecutionRun(runId, STATE_ROOT).git_baseline, runId, laneId,
  });
  patchRunFields(runId, { checkpoint_readiness: result }, { root: STATE_ROOT });
  // Re-read from the store, as a restarted Gateway would.
  const { readExecutionRunStore } = await import("../lib/vacilando/execution-run.mjs");
  const reloaded = getExecutionRun(runId, STATE_ROOT);
  assert.ok(reloaded.git_baseline, "baseline must be durable");
  assert.equal(reloaded.checkpoint_readiness.reason, READINESS_REASONS.FOREIGN);
  assert.equal(reloaded.checkpoint_readiness.checkpoint_ready, false);
  assert.ok(typeof readExecutionRunStore === "function");
});

// ------------------------------------------------- the primitive

await test("the commit primitive refuses without a manifest", async () => {
  const dir = makeRepo({ preexisting: ["a.txt", "b.txt"] });
  const before = snapshot(dir);
  for (const paths of [undefined, null, []]) {
    const out = await commitWorktreeCheckpoint({ path: dir, message: "feat: x", paths });
    assert.equal(out.ok, false);
    assert.equal(out.error, "checkpoint_requires_manifest");
  }
  assertNoGitMutation(before, snapshot(dir), "primitive without manifest");
});

await test("the state reader names no mutating verb", async () => {
  // A structural check on the module that is allowed to run git during a status
  // report. If a mutating verb ever appears in it, this fails before a worktree
  // is harmed.
  const src = readFileSync(new URL("../lib/vacilando/git-worktree-state.mjs", import.meta.url), "utf8");
  const body = src.replace(/MUTATING_GIT_VERBS = Object\.freeze\(\[[\s\S]*?\]\);/, "");
  for (const verb of MUTATING_GIT_VERBS) {
    assert.doesNotMatch(body, new RegExp(`"${verb}"`), `git-worktree-state references "${verb}"`);
  }
});

await test("porcelain parsing survives renames", () => {
  // A rename carries its origin path as an extra NUL field. Missing it invents a
  // phantom path, which then looks like unattributed foreign dirt and blocks a
  // legitimate checkpoint.
  const z = ["R  new.txt", "old.txt", " M other.txt", "?? fresh.txt", ""].join("\0");
  const out = parsePorcelainZ(z);
  assert.deepEqual(out.staged, ["new.txt"]);
  assert.deepEqual(out.unstaged, ["other.txt"]);
  assert.deepEqual(out.untracked, ["fresh.txt"]);
});

// ------------------------------------------------- POSITIVE CONTROL

await test("POSITIVE CONTROL: the former behaviour is caught by these guards", async () => {
  // Restore exactly what the old code did — `git add -A && git commit -m
  // "<status summary>"` — and show the snapshot comparison detects it. Without
  // this, a suite where every operation refused would look identical to a suite
  // that refuses the right things.
  const many = Array.from({ length: 67 }, (_, i) => `foreign-${String(i).padStart(3, "0")}.txt`);
  const dir = makeRepo({ preexisting: many });
  writeFileSync(join(dir, "owned.txt"), "the only file this run made\n");
  const before = snapshot(dir);

  git(["add", "-A"], dir);
  git(["commit", "-q", "-m", "feat(vacilando): a status summary"], dir);

  const after = snapshot(dir);
  let caught = null;
  try {
    assertNoGitMutation(before, after, "former behaviour");
  } catch (e) {
    caught = e;
  }
  assert.ok(caught, "the invariant check MUST fail against the old behaviour");
  assert.match(caught.message, /HEAD moved|a commit was created/);

  const landed = git(["show", "--name-only", "--pretty=format:", "HEAD"], dir)
    .split("\n").map((l) => l.trim()).filter(Boolean);
  assert.equal(landed.length, 70, "67 foreign + owned + the two toolkit files");
  assert.ok(landed.includes("scripts/local-dev/tool.mjs"), "the incident's own file shape");
  assert.ok(landed.includes("web/next-env.d.ts"));
});

// ------------------------------------------------- adoption: the narrow exception
//
// THE DEFECT THIS CLOSES. A run that dies mid-turn leaves its authored, tested
// work dirty. Every successor run inherits those paths in its own baseline, so
// FOREIGN_PATH refuses them — permanently. Valid mission-owned work becomes
// uncommittable through the sanctioned path, and the only escapes were a blanket
// --allow-foreign or going around governance entirely.
//
// Adoption is deliberately narrower than the blanket flag: the claim is bound to
// the exact bytes. Everything below asserts a refusal, because the refusals are
// what keep this from becoming --allow-foreign with extra words.

const SHA_OF = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

await test("adoption claims a pre-dirty path by its exact content", async () => {
  const dir = makeRepo({ preexisting: ["orphaned.txt"] });
  const { runId } = await runFor(dir);
  const before = snapshot(dir);
  const out = await createCheckpoint({
    runId, expectedHead: before.head, message: "fix: adopt the orphaned change",
    paths: ["orphaned.txt"],
    adopt: [`orphaned.txt=${SHA_OF(join(dir, "orphaned.txt"))}`],
    adoptFrom: "erun_dead", adoptReason: "authoring run died mid-turn",
    root: STATE_ROOT,
  });
  assert.equal(out.ok, true, out.error);
  assert.deepEqual(out.adopted, ["orphaned.txt"]);
  const landed = execFileSync("git", ["show", "--name-only", "--pretty=format:", "HEAD"], { cwd: dir, encoding: "utf8" })
    .split("\n").map((l) => l.trim()).filter(Boolean);
  assert.deepEqual(landed, ["orphaned.txt"], "adoption must carry nothing else");
});

await test("adoption refuses content that changed after the fingerprint", async () => {
  const dir = makeRepo({ preexisting: ["orphaned.txt"] });
  const { runId } = await runFor(dir);
  const stale = SHA_OF(join(dir, "orphaned.txt"));
  writeFileSync(join(dir, "orphaned.txt"), "something else entirely\n");
  const before = snapshot(dir);
  const out = await createCheckpoint({
    runId, expectedHead: before.head, message: "fix: adopt", paths: ["orphaned.txt"],
    adopt: [`orphaned.txt=${stale}`], adoptFrom: "erun_dead", adoptReason: "r", root: STATE_ROOT,
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, CHECKPOINT_REFUSALS.ADOPTION_FINGERPRINT);
  assertNoGitMutation(before, snapshot(dir), "stale fingerprint");
});

await test("adoption requires an originating run and a reason", async () => {
  const dir = makeRepo({ preexisting: ["orphaned.txt"] });
  const { runId } = await runFor(dir);
  const before = snapshot(dir);
  const sha = SHA_OF(join(dir, "orphaned.txt"));
  for (const extra of [{}, { adoptFrom: "erun_dead" }, { adoptReason: "r" }]) {
    const out = await createCheckpoint({
      runId, expectedHead: before.head, message: "fix: adopt", paths: ["orphaned.txt"],
      adopt: [`orphaned.txt=${sha}`], ...extra, root: STATE_ROOT,
    });
    assert.equal(out.ok, false);
    assert.equal(out.error, CHECKPOINT_REFUSALS.ADOPTION_UNDECLARED, JSON.stringify(extra));
  }
  assertNoGitMutation(before, snapshot(dir), "undeclared adoption");
});

await test("an unadopted foreign path is still refused alongside an adopted one", async () => {
  const dir = makeRepo({ preexisting: ["orphaned.txt", "someone-elses.txt"] });
  const { runId } = await runFor(dir);
  const before = snapshot(dir);
  const out = await createCheckpoint({
    runId, expectedHead: before.head, message: "fix: adopt one, sweep the other",
    paths: ["orphaned.txt", "someone-elses.txt"],
    adopt: [`orphaned.txt=${SHA_OF(join(dir, "orphaned.txt"))}`],
    adoptFrom: "erun_dead", adoptReason: "r", root: STATE_ROOT,
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, CHECKPOINT_REFUSALS.FOREIGN_PATH);
  assert.deepEqual(out.paths, ["someone-elses.txt"], "only the unadopted path is foreign");
  assertNoGitMutation(before, snapshot(dir), "partial adoption");
});

await test("adoption cannot launder work the run dirtied itself", async () => {
  // The ordinary route already commits this. Allowing it through the exception
  // would make "adopted" meaningless as an audit signal.
  const dir = makeRepo({ toolkitDirt: false });
  const { runId } = await runFor(dir);
  writeFileSync(join(dir, "mine.txt"), "authored by this run\n");
  const before = snapshot(dir);
  const out = await createCheckpoint({
    runId, expectedHead: before.head, message: "fix: x", paths: ["mine.txt"],
    adopt: [`mine.txt=${SHA_OF(join(dir, "mine.txt"))}`],
    adoptFrom: "erun_dead", adoptReason: "r", root: STATE_ROOT,
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, CHECKPOINT_REFUSALS.ADOPTION_UNNECESSARY);
  assertNoGitMutation(before, snapshot(dir), "self-authored adoption");
});

await test("the default is unchanged: no adoption, no foreign path", async () => {
  const dir = makeRepo({ preexisting: ["orphaned.txt"] });
  const { runId } = await runFor(dir);
  const before = snapshot(dir);
  const out = await createCheckpoint({
    runId, expectedHead: before.head, message: "fix: x", paths: ["orphaned.txt"], root: STATE_ROOT,
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, CHECKPOINT_REFUSALS.FOREIGN_PATH, "fail-closed must survive the new feature");
  assertNoGitMutation(before, snapshot(dir), "default still fail-closed");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
