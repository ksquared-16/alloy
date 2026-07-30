/**
 * Vacilando — Objective / Conductor state.
 *
 * The layer ABOVE missions. An operator states an objective ("implement Access &
 * Roles V2"); Director conducts it as an ordered sequence of PHASES, each realized
 * by one mission. The first phase is always "audit & plan" (produces the plan the
 * rest follows); the implementation phases come from the capability's roadmap.
 *
 * Two modes:
 *   - gated (default): on each Accept, Director PROPOSES the next phase; the
 *     operator reviews + approves it before it runs.
 *   - autonomous: after the operator hands off, Director runs each phase itself —
 *     auto-accepting only when every criterion is evidence-met, pausing (and
 *     notifying) the moment a criterion needs judgment or a blocker appears.
 *
 * Durable JSON per capability, rooted at ALLOY_RUNTIME_ROOT — one objective per
 * capability in V1 (the capability's current goal). Positional: phases advance in
 * order as missions are accepted, so exactly one mission runs at a time.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "objectives");
const iso = (ms) => new Date(ms ?? Date.now()).toISOString();
const file = (capId) => join(DIR, `${capId}.json`);

function read(capId) {
  try { return JSON.parse(readFileSync(file(capId), "utf8")); } catch { return null; }
}
function write(obj) {
  try { mkdirSync(DIR, { recursive: true }); writeFileSync(file(obj.capability_id), JSON.stringify(obj, null, 2)); } catch { /* best-effort */ }
  return obj;
}

/** All durable objectives (for the conductor tick — not only those with recent missions). */
export function listObjectives() {
  try {
    return readdirSync(DIR).filter((n) => n.endsWith(".json")).map((n) => {
      try { return JSON.parse(readFileSync(join(DIR, n), "utf8")); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

/** The phase spine for a capability: audit&plan, then one phase per roadmap item. */
function phasesFor(capability) {
  const phases = [{ id: "plan", title: "Audit & plan", kind: "plan", status: "pending", mission_id: null }];
  for (const rm of (capability?.roadmap || [])) {
    phases.push({ id: rm.id, title: rm.item, kind: "implement", status: "pending", mission_id: null });
  }
  return phases;
}

/** Get the objective for a capability, creating it (from the roadmap) if absent. */
export function ensureObjective(capability, { intent } = {}) {
  const capId = capability?.capability_id;
  if (!capId) return null;
  const existing = read(capId);
  if (existing) return existing;
  return write({
    schema_version: "vacilando.objective.v1",
    capability_id: capId,
    title: `${capability.name} V2`,
    intent: intent || null,
    mode: "gated",
    worker_slot: null,       // the objective's OWN workspace — all phases run here (set on first accept)
    phases: phasesFor(capability),
    current: 0,              // index of the phase in flight / next to run
    proposed_next: null,     // { phase, intent } surfaced to the operator (gated)
    created_at: iso(), updated_at: iso(),
  });
}

export function getObjective(capId) { return read(capId); }

/**
 * Brief-origin objective (Execution System V2 Phase 1).
 * Keyed by mission_id so legacy capability-roadmap objectives stay untouched.
 * Phases/AC are copied from the immutable Mission Brief — titles may not change
 * without a new brief version.
 */
export function createBriefObjective({ missionId, brief, status = "awaiting_kickoff_approval" } = {}) {
  if (!missionId || !brief) return null;
  const phases = (brief.plan || [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((p) => ({
      id: p.phaseId,
      title: p.title,
      kind: "implement",
      status: "pending",
      mission_id: null,
      order: p.order,
      objective: p.objective || "",
      acceptance_criteria_ids: p.acceptanceCriteriaIds || [],
      required_outputs: p.requiredOutputs || [],
      approval_gate: p.approvalGate || "none",
      // Operational fields only (not plan mutation):
      worker_slot: null,
      branch_proposal: null,
    }));
  const existing = read(missionId);
  const rec = {
    schema_version: "vacilando.objective.v2",
    origin: "mission_brief",
    capability_id: missionId, // file key; not a product capability
    mission_id: missionId,
    mission_brief_id: brief.missionId || missionId,
    mission_brief_version: brief.version,
    mission_content_hash: brief.contentHash,
    title: brief.title,
    intent: brief.objective,
    mode: "gated",
    worker_slot: null,
    phases,
    acceptance_criteria: (brief.acceptanceCriteria || []).map((c) => ({ ...c })),
    constraints: (brief.constraints || []).map((c) => ({ ...c })),
    current: 0,
    proposed_next: phases[0]
      ? { phase: phases[0], intent: phases[0].objective || brief.objective }
      : null,
    status: status === "executing" ? "executing" : "awaiting_kickoff_approval",
    created_at: existing?.created_at || iso(),
    updated_at: iso(),
  };
  return write(rec);
}

export function getObjectiveByMission(missionId) {
  if (!missionId) return null;
  const o = read(missionId);
  if (o && (o.origin === "mission_brief" || o.mission_id === missionId)) return o;
  return null;
}

export function markObjectiveAwaitingKickoff(missionId) {
  const o = read(missionId); if (!o) return null;
  o.status = "awaiting_kickoff_approval";
  o.updated_at = iso();
  return write(o);
}

export function markObjectiveExecuting(missionId) {
  const o = read(missionId); if (!o) return null;
  o.status = "executing";
  o.updated_at = iso();
  return write(o);
}

/**
 * Record operational fields on a brief-origin phase (slot / branch proposal).
 * Does NOT change phase title/objective — those require a new brief version.
 */
export function setPhaseOperational(missionId, phaseId, { worker_slot, branch_proposal } = {}) {
  const o = read(missionId); if (!o) return null;
  const phase = (o.phases || []).find((p) => p.id === phaseId);
  if (!phase) return null;
  if (worker_slot !== undefined) phase.worker_slot = worker_slot;
  if (branch_proposal !== undefined) phase.branch_proposal = branch_proposal;
  o.updated_at = iso();
  return write(o);
}

/** Flip the conductor between operator-gated and autonomous. */
export function setMode(capId, mode) {
  const o = read(capId); if (!o) return null;
  o.mode = mode === "autonomous" ? "autonomous" : "gated";
  o.updated_at = iso();
  return write(o);
}

/** The next phase to run (the first still-pending phase), or null if complete. */
export function nextPhase(capId) {
  const o = read(capId); if (!o) return null;
  return o.phases.find((p) => p.status === "pending") || null;
}

/** The intent string Director compiles a mission from, for a given phase. */
export function intentForPhase(capability, phase) {
  if (!phase) return null;
  if (phase.kind === "plan") return `Build ${capability.name} V2`; // audit + plan
  return `${capability.name} V2 — implement: ${phase.title}`;
}

/**
 * Advance the objective when a mission is accepted: mark the current phase done
 * (bind the mission), move the cursor forward, and return { objective, next,
 * complete }. Positional — the accepted mission settles the first not-yet-done
 * phase. If the objective doesn't exist yet (e.g. the capability had no roadmap),
 * returns { complete:true } so the caller simply stops.
 */
export function advanceOnAccept(capability, { mission_id, worker_slot } = {}) {
  const capId = capability?.capability_id;
  let o = read(capId) || ensureObjective(capability);
  if (!o) return { objective: null, next: null, complete: true };
  // The objective adopts the slot its first mission ran in — every phase runs in
  // that one workspace, never grabbing a fresh slot per phase.
  if (worker_slot != null && (o.worker_slot == null || o.worker_slot === undefined)) o.worker_slot = worker_slot;
  const cur = o.phases.find((p) => p.status !== "done");
  if (cur) { cur.status = "done"; cur.mission_id = mission_id || cur.mission_id; cur.accepted_at = iso(); }
  o.current = o.phases.findIndex((p) => p.status !== "done");
  const next = o.current >= 0 ? o.phases[o.current] : null;
  o.proposed_next = next ? { phase: next, intent: intentForPhase(capability, next) } : null;
  o.updated_at = iso();
  write(o);
  return { objective: o, next, complete: !next };
}

/**
 * Adopt the phase plan the accepted audit/plan mission produced. The plan is the
 * script: its structured `implementation_phases` become the objective's real
 * implementation phases (appended after "plan"). Idempotent by title.
 */
export function adoptPhases(capability, phaseTitles) {
  const capId = capability?.capability_id;
  const o = read(capId); if (!o) return null;
  const titles = (phaseTitles || [])
    .map((t) => (typeof t === "string" ? t : (t && (t.title || t.name || t.phase))))
    .map((t) => String(t || "").trim()).filter(Boolean);
  if (!titles.length) return o;
  const have = new Set(o.phases.filter((p) => p.kind === "implement").map((p) => p.title));
  const added = titles.filter((t) => !have.has(t)).map((t, i) => ({ id: `p_impl_${o.phases.length + i}`, title: t, kind: "implement", status: "pending", mission_id: null }));
  if (!added.length) return o;
  o.phases = [...o.phases, ...added];
  o.current = o.phases.findIndex((p) => p.status !== "done");
  const next = o.current >= 0 ? o.phases[o.current] : null;
  o.proposed_next = next ? { phase: next, intent: intentForPhase(capability, next) } : o.proposed_next;
  o.updated_at = iso();
  return write(o);
}

/** Clear the proposed-next once the operator has acted on it (prepared/started). */
export function clearProposedNext(capId) {
  const o = read(capId); if (!o) return null;
  o.proposed_next = null; o.updated_at = iso();
  return write(o);
}

/**
 * Record why the conductor is paused (e.g. provider auth) so the UI can say
 * "Waiting — reconnect claude" instead of a stale mission stage. Pass null to clear.
 * Shape: { kind: "provider_auth", provider, detail?, reconnect_cmd?, at }
 */
export function setWaitingOn(capId, waiting) {
  const o = read(capId); if (!o) return null;
  if (!waiting) {
    if (!o.waiting_on) return o;
    o.waiting_on = null;
  } else {
    o.waiting_on = { ...waiting, at: waiting.at || iso() };
  }
  o.updated_at = iso();
  return write(o);
}

/**
 * Live projection for the UI: what the objective is doing RIGHT NOW, independent
 * of whichever (possibly stale) mission conversation the operator still has open.
 * Callers pass a mission lookup so this module stays free of mission imports.
 *
 * @param {object} o objective
 * @param {(id:string)=>object|null} getMission
 * @param {()=>object[]} listMissions
 */
export function projectObjectiveLive(o, getMission, listMissions) {
  if (!o) return null;
  const done = (o.phases || []).filter((p) => p.status === "done").length;
  const total = (o.phases || []).length;
  const phase = (o.phases || []).find((p) => p.status !== "done") || null;
  if (!phase) {
    return { complete: true, operator_needed: false, status: "complete", label: "Objective complete",
      progress: `${done}/${total}`, phase: null, mission_id: null, mission_status: null, last_activity_at: null };
  }
  if (o.waiting_on?.kind === "provider_auth") {
    return {
      complete: false, operator_needed: true, status: "waiting_auth",
      label: `Waiting — reconnect ${o.waiting_on.provider || "provider"} to continue`,
      progress: `${done}/${total}`, phase, mission_id: null, mission_status: null,
      last_activity_at: o.waiting_on.at || null, waiting_on: o.waiting_on,
    };
  }
  const ACTIVE = new Set(["starting", "running", "provisioning", "waiting_for_acceptance", "waiting_for_operator", "stopping"]);
  const related = (typeof listMissions === "function" ? listMissions() : [])
    .filter((m) => m.objective_capability_id === o.capability_id || m.capability_id === o.capability_id)
    .filter((m) => m.phase_id === phase.id || (phase.mission_id && m.mission_id === phase.mission_id));
  let mission = related.find((m) => ACTIVE.has(m.status))
    || related.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))[0]
    || (phase.mission_id && typeof getMission === "function" ? getMission(phase.mission_id) : null)
    || null;
  // Fallback: any active mission tagged to this objective (phase_id may be missing on older records)
  if (!mission && typeof listMissions === "function") {
    mission = listMissions().find((m) => m.objective_capability_id === o.capability_id && ACTIVE.has(m.status)) || null;
  }
  const ms = mission?.status || null;
  let status = "pending", label = `Next: ${phase.title}`, operator_needed = o.mode !== "autonomous";
  if (["starting", "provisioning"].includes(ms)) { status = "launching"; label = `Launching — ${phase.title}`; operator_needed = false; }
  else if (ms === "running" || ms === "stopping") { status = "conducting"; label = `Working — ${phase.title}`; operator_needed = false; }
  else if (ms === "waiting_for_operator") { status = "needs_you"; label = `Needs you — ${phase.title}`; operator_needed = true; }
  else if (ms === "waiting_for_acceptance") {
    const gate = mission?.acceptance_gate;
    // Judgment / fail gates always pull the operator in — even in autonomous mode.
    // (Auto-accept only fires on gate=pass; the strip must not say "Nothing needed".)
    if (gate === "needs_operator") {
      status = "needs_you";
      label = `Needs your judgment — ${phase.title}`;
      operator_needed = true;
    } else if (gate === "fail") {
      status = "at_risk";
      label = `Evidence failed — ${phase.title}`;
      operator_needed = true;
    } else {
      status = "reviewing";
      label = o.mode === "autonomous" ? `Checking evidence — ${phase.title}` : `Ready for your review — ${phase.title}`;
      operator_needed = o.mode !== "autonomous";
    }
  }
  else if (ms === "failed" || ms === "interrupted") { status = "at_risk"; label = `Paused — ${phase.title}`; operator_needed = true; }
  else if (o.mode === "autonomous") { status = "queuing"; label = `Director will start — ${phase.title}`; operator_needed = false; }

  return {
    complete: false, operator_needed, status, label,
    progress: `${done}/${total}`, phase, mission_id: mission?.mission_id || null,
    mission_status: ms, last_activity_at: mission?.last_activity_at || mission?.updated_at || null,
    current_phase: mission?.current_phase || null, latest_summary: mission?.latest_summary || null,
    waiting_on: o.waiting_on || null,
  };
}
