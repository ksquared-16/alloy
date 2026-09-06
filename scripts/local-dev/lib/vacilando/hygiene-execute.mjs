/**
 * The four hygiene reclamation actions, each wrapped in the ledger.
 *
 * WHAT IS NEW HERE AND WHAT IS NOT. Three of the four actions perform no
 * removal of their own: worktree retirement calls the certified executor,
 * toolkit pruning calls the certified CLI in its `--yes` mode, and registration
 * reconciliation calls `git worktree prune`, which touches admin files and no
 * refs. Only log reclamation is new code, it is a bounded rewrite rather than a
 * delete, and it is the only place in this file that opens a file for writing.
 *
 * THE SHAPE EVERY ACTION SHARES. Prove the precondition again here — the plan
 * that selected this resource is evidence, not permission — then record the
 * intent, then act, then MEASURE the postcondition. An action whose verifier
 * cannot confirm the end state is a failure, never a success with a caveat.
 *
 * WHAT NONE OF THEM MAY DO: delete a branch, force anything, remove a path
 * outside the root it was scoped to, or touch a resource whose classification
 * is anything but RECLAIMABLE or RECONCILE.
 */
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, openSync, readSync, renameSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join, sep } from "node:path";

import { LOG_TAIL_BYTES } from "./artifact-retention.mjs";
import { reclaimOne } from "./hygiene-reclaim.mjs";
import { executeWorktreeRetirement } from "./trusted-host-worktree-retirement.mjs";
import { defaultCanonicalRoot, fileHasLiveWriter, readGitWorktrees } from "./hygiene-observe.mjs";

export const HYGIENE_EXECUTE_SCHEMA = "vacilando.hygiene_execute.v1";

function git(args, cwd, { timeout = 60_000 } = {}) {
  try {
    return { ok: true, stdout: execFileSync("git", args, { cwd, encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) {
    return { ok: false, error: String(e?.stderr || e?.message || e).split("\n")[0].slice(0, 300) };
  }
}

/** Every ref in the repository, as a set. The proof that reconciliation destroyed nothing. */
export function refSnapshot(canonicalRoot) {
  const out = git(["for-each-ref", "--format=%(refname) %(objectname)"], canonicalRoot);
  if (!out.ok) return null;
  return out.stdout.split("\n").map((l) => l.trim()).filter(Boolean).sort();
}

// ── 1. Diagnostic log reclamation ───────────────────────────────────────────

/**
 * Rewrite a log to its last `tailBytes`.
 *
 * PRECONDITIONS, RE-PROVEN HERE:
 *   - the path is inside the runtime root, and is a `.log` file under `logs/`;
 *   - nothing holds it open, measured now, not when the plan was made;
 *   - it is larger than the tail we intend to keep.
 *
 * A live writer is disqualifying rather than merely awkward: replacing the
 * inode under an open append handle leaves the writer appending to a file
 * nobody can see, and truncating in place under a non-append handle leaves a
 * sparse file of NULs. Neither failure announces itself.
 */
export function truncateLogToTail({ path, root, tailBytes = LOG_TAIL_BYTES, hasWriter = fileHasLiveWriter } = {}) {
  const abs = String(path || "");
  const logsDir = join(root || "", "logs") + sep;
  if (!abs.startsWith(logsDir)) return { ok: false, error: "path_outside_logs_dir" };
  if (!/\.log$/.test(abs)) return { ok: false, error: "not_a_log_file" };
  if (!existsSync(abs)) return { ok: false, error: "path_absent" };

  const live = hasWriter(abs);
  if (live !== false) {
    return { ok: false, error: live === null ? "writer_state_unmeasured" : "live_writer_present" };
  }

  let st;
  try { st = statSync(abs); } catch (e) { return { ok: false, error: "stat_failed", detail: String(e?.message || e) }; }
  if (!st.isFile()) return { ok: false, error: "not_a_regular_file" };
  if (st.size <= tailBytes) return { ok: false, error: "already_within_tail" };

  const keep = Math.min(tailBytes, st.size);
  const buf = Buffer.allocUnsafe(keep);
  let fd = null;
  try {
    fd = openSync(abs, "r");
    readSync(fd, buf, 0, keep, st.size - keep);
  } catch (e) {
    return { ok: false, error: "read_failed", detail: String(e?.message || e) };
  } finally { if (fd != null) try { closeSync(fd); } catch { /* nothing to do */ } }

  // Write beside it and rename: the replacement is atomic, so an interruption
  // leaves either the original file or the rewritten one, never a half file.
  const tmp = `${abs}.hygiene.${process.pid}.tmp`;
  try {
    const header = `[hygiene] this log was reclaimed to its last ${keep} bytes at ${new Date().toISOString()}; ${st.size} bytes preceded this line\n`;
    writeFileSync(tmp, Buffer.concat([Buffer.from(header, "utf8"), buf]));
    renameSync(tmp, abs);
  } catch (e) {
    try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* best effort */ }
    return { ok: false, error: "rewrite_failed", detail: String(e?.message || e) };
  }
  return { ok: true, before_bytes: st.size, after_bytes: keep, bytes_reclaimed: st.size - keep };
}

export async function reclaimLog({ root, resource, tailBytes = LOG_TAIL_BYTES, nowMs = Date.now() } = {}) {
  const abs = resource?.path;
  let before = null;
  try { before = { exists: true, bytes: statSync(abs).size }; } catch { before = { exists: false, bytes: null }; }
  return reclaimOne({
    root, kind: "artifact", resourceId: resource.resource_id, action: "reclaim_diagnostic_log",
    mechanism: "truncate_to_tail", evidence: { retention_class: resource.retention_class, reason: resource.reason },
    before, bytes: before.bytes, nowMs,
    perform: async () => truncateLogToTail({ path: abs, root, tailBytes }),
    verify: async () => {
      try {
        const after = statSync(abs).size;
        const shrank = before.bytes != null && after < before.bytes;
        return { ok: shrank, bytes: after, bytes_reclaimed: shrank ? before.bytes - after : 0, matches_intended_end_state: shrank };
      } catch (e) { return { ok: false, error: "verify_stat_failed", detail: String(e?.message || e) }; }
    },
  });
}

// ── 2. Stale registration reconciliation ────────────────────────────────────

/**
 * `git worktree prune` — metadata only.
 *
 * It removes `.git/worktrees/<name>` administrative directories whose worktree
 * path is gone. It does not delete branches, does not delete commits, and does
 * not touch refs. That is a claim, so it is checked: the full ref list is
 * captured before and after, and a reconciliation that changed any ref is
 * reported as a failure even though git would call it a success.
 */
export function pruneStaleRegistrations({ canonicalRoot = defaultCanonicalRoot(), dryRun = false } = {}) {
  const before = refSnapshot(canonicalRoot);
  if (before == null) return { ok: false, error: "refs_unreadable" };
  const beforeRows = readGitWorktrees(canonicalRoot);
  const stale = (beforeRows || []).filter((r) => r.prunable || r.path_exists === false).map((r) => r.path);
  if (!stale.length) return { ok: true, pruned: [], refs_unchanged: true, detail: "no stale registration to reconcile" };
  if (dryRun) return { ok: true, pruned: [], would_prune: stale, refs_unchanged: true, dry_run: true };

  const out = git(["worktree", "prune", "-v"], canonicalRoot);
  if (!out.ok) return { ok: false, error: "git_worktree_prune_failed", detail: out.error };

  const after = refSnapshot(canonicalRoot);
  if (after == null) return { ok: false, error: "refs_unreadable_after" };
  const unchanged = before.length === after.length && before.every((r, i) => r === after[i]);
  const afterRows = readGitWorktrees(canonicalRoot) || [];
  const stillStale = afterRows.filter((r) => r.prunable || r.path_exists === false).map((r) => r.path);
  return {
    ok: unchanged && stillStale.length === 0,
    pruned: stale.filter((p) => !stillStale.includes(p)),
    still_stale: stillStale,
    refs_unchanged: unchanged,
    refs_before: before.length,
    refs_after: after.length,
    error: unchanged ? (stillStale.length ? "registration_still_stale" : null) : "refs_changed_during_prune",
    output: String(out.stdout || "").trim().slice(0, 500),
  };
}

export async function reclaimRegistrations({ root, canonicalRoot = defaultCanonicalRoot(), resource, nowMs = Date.now() } = {}) {
  const before = { refs: refSnapshot(canonicalRoot)?.length ?? null, stale_path: resource.resource_id, path_exists: existsSync(resource.resource_id) };
  return reclaimOne({
    root, kind: "registration", resourceId: resource.resource_id, action: "reconcile_stale_worktree_registration",
    mechanism: "git worktree prune", evidence: { reason: resource.reason }, before, nowMs,
    perform: async () => pruneStaleRegistrations({ canonicalRoot }),
    verify: async () => {
      const rows = readGitWorktrees(canonicalRoot);
      if (rows == null) return { ok: false, error: "git_unreadable_after" };
      const gone = !rows.some((r) => r.path === resource.resource_id);
      const refs = refSnapshot(canonicalRoot);
      return {
        ok: gone && refs != null && refs.length === before.refs,
        registration_absent: gone,
        refs_after: refs?.length ?? null,
        refs_unchanged: refs != null && refs.length === before.refs,
        matches_intended_end_state: gone,
      };
    },
  });
}

// ── 3. Toolkit pruning ──────────────────────────────────────────────────────

/**
 * Delegate wholesale to `vac-toolkit-prune.mjs --yes`.
 *
 * It recomputes the plan from live state, refuses a stale one, refuses while
 * any pin is unresolved, never removes `current`, and verifies each directory
 * is gone. Reimplementing any part of that here would be a second, more
 * permissive copy of a certified refusal — which is exactly what the toolkit
 * module's own header warns against.
 */
export function runToolkitPrune({ cliPath = null, toolkitRoot = null, timeoutMs = 600_000 } = {}) {
  const cli = cliPath || new URL("../../vac-toolkit-prune.mjs", import.meta.url).pathname;
  const env = { ...process.env };
  if (toolkitRoot) env.ALLOY_TOOLKIT_ROOT = toolkitRoot;
  try {
    const text = execFileSync(process.execPath, [cli, "--yes", "--json"], {
      encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, env, stdio: ["ignore", "pipe", "pipe"],
    });
    const parsed = JSON.parse(text);
    const result = parsed.result || parsed;
    return { ok: result.ok === true, removed: result.removed || [], failed: result.failed || [], bytes_reclaimed: result.bytes_reclaimed ?? 0, verification: result.verification ?? null };
  } catch (e) {
    return { ok: false, error: "toolkit_prune_failed", detail: String(e?.stderr || e?.message || e).slice(0, 400) };
  }
}

export async function reclaimToolkitVersions({ root, versions = [], toolkitRoot = null, nowMs = Date.now(), inventoryAfter = null } = {}) {
  if (!versions.length) return { ok: true, skipped: "nothing_prunable" };
  const before = { prunable_versions: versions.map((v) => v.resource_id), count: versions.length };
  return reclaimOne({
    root, kind: "toolkit", resourceId: `toolkit:${versions.length}_versions`, action: "prune_policy_eligible_toolkit",
    mechanism: "vac-toolkit-prune --yes", evidence: { versions: before.prunable_versions.slice(0, 50) },
    before, bytes: versions.reduce((s, v) => s + (Number(v.bytes) || 0), 0), nowMs,
    perform: async () => runToolkitPrune({ toolkitRoot }),
    verify: async () => {
      const check = typeof inventoryAfter === "function" ? inventoryAfter() : null;
      if (!check) return { ok: false, error: "no_post_prune_inventory" };
      const remaining = new Set(check.versions.map((v) => v.resource_id));
      const survived = before.prunable_versions.filter((v) => remaining.has(v));
      return {
        ok: check.plan?.execution_blocked !== true && survived.length < before.prunable_versions.length,
        removed_count: before.prunable_versions.length - survived.length,
        still_present: survived.slice(0, 20),
        current_present: Boolean(check.plan?.current) && remaining.has(String(check.plan.current)),
        matches_intended_end_state: survived.length === 0,
      };
    },
  });
}

// ── 4. Worktree retirement ──────────────────────────────────────────────────

/**
 * Delegate to the certified executor, which re-measures every gate itself and
 * refuses on any drift from the fingerprint the plan was bound to.
 *
 * The reversibility argument, stated because it is the whole basis: a worktree
 * is a checkout, not the work. This runs only where `branch_durability_proven`
 * passed, which means the commits are reachable from the canonical remote, and
 * the branch is explicitly never deleted with it. Recreating the checkout is
 * one `git worktree add`. That is the "reversible mechanism" §11 asks for —
 * not a quarantine directory, which would only move the bytes.
 */
export async function reclaimWorktree({
  root, resource, canonicalRoot = defaultCanonicalRoot(), worktreeParent = null,
  requestingWorktree = null, repository = "repo_alloy", nowMs = Date.now(),
} = {}) {
  if (resource?.hygiene_state !== "RECLAIMABLE" || resource?.safety_state !== "candidate") {
    return { ok: false, error: "not_reclaimable", state: resource?.hygiene_state ?? null };
  }
  const before = {
    path_exists: resource.path ? existsSync(resource.path) : null,
    registered: (readGitWorktrees(canonicalRoot) || []).some((r) => r.path === resource.path),
    head_sha: resource.head_sha, branch: resource.branch,
  };
  return reclaimOne({
    root, kind: "worktree", resourceId: resource.resource_id, action: "retire_worktree",
    mechanism: "git worktree remove", bytes: resource.bytes ?? null, nowMs,
    evidence: { durability: resource.durability, fingerprint: resource.fingerprint, branch: resource.branch, head_sha: resource.head_sha },
    before,
    perform: async () => executeWorktreeRetirement({
      root, worktree: resource.resource_id, repository,
      expectedFingerprint: resource.fingerprint,
      expectedHeadSha: resource.head_sha,
      expectedBranch: resource.branch,
      worktreeParent, canonicalRoot, requestingWorktree, s7State: "observed", nowMs,
    }),
    verify: async () => {
      const rows = readGitWorktrees(canonicalRoot);
      const stillRegistered = rows == null ? null : rows.some((r) => r.path === resource.path);
      const stillOnDisk = resource.path ? existsSync(resource.path) : null;
      // The branch must SURVIVE. A retirement that took the branch with it is a
      // failure however clean the directory looks.
      const branchAlive = resource.branch
        ? git(["rev-parse", "--verify", `refs/heads/${resource.branch}`], canonicalRoot).ok
        : null;
      return {
        ok: stillRegistered === false && stillOnDisk === false && branchAlive !== false,
        registration_absent: stillRegistered === false,
        path_absent: stillOnDisk === false,
        branch_retained: branchAlive,
        bytes_reclaimed: resource.bytes ?? 0,
        matches_intended_end_state: stillRegistered === false && stillOnDisk === false,
      };
    },
  });
}
