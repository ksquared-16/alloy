/**
 * WHAT A LANE IS FOR, WRITTEN DOWN — the missing scheduling input.
 *
 * Phase 5 built the planner and then could not use it. Live, 9 durable lanes
 * resolved to 2 executing and 7 UNKNOWN, and 6 productive seats sat
 * deliberately idle, because three facts a dispatch decision needs are recorded
 * by nothing: what a lane is authorized to do next, whether that step's
 * dependencies are ready, and what the step actually is.
 *
 * The durable lane record proves it. Its fields are lane_id, name, description,
 * status, origin, aliases, mission_id, work_class, binding, repository_id — an
 * identity and a placement, with no objective, no scope, no authorization and no
 * next action anywhere in it. On this host `mission_id` is null for all nine.
 *
 * WHAT THIS IS NOT. Not a transcript archive. Not a summary blob. Nothing here
 * is generated prose to be reread; every section is structured and every
 * authorization carries a provenance naming the durable evidence it came from.
 * An LLM deciding an action "sounds authorized" is precisely the failure mode
 * this exists to prevent.
 *
 * REFERENCED, NEVER DUPLICATED. Run state belongs to execution-run, provider and
 * capacity truth to provider-seat-state, findings to operational-findings,
 * promotion lineage to the governed-action store. This record holds POINTERS to
 * those and copies none of them, because a convenience copy is a second source
 * of truth that goes stale silently — which is the same class of defect as the
 * merge gate measured once and never again.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const LANE_MEMORY_SCHEMA = "vacilando.lane_memory.v1";

/** Authorization verdicts. UNKNOWN is a real answer and it fails closed. */
export const AUTHORIZATION_STATES = Object.freeze([
  "AUTHORIZED", "REQUIRES_DIRECTOR", "PROHIBITED", "UNKNOWN",
]);

/** Dependency verdicts for a next step. */
export const DEPENDENCY_STATES = Object.freeze(["READY", "WAITING", "FAILED", "UNKNOWN"]);

/**
 * Where an authorization may come from.
 *
 * A closed list on purpose. Authorization must be traceable to durable
 * evidence, so a provenance that is not one of these is not a provenance — it
 * is an opinion, and `deriveAuthorization` refuses it.
 */
export const AUTHORIZATION_PROVENANCE = Object.freeze([
  "director_instruction",      // an approved run instruction, quoted
  "lane_scope",                // the scope established when the lane was created
  "policy",                    // director-operating-authorization / governed policy
  "governed_action_policy",    // routine policy-covered promotion autonomy
  "ratified_plan",             // a previously approved implementation plan
  "checkpoint_boundary",       // a mission boundary recorded at checkpoint
  "continuation_rule",         // an existing canonical continuation rule
]);

/**
 * How long a next-step assertion may be trusted before it must be revalidated.
 *
 * Not a guess about how fast the world changes — a bound on how long a claim
 * may stand unchecked. Staleness never authorizes; it downgrades to UNKNOWN,
 * and `authorized-next-step` revalidates against live truth regardless.
 */
export const CHECKPOINT_FRESHNESS_MS = 6 * 60 * 60_000;

export function laneMemoryStorePath(root) {
  return join(root, "vacilando", "lane-memory", "lanes.json");
}

function readStore(root) {
  try {
    const j = JSON.parse(readFileSync(laneMemoryStorePath(root), "utf8"));
    return { schema_version: LANE_MEMORY_SCHEMA, lanes: j.lanes || {} };
  } catch { return { schema_version: LANE_MEMORY_SCHEMA, lanes: {} }; }
}

/** Read that says whether it FAILED, so an unreadable store never reads as empty. */
export function readLaneMemoryGuarded(root) {
  const p = laneMemoryStorePath(root);
  if (!existsSync(p)) return { ok: true, store: { schema_version: LANE_MEMORY_SCHEMA, lanes: {} }, existed: false };
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    return { ok: true, store: { schema_version: LANE_MEMORY_SCHEMA, lanes: j.lanes || {} }, existed: true };
  } catch (e) {
    return { ok: false, error: "lane_memory_unreadable", detail: String(e?.message || e) };
  }
}

function writeStore(root, store) {
  const p = laneMemoryStorePath(root);
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  renameSync(tmp, p);
}

/**
 * One durable lane memory.
 *
 * Every section is optional and every omission is NOT MEASURED rather than a
 * default. A record with no mission is a lane whose objective nobody wrote
 * down, and it must read that way rather than as a lane with no objective.
 */
export function laneMemoryRecord({
  laneId,
  label = null,
  repositoryId = null,
  branch = null,
  worktreePath = null,
  domain = null,
  mission = null,
  authorization = null,
  progress = null,
  dependencies = [],
  nextStep = null,
  blockers = [],
  documentation = [],
  nowMs = Date.now(),
} = {}) {
  return {
    schema_version: LANE_MEMORY_SCHEMA,
    lane_id: laneId,
    // Identity is a POINTER SET. development-lane owns the lane record; this
    // carries only what a reader needs to find it and what this store adds.
    identity: { label, repository_id: repositoryId, branch, worktree_path: worktreePath, domain },
    mission: mission && {
      objective: mission.objective ?? null,
      scope: mission.scope ?? null,
      success_condition: mission.success_condition ?? null,
      exclusions: mission.exclusions ?? [],
      phase: mission.phase ?? null,
      complete: mission.complete ?? null,
    },
    authorization: authorization && {
      authorized_classes: authorization.authorized_classes ?? [],
      prohibited_classes: authorization.prohibited_classes ?? [],
      continuation_allowed: authorization.continuation_allowed ?? null,
      promotion_policy_covered: authorization.promotion_policy_covered ?? null,
      deployment_requires_director: authorization.deployment_requires_director ?? null,
      destructive_requires_explicit: authorization.destructive_requires_explicit ?? null,
      provenance: authorization.provenance ?? [],
    },
    progress: progress && {
      completed: progress.completed ?? [],
      current_state: progress.current_state ?? null,
      decisions: progress.decisions ?? [],
      // References, not copies: finding ids and shas, never finding bodies.
      finding_refs: progress.finding_refs ?? [],
      evidence_refs: progress.evidence_refs ?? [],
      promoted_lineage: progress.promoted_lineage ?? [],
    },
    dependencies: dependencies.map((d) => ({
      id: d.id ?? null,
      description: d.description ?? null,
      state: DEPENDENCY_STATES.includes(d.state) ? d.state : "UNKNOWN",
      evidence: d.evidence ?? null,
      owner: d.owner ?? null,
    })),
    next_step: nextStep && {
      action_class: nextStep.action_class ?? null,
      description: nextStep.description ?? null,
      why: nextStep.why ?? null,
      deterministic: nextStep.deterministic ?? null,
      authorization: AUTHORIZATION_STATES.includes(nextStep.authorization) ? nextStep.authorization : "UNKNOWN",
      authorization_provenance: nextStep.authorization_provenance ?? [],
      evidence: nextStep.evidence ?? null,
    },
    blockers: blockers.map((b) => ({
      description: b.description ?? null,
      wait_reason: b.wait_reason ?? null,
      finding_ref: b.finding_ref ?? null,
      accepted_debt: b.accepted_debt ?? false,
    })),
    documentation: documentation.map(String),
    updated_at: new Date(nowMs).toISOString(),
  };
}

export function getLaneMemory(laneId, root) {
  const read = readLaneMemoryGuarded(root);
  if (!read.ok) return null;
  return read.store.lanes[String(laneId)] || null;
}

export function listLaneMemory(root) {
  const read = readLaneMemoryGuarded(root);
  if (!read.ok) return [];
  return Object.values(read.store.lanes);
}

/**
 * Write or update one lane's memory.
 *
 * Idempotent by lane: a checkpoint updates the record rather than appending a
 * new file, so a lane accumulates one current understanding instead of hundreds
 * of tiny files nobody reads.
 */
export function saveLaneMemory(record, { root } = {}) {
  if (!root) return { ok: false, error: "missing_runtime_root" };
  if (!record?.lane_id) return { ok: false, error: "missing_lane_id" };
  const read = readLaneMemoryGuarded(root);
  // Refuse to overwrite a store we could not read: the same rule the lane and
  // run stores learned the hard way.
  if (!read.ok) return { ok: false, error: read.error, detail: read.detail };
  const store = read.store;
  store.lanes[String(record.lane_id)] = record;
  try { writeStore(root, store); } catch (e) { return { ok: false, error: "lane_memory_unwritable", detail: String(e?.message || e) }; }
  return { ok: true, record };
}

/**
 * Is this memory fresh enough to be quoted without revalidation?
 *
 * Returns the age and the verdict; it never returns "fresh" for a record whose
 * timestamp cannot be read. The consumer revalidates regardless — this only
 * decides whether a stale record may be reported as a basis at all.
 */
export function checkpointFreshness(record, { now = Date.now(), maxAgeMs = CHECKPOINT_FRESHNESS_MS } = {}) {
  const at = record?.updated_at ? Date.parse(record.updated_at) : null;
  if (at == null || Number.isNaN(at)) return { fresh: false, age_ms: null, reason: "checkpoint has no readable timestamp" };
  const age = now - at;
  return { fresh: age <= maxAgeMs, age_ms: age, reason: age <= maxAgeMs ? null : `checkpoint is ${Math.round(age / 60000)} minutes old` };
}

/**
 * The bounded projection a new provider enters a lane with (§12).
 *
 * Bounded on purpose: a projection that dumps the whole store is the transcript
 * problem again with extra steps. Lists are clipped and say so.
 */
export function laneContextProjection(record, { limit = 8 } = {}) {
  if (!record) return null;
  const clip = (a) => {
    const arr = Array.isArray(a) ? a : [];
    return { items: arr.slice(0, limit), total: arr.length, truncated: arr.length > limit };
  };
  return {
    schema_version: LANE_MEMORY_SCHEMA,
    lane_id: record.lane_id,
    label: record.identity?.label ?? null,
    objective: record.mission?.objective ?? null,
    phase: record.mission?.phase ?? null,
    mission_complete: record.mission?.complete ?? null,
    success_condition: record.mission?.success_condition ?? null,
    exclusions: clip(record.mission?.exclusions),
    completed: clip(record.progress?.completed),
    decisions: clip(record.progress?.decisions),
    constraints: clip(record.authorization?.prohibited_classes),
    blockers: clip(record.blockers),
    dependencies: clip(record.dependencies),
    next_step: record.next_step ?? null,
    authorization_provenance: record.authorization?.provenance ?? [],
    documentation: clip(record.documentation),
    promoted_lineage: clip(record.progress?.promoted_lineage),
    finding_refs: clip(record.progress?.finding_refs),
    updated_at: record.updated_at,
  };
}

/**
 * A test helper must not be able to wipe a real store.
 *
 * The same guard the lane, run and findings stores carry, for the same reason:
 * a name ending in ForTests is not a guard, and this programme has already lost
 * a live store to exactly that assumption.
 */
export function resetLaneMemoryForTests(root) {
  if (!root) throw new Error("resetLaneMemoryForTests requires an explicit root");
  if (/(^|\/)gateway\/?$/.test(String(root))) {
    throw new Error(`refusing to reset lane memory at ${root}: that is the live gateway root`);
  }
  writeStore(root, { schema_version: LANE_MEMORY_SCHEMA, lanes: {} });
  return { ok: true };
}
