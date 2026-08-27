/**
 * Read-only Git state for a worktree.
 *
 * WHY A NEW READER. `inspectWorktreeGit` answers "is it dirty, and how many
 * files" — counts, not identities. Counting cannot tell a file this run created
 * from a file that was already dirty when the run started, and that distinction
 * is the whole of checkpoint attribution. A checkpoint path that reasons about
 * dirtiness in aggregate has no choice but to treat every dirty file as its own,
 * which is exactly how 67 unrelated files were swept into a lane branch.
 *
 * EVERY COMMAND HERE IS A READ. `status`, `rev-parse`, `diff --stat`. No `add`,
 * no `commit`, no index write, no working-tree write, no ref update. That is not
 * a convention — it is the invariant this module exists to hold, and the guard
 * suite asserts the argv of every command it runs.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Commands this module is permitted to run. Anything else is a defect. */
export const READ_ONLY_GIT_VERBS = Object.freeze([
  "status", "rev-parse", "diff", "show", "symbolic-ref", "cat-file", "log",
]);

/** Verbs that mutate. Named so a test can assert none of them are ever used. */
export const MUTATING_GIT_VERBS = Object.freeze([
  "add", "commit", "stash", "reset", "clean", "checkout", "restore",
  "rm", "mv", "merge", "rebase", "cherry-pick", "revert", "apply",
  "update-index", "update-ref", "branch", "switch", "push", "pull", "fetch",
]);

export function isReadOnlyGitArgv(argv) {
  const verb = (argv || []).find((a) => !a.startsWith("-") && a !== "-C" && !a.includes("/"));
  return READ_ONLY_GIT_VERBS.includes(verb);
}

async function git(args, cwd, { timeout = 20_000 } = {}) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      timeout,
      maxBuffer: 16 * 1024 * 1024,
      encoding: "utf8",
    });
    return { ok: true, stdout: String(stdout) };
  } catch (err) {
    return {
      ok: false,
      error: String(err?.stderr || err?.message || err).split("\n")[0].slice(0, 300),
    };
  }
}

/**
 * Parse `git status --porcelain=v1 -z`.
 *
 * NUL-separated, and a rename or copy carries its ORIGIN path as an extra
 * field. Missing that turns one rename into a phantom second path, which would
 * then look like an unattributed foreign file and block a legitimate checkpoint.
 */
export function parsePorcelainZ(text) {
  const staged = [];
  const unstaged = [];
  const untracked = [];
  const conflicted = [];
  const fields = String(text ?? "").split("\0");
  for (let i = 0; i < fields.length; i += 1) {
    const entry = fields[i];
    if (!entry) continue;
    const x = entry[0];
    const y = entry[1];
    const path = entry.slice(3);
    if (!path) continue;
    if (x === "?" && y === "?") { untracked.push(path); continue; }
    // Both sides modified, or any unmerged combination.
    if (x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D")) {
      conflicted.push(path);
      if (x === "R" || x === "C") i += 1;
      continue;
    }
    if (x !== " " && x !== "?") staged.push(path);
    if (y !== " " && y !== "?") unstaged.push(path);
    if (x === "R" || x === "C") i += 1;   // consume the origin path
  }
  return { staged, unstaged, untracked, conflicted };
}

/**
 * The current state of a worktree, by path.
 *
 * Returns `ok:false` rather than guessing when Git cannot be read — a
 * checkpoint decision made on an unreadable worktree is worse than no decision.
 */
export async function readWorktreeGitState(worktreePath, { gitImpl = git } = {}) {
  const cwd = String(worktreePath || "");
  if (!cwd) return { ok: false, error: "missing_worktree_path" };

  const head = await gitImpl(["rev-parse", "HEAD"], cwd);
  if (!head.ok) return { ok: false, error: "head_unreadable", detail: head.error };

  const branch = await gitImpl(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  const status = await gitImpl(["status", "--porcelain=v1", "-z", "--untracked-files=all"], cwd);
  if (!status.ok) return { ok: false, error: "status_unreadable", detail: status.error };

  const parsed = parsePorcelainZ(status.stdout);
  return {
    ok: true,
    worktree_path: cwd,
    head: head.stdout.trim(),
    branch: branch.ok ? branch.stdout.trim() : null,
    ...parsed,
    dirty: Boolean(parsed.staged.length || parsed.unstaged.length || parsed.untracked.length),
    conflict: parsed.conflicted.length > 0,
  };
}

/** Every path mentioned in a state, de-duplicated. */
export function allDirtyPaths(state) {
  return [...new Set([
    ...(state?.staged || []),
    ...(state?.unstaged || []),
    ...(state?.untracked || []),
    ...(state?.conflicted || []),
  ])].sort();
}

/**
 * A bounded, storable snapshot.
 *
 * Path lists are capped because a baseline is durable state on the run and a
 * pathological worktree must not be able to grow it without limit. The count is
 * always exact even when the list is clipped, so a truncated baseline can still
 * say truthfully how much it did not record.
 */
export const BASELINE_PATH_LIMIT = 200;

export function boundedSnapshot(state, { limit = BASELINE_PATH_LIMIT } = {}) {
  const clip = (list) => {
    const arr = Array.isArray(list) ? list : [];
    return { paths: arr.slice(0, limit).map(String), count: arr.length, truncated: arr.length > limit };
  };
  return {
    head: state?.head || null,
    branch: state?.branch || null,
    worktree_path: state?.worktree_path || null,
    staged: clip(state?.staged),
    unstaged: clip(state?.unstaged),
    untracked: clip(state?.untracked),
    conflicted: clip(state?.conflicted),
  };
}

/** The recorded paths of a bounded snapshot, as a Set for attribution. */
export function snapshotPathSet(snapshot) {
  const out = new Set();
  for (const key of ["staged", "unstaged", "untracked", "conflicted"]) {
    for (const p of snapshot?.[key]?.paths || []) out.add(p);
  }
  return out;
}

/** Was any part of this snapshot clipped? Attribution cannot be exact if so. */
export function snapshotTruncated(snapshot) {
  return ["staged", "unstaged", "untracked", "conflicted"]
    .some((k) => snapshot?.[k]?.truncated === true);
}
