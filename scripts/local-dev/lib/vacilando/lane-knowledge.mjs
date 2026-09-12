/**
 * Lane knowledge — durable operational context, and what may be trusted of it.
 *
 * WHAT ALREADY EXISTS, AND IS EXTENDED RATHER THAN REPLACED. `lane-memory.mjs`
 * is the canonical lane-scoped durable store and it is already good: a record
 * whose identity block is explicitly "a POINTER SET" because development-lane
 * owns the lane, mission and authorization blocks, progress with completed work,
 * decisions and REFERENCES rather than copies, dependencies, next step,
 * blockers, bounded promotion checkpoints, and `laneContextProjection` which
 * clips every list because "a projection that dumps the whole store is the
 * transcript problem with extra steps".
 *
 * That store is not duplicated here. No second lane registry, no second
 * documentation system, no parallel evidence store.
 *
 * WHAT WAS MISSING, and is the whole of this module:
 *
 *   1. FACTS HAVE NO KIND. `progress.current_state` is a bare string;
 *      `identity.branch` and `identity.worktree_path` are bare values. Nothing
 *      records when a fact was observed, what observed it, or whether it can go
 *      stale — so every fact reads as eternally true. That is exactly the
 *      failure the brief names: "slot 8 = documentation-api" becoming permanent
 *      authority because a document says so. DevOps 3 measured the live version
 *      of precisely that: a lane record claiming a slot the registry had long
 *      since given to someone else.
 *
 *   2. NO CERTIFICATION SHAPE. Evidence exists only as opaque refs, so "this was
 *      certified" cannot say against WHICH candidate, in WHICH environment, with
 *      which suites, or which failures were pre-existing.
 *
 *   3. NO CONTRADICTION CHECK. Nothing compares what the record says against
 *      what canonical owners currently say, so a stale fact stays invisible
 *      until it misleads somebody.
 *
 *   4. ONLY ONE LANE OF THIRTEEN HAS A RECORD AT ALL.
 *
 * THE CENTRAL RULE. Knowledge is CONTEXT, never live authority. Where a fact is
 * owned by development-lane, lane-bootstrap, lane-freshness, the worktree
 * lifecycle, managed slots, run state, governed actions or git, THOSE owners
 * decide and this records what was last seen. When the two disagree, canonical
 * truth wins and the disagreement is made visible.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { getLaneMemory, listLaneMemory, laneContextProjection } from "./lane-memory.mjs";
import { getDurableLane, listDurableLanes } from "./development-lane.mjs";

export const LANE_KNOWLEDGE_SCHEMA = "vacilando.lane_knowledge.v1";

/**
 * The runtime root, resolved the way every other store resolves it.
 *
 * `lane-memory`'s accessors take `root` with NO default — unlike the lane
 * registry's, which fall back. Passing `undefined` through therefore does not
 * mean "use the default", it means `join(undefined, ...)` and a thrown
 * TypeError. Resolving it here keeps this module's callers free of a difference
 * between two stores that is not theirs to know about.
 */
function runtimeRoot() {
  return process.env.ALLOY_RUNTIME_ROOT?.trim()
    || join(homedir(), ".local", "state", "alloy-dev");
}

/**
 * THE FIVE KINDS, AND WHY THE DISTINCTION IS THE POINT.
 *
 * A knowledge base whose facts are all the same kind is a document that ages
 * into a liability: the reader cannot tell which sentences are still true. These
 * separate what may be relied on indefinitely from what must be looked up again.
 */
export const FACT_KIND = Object.freeze({
  /** A decision and its reasoning. Remains useful even when the state it was taken about has moved. */
  DURABLE_DECISION: "DURABLE_DECISION",
  /** Something true when it was looked at. Can rot. Must be revalidated before it is relied on. */
  CURRENT_OBSERVATION: "CURRENT_OBSERVATION",
  /** Proof, bound to an exact candidate, environment and moment. Never generalises beyond them. */
  EVIDENCE: "EVIDENCE",
  /** Not true yet. Intent, not fact. */
  PLANNED: "PLANNED",
  /** Known remaining work, deferred deliberately rather than forgotten. */
  CARRY_FORWARD: "CARRY_FORWARD",
});

/**
 * How long an observation may be quoted before it has to be looked up again.
 *
 * Not a cache TTL — nothing expires or is deleted. It is the line past which a
 * fact stops being "what is true" and becomes "what was true at 14:32 on
 * Tuesday", which is a different claim and should read as one. Twelve hours
 * matches the freshness boundary DevOps 2 measured for lanes: it spans a working
 * session and an overnight pause, and excludes everything genuinely quiet.
 */
export const OBSERVATION_TTL_MS = Number(process.env.ALLOY_KNOWLEDGE_OBSERVATION_TTL_MS)
  || 12 * 60 * 60_000;

/**
 * A fact that can rot, recorded so that it says so.
 *
 * `source` names the canonical owner that produced it, which is what makes
 * revalidation possible: a reader knows who to ask instead of guessing. A fact
 * with no source is still recorded — honestly, as unsourced — rather than
 * dropped, because losing it silently is worse than carrying it with a caveat.
 */
export function observedFact(value, { source = null, observedAt = null, nowMs = Date.now(), ttlMs = OBSERVATION_TTL_MS } = {}) {
  const at = observedAt || new Date(nowMs).toISOString();
  const ageMs = Math.max(0, nowMs - (Date.parse(at) || nowMs));
  return {
    kind: FACT_KIND.CURRENT_OBSERVATION,
    value: value ?? null,
    observed_at: at,
    source,
    age_ms: ageMs,
    // The whole reason this wrapper exists. A bare value cannot say this.
    requires_revalidation: ageMs > ttlMs || !source,
  };
}

/**
 * A decision worth carrying forward, with the reasoning that produced it.
 *
 * NOT every implementation detail. The brief is explicit and it is right: a log
 * of every choice is a changelog, and a changelog is what nobody reads. What
 * belongs here is a decision a future reader would otherwise re-litigate — and
 * the ALTERNATIVES REJECTED, because the most expensive thing to rediscover is
 * why the obvious approach was not taken.
 *
 * Durable by construction: it records what was decided and why, not what is
 * currently true, so state moving underneath it does not make it wrong.
 */
export function durableDecision({
  decision,
  rationale = null,
  alternatives_rejected = [],
  authority = null,
  candidate = null,
  at = null,
  nowMs = Date.now(),
} = {}) {
  return {
    kind: FACT_KIND.DURABLE_DECISION,
    decision: String(decision || "").trim() || null,
    rationale,
    alternatives_rejected: Array.isArray(alternatives_rejected) ? alternatives_rejected : [],
    authority,
    // The candidate it was taken against, so a reader can date it precisely.
    candidate,
    at: at || new Date(nowMs).toISOString(),
    requires_revalidation: false,
  };
}

/**
 * Certification, bound to exactly what it proves.
 *
 * A bare "certified: true" is worthless three weeks later: certified WHAT, in
 * WHICH environment, running WHICH suites. Each field exists because its absence
 * has cost this programme time.
 *
 * `pre_existing_failures` in particular. Every mission in this sequence has had
 * to prove that a red suite was already red on staging before claiming it was
 * not a regression. Recording them with the evidence means the next reader does
 * not repeat that work — and means a NEW failure is visible against a known
 * baseline instead of disappearing into it.
 */
export function certificationRecord({
  candidate,
  environment = null,
  suites = [],
  passed = null,
  pre_existing_failures = [],
  evidence_refs = [],
  promotion = null,
  soak = null,
  at = null,
  nowMs = Date.now(),
} = {}) {
  return {
    kind: FACT_KIND.EVIDENCE,
    // Evidence with no candidate proves nothing, so this is the one required field.
    candidate: candidate ? String(candidate) : null,
    environment,
    suites: Array.isArray(suites) ? suites : [],
    passed,
    pre_existing_failures: Array.isArray(pre_existing_failures) ? pre_existing_failures : [],
    // References, never pasted output. The brief forbids the giant test dump and
    // it is right: a reproducible pointer beats an unreadable wall.
    evidence_refs: Array.isArray(evidence_refs) ? evidence_refs : [],
    promotion,
    soak,
    at: at || new Date(nowMs).toISOString(),
    // Evidence never needs revalidating: it is a claim about a moment, and it
    // remains true of that moment for ever. What can go stale is whether it is
    // still RELEVANT, which is a question about the candidate, not the evidence.
    requires_revalidation: false,
  };
}

/** Work that is intended but not yet true. */
export function plannedItem({ description, why = null, depends_on = [] } = {}) {
  return { kind: FACT_KIND.PLANNED, description: String(description || "").trim() || null, why, depends_on };
}

/** Known remaining work, deferred on purpose. */
export function carryForward({ description, why_deferred = null, owner = null, evidence_ref = null } = {}) {
  return {
    kind: FACT_KIND.CARRY_FORWARD,
    description: String(description || "").trim() || null,
    why_deferred, owner, evidence_ref,
  };
}

/**
 * WHERE A LANE'S KNOWLEDGE LIVES — deterministic, and never in its worktree.
 *
 * DevOps 3 certified that a durable lane survives worktree reclamation, so
 * anything anchored to the lane's checkout is knowledge with an expiry date.
 * Both halves of the index are therefore worktree-independent.
 *
 * THE SPLIT, AND THE RULE FOR IT. Two locations, each holding a different KIND,
 * with no duplicated copy:
 *
 *   REPOSITORY — durable decisions and certification, which should travel with
 *   the code and the history they describe. They are reviewable, diffable and
 *   survive the machine entirely. Resolved against the canonical repository, not
 *   whichever checkout happens to be open.
 *
 *   STATE ROOT — current observations and machine-generated evidence, which are
 *   written by the runtime, change constantly, and would be noise in a diff.
 *   This is lane-memory, which already exists and already owns them.
 *
 * The lane id is the key on both sides, because it is the one identifier that
 * outlives the branch, the worktree, the slot and the session.
 */
export function knowledgeIndexFor(laneId, { repoRoot = null, stateRoot = null } = {}) {
  const id = String(laneId || "").trim();
  if (!id) return null;
  const repo = repoRoot || process.env.ALLOY_REPO || join(homedir(), "Alloy");
  const state = stateRoot || process.env.ALLOY_RUNTIME_ROOT || join(homedir(), ".local", "state", "alloy-dev", "gateway");
  const docPath = join(repo, "docs", "platform", "planning", "vacilando-os", "lanes", `${id}.md`);
  return {
    lane_id: id,
    // Durable, reviewable, travels with history.
    document: { path: docPath, exists: existsSync(docPath), holds: ["DURABLE_DECISION", "EVIDENCE", "CARRY_FORWARD"] },
    // Machine-written, changes constantly, never diffed.
    runtime: { store: join(state, "vacilando", "lane-memory", "lanes.json"), holds: ["CURRENT_OBSERVATION", "PLANNED"] },
    // Stated so the split cannot quietly become "write it in both places".
    rule: "Durable decisions and certification live in the repository document. Mutable observations live in lane-memory. Never both.",
  };
}

/**
 * The context a lane resumes with: small, relevant, durable — plus fresh truth.
 *
 * BOUNDED BY CONSTRUCTION. It delegates to `laneContextProjection`, which
 * already clips every list and reports what it clipped, rather than adding a
 * second opinion about how much history is too much. The whole objective is
 * "small, relevant, durable context + fresh truth", never the transcript.
 *
 * FRESH TRUTH IS NOT OPTIONAL. `canonical` is whatever the live owners say right
 * now — bootstrap, freshness, slots. It is passed in rather than fetched here so
 * this module cannot become a second route to facts it does not own, and so a
 * caller with nothing fresh gets an honest package rather than a confident one.
 *
 * WORKTREELESS BY DESIGN. Nothing here touches the lane's checkout. An archived
 * lane whose worktree was reclaimed assembles exactly the same package.
 */
export function assembleLaneContext(laneId, {
  root = undefined,
  memory = null,
  canonical = null,
  limit = 8,
  nowMs = Date.now(),
  getMemory = getLaneMemory,
  getLane = getDurableLane,
} = {}) {
  const id = String(laneId || "").trim();
  if (!id) return { ok: false, error: "missing_lane_id" };
  const lane = root === undefined ? getLane(id) : getLane(id, root);
  const rec = memory || getMemory(id, root ?? runtimeRoot());

  if (!lane && !rec) return { ok: false, error: "lane_not_found", lane_id: id };

  const projection = rec ? laneContextProjection(rec, { limit }) : null;
  const knowledge = rec?.knowledge || null;
  const observations = knowledge?.observations || {};
  const stale = Object.entries(observations)
    .filter(([, f]) => f?.requires_revalidation)
    .map(([k]) => k);

  return {
    ok: true,
    schema_version: LANE_KNOWLEDGE_SCHEMA,
    lane_id: id,
    // Identity from the lane registry, which owns it. Absent when the lane is
    // gone but its knowledge survives — which is a real and legitimate state.
    identity: lane ? { name: lane.name || null, status: lane.status || null, repository_id: lane.repository_id || null } : null,
    has_knowledge: Boolean(rec),
    // The bounded durable half.
    projection,
    decisions: (knowledge?.decisions || []).slice(-limit),
    certification: knowledge?.certification || null,
    carry_forward: knowledge?.carry_forward || [],
    planned: (knowledge?.planned || []).slice(0, limit),
    // The mutable half, with every item honest about its own age.
    observations,
    requires_revalidation: stale,
    // The fresh half, supplied by the caller from the canonical owners.
    canonical: canonical || null,
    contradictions: canonical ? detectKnowledgeContradictions({ observations, canonical }).contradictions : [],
    assembled_at: new Date(nowMs).toISOString(),
  };
}

/**
 * Where the record and the world disagree — and the world wins.
 *
 * THE RULE THIS ENFORCES. A document must never become authority by outliving
 * the fact it recorded. When an observation disagrees with the canonical owner,
 * the canonical value is the answer and the disagreement is REPORTED, so it is
 * visible rather than quietly misleading.
 *
 * DECISIONS ARE DELIBERATELY NOT COMPARED. A decision is a claim about what was
 * chosen and why, not about what is currently true; "the state moved" is not
 * evidence that a past decision was wrong, and auto-rewriting decisions when
 * state changes would erase exactly the reasoning that is worth keeping.
 */
export function detectKnowledgeContradictions({ observations = {}, canonical = {} } = {}) {
  const contradictions = [];
  for (const [key, fact] of Object.entries(observations || {})) {
    if (!fact || fact.kind !== FACT_KIND.CURRENT_OBSERVATION) continue;
    if (!(key in (canonical || {}))) continue;
    const live = canonical[key];
    if (live === undefined || live === null) continue;
    if (String(fact.value) === String(live)) continue;
    contradictions.push({
      key,
      recorded: fact.value,
      canonical: live,
      observed_at: fact.observed_at,
      source: fact.source,
      // Stated on every row so no consumer has to remember the rule.
      resolution: "canonical_wins",
    });
  }
  return { contradictions, count: contradictions.length };
}

/**
 * Seed a package for a lane that has none — without inventing a history.
 *
 * Twelve of thirteen live lanes have no memory record at all, so the migration
 * question is real. What it must not do is manufacture plausible-sounding past:
 * a decision nobody took, or a certification nobody ran, is worse than a gap,
 * because a gap is obviously a gap.
 *
 * So this seeds ONLY what can be read from canonical owners right now, records
 * each of those as an OBSERVATION with its source, and marks everything else
 * `UNKNOWN`. A reader can then tell the difference between "this lane made no
 * decisions" and "nobody has written them down yet", which is the distinction
 * that makes an incomplete knowledge base usable rather than misleading.
 */
export function seedLaneKnowledge(lane, { bootstrap = null, freshness = null, nowMs = Date.now() } = {}) {
  if (!lane?.lane_id) return null;
  const obs = {};
  const add = (key, value, source) => {
    if (value === undefined || value === null) return;
    obs[key] = observedFact(value, { source, nowMs });
  };
  add("branch", lane.binding?.branch, "development-lane.binding");
  add("worktree_path", lane.binding?.worktree_path, "development-lane.binding");
  add("slot", lane.binding?.slot, "development-lane.binding");
  add("repository_id", lane.repository_id, "development-lane");
  add("preferred_provider", lane.preferred_provider, "development-lane");
  if (bootstrap?.ok) {
    add("bootstrap_contract", bootstrap.contract_version, "lane-bootstrap");
    add("bootstrap_stale", bootstrap.stale, "lane-bootstrap");
  }
  if (freshness?.ok) {
    add("freshness_state", freshness.state, "lane-freshness");
    add("behind_staging", freshness.behind, "lane-freshness");
  }
  return {
    schema_version: LANE_KNOWLEDGE_SCHEMA,
    seeded_at: new Date(nowMs).toISOString(),
    seeded_from: "canonical_owners",
    observations: obs,
    // UNKNOWN, and saying so. Not [] — an empty list reads as "there were none".
    decisions: "UNKNOWN",
    certification: "UNKNOWN",
    carry_forward: "UNKNOWN",
    planned: "UNKNOWN",
    note: "Seeded from canonical owners at the time shown. History before this point was not recorded and is not inferred.",
  };
}

/** Does a lane's knowledge look present and current enough to rely on? */
export function assessLaneKnowledge(lane, memory, { nowMs = Date.now() } = {}) {
  const id = lane?.lane_id || memory?.lane_id || null;
  if (!memory) {
    return { lane_id: id, name: lane?.name || null, state: "MISSING", reason: "no knowledge record" };
  }
  const k = memory.knowledge || null;
  const obs = k?.observations || {};
  const stale = Object.entries(obs).filter(([, f]) => f?.requires_revalidation).map(([key]) => key);
  const seeded = k?.decisions === "UNKNOWN";
  const hasState = Boolean(memory.progress?.current_state || memory.next_step);
  if (!k) return { lane_id: id, name: lane?.name || null, state: "UNCLASSIFIED", reason: "record predates the knowledge contract" };
  if (seeded) return { lane_id: id, name: lane?.name || null, state: "SEEDED", reason: "seeded from canonical owners; history not recorded", stale };
  if (!hasState) return { lane_id: id, name: lane?.name || null, state: "NO_CURRENT_STATE", reason: "no current state or next step", stale };
  if (stale.length) return { lane_id: id, name: lane?.name || null, state: "STALE_OBSERVATIONS", reason: `${stale.length} observation(s) need revalidation`, stale };
  void nowMs;
  return { lane_id: id, name: lane?.name || null, state: "CURRENT", stale: [] };
}

/** The fleet's knowledge coverage, read-only. */
export function inventoryLaneKnowledge({ root = undefined, lanes = null, memories = null } = {}) {
  const recs = lanes || (root === undefined ? listDurableLanes() : listDurableLanes(root));
  const mem = new Map();
  for (const m of memories || listLaneMemory(root ?? runtimeRoot()) || []) {
    if (m?.lane_id) mem.set(m.lane_id, m);
  }
  const rows = recs.filter((l) => l?.lane_id).map((l) => assessLaneKnowledge(l, mem.get(l.lane_id) || null));
  const byState = {};
  for (const r of rows) byState[r.state] = (byState[r.state] || 0) + 1;
  return {
    lanes: rows.length,
    by_state: byState,
    missing: rows.filter((r) => r.state === "MISSING").length,
    stale: rows.filter((r) => r.state === "STALE_OBSERVATIONS").length,
    rows,
  };
}
