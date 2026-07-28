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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
    phases: phasesFor(capability),
    current: 0,              // index of the phase in flight / next to run
    proposed_next: null,     // { phase, intent } surfaced to the operator (gated)
    created_at: iso(), updated_at: iso(),
  });
}

export function getObjective(capId) { return read(capId); }

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
export function advanceOnAccept(capability, { mission_id } = {}) {
  const capId = capability?.capability_id;
  let o = read(capId) || ensureObjective(capability);
  if (!o) return { objective: null, next: null, complete: true };
  const cur = o.phases.find((p) => p.status !== "done");
  if (cur) { cur.status = "done"; cur.mission_id = mission_id || cur.mission_id; cur.accepted_at = iso(); }
  o.current = o.phases.findIndex((p) => p.status !== "done");
  const next = o.current >= 0 ? o.phases[o.current] : null;
  o.proposed_next = next ? { phase: next, intent: intentForPhase(capability, next) } : null;
  o.updated_at = iso();
  write(o);
  return { objective: o, next, complete: !next };
}

/** Clear the proposed-next once the operator has acted on it (prepared/started). */
export function clearProposedNext(capId) {
  const o = read(capId); if (!o) return null;
  o.proposed_next = null; o.updated_at = iso();
  return write(o);
}
