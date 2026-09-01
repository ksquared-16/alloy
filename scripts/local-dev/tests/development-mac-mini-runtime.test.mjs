#!/usr/bin/env node
/**
 * Mac mini migration — fresh-host runtime defects.
 *
 * Three failures that appear only on a host that has never run Vacilando
 * before. Each was invisible on the MacBook because an earlier side effect had
 * already left the right state on disk, so nothing had to reconstruct it and
 * nothing had to read it truthfully.
 *
 *  1. The Gateway runs from the immutable INSTALLED toolkit, which is not a Git
 *     repository, and the repository registry that gates every provider start
 *     was reconstructed by nobody. Every start refused `worktree_not_managed`,
 *     so an operator send parked forever on `waiting_for_agent_session`.
 *  2. A host with no tmux server has zero live panes. That is an observation,
 *     not an error, and durable lanes must still be returned.
 *  3. Binding a worktree recorded the branch metadata EXPECTED at creation
 *     rather than the branch Git is actually on.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, "..", "lib", "vacilando");

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

/** A real repository, because Git truth cannot be faked with a fixture object. */
function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "vac-mini-repo-"));
  execFileSync("git", ["init", "-q", "-b", "main", dir], { stdio: "ignore" });
  writeFileSync(join(dir, "README.md"), "x\n");
  git(dir, ["add", "-A"]);
  git(dir, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"]);
  return dir;
}

// A hermetic host layout. resolveRuntimeConfig reads CONFIG FILES, not the
// environment, for these roots — pointing ALLOY_CONFIG_FILE at a fixture is the
// only way to keep this test off the real machine's worktrees.
const ROOT = mkdtempSync(join(tmpdir(), "vac-mini-state-"));
const WT_ROOT = mkdtempSync(join(tmpdir(), "vac-mini-wt-"));
const REPO = makeRepo();
const CFG = join(ROOT, "alloy-dev.config");
writeFileSync(CFG, [
  `ALLOY_RUNTIME_ROOT="${ROOT}"`,
  `ALLOY_WORKTREE_ROOT="${WT_ROOT}"`,
  `ALLOY_REPO="${REPO}"`,
  "",
].join("\n"));
process.env.ALLOY_CONFIG_FILE = CFG;
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "1";
process.env.VACILANDO_REPOSITORY_ROOTS = [REPO, WT_ROOT].join(":");

const META_DIR = join(ROOT, "metadata");
mkdirSync(META_DIR, { recursive: true });

const L = await import(join(LIB, "lanes.mjs"));
const D = await import(join(LIB, "durable-state.mjs"));
const N = await import(join(LIB, "commands", "node-ops.mjs"));
const R = await import(join(LIB, "repository-registry.mjs"));
const M = await import(join(LIB, "repository-migration.mjs"));
const { createDurableLane, getDurableLane, resetDevelopmentLanesForTests } =
  await import(join(LIB, "development-lane.mjs"));
const { resolveRuntimeConfig } = await import(join(LIB, "workspace-facts.mjs"));

test("the fixture host layout is actually in effect", () => {
  // If this fails, every assertion below would silently be testing the real
  // machine's worktrees instead of the fixtures.
  const cfg = resolveRuntimeConfig();
  assert.equal(cfg.worktree_root, WT_ROOT);
  assert.equal(cfg.metadata_dir, META_DIR);
  assert.equal(cfg.canonical_repo, REPO);
});

// ---------------------------------------------------------------------------
// 1. No tmux server means zero panes, never "no lanes".
// ---------------------------------------------------------------------------

test("a missing tmux server is recognised as zero panes, not as tmux failure", () => {
  // The exact stderr a fresh macOS host produces: the socket has never existed.
  assert.equal(L.tmuxServerNotRunning({
    ok: false,
    stdout: "",
    stderr: "error connecting to /private/tmp/tmux-501/default (No such file or directory)\n",
    error: "Command failed",
  }), true);

  // The other way tmux says the same thing.
  assert.equal(L.tmuxServerNotRunning({
    ok: false, stdout: "", stderr: "no server running on /private/tmp/tmux-501/default\n", error: "Command failed",
  }), true);
});

test("a genuinely broken tmux stays an error", () => {
  // A missing binary is a real fault and must not be read as "zero panes".
  assert.equal(L.tmuxServerNotRunning({
    ok: false, stdout: "", stderr: "", error: "spawn tmux ENOENT",
  }), false);
  assert.equal(L.tmuxServerNotRunning({
    ok: false, stdout: "", stderr: "", error: "Command failed: timeout",
  }), false);
  assert.equal(L.tmuxServerNotRunning({ ok: true, stdout: "", stderr: "", error: null }), false);
  assert.equal(L.tmuxServerNotRunning(null), false);
});

test("pane discovery reports zero panes, not tmux_unavailable, with no server", async () => {
  // THE REGRESSION, at the canonical boundary: this returned ok:false, and lane
  // discovery turned that into an empty workspace.
  const out = await L.discoverLivePanes({
    readRaw: async () => ({
      ok: false,
      stdout: "",
      stderr: "error connecting to /private/tmp/tmux-501/default (No such file or directory)\n",
      error: "Command failed",
    }),
  });
  assert.equal(out.ok, true, "no tmux server is a successful observation");
  assert.deepEqual(out.panes, []);
  assert.equal(out.tmux_server_running, false);
  assert.equal(out.error, null);
});

test("pane discovery still refuses when tmux is genuinely broken", async () => {
  const out = await L.discoverLivePanes({
    readRaw: async () => ({ ok: false, stdout: "", stderr: "", error: "spawn tmux ENOENT" }),
  });
  assert.equal(out.ok, false, "a broken tmux is still a failure");
  assert.equal(out.error, "spawn tmux ENOENT");
});

test("durable lanes render with zero live panes and no dummy bootstrap session", async () => {
  resetDevelopmentLanesForTests(ROOT);
  const made = createDurableLane({ name: "Vacilando", origin: "test", root: ROOT });
  assert.ok(made.ok, "fixture lane created");

  // Exactly what the fixed boundary hands lane discovery on a fresh host.
  const noServer = async () => L.discoverLivePanes({
    readRaw: async () => ({
      ok: false,
      stdout: "",
      stderr: "error connecting to /private/tmp/tmux-501/default (No such file or directory)\n",
      error: "Command failed",
    }),
  });

  const out = await L.listDevelopmentLanes({ listPanes: noServer, includeGitFacts: false });
  assert.equal(out.ok, true, "discovery succeeds with no tmux server");
  assert.ok(out.lanes.length >= 1, "durable lanes are returned with zero live panes");
  assert.ok(out.lanes.some((l) => l.lane_id === made.lane.lane_id), "the durable lane is present");
});

test("a real tmux failure still refuses rather than reporting an empty workspace", async () => {
  const broken = async () => ({ ok: false, panes: [], error: "spawn tmux ENOENT" });
  const out = await L.listDevelopmentLanes({ listPanes: broken, includeGitFacts: false });
  assert.equal(out.ok, false, "a broken tmux is still an error");
  assert.equal(out.error, "spawn tmux ENOENT");
});

// ---------------------------------------------------------------------------
// 2. Rebinding records the branch Git is actually on.
// ---------------------------------------------------------------------------

test("rebinding records Git truth, not the branch metadata expected", () => {
  const wt = join(WT_ROOT, "wt5-vacilando");
  git(REPO, ["worktree", "add", "-q", "-b", "agent/cursor/5-governed-approval-complete", wt]);

  // Slot metadata still carries the branch the worktree was CREATED for. The
  // metadata FILE basename is the key readAllMetadata matches on.
  writeFileSync(join(META_DIR, "wt5-vacilando.env"), [
    'ALLOY_WORKTREE_NAME="wt5-vacilando"',
    'ALLOY_WORKTREE_SLOT="5"',
    'ALLOY_WORKTREE_BRANCH="agent/cursor/5-vac-run-idle-complete"',
    `ALLOY_WORKTREE_PATH="${wt}"`,
    "",
  ].join("\n"));

  resetDevelopmentLanesForTests(ROOT);
  const lane = createDurableLane({ name: "Vacilando", origin: "test", root: ROOT }).lane;

  const bound = N.cmdBindLane({ laneId: lane.lane_id, worktree: "wt5-vacilando", root: ROOT });
  assert.ok(bound.ok, `bind succeeded: ${JSON.stringify(bound)}`);

  const after = getDurableLane(lane.lane_id, ROOT);
  // THE REGRESSION: this recorded agent/cursor/5-vac-run-idle-complete, which
  // startPersistentAgentSession then refuses as branch_mismatch — a binding
  // built from stale metadata makes the lane it describes unstartable.
  assert.equal(
    after.binding.branch,
    "agent/cursor/5-governed-approval-complete",
    "the branch Git is actually on wins over stale metadata",
  );
  assert.notEqual(after.binding.branch, "agent/cursor/5-vac-run-idle-complete");
  // The expectation is retained as metadata, not promoted to truth.
  assert.equal(bound.branch_source ?? "git", "git");
});

test("a detached worktree records no branch rather than a stale one", () => {
  const wt = join(WT_ROOT, "wt6-detached");
  git(REPO, ["worktree", "add", "-q", "--detach", wt]);
  assert.equal(git(wt, ["rev-parse", "--abbrev-ref", "HEAD"]), "HEAD", "fixture is detached");

  writeFileSync(join(META_DIR, "wt6-detached.env"), [
    'ALLOY_WORKTREE_NAME="wt6-detached"',
    'ALLOY_WORKTREE_BRANCH="agent/claude/6-some-old-branch"',
    `ALLOY_WORKTREE_PATH="${wt}"`,
    "",
  ].join("\n"));

  resetDevelopmentLanesForTests(ROOT);
  const lane = createDurableLane({ name: "Detached", origin: "test", root: ROOT }).lane;

  const bound = N.cmdBindLane({ laneId: lane.lane_id, worktree: "wt6-detached", root: ROOT });
  assert.ok(bound.ok, `bind succeeded: ${JSON.stringify(bound)}`);

  const after = getDurableLane(lane.lane_id, ROOT);
  // "HEAD" is not a branch name, and the stale expectation is not a substitute
  // for one. A detached worktree has no branch and says so.
  assert.equal(after.binding.branch, null, "detached HEAD records no branch");
  assert.notEqual(after.binding.branch, "HEAD");
  assert.notEqual(after.binding.branch, "agent/claude/6-some-old-branch");
});

test("an unreadable worktree still falls back to metadata rather than nothing", () => {
  // Not a Git repository: Git cannot answer, so the recorded expectation is the
  // best available evidence and is used — this is the ONLY case where it is.
  const plain = join(WT_ROOT, "wt7-notrepo");
  mkdirSync(plain, { recursive: true });
  writeFileSync(join(META_DIR, "wt7-notrepo.env"), [
    'ALLOY_WORKTREE_NAME="wt7-notrepo"',
    'ALLOY_WORKTREE_BRANCH="agent/claude/7-recorded"',
    `ALLOY_WORKTREE_PATH="${plain}"`,
    "",
  ].join("\n"));

  resetDevelopmentLanesForTests(ROOT);
  const lane = createDurableLane({ name: "NotRepo", origin: "test", root: ROOT }).lane;
  const bound = N.cmdBindLane({ laneId: lane.lane_id, worktree: "wt7-notrepo", root: ROOT });
  assert.ok(bound.ok, `bind succeeded: ${JSON.stringify(bound)}`);
  assert.equal(getDurableLane(lane.lane_id, ROOT).binding.branch, "agent/claude/7-recorded");
});

// ---------------------------------------------------------------------------
// 3. The repository registry is classified, and reconstructed on a fresh host.
// ---------------------------------------------------------------------------

test("repositories.json is classified RECONSTRUCTABLE and never restored", () => {
  const fam = D.STATE_FAMILIES.find((f) => f.paths.includes("repositories.json"));
  assert.ok(fam, "the repository registry has a declared state class");
  assert.equal(fam.class, "RECONSTRUCTABLE");
  // It holds absolute host paths. A MacBook's roots are wrong on a Mac mini.
  assert.equal(fam.backup, false, "never backed up");
  assert.equal(fam.restore, false, "never restored onto another host");
  assert.ok(!D.durableRelPaths().includes("repositories.json"), "excluded from the backup set");
});

test("a fresh host reconstructs the registry, so a bound worktree is managed", async () => {
  const fresh = mkdtempSync(join(tmpdir(), "vac-mini-fresh-"));
  const storePath = R.repositoryStorePath(fresh);
  assert.equal(existsSync(storePath), false, "a fresh host has no registry");

  // THE REGRESSION: nothing in production called this, so the registry stayed
  // empty, managedWorktreePath refused every path, startPersistentAgentSession
  // returned worktree_not_managed, and the run never left
  // waiting_for_agent_session.
  const out = await M.migrateLanesToAlloy({ root: fresh });
  assert.ok(out.ok, `reconstruction succeeded: ${JSON.stringify(out)}`);
  assert.equal(existsSync(storePath), true, "the registry now exists on disk");
  assert.equal(out.repository_created, true);
  // Migration must not disturb anything it does not own.
  assert.deepEqual(out.invariant_drift, [], "no lane invariant changed");

  const rec = R.getRepository(R.ALLOY_REPOSITORY_ID, fresh);
  assert.ok(rec, "the canonical repository is registered");
  assert.equal(rec.state, "ACTIVE");
  assert.equal(rec.worktree_parent, WT_ROOT);

  // The point of all of it: a worktree under the registered parent is managed,
  // so a provider start no longer refuses worktree_not_managed.
  const managed = R.managedWorktreePath(join(WT_ROOT, "wt5-vacilando"), { root: fresh });
  assert.equal(managed.ok, true, `worktree is managed: ${JSON.stringify(managed)}`);
  assert.equal(managed.repository_id, R.ALLOY_REPOSITORY_ID);

  // Idempotent: a second boot must not create a second record or churn state.
  const before = readFileSync(storePath, "utf8");
  const again = await M.migrateLanesToAlloy({ root: fresh });
  assert.ok(again.ok);
  assert.equal(again.repository_created, false, "the second boot creates nothing");
  assert.equal(readFileSync(storePath, "utf8"), before, "the registry is byte-identical");

  rmSync(fresh, { recursive: true, force: true });
});

test("Gateway boot reconstructs the registry from the immutable toolkit", async () => {
  // THE DEFECT ITSELF. migrateLanesToAlloy always worked when called; the bug
  // was that NOTHING in production called it — its only importer was a test.
  // Asserting the function works would have passed before the fix. This asserts
  // that BOOTING THE SERVER produces the registry, which is the property that
  // was actually missing.
  assert.equal(existsSync(R.repositoryStorePath(ROOT)), false, "not yet reconstructed");

  const { startVacilandoServer } = await import(join(LIB, "..", "vacilando-server.mjs"));
  let close = null;
  try {
    const started = await startVacilandoServer(0);
    close = started.close;
    // Reconstruction happens in background warm, just after listen.
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline && !existsSync(R.repositoryStorePath(ROOT))) {
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(
      existsSync(R.repositoryStorePath(ROOT)),
      true,
      "the Gateway reconstructed the repository registry at boot",
    );
    const rec = R.getRepository(R.ALLOY_REPOSITORY_ID, ROOT);
    assert.ok(rec, "the canonical repository is registered");
    assert.equal(rec.state, "ACTIVE");

    // And therefore a bound worktree is managed — the gate that had been
    // refusing every provider start on this host.
    const managed = R.managedWorktreePath(join(WT_ROOT, "wt5-vacilando"), { root: ROOT });
    assert.equal(managed.ok, true, `worktree is managed after boot: ${JSON.stringify(managed)}`);
  } finally {
    try { close?.(); } catch { /* */ }
  }
});

process.on("exit", () => {
  for (const d of [ROOT, WT_ROOT, REPO]) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* */ }
  }
});
