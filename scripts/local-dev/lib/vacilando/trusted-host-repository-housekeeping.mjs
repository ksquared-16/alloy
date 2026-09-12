/**
 * Governed repository housekeeping — close a disposable PR, delete a
 * disposable remote branch.
 *
 * THE DOCTRINE: a disposable repository artifact should be cleaned by governed
 * execution when its disposability can be PROVEN. Not asserted by the worker,
 * not inferred from age — measured against real GitHub state at execution
 * time.
 *
 * These are deliberately narrow. Force-delete, force-push, history rewriting
 * and repository deletion are different capabilities with different
 * consequences and are not reachable from here.
 */
import { spawnSync } from "node:child_process";

const FULL_SHA = /^[0-9a-f]{40}$/i;

/**
 * Branches that may never be deleted by this capability, whatever the gates
 * say. Matched case-insensitively, and any branch the remote reports as
 * protected is refused as well — a name list alone would be a guess.
 */
export const NEVER_DELETABLE_BRANCHES = Object.freeze([
  "staging", "main", "master", "production", "prod", "release", "develop", "trunk", "HEAD",
]);

function defaultGh(args, timeout = 60_000) {
  return spawnSync("gh", args, { encoding: "utf8", timeout, env: process.env, maxBuffer: 4 * 1024 * 1024 });
}
function parseJson(text) { try { return JSON.parse(text); } catch { return null; } }
const norm = (v) => String(v ?? "").trim();
const lower = (v) => norm(v).toLowerCase();

export function isNeverDeletable(branch) {
  const b = lower(branch);
  if (!b) return true;
  return NEVER_DELETABLE_BRANCHES.some((p) => p.toLowerCase() === b);
}

/* ── Input validation ─────────────────────────────────────────────────────
 * Refused at FILING, before an approval can ever be spent on something that
 * cannot succeed — the lesson merge governance already taught, where an
 * abbreviated SHA cost three operator approvals and failed every time.
 */

export function validateClosePullRequestInputs(inputs = {}) {
  const repository = norm(inputs.repository);
  const number = Number(inputs.pullRequestNumber ?? inputs.pull_request_number);
  const headBranch = norm(inputs.expectedHeadBranch || inputs.headBranch);
  const headSha = norm(inputs.expectedHeadSha || inputs.expected_head_sha);
  const base = norm(inputs.expectedBaseBranch || inputs.base || inputs.baseBranch);
  const expectedState = lower(inputs.expectedState || "open");

  if (!repository) return { ok: false, code: "missing_repository" };
  if (!Number.isInteger(number) || number <= 0) return { ok: false, code: "missing_pull_request_number" };
  if (!headBranch) return { ok: false, code: "missing_expected_head_branch" };
  if (!headSha) return { ok: false, code: "missing_expected_head_sha" };
  if (!FULL_SHA.test(headSha)) {
    return {
      ok: false,
      code: "abbreviated_source_sha",
      detail: `expectedHeadSha must be the full 40-character commit SHA; received "${headSha}" (${headSha.length} characters).`,
    };
  }
  if (expectedState !== "open") {
    return { ok: false, code: "unsupported_expected_state", detail: "Only an OPEN pull request may be closed by this capability." };
  }
  return {
    ok: true,
    normalized: {
      repository,
      pullRequestNumber: number,
      expectedHeadBranch: headBranch,
      expectedHeadSha: headSha.toLowerCase(),
      expectedBaseBranch: base || null,
      expectedState: "open",
      dedupeKey: `close_pr:${repository}#${number}#${headSha.slice(0, 12)}`,
    },
  };
}

export function validateDeleteRemoteBranchInputs(inputs = {}) {
  const repository = norm(inputs.repository);
  const branch = norm(inputs.branch || inputs.branchName);
  const headSha = norm(inputs.expectedHeadSha || inputs.expected_head_sha);

  if (!repository) return { ok: false, code: "missing_repository" };
  if (!branch) return { ok: false, code: "missing_branch" };
  if (!headSha) return { ok: false, code: "missing_expected_head_sha" };
  if (!FULL_SHA.test(headSha)) {
    return {
      ok: false,
      code: "abbreviated_source_sha",
      detail: `expectedHeadSha must be the full 40-character commit SHA; received "${headSha}" (${headSha.length} characters).`,
    };
  }
  // Refused at FILING, so a protected branch never reaches an approval queue.
  if (isNeverDeletable(branch)) {
    return { ok: false, code: "protected_branch", detail: `${branch} may never be deleted by this capability.` };
  }
  return {
    ok: true,
    normalized: {
      repository,
      branch,
      expectedHeadSha: headSha.toLowerCase(),
      dedupeKey: `delete_branch:${repository}#${branch}#${headSha.slice(0, 12)}`,
    },
  };
}

/* ── Gate measurement against real GitHub state ───────────────────────────
 * Every field is measured or returned null. Null is not false: an unmeasured
 * gate escalates, it never passes.
 */

export function measureClosePullRequestGates(n, { gh = defaultGh } = {}) {
  const out = gh(["api", `repos/${n.repository}/pulls/${n.pullRequestNumber}`,
    "--jq", "{state:.state,merged:.merged,head_sha:.head.sha,head_ref:.head.ref,base_ref:.base.ref,head_repo:.head.repo.full_name,draft:.draft}"]);
  if (out.status !== 0) {
    return { pull_request_readable: false, detail: String(out.stderr || "").split("\n")[0].slice(0, 200) };
  }
  const pr = parseJson(out.stdout);
  if (!pr) return { pull_request_readable: false, detail: "unparseable pull request response" };
  return {
    pull_request_readable: true,
    pull_request_exists: true,
    pull_request_open: lower(pr.state) === "open",
    pull_request_not_merged: pr.merged === false,
    head_sha_matches: lower(pr.head_sha) === lower(n.expectedHeadSha),
    head_branch_matches: norm(pr.head_ref) === norm(n.expectedHeadBranch),
    head_repository_matches: !n.expectedHeadRepository || norm(pr.head_repo) === norm(n.expectedHeadRepository),
    base_branch_matches: !n.expectedBaseBranch || norm(pr.base_ref) === norm(n.expectedBaseBranch),
    observed: { state: pr.state, merged: pr.merged, head_sha: pr.head_sha, head_ref: pr.head_ref, base_ref: pr.base_ref },
  };
}

/**
 * Measure what a staging merge is actually allowed to rely on.
 *
 * WHY THIS EXISTS. The merge policy has always listed the right gates, and
 * nothing measured them — so every merge escalated to the operator, who then
 * approved it by reading the same GitHub page this function reads. The human
 * click was standing in for a missing measurement rather than supplying a
 * judgement, which is the worst of both: it cost an interruption and added no
 * safety. Building the measurement is what makes removing the click honest.
 *
 * Every failure to read is null, never false, and a null gate escalates. An
 * incomplete measurement here can only produce MORE operator approvals.
 */
export function measureMergePullRequestGates(n, { gh = defaultGh } = {}) {
  const out = gh(["api", `repos/${n.repository}/pulls/${n.pullRequestNumber}`,
    "--jq", "{state:.state,merged:.merged,draft:.draft,mergeable:.mergeable,mergeable_state:.mergeable_state,"
      + "head_sha:.head.sha,head_ref:.head.ref,base_ref:.base.ref,head_repo:.head.repo.full_name}"]);
  if (out.status !== 0) {
    return { pull_request_readable: false, detail: String(out.stderr || "").split("\n")[0].slice(0, 200) };
  }
  const pr = parseJson(out.stdout);
  if (!pr) return { pull_request_readable: false, detail: "unparseable pull request response" };

  const ev = {
    pull_request_readable: true,
    pull_request_exists: true,
    pull_request_open: lower(pr.state) === "open",
    pull_request_not_merged: pr.merged === false,
    pull_request_head_sha: norm(pr.head_sha),
    base_branch: norm(pr.base_ref),
    head_branch: norm(pr.head_ref),
    // GitHub reports mergeability as a tri-state and computes it lazily: null
    // means "ask again", NOT "no". Treating an uncomputed answer as mergeable
    // is how a conflicted merge gets auto-approved, so null stays null.
    pull_request_mergeable: pr.mergeable == null
      ? null
      : (pr.mergeable === true && !pr.draft && lower(pr.mergeable_state) !== "dirty"),
    observed: {
      state: pr.state, merged: pr.merged, draft: pr.draft,
      mergeable: pr.mergeable, mergeable_state: pr.mergeable_state,
      head_sha: pr.head_sha, base_ref: pr.base_ref,
    },
  };

  // Checks. A PR with zero checks is not "all checks passed" — the gate
  // requires total > 0, so an unchecked PR escalates rather than sails through.
  const checks = gh(["pr", "checks", String(n.pullRequestNumber), "--repo", n.repository,
    "--json", "name,state,bucket"]);
  if (checks.status !== 0 && !String(checks.stdout || "").trim()) {
    ev.required_checks_total = null;
  } else {
    const rows = parseJson(checks.stdout) || [];
    // "skipping" is neither a pass nor a failure: a skipped check has asserted
    // nothing, so it is excluded from the denominator rather than counted as
    // green. Counting it green is how a suite that never ran looks certified.
    const counted = rows.filter((r) => lower(r.bucket) !== "skipping" && lower(r.state) !== "skipped");
    const bucketOf = (r) => lower(r.bucket) || lower(r.state);
    ev.required_checks_total = counted.length;
    ev.required_checks_passing = counted.filter((r) => ["pass", "success"].includes(bucketOf(r))).length;
    ev.required_checks_failing = counted.filter((r) => ["fail", "failure", "cancel", "cancelled", "timed_out", "action_required"].includes(bucketOf(r))).length;
    ev.required_checks_pending = counted.filter((r) => ["pending", "queued", "in_progress", "waiting"].includes(bucketOf(r))).length;
    // The certification suite specifically, not the deploy previews.
    const certs = counted.filter((r) => /certification/i.test(String(r.name || "")));
    ev.certification_suite_passed = certs.length === 0
      ? null
      : certs.every((r) => ["pass", "success"].includes(bucketOf(r)));
  }

  // Anything a human explicitly raised and has not resolved. Changes requested
  // is a governance finding whatever the checks say.
  const rev = gh(["pr", "view", String(n.pullRequestNumber), "--repo", n.repository,
    "--json", "reviewDecision,reviews"]);
  if (rev.status !== 0) {
    ev.unresolved_governance_findings = null;
  } else {
    const v = parseJson(rev.stdout);
    ev.unresolved_governance_findings = v == null
      ? null
      : (lower(v.reviewDecision) === "changes_requested" ? 1 : 0);
  }
  return ev;
}

export function measureDeleteRemoteBranchGates(n, { gh = defaultGh } = {}) {
  const ev = { branch_never_protected_name: !isNeverDeletable(n.branch) };

  const ref = gh(["api", `repos/${n.repository}/git/ref/heads/${n.branch}`, "--jq", ".object.sha"]);
  if (ref.status !== 0) {
    ev.branch_exists_remotely = false;
    ev.detail = String(ref.stderr || "").split("\n")[0].slice(0, 200);
    return ev;
  }
  const sha = norm(ref.stdout);
  ev.branch_exists_remotely = Boolean(sha);
  ev.remote_head_sha = sha;
  ev.remote_head_matches = lower(sha) === lower(n.expectedHeadSha);

  // Branch protection. An error here is NOT "unprotected" — it is unmeasured.
  const prot = gh(["api", `repos/${n.repository}/branches/${n.branch}/protection`]);
  if (prot.status === 0) ev.branch_not_protected = false;
  else if (/404|Branch not protected|Not Found/i.test(String(prot.stderr || ""))) ev.branch_not_protected = true;
  else ev.branch_not_protected = null;

  // Any pull request still pointing at this branch, in any state.
  const prs = gh(["pr", "list", "--repo", n.repository, "--head", n.branch, "--state", "all",
    "--json", "number,state,headRefName"]);
  if (prs.status !== 0) ev.no_open_pull_request_depends = null;
  else {
    const list = parseJson(prs.stdout) || [];
    const open = list.filter((p) => norm(p.headRefName) === norm(n.branch) && lower(p.state) === "open");
    ev.no_open_pull_request_depends = open.length === 0;
    ev.dependent_pull_requests = list.map((p) => ({ number: p.number, state: p.state }));
  }
  return ev;
}

/** Merge measured GitHub evidence with locally-measured Vacilando evidence. */
export function housekeepingEvidence(measured = {}, local = {}) {
  return { ...measured, ...local };
}

/* ── Execution ────────────────────────────────────────────────────────────
 * Each verb re-measures its gates immediately before acting. An approval is
 * permission to act on a stated identity, never permission to act on whatever
 * that identity has since become.
 */

export function closePullRequest(inputs = {}, { gh = defaultGh } = {}) {
  const v = validateClosePullRequestInputs(inputs);
  if (!v.ok) return v;
  const n = v.normalized;
  const before = measureClosePullRequestGates(n, { gh });
  if (!before.pull_request_readable) return { ok: false, code: "pull_request_unreadable", detail: before.detail || "could not read the pull request" };
  if (!before.pull_request_open) return { ok: false, code: "pull_request_not_open", detail: `state is ${before.observed?.state}` };
  if (!before.pull_request_not_merged) return { ok: false, code: "pull_request_already_merged", detail: "a merged pull request is not closable as unmerged" };
  if (!before.head_sha_matches) return { ok: false, code: "head_drift", detail: `head is ${before.observed?.head_sha}, expected ${n.expectedHeadSha}` };
  if (!before.head_branch_matches) return { ok: false, code: "head_branch_mismatch", detail: `head branch is ${before.observed?.head_ref}` };

  const out = gh(["pr", "close", String(n.pullRequestNumber), "--repo", n.repository,
    ...(inputs.comment ? ["--comment", String(inputs.comment).slice(0, 500)] : [])]);
  if (out.status !== 0) {
    return { ok: false, code: "close_pr_failed", detail: String(out.stderr || "gh pr close failed").split("\n")[0].slice(0, 200) };
  }
  const after = measureClosePullRequestGates(n, { gh });
  // Proving the outcome, not assuming the command worked.
  if (after.pull_request_open) return { ok: false, code: "close_not_observed", detail: "the pull request is still open after close" };
  if (!after.pull_request_not_merged) return { ok: false, code: "unexpectedly_merged", detail: "the pull request reports merged after close" };
  return {
    ok: true,
    pullRequestNumber: n.pullRequestNumber,
    repository: n.repository,
    state: after.observed?.state || "CLOSED",
    merged: after.observed?.merged === true,
    state_before: before.observed || null,
    state_after: after.observed || null,
  };
}

export function deleteRemoteBranch(inputs = {}, { gh = defaultGh } = {}) {
  const v = validateDeleteRemoteBranchInputs(inputs);
  if (!v.ok) return v;
  const n = v.normalized;
  const before = measureDeleteRemoteBranchGates(n, { gh });
  if (!before.branch_exists_remotely) return { ok: false, code: "branch_absent", detail: before.detail || "the branch is not on the remote" };
  if (before.branch_not_protected !== true) return { ok: false, code: "branch_protected_or_unmeasured", detail: `branch_not_protected=${before.branch_not_protected}` };
  if (!before.remote_head_matches) return { ok: false, code: "head_drift", detail: `remote head is ${before.remote_head_sha}, expected ${n.expectedHeadSha}` };
  if (before.no_open_pull_request_depends !== true) {
    return { ok: false, code: "open_pull_request_depends", detail: JSON.stringify(before.dependent_pull_requests || []).slice(0, 200) };
  }

  const out = gh(["api", "-X", "DELETE", `repos/${n.repository}/git/refs/heads/${n.branch}`]);
  if (out.status !== 0) {
    return { ok: false, code: "delete_branch_failed", detail: String(out.stderr || "gh api delete failed").split("\n")[0].slice(0, 200) };
  }
  const after = measureDeleteRemoteBranchGates(n, { gh });
  if (after.branch_exists_remotely) return { ok: false, code: "delete_not_observed", detail: "the branch is still on the remote" };
  return {
    ok: true,
    repository: n.repository,
    branch: n.branch,
    deleted: true,
    deleted_head_sha: before.remote_head_sha,
    dependents_at_deletion: before.dependent_pull_requests || [],
  };
}

/**
 * MAY THIS MERGE BECOME EFFECTIVE ON THE DEPLOYED PRIMARY?
 *
 * Merging into staging is where application code becomes everyone else's
 * problem, and it is the narrowest boundary this system actually owns: Vercel
 * deploys from the branch, so gating the merge gates effectiveness. Nothing
 * else in the repository applies migrations — no workflow runs `supabase db
 * push`, `prebuild` is verifications, `build` is `next build`, and the governed
 * `database.apply_migration` action has never been requested once. Without this
 * gate, application code can be promoted while the schema it requires has not
 * been applied, and nothing notices.
 *
 * The required set is read from the PULL REQUEST'S tree, not the local
 * checkout: the question is what the merged revision will require, and a lane's
 * working copy is not that. The proof of hosted state comes from the governed
 * census records, because the census IS the proof and copying it would create a
 * second truth to drift.
 *
 * Unmeasured is not pass. A gate that cannot read either side returns UNKNOWN,
 * and an unmeasured gate makes the merge escalate rather than auto-approve —
 * which is the fail-closed behaviour the merge policy already relies on.
 */
export function measureHostedMigrationParity(n, { gh = defaultGh, censusRequests = [], nowMs = Date.now(), gate, provenFrom } = {}) {
  const out = { hosted_migration_parity: null };
  try {
    const listAt = (ref) => {
      const res = gh(["api", `repos/${n.repository}/contents/supabase/migrations?ref=${ref}`, "--jq", "[.[].name]"]);
      if (res.status !== 0) return null;
      const names = parseJson(res.stdout);
      return Array.isArray(names) ? gate.requiredVersionsFromFilenames(names) : null;
    };

    /*
     * THE PROMOTED REVISION, NOT THE CANDIDATE — the same correction made in
     * trusted-host-merge.mjs, and it had to be made twice because this is a
     * SEPARATE COPY of the measurement. That is not incidental: the merge
     * executor's copy decides whether a merge runs, and THIS copy is what the
     * policy reads, so the Director's `hosted_migration_parity` denial came from
     * here. Fixing only the executor would have left the denial exactly where
     * the operator sees it, which is the "trusted-child guards are separate
     * copies" failure this codebase has already paid for once.
     *
     * Both now delegate to the one owner in migration-parity.mjs, so a third
     * copy has nothing to copy.
     */
    const expectedRevision = n.targetBranch || "staging";
    const expected = listAt(expectedRevision);
    if (!expected) {
      out.hosted_migration_parity_detail = "could not read the promoted revision's migration set";
      return out;
    }
    const candidate = listAt(n.expectedHeadSha);
    const evidence = gate.hostedMigrationEvidence(censusRequests, {
      artifactPath: "hosted-migration-identity-census.sql",
    });
    const freshness = gate.hostedEvidenceFreshness(evidence, { requests: censusRequests, nowMs });
    const verdict = gate.promotionParityGate({ expected, candidate, evidence, freshness, expectedRevision, nowMs });

    // null (not false) when unmeasured: the policy treats an unmeasured gate as
    // "escalate", which is the answer an unreadable measurement deserves. STALE
    // is unmeasured for this purpose — it blocks, and it must not be recorded as
    // a measured claim that hosted is behind.
    out.hosted_migration_parity = verdict.measured ? verdict.promote : null;
    out.hosted_migration_parity_detail = verdict.reason;
    out.hosted_migration_parity_status = verdict.status;
    out.hosted_migration_expected_revision = verdict.expected_revision || null;
    out.hosted_migration_expected_revision_kind = verdict.expected_revision_kind || null;
    out.hosted_migration_required_head = verdict.expected_migration_head || null;
    out.hosted_migration_proven_head = verdict.hosted_migration_head || null;
    out.hosted_migration_missing_on_hosted = verdict.missing_on_hosted || [];
    out.hosted_migration_candidate_only = verdict.candidate_only_migrations || [];
    out.hosted_migration_evidence_age_ms = verdict.evidence_age_ms ?? null;
    out.hosted_migration_proof_request = evidence?.request_id || null;
  } catch (err) {
    out.hosted_migration_parity_detail = String(err?.message || err).slice(0, 200);
  }
  return out;
}
