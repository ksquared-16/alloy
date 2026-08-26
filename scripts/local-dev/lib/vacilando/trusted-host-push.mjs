/**
 * Bounded trusted-host branch push. No generic shell. No worker tokens.
 *
 * WHAT THIS IS FOR. A lane can commit but cannot push — pushing is a
 * Director-owned capability, and until now it did not exist as a governed
 * action at all, so a lane with reviewed work had no route to the remote except
 * someone running `git push` by hand. That is the gap this closes.
 *
 * WHAT IT PUSHES. Exactly one commit object to exactly one branch:
 * `<expectedHeadSha>:refs/heads/<branch>`. Pushing the SHA rather than the
 * local branch name is deliberate — the reviewed thing is a commit, and if the
 * lane's branch has moved on since the Director approved it, the approved
 * commit is still what goes, or nothing does.
 *
 * WHAT IT REFUSES.
 *  - A repository that is not allowlisted.
 *  - A protected target ref. staging, main, master and production are promoted
 *    by merging a reviewed pull request, never by a branch push.
 *  - Any force, lease, delete, mirror, tag or multi-refspec form. Non-fast-
 *    forward is refused by Git itself and asserted here as well, so the refusal
 *    does not depend on a default staying the default.
 *  - Head drift: the local branch must actually be at the SHA that was approved.
 *  - Commit-scope expansion: when the proposal names the commits it reviewed,
 *    the push must contain those and no others.
 *
 * IDEMPOTENT. If the remote branch is already at that exact SHA there is
 * nothing to do, and that is a success, not an error — a retry after a dropped
 * connection must not look like a failure.
 */
import { spawnSync } from "node:child_process";

import { allowlistedRepositories } from "./trusted-host-merge.mjs";
import { liveRemoteMutationPermitted } from "./trusted-host-remote-guard.mjs";

/** Refs a branch push may never target. Promotion is a merge, not a push. */
export const PROTECTED_REFS = Object.freeze(["staging", "main", "master", "production", "prod", "HEAD"]);
export const BRANCH_RE = /^[A-Za-z0-9][A-Za-z0-9._\/-]{0,180}$/;
export const SHA_RE = /^[a-f0-9]{7,40}$/;

const FORCE_KEYS = [
  "force", "forceWithLease", "force_with_lease", "delete", "mirror", "prune",
  "tags", "followTags", "follow_tags", "refspec", "argv", "shell", "command",
];

function normRepo(v) {
  return String(v || "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "");
}

function normSha(v) {
  return String(v || "").trim().toLowerCase();
}

export function defaultGit(args, cwd, { timeout = 60_000 } = {}) {
  return spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    timeout,
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
  });
}

export function validatePushInputs(inputs = {}) {
  for (const k of FORCE_KEYS) {
    if (inputs[k]) {
      return {
        ok: false,
        code: "force_push_rejected",
        detail: `A governed push is non-force and single-ref only; ${k} is not accepted.`,
      };
    }
  }
  const repository = normRepo(inputs.repository || inputs.repo);
  if (!repository) return { ok: false, code: "missing_repository", detail: "repository is required" };
  if (!allowlistedRepositories().includes(repository)) {
    return { ok: false, code: "repository_not_allowlisted", detail: `Repository ${repository} is not allowlisted` };
  }

  const branch = String(inputs.branch || inputs.head_branch || inputs.headBranch || "").trim();
  if (!BRANCH_RE.test(branch)) {
    return { ok: false, code: "invalid_branch", detail: "branch must be a plain ref name" };
  }
  if (PROTECTED_REFS.includes(branch) || branch.startsWith("refs/")) {
    return {
      ok: false,
      code: "protected_ref_rejected",
      detail: `${branch} is promoted by merging a reviewed pull request, never by a branch push.`,
    };
  }

  const expectedHeadSha = normSha(inputs.expected_head_sha || inputs.expectedHeadSha || inputs.head_sha);
  if (!SHA_RE.test(expectedHeadSha)) {
    return { ok: false, code: "missing_expected_head_sha", detail: "expected_head_sha is required" };
  }

  const worktreePath = String(inputs.worktree_path || inputs.worktreePath || "").trim();
  if (!worktreePath || worktreePath.includes("..") || /[;|&]/.test(worktreePath)) {
    return { ok: false, code: "invalid_worktree_path", detail: "a repository-local worktree path is required" };
  }

  // Optional, and load-bearing when present: the exact commits the proposal
  // reviewed. With it, a push that would carry anything else is refused.
  const expectedCommits = Array.isArray(inputs.expected_commits || inputs.expectedCommits)
    ? (inputs.expected_commits || inputs.expectedCommits).map(normSha).filter((c) => SHA_RE.test(c))
    : null;

  return {
    ok: true,
    normalized: {
      actionType: "repository.push",
      repository,
      branch,
      expectedHeadSha,
      worktreePath,
      expectedCommits,
      baseRef: String(inputs.base_ref || inputs.baseRef || "origin/staging").trim(),
      remote: "origin",
      dedupeKey: `push:${repository}#${branch}#${expectedHeadSha.slice(0, 12)}`,
    },
  };
}

/** What the remote currently has for this branch. Read-only. */
export function remoteBranchSha(normalized, { gitImpl = defaultGit } = {}) {
  const out = gitImpl(["ls-remote", normalized.remote, `refs/heads/${normalized.branch}`], normalized.worktreePath, { timeout: 45_000 });
  if (out.status !== 0) {
    return { ok: false, code: "remote_unreadable", detail: String(out.stderr || "ls-remote failed").split("\n")[0].slice(0, 200) };
  }
  const line = String(out.stdout || "").trim().split("\n").find(Boolean);
  if (!line) return { ok: true, sha: null };
  return { ok: true, sha: normSha(line.split(/\s+/)[0]) };
}

/**
 * Everything that must be true before a single byte leaves this machine.
 *
 * Returns `{ ok:true, idempotent:true }` when the remote already carries the
 * exact approved SHA.
 */
export function evaluatePushReadiness(normalized, { gitImpl = defaultGit } = {}) {
  const cwd = normalized.worktreePath;

  // IDEMPOTENCY IS SETTLED FIRST, BEFORE DRIFT.
  //
  // Found in live acceptance: the approved commit was already on the remote,
  // the lane had since committed again, and a retry was refused as `head_drift`
  // — a refusal for work that was already done. Drift exists to stop a STALE
  // commit being published; when the approved commit is already there, there is
  // nothing to publish and nothing to be stale about. Asking the remote first
  // is what makes a retry safe.
  const already = remoteBranchSha(normalized, { gitImpl });
  if (already.ok && already.sha
    && (already.sha === normalized.expectedHeadSha
      || already.sha.startsWith(normalized.expectedHeadSha)
      || normalized.expectedHeadSha.startsWith(already.sha))) {
    return { ok: true, idempotent: true, code: "already_pushed", remoteSha: already.sha };
  }

  const head = gitImpl(["rev-parse", "HEAD"], cwd);
  if (head.status !== 0) {
    return { ok: false, code: "worktree_unreadable", detail: "could not read HEAD" };
  }
  const localHead = normSha(head.stdout);

  const branchOut = gitImpl(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  const localBranch = String(branchOut.stdout || "").trim();

  // HEAD DRIFT. The approval named a commit; if the worktree has moved past it
  // the Director approved something that is no longer what would be sent.
  if (!localHead.startsWith(normalized.expectedHeadSha) && !normalized.expectedHeadSha.startsWith(localHead)) {
    return {
      ok: false,
      code: "head_drift",
      detail: "the branch moved after this push was proposed; a fresh decision is required",
      expected: normalized.expectedHeadSha,
      actual: localHead,
    };
  }
  if (localBranch && localBranch !== "HEAD" && localBranch !== normalized.branch) {
    return {
      ok: false,
      code: "branch_mismatch",
      detail: `the worktree is on ${localBranch}, not ${normalized.branch}`,
    };
  }

  // COMMIT-SCOPE EXPANSION. When the proposal listed what it reviewed, the push
  // must carry those commits and no others.
  if (normalized.expectedCommits && normalized.expectedCommits.length) {
    const range = gitImpl(["rev-list", `${normalized.baseRef}..${normalized.expectedHeadSha}`], cwd);
    if (range.status === 0) {
      const actual = String(range.stdout || "").split("\n").map(normSha).filter(Boolean);
      const want = new Set(normalized.expectedCommits.map((c) => c.slice(0, 12)));
      const extra = actual.filter((c) => !want.has(c.slice(0, 12)));
      if (extra.length) {
        return {
          ok: false,
          code: "commit_scope_expanded",
          detail: `${extra.length} commit(s) beyond what was reviewed would be pushed`,
          unexpected: extra.slice(0, 10),
        };
      }
    }
  }

  const remote = already.ok ? already : remoteBranchSha(normalized, { gitImpl });
  if (!remote.ok) return { ok: false, code: remote.code, detail: remote.detail };

  // NON-FAST-FORWARD. Git refuses this by default; asserted here so the refusal
  // does not depend on a default staying the default, and so the reason names
  // what actually happened instead of surfacing a raw git error.
  if (remote.sha) {
    const anc = gitImpl(["merge-base", "--is-ancestor", remote.sha, normalized.expectedHeadSha], cwd);
    if (anc.status !== 0) {
      return {
        ok: false,
        code: "non_fast_forward",
        detail: "the remote branch has commits this push would discard; a governed push is never a force push",
        remote: remote.sha,
      };
    }
  }
  return { ok: true, remoteSha: remote.sha, localHead };
}

export function publicPushResult(out) {
  return {
    repository: out.repository,
    branch: out.branch,
    pushedSha: out.pushedSha,
    remoteRef: `refs/heads/${out.branch}`,
    idempotent: Boolean(out.idempotent),
    credentialsExposed: false,
  };
}

/**
 * Push the approved commit. The only mutation in this module.
 */
export function pushBranch(inputs, { git = defaultGit } = {}) {
  const v = validatePushInputs(inputs);
  if (!v.ok) return v;
  const n = v.normalized;

  const ready = evaluatePushReadiness(n, { gitImpl: git });
  if (!ready.ok) return ready;
  if (ready.idempotent) {
    return {
      ok: true,
      idempotent: true,
      repository: n.repository,
      branch: n.branch,
      pushedSha: ready.remoteSha,
      credentialsExposed: false,
    };
  }

  // Everything above only READ. This is the first statement that leaves the
  // machine, so this is where the guard belongs.
  const permitted = liveRemoteMutationPermitted({ injectedGh: git !== defaultGit, operation: "push" });
  if (!permitted.ok) return { ok: false, code: permitted.code, detail: permitted.detail };

  // One commit, one ref, no force. The SHA is the source so a branch that moved
  // after approval cannot smuggle later commits along.
  const out = git([
    "push", n.remote, `${n.expectedHeadSha}:refs/heads/${n.branch}`,
  ], n.worktreePath, { timeout: 180_000 });

  if (out.status !== 0) {
    const err = String(out.stderr || out.stdout || "git push failed");
    if (/\[rejected\]|non-fast-forward|fetch first/i.test(err)) {
      return { ok: false, code: "non_fast_forward", detail: err.split("\n")[0].slice(0, 240) };
    }
    return { ok: false, code: "push_failed", detail: err.split("\n")[0].slice(0, 240) };
  }

  // VERIFY WHAT LANDED. A push that succeeded is not a push that put the right
  // commit there.
  const after = remoteBranchSha(n, { gitImpl: git });
  if (!after.ok || !after.sha
    || !(after.sha === n.expectedHeadSha || after.sha.startsWith(n.expectedHeadSha) || n.expectedHeadSha.startsWith(after.sha))) {
    return {
      ok: false,
      code: "push_verification_failed",
      detail: "the push reported success but the remote is not at the approved commit",
      expected: n.expectedHeadSha,
      actual: after.sha || null,
    };
  }

  return {
    ok: true,
    repository: n.repository,
    branch: n.branch,
    pushedSha: after.sha,
    credentialsExposed: false,
  };
}
