/**
 * Vacilando — Director orchestration (mission pipeline).
 *
 * The DETERMINISTIC conductor. It owns workflow, routing, gates, and mission
 * lifecycle — it never reasons, retrieves, or generates itself. It routes an
 * operator intent through the runtimes:
 *
 *   intent → Capability Runtime (retrieve) → Knowledge Runtime (retrieve, scoped)
 *          → Mission Compiler (assemble package) → [operator approval gate]
 *          → Worker Runtime (execute) → Acceptance Runtime (evaluate)
 *          → [operator final QA gate]
 *
 * Each step delegates to a specialist runtime; Director only sequences and gates.
 */
import { retrieveCapability, getCapability, updateCapability } from "./capability.mjs";
import { retrieveForCapability } from "./knowledge.mjs";
import { compile } from "./mission-compiler.mjs";
import { createMission, getMission, updateMission } from "./commands/missions.mjs";
import { getPackage, packageForMission } from "./commands/mission-packages.mjs";
import { checkStartPreconditions, runMissionTurn, stopMission, isLive } from "./mission-executor.mjs";
import { evaluateMission, readAcceptance } from "./acceptance.mjs";

/**
 * Stage 1–4: intent → Capability → Knowledge → Compiler → Draft Package.
 * Returns { ok, mission, package, capability, snapshot } or an escalation
 * { ok:false, reason:"no_capability", known } so Director can ask to register one.
 */
export function compileMissionForIntent({ slot, intent, sprint }) {
  // Stage 1 — Capability Retrieval (never rediscover).
  const cap = retrieveCapability(intent);
  if (!cap.ok) return { ok: false, stage: "capability", reason: "no_capability", intent, known: cap.known };
  const capability = cap.capability;

  // Stage 2 — Knowledge Retrieval (scoped by the capability object).
  const snapshot = retrieveForCapability(capability);

  // Create the durable mission identity (draft) BEFORE compiling — the package binds to it.
  const mission = createMission({
    slot, worktree: sprint?.worktree, branch: sprint?.branch || null, provider: sprint?.provider || "claude",
    title: `${capability.name} V2`, objective: `(compiling from ${capability.capability_id})`,
    status: "draft",
  });

  // Stage 4 — Mission Compilation (deterministic assembly).
  const { package: pkg } = compile({ capability, snapshot, mission });

  // Bind the package to the mission; mission becomes ready iff the package is ready.
  updateMission(mission.mission_id, {
    title: pkg.title, objective: pkg.objective, capability_id: capability.capability_id,
    package_id: pkg.package_id, package_version: pkg.version,
    status: pkg.readiness_status === "ready" ? "ready" : "draft",
  });

  return { ok: true, mission: getMission(mission.mission_id), package: pkg, capability, snapshot };
}

/** Operator approval gate → Worker Runtime start. Enforces start preconditions. */
export function startMission({ mission_id, sprint }) {
  const mission = getMission(mission_id);
  if (!mission) return { ok: false, error: "unknown_mission" };
  const pkg = mission.package_id ? getPackage(mission.package_id) : packageForMission(mission_id);
  const pre = checkStartPreconditions(pkg);
  if (!pre.ok) return { ok: false, error: "not_ready", blockers: pre.blockers };
  if (isLive(mission_id)) return { ok: false, error: "already_running" };
  const provider = sprint?.provider || mission.provider || "claude";
  const worktree = sprint?.worktree || mission.worktree;
  // Fire-and-forget: the Worker Runtime owns the turn; the browser never waits.
  runMissionTurn(mission, pkg, { provider, worktree }).catch((e) => {
    updateMission(mission_id, { status: "failed", error_code: "exception", error_message: String(e?.message || e) });
  });
  return { ok: true, mission_id, status: "starting" };
}

/** Steering / answer → a continuation turn resuming the SAME provider session. */
export function steerMission({ mission_id, instruction, sprint }) {
  const mission = getMission(mission_id);
  if (!mission) return { ok: false, error: "unknown_mission" };
  if (isLive(mission_id)) return { ok: false, error: "mid_turn", detail: "The mission is executing a turn. Stop it or wait until it waits for you." };
  const pkg = mission.package_id ? getPackage(mission.package_id) : packageForMission(mission_id);
  if (!pkg) return { ok: false, error: "no_package" };
  const resume = mission.provider_session_id || null;
  const provider = sprint?.provider || mission.provider || "claude";
  const worktree = sprint?.worktree || mission.worktree;
  // Clear the prior wait state; a new turn is starting.
  updateMission(mission_id, { pending_question: null });
  runMissionTurn({ ...mission, pending_question: null }, pkg, { provider, worktree, resume, instruction }).catch((e) => {
    updateMission(mission_id, { status: "failed", error_code: "exception", error_message: String(e?.message || e) });
  });
  return { ok: true, mission_id, status: "starting", resumed: Boolean(resume) };
}

export function stop({ mission_id }) { return stopMission(mission_id); }

/** Acceptance evaluation gate (does not accept — surfaces the verdict). */
export function evaluate({ mission_id }) {
  const mission = getMission(mission_id);
  if (!mission) return { ok: false, error: "unknown_mission" };
  const pkg = mission.package_id ? getPackage(mission.package_id) : packageForMission(mission_id);
  if (!pkg) return { ok: false, error: "no_package" };
  const result = evaluateMission(mission, pkg);
  updateMission(mission_id, { acceptance_gate: result.gate, acceptance_at: result.evaluated_at });
  return { ok: true, result };
}

/**
 * Operator final acceptance. Runs (or refreshes) the gate; refuses on hard fail.
 * On accept: mission → completed + capability write-back (the learning loop:
 * Director orchestrates, Capability Runtime records — no new runtime).
 */
export function accept({ mission_id }) {
  const mission = getMission(mission_id);
  if (!mission) return { ok: false, error: "unknown_mission" };
  const pkg = mission.package_id ? getPackage(mission.package_id) : packageForMission(mission_id);
  if (!pkg) return { ok: false, error: "no_package" };
  const result = evaluateMission(mission, pkg);
  if (result.gate === "fail") return { ok: false, error: "gate_failed", result };
  updateMission(mission_id, { status: "completed", completed_at: new Date().toISOString(), acceptance_gate: result.gate, pending_approval: null });
  // Learning write-back: move the mission into capability history.
  try {
    if (mission.capability_id) {
      const cap = getCapability(mission.capability_id);
      if (cap) updateCapability(cap.capability_id, {
        mission_history: [...(cap.mission_history || []), { mission_id, title: mission.title, outcome: "completed", at: new Date().toISOString() }],
        active_missions: (cap.active_missions || []).filter((m) => m.mission_id !== mission_id),
      });
    }
  } catch { /* write-back best-effort; acceptance already recorded */ }
  return { ok: true, result, status: "completed" };
}

export { readAcceptance };
