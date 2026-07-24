/**
 * Vacilando — Director orchestration (mission pipeline).
 *
 * The DETERMINISTIC conductor. It owns workflow, routing, gates, and mission
 * lifecycle — it never reasons, retrieves, or generates itself.
 *
 * Trustworthiness contract (V1 hardening):
 *   - SINGLE SOURCE OF TRUTH: every action resolves the slot's authoritative
 *     identity and refuses to act on a conflicted identity (fail closed).
 *   - GOVERNED: every consequential action follows the SAME lifecycle as the
 *     command registry — preview → confirm → queued → running → terminal → audit.
 *   - DURABLE: a mission turn is a first-class Director request (active_request_id),
 *     so it appears in the same request timeline as every other worker instruction.
 */
import { retrieveCapability, getCapability, updateCapability, registerCapability } from "./capability.mjs";
import { getProductDefinitionForCapability, recordMissionInHistory, ensureProductDefinitionForCapability, addDecisionForCapability } from "./product-definition.mjs";
import { retrieveForCapability } from "./knowledge.mjs";
import { analyzeGap, parseIntent } from "./gap-analysis.mjs";
import { deriveVerdict } from "./director-review.mjs";
import { compile } from "./mission-compiler.mjs";
import { createMission, getMission, updateMission } from "./commands/missions.mjs";
import { getPackage, packageForMission, updatePackage } from "./commands/mission-packages.mjs";
import { checkStartPreconditions, runMissionTurn, stopMission, isLive } from "./mission-executor.mjs";
import { evaluateMission, readAcceptance } from "./acceptance.mjs";
import { writeAuditEvent } from "./commands/audit.mjs";
import { createRequest, updateRequest } from "./commands/director-requests.mjs";
import { resolveSlotIdentity } from "./identity.mjs";

/** Consequential mission actions require explicit confirmation, like every other. */
const CONSEQUENTIAL = new Set(["start", "steer", "stop", "accept", "close"]);

const audit = (action, target, outcome, extra = {}) =>
  writeAuditEvent({
    actor: extra.actor || "operator", command: `mission.${action}`,
    input: extra.input || null, target,
    preview_summary: extra.summary || null, confirmed: extra.confirmed === true,
    outcome, error: extra.error || null,
  }, Date.now());

const targetOf = (mission, identity) => ({
  kind: "mission", id: mission?.mission_id || null,
  label: mission?.title || "(mission)",
  slot: mission?.worker_slot ?? identity?.slot ?? null,
  worktree: identity?.worktree_name || mission?.worktree || null,
});

/** Resolve identity + fail closed on conflict. */
function identityFor(slot) {
  const id = resolveSlotIdentity(slot);
  if (!id.ok) return { ok: false, error: "identity_conflict", conflict: id.conflict, identity: id };
  return { ok: true, identity: id };
}

/**
 * The full upstream preparation pipeline:
 *   intent → Capability → Knowledge Snapshot → GAP ANALYSIS → Compiler →
 *   Mission Package → Readiness VERDICT.
 * Preparation is durable but not destructive; it is audited, not gated. The
 * operator approves the resulting package (see startMission) — they never author
 * it. Director stays the deterministic conductor: the only reasoning is the Gap
 * Analysis stage, which reasons deterministically in V1.
 */
export function compileMissionForIntent({ slot, intent }) {
  const idr = identityFor(slot);
  if (!idr.ok) {
    audit("compile", { kind: "slot", label: `slot ${slot}` }, "blocked", { error: idr.conflict?.detail });
    return { ok: false, stage: "identity", reason: "identity_conflict", conflict: idr.conflict };
  }
  const identity = idr.identity;

  const cap = retrieveCapability(intent);
  if (!cap.ok) {
    audit("compile", { kind: "slot", label: `slot ${slot}` }, "blocked", { error: `no capability for "${intent}"` });
    return { ok: false, stage: "capability", reason: "no_capability", intent, known: cap.known };
  }
  const capability = cap.capability;
  const snapshot = retrieveForCapability(capability);

  // Stage: Gap Analysis (the reasoning stage) — compares intent vs the prepared context.
  const gapReport = analyzeGap({ intent, capability, snapshot });

  const mission = createMission({
    slot, worktree: identity.worktree_name, branch: identity.branch, provider: identity.provider || "claude",
    title: `${capability.name} V2`, objective: `(compiling from ${capability.capability_id})`, status: "draft",
  });

  const { package: pkgRaw } = compile({ capability, snapshot, mission, gapReport });

  // Stage: Readiness Verdict — Director rolls the gap report + package validation
  // into the six-state operator verdict, then binds it to the package.
  const verdict = deriveVerdict(gapReport, pkgRaw);
  const pkg = updatePackage(pkgRaw.package_id, { readiness_verdict: verdict }) || pkgRaw;

  updateMission(mission.mission_id, {
    title: pkg.title, objective: pkg.objective, capability_id: capability.capability_id,
    intent, // the operator's own words — recompilation reuses them
    package_id: pkg.package_id, package_version: pkg.version,
    gap_report_id: gapReport.gap_report_id, readiness_verdict: verdict.verdict,
    status: verdict.verdict === "Ready" && pkg.readiness_status === "ready" ? "ready" : "draft",
  });

  const m = getMission(mission.mission_id);
  audit("compile", targetOf(m, identity), "succeeded", { summary: `compiled ${pkg.package_id} → ${verdict.verdict}`, input: { intent } });
  return { ok: true, mission: m, package: pkg, capability, snapshot, gap_report: gapReport, verdict, identity };
}

/**
 * Recompile an existing mission after the operator resolved a blocker (e.g. added
 * a product decision). Re-runs Knowledge → Gap Analysis → Compiler, revising the
 * prior package into a NEW version with a diff, and re-deriving the verdict. This
 * is what makes a send-back loop close: resolve upstream → recompile → watch
 * readiness climb.
 */
export function recompileMission({ mission_id }) {
  const mission = getMission(mission_id);
  if (!mission) return { ok: false, error: "unknown_mission" };
  if (isLive(mission_id)) return { ok: false, error: "mid_turn" };
  const capability = mission.capability_id ? getCapability(mission.capability_id) : null;
  if (!capability) return { ok: false, error: "no_capability" };
  const intent = mission.intent || mission.title || capability.name;
  const prevPkg = mission.package_id ? getPackage(mission.package_id) : packageForMission(mission_id);
  if (!prevPkg) return { ok: false, error: "no_package" };

  const snapshot = retrieveForCapability(capability);
  const gapReport = analyzeGap({ intent, capability, snapshot });
  const { package: pkgRaw } = compile({ capability, snapshot, mission, gapReport, reviseOf: prevPkg.package_id });

  const verdict = deriveVerdict(gapReport, pkgRaw);
  const prevVerdict = prevPkg.readiness_verdict?.verdict || "?";
  const diff = { ...(pkgRaw.diff_from_previous || {}), verdict_change: prevVerdict !== verdict.verdict ? `${prevVerdict} → ${verdict.verdict}` : null };
  const pkg = updatePackage(pkgRaw.package_id, { readiness_verdict: verdict, diff_from_previous: diff }) || pkgRaw;

  updateMission(mission_id, {
    package_id: pkg.package_id, package_version: pkg.version, gap_report_id: gapReport.gap_report_id,
    readiness_verdict: verdict.verdict,
    status: verdict.verdict === "Ready" && pkg.readiness_status === "ready" ? "ready" : "draft",
  });
  const identity = resolveSlotIdentity(mission.worker_slot);
  const m = getMission(mission_id);
  audit("recompile", targetOf(m, identity), "succeeded", { summary: `recompiled → v${pkg.version} (${verdict.verdict})` });
  return { ok: true, mission: m, package: pkg, capability, snapshot, gap_report: gapReport, verdict, diff };
}

/** Turn an intent into a capability display name (strip leading verb + version). */
export function capabilityNameFromIntent(intent) {
  const p = parseIntent(intent);
  let name = p.raw.replace(new RegExp(`^\\s*${p.verb}\\b`, "i"), "");
  if (p.version_hint) name = name.replace(new RegExp(`\\b${p.version_hint}\\b`, "i"), "");
  name = name.replace(/\s+/g, " ").trim();
  return name.split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ") || p.raw;
}

/**
 * Director doesn't know this capability yet — define it. Registers a real
 * capability from the operator's intent and gives it an (empty) Product
 * Definition so it can immediately be prepared. The operator then adds decisions
 * via send-back. No silent discovery — the operator explicitly defines it.
 */
export function defineCapability({ intent, name }) {
  const capName = (name && name.trim()) || capabilityNameFromIntent(intent);
  const reg = registerCapability({ name: capName, description: `Defined from operator intent: "${intent}".`, maturity: "new" });
  if (!reg.ok) return { ok: false, error: reg.error };
  ensureProductDefinitionForCapability(reg.capability.capability_id, { name: capName });
  audit("define-capability", { kind: "capability", id: reg.capability.capability_id, label: capName }, "succeeded", { summary: `defined "${capName}"`, input: { intent } });
  return { ok: true, capability: getCapability(reg.capability.capability_id), created: reg.created };
}

/** Add a product decision (the "Needs Product Decisions" send-back resolution). */
export function addProductDecision({ capability_id, statement, rationale, actor = "operator" }) {
  const cap = getCapability(capability_id);
  if (!cap) return { ok: false, error: "unknown_capability" };
  if (!statement || !String(statement).trim()) return { ok: false, error: "empty_statement" };
  const r = addDecisionForCapability(capability_id, { statement, rationale, decided_by: actor, provenance: "operator" }, { name: cap.name });
  audit("product-decision", { kind: "capability", id: capability_id, label: cap.name }, "succeeded", { summary: statement.slice(0, 60), confirmed: true });
  return { ok: true, product_definition_id: r.product_definition_id, decision: r.decision, added: r.added };
}

/** Build a preview for a consequential mission action (pure; never executes). */
export function previewAction(action, mission_id) {
  const mission = getMission(mission_id);
  if (!mission) return { ok: false, error: "unknown_mission" };
  const idr = identityFor(mission.worker_slot);
  const identity = idr.identity;
  const pkg = mission.package_id ? getPackage(mission.package_id) : packageForMission(mission_id);
  const base = { ok: true, action, mission_id, requires_confirmation: CONSEQUENTIAL.has(action), identity, target: targetOf(mission, identity) };

  if (!idr.ok) return { ...base, ok: false, error: "identity_conflict", conflict: identity.conflict, effects: [] };

  if (action === "start") {
    const pre = checkStartPreconditions(pkg);
    return { ...base, ok: pre.ok, blockers: pre.blockers,
      summary: `Start "${mission.title}" — runs a ${identity.provider || "claude"} turn in ${identity.worktree_name}`,
      effects: [
        `Spawns a provider process in ${identity.worktree_path}`,
        `The worker may create/modify files in that worktree`,
        `Governance: no push, no merge, no promote, no scope broadening`,
      ] };
  }
  if (action === "stop") return { ...base, summary: `Stop "${mission.title}"`, effects: ["Terminates the provider process", "Preserves all mission state and outputs"] };
  if (action === "steer") return { ...base, summary: `Send a steering instruction to "${mission.title}"`, effects: [`Resumes provider session ${mission.provider_session_id || "(none — a fresh turn)"}`, `Runs another turn in ${identity.worktree_name}`] };
  if (action === "accept") return { ...base, summary: `Accept "${mission.title}"`, effects: ["Runs the acceptance gate", "Marks the mission completed (operator sign-off)", "Writes the mission into capability history"] };
  if (action === "close") return { ...base, summary: `Close "${mission.title}"`, effects: ["Winds the work down (accepted → closed)", "Frees the capacity it held", "Preserves all artifacts and evidence"] };
  return { ...base, ok: false, error: "unknown_action" };
}

/** Operator approval gate → Worker Runtime start. */
export function startMission({ mission_id, confirm }) {
  const mission = getMission(mission_id);
  if (!mission) return { ok: false, error: "unknown_mission" };
  const idr = identityFor(mission.worker_slot);
  if (!idr.ok) {
    audit("start", targetOf(mission, idr.identity), "blocked", { error: idr.conflict?.detail });
    return { ok: false, error: "identity_conflict", conflict: idr.conflict };
  }
  const identity = idr.identity;
  const pkg = mission.package_id ? getPackage(mission.package_id) : packageForMission(mission_id);
  const pre = checkStartPreconditions(pkg);
  if (!pre.ok) {
    audit("start", targetOf(mission, identity), "blocked", { error: "package not ready", confirmed: confirm === true });
    return { ok: false, error: "not_ready", blockers: pre.blockers };
  }
  if (isLive(mission_id)) return { ok: false, error: "already_running" };
  if (confirm !== true) {
    audit("start", targetOf(mission, identity), "refused", { error: "confirmation_required" });
    return { ok: false, error: "confirmation_required", preview: previewAction("start", mission_id) };
  }

  // Durable request: a mission turn is a first-class Director request.
  const req = createRequest({
    slot: mission.worker_slot, worktree: identity.worktree_name, provider: identity.provider || mission.provider,
    instruction: `[mission] ${mission.title}`, request_type: "worker-instruction", mission_id,
  });
  updateMission(mission_id, { active_request_id: req.request_id, status: "starting" });
  updateRequest(req.request_id, { status: "starting", started_at: new Date().toISOString() });

  setImmediate(() => {
    runMissionTurn(mission, pkg, { provider: identity.provider || mission.provider || "claude", identity })
      .then(() => {
        const after = getMission(mission_id);
        updateRequest(req.request_id, { status: after?.status === "failed" ? "failed" : "worker-responded", completed_at: new Date().toISOString() });
      })
      .catch((e) => {
        updateMission(mission_id, { status: "failed", error_code: "exception", error_message: String(e?.message || e) });
        updateRequest(req.request_id, { status: "failed", error_code: "exception", error_message: String(e?.message || e), failed_at: new Date().toISOString() });
      });
  });

  audit("start", targetOf(mission, identity), "succeeded", { confirmed: true, summary: `started in ${identity.worktree_name}`, input: { mission_id } });
  return { ok: true, mission_id, status: "starting", request_id: req.request_id, worktree: identity.worktree_name };
}

/** Steering / answer → a continuation turn resuming the SAME provider session. */
export function steerMission({ mission_id, instruction, confirm }) {
  const mission = getMission(mission_id);
  if (!mission) return { ok: false, error: "unknown_mission" };
  const idr = identityFor(mission.worker_slot);
  if (!idr.ok) { audit("steer", targetOf(mission, idr.identity), "blocked", { error: idr.conflict?.detail }); return { ok: false, error: "identity_conflict", conflict: idr.conflict }; }
  const identity = idr.identity;
  if (isLive(mission_id)) return { ok: false, error: "mid_turn", detail: "The mission is executing a turn. Stop it or wait until it waits for you." };
  const pkg = mission.package_id ? getPackage(mission.package_id) : packageForMission(mission_id);
  if (!pkg) return { ok: false, error: "no_package" };
  if (confirm !== true) {
    audit("steer", targetOf(mission, identity), "refused", { error: "confirmation_required" });
    return { ok: false, error: "confirmation_required", preview: previewAction("steer", mission_id) };
  }

  const resume = mission.provider_session_id || null;
  const req = createRequest({
    slot: mission.worker_slot, worktree: identity.worktree_name, provider: identity.provider || mission.provider,
    instruction, request_type: "worker-instruction", mission_id,
  });
  updateMission(mission_id, { pending_question: null, status: "starting", active_request_id: req.request_id });
  updateRequest(req.request_id, { status: "starting", started_at: new Date().toISOString() });

  setImmediate(() => {
    runMissionTurn({ ...mission, pending_question: null }, pkg, { provider: identity.provider || mission.provider || "claude", identity, resume, instruction })
      .then(() => {
        const after = getMission(mission_id);
        updateRequest(req.request_id, { status: after?.status === "failed" ? "failed" : "worker-responded", completed_at: new Date().toISOString() });
      })
      .catch((e) => {
        updateMission(mission_id, { status: "failed", error_code: "exception", error_message: String(e?.message || e) });
        updateRequest(req.request_id, { status: "failed", error_code: "exception", error_message: String(e?.message || e), failed_at: new Date().toISOString() });
      });
  });

  audit("steer", targetOf(mission, identity), "succeeded", { confirmed: true, summary: resume ? "resumed session" : "fresh turn", input: { mission_id } });
  return { ok: true, mission_id, status: "starting", resumed: Boolean(resume), request_id: req.request_id };
}

export function stop({ mission_id, confirm }) {
  const mission = getMission(mission_id);
  if (!mission) return { ok: false, error: "unknown_mission" };
  const identity = resolveSlotIdentity(mission.worker_slot);
  if (confirm !== true) {
    audit("stop", targetOf(mission, identity), "refused", { error: "confirmation_required" });
    return { ok: false, error: "confirmation_required", preview: previewAction("stop", mission_id) };
  }
  const r = stopMission(mission_id);
  if (mission.active_request_id) updateRequest(mission.active_request_id, { status: "cancelled", failed_at: new Date().toISOString() });
  audit("stop", targetOf(mission, identity), r.ok ? "succeeded" : "failed", { confirmed: true, summary: r.was_live ? "terminated a live turn" : "no live turn; state preserved" });
  return r;
}

/** Acceptance evaluation (read-only gate; surfaces the verdict, accepts nothing). */
export function evaluate({ mission_id }) {
  const mission = getMission(mission_id);
  if (!mission) return { ok: false, error: "unknown_mission" };
  const identity = resolveSlotIdentity(mission.worker_slot);
  const pkg = mission.package_id ? getPackage(mission.package_id) : packageForMission(mission_id);
  if (!pkg) return { ok: false, error: "no_package" };
  const result = evaluateMission(mission, pkg, { worktreePath: identity.worktree_path });
  updateMission(mission_id, { acceptance_gate: result.gate, acceptance_at: result.evaluated_at });
  audit("evaluate", targetOf(mission, identity), "succeeded", { summary: `gate=${result.gate}` });
  return { ok: true, result };
}

/** Operator final acceptance (consequential → confirmed + audited). */
export function accept({ mission_id, confirm }) {
  const mission = getMission(mission_id);
  if (!mission) return { ok: false, error: "unknown_mission" };
  const identity = resolveSlotIdentity(mission.worker_slot);
  const pkg = mission.package_id ? getPackage(mission.package_id) : packageForMission(mission_id);
  if (!pkg) return { ok: false, error: "no_package" };
  if (confirm !== true) {
    audit("accept", targetOf(mission, identity), "refused", { error: "confirmation_required" });
    return { ok: false, error: "confirmation_required", preview: previewAction("accept", mission_id) };
  }
  const result = evaluateMission(mission, pkg, { worktreePath: identity.worktree_path });
  if (result.gate === "fail") {
    audit("accept", targetOf(mission, identity), "blocked", { confirmed: true, error: "gate failed" });
    return { ok: false, error: "gate_failed", result };
  }
  updateMission(mission_id, { status: "completed", completed_at: new Date().toISOString(), acceptance_gate: result.gate, pending_approval: null });
  try {
    if (mission.capability_id) {
      const cap = getCapability(mission.capability_id);
      if (cap) updateCapability(cap.capability_id, {
        mission_history: [...(cap.mission_history || []), { mission_id, title: mission.title, outcome: "completed", at: new Date().toISOString() }],
        active_missions: (cap.active_missions || []).filter((m) => m.mission_id !== mission_id),
      });
      // Learning loop: the Product Definition is the capability's long-term memory.
      const pd = getProductDefinitionForCapability(mission.capability_id);
      if (pd) recordMissionInHistory(pd.product_definition_id, { mission_id, title: mission.title, outcome: "completed" });
    }
  } catch { /* write-back best-effort; acceptance already recorded */ }
  audit("accept", targetOf(mission, identity), "succeeded", { confirmed: true, summary: `accepted (gate=${result.gate})` });
  return { ok: true, result, status: "completed" };
}

/**
 * Close accepted work: the tidy terminal state (Engineering Operations Center,
 * Part III). Accepted → closed winds the work down and returns its capacity;
 * artifacts and evidence are preserved, never deleted. Only accepted work closes.
 */
export function close({ mission_id, confirm }) {
  const mission = getMission(mission_id);
  if (!mission) return { ok: false, error: "unknown_mission" };
  const identity = resolveSlotIdentity(mission.worker_slot);
  if (mission.status !== "completed" && mission.status !== "closed") {
    return { ok: false, error: "not_accepted", detail: "Only accepted work can be closed." };
  }
  if (confirm !== true) {
    audit("close", targetOf(mission, identity), "refused", { error: "confirmation_required" });
    return { ok: false, error: "confirmation_required", preview: previewAction("close", mission_id) };
  }
  updateMission(mission_id, { status: "closed", closed_at: new Date().toISOString(), pending_approval: null });
  audit("close", targetOf(mission, identity), "succeeded", { confirmed: true, summary: "wound down; capacity freed; artifacts preserved" });
  return { ok: true, status: "closed" };
}

export { readAcceptance };
