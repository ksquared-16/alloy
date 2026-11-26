/**
 * ONE ANSWER TO "WHAT AUTHORIZATION IDENTITY DOES THIS ACTION HAVE?"
 *
 * WHY THIS MODULE EXISTS. The same defect has now been fixed four times, each
 * time at one call site, each time leaving another site deriving the same fact
 * its own way:
 *
 *   1. merge input aliases   — the grant read `pull_request_number`, the
 *                              executor also read `pull_request`, so a merge
 *                              proposed one way got a grant pinned to null.
 *   2. source branch         — one side inferred it from the lane binding, the
 *                              other from the request.
 *   3. authorization scope   — minted under `lane_id`, searched for under
 *                              `repository_id`; authority written to one
 *                              partition and looked for in another.
 *   4. environment           — minted as "staging", looked up as
 *                              DEFAULT_TARGET (`alloy_deployed_primary`),
 *                              which is operator-only and therefore ALWAYS
 *                              refused: an exact-request authorization for a
 *                              push could never be resolved by anyone.
 *
 * Every one of those was two sides independently reconstructing one identity
 * from raw inputs. Patching the fourth call site would only have queued up a
 * fifth, so identity is now DERIVED IN ONE PLACE and carried, never
 * rediscovered. Minting, the pre-consumption proof and the trusted-host
 * execution boundary all call `resolveActionAuthorizationIdentity`.
 *
 * TWO DIFFERENT THINGS ARE BOTH CALLED "ENVIRONMENT". Keep them apart:
 *
 *   POLICY environment       `environmentOf()` in director-authority.mjs —
 *                            which delegated policy may decide this at all.
 *                            A push is proposed AT staging, so its policy
 *                            environment is "staging".
 *
 *   AUTHORIZATION environment  this module — what the execution actually
 *                            WRITES INTO, which is what an authorization is
 *                            bound to.
 *
 * They are not the same question and must not be collapsed. Pushing
 * `promote/foo` is proposed at staging but WRITES a branch ref that deploys
 * nowhere; merging that branch is what writes staging. So:
 *
 *   the authorization environment of an action is the deployment environment
 *   its write lands in. A write that lands in no deployment environment has
 *   the environment `repository`.
 *
 * That keeps `alloy_deployed_primary` where it belongs — it is a DATABASE
 * target, and it never again silently becomes the identity of a git push.
 */
import { ACTION_TYPES, DEFAULT_TARGET } from "./trusted-host-action-registry.mjs";
import { readMergeInputIdentity } from "./trusted-host-merge.mjs";

/** The environment of a repository write that reaches no deployment. */
export const REPOSITORY_ENVIRONMENT = "repository";

/**
 * Refs that ARE a deployment environment. Everything else is `repository`.
 * A push straight at one of these is a deployment write and is named as one,
 * so it can never be minted as ordinary repository authority.
 */
export const DEPLOYMENT_REF_ENVIRONMENTS = Object.freeze({
  staging: "staging",
  main: "production",
  master: "production",
  production: "production",
  prod: "production",
});

const norm = (v) => String(v ?? "").trim().toLowerCase();

/** `refs/heads/x`, `origin/x` and `x` are one ref. */
export function normalizeRef(ref) {
  const r = norm(ref).replace(/^refs\/heads\//, "").replace(/^origin\//, "");
  return r || null;
}

export function environmentForRef(ref) {
  const r = normalizeRef(ref);
  if (!r) return null;
  return DEPLOYMENT_REF_ENVIRONMENTS[r] || REPOSITORY_ENVIRONMENT;
}

/** One comparison spelling for a repository, whatever remote form it arrived in. */
export function normalizeRepositoryIdentity(value) {
  const v = norm(value)
    .replace(/^git@github\.com:/, "")
    .replace(/^https?:\/\//, "")
    .replace(/^github\.com\//, "")
    .replace(/\.git$/, "");
  return v || null;
}

const normSha = (v) => {
  const s = norm(v);
  return /^[a-f0-9]{7,40}$/.test(s) ? s : null;
};

const firstOf = (inputs, keys) => {
  for (const k of keys) {
    const v = inputs?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
};

const REPOSITORY_KEYS = ["repository", "repo"];
const HEAD_SHA_KEYS = ["expectedHeadSha", "expected_head_sha", "head_sha", "headSha", "expectedSha", "expected_sha"];
const BRANCH_KEYS = ["branch", "headBranch", "head_branch"];
const BASE_KEYS = ["base", "baseBranch", "base_branch", "targetBranch", "target_branch"];

/**
 * The canonical authorization identity of one governed action.
 *
 * Accepts either the raw governed-request inputs or the registry-normalized
 * trusted-host action inputs: resolving both to the same identity is the whole
 * point, and is asserted directly in the anti-drift suite.
 *
 * `requestId` and `contentFingerprint` cannot be derived from inputs — they
 * belong to the governed request — so they are carried, not invented. Nothing
 * else is ever taken from a caller.
 */
export function resolveActionAuthorizationIdentity({
  actionType,
  scope = null,
  inputs = {},
  target = null,
  requestId = null,
  contentFingerprint = null,
} = {}) {
  const type = String(actionType || "").trim();
  const repository = normalizeRepositoryIdentity(firstOf(inputs, REPOSITORY_KEYS));
  const base = {
    ok: Boolean(type),
    actionType: type || null,
    scope: scope || null,
    repository,
    environment: null,
    targetRef: null,
    sourceRef: null,
    sourceSha: null,
    subjectKey: null,
    pullRequestNumber: null,
    mergeMethod: null,
    requestId: requestId || null,
    contentFingerprint: contentFingerprint || null,
    reason: type ? null : "missing_action_type",
  };
  if (!type) return finish(base);

  /*
   * A DISPATCH IS IDENTIFIED BY WHERE IT GOES, NOT JUST BY WHAT IT IS.
   *
   * Without this case the resolver produced an empty identity for every
   * dispatch, so dedupeKey collapsed to mission|lane|action_key|target for all
   * of them. Fanning out to six lanes therefore produced ONE request: the
   * second call returned the first request's id, reported ok, and queued
   * nothing for the second lane. A cohort would have counted lanes that never
   * received work — exactly the failure the coordinator refuses to make,
   * arriving underneath it.
   *
   * The identity of a dispatch is the target lane within a measurement. Two
   * dispatches to different lanes are different actions; a repeat to the same
   * lane in the same measurement is genuinely the same one and should dedupe.
   */
  if (type === ACTION_TYPES.LANE_DISPATCH_MEASUREMENT_INSTRUCTION) {
    const targetLane = norm(firstOf(inputs, ["target_lane_id", "targetLaneId"])) || null;
    const measurement = norm(firstOf(inputs, ["measurement_id", "measurementId"])) || null;
    return finish({
      ...base,
      environment: norm(target) || null,
      targetRef: targetLane,
      subjectKey: targetLane && measurement ? `${measurement}:${targetLane}` : null,
    });
  }

  if (type === ACTION_TYPES.DATABASE_READ_CENSUS) {
    const dbTarget = norm(firstOf(inputs, ["databaseTarget", "database_target"]) || target) || DEFAULT_TARGET;
    return finish({
      ...base,
      environment: dbTarget,
      targetRef: null,
      subjectKey: firstOf(inputs, ["queryHash", "query_hash", "expectedQueryHash", "expected_query_hash"]) || null,
    });
  }

  if (type === ACTION_TYPES.DATABASE_APPLY_MIGRATION) {
    // A migration names its environment outright; there is nothing to infer.
    const env = norm(firstOf(inputs, ["environment"]) || target) || null;
    const sha = normSha(firstOf(inputs, ["expectedSha", "expected_sha", ...HEAD_SHA_KEYS]));
    return finish({
      ...base,
      environment: env,
      targetRef: env,
      sourceSha: sha,
      subjectKey: sha || firstOf(inputs, ["dedupeKey", "dedupe_key"]) || null,
      reason: env ? null : "missing_environment",
      ok: Boolean(env),
    });
  }

  if (type === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) {
    // The one parser that owns merge spelling. Never re-implemented here.
    const m = readMergeInputIdentity(inputs);
    const targetRef = normalizeRef(m.targetBranch || target);
    return finish({
      ...base,
      // A merge is the action that actually writes the target branch, so a
      // merge into staging genuinely IS a staging write.
      environment: environmentForRef(targetRef),
      targetRef,
      sourceSha: m.expectedHeadSha,
      subjectKey: m.expectedHeadSha,
      pullRequestNumber: m.pullRequestNumber,
      mergeMethod: m.mergeMethod || null,
      reason: targetRef ? null : "missing_target_branch",
      ok: Boolean(targetRef),
    });
  }

  if (type === ACTION_TYPES.REPOSITORY_PUSH || type === ACTION_TYPES.REPOSITORY_DELETE_REMOTE_BRANCH) {
    // A push writes ONE ref. `promote/foo` deploys nowhere, so it is repository
    // authority; `staging` or `main` would be a deployment write and is named
    // as one, which is what stops it being minted as anything milder.
    const ref = normalizeRef(firstOf(inputs, BRANCH_KEYS));
    const sha = normSha(firstOf(inputs, HEAD_SHA_KEYS));
    return finish({
      ...base,
      environment: environmentForRef(ref),
      targetRef: ref,
      sourceRef: ref,
      sourceSha: sha,
      subjectKey: sha,
      reason: ref ? null : "missing_branch",
      ok: Boolean(ref),
    });
  }

  if (type === ACTION_TYPES.PROMOTION_OPEN_PR) {
    // Opening a pull request writes a PROPOSAL. It changes no branch and
    // deploys nothing, so it is repository authority — but the base it aims at
    // is bound into the identity, so authority to propose into staging is not
    // authority to propose into main.
    const baseRef = normalizeRef(firstOf(inputs, BASE_KEYS) || target);
    const head = normalizeRef(firstOf(inputs, ["headBranch", "head_branch", "branch"]));
    const sha = normSha(firstOf(inputs, HEAD_SHA_KEYS));
    return finish({
      ...base,
      environment: REPOSITORY_ENVIRONMENT,
      targetRef: baseRef,
      sourceRef: head,
      sourceSha: sha,
      subjectKey: sha,
      reason: baseRef ? null : "missing_base",
      ok: Boolean(baseRef),
    });
  }

  if (type === ACTION_TYPES.REPOSITORY_CLOSE_PULL_REQUEST) {
    const m = readMergeInputIdentity(inputs);
    const sha = m.expectedHeadSha || normSha(firstOf(inputs, HEAD_SHA_KEYS));
    return finish({
      ...base,
      // Closing an unmerged pull request changes no branch and no environment.
      environment: REPOSITORY_ENVIRONMENT,
      targetRef: normalizeRef(firstOf(inputs, ["expectedHeadBranch", "expected_head_branch", ...BRANCH_KEYS])),
      sourceSha: sha,
      subjectKey: sha,
      pullRequestNumber: m.pullRequestNumber,
    });
  }

  // Everything else (QA identity, worktree retirement, reconciliation) is a
  // host-local action with no deployment target of its own. It gets repository
  // -class identity and its own subject binding; none of these are delegable,
  // so this is the audit shape rather than an approval path.
  const sha = normSha(firstOf(inputs, [...HEAD_SHA_KEYS, "headSha"]));
  return finish({
    ...base,
    environment: REPOSITORY_ENVIRONMENT,
    targetRef: normalizeRef(firstOf(inputs, BRANCH_KEYS)),
    sourceSha: sha,
    subjectKey: sha
      || firstOf(inputs, ["dedupeKey", "dedupe_key", "safetyFingerprint", "planFingerprint", "laneId", "lane_id"])
      || null,
  });
}

/**
 * The lookup shape. Both `grantExactRequestAuthorization` and
 * `findAuthorization` are fed from here, so a grant is always searched for with
 * the identity it was minted under.
 */
function finish(identity) {
  const databaseTarget = identity.actionType === ACTION_TYPES.DATABASE_READ_CENSUS
    ? (identity.environment || DEFAULT_TARGET)
    // NOT DEFAULT_TARGET. That is a database default; letting it stand in for a
    // repository action is precisely how a staging authorization became an
    // operator-only one that nothing could ever resolve.
    : (identity.environment || null);
  return Object.freeze({
    ...identity,
    databaseTarget,
    lookup: Object.freeze({
      missionId: identity.scope,
      actionType: identity.actionType,
      databaseTarget,
      environment: identity.environment,
      repository: identity.repository,
      queryHash: identity.subjectKey,
      requestId: identity.requestId,
      contentFingerprint: identity.contentFingerprint,
      targetRef: identity.targetRef,
    }),
    mint: Object.freeze({
      missionId: identity.scope,
      actionType: identity.actionType,
      environment: identity.environment,
      repository: identity.repository,
      sourceSha: identity.sourceSha,
      targetRef: identity.targetRef,
      requestId: identity.requestId,
      contentFingerprint: identity.contentFingerprint,
    }),
  });
}

/** Do two derivations of the same action describe the same authorization? */
export function sameAuthorizationIdentity(a, b) {
  if (!a || !b) return false;
  const fields = ["actionType", "scope", "repository", "environment", "targetRef", "sourceSha", "subjectKey"];
  return fields.every((f) => norm(a[f]) === norm(b[f]));
}

/** What differs, for a refusal that names the real mismatch rather than "denied". */
export function authorizationIdentityMismatch(a, b) {
  const fields = ["actionType", "scope", "repository", "environment", "targetRef", "sourceSha", "subjectKey"];
  const out = {};
  for (const f of fields) {
    if (norm(a?.[f]) !== norm(b?.[f])) out[f] = { minted: a?.[f] ?? null, requested: b?.[f] ?? null };
  }
  return out;
}
