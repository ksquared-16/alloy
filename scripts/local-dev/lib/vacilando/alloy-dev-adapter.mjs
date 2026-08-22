/**
 * Alloy development adapter — candidate discovery for Connect Existing Work.
 *
 * Vacilando Core does not know what a sprint slot is. This adapter maps Alloy
 * local worktrees, slot metadata, and tmux sessions into adoption candidates.
 */
import { execFile, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import { gitFactsForPath, readAllMetadata, resolveRuntimeConfig, TOOLKIT_DIR } from "./workspace-facts.mjs";
import { isRuntimeAdoptionBlocked, listDurableLanes } from "./development-lane.mjs";
import { localNodeId } from "./execution-node.mjs";
import { normalizeExecutionProvider } from "./execution-providers.mjs";
import {
  inferClaudePresence,
  isAllowlistedSession,
  listTmuxPanesRaw,
  parseTmuxPaneLines,
  TMUX_SESSION_RE,
} from "./lanes.mjs";

export function candidateIdFor(worktreeName) {
  const name = String(worktreeName || "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) return null;
  return `cand_${name}`;
}

export function parseCandidateId(id) {
  const raw = String(id || "").trim();
  if (!raw.startsWith("cand_")) return null;
  const name = raw.slice(5);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) return null;
  return name;
}

function suggestedName(worktreeName, sprint) {
  const n = String(worktreeName || "").replace(/^wt\d+-/, "").replace(/-/g, " ");
  if (/communications/i.test(n)) return "Communications";
  if (/enrollment/i.test(n)) return "Enrollment";
  if (/records|roster/i.test(n)) return "Records / Roster";
  if (/identity|access/i.test(n)) return "Access & Identity";
  if (sprint && !/v2|phase|t00/i.test(sprint)) {
    return String(sprint).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return n.replace(/\b\w/g, (c) => c.toUpperCase()) || worktreeName;
}

export async function listAlloyAdoptionCandidates({
  observations = [],
  metadata = null,
  cfg = null,
  boundPaths = new Set(),
  boundSessions = new Set(),
} = {}) {
  const runtime = cfg || resolveRuntimeConfig();
  const meta = metadata || readAllMetadata(runtime);
  const byPath = new Map();

  const add = (partial) => {
    const path = partial.worktree_path;
    if (!path) return;
    const cur = byPath.get(path) || {};
    byPath.set(path, { ...cur, ...partial });
  };

  for (const m of meta) {
    if (!m.path || !existsSync(m.path)) continue;
    const slot = Number(m.slot);
    if (!Number.isInteger(slot) || slot < 1 || slot > 6) continue;
    if (String(m.lifecycle || "").toLowerCase() === "finished") continue;
    add({
      worktree_path: m.path,
      worktree_name: m.worktree || basename(m.path),
      branch: m.branch_expected || null,
      slot,
      provider: m.provider || null,
      sprint: m.sprint || null,
      agent_status: m.agent_status || null,
      source: "slot_metadata",
    });
  }

  for (const obs of observations) {
    const path = obs.worktree?.path;
    if (!path || !obs.worktree?.managed) continue;
    add({
      worktree_path: path,
      worktree_name: obs.worktree.name,
      branch: obs.git?.branch || null,
      slot: obs.slot,
      tmux_session: obs.tmux?.session || null,
      tmux_pane: obs.tmux?.pane_id || null,
      tmux_alive: Boolean(obs.tmux?.alive),
      claude_presence: obs.claude?.presence || "unknown",
      git_state: obs.git?.state || null,
      git_ahead: obs.git?.ahead,
      git_behind: obs.git?.behind,
      source: "tmux",
    });
  }

  const out = [];
  for (const cand of byPath.values()) {
    if (/vacilando-gateway/i.test(String(cand.worktree_name || ""))) continue;
    if (boundPaths.has(cand.worktree_path) || (cand.tmux_session && boundSessions.has(cand.tmux_session))) {
      cand.already_connected = true;
    }
    if (isRuntimeAdoptionBlocked(cand)) {
      cand.runtime_blocked = true;
    }
    const id = candidateIdFor(cand.worktree_name);
    if (!id) continue;
    cand.candidate_id = id;
    cand.suggested_name = suggestedName(cand.worktree_name, cand.sprint);
    if (cand.git_state == null && cand.worktree_path) {
      try {
        const facts = await gitFactsForPath(cand.worktree_path, runtime);
        cand.git_state = facts.git;
        if (facts.branch && facts.branch !== "?") cand.branch = facts.branch;
        const ab = String(facts.ahead_behind || "").split("/");
        cand.git_ahead = Number(ab[0]) || 0;
        cand.git_behind = Number(ab[1]) || 0;
      } catch { /* */ }
    }
    out.push(cand);
  }
  out.sort((a, b) => String(a.worktree_name).localeCompare(String(b.worktree_name)));
  return out;
}

export function lookupCandidate(candidates, candidateId) {
  const id = String(candidateId || "").trim();
  if (!id || id.includes("/") || id.includes("..") || id.startsWith(".")) return null;
  return (candidates || []).find((c) => c.candidate_id === id) || null;
}

function realProvisionAllowed() {
  if (process.env.VACILANDO_ADMISSION_PROVISION === "0") return false;
  if (process.env.VACILANDO_ADMISSION_PROVISION === "1") return true;
  const root = (process.env.ALLOY_RUNTIME_ROOT || "").replace(/\/+$/, "");
  return /\/gateway$/.test(root);
}

export function sprintSlugFromLaneName(name, laneId) {
  const base = String(name || "lane")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "lane";
  const tag = String(laneId || "").replace(/^lane_/, "").slice(0, 6);
  return `${base}-${tag}`;
}

/** Alloy answers: can this queued lane safely be provisioned now? */
/**
 * Which worktrees are currently running an agent, from live evidence.
 *
 * `providerPanes` is a list of {cwd, command, title, dead} — the same pane facts
 * lane discovery already reads. A worktree counts as running an agent only when
 * a live pane sits inside it AND that pane looks like an agent.
 */
export function agentBearingWorktreePaths(providerPanes = []) {
  const paths = new Set();
  for (const pane of providerPanes || []) {
    if (!pane || pane.dead) continue;
    const cwd = String(pane.cwd || "").replace(/\/+$/, "");
    if (!cwd) continue;
    const cmd = String(pane.command || "");
    const title = String(pane.title || "");
    // Same contract lane presence uses: a named agent, or the TUI reporting its
    // own semver as the process name. A shell or a node script is NOT an agent.
    const isAgent = /claude|cursor[- ]?agent/i.test(cmd)
      || /claude|cursor[- ]?agent/i.test(title)
      || /^\d+\.\d+\.\d+$/.test(cmd);
    if (isAgent) paths.add(cwd);
  }
  return paths;
}

/**
 * Host capacity for starting another agent.
 *
 * WHY THIS COUNTS PANES. It used to count METADATA: every worktree whose
 * `lifecycle` was not "finished" was treated as running an agent, and a worktree
 * whose `agent_status` was EMPTY counted as active too. Measured on this host,
 * that reported 5 active providers against a cap of 3 while only ONE of those
 * five worktrees had a live agent in it — three sprints had ended without their
 * metadata being marked finished, and a fourth had never recorded a status. New
 * lanes were refused for capacity that nothing was using.
 *
 * A slot is a place to work; a provider is a running process. Only the second
 * is scarce, so only the second is counted — and it is counted from live panes,
 * which cannot go stale. Metadata is still the fallback when pane facts are not
 * available, but "unknown status" no longer means "active".
 */
export function assessProvisionCapacity({ cfg = null, metadata = null, providerPanes = null } = {}) {
  const runtime = cfg || resolveRuntimeConfig();
  const meta = metadata || readAllMetadata(runtime);
  const occupied = meta.filter((m) => {
    const slot = Number(m.slot);
    if (!Number.isInteger(slot) || slot < 1 || slot > 6) return false;
    if (String(m.lifecycle || "").toLowerCase() === "finished") return false;
    return Boolean(m.path && existsSync(m.path));
  });
  const freeSlots = Math.max(0, 6 - occupied.length);
  const maxProviders = Number(process.env.ALLOY_MAX_ACTIVE_PROVIDERS || 3);

  let activeProviders;
  let holders;
  let countedFrom;
  if (Array.isArray(providerPanes)) {
    // Live truth: every agent-bearing pane on the host, whether or not a slot
    // record exists for it. Two of this host's busiest worktrees have no
    // metadata file at all, so a metadata-only count under-counts them exactly
    // as badly as it over-counts the dormant ones.
    const live = agentBearingWorktreePaths(providerPanes);
    activeProviders = live.size;
    holders = [...live].map((path) => {
      const m = occupied.find((x) => String(x.path || "").replace(/\/+$/, "") === path);
      return { path, name: m?.name || path.split("/").pop() || null, slot: m?.slot ?? null };
    });
    countedFrom = "live_panes";
  } else {
    activeProviders = occupied.filter((m) => {
      const st = String(m.agent_status || "").toLowerCase();
      // An empty status is UNKNOWN, not running. Treating it as active is what
      // let a dormant worktree hold a provider slot indefinitely.
      return st === "active" || st === "open";
    }).length;
    holders = occupied
      .filter((m) => ["active", "open"].includes(String(m.agent_status || "").toLowerCase()))
      .map((m) => ({ path: m.path, name: m.name || null, slot: m.slot ?? null }));
    countedFrom = "metadata";
  }

  const blockers = [];
  if (freeSlots <= 0) blockers.push("no_free_slot");
  if (activeProviders >= maxProviders) blockers.push("provider_capacity");
  return {
    ok: blockers.length === 0,
    available: blockers.length === 0,
    free_slots: freeSlots,
    occupied_slots: occupied.length,
    active_providers: activeProviders,
    max_providers: maxProviders,
    // Who is actually holding the capacity, so a refusal can name them.
    provider_holders: holders,
    counted_from: countedFrom,
    blockers,
    execution_node: localNodeId(),
  };
}

function spawnToolkit(bin, args, { timeout = 180_000 } = {}) {
  return new Promise((resolve) => {
    execFile(join(TOOLKIT_DIR, bin), args, {
      timeout,
      env: process.env,
      maxBuffer: 8 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        stdout: stdout || "",
        stderr: stderr || "",
        error: err ? String(err.message || err) : null,
      });
    });
  });
}

/**
 * Canonical provision: alloy-sprint-start. Vacilando does not create
 * worktrees, branches, slots, or ports itself.
 */
export async function provisionLaneBinding({ lane, run } = {}) {
  if (!realProvisionAllowed()) {
    return { ok: false, error: "provision_adapter_disabled", skip_queue: true };
  }
  const provider = normalizeExecutionProvider(lane?.binding?.provider, "claude") || "claude";
  const name = sprintSlugFromLaneName(lane?.name, lane?.lane_id);
  const args = [name, "--provider", provider, "--slot", "auto", "--without-server"];
  if (run?.instruction || run?.run_id) {
    args.push("--objective", String(lane?.name || name));
  }
  const out = await spawnToolkit("alloy-sprint-start", args);
  if (!out.ok) {
    return { ok: false, error: out.stderr?.slice(0, 400) || out.error || "sprint_start_failed", created: null };
  }
  const slot = Number((out.stdout.match(/slot:\s+(\d+)/i) || [])[1]);
  const worktree = (out.stdout.match(/worktree:\s+(\S+)/i) || [])[1] || null;
  const path = (out.stdout.match(/path:\s+(\S+)/i) || [])[1] || null;
  const branch = (out.stdout.match(/Branch:\s+(\S+)/i) || [])[1] || null;
  return {
    ok: true,
    created: {
      by_vacilando: true,
      worktree_name: worktree,
      worktree_path: path,
      slot: Number.isInteger(slot) ? slot : null,
      branch,
      toolkit: "alloy-sprint-start",
    },
    pre_existing: [],
    binding: {
      worktree_path: path,
      worktree_name: worktree,
      branch,
      tmux_session: worktree ? `alloy-${String(worktree).replace(/^wt\d+-/, "").slice(0, 40)}` : null,
      slot: Number.isInteger(slot) ? slot : null,
      provider,
    },
  };
}

export async function inspectWorktreeGit(worktreePath) {
  const facts = await gitFactsForPath(worktreePath, resolveRuntimeConfig());
  return {
    dirty: facts.git === "dirty" || facts.git === "conflict",
    conflict: Boolean(facts.conflict) || facts.git === "conflict",
    branch: facts.branch,
    head: facts.head,
    ahead_behind: facts.ahead_behind,
    modified: facts.modified || 0,
    untracked: facts.untracked || 0,
    last_commit_at: facts.last_commit_at || null,
    ambiguous: false,
  };
}

export async function commitWorktreeCheckpoint({ path, message } = {}) {
  const cwd = String(path || "");
  if (!cwd || cwd.includes("..") || /[;|&]/.test(cwd)) return { ok: false, error: "path_refused" };
  const add = await new Promise((resolve) => {
    execFile("git", ["-C", cwd, "add", "-A"], { timeout: 15000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout, stderr, error: err ? String(err.message || err) : null });
    });
  });
  if (!add.ok) return { ok: false, error: add.error || "git_add_failed" };
  const commit = await new Promise((resolve) => {
    execFile("git", ["-C", cwd, "commit", "-m", String(message)], { timeout: 20000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout, stderr, error: err ? String(err.message || err) : null });
    });
  });
  if (!commit.ok) return { ok: false, error: commit.stderr?.slice(0, 240) || commit.error || "commit_failed" };
  const sha = await new Promise((resolve) => {
    execFile("git", ["-C", cwd, "rev-parse", "HEAD"], { timeout: 8000 }, (err, stdout) => {
      resolve(err ? null : String(stdout || "").trim());
    });
  });
  return { ok: true, sha, pushed: false };
}

export async function syncWorktreeFromBase({ worktreeName } = {}) {
  const name = String(worktreeName || "");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) return { ok: false, error: "invalid_worktree_name" };
  const out = await spawnToolkit("alloy-worktree-sync", [name], { timeout: 120_000 });
  if (!out.ok) {
    const blob = `${out.stdout}\n${out.stderr}`;
    const conflict = /conflict|rebase in progress|could not apply/i.test(blob);
    return { ok: false, error: out.stderr?.slice(0, 400) || out.error || "sync_failed", conflict };
  }
  return { ok: true, stdout: out.stdout };
}

function tmuxBin() {
  const home = process.env.HOME || homedir();
  for (const p of ["/usr/local/bin/tmux", "/opt/homebrew/bin/tmux", join(home, ".local/bin/tmux")]) {
    if (existsSync(p)) return p;
  }
  return "tmux";
}

function resolveClaudeBin() {
  const home = process.env.HOME || homedir();
  for (const p of [join(home, ".local/bin/claude"), "/usr/local/bin/claude", "/opt/homebrew/bin/claude"]) {
    if (existsSync(p)) return p;
  }
  return "claude";
}

let tmuxRunImpl = null;
let listPanesImpl = null;
let sessionStartImpl = null;

export function setAlloyAdapterImplForTests(impl = {}) {
  tmuxRunImpl = typeof impl.runTmux === "function" ? impl.runTmux : null;
  listPanesImpl = typeof impl.listPanes === "function" ? impl.listPanes : null;
  sessionStartImpl = typeof impl.startPersistentAgentSession === "function" ? impl.startPersistentAgentSession : null;
}

export function resetAlloyAdapterImplForTests() {
  tmuxRunImpl = null;
  listPanesImpl = null;
  sessionStartImpl = null;
}

function runTmuxSync(args, { timeout = 8000 } = {}) {
  if (tmuxRunImpl) return tmuxRunImpl(args);
  try {
    const stdout = execFileSync(tmuxBin(), args, {
      encoding: "utf8",
      timeout,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, stdout: String(stdout || ""), stderr: "" };
  } catch (e) {
    return {
      ok: false,
      stdout: String(e.stdout || ""),
      stderr: String(e.stderr || e.message || e).slice(0, 400),
      error: e.code || "tmux_failed",
    };
  }
}

export function tmuxSessionNameForLane(laneName, worktreeName) {
  const src = String(laneName || worktreeName || "lane")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/^wt\d+-/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  const name = `alloy-${src || "lane"}`;
  return TMUX_SESSION_RE.test(name) ? name : null;
}

function paneCwd(paneId) {
  const out = runTmuxSync(["display-message", "-p", "-t", paneId, "#{pane_current_path}"]);
  return out.ok ? String(out.stdout || "").trim() : "";
}

function sessionPane(session) {
  const out = runTmuxSync(["list-panes", "-t", session, "-F", "#{pane_id}|#{pane_current_path}|#{pane_current_command}|#{pane_pid}"]);
  if (!out.ok) return null;
  const line = String(out.stdout || "").trim().split("\n").find(Boolean);
  if (!line) return null;
  const [pane_id, cwd, command, pid] = line.split("|");
  return { pane_id, cwd, command, pid };
}

function sessionExists(session) {
  return runTmuxSync(["has-session", "-t", session], { timeout: 3000 }).ok;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait until the interactive Claude TUI can accept a pasted instruction. */
export async function waitForClaudePrompt(session, { timeoutMs = 20000, intervalMs = 400 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const pane = sessionPane(session);
    const cap = runTmuxSync(["capture-pane", "-p", "-t", pane?.pane_id || `${session}:0.0`]);
    const text = String(cap.stdout || "");
    const present = inferClaudePresence({ command: pane?.command, title: "" }) === "present";
    if (present && /[❯›]/.test(text)) {
      return { ok: true, waited_ms: Date.now() - started };
    }
    await sleep(intervalMs);
  }
  return { ok: false, error: "claude_prompt_timeout", waited_ms: Date.now() - started };
}

async function liveClaudePanes() {
  if (listPanesImpl) return listPanesImpl();
  const raw = await listTmuxPanesRaw();
  const panes = parseTmuxPaneLines(raw?.stdout || "");
  return panes.filter((p) => isAllowlistedSession(p.session) && inferClaudePresence(p) === "present");
}

function laneForClaudePane(pane, lanes) {
  const session = pane?.session || null;
  const cwd = pane?.cwd || null;
  return (lanes || []).find((l) =>
    (session && l.binding?.tmux_session === session)
    || (cwd && l.binding?.worktree_path === cwd)
  ) || null;
}

/**
 * A live Claude pane occupies session-start capacity unless it belongs to a
 * Cursor lane or a leftover finished session (work COMPLETE, no current run).
 */
export function claudePaneOccupiesCapacity(pane, lanes, root, {
  activeRunForLane,
  isTerminalRunState,
  listExecutionRunsForLane,
} = {}) {
  const hit = laneForClaudePane(pane, lanes);
  if (!hit) return true;
  if (normalizeExecutionProvider(hit.binding?.provider, "claude") === "cursor") return false;
  const run = activeRunForLane ? activeRunForLane(hit.lane_id, root) : null;
  if (run && run.state !== "QUEUED") return true;
  const prev = listExecutionRunsForLane
    ? listExecutionRunsForLane(hit.lane_id, root).filter((r) => isTerminalRunState(r.state)).at(-1)
    : null;
  if (!run && prev?.state === "COMPLETE") return false;
  return true;
}

/**
 * Capacity to start a provider on an *existing* binding. Does not require a
 * free sprint slot — the worktree already occupies one.
 */
export async function assessSessionStartCapacity({ maxProviders = null, root = null } = {}) {
  const max = Number(maxProviders ?? process.env.ALLOY_MAX_ACTIVE_PROVIDERS ?? 3);
  const live = await liveClaudePanes();
  const runtime = root || process.env.ALLOY_RUNTIME_ROOT?.trim() || undefined;
  const lanes = listDurableLanes(runtime);
  const {
    activeRunForLane,
    isTerminalRunState,
    listExecutionRunsForLane,
  } = await import("./execution-run.mjs");
  const runFns = { activeRunForLane, isTerminalRunState, listExecutionRunsForLane };
  const occupyingPanes = live.filter((p) => claudePaneOccupiesCapacity(p, lanes, runtime, runFns));
  const active = occupyingPanes.length;
  const blockers = [];
  if (!(max > 0)) blockers.push("provider_capacity");
  if (active >= max) blockers.push("provider_capacity");
  return {
    ok: blockers.length === 0,
    available: blockers.length === 0,
    active_providers: active,
    max_providers: max,
    blockers,
    kind: "session_start",
    occupying: occupyingPanes.map((p) => ({
      session: p?.session || null,
      cwd: p?.cwd || null,
    })),
  };
}

/**
 * Create the missing persistent tmux runtime for an already-bound worktree.
 * Does not create a worktree, branch, or slot. Does not mutate Git.
 * Starts one interactive Claude in the pane (never `claude -p`).
 */
export async function startPersistentAgentSession({
  worktreePath,
  worktreeName = null,
  laneName = null,
  existingTmuxSession = null,
  expectedBranch = null,
  providerSessionId = null,
  runtimeRoot = null,
} = {}) {
  if (sessionStartImpl) {
    return sessionStartImpl({
      worktreePath, worktreeName, laneName, existingTmuxSession, expectedBranch, providerSessionId, runtimeRoot,
    });
  }
  const cwd = String(worktreePath || "");
  if (!cwd || cwd.includes("..") || /[;|&]/.test(cwd)) {
    return { ok: false, error: "path_refused" };
  }
  const cfg = resolveRuntimeConfig();
  const root = String(cfg.worktree_root || join(homedir(), "Code", "alloy-worktrees")).replace(/\/+$/, "");
  if (!(cwd === root || cwd.startsWith(`${root}/`))) {
    return { ok: false, error: "worktree_not_managed" };
  }
  if (!existsSync(cwd)) return { ok: false, error: "worktree_missing" };
  if (isRuntimeAdoptionBlocked({ worktree_path: cwd, worktree_name: worktreeName })) {
    return { ok: false, error: "runtime_adoption_blocked" };
  }
  if (expectedBranch) {
    const facts = await gitFactsForPath(cwd, cfg);
    if (facts?.branch && facts.branch !== "?" && facts.branch !== expectedBranch) {
      return { ok: false, error: "branch_mismatch", branch: facts.branch, expected: expectedBranch };
    }
  }

  let session = String(existingTmuxSession || "").trim();
  if (session && !TMUX_SESSION_RE.test(session)) {
    return { ok: false, error: "invalid_tmux_name" };
  }
  if (!session) {
    session = tmuxSessionNameForLane(laneName, worktreeName);
    if (!session) return { ok: false, error: "invalid_tmux_name" };
  }

  const live = await liveClaudePanes();
  const other = live.find((p) => p.cwd === cwd || p.cwd?.startsWith(`${cwd}/`));
  if (other && other.session !== session) {
    return { ok: false, error: "provider_already_running", tmux_session: other.session };
  }

  let createdTmux = false;
  if (sessionExists(session)) {
    const pane = sessionPane(session);
    if (pane?.cwd && pane.cwd !== cwd && pane.cwd !== `${cwd}`) {
      if (existingTmuxSession) {
        return { ok: false, error: "tmux_cwd_mismatch", tmux_session: session, cwd: pane.cwd };
      }
      const fallback = tmuxSessionNameForLane(null, worktreeName);
      if (!fallback || fallback === session) {
        return { ok: false, error: "tmux_cwd_mismatch", tmux_session: session, cwd: pane.cwd };
      }
      session = fallback;
    }
  }
  if (sessionExists(session)) {
    const pane = sessionPane(session);
    if (pane?.cwd && pane.cwd !== cwd && pane.cwd !== `${cwd}`) {
      return { ok: false, error: "tmux_cwd_mismatch", tmux_session: session, cwd: pane.cwd };
    }
  } else {
    const created = runTmuxSync(["new-session", "-d", "-s", session, "-c", cwd]);
    if (!created.ok) {
      return { ok: false, error: "tmux_create_failed", detail: created.stderr || created.error };
    }
    createdTmux = true;
  }

  const gatewayRoot = runtimeRoot || process.env.ALLOY_RUNTIME_ROOT || "";
  if (gatewayRoot) {
    runTmuxSync(["set-environment", "-t", session, "ALLOY_RUNTIME_ROOT", gatewayRoot]);
  }
  const home = process.env.HOME || homedir();
  const pathValue = `${join(home, ".local/bin")}:/usr/local/bin:/opt/homebrew/bin:${process.env.PATH || "/usr/bin:/bin"}`;
  runTmuxSync(["set-environment", "-t", session, "PATH", pathValue]);

  const pane = sessionPane(session);
  if (!pane?.pane_id) {
    if (createdTmux) runTmuxSync(["kill-session", "-t", session]);
    return { ok: false, error: "pane_unavailable", created: { tmux: createdTmux } };
  }
  if (pane.cwd && pane.cwd !== cwd) {
    if (createdTmux) runTmuxSync(["kill-session", "-t", session]);
    return { ok: false, error: "tmux_cwd_mismatch", cwd: pane.cwd };
  }

  const claudePresent = inferClaudePresence({ command: pane.command, title: "" }) === "present";
  let startedProvider = false;
  if (!claudePresent) {
    const claude = resolveClaudeBin();
    const argv = [claude];
    if (providerSessionId) argv.push("--session-id", String(providerSessionId));
    const spawn = runTmuxSync([
      "respawn-pane", "-k", "-c", cwd, "-t", pane.pane_id, "--",
      ...argv,
    ]);
    if (!spawn.ok) {
      if (createdTmux) runTmuxSync(["kill-session", "-t", session]);
      return {
        ok: false,
        error: "provider_start_failed",
        detail: spawn.stderr || spawn.error,
        rolled_back: createdTmux,
        created: { tmux: createdTmux, provider: false },
      };
    }
    startedProvider = true;
  }

  if (startedProvider) {
    await waitForClaudePrompt(session);
  }

  const after = sessionPane(session);
  return {
    ok: true,
    tmux_session: session,
    pane_id: after?.pane_id || pane.pane_id,
    cwd,
    created: { tmux: createdTmux, provider: startedProvider },
    adopted: !createdTmux && !startedProvider,
    pre_existing: createdTmux ? [] : ["tmux"],
    toolkit: "alloy-dev-adapter.startPersistentAgentSession",
  };
}

/**
 * Stop the tmux session created for a lane binding. Allowlisted names only.
 * Does not delete the worktree.
 */
export function stopPersistentAgentSession({ tmuxSession } = {}) {
  const session = String(tmuxSession || "").trim();
  if (!session || !TMUX_SESSION_RE.test(session)) {
    return { ok: false, error: "invalid_tmux_name" };
  }
  if (!isAllowlistedSession(session)) {
    return { ok: false, error: "tmux_not_allowlisted" };
  }
  if (!sessionExists(session)) {
    return { ok: true, already_gone: true, tmux_session: session };
  }
  const out = runTmuxSync(["kill-session", "-t", session]);
  return {
    ok: out.ok,
    tmux_session: session,
    error: out.ok ? null : (out.stderr?.slice(0, 240) || out.error || "tmux_kill_failed"),
  };
}

/**
 * Free the Alloy sprint slot. Keeps the worktree. Never pushes or merges.
 */
export async function releaseSprintSlot({ slot, acknowledgeUncommitted = false } = {}) {
  const n = Number(slot);
  if (!Number.isInteger(n) || n < 1 || n > 6) return { ok: false, error: "invalid_slot" };
  const args = [String(n)];
  if (acknowledgeUncommitted) args.push("--acknowledge-uncommitted");
  const out = await spawnToolkit("alloy-sprint-finish", args, { timeout: 120_000 });
  return {
    ok: out.ok,
    slot: n,
    stdout: out.stdout || "",
    error: out.ok ? null : (out.stderr?.slice(0, 400) || out.error || "sprint_finish_failed"),
  };
}
