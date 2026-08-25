/**
 * Governed authority for a lane that has no Mission binding.
 *
 * THE DEAD END THIS REMOVES. A provider on an authorized run reached
 * `repository.merge_pull_request` and `vac governed-action` refused with
 * `missing_mission_binding`. The lane genuinely had no mission — Runtime
 * Performance still does — so there was no proposal to approve, no card to
 * show, and the only route left was the Director merging by hand outside
 * Vacilando. The guard was right to refuse; having nothing on the other side of
 * the refusal was the defect.
 *
 * WHAT SUPPLIES AUTHORITY INSTEAD. The repository. A repository profile either
 * carries governed promotion or it does not, and that fact already lives in the
 * registry. Alloy's profile has it; the generic Git profile does not, and a
 * repository without it stays exactly as fail-closed as before — this widens
 * *where authority may come from*, never *what may be done without it*.
 *
 * WHY A NEW GRANT AND NOT grantMissionAuthorization. That one is mission
 * scoped, reusable within the mission, and keyed only by action type and target
 * — approving one merge would leave standing permission to merge again. A grant
 * here is single-use and pinned to the exact proposal: this PR, this head SHA,
 * this target branch, this merge method, this run. A different SHA is a
 * different decision and needs a new one.
 */
import { createHash, randomUUID } from "node:crypto";
import { getDurableLane, missionIdForLane } from "./development-lane.mjs";
import { getRepository, profileFor } from "./repository-registry.mjs";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const GRANT_SCHEMA = "vacilando.governed_grant.v1";
/** Long enough for a Director to read the card; short enough that a stale approval expires. */
export const GRANT_TTL_MS = 30 * 60 * 1000;

export const AUTHORITY_KINDS = Object.freeze({
  MISSION: "mission",
  REPOSITORY: "repository",
});

function runtimeRoot() {
  return process.env.ALLOY_RUNTIME_ROOT?.trim()
    || join(homedir(), ".local", "state", "alloy-dev");
}

export function grantStorePath(root = runtimeRoot()) {
  return join(root, "vacilando", "governed-grants.json");
}

function iso(ms) { return new Date(ms ?? Date.now()).toISOString(); }

function atomicWrite(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

function emptyStore() { return { schema_version: GRANT_SCHEMA, grants: {} }; }

export function readGrantStore(root = runtimeRoot()) {
  try {
    const raw = JSON.parse(readFileSync(grantStorePath(root), "utf8"));
    if (!raw || typeof raw !== "object") return emptyStore();
    return { schema_version: GRANT_SCHEMA, grants: raw.grants && typeof raw.grants === "object" ? raw.grants : {} };
  } catch {
    return emptyStore();
  }
}

function writeStore(store, root) {
  atomicWrite(grantStorePath(root), store);
  return store;
}

/**
 * Where may this lane's governed authority come from?
 *
 * Mission first, because a bound lane keeps its existing behaviour untouched.
 * Repository second, and only when its profile actually carries governed
 * promotion. Anything else is refused with a reason that names what is missing.
 */
export function resolveGovernedAuthoritySync(laneId, { root = undefined } = {}) {
  const rec = getDurableLane(laneId, root);
  if (!rec) return { ok: false, error: "lane_not_found" };

  const missionId = rec.mission_id || missionIdForLane(laneId, root) || null;
  if (missionId) {
    return { ok: true, kind: AUTHORITY_KINDS.MISSION, mission_id: missionId, lane_id: rec.lane_id };
  }

  const repositoryId = rec.repository_id || null;
  if (!repositoryId) {
    // No mission AND no repository: nothing can vouch for this action.
    //
    // Deliberately still `missing_mission_binding`. That code is the existing
    // public contract for an unbound lane, and it is accurate here — this lane
    // really does lack a mission and has nothing else to offer instead. Only
    // the case this change actually adds gets a new code.
    return {
      ok: false,
      error: "missing_mission_binding",
      detail: "lane has neither a mission binding nor a repository",
    };
  }
  const repo = getRepository(repositoryId, root);
  if (!repo) return { ok: false, error: "repository_not_found", repository_id: repositoryId };
  if (repo.state !== "ACTIVE") return { ok: false, error: "repository_not_active", repository_id: repositoryId };

  const profile = profileFor(repo.profile);
  if (!profile.governed_promotion) {
    // THE FAIL-CLOSED CASE, kept fail-closed. A generic Git repository has no
    // promotion policy, so there is nothing for a Director to authorize against.
    return {
      ok: false,
      error: "repository_profile_forbids_governed_action",
      repository_id: repositoryId,
      profile: profile.id,
      detail: `the ${profile.id} profile does not carry governed promotion`,
    };
  }
  return {
    ok: true,
    kind: AUTHORITY_KINDS.REPOSITORY,
    repository_id: repo.repository_id,
    repository_name: repo.name,
    profile: profile.id,
    canonical_branch: canonicalBranchFor(repo),
    lane_id: rec.lane_id,
  };
}

/** Async wrapper, so callers that already await keep working unchanged. */
export async function resolveGovernedAuthority(laneId, opts = {}) {
  return resolveGovernedAuthoritySync(laneId, opts);
}

/** The branch a promotion targets, with the remote prefix stripped. */
export function canonicalBranchFor(repository) {
  const base = String(repository?.default_branch || "").trim();
  if (!base) return null;
  return base.replace(/^[^/]+\//, "");
}

/**
 * The identity of a decision.
 *
 * Every field a Director actually weighed is in here. Change any of them and
 * this is a different question, so the fingerprint changes and a prior approval
 * no longer applies.
 */
export function proposalFingerprint(proposal = {}) {
  const parts = [
    proposal.action_key,
    proposal.repository_id,
    proposal.pull_request_number,
    proposal.expected_head_sha,
    proposal.target_branch,
    proposal.merge_method,
    proposal.run_id,
  ].map((v) => String(v ?? ""));
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
}

/**
 * Mint a single-use grant for one approved proposal.
 *
 * Deliberately not a permission: it authorizes one execution of one action with
 * one set of parameters, and it is consumed on use.
 */
export function mintGrant({
  proposal,
  approvedBy,
  nowMs = Date.now(),
  ttlMs = GRANT_TTL_MS,
  root = undefined,
} = {}) {
  if (!proposal?.action_key) return { ok: false, error: "missing_action_key" };
  if (!approvedBy) return { ok: false, error: "missing_approver" };
  if (proposal.requested_by && proposal.requested_by === approvedBy) {
    // The provider that asked cannot be the identity that approves.
    return { ok: false, error: "self_approval_refused", requested_by: proposal.requested_by };
  }
  const store = readGrantStore(root);
  const fingerprint = proposalFingerprint(proposal);
  const grant = {
    schema_version: GRANT_SCHEMA,
    grant_id: `grnt_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    proposal_id: proposal.proposal_id || null,
    fingerprint,
    action_key: proposal.action_key,
    repository_id: proposal.repository_id || null,
    pull_request_number: proposal.pull_request_number ?? null,
    expected_head_sha: proposal.expected_head_sha || null,
    target_branch: proposal.target_branch || null,
    merge_method: proposal.merge_method || null,
    run_id: proposal.run_id || null,
    lane_id: proposal.lane_id || null,
    approved_by: approvedBy,
    approved_at: iso(nowMs),
    expires_at: iso(nowMs + ttlMs),
    status: "ACTIVE",
    consumed_at: null,
    consumed_by: null,
  };
  store.grants[grant.grant_id] = grant;
  writeStore(store, root);
  return { ok: true, grant: publicGrant(grant) };
}

export function publicGrant(g) {
  if (!g) return null;
  const { ...rest } = g;
  return { ...rest };
}

export function getGrant(grantId, root = undefined) {
  return readGrantStore(root).grants[String(grantId || "")] || null;
}

/** Is this grant usable for THIS proposal, right now? */
export function grantIsValidFor(grant, proposal, { nowMs = Date.now() } = {}) {
  if (!grant) return { ok: false, error: "grant_not_found" };
  if (grant.status === "CONSUMED") return { ok: false, error: "grant_already_used", consumed_at: grant.consumed_at };
  if (grant.status === "REVOKED") return { ok: false, error: "grant_revoked" };
  if (Date.parse(grant.expires_at) <= nowMs) return { ok: false, error: "grant_expired", expires_at: grant.expires_at };
  const want = proposalFingerprint(proposal);
  if (grant.fingerprint !== want) {
    // Something the Director weighed has changed — most often the head SHA
    // because the branch moved after approval.
    return {
      ok: false,
      error: "grant_stale",
      detail: "the proposal changed after approval; a fresh decision is required",
      approved_fingerprint: grant.fingerprint,
      current_fingerprint: want,
    };
  }
  return { ok: true };
}

/**
 * Consume the grant. Returns `already` when it was already spent, so a double
 * click reads as "done", never as a second execution.
 */
export function consumeGrant(grantId, { by = "gateway", nowMs = Date.now(), root = undefined } = {}) {
  const store = readGrantStore(root);
  const grant = store.grants[String(grantId || "")];
  if (!grant) return { ok: false, error: "grant_not_found" };
  if (grant.status === "CONSUMED") {
    return { ok: true, already: true, grant: publicGrant(grant) };
  }
  grant.status = "CONSUMED";
  grant.consumed_at = iso(nowMs);
  grant.consumed_by = by;
  writeStore(store, root);
  return { ok: true, already: false, grant: publicGrant(grant) };
}

export function revokeGrant(grantId, { reason = null, nowMs = Date.now(), root = undefined } = {}) {
  const store = readGrantStore(root);
  const grant = store.grants[String(grantId || "")];
  if (!grant) return { ok: false, error: "grant_not_found" };
  if (grant.status === "CONSUMED") return { ok: false, error: "grant_already_used" };
  grant.status = "REVOKED";
  grant.revoked_at = iso(nowMs);
  grant.revoked_reason = reason ? String(reason).slice(0, 300) : null;
  writeStore(store, root);
  return { ok: true, grant: publicGrant(grant) };
}

export function activeGrantForRun(runId, root = undefined) {
  return Object.values(readGrantStore(root).grants)
    .find((g) => g.run_id === String(runId || "") && g.status === "ACTIVE") || null;
}

/** Bounded metadata for logs and audit. Never a token, never a command. */
export function grantAuditFields(g) {
  if (!g) return null;
  return {
    grant_id: g.grant_id,
    action_key: g.action_key,
    repository_id: g.repository_id,
    pull_request_number: g.pull_request_number,
    expected_head_sha: g.expected_head_sha,
    target_branch: g.target_branch,
    run_id: g.run_id,
    approved_by: g.approved_by,
    status: g.status,
  };
}

export function resetGovernedGrantsForTests(root = undefined) {
  writeStore(emptyStore(), root);
}
