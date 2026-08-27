/**
 * S1 — provider-descendant ancestry attribution.
 *
 * THE QUESTION THIS ANSWERS. "Which provider-owned workload and descendants are
 * consuming host resources right now?" Nothing could answer it. Every capacity
 * mechanism keys on a worktree or a lane, so a validation suite spawned by a
 * provider into /private/tmp consumed roughly half the machine while appearing
 * in no ledger: load reached 54.47 with two vitest suites that no resource
 * owner had ever heard of.
 *
 * WHY ANCESTRY AND NOT CWD. The workload that hurt most had no worktree at all.
 * Its owner was never in doubt — the process tree ran straight back to the
 * Surfaces provider seat (89207 -> 50142 -> 50699 -> 50820) — but every lookup
 * we had started from a directory. Ancestry is the durable link; cwd only says
 * where a process happens to stand, and on this host it is often not even
 * readable, because `lsof` is absent.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not terminate anything, change
 * admission, cap workers, reclaim seats, or classify a process as stale. It
 * reads `ps` and reports. Visibility precedes enforcement: a limit imposed
 * before the ledger can show it is right is a guess with a kill switch.
 *
 * CANONICAL OWNERS ARE EXTENDED, NOT REPLACED. Seats come from
 * provider-capacity's correlateProviderProcesses(); lanes from development-lane;
 * runs from execution-run; repositories from repository-registry. This module
 * owns exactly one new thing: the descendant walk.
 */

export const PROCESS_ATTRIBUTION_SCHEMA = "vacilando.process_attribution.v1";

/**
 * How an attribution was reached.
 *
 * `seat` the process IS a provider seat.
 * `ancestry` a descendant walk reached a seat — the authoritative signal.
 * `unattributed` no seat in its ancestry. Reported, never owned by guess.
 */
export const ATTRIBUTION_STATUS = Object.freeze(["seat", "ancestry", "unattributed"]);

/**
 * Depth bound for the ancestry walk.
 *
 * Cycles are handled by the `seen` set, not by this bound — a mutation test
 * removing the bound still passed the cycle fixture, which is how that got
 * corrected. What the bound actually does is cap CHAIN LENGTH on deep but
 * perfectly acyclic trees, so one pathological process cannot make every record
 * carry a hundred frames. The real chains are shallow: seat -> shell -> runner
 * -> worker is four, and eight leaves generous room.
 */
export const MAX_ANCESTRY_DEPTH = 8;

/** pid 1 and 0 are never provider seats; treat them as walk terminators. */
const ROOT_PIDS = new Set([0, 1]);

/**
 * Parse `ps -Ao pid=,ppid=,command=` output.
 *
 * Tolerant of the column padding ps emits — parsing that padding by hand once
 * mistook it for an empty first field, so fields are split on whitespace with
 * the command taking everything that remains.
 */
export function parseProcessTable(text) {
  const rows = [];
  for (const raw of String(text ?? "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    const pid = Number(m[1]);
    const ppid = Number(m[2]);
    if (!Number.isInteger(pid) || !Number.isInteger(ppid)) continue;
    rows.push({ pid, ppid, command: m[3] });
  }
  return rows;
}

/** pid -> row, and ppid -> children. Built once; every walk reads it. */
export function buildProcessIndex(rows = []) {
  const byPid = new Map();
  const childrenOf = new Map();
  for (const r of rows) {
    if (!r || !Number.isInteger(r.pid)) continue;
    byPid.set(r.pid, r);
    if (!childrenOf.has(r.ppid)) childrenOf.set(r.ppid, []);
    childrenOf.get(r.ppid).push(r.pid);
  }
  return { byPid, childrenOf };
}

/**
 * Walk from a pid toward init, returning the chain [self, parent, ...].
 *
 * Bounded and cycle-safe: a pid already seen ends the walk rather than
 * repeating it.
 */
export function ancestryChain(pid, index, { maxDepth = MAX_ANCESTRY_DEPTH } = {}) {
  const chain = [];
  const seen = new Set();
  let cur = Number(pid);
  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (!Number.isInteger(cur) || seen.has(cur)) break;
    const row = index.byPid.get(cur);
    if (!row) {
      // A pid we cannot see still belongs in the chain — the gap is evidence.
      if (chain.length === 0) chain.push({ pid: cur, ppid: null, command: null, visible: false });
      break;
    }
    seen.add(cur);
    chain.push({ pid: row.pid, ppid: row.ppid, command: row.command, visible: true });
    if (ROOT_PIDS.has(row.ppid)) break;
    cur = row.ppid;
  }
  return chain;
}

/**
 * The first seat found walking up from a pid, or null.
 *
 * `seatPids` is a Set of provider-seat pids supplied by provider-capacity. The
 * seat itself resolves to itself, which is what makes a seat's own footprint
 * countable alongside its descendants'.
 */
export function resolveOwningSeat(pid, index, seatPids, { maxDepth = MAX_ANCESTRY_DEPTH } = {}) {
  const chain = ancestryChain(pid, index, { maxDepth });
  for (let i = 0; i < chain.length; i += 1) {
    if (seatPids.has(chain[i].pid)) {
      return { seat_pid: chain[i].pid, depth: i, chain };
    }
  }
  return { seat_pid: null, depth: null, chain };
}

/** Normalise a filesystem path for comparison; never throws. */
function normalizePath(p) {
  const s = String(p || "").trim();
  if (!s) return null;
  return s.replace(/\/+$/, "");
}

/**
 * Best-effort working directory.
 *
 * `lsof` is the only way to read another process's cwd on macOS, and it is
 * ABSENT on this host — so this returns null far more often than it returns a
 * path, and callers must treat null as "not observable" rather than "not in a
 * worktree". The command line is used as a secondary signal by
 * executionLocationFor(), never as a substitute for ancestry.
 */
export function observeCwd(pid, { lsof = null } = {}) {
  if (typeof lsof !== "function") return { cwd: null, source: "unavailable" };
  try {
    const out = lsof(pid);
    const cwd = normalizePath(out);
    return cwd ? { cwd, source: "lsof" } : { cwd: null, source: "unavailable" };
  } catch {
    return { cwd: null, source: "unavailable" };
  }
}

/**
 * Is this workload running inside the worktree its owning lane is bound to?
 *
 * Reported for visibility, never for ownership. The /private/tmp case is the
 * point: it is `outside`, and it is still fully owned.
 */
export function executionLocationFor({ cwd, command, worktreePath }) {
  const wt = normalizePath(worktreePath);
  if (!wt) return "no_registered_worktree";
  const c = normalizePath(cwd);
  if (c) return c === wt || c.startsWith(`${wt}/`) ? "inside_worktree" : "outside_worktree";
  const cmd = String(command || "");
  if (cmd.includes(wt)) return "inside_worktree";
  // Absence of the path in a command line proves nothing: `npm run dev` names
  // no path at all. Unknown is the honest answer.
  return "unknown";
}

/** Resolve the repository that owns a worktree path, from the registry store. */
export function repositoryForWorktree(worktreePath, repositories = []) {
  const wt = normalizePath(worktreePath);
  if (!wt) return null;
  for (const repo of repositories) {
    const parent = normalizePath(repo?.worktree_parent);
    const root = normalizePath(repo?.root);
    if (root && (wt === root || wt.startsWith(`${root}/`))) {
      return { repository_id: repo.repository_id || null, repository_name: repo.name || null };
    }
    if (parent && wt.startsWith(`${parent}/`)) {
      return { repository_id: repo.repository_id || null, repository_name: repo.name || null };
    }
  }
  return null;
}

/**
 * Build attribution records for a set of processes of interest.
 *
 * `seats` are provider-capacity's correlated seat records — the canonical
 * provider/lane/session identity. This function never re-derives them.
 *
 * `interesting(row)` selects which processes get a record. S1 does not classify
 * workload cost, so the default keeps every descendant of a seat plus anything
 * the caller explicitly marks. Cost classification is S3.
 */
export function attributeProcesses({
  seats = [],
  processes = [],
  lanes = [],
  repositories = [],
  runFor = null,
  interesting = null,
  lsof = null,
  maxDepth = MAX_ANCESTRY_DEPTH,
} = {}) {
  const index = buildProcessIndex(processes);
  const seatByPid = new Map();
  for (const s of seats) {
    if (Number.isInteger(s?.pid)) seatByPid.set(s.pid, s);
  }
  const seatPids = new Set(seatByPid.keys());
  const laneById = new Map();
  for (const l of lanes) if (l?.lane_id) laneById.set(l.lane_id, l);

  const wanted = typeof interesting === "function"
    ? processes.filter((r) => interesting(r))
    : processes.filter((r) => resolveOwningSeat(r.pid, index, seatPids, { maxDepth }).seat_pid !== null);

  const records = [];
  for (const row of wanted) {
    const { seat_pid, depth, chain } = resolveOwningSeat(row.pid, index, seatPids, { maxDepth });
    const seat = seat_pid != null ? seatByPid.get(seat_pid) : null;
    const lane = seat?.lane_id ? laneById.get(seat.lane_id) || null : null;
    const worktreePath = seat?.worktree_path
      || lane?.binding?.worktree_path
      || null;
    const { cwd, source: cwdSource } = observeCwd(row.pid, { lsof });
    const repo = repositoryForWorktree(worktreePath, repositories);
    const run = seat?.lane_id && typeof runFor === "function" ? runFor(seat.lane_id) : null;

    const status = seat_pid == null
      ? "unattributed"
      : (seat_pid === row.pid ? "seat" : "ancestry");

    records.push({
      schema_version: PROCESS_ATTRIBUTION_SCHEMA,
      pid: row.pid,
      ppid: row.ppid,
      command: row.command || null,

      // Ownership, resolved by ancestry.
      root_provider_pid: seat_pid,
      ancestry_depth: depth,
      attribution_status: status,
      // `ancestry` is the only signal that establishes ownership; a seat is
      // itself by definition. Nothing here is inferred from a directory.
      attribution_basis: status === "unattributed" ? null : "process_ancestry",

      // Canonical identities, copied from their owners — never re-derived.
      lane_id: seat?.lane_id || null,
      lane_name: seat?.lane_name || null,
      provider: seat?.provider || null,
      tmux_session: seat?.tmux_session || null,
      pane_id: seat?.pane_id || null,
      session_state: seat?.session_state || null,
      execution_run_id: run?.run_id || null,
      execution_run_state: run?.state || null,
      repository_id: repo?.repository_id || null,
      repository_name: repo?.repository_name || null,
      worktree_path: worktreePath || null,

      // Observation, clearly labelled as such.
      cwd,
      cwd_source: cwdSource,
      execution_location: executionLocationFor({ cwd, command: row.command, worktreePath }),

      ancestry_chain: chain.map((c) => ({ pid: c.pid, ppid: c.ppid, command: c.command, visible: c.visible })),
    });
  }
  return records;
}

/**
 * An unattributed record for a process with no seat in its ancestry.
 *
 * Kept deliberately separate from attributeProcesses' happy path so that
 * "we do not know who owns this" is a first-class, inspectable outcome rather
 * than an empty field on an otherwise confident record.
 */
export function unattributedRecord(row, index, { maxDepth = MAX_ANCESTRY_DEPTH } = {}) {
  const chain = ancestryChain(row.pid, index, { maxDepth });
  return {
    schema_version: PROCESS_ATTRIBUTION_SCHEMA,
    pid: row.pid,
    ppid: row.ppid,
    command: row.command || null,
    root_provider_pid: null,
    ancestry_depth: null,
    attribution_status: "unattributed",
    attribution_basis: null,
    lane_id: null,
    lane_name: null,
    provider: null,
    tmux_session: null,
    pane_id: null,
    session_state: null,
    execution_run_id: null,
    execution_run_state: null,
    repository_id: null,
    repository_name: null,
    worktree_path: null,
    cwd: null,
    cwd_source: "unavailable",
    execution_location: "no_registered_worktree",
    ancestry_chain: chain.map((c) => ({ pid: c.pid, ppid: c.ppid, command: c.command, visible: c.visible })),
  };
}

/**
 * One record per process of interest, attributed or not.
 *
 * The union is what makes the output useful to `vac health`: a report that
 * silently omitted the processes it could not explain would hide exactly the
 * case that started this work.
 */
export function attributionReport({
  seats = [],
  processes = [],
  lanes = [],
  repositories = [],
  runFor = null,
  interesting = null,
  lsof = null,
  maxDepth = MAX_ANCESTRY_DEPTH,
} = {}) {
  const index = buildProcessIndex(processes);
  const seatPids = new Set(seats.filter((s) => Number.isInteger(s?.pid)).map((s) => s.pid));
  const candidates = typeof interesting === "function" ? processes.filter((r) => interesting(r)) : processes;

  const owned = [];
  const orphans = [];
  for (const row of candidates) {
    if (resolveOwningSeat(row.pid, index, seatPids, { maxDepth }).seat_pid != null) owned.push(row);
    else orphans.push(row);
  }

  const attributed = attributeProcesses({
    seats, processes, lanes, repositories, runFor, lsof, maxDepth,
    interesting: (r) => owned.some((o) => o.pid === r.pid),
  });
  const unattributed = orphans.map((r) => unattributedRecord(r, index, { maxDepth }));

  return {
    schema_version: PROCESS_ATTRIBUTION_SCHEMA,
    seat_count: seatPids.size,
    attributed_count: attributed.length,
    unattributed_count: unattributed.length,
    records: [...attributed, ...unattributed],
  };
}
