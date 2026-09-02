/**
 * MISSION-SCOPED DELEGATED AUTHORITY.
 *
 * THE PROBLEM. A Director writes "validate this work, push it, open the PR and
 * merge it to staging when checks pass", and Vacilando still stops at the merge
 * to ask for the same permission the mission already gave. The redundant click
 * is the defect; the click itself is not.
 *
 * WHAT THIS IS NOT. It is not general autonomous merge permission, and it is
 * not a second privileged execution mechanism. A delegation NEVER executes
 * anything. It can only satisfy the OPERATOR-APPROVAL requirement of a governed
 * action that is already going through the existing path:
 *
 *     mission -> governed action -> scoped grant -> trusted host
 *
 * The concrete execution still mints an exact-request authorization bound to
 * this repository, this PR, this head SHA, this target and this method, and the
 * trusted host still validates its own grant. Delegation removes a click; it
 * removes no binding and no check.
 *
 * TWO STAGES, BECAUSE THE PR DOES NOT EXIST YET.
 *   1. INTENT, captured at orientation from the mission's own words. It names a
 *      CLASS of future action: "merge this mission's promotion into staging".
 *   2. BINDING, at execution. The concrete request must be shown to fall wholly
 *      inside that class before the intent may satisfy anything.
 *
 * THE GRAMMAR IS DETERMINISTIC ON PURPOSE. No model judgement decides whether a
 * privileged action was authorised. Ambiguity is not resolved in favour of
 * acting: anything the grammar cannot read as an explicit, targeted delegation
 * leaves the ordinary operator-approval behaviour exactly as it was.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { ACTION_TYPES } from "./trusted-host-action-registry.mjs";

export const MISSION_DELEGATION_SCHEMA = "vacilando.mission_delegation.v1";

/**
 * V1 eligible actions. Deliberately three. Everything else — migrations,
 * destructive database work, force push, reset, branch/PR deletion, credential
 * operations, production anything — is unreachable from here by construction,
 * not by a check that could be forgotten.
 */
export const DELEGABLE_ACTIONS = Object.freeze([
  ACTION_TYPES.REPOSITORY_PUSH,
  ACTION_TYPES.PROMOTION_OPEN_PR,
  ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST,
]);

/** V1 permits delegation to exactly one target branch. */
export const DELEGABLE_TARGET_BRANCHES = Object.freeze(["staging"]);

/** Never delegable, whatever the mission says. */
export const OPERATOR_ONLY_ENVIRONMENTS = Object.freeze([
  "production", "prod", "alloy_deployed_primary", "deployed_primary", "main", "master",
]);

export const DELEGATION_STATUS = Object.freeze({
  UNCONSUMED: "unconsumed",
  CONSUMED: "consumed",
  REVOKED: "revoked",
  EXPIRED: "expired",
});

/** A mission's delegation lives as long as the mission, bounded. */
export const DEFAULT_DELEGATION_TTL_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Grammar
// ---------------------------------------------------------------------------

/**
 * Phrases that make a clause NOT a delegation, however action-shaped it looks.
 *
 * "do not merge to staging", "ask me before you merge", "check with me first"
 * all contain a perfectly good merge clause. Reading only the verb would turn a
 * prohibition into permission, which is the worst failure this module could
 * have. A clause carrying any of these is refused outright.
 */
const REFUSAL_MARKERS = [
  /\b(do not|don'?t|never|do n[o']t|cannot|can'?t|must not|mustn'?t|should not|shouldn'?t|without)\b/i,
  /\b(ask|confirm|check with|checking with|approval|approve|permission|authoris|authoriz|sign[- ]?off|let me know|wait for|hold off|pause|stop before)\b/i,
  /\b(unless|until i|if i|only if|maybe|might|consider|probably|prefer)\b/i,
];

/** Vague completion language that never delegates anything. */
const VAGUE_MARKERS = [
  /\bfinish (this|it|up)\b/i,
  /\btake care of it\b/i,
  /\bget (this|it) done\b/i,
  /\bship it\b/i,
  /\bhandle (this|it)\b/i,
  /\bdo the needful\b/i,
  /\bmake it happen\b/i,
];

/**
 * The action patterns. Each REQUIRES a concrete object, and the two that move
 * code between refs require an explicit named target. "merge it" alone is not a
 * delegation: merge it WHERE.
 */
const ACTION_PATTERNS = Object.freeze([
  {
    action: ACTION_TYPES.REPOSITORY_PUSH,
    // "push this branch", "push the branch", "push it" only when a branch is
    // named elsewhere in the same clause.
    patterns: [
      /\bpush\b[^.;]{0,40}\b(this|the|that)\s+(branch|work|promotion|change|commit)s?\b/i,
      /\bpush\b\s+(it|this)\b/i,
      /\bpush\b[^.;]{0,30}\bto\s+(the\s+)?remote\b/i,
    ],
    requiresTarget: false,
  },
  {
    action: ACTION_TYPES.PROMOTION_OPEN_PR,
    patterns: [
      /\bopen\b[^.;]{0,30}\b(pull request|pr)\b/i,
      /\braise\b[^.;]{0,30}\b(pull request|pr)\b/i,
      /\bcreate\b[^.;]{0,30}\b(pull request|pr)\b/i,
    ],
    requiresTarget: true,
  },
  {
    action: ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST,
    patterns: [
      /\bmerge\b/i,
    ],
    requiresTarget: true,
  },
]);

/** The target branch, only when the clause names it explicitly. */
const TARGET_RE = /\b(?:to|into|onto|against)\s+(?:the\s+)?([a-z0-9][a-z0-9._\/-]{0,60}?)\s*(?:branch\b)?(?=[\s,.;]|$)/i;

/** An explicit "only when checks pass" qualifier. */
const CHECKS_RE = /\b(when|once|after|if)\b[^.;]{0,60}\b(checks?|ci|validation|tests?)\b[^.;]{0,30}\b(pass|passed|green|clean|succeed)/i;

function normalizeBranch(raw) {
  const b = String(raw || "").trim().toLowerCase().replace(/[.,;:]+$/, "");
  return b || null;
}

/**
 * ONE REPOSITORY SHAPE, COMPARED ONE WAY.
 *
 * The registry's normalizeRemote yields `github.com/owner/repo`; governed action
 * inputs carry `owner/repo`; a raw remote is `git@github.com:owner/repo.git`.
 * Storing one shape and comparing against another is precisely the input-
 * contract defect family this codebase has already been bitten by twice — it
 * would have made every delegation silently fail as a repository mismatch.
 * Both sides of every comparison go through here.
 */
export function normalizeRepo(value) {
  return String(value ?? "")
    .trim()
    .replace(/^git@github\.com:/i, "")
    .replace(/^https?:\/\//i, "")
    .replace(/^github\.com\//i, "")
    .replace(/\.git$/i, "")
    .toLowerCase();
}

export function isOperatorOnlyBranch(branch) {
  return OPERATOR_ONLY_ENVIRONMENTS.includes(normalizeBranch(branch) || "");
}

/**
 * Refs a delegated PUSH may never write directly.
 *
 * TWO DIFFERENT QUESTIONS, AND CONFLATING THEM IS A REAL HOLE. `staging` is a
 * perfectly good delegable merge TARGET — it is the only one V1 allows — but it
 * is never a legitimate push DESTINATION: promotion into staging is a merge
 * through the trusted host, not a branch write. Reusing the operator-only
 * environment list for both meant a mission that delegated "push this branch"
 * would have covered a direct push to staging. Mirrors PROTECTED_REFS in
 * trusted-host-push.
 */
export const PROTECTED_PUSH_REFS = Object.freeze([
  "staging", "main", "master", "production", "prod", "head",
]);

export function isProtectedPushRef(branch) {
  return PROTECTED_PUSH_REFS.includes(normalizeBranch(branch) || "");
}

/**
 * Split a mission into clauses the grammar can judge one at a time.
 *
 * A refusal marker must only disarm the clause it appears in — "push the branch,
 * but ask me before merging" delegates the push and refuses the merge. Splitting
 * on sentence ends alone would let "ask me" poison the whole mission, and
 * splitting on nothing would let it authorise the merge.
 */
export function splitClauses(text) {
  return String(text || "")
    .split(/[.;\n]+|\band then\b|\bbut\b|\bhowever\b|\balthough\b|\bthough\b/i)
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * Read a mission's explicit delegations.
 *
 * Returns `{ delegations, refusals, vague }`. `delegations` is what the mission
 * unambiguously authorised; everything else is reported so the operator can see
 * why a phrase did NOT grant authority.
 */
export function parseMissionDelegation(text, { defaultTargetBranch = null } = {}) {
  const raw = String(text || "");
  const clauses = splitClauses(raw);
  const delegations = [];
  const refusals = [];
  let vague = false;

  for (const marker of VAGUE_MARKERS) {
    if (marker.test(raw)) vague = true;
  }

  for (const clause of clauses) {
    const refused = REFUSAL_MARKERS.find((re) => re.test(clause));
    for (const spec of ACTION_PATTERNS) {
      const hit = spec.patterns.some((re) => re.test(clause));
      if (!hit) continue;
      if (refused) {
        refusals.push({ action: spec.action, clause, reason: "refusal_or_approval_marker" });
        continue;
      }
      const m = clause.match(TARGET_RE);
      // "merge to staging" binds the target from the clause. A later clause may
      // carry the action while an earlier one named the target; V1 does not
      // infer across clauses, because inferring is how "to production" would
      // eventually be read off the wrong sentence.
      let target = m ? normalizeBranch(m[1]) : null;
      if (!target && !spec.requiresTarget) target = defaultTargetBranch || null;
      if (spec.requiresTarget && !target) {
        refusals.push({ action: spec.action, clause, reason: "no_explicit_target_branch" });
        continue;
      }
      if (target && isOperatorOnlyBranch(target)) {
        refusals.push({ action: spec.action, clause, reason: "operator_only_target" });
        continue;
      }
      if (spec.requiresTarget && !DELEGABLE_TARGET_BRANCHES.includes(target)) {
        refusals.push({ action: spec.action, clause, reason: "target_not_delegable_in_v1" });
        continue;
      }
      delegations.push({
        action: spec.action,
        target_branch: target,
        checks_required: spec.action === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST
          ? true                       // a merge always requires green checks in V1
          : CHECKS_RE.test(clause),
        clause,
      });
    }
  }

  // One delegation per action; the first explicit clause wins and a later
  // refusal of the same action removes it.
  const byAction = new Map();
  for (const d of delegations) if (!byAction.has(d.action)) byAction.set(d.action, d);
  for (const r of refusals) byAction.delete(r.action);

  return { delegations: [...byAction.values()], refusals, vague };
}

// ---------------------------------------------------------------------------
// Durable store
// ---------------------------------------------------------------------------

function runtimeRoot() {
  const fromEnv = process.env.ALLOY_RUNTIME_ROOT?.trim();
  if (fromEnv) return fromEnv;
  return join(homedir(), ".local", "state", "alloy-dev");
}

export function delegationStorePath(root = runtimeRoot()) {
  return join(root, "vacilando", "mission-delegations.json");
}

function emptyStore() {
  return { schema_version: MISSION_DELEGATION_SCHEMA, delegations: [] };
}

export function readDelegationStore(root = runtimeRoot()) {
  try {
    const parsed = JSON.parse(readFileSync(delegationStorePath(root), "utf8"));
    if (!parsed || !Array.isArray(parsed.delegations)) return emptyStore();
    return parsed;
  } catch { return emptyStore(); }
}

function writeStore(store, root = runtimeRoot()) {
  const p = delegationStorePath(root);
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  renameSync(tmp, p);
}

const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

/**
 * Capture what a mission explicitly delegated.
 *
 * The record answers exactly one question: WHAT CLASS of future governed action
 * did the Director authorise in this mission? It is never a boolean, and it
 * never carries a PR or a SHA — those are bound at execution, from the concrete
 * request, by the existing identity parsers.
 */
export function recordMissionDelegation({
  missionId = null,
  laneId = null,
  runId = null,
  repository,
  missionText,
  defaultTargetBranch = null,
  sourceBranch = null,
  mergeMethod = "merge",
  ttlMs = DEFAULT_DELEGATION_TTL_MS,
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  const scopeKey = missionId || laneId;
  if (!scopeKey) return { ok: false, error: "missing_mission_or_lane" };
  if (!repository) return { ok: false, error: "missing_repository" };
  const parsed = parseMissionDelegation(missionText, { defaultTargetBranch });
  if (!parsed.delegations.length) {
    return { ok: true, created: 0, delegations: [], parsed };
  }
  const store = readDelegationStore(root);
  const created = [];
  for (const d of parsed.delegations) {
    const rec = {
      schema_version: MISSION_DELEGATION_SCHEMA,
      delegation_id: `mdlg_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      mission_id: missionId || null,
      lane_id: laneId || null,
      run_id: runId || null,
      scope_key: scopeKey,
      repository,
      action_key: d.action,
      target_branch: d.target_branch,
      source_branch: sourceBranch || null,
      merge_method: mergeMethod,
      checks_required: d.checks_required,
      status: DELEGATION_STATUS.UNCONSUMED,
      // The Director's own words, kept so the operator can inspect WHY an
      // action was auto-authorised rather than taking the runtime's word.
      mission_clause: String(d.clause || "").slice(0, 400),
      created_at: iso(nowMs),
      expires_at: iso(nowMs + ttlMs),
      consumed_at: null,
      consumed_by_request_id: null,
      revoked_at: null,
    };
    store.delegations.push(rec);
    created.push(rec);
  }
  writeStore(store, root);
  return { ok: true, created: created.length, delegations: created, parsed };
}

export function listMissionDelegations({ scopeKey = null, root = runtimeRoot() } = {}) {
  const all = readDelegationStore(root).delegations;
  return scopeKey ? all.filter((d) => d.scope_key === scopeKey) : all;
}

export function delegationById(delegationId, root = runtimeRoot()) {
  return readDelegationStore(root).delegations.find((d) => d.delegation_id === delegationId) || null;
}

/** Live means unconsumed, unrevoked and unexpired. Anything else is inert. */
export function delegationIsLive(rec, nowMs = Date.now()) {
  if (!rec) return false;
  if (rec.status !== DELEGATION_STATUS.UNCONSUMED) return false;
  if (rec.revoked_at) return false;
  return Date.parse(rec.expires_at || 0) > nowMs;
}

export function revokeMissionDelegation(delegationId, { nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const store = readDelegationStore(root);
  const rec = store.delegations.find((d) => d.delegation_id === delegationId);
  if (!rec) return { ok: false, error: "delegation_not_found" };
  rec.status = DELEGATION_STATUS.REVOKED;
  rec.revoked_at = iso(nowMs);
  writeStore(store, root);
  return { ok: true, delegation: rec };
}

/**
 * ONE DELEGATION, ONE PRIVILEGED EXECUTION.
 *
 * A merge delegation that merged PR #1 cannot be replayed to merge PR #2, and a
 * push delegation does not become an indefinite licence to push future heads.
 * The mission may still authorise the whole sequence — push, open, merge — but
 * each of those is its own delegation and each is spent once.
 */
export function consumeMissionDelegation(delegationId, { requestId, nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const store = readDelegationStore(root);
  const rec = store.delegations.find((d) => d.delegation_id === delegationId);
  if (!rec) return { ok: false, error: "delegation_not_found" };
  if (!delegationIsLive(rec, nowMs)) return { ok: false, error: "delegation_not_live", status: rec.status };
  rec.status = DELEGATION_STATUS.CONSUMED;
  rec.consumed_at = iso(nowMs);
  rec.consumed_by_request_id = requestId || null;
  writeStore(store, root);
  return { ok: true, delegation: rec };
}

// ---------------------------------------------------------------------------
// Binding: does a concrete request fall wholly inside a delegation?
// ---------------------------------------------------------------------------

/**
 * The gate. Every answer is a named refusal, because "not authorised" without a
 * reason is indistinguishable from a bug, and the operator has to be able to
 * see why Vacilando did or did not ask.
 *
 * `identity` is the already-parsed merge identity where relevant, so this
 * function never re-derives PR/SHA/target/method from raw inputs — the shared
 * parsers stay authoritative.
 */
export function delegationCoversRequest(rec, {
  actionKey,
  repository,
  targetBranch = null,
  branch = null,
  mergeMethod = null,
  checksGreen = null,
  unrelatedCommits = 0,
  nowMs = Date.now(),
} = {}) {
  if (!rec) return { ok: false, error: "no_delegation" };
  if (!delegationIsLive(rec, nowMs)) {
    const expired = Date.parse(rec.expires_at || 0) <= nowMs;
    return { ok: false, error: rec.status === DELEGATION_STATUS.CONSUMED
      ? "delegation_already_consumed"
      : rec.status === DELEGATION_STATUS.REVOKED
        ? "delegation_revoked"
        : expired ? "delegation_expired" : "delegation_not_live" };
  }
  if (!DELEGABLE_ACTIONS.includes(actionKey)) return { ok: false, error: "action_not_delegable" };
  if (rec.action_key !== actionKey) return { ok: false, error: "delegation_action_mismatch" };
  if (normalizeRepo(rec.repository) !== normalizeRepo(repository)) {
    return { ok: false, error: "delegation_repository_mismatch" };
  }

  // Target/environment drift. Checked before anything else that could be read
  // as permission, and production is refused even if a delegation somehow named
  // it — the grammar already refuses to create one, this refuses to honour one.
  const wantTarget = normalizeBranch(targetBranch);
  if (actionKey !== ACTION_TYPES.REPOSITORY_PUSH) {
    if (!wantTarget) return { ok: false, error: "target_branch_unknown" };
    if (isOperatorOnlyBranch(wantTarget)) return { ok: false, error: "operator_only_target" };
    if (normalizeBranch(rec.target_branch) !== wantTarget) {
      return { ok: false, error: "delegation_target_mismatch" };
    }
  }
  // A push must never write a protected ref directly — including staging,
  // which is a legitimate merge target and never a legitimate push target.
  if (actionKey === ACTION_TYPES.REPOSITORY_PUSH && isProtectedPushRef(branch)) {
    return { ok: false, error: "protected_branch_push_refused" };
  }
  // The mission may pin the branch this delegation covers.
  if (rec.source_branch && branch && normalizeBranch(rec.source_branch) !== normalizeBranch(branch)) {
    return { ok: false, error: "delegation_branch_mismatch" };
  }
  if (actionKey === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) {
    if (mergeMethod && String(rec.merge_method) !== String(mergeMethod)) {
      return { ok: false, error: "delegation_merge_method_mismatch" };
    }
    if (rec.checks_required && checksGreen !== true) {
      return { ok: false, error: "required_checks_not_green" };
    }
  }
  // Reconciliation safety: a mission that delegated ITS work never delegated
  // whatever else happened to land on the branch.
  if (Number(unrelatedCommits) > 0) {
    return { ok: false, error: "unrelated_commits_present", unrelated: Number(unrelatedCommits) };
  }
  return { ok: true, delegation_id: rec.delegation_id, mission_clause: rec.mission_clause };
}

/**
 * Find the one live delegation that covers this concrete request, if any.
 * Returns `{ ok, delegation, error }`; `error` names the closest refusal so the
 * operator card can explain the ask.
 */
export function findCoveringDelegation(context, { root = runtimeRoot(), nowMs = Date.now() } = {}) {
  const scopeKey = context.missionId || context.laneId;
  if (!scopeKey) return { ok: false, error: "no_mission_scope" };
  const candidates = listMissionDelegations({ scopeKey, root })
    .filter((d) => d.action_key === context.actionKey);
  if (!candidates.length) return { ok: false, error: "no_delegation_for_action" };
  let lastError = "no_delegation_for_action";
  for (const rec of candidates) {
    const out = delegationCoversRequest(rec, { ...context, nowMs });
    if (out.ok) return { ok: true, delegation: rec, detail: out };
    lastError = out.error;
  }
  return { ok: false, error: lastError };
}

/**
 * CAPTURE AT ORIENTATION, FROM THE DIRECTOR'S OWN WORDS.
 *
 * The Director's instruction for a lane IS the mission text for this runtime,
 * so delegation is read once when the prompt arrives rather than re-judged at
 * every execution. Reading it later, at the moment of a privileged action,
 * would be exactly the "LLM guess at execution time" the contract forbids.
 *
 * Best-effort and non-fatal by construction: a lane with no repository, or a
 * prompt with no explicit delegation, simply records nothing and the ordinary
 * operator-approval behaviour is untouched. It can only ever ADD an explicit
 * authority the Director wrote down.
 */
export function captureDelegationFromInstruction({
  laneId,
  runId = null,
  missionId = null,
  instruction,
  repository = null,
  sourceBranch = null,
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  try {
    if (!laneId || !instruction || !repository) {
      return { ok: false, error: "insufficient_context", created: 0 };
    }
    return recordMissionDelegation({
      missionId,
      laneId,
      runId,
      repository,
      missionText: instruction,
      sourceBranch,
      nowMs,
      root,
    });
  } catch (e) {
    return { ok: false, error: String(e?.message || e), created: 0 };
  }
}
