/**
 * Bounded trusted-host pull-request creation. No generic shell. No worker tokens.
 *
 * THE MIDDLE OF THE PROMOTION CHAIN. A lane commits, a governed push puts the
 * reviewed commit on the remote, and this opens the pull request that a governed
 * merge will later land. Without it the chain had a hole in the middle and the
 * only way across was someone running `gh pr create` by hand.
 *
 * WHAT IT REFUSES.
 *  - A repository that is not allowlisted.
 *  - Any base other than the canonical promotion target. A pull request into
 *    main or production is not something this action can be talked into.
 *  - A head that is a protected ref, or the same ref as the base.
 *  - Head drift: the remote branch must actually be at the approved SHA. The
 *    Director approved a commit, not a branch name that may have moved since.
 *
 * IT DOES NOT CREATE DUPLICATES. An open pull request for the same base and
 * head is REUSED and reported. Opening a second one for work that already has
 * one is how a promotion queue turns into a mess nobody can read.
 */
import { spawnSync } from "node:child_process";

import { isAllowlistedRepository, normalizeRepositorySlug, repositoryRefusalDetail, ALLOWED_TARGET_BRANCHES } from "./trusted-host-merge.mjs";
import { BRANCH_RE, PROTECTED_REFS, SHA_RE } from "./trusted-host-push.mjs";
import { liveRemoteMutationPermitted } from "./trusted-host-remote-guard.mjs";

export const PR_TITLE_MAX = 200;
export const PR_BODY_MAX = 60_000;

const SECRET_RE = /(ghp_|github_pat_|sk-[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|postgres(ql)?:\/\/[^\s]*:[^\s]*@)/i;

// One normal form for repository identity. See normalizeRepositorySlug.
const normRepo = normalizeRepositorySlug;
function normSha(v) { return String(v || "").trim().toLowerCase(); }

export function defaultGh(args, { timeout = 60_000 } = {}) {
  return spawnSync("gh", args, { encoding: "utf8", timeout, env: process.env, maxBuffer: 4 * 1024 * 1024 });
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

export function validateOpenPrInputs(inputs = {}) {
  if (inputs.argv || inputs.shell || inputs.command || inputs.sql) {
    return { ok: false, code: "arbitrary_command_rejected", detail: "Only promotion.open_pr is allowed; generic shell is not registered." };
  }
  const repository = normRepo(inputs.repository || inputs.repo);
  if (!repository) return { ok: false, code: "missing_repository", detail: "repository is required" };
  if (!isAllowlistedRepository(repository)) {
    return { ok: false, code: "repository_not_allowlisted", detail: repositoryRefusalDetail(repository) };
  }

  const base = String(inputs.base || inputs.base_branch || inputs.baseBranch || "staging").trim();
  if (!ALLOWED_TARGET_BRANCHES.includes(base)) {
    return {
      ok: false,
      code: "base_branch_not_allowed",
      detail: `base must be one of: ${ALLOWED_TARGET_BRANCHES.join(", ")}`,
    };
  }

  const headBranch = String(inputs.head_branch || inputs.headBranch || inputs.branch || "").trim();
  if (!BRANCH_RE.test(headBranch)) {
    return { ok: false, code: "invalid_head_branch", detail: "head_branch must be a plain ref name" };
  }
  if (PROTECTED_REFS.includes(headBranch) || headBranch.startsWith("refs/")) {
    return { ok: false, code: "protected_ref_rejected", detail: `${headBranch} cannot be the head of a promotion` };
  }
  if (headBranch === base) {
    return { ok: false, code: "head_equals_base", detail: "a pull request cannot promote a branch into itself" };
  }

  const expectedHeadSha = normSha(inputs.expected_head_sha || inputs.expectedHeadSha || inputs.head_sha);
  if (!SHA_RE.test(expectedHeadSha)) {
    return { ok: false, code: "missing_expected_head_sha", detail: "expected_head_sha is required" };
  }

  const title = String(inputs.title || "").trim();
  if (title.length < 3 || title.length > PR_TITLE_MAX) {
    return { ok: false, code: "invalid_title", detail: `title must be 3-${PR_TITLE_MAX} characters` };
  }
  const body = String(inputs.body || "").slice(0, PR_BODY_MAX);
  if (SECRET_RE.test(title) || SECRET_RE.test(body)) {
    return { ok: false, code: "secret_in_pull_request_text", detail: "the title or body looked like a credential and was refused" };
  }

  return {
    ok: true,
    normalized: {
      actionType: "promotion.open_pr",
      repository,
      base,
      headBranch,
      expectedHeadSha,
      title,
      body,
      dedupeKey: `open_pr:${repository}#${headBranch}->${base}#${expectedHeadSha.slice(0, 12)}`,
    },
  };
}

/** An open pull request for this exact base and head, if there is one. */
export function findOpenPullRequest(n, { gh = defaultGh, matchBase = true } = {}) {
  const out = gh([
    "pr", "list", "--repo", n.repository,
    "--head", n.headBranch, ...(matchBase ? ["--base", n.base] : []), "--state", "open",
    "--json", "number,headRefOid,baseRefName,headRefName,url,title,state",
  ]);
  if (out.status !== 0) {
    return { ok: false, code: "pr_lookup_failed", detail: String(out.stderr || "gh pr list failed").split("\n")[0].slice(0, 200) };
  }
  const list = parseJson(out.stdout) || [];
  const match = list.find((p) => p.headRefName === n.headBranch
    && (!matchBase || p.baseRefName === n.base)) || null;
  return { ok: true, pr: match };
}

/** What the remote branch actually points at right now. */
export function remoteHeadSha(n, { gh = defaultGh } = {}) {
  const out = gh([
    "api", `repos/${n.repository}/git/ref/heads/${n.headBranch}`, "--jq", ".object.sha",
  ]);
  if (out.status !== 0) {
    return { ok: false, code: "head_branch_not_on_remote", detail: "the head branch is not on the remote — push it first" };
  }
  return { ok: true, sha: normSha(out.stdout) };
}

export function publicOpenPrResult(out) {
  return {
    repository: out.repository,
    pullRequestNumber: out.pullRequestNumber,
    url: out.url,
    base: out.base,
    headBranch: out.headBranch,
    headSha: out.headSha,
    reused: Boolean(out.reused),
    credentialsExposed: false,
  };
}

/**
 * Open the promotion pull request, or report the one that already exists.
 */
export function openPullRequest(inputs, { gh = defaultGh } = {}) {
  const v = validateOpenPrInputs(inputs);
  if (!v.ok) return v;
  const n = v.normalized;

  // HEAD DRIFT, checked against the REMOTE. The pull request will track
  // whatever is on the branch, so the branch is what has to match the approval.
  const remote = remoteHeadSha(n, { gh });
  if (!remote.ok) return { ok: false, code: remote.code, detail: remote.detail };
  if (!(remote.sha === n.expectedHeadSha
    || remote.sha.startsWith(n.expectedHeadSha)
    || n.expectedHeadSha.startsWith(remote.sha))) {
    return {
      ok: false,
      code: "head_drift",
      detail: "the remote branch is not at the approved commit; a fresh decision is required",
      expected: n.expectedHeadSha,
      actual: remote.sha,
    };
  }

  const existing = findOpenPullRequest(n, { gh });
  if (!existing.ok) return { ok: false, code: existing.code, detail: existing.detail };
  if (existing.pr) {
    // Reuse, never duplicate.
    return {
      ok: true,
      reused: true,
      repository: n.repository,
      pullRequestNumber: existing.pr.number,
      url: existing.pr.url,
      base: n.base,
      headBranch: n.headBranch,
      headSha: normSha(existing.pr.headRefOid) || remote.sha,
      credentialsExposed: false,
    };
  }

  const permitted = liveRemoteMutationPermitted({ injectedGh: gh !== defaultGh, operation: "pull request" });
  if (!permitted.ok) return { ok: false, code: permitted.code, detail: permitted.detail };

  const created = gh([
    "pr", "create", "--repo", n.repository,
    "--base", n.base, "--head", n.headBranch,
    "--title", n.title, "--body", n.body || n.title,
  ], { timeout: 120_000 });
  if (created.status !== 0) {
    const err = String(created.stderr || created.stdout || "gh pr create failed");
    if (/already exists/i.test(err)) {
      const again = findOpenPullRequest(n, { gh });
      if (again.ok && again.pr) {
        return {
          ok: true,
          reused: true,
          repository: n.repository,
          pullRequestNumber: again.pr.number,
          url: again.pr.url,
          base: n.base,
          headBranch: n.headBranch,
          headSha: normSha(again.pr.headRefOid) || remote.sha,
          credentialsExposed: false,
        };
      }
    }
    return { ok: false, code: "open_pr_failed", detail: err.split("\n")[0].slice(0, 240) };
  }

  // Read it back rather than parsing the URL out of stdout: the record is the
  // proof. Looked up by HEAD ALONE on purpose — filtering by base too would
  // make a pull request opened against the wrong base simply not be found, and
  // "could not read it back" is a far worse answer than naming what went wrong.
  const verify = findOpenPullRequest(n, { gh, matchBase: false });
  if (!verify.ok || !verify.pr) {
    return { ok: false, code: "open_pr_verification_failed", detail: "the pull request was created but could not be read back" };
  }
  if (verify.pr.baseRefName !== n.base || verify.pr.headRefName !== n.headBranch) {
    return {
      ok: false,
      code: "unexpected_base_or_head",
      detail: `the created pull request is ${verify.pr.headRefName} -> ${verify.pr.baseRefName}`,
    };
  }
  return {
    ok: true,
    repository: n.repository,
    pullRequestNumber: verify.pr.number,
    url: verify.pr.url,
    base: n.base,
    headBranch: n.headBranch,
    headSha: normSha(verify.pr.headRefOid) || remote.sha,
    credentialsExposed: false,
  };
}
