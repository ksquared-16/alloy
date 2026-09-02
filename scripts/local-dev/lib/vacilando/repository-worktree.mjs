/**
 * Create and connect worktrees inside a registered repository.
 *
 * This is the generic path: no sprint slots, no fixed ports, no alloy-sprint-*
 * tooling, no assumption that a branch called staging exists. A repository with
 * one branch, no remote and no conventions must work completely.
 *
 * WHAT IT REFUSES, AND WHY EACH ONE MATTERS.
 *  - A destination outside the repository's own worktree parent: that is how a
 *    lane would end up writing into another repository's tree.
 *  - A destination that already exists: `git worktree add` onto an existing
 *    directory either fails or adopts whatever is there, and adopting is worse.
 *  - A branch that already exists: two lanes on one branch means two providers
 *    committing over each other.
 *  - A resulting worktree whose Git common directory is not the repository's:
 *    the one check that actually proves we built what we intended.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { promisify } from "node:util";

import {
  containPath,
  getRepository,
  inspectGitPath,
  profileFor,
} from "./repository-registry.mjs";

const execFileAsync = promisify(execFile);

export const WORKTREE_NAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
export const BRANCH_RE = /^[A-Za-z0-9][A-Za-z0-9._\/-]{0,120}$/;

async function git(args, cwd, { timeout = 60_000 } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, { cwd, timeout, maxBuffer: 8 * 1024 * 1024 });
    return { ok: true, stdout: String(stdout), stderr: String(stderr) };
  } catch (err) {
    return {
      ok: false,
      // Bounded, and never the remote URL: a remote can carry a token.
      error: String(err?.stderr || err?.message || err).split("\n").slice(0, 4).join(" ").slice(0, 400),
      code: err?.code ?? null,
    };
  }
}

/** A safe directory name derived from a lane name, with no path semantics. */
export function worktreeNameFor(laneName, { suffix = "" } = {}) {
  const base = String(laneName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "lane";
  const name = suffix ? `${base}-${suffix}` : base;
  return WORKTREE_NAME_RE.test(name) ? name : null;
}

/**
 * A branch name that follows the repository's policy.
 *
 * The Alloy profile prefixes `agent/`; the generic profile does not impose one,
 * because inventing a naming scheme for someone else's repository is exactly
 * the Alloy-specific assumption this work removes.
 */
/**
 * A HUMAN STRING BECOMES A SAFE BRANCH; IT IS NOT ASKED TO ALREADY BE ONE.
 *
 * An explicit branch used to be accepted only if it already matched BRANCH_RE
 * and returned null otherwise — so an operator who typed "Billing & Invoices"
 * into the wizard's Branch name field got no branch at all, having been shown a
 * field whose placeholder was a slug. The operator should not have to know
 * which punctuation Git will accept.
 *
 * An explicit value that is already a valid ref is honoured EXACTLY, because an
 * operator who typed `agent/claude/5-work` meant that ref. Anything else is put
 * through the same slug the lane name uses, under the repository's own prefix.
 * Nothing that cannot be normalised is invented: that still returns null.
 */
export function branchNameFor(repository, laneName, { explicit = null } = {}) {
  if (explicit) {
    const raw = String(explicit).trim();
    if (BRANCH_RE.test(raw) && !raw.includes("..")) return raw;
    // NO SILENT SUBSTITUTION. worktreeNameFor falls back to "lane" for a string
    // with nothing to slug, which is right when Vacilando is naming an unnamed
    // lane and wrong here: an operator who typed "!!!" into the branch field
    // must be told, not handed `agent/claude/lane` and left to discover it.
    if (!/[a-z0-9]/i.test(raw)) return null;
    const policy = repository?.branch_policy || profileFor(repository?.profile).branch_policy;
    const slug = worktreeNameFor(raw);
    if (!slug) return null;
    const name = `${policy?.prefix || ""}${slug}`;
    return BRANCH_RE.test(name) ? name : null;
  }
  const policy = repository?.branch_policy || profileFor(repository?.profile).branch_policy;
  const slug = worktreeNameFor(laneName);
  if (!slug) return null;
  const name = `${policy?.prefix || ""}${slug}`;
  return BRANCH_RE.test(name) ? name : null;
}

/** Is the repository in a state where `git worktree add` is safe right now? */
export async function repositoryReadyForWorktree(repository, { gitImpl = git } = {}) {
  if (!repository) return { ok: false, error: "repository_not_found" };
  if (repository.state && repository.state !== "ACTIVE") {
    return { ok: false, error: "repository_not_active" };
  }
  if (!existsSync(repository.root)) return { ok: false, error: "repository_root_missing" };
  // A rebase or merge in progress makes worktree creation unpredictable; a
  // merely dirty tree does not, because a new worktree does not touch it.
  const state = await gitImpl(["rev-parse", "--git-path", "MERGE_HEAD"], repository.root);
  if (state.ok) {
    const p = state.stdout.trim();
    const abs = p.startsWith("/") ? p : join(repository.root, p);
    if (existsSync(abs)) return { ok: false, error: "repository_mid_merge" };
  }
  return { ok: true };
}

/** Does this base ref actually exist? Never assume a default branch is there. */
export async function baseRefExists(repository, ref, { gitImpl = git } = {}) {
  const want = String(ref || "").trim();
  if (!want) return { ok: false, error: "base_ref_required" };
  const out = await gitImpl(["rev-parse", "--verify", "--quiet", `${want}^{commit}`], repository.root);
  if (!out.ok || !out.stdout.trim()) return { ok: false, error: "base_ref_not_found", ref: want };
  return { ok: true, ref: want, sha: out.stdout.trim() };
}

/**
 * Create a worktree and branch for a lane inside its repository.
 *
 * Every failure cleans up after itself: a half-created directory left behind
 * would block the next attempt with `destination_exists` and look like a
 * different problem entirely.
 */
export async function createRepositoryWorktree({
  repositoryId,
  laneName,
  branch = null,
  baseRef = null,
  worktreeName = null,
  root = undefined,
  gitImpl = git,
} = {}) {
  const repo = getRepository(repositoryId, root);
  if (!repo) return { ok: false, error: "repository_not_found" };

  const ready = await repositoryReadyForWorktree(repo, { gitImpl });
  if (!ready.ok) return ready;

  const name = worktreeName ? (WORKTREE_NAME_RE.test(worktreeName) ? worktreeName : null) : worktreeNameFor(laneName);
  if (!name) return { ok: false, error: "invalid_worktree_name" };

  const branchName = branchNameFor(repo, laneName, { explicit: branch });
  if (!branchName) return { ok: false, error: "invalid_branch_name" };

  const base = baseRef || repo.default_branch;
  const baseOk = await baseRefExists(repo, base, { gitImpl });
  if (!baseOk.ok) return baseOk;

  const parent = String(repo.worktree_parent).replace(/\/+$/, "");
  const dest = join(parent, name);
  // The destination must be under this repository's own worktree parent, and
  // nowhere else. join() already normalises, so a name containing traversal
  // cannot escape — but assert it rather than trusting the regex alone.
  if (!(dest === parent || dest.startsWith(parent + sep))) {
    return { ok: false, error: "destination_outside_worktree_parent" };
  }
  if (existsSync(dest)) return { ok: false, error: "destination_exists", path: dest };

  const branchExists = await gitImpl(["rev-parse", "--verify", "--quiet", `refs/heads/${branchName}`], repo.root);
  if (branchExists.ok && branchExists.stdout.trim()) {
    return { ok: false, error: "branch_exists", branch: branchName };
  }

  mkdirSync(parent, { recursive: true });
  const added = await gitImpl(["worktree", "add", "-b", branchName, dest, base], repo.root, { timeout: 120_000 });
  if (!added.ok) {
    try { rmSync(dest, { recursive: true, force: true }); } catch { /* best effort */ }
    return { ok: false, error: "worktree_add_failed", detail: added.error };
  }

  // PROVE we built what we intended: the new worktree must report this
  // repository's Git common directory, not merely sit in the right folder.
  const info = await inspectGitPath(dest);
  if (!info.ok || info.git_common_dir !== repo.git_common_dir) {
    try { await gitImpl(["worktree", "remove", "--force", dest], repo.root); } catch { /* */ }
    try { rmSync(dest, { recursive: true, force: true }); } catch { /* */ }
    return {
      ok: false,
      error: "worktree_identity_mismatch",
      expected: repo.git_common_dir,
      actual: info.git_common_dir || null,
    };
  }

  return {
    ok: true,
    repository_id: repo.repository_id,
    worktree_path: dest,
    worktree_name: name,
    branch: branchName,
    base_ref: baseOk.ref,
    base_sha: baseOk.sha,
    git_common_dir: info.git_common_dir,
  };
}

/**
 * Connect an existing worktree to a lane in a chosen repository.
 *
 * The decisive check is the Git common directory. A path can sit inside the
 * right folder, carry the right name and still belong to another repository;
 * only Git's own answer settles it.
 */
export async function connectRepositoryWorktree({
  repositoryId,
  path,
  root = undefined,
  boundPaths = [],
} = {}) {
  const repo = getRepository(repositoryId, root);
  if (!repo) return { ok: false, error: "repository_not_found" };
  if (repo.state !== "ACTIVE") return { ok: false, error: "repository_not_active" };

  const contained = containPath(path);
  if (!contained.ok) return { ok: false, error: contained.error };

  const info = await inspectGitPath(contained.path);
  if (!info.ok) return { ok: false, error: info.error };

  if (info.git_common_dir !== repo.git_common_dir) {
    // This is the cross-repository refusal. Never adopt: adopting would let a
    // lane in repository A start a provider inside repository B.
    return {
      ok: false,
      error: "cross_repository_binding_refused",
      expected: repo.git_common_dir,
      actual: info.git_common_dir,
    };
  }

  const already = boundPaths.find((p) => p && p === contained.path);
  if (already) return { ok: false, error: "worktree_already_bound", path: contained.path };

  return {
    ok: true,
    repository_id: repo.repository_id,
    worktree_path: contained.path,
    worktree_name: contained.path.split(sep).pop(),
    branch: info.branch,
    git_common_dir: info.git_common_dir,
    is_worktree: info.is_worktree,
  };
}

/**
 * Repository-scoped Git truth.
 *
 * Ahead/behind is measured against THIS repository's base — never Alloy's
 * staging. A repository with no remote reports honestly instead of showing a
 * comparison it cannot make.
 */
export async function repositoryGitStatus(worktreePath, { repositoryId, root = undefined, gitImpl = git } = {}) {
  const repo = getRepository(repositoryId, root);
  if (!repo) return { ok: false, error: "repository_not_found" };
  if (!existsSync(worktreePath)) return { ok: false, error: "worktree_missing" };

  const info = await inspectGitPath(worktreePath);
  if (!info.ok) return { ok: false, error: info.error };
  if (info.git_common_dir !== repo.git_common_dir) {
    return { ok: false, error: "cross_repository_binding_refused" };
  }

  const porcelain = await gitImpl(["status", "--porcelain"], worktreePath);
  const lines = porcelain.ok ? porcelain.stdout.split("\n").filter(Boolean) : [];
  const status = {
    ok: true,
    repository_id: repo.repository_id,
    branch: info.branch,
    dirty: lines.length > 0,
    modified: lines.filter((l) => !l.startsWith("??")).length,
    untracked: lines.filter((l) => l.startsWith("??")).length,
    base_ref: repo.default_branch || null,
    has_remote: Boolean(repo.remote),
    ahead: null,
    behind: null,
    base_comparable: false,
  };

  if (repo.default_branch) {
    const exists = await baseRefExists(repo, repo.default_branch, { gitImpl });
    if (exists.ok) {
      const counts = await gitImpl(["rev-list", "--left-right", "--count", `${repo.default_branch}...HEAD`], worktreePath);
      if (counts.ok) {
        const [behind, ahead] = counts.stdout.trim().split(/\s+/).map((n) => Number(n) || 0);
        status.behind = behind;
        status.ahead = ahead;
        status.base_comparable = true;
      }
    } else {
      // Say why rather than showing 0/0 as if it had been measured.
      status.base_missing = repo.default_branch;
    }
  }
  return status;
}

/** Remove a worktree Vacilando created. Never used on Alloy lanes. */
export async function removeRepositoryWorktree({ repositoryId, path, root = undefined, gitImpl = git } = {}) {
  const repo = getRepository(repositoryId, root);
  if (!repo) return { ok: false, error: "repository_not_found" };
  const parent = String(repo.worktree_parent).replace(/\/+$/, "");
  const target = String(path || "").replace(/\/+$/, "");
  if (!(target.startsWith(parent + sep))) {
    return { ok: false, error: "path_outside_worktree_parent" };
  }
  const out = await gitImpl(["worktree", "remove", "--force", target], repo.root, { timeout: 60_000 });
  if (!out.ok) return { ok: false, error: "worktree_remove_failed", detail: out.error };
  return { ok: true, removed: target };
}
