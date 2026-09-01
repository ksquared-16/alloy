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

test("capacity is not degraded by the absence of a tmux server", async () => {
  // THE SECOND HALF OF THE SAME DEFECT. Five call sites read the raw tmux exit
  // code instead of the discovery boundary, so a fresh host left `panes` null.
  // assessProviderCapacity correctly reports null as `degraded` — it refuses to
  // guess — and a degraded verdict refuses the start. The Mac mini therefore
  // answered `provider_capacity` with active_providers 0 of 3: capacity blocked
  // a start because nothing at all was running, which is the one case that must
  // always be allowed.
  //
  // TMUX_TMPDIR at an empty directory is the real fresh-host condition: tmux
  // exits 1 with "error connecting to .../tmux-501/default".
  const emptyTmux = mkdtempSync(join(tmpdir(), "vac-mini-notmux-"));
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", `
    const A = await import(${JSON.stringify(join(LIB, "alloy-dev-adapter.mjs"))});
    const cap = await A.assessSessionStartCapacity({});
    process.stdout.write(JSON.stringify(cap));
  `], {
    encoding: "utf8",
    env: {
      ...process.env,
      TMUX_TMPDIR: emptyTmux,
      ALLOY_RUNTIME_ROOT: ROOT,
      ALLOY_CONFIG_FILE: CFG,
      VACILANDO_DURABLE_LANES: "1",
    },
  });
  assert.equal(r.status, 0, `assessment ran: ${r.stderr}`);

  // Prove the fixture really had no tmux server, or the assertions below are hollow.
  const probe = spawnSync("tmux", ["list-panes", "-a"], {
    encoding: "utf8", env: { ...process.env, TMUX_TMPDIR: emptyTmux },
  });
  assert.notEqual(probe.status, 0, "fixture has no tmux server");

  const cap = JSON.parse(r.stdout);
  assert.equal(cap.degraded, false, "zero panes is knowledge, not ignorance");
  assert.equal(cap.active_providers, 0, "nothing is running");
  assert.equal(cap.ok, true, "a start is permitted when no provider holds a seat");
  assert.equal(cap.available, true);

  rmSync(emptyTmux, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 4. An Agent Session asserts a live process, and does not survive a move.
// ---------------------------------------------------------------------------

test("a session carried in from another node is ended, not left ACTIVE", async () => {
  const { createAgentSession, markAgentSessionActive, getAgentSession, patchAgentSession } =
    await import(join(LIB, "agent-session.mjs"));
  const LC = await import(join(LIB, "agent-session-lifecycle.mjs"));

  resetDevelopmentLanesForTests(ROOT);
  const lane = createDurableLane({ name: "Carried", origin: "test", root: ROOT }).lane;
  const made = createAgentSession({ laneId: lane.lane_id, root: ROOT });
  assert.ok(made.ok);
  markAgentSessionActive(made.session.agent_session_id, { root: ROOT });
  assert.equal(getAgentSession(made.session.agent_session_id, ROOT).state, "ACTIVE");

  // THE REGRESSION: the MacBook's ACTIVE session survived the restore, and
  // createAgentSession then refused lane_has_active_session forever — the lane
  // could never start a provider again.
  const blocked = createAgentSession({ laneId: lane.lane_id, root: ROOT });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, "lane_has_active_session");

  // Zero live panes is a positive observation that no provider is running.
  const out = await LC.reconcileAgentSessionsWithoutRuntime({ root: ROOT, panes: [] });
  assert.ok(out.ok);
  assert.equal(out.ended.length, 1, `ended one session: ${JSON.stringify(out)}`);
  assert.equal(getAgentSession(made.session.agent_session_id, ROOT).state, "ENDED");
  assert.equal(getAgentSession(made.session.agent_session_id, ROOT).end_reason, "runtime_absent_on_this_node");

  // And the lane can start again.
  const again = createAgentSession({ laneId: lane.lane_id, root: ROOT });
  assert.equal(again.ok, true, "a provider can be started once more");
  patchAgentSession(again.session.agent_session_id, { state: "SUSPENDED" }, { root: ROOT });

  // SUSPENDED is what an operator resumes. It is not a dead process and must
  // never be reaped — that would silently discard put-down work.
  const second = await LC.reconcileAgentSessionsWithoutRuntime({ root: ROOT, panes: [] });
  assert.deepEqual(second.ended, [], "a suspended session survives");
  assert.equal(getAgentSession(again.session.agent_session_id, ROOT).state, "SUSPENDED");
});

test("a live pane keeps its session, and unreadable tmux ends nothing", async () => {
  const { createAgentSession, markAgentSessionActive, getAgentSession } =
    await import(join(LIB, "agent-session.mjs"));
  const { rebindDurableLane } = await import(join(LIB, "development-lane.mjs"));
  const LC = await import(join(LIB, "agent-session-lifecycle.mjs"));

  resetDevelopmentLanesForTests(ROOT);
  const lane = createDurableLane({ name: "Live", origin: "test", root: ROOT }).lane;
  const wt = join(WT_ROOT, "wt5-vacilando");
  rebindDurableLane(lane.lane_id, {
    worktree_path: wt, worktree_name: "wt5-vacilando", tmux_session: "alloy-live", provider: "claude",
  }, { root: ROOT });
  const made = createAgentSession({ laneId: lane.lane_id, root: ROOT });
  markAgentSessionActive(made.session.agent_session_id, { root: ROOT });

  // A pane that is this lane's, running Claude: the session is real.
  const kept = await LC.reconcileAgentSessionsWithoutRuntime({
    root: ROOT,
    panes: [{ session: "alloy-live", cwd: wt, command: "claude", title: "", dead: false }],
  });
  assert.deepEqual(kept.ended, [], "a session with a live pane is kept");
  assert.equal(getAgentSession(made.session.agent_session_id, ROOT).state, "ACTIVE");

  // Unknown is not absent. A tmux that could not answer is not evidence that a
  // provider stopped, and reaping on it would end live sessions during a
  // transient fault — the opposite failure, and a far worse one.
  const unreadable = await LC.reconcileAgentSessionsWithoutRuntime({
    root: ROOT,
    discover: async () => ({ ok: false, panes: [], error: "spawn tmux ENOENT" }),
  });
  assert.deepEqual(unreadable.ended, [], "an unreadable tmux ends nothing");
  assert.equal(unreadable.skipped, "pane_discovery_unavailable");
  assert.equal(getAgentSession(made.session.agent_session_id, ROOT).state, "ACTIVE");

  // And with a positive observation of zero panes, the same session IS ended —
  // proving the two cases are genuinely distinguished, not both no-ops.
  const observed = await LC.reconcileAgentSessionsWithoutRuntime({
    root: ROOT,
    discover: async () => ({ ok: true, panes: [], tmux_server_running: false }),
  });
  assert.equal(observed.ended.length, 1, "zero observed panes ends the session");
  assert.equal(getAgentSession(made.session.agent_session_id, ROOT).state, "ENDED");
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
