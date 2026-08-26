/**
 * Bounded trusted-host GitHub merge. No generic shell. No worker tokens.
 */
import { spawnSync } from "node:child_process";
// The remote-mutation guard is shared: merging is not the only thing here that
// leaves this machine, and one guard in one place is the point.
import { canonicalGatewayRuntimeRoot, liveMergePermitted } from "./trusted-host-remote-guard.mjs";

export { canonicalGatewayRuntimeRoot, liveMergePermitted };

export const ALLOWED_TARGET_BRANCHES = Object.freeze(["staging"]);
export const ALLOWED_MERGE_METHODS = Object.freeze(["merge", "squash", "rebase"]);
export const BLOCKED_TARGET_BRANCHES = Object.freeze(["main", "master", "production", "prod"]);
const DEFAULT_REPOS = Object.freeze(["ksquared-16/alloy", "ksquared-16/alloy"]);

export function allowlistedRepositories() {
  const extra = String(process.env.VACILANDO_GITHUB_REPOSITORY || process.env.ALLOY_GITHUB_REPOSITORY || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_REPOS, ...extra])];
}

function normRepo(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/^git@github\.com:/i, "");
}

function normSha(value) {
  return String(value || "").trim().toLowerCase();
}

function shaEquals(a, b) {
  const x = normSha(a);
  const y = normSha(b);
  if (!x || !y) return false;
  const n = Math.min(x.length, y.length, 40);
  return n >= 7 && x.slice(0, n) === y.slice(0, n);
}

export function validateMergeInputs(inputs = {}) {
  if (inputs.sql || inputs.statement || inputs.command || inputs.argv || inputs.shell) {
    return {
      ok: false,
      code: "arbitrary_command_rejected",
      detail: "Only repository.merge_pull_request is allowed; generic shell is not registered.",
    };
  }
  const repository = normRepo(inputs.repository || inputs.repo);
  if (!repository) return { ok: false, code: "missing_repository", detail: "repository is required" };
  if (!allowlistedRepositories().includes(repository)) {
    return { ok: false, code: "repository_not_allowlisted", detail: `Repository ${repository} is not allowlisted` };
  }
  // `pull_request` is accepted alongside the other spellings. A lane proposed
  // `{"pull_request": 522}` — an unambiguous pull request number by any reading —
  // and got `pull_request_number must be a positive integer`, which describes a
  // malformed value rather than a field name it did not recognise. The number is
  // still validated exactly as before; only the ways of naming it widened.
  const rawPullRequest = inputs.pull_request_number
    ?? inputs.pullRequestNumber
    ?? inputs.pull_request
    ?? inputs.pullRequest
    ?? inputs.pr;
  const pullRequestNumber = Number(rawPullRequest);
  if (!Number.isInteger(pullRequestNumber) || pullRequestNumber < 1) {
    return {
      ok: false,
      code: "invalid_pull_request_number",
      // Say what arrived, so a near-miss reads as a near-miss.
      detail: rawPullRequest === undefined
        ? "a pull request number is required (pull_request_number, pullRequestNumber, pull_request or pr)"
        : `pull_request_number must be a positive integer; received ${JSON.stringify(rawPullRequest)}`,
    };
  }
  const targetBranch = String(inputs.target_branch || inputs.targetBranch || "staging").trim();
  if (BLOCKED_TARGET_BRANCHES.includes(targetBranch) || targetBranch === "production") {
    return { ok: false, code: "production_target_rejected", detail: "Production and default-branch merges are not registered." };
  }
  if (!ALLOWED_TARGET_BRANCHES.includes(targetBranch)) {
    return { ok: false, code: "target_branch_not_allowed", detail: `target_branch must be one of: ${ALLOWED_TARGET_BRANCHES.join(", ")}` };
  }
  const expectedHeadSha = normSha(inputs.expected_head_sha || inputs.expectedHeadSha || inputs.head_sha);
  if (!/^[a-f0-9]{7,40}$/.test(expectedHeadSha)) {
    return { ok: false, code: "missing_expected_head_sha", detail: "expected_head_sha is required" };
  }
  const mergeMethod = String(inputs.merge_method || inputs.mergeMethod || "merge").trim();
  if (!ALLOWED_MERGE_METHODS.includes(mergeMethod)) {
    return { ok: false, code: "merge_method_not_allowed", detail: "merge_method must be merge, squash, or rebase" };
  }
  if (inputs.force || inputs.admin || inputs.bypass_checks || inputs.bypassChecks) {
    return { ok: false, code: "force_merge_rejected", detail: "Force merge and check bypass are not allowed." };
  }
  const requiredChecksGreen = inputs.required_checks_green ?? inputs.requiredChecksGreen ?? true;
  if (requiredChecksGreen !== true) {
    return { ok: false, code: "required_checks_must_be_green", detail: "required_checks_green must be true" };
  }
  return {
    ok: true,
    normalized: {
      actionType: "repository.merge_pull_request",
      repository,
      pullRequestNumber,
      targetBranch,
      expectedHeadSha,
      mergeMethod,
      requiredChecksGreen: true,
      dedupeKey: `merge:${repository}#${pullRequestNumber}#${expectedHeadSha.slice(0, 12)}#${targetBranch}`,
    },
  };
}

function defaultGh(args, { timeout = 60_000 } = {}) {
  return spawnSync("gh", args, {
    encoding: "utf8",
    timeout,
    env: process.env,
    maxBuffer: 2 * 1024 * 1024,
  });
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

const SUCCESS_CONCLUSIONS = new Set(["SUCCESS"]);
const NEUTRAL_CONCLUSIONS = new Set(["NEUTRAL", "SKIPPED", "STALE"]);
const FAILING_CONCLUSIONS = new Set([
  "FAILURE", "TIMED_OUT", "CANCELLED", "STARTUP_FAILURE", "ACTION_REQUIRED",
]);
const SUCCESS_STATES = new Set(["SUCCESS"]);
const FAILING_STATES = new Set(["FAILURE", "ERROR"]);
const PENDING_STATUSES = new Set([
  "QUEUED", "IN_PROGRESS", "PENDING", "EXPECTED", "REQUESTED", "WAITING",
]);
const PENDING_STATES = new Set(["PENDING", "EXPECTED"]);
const COMPLETED_STATUSES = new Set(["COMPLETED", "COMPLETE"]);
const GITHUB_ALLOWS_MERGE = new Set(["CLEAN", "HAS_HOOKS", "UNSTABLE"]);

function asUpper(value) {
  return String(value == null ? "" : value).trim().toUpperCase();
}

function checkName(entry = {}) {
  return String(entry.name || entry.context || entry.contextName || entry.context || "check");
}

function hasExplicitRequiredFlag(entry = {}) {
  return typeof entry.isRequired === "boolean"
    || typeof entry.required === "boolean"
    || entry.isRequired === "true"
    || entry.isRequired === "false"
    || entry.required === "true"
    || entry.required === "false";
}

function requiredFlag(entry = {}) {
  if (typeof entry.isRequired === "boolean") return entry.isRequired;
  if (typeof entry.required === "boolean") return entry.required;
  if (entry.isRequired === "true" || entry.required === "true") return true;
  if (entry.isRequired === "false" || entry.required === "false") return false;
  return "unknown";
}

function entryKind(entry = {}) {
  const typeName = String(entry.__typename || entry.typename || "");
  if (typeName === "StatusContext") return "status_context";
  if (typeName === "CheckRun") return "check_run";
  if (entry.context && entry.state && entry.conclusion == null && entry.status == null) return "status_context";
  if (entry.conclusion != null || entry.status != null || entry.name) return "check_run";
  return "unknown";
}

function classFromState(state) {
  if (state === "failure") return "failing";
  if (state === "pending") return "pending";
  if (state === "unknown") return "unknown";
  return "complete";
}

/**
 * Canonical GitHub check/status normalizer.
 * Missing conclusion is not pending. StatusContext uses `state`.
 * CheckRun uses `status` + `conclusion`. Unknown is distinct from pending.
 */
export function classifyCheckState(entry = {}) {
  const name = checkName(entry);
  const required = requiredFlag(entry);
  const kind = entryKind(entry);
  const conclusion = asUpper(entry.conclusion);
  const state = asUpper(entry.state);
  const status = asUpper(entry.status);

  let checkState = "unknown";
  if (FAILING_CONCLUSIONS.has(conclusion) || FAILING_STATES.has(state)) {
    checkState = "failure";
  } else if (PENDING_STATUSES.has(status) || PENDING_STATES.has(state)) {
    checkState = "pending";
  } else if (SUCCESS_CONCLUSIONS.has(conclusion) || SUCCESS_STATES.has(state)) {
    checkState = "success";
  } else if (NEUTRAL_CONCLUSIONS.has(conclusion)) {
    checkState = "neutral";
  } else if (COMPLETED_STATUSES.has(status) && conclusion) {
    checkState = "unknown";
  } else if (COMPLETED_STATUSES.has(status) && !conclusion) {
    checkState = "unknown";
  } else if (!conclusion && !state && !status) {
    checkState = "unknown";
  }

  return {
    name,
    kind,
    required,
    state: checkState,
    class: classFromState(checkState),
  };
}

/** @deprecated Use classifyCheckState. Kept for existing tests. */
export function classifyStatusCheck(entry = {}) {
  return classifyCheckState(entry);
}

export function summarizeCheckRollup(rollup = [], { requiredNames = [] } = {}) {
  const items = Array.isArray(rollup)
    ? rollup
    : (Array.isArray(rollup?.nodes) ? rollup.nodes : (Array.isArray(rollup?.contexts) ? rollup.contexts : []));
  const requiredSet = new Set((requiredNames || []).map(String).filter(Boolean));
  const classified = items.filter(Boolean).map((entry) => {
    const row = classifyCheckState(entry);
    if (row.required === "unknown" && requiredSet.size) {
      row.required = requiredSet.has(row.name);
    }
    return row;
  });
  const required = classified.filter((row) => row.required === true);
  const scoped = required;
  return {
    total: classified.length,
    required: scoped.length,
    requirednessKnown: classified.some((row) => row.required === true || row.required === false) || requiredSet.size > 0,
    passing: scoped.filter((row) => row.state === "success" || row.state === "neutral").length,
    failing: scoped.filter((row) => row.state === "failure").map((row) => row.name),
    pending: scoped.filter((row) => row.state === "pending").map((row) => row.name),
    unknown: scoped.filter((row) => row.state === "unknown").map((row) => row.name),
    unscopedPending: classified.filter((row) => row.required !== true && row.state === "pending").map((row) => row.name),
    unscopedUnknown: classified.filter((row) => row.required !== true && row.state === "unknown").map((row) => row.name),
    items: classified,
  };
}

function checkSummary(rollup = [], options = {}) {
  return summarizeCheckRollup(rollup, options);
}

function checkEvidence(pr = {}) {
  const checks = pr.checks || {};
  return {
    merge_state: pr.mergeStateStatus || null,
    mergeable: pr.mergeable || null,
    pending: [...(checks.pending || [])],
    failing: [...(checks.failing || [])],
    unknown: [...(checks.unknown || [])],
  };
}

const REQUIRED_CHECK_QUERY = "query($owner:String!,$name:String!,$n:Int!){repository(owner:$owner,name:$name){pullRequest(number:$n){mergeStateStatus commits(last:1){nodes{commit{statusCheckRollup{state contexts(last:40){nodes{__typename ... on CheckRun{name status conclusion isRequired(pullRequestNumber:$n)} ... on StatusContext{context state isRequired(pullRequestNumber:$n)}}}}}}}}}}}";

function repoParts(repository) {
  const [owner, name] = String(repository || "").split("/");
  return { owner, name };
}

function graphqlRequiredMap(payload) {
  const nodes = payload?.data?.repository?.pullRequest?.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes
    || payload?.data?.repository?.pullRequest?.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes
    || [];
  const byName = new Map();
  for (const node of nodes) {
    if (!node) continue;
    const name = node.name || node.context;
    if (!name || typeof node.isRequired !== "boolean") continue;
    byName.set(String(name), node.isRequired);
  }
  const rollupState = payload?.data?.repository?.pullRequest?.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state
    || payload?.data?.repository?.pullRequest?.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state
    || null;
  return { byName, rollupState };
}

function protectionRequiredNames(repository, branch, gh) {
  if (!repository || !branch || typeof gh !== "function") return [];
  const res = gh(["api", `repos/${repository}/branches/${encodeURIComponent(branch)}/protection/required_status_checks`]);
  if (res.status !== 0) return [];
  const body = parseJson(res.stdout);
  const contexts = Array.isArray(body?.contexts) ? body.contexts : [];
  const checks = Array.isArray(body?.checks) ? body.checks.map((c) => c?.context).filter(Boolean) : [];
  return [...new Set([...contexts, ...checks].map(String))];
}

function enrichRequiredFlags(pr, rollup, { gh, repository } = {}) {
  if (!Array.isArray(rollup) || !rollup.length || rollup.some(hasExplicitRequiredFlag)) {
    return { rollup, requiredNames: [] };
  }
  const { owner, name } = repoParts(repository);
  const number = pr?.number;
  if (owner && name && number && typeof gh === "function") {
    const gql = gh([
      "api", "graphql",
      "-F", `owner=${owner}`,
      "-F", `name=${name}`,
      "-F", `n=${number}`,
      "-f", `query=${REQUIRED_CHECK_QUERY}`,
    ]);
    if (gql.status === 0) {
      const { byName } = graphqlRequiredMap(parseJson(gql.stdout));
      if (byName.size) {
        return {
          rollup: rollup.map((entry) => {
            if (hasExplicitRequiredFlag(entry)) return entry;
            const key = checkName(entry);
            return byName.has(key) ? { ...entry, isRequired: byName.get(key) } : entry;
          }),
          requiredNames: [...byName.entries()].filter(([, required]) => required).map(([key]) => key),
        };
      }
    }
  }
  return {
    rollup,
    requiredNames: protectionRequiredNames(repository, firstDefined(pr.baseRefName, pr.baseRefName), gh),
  };
}

function firstDefined(...values) {
  for (const v of values) {
    if (v != null && v !== "") return v;
  }
  return null;
}

function rollupFrom(pr = {}) {
  const raw = firstDefined(
    pr.statusCheckRollup,
    pr.statusCheckRollup,
    pr.status_check_rollup,
  );
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.contexts)) return raw.contexts;
  return [];
}

export function inspectPullRequest(inputs, { gh = defaultGh } = {}) {
  const v = validateMergeInputs(inputs);
  if (!v.ok) return v;
  const n = v.normalized;
  const view = gh([
    "pr", "view", String(n.pullRequestNumber),
    "--repo", n.repository,
    "--json", "number,state,isDraft,mergeable,mergeStateStatus,baseRefName,headRefName,headRefOid,url,title,statusCheckRollup,reviewDecision,mergeCommit,changedFiles,additions,deletions",
  ]);
  if (view.status !== 0) {
    return {
      ok: false,
      code: "pr_lookup_failed",
      detail: String(view.stderr || view.stdout || "gh pr view failed").split("\n")[0].slice(0, 200),
    };
  }
  const pr = parseJson(view.stdout);
  if (!pr) return { ok: false, code: "pr_unreadable", detail: "GitHub PR payload was not JSON" };
  const enriched = enrichRequiredFlags(pr, rollupFrom(pr), { gh, repository: n.repository });
  return {
    ok: true,
    normalized: n,
    pr: {
      number: pr.number,
      title: pr.title,
      url: pr.url,
      state: String(pr.state || "").toUpperCase(),
      draft: Boolean(pr.isDraft ?? pr.isDraft),
      mergeable: firstDefined(pr.mergeable, pr.mergeable),
      mergeStateStatus: firstDefined(pr.mergeStateStatus, pr.mergeStateStatus, pr.mergeable_state),
      baseRefName: firstDefined(pr.baseRefName, pr.baseRefName),
      headRefOid: firstDefined(pr.headRefOid, pr.headRefOid, pr.headSha),
      mergeCommitSha: pr.mergeCommit?.oid || pr.mergeCommit || null,
      reviewDecision: pr.reviewDecision || pr.reviewDecision || null,
      headRefName: pr.headRefName || null,
      changedFiles: Number.isFinite(pr.changedFiles) ? pr.changedFiles : null,
      additions: Number.isFinite(pr.additions) ? pr.additions : null,
      deletions: Number.isFinite(pr.deletions) ? pr.deletions : null,
      checks: checkSummary(enriched.rollup, { requiredNames: enriched.requiredNames }),
    },
  };
}

export function evaluateMergeReadiness(inspected) {
  if (!inspected?.ok) return inspected;
  const { normalized: n, pr } = inspected;
  if (pr.state === "MERGED") {
    const resultSha = String(pr.mergeCommitSha || pr.headRefOid || "");
    if (shaEquals(pr.headRefOid, n.expectedHeadSha) || shaEquals(resultSha, n.expectedHeadSha)) {
      return {
        ok: true,
        idempotent: true,
        code: "already_merged",
        mergeSha: resultSha || n.expectedHeadSha,
        stagingSha: resultSha || n.expectedHeadSha,
        pr,
        normalized: n,
      };
    }
    return {
      ok: false,
      code: "already_merged_different_head",
      detail: "PR is merged, but not at the expected head SHA.",
      pr,
      normalized: n,
    };
  }
  if (pr.state !== "OPEN") {
    return { ok: false, code: "pr_not_open", detail: `PR state is ${pr.state}`, pr, normalized: n };
  }
  if (pr.draft) {
    return { ok: false, code: "pr_is_draft", detail: "Draft PRs cannot be merged through this action.", pr, normalized: n };
  }
  if (String(pr.baseRefName) !== n.targetBranch) {
    return { ok: false, code: "unexpected_base_branch", detail: `PR base is ${pr.baseRefName}, expected ${n.targetBranch}`, pr, normalized: n };
  }
  if (!shaEquals(pr.headRefOid, n.expectedHeadSha)) {
    return {
      ok: false,
      code: "stale_expected_head",
      detail: "PR head SHA does not match expected_head_sha.",
      evidence: checkEvidence(pr),
      pr,
      normalized: n,
    };
  }
  const mergeable = String(pr.mergeable || "").toUpperCase();
  const mergeState = String(pr.mergeStateStatus || "").toUpperCase();
  const evidence = checkEvidence(pr);
  if (mergeable === "CONFLICTING" || mergeState === "DIRTY") {
    return { ok: false, code: "merge_conflict", detail: "PR has conflicts.", evidence, pr, normalized: n };
  }
  if (mergeable && mergeable !== "MERGEABLE" && mergeable !== "UNKNOWN") {
    return { ok: false, code: "not_mergeable", detail: `PR mergeable=${pr.mergeable}`, evidence, pr, normalized: n };
  }
  if (pr.checks.failing.length) {
    return {
      ok: false,
      code: "required_checks_failed",
      detail: `Required checks failed: ${pr.checks.failing.join(", ")}`,
      evidence,
      pr,
      normalized: n,
    };
  }
  if (pr.checks.pending.length) {
    return {
      ok: false,
      code: "required_checks_pending",
      detail: `Required checks pending: ${pr.checks.pending.join(", ")}`,
      evidence,
      pr,
      normalized: n,
    };
  }
  if (pr.checks.unknown.length) {
    return {
      ok: false,
      code: "required_checks_indeterminate",
      detail: `Required checks could not be classified: ${pr.checks.unknown.join(", ")}`,
      evidence,
      pr,
      normalized: n,
    };
  }
  const githubAllowsMerge = GITHUB_ALLOWS_MERGE.has(mergeState);
  const requirednessKnown = Boolean(pr.checks.requirednessKnown);
  const unscopedPending = pr.checks.unscopedPending || [];
  const unscopedUnknown = pr.checks.unscopedUnknown || [];
  if (!githubAllowsMerge && !requirednessKnown && (unscopedPending.length || unscopedUnknown.length)) {
    return {
      ok: false,
      code: "required_checks_indeterminate",
      detail: "Trusted host could not determine required-check status.",
      evidence: {
        ...evidence,
        pending: unscopedPending,
        unknown: unscopedUnknown,
      },
      pr,
      normalized: n,
    };
  }
  if (mergeState === "BLOCKED") {
    return { ok: false, code: "branch_policy_denied", detail: "GitHub reports the merge as blocked.", evidence, pr, normalized: n };
  }
  return { ok: true, normalized: n, pr, evidence };
}

export function mergePullRequest(inputs, { gh = defaultGh } = {}) {
  const inspected = inspectPullRequest(inputs, { gh });
  const ready = evaluateMergeReadiness(inspected);
  if (!ready.ok) return ready;
  const n = ready.normalized;
  if (ready.idempotent) {
    return {
      ok: true,
      idempotent: true,
      mergeSha: ready.mergeSha,
      stagingSha: ready.stagingSha,
      pullRequestNumber: n.pullRequestNumber,
      repository: n.repository,
      targetBranch: n.targetBranch,
      expectedHeadSha: n.expectedHeadSha,
      checks: ready.pr.checks,
      credentialsExposed: false,
    };
  }
  // Everything above this line only READ the pull request. This is the first
  // statement that changes the repository, so this is where the guard belongs.
  const permitted = liveMergePermitted({ injectedGh: gh !== defaultGh });
  if (!permitted.ok) {
    return { ok: false, code: permitted.code, detail: permitted.detail };
  }
  const methodFlag = n.mergeMethod === "squash" ? "--squash" : n.mergeMethod === "rebase" ? "--rebase" : "--merge";
  const merged = gh([
    "pr", "merge", String(n.pullRequestNumber),
    "--repo", n.repository,
    methodFlag,
    "--match-head-commit", n.expectedHeadSha,
  ], { timeout: 120_000 });
  if (merged.status !== 0) {
    const err = String(merged.stderr || merged.stdout || "gh pr merge failed");
    if (/already merged/i.test(err)) {
      const again = inspectPullRequest(inputs, { gh });
      const sha = again.pr?.mergeCommitSha || again.pr?.headRefOid || n.expectedHeadSha;
      return {
        ok: true,
        idempotent: true,
        mergeSha: sha,
        stagingSha: sha,
        pullRequestNumber: n.pullRequestNumber,
        repository: n.repository,
        targetBranch: n.targetBranch,
        expectedHeadSha: n.expectedHeadSha,
        checks: again.pr?.checks || ready.pr.checks,
        credentialsExposed: false,
      };
    }
    return { ok: false, code: "merge_failed", detail: err.split("\n")[0].slice(0, 240) };
  }
  const after = inspectPullRequest(inputs, { gh });
  const mergeSha = after.pr?.mergeCommitSha || after.pr?.headRefOid || n.expectedHeadSha;
  return {
    ok: true,
    idempotent: false,
    mergeSha,
    stagingSha: mergeSha,
    pullRequestNumber: n.pullRequestNumber,
    repository: n.repository,
    targetBranch: n.targetBranch,
    expectedHeadSha: n.expectedHeadSha,
    checks: after.pr?.checks || ready.pr.checks,
    credentialsExposed: false,
  };
}

export function publicMergeResult(result) {
  if (!result) return null;
  return {
    pull_request_number: result.pullRequestNumber,
    repository: result.repository,
    target_branch: result.targetBranch,
    expected_head_sha: result.expectedHeadSha,
    merge_sha: result.mergeSha,
    staging_sha: result.stagingSha,
    idempotent: Boolean(result.idempotent),
    checks: result.checks || null,
  };
}
