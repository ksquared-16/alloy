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
  /**
   * Bound to one concrete request while its executable authority is being
   * established. Single-use is preserved — a second request cannot reserve or
   * use a delegation another request holds — but the spend is not yet final, so
   * a failure BEFORE authority is usable can hand it back.
   */
  RESERVED: "reserved",
  CONSUMED: "consumed",
  REVOKED: "revoked",
  EXPIRED: "expired",
});

/** A mission's delegation lives as long as the mission, bounded. */
export const DEFAULT_DELEGATION_TTL_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Typed authority — there is no grammar, and that is the point
// ---------------------------------------------------------------------------

/**
 * V2 DELETED THE PROSE PARSER. AUTHORITY IS DATA, NEVER LANGUAGE.
 *
 * V1 read the mission's words and minted authority from imperatives it
 * recognised. It could not tell an imperative that DELEGATES from one that is
 * quoted, described, or warned against. Measured against the real V1 parser:
 *
 *     "merge to staging after required checks pass"              -> DELEGATED
 *     "The mission should say: merge it to staging when checks"   -> DELEGATED
 *     "Example of what NOT to write: merge to staging"            -> DELEGATED
 *
 * The last grants exactly the authority it warns against. The S15 authorization
 * brief itself, which only LISTED the phrases a certification mission should
 * contain, produced two live delegations for the lane it was sent to.
 *
 * No amount of extra refusal markers fixes this: each new marker is another
 * phrase somebody will legitimately write, and the parser is racing English.
 *
 * So there is no parser. Prose is never an authorization source. Authority
 * arrives ONLY as a typed field on the Director-facing mission path, so "did
 * the Director delegate this" is answered by reading a structured value rather
 * than interpreting a sentence. Use and mention cannot collide, because mention
 * is not an input.
 */

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
/**
 * WHO MAY WRITE AUTHORITY.
 *
 * Only the Director-facing mission path. A lane cannot add authority to its own
 * mission; an agent's summary, a quoted prompt, a README, a test fixture or a
 * tool result cannot either — none of them travel this author list, and prose is
 * not read at all. Every record carries its author so a delegation can always
 * answer who created it.
 */
export const DELEGATION_AUTHORS = Object.freeze(["director", "operator"]);

export function isAuthorizedDelegationAuthor(author) {
  return DELEGATION_AUTHORS.includes(String(author || "").trim().toLowerCase());
}

/**
 * Validate ONE typed delegated action.
 *
 * Everything is checked against a closed list; nothing is inferred and nothing
 * defaults into more authority than was asked for. An unreadable entry is a
 * refusal with a name, never a silently dropped or silently widened one.
 */
export function validateDelegatedAction(entry = {}) {
  const actionKey = String(entry.action_key || entry.actionKey || "").trim();
  if (!actionKey) return { ok: false, error: "missing_action_key" };
  if (!DELEGABLE_ACTIONS.includes(actionKey)) {
    return { ok: false, error: "action_not_delegable", action_key: actionKey };
  }
  const rawTarget = entry.target_branch ?? entry.targetBranch ?? null;
  const target = rawTarget == null ? null : normalizeBranch(rawTarget);
  if (actionKey !== ACTION_TYPES.REPOSITORY_PUSH) {
    if (!target) return { ok: false, error: "missing_target_branch", action_key: actionKey };
    if (isOperatorOnlyBranch(target)) {
      return { ok: false, error: "operator_only_target", action_key: actionKey, target_branch: target };
    }
    if (!DELEGABLE_TARGET_BRANCHES.includes(target)) {
      return { ok: false, error: "target_not_delegable_in_v1", action_key: actionKey, target_branch: target };
    }
  }
  // OPTIONAL, EXACT, AND ONLY IF THE DIRECTOR TYPED IT.
  //
  // Absence means "no mission-level branch-name restriction" — NOT unrestricted
  // push authority: repository, protected-ref refusal, the exact head SHA and
  // the trusted-host grant all still bind the concrete push. Presence means an
  // exact branch name and nothing else. No globbing: the platform has no
  // bounded branch-pattern contract, and inventing loose matching here would be
  // a new inference in the place we just removed one.
  const rawSource = entry.source_branch ?? entry.sourceBranch ?? null;
  const sourceBranch = rawSource == null ? null : normalizeBranch(rawSource);
  if (rawSource != null && !sourceBranch) {
    return { ok: false, error: "invalid_source_branch", action_key: actionKey };
  }
  if (sourceBranch && /[*?\[\]]/.test(sourceBranch)) {
    return { ok: false, error: "source_branch_pattern_not_supported", source_branch: sourceBranch };
  }
  const mergeMethod = String(entry.merge_method ?? entry.mergeMethod ?? "merge").trim();
  if (actionKey === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST && mergeMethod !== "merge") {
    return { ok: false, error: "merge_method_not_delegable_in_v1", merge_method: mergeMethod };
  }
  // A merge always requires green checks in V1, whatever the field says. The
  // Director may not delegate away the check gate.
  const checksRequired = actionKey === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST
    ? true
    : Boolean(entry.checks_required ?? entry.checksRequired ?? false);
  return {
    ok: true,
    action: {
      action_key: actionKey,
      target_branch: target,
      source_branch: sourceBranch,
      merge_method: mergeMethod,
      checks_required: checksRequired,
    },
  };
}

/**
 * Capture the Director's TYPED delegation for a mission.
 *
 * `delegatedActions` is structured data supplied by the Director-facing path.
 * There is no prose argument: the mission's words are stored with the mission
 * for the human to read, and are never an input to this function.
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
  delegatedActions = [],
  author = null,
  sourceBranch = null,
  ttlMs = DEFAULT_DELEGATION_TTL_MS,
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  const scopeKey = missionId || laneId;
  if (!scopeKey) return { ok: false, error: "missing_mission_or_lane" };
  if (!repository) return { ok: false, error: "missing_repository" };
  // AUTHORSHIP IS CHECKED BEFORE ANYTHING IS READ. A lane, an agent or a tool
  // result cannot mint authority even with a perfectly formed typed field.
  if (!isAuthorizedDelegationAuthor(author)) {
    return { ok: false, error: "unauthorized_delegation_author", author: author || null, created: 0 };
  }
  const entries = Array.isArray(delegatedActions) ? delegatedActions : [];
  if (!entries.length) return { ok: true, created: 0, delegations: [], refusals: [] };

  const accepted = [];
  const refusals = [];
  for (const entry of entries) {
    const v = validateDelegatedAction(entry);
    if (!v.ok) { refusals.push(v); continue; }
    // One delegation per action key; a repeated entry is not extra authority.
    if (accepted.some((a) => a.action_key === v.action.action_key)) continue;
    accepted.push(v.action);
  }
  if (!accepted.length) return { ok: true, created: 0, delegations: [], refusals };

  const store = readDelegationStore(root);
  const created = [];
  for (const a of accepted) {
    const rec = {
      schema_version: MISSION_DELEGATION_SCHEMA,
      delegation_id: `mdlg_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      mission_id: missionId || null,
      lane_id: laneId || null,
      run_id: runId || null,
      scope_key: scopeKey,
      repository,
      action_key: a.action_key,
      target_branch: a.target_branch,
      // Only ever what the Director typed. There is no fallback and no
      // inference; `sourceBranch` on the call is retained solely so an explicit
      // caller-supplied value can still reach the record.
      source_branch: a.source_branch || sourceBranch || null,
      merge_method: a.merge_method,
      checks_required: a.checks_required,
      status: DELEGATION_STATUS.UNCONSUMED,
      // Provenance, so an auto-authorised action can always say who granted it
      // and through which path — replacing V1's quoted prose clause.
      authored_by: String(author).trim().toLowerCase(),
      authority_source: "structured_mission_delegation",
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
  return { ok: true, created: created.length, delegations: created, refusals };
}

export function listMissionDelegations({ scopeKey = null, root = runtimeRoot() } = {}) {
  const all = readDelegationStore(root).delegations;
  return scopeKey ? all.filter((d) => d.scope_key === scopeKey) : all;
}

export function delegationById(delegationId, root = runtimeRoot()) {
  return readDelegationStore(root).delegations.find((d) => d.delegation_id === delegationId) || null;
}

/** Live means unconsumed, unrevoked and unexpired. Anything else is inert. */
/**
 * Available to be matched by a NEW request. A reserved delegation is held by
 * another request and is deliberately not live to anyone else.
 */
export function delegationIsLive(rec, nowMs = Date.now()) {
  if (!rec) return false;
  if (rec.status !== DELEGATION_STATUS.UNCONSUMED) return false;
  if (rec.revoked_at) return false;
  return Date.parse(rec.expires_at || 0) > nowMs;
}

/**
 * RESERVE: bind this delegation to one request while its executable authority
 * is minted and proven resolvable. Atomic single-use — a delegation already
 * reserved or consumed cannot be reserved again, so two concurrent workers
 * cannot both proceed on it.
 */
export function reserveMissionDelegation(delegationId, { requestId, nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const store = readDelegationStore(root);
  const rec = store.delegations.find((d) => d.delegation_id === delegationId);
  if (!rec) return { ok: false, error: "delegation_not_found" };
  if (rec.status === DELEGATION_STATUS.RESERVED) {
    return rec.reserved_by_request_id === requestId
      ? { ok: true, already: true, delegation: rec }
      : { ok: false, error: "delegation_reserved_by_another_request", held_by: rec.reserved_by_request_id };
  }
  if (!delegationIsLive(rec, nowMs)) return { ok: false, error: "delegation_not_live", status: rec.status };
  rec.status = DELEGATION_STATUS.RESERVED;
  rec.reserved_by_request_id = requestId || null;
  rec.reserved_at = iso(nowMs);
  writeStore(store, root);
  return { ok: true, delegation: rec };
}

/**
 * RELEASE: hand a reservation back because authority never became usable.
 *
 * S15 measured the case this exists for: the delegation was spent the instant
 * policy selected it, then the exact-request authorization could not be
 * resolved at the execution boundary, the run escalated, and nothing was
 * pushed — but the authority was gone. A failure BEFORE privileged execution
 * begins must not permanently spend a delegation.
 *
 * Only the holder may release, so a late or foreign release cannot free
 * authority another request is using.
 */
export function releaseMissionDelegation(delegationId, { requestId, reason = null, nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const store = readDelegationStore(root);
  const rec = store.delegations.find((d) => d.delegation_id === delegationId);
  if (!rec) return { ok: false, error: "delegation_not_found" };
  if (rec.status !== DELEGATION_STATUS.RESERVED) {
    return { ok: false, error: "delegation_not_reserved", status: rec.status };
  }
  if (requestId && rec.reserved_by_request_id && rec.reserved_by_request_id !== requestId) {
    return { ok: false, error: "delegation_reserved_by_another_request", held_by: rec.reserved_by_request_id };
  }
  rec.status = DELEGATION_STATUS.UNCONSUMED;
  rec.reserved_by_request_id = null;
  rec.reserved_at = null;
  rec.released_at = iso(nowMs);
  rec.released_reason = reason || null;
  writeStore(store, root);
  return { ok: true, delegation: rec };
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
  // Consumption is the END of the reservation this request already holds. It is
  // reached only once the executable authority has been minted AND proven
  // resolvable, so authority is spent when it is actually about to be used.
  if (rec.status === DELEGATION_STATUS.RESERVED) {
    if (requestId && rec.reserved_by_request_id && rec.reserved_by_request_id !== requestId) {
      return { ok: false, error: "delegation_reserved_by_another_request", held_by: rec.reserved_by_request_id };
    }
  } else if (!delegationIsLive(rec, nowMs)) {
    return { ok: false, error: "delegation_not_live", status: rec.status };
  }
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
 * CAPTURE AT ORIENTATION, FROM TYPED DIRECTOR AUTHORITY.
 *
 * V1 read `instruction` here and parsed it. This takes `delegatedActions` — a
 * structured value the Director-facing send path supplies — and never looks at
 * the prompt text at all. The prose still travels with the mission for a human
 * to read; it is simply not an authorization input.
 *
 * Best-effort and non-fatal: no typed delegation, no repository, or an
 * unauthorized author records nothing, and the ordinary operator-approval
 * behaviour is untouched. It can only ever ADD an authority the Director typed.
 */
export function captureDelegationFromInstruction({
  laneId,
  runId = null,
  missionId = null,
  delegatedActions = [],
  author = null,
  repository = null,
  sourceBranch = null,
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  try {
    if (!laneId || !repository) return { ok: false, error: "insufficient_context", created: 0 };
    if (!Array.isArray(delegatedActions) || !delegatedActions.length) {
      return { ok: true, created: 0, delegations: [], reason: "no_structured_delegation" };
    }
    return recordMissionDelegation({
      missionId, laneId, runId, repository,
      delegatedActions, author, sourceBranch, nowMs, root,
    });
  } catch (e) {
    return { ok: false, error: String(e?.message || e), created: 0 };
  }
}
