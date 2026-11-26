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
import { createMission, getMission, updateMission, readMissions } from "./commands/missions.mjs";
import { getPackage, packageForMission, updatePackage } from "./commands/mission-packages.mjs";
import { checkStartPreconditions, runMissionTurn, stopMission, isLive, readLatestReport, isImplementMission } from "./mission-executor.mjs";
import { evaluateMission, readAcceptance } from "./acceptance.mjs";
import { writeAuditEvent } from "./commands/audit.mjs";
import { createRequest, updateRequest } from "./commands/director-requests.mjs";
import { resolveSlotIdentity } from "./identity.mjs";
import { understandingQuestions } from "./operations.mjs";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { TOOLKIT_DIR } from "./commands/executor.mjs";
import { freeDiskGb, runGc } from "./disk-hygiene.mjs";
import { precheckProvider, reconnectInfo } from "./provider-runtime.mjs";
import { ensureObjective, getObjective, advanceOnAccept, intentForPhase, clearProposedNext, setMode, adoptPhases, setWaitingOn } from "./objective.mjs";

const PROVISION_HARD_GB = 5; // pre-provision floor: below this, reclaim then fail fast

/**
 * Conductor: prepare the next phase's mission from the objective plan. In
 * autonomous mode it also starts it (the operator has stepped out); in gated mode
 * it just compiles a Ready package for the operator to review + start. Returns the
 * compiled mission or an error — best-effort, never throws into the accept path.
 */
function conductNext(capability, phase, { autonomous } = {}) {
  try {
    const intent = intentForPhase(capability, phase);
    if (!intent) return null;
    // Run the phase in the OBJECTIVE'S OWN workspace (the slot its plan ran in) —
    // one coherent worktree for the whole objective, never grabbing a fresh slot
    // per phase. Prefer the stored slot; else infer it from a completed phase's
    // mission; else fall back to a free slot.
    const obj = getObjective(capability.capability_id);
    let slot = obj?.worker_slot;
    if (slot == null) {
      const done = (obj?.phases || []).find((p) => p.status === "done" && p.mission_id);
      if (done) slot = getMission(done.mission_id)?.worker_slot ?? null;
    }
    slot = slot ?? pickFreeSlotForConductor();
    if (slot == null) return { ok: false, error: "no_slot_available" };
    const out = compileMissionForIntent({ slot, intent });
    if (!out.ok) return { ok: false, error: out.reason || out.error };
    // Tag the mission to its objective + phase so accept advances the right slot.
    updateMission(out.mission.mission_id, { objective_capability_id: capability.capability_id, phase_id: phase.id });
    if (autonomous) {
      const started = startMission({ mission_id: out.mission.mission_id, confirm: true });
      return { ok: true, mission: out.mission, started: started.ok };
    }
    return { ok: true, mission: out.mission, started: false };
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
}

/** First free worker slot (no worktree) for the conductor to provision onto. */
function pickFreeSlotForConductor() {
  for (let s = 1; s <= 6; s++) { const id = resolveSlotIdentity(s); if (!id.ok && id.conflict?.kind === "unregistered_slot") return s; }
  return null; // none free → compile will surface an identity error the caller handles
}

/**
 * The LAUNCHER: provision a fresh managed worktree on a FREE worker slot so a
 * mission can run in isolation — never in the champion, never co-tenanting a
 * human sprint. Runs the sanctioned `alloy-sprint-start` (the exact argv the
 * command registry uses), then force-resolves the newly registered slot identity.
 * Long-running (git worktree + dependency install), so callers run it async and
 * surface a "provisioning" phase. Resolves { ok, identity } or { ok:false, error }.
 */
async function provisionSlotForMission(mission) {
  // Pre-provision disk guard: a fresh worktree + npm install needs headroom. If
  // we're below the floor, reclaim first (safe gc), then fail fast with a clear
  // message rather than dying mid-install with a cryptic ENOSPC.
  let free = freeDiskGb();
  if (typeof free === "number" && free < PROVISION_HARD_GB) {
    await runGc({ minFreeGb: 20 }).catch(() => {});
    free = freeDiskGb();
    if (typeof free === "number" && free < PROVISION_HARD_GB) {
      return { ok: false, error: `Only ${free} GB free after reclaim — not enough to provision a worker. Free disk (or finish/merge worktrees) and retry.` };
    }
  }
  return new Promise((resolveP) => {
    const cap = mission.capability_id ? getCapability(mission.capability_id) : null;
    const base = (cap?.slug || String(mission.capability_id || mission.title || "mission").replace(/^cap_/, ""))
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mission";
    const name = `vac-${base}`;
    const provider = mission.provider || cap?.owner?.provider_default || "claude";
    const bin = join(TOOLKIT_DIR, "alloy-sprint-start");
    const args = [name, "--provider", provider, "--slot", String(mission.worker_slot), "--without-server"];
    execFile(bin, args, { cwd: TOOLKIT_DIR, env: process.env, timeout: 15 * 60 * 1000, maxBuffer: 1 << 24 }, (err, _stdout, stderr) => {
      if (err) return resolveP({ ok: false, error: `provisioning slot ${mission.worker_slot} failed: ${String(stderr || err.message || "").trim().slice(0, 300)}` });
      const id = resolveSlotIdentity(mission.worker_slot, { force: true });
      if (!id.ok) return resolveP({ ok: false, error: id.conflict?.detail || "worktree provisioned but slot identity did not resolve" });
      resolveP({ ok: true, identity: id });
    });
  });
}

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
  // A FREE slot (no worktree yet) is legal here: the launcher provisions its
  // worktree at start. Only a genuine conflict (wrong branch, missing worktree)
  // blocks compilation.
  const freeSlot = !idr.ok && idr.conflict?.kind === "unregistered_slot";
  if (!idr.ok && !freeSlot) {
    audit("compile", { kind: "slot", label: `slot ${slot}` }, "blocked", { error: idr.conflict?.detail });
    return { ok: false, stage: "identity", reason: "identity_conflict", conflict: idr.conflict };
  }
  const identity = idr.ok ? idr.identity : null;

  const cap = retrieveCapability(intent);
  if (!cap.ok) {
    audit("compile", { kind: "slot", label: `slot ${slot}` }, "blocked", { error: `no capability for "${intent}"` });
    return { ok: false, stage: "capability", reason: "no_capability", intent, known: cap.known };
  }
  const capability = cap.capability;
  ensureObjective(capability, { intent }); // the conductor's phase spine (audit&plan → roadmap)
  const snapshot = retrieveForCapability(capability);

  // Stage: Gap Analysis (the reasoning stage) — compares intent vs the prepared context.
  const gapReport = analyzeGap({ intent, capability, snapshot });

  const provider = identity?.provider || capability?.owner?.provider_default || "claude";
  const mission = createMission({
    slot, worktree: identity?.worktree_name || null, branch: identity?.branch || null, provider,
    title: `${capability.name} V2`, objective: `(compiling from ${capability.capability_id})`, status: "draft",
  });

  // The operator's own words are authoritative for compilation — the compiler
  // derives the objective from the intent, not the generic capability template.
  const { package: pkgRaw } = compile({ capability, snapshot, mission: { ...mission, intent }, gapReport });

  // Stage: Readiness Verdict — Director rolls the gap report + package validation
  // into the six-state operator verdict, then binds it to the package.
  const verdict = deriveVerdict(gapReport, pkgRaw);
  const pkg = updatePackage(pkgRaw.package_id, { readiness_verdict: verdict }) || pkgRaw;

  updateMission(mission.mission_id, {
    title: pkg.title, objective: pkg.objective, capability_id: capability.capability_id,
    intent, // the operator's own words — recompilation reuses them
    package_id: pkg.package_id, package_version: pkg.version,
    gap_report_id: gapReport.gap_report_id, readiness_verdict: verdict.verdict,
    needs_provision: !identity, // free slot → the launcher provisions its worktree at start
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

  // Questions the operator has already answered no longer hold the verdict off Ready.
  const verdict = deriveVerdict(gapReport, pkgRaw, { answered: mission.answered_questions || [] });
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

/**
 * Reframe a not-yet-started mission with the operator's direction. The operator's
 * words are authoritative: the direction becomes (or extends) the mission's INTENT,
 * and the package is recompiled so the objective/deliverables/scope/acceptance
 * derive from it — NOT recorded as a side decision while a generic objective stays
 * in charge. This is the fix for the mission-integrity failure.
 */
export function reframeMission({ mission_id, direction }) {
  const mission = getMission(mission_id);
  if (!mission) return { ok: false, error: "unknown_mission" };
  if (isLive(mission_id)) return { ok: false, error: "mid_turn", detail: "This work is executing; stop it before reframing." };
  if (["completed", "closed"].includes(mission.status)) return { ok: false, error: "terminal", detail: "This work is finished; start a new mission to change direction." };
  const add = String(direction || "").trim();
  if (!add) return { ok: false, error: "empty_direction" };
  const cur = String(mission.intent || "").trim();
  // A thin capability-name intent ("Access & Roles", "Improve Scheduling V2") is
  // replaced; a real direction is accumulated.
  const meaningful = cur.replace(/\bv\d+\b/ig, " ").replace(/[^a-z0-9\s]/ig, " ").split(/\s+/).filter((w) => w.length >= 2);
  const isNameOnly = meaningful.length < 5;
  // Accumulate the operator's direction (thin capability-name intents are replaced).
  const intent = (!cur || isNameOnly) ? add : (cur.includes(add) ? cur : `${cur}\n\n${add}`);
  updateMission(mission_id, { intent });
  const out = recompileMission({ mission_id }); // recompiles from the new authoritative intent
  return out.ok ? { ...out, reframed: true } : out;
}

/**
 * Answer Director's open questions in the Understanding stage. The operator simply
 * replies — they do NOT rewrite the objective. The answer is recorded as a durable
 * clarification (carried into the objective for the worker), the answered questions
 * drop off, and the package recompiles. When no questions remain, understanding is
 * sufficient and the conversation advances to Preparing.
 */
export function answerQuestions({ mission_id, answer }) {
  const mission = getMission(mission_id);
  if (!mission) return { ok: false, error: "unknown_mission" };
  if (isLive(mission_id)) return { ok: false, error: "mid_turn" };
  if (["completed", "closed"].includes(mission.status)) return { ok: false, error: "terminal" };
  const text = String(answer || "").trim();
  if (!text) return { ok: false, error: "empty_answer" };
  const pkg = mission.package_id ? getPackage(mission.package_id) : packageForMission(mission_id);
  const openQs = understandingQuestions(mission, pkg);
  const open = openQs.map((q) => q.id);
  // When the block is "Needs Product Decisions", the operator's answer IS the
  // product decision(s) — record them into the Product Definition so the empty-PD
  // gap (gap-analysis: accepted_decisions+goals+constraints === 0) actually clears.
  // Without this the reply is only a clarification and Director asks forever.
  let decisions_recorded = 0;
  const needsDecisions = pkg?.readiness_verdict?.verdict === "Needs Product Decisions" || open.includes("verdict:Needs Product Decisions");
  if (needsDecisions && mission.capability_id) {
    const statements = text.split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean);
    for (const statement of (statements.length ? statements : [text])) {
      const r = addDecisionForCapability(mission.capability_id, { statement, decided_by: "operator", provenance: "operator" }, { name: mission.title });
      if (r?.added) decisions_recorded++;
    }
  }
  const clarifications = [...(mission.clarifications || []), { answer: text, question_ids: open, at: new Date().toISOString() }];
  const answered = [...new Set([...(mission.answered_questions || []), ...open])];
  updateMission(mission_id, { answered_questions: answered, clarifications });
  const out = recompileMission({ mission_id }); // recompile carries the clarifications into the objective
  return out.ok ? { ...out, answered: open.length, decisions_recorded } : out;
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

/** Hand the objective to Director (autonomous) or take it back (gated). */
export function setObjectiveMode({ capability_id, mode }) {
  const o = setMode(capability_id, mode);
  return o ? { ok: true, objective: o } : { ok: false, error: "no_objective" };
}

/** Gated conductor: prepare the objective's next phase as a Ready mission to review. */
export function prepareNextPhase({ capability_id }) {
  const cap = getCapability(capability_id);
  const o = getObjective(capability_id);
  if (!cap || !o) return { ok: false, error: "no_objective" };
  const next = o.phases.find((p) => p.status === "pending");
  if (!next) return { ok: false, error: "objective_complete" };
  const run = conductNext(cap, next, { autonomous: false });
  if (run?.ok) { clearProposedNext(capability_id); return { ok: true, mission: run.mission, phase: next }; }
  return { ok: false, error: run?.error || "prepare_failed" };
}

/** Read the objective (phase spine + mode + proposed next) for a capability. */
export function readObjective(capability_id) { return getObjective(capability_id); }

/**
 * Autonomous self-heal: ensure the current pending phase is being worked. If no
 * mission for it is active (its last attempt failed — e.g. an auth expiry the
 * operator has since fixed), (re)launch it in the objective's own slot. No-op if a
 * mission for the phase is already running/waiting, or the objective is complete.
 */
export async function conductObjectiveNext({ capability_id }) {
  try {
    const cap = getCapability(capability_id);
    const o = getObjective(capability_id);
    if (!cap || !o || o.mode !== "autonomous") return { ok: false, error: "not_autonomous" };
    const phase = o.phases.find((p) => p.status !== "done");
    if (!phase) { setWaitingOn(capability_id, null); return { ok: false, complete: true }; }
    const ACTIVE = new Set(["starting", "running", "provisioning", "waiting_for_acceptance", "waiting_for_operator"]);
    const active = readMissions(null, 300).some((m) => m.objective_capability_id === capability_id && m.phase_id === phase.id && ACTIVE.has(m.status));
    if (active) { setWaitingOn(capability_id, null); return { ok: true, active: true }; }
    // Don't relaunch into an auth wall — wait until the provider is reconnected, so
    // a claude/cursor OAuth expiry self-heals the moment the operator reconnects.
    const provider = cap.owner?.provider_default || "claude";
    const pre = await precheckProvider(provider);
    if (!pre.ok) {
      const info = reconnectInfo(provider) || {};
      setWaitingOn(capability_id, {
        kind: "provider_auth",
        provider,
        detail: pre.detail || pre.error || `${provider} needs to reconnect`,
        reconnect_cmd: pre.reconnect_cmd || info.command || null,
      });
      return { ok: false, waiting: "provider_auth", provider };
    }
    setWaitingOn(capability_id, null);
    return conductNext(cap, phase, { autonomous: true }) || { ok: false };
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
}

/** Build a preview for a consequential mission action (pure; never executes). */
export function previewAction(action, mission_id) {
  const mission = getMission(mission_id);
  if (!mission) return { ok: false, error: "unknown_mission" };
  const idr = identityFor(mission.worker_slot);
  // A free-slot mission previews as "will provision a worker" rather than failing
  // on the not-yet-existing worktree.
  const freeSlot = !idr.ok && idr.conflict?.kind === "unregistered_slot" && mission.needs_provision !== false;
  const identity = idr.ok ? idr.identity : null;
  const pkg = mission.package_id ? getPackage(mission.package_id) : packageForMission(mission_id);
  const base = { ok: true, action, mission_id, requires_confirmation: CONSEQUENTIAL.has(action), identity, target: targetOf(mission, identity) };

  if (!idr.ok && !freeSlot) return { ...base, ok: false, error: "identity_conflict", conflict: idr.conflict, effects: [] };

  if (action === "start") {
    const pre = checkStartPreconditions(pkg);
    const where = identity ? identity.worktree_name : `a fresh worktree on free slot ${mission.worker_slot}`;
    return { ...base, ok: pre.ok, blockers: pre.blockers,
      summary: `Start "${mission.title}" — runs a ${identity?.provider || mission.provider || "claude"} turn in ${where}`,
      effects: [
        freeSlot ? `Provisions a fresh managed worktree on free slot ${mission.worker_slot} (git worktree + dependency install, ~1–3 min), then spawns the worker there` : `Spawns a provider process in ${identity.worktree_path}`,
        `The worker may create/modify files in that worktree`,
        `Governance: no push, no merge, no promote, no scope broadening`,
      ] };
  }
  if (action === "stop") return { ...base, summary: `Stop "${mission.title}"`, effects: ["Terminates the provider process", "Preserves all mission state and outputs"] };
  if (action === "steer") {
    const pkg = mission.package_id ? getPackage(mission.package_id) : packageForMission(mission_id);
    const fresh = isImplementMission(mission, pkg);
    return {
      ...base,
      summary: `Send a steering instruction to "${mission.title}"`,
      effects: [
        fresh
          ? "Starts a fresh provider turn (implement missions clear session so Bash allowlist applies)"
          : `Resumes provider session ${mission.provider_session_id || "(none — a fresh turn)"}`,
        `Runs another turn in ${identity.worktree_name}`,
      ],
    };
  }
  if (action === "accept") return { ...base, summary: `Accept "${mission.title}"`, effects: ["Runs the acceptance gate", "Marks the mission completed (operator sign-off)", "Writes the mission into capability history"] };
  if (action === "close") return { ...base, summary: `Close "${mission.title}"`, effects: ["Winds the work down (accepted → closed)", "Frees the capacity it held", "Preserves all artifacts and evidence"] };
  return { ...base, ok: false, error: "unknown_action" };
}

/** Operator approval gate → Worker Runtime start. */
export function startMission({ mission_id, confirm }) {
  const mission = getMission(mission_id);
  if (!mission) return { ok: false, error: "unknown_mission" };
  const idr = identityFor(mission.worker_slot);
  // A free-slot mission has no worktree yet — the launcher provisions it in the
  // async block below. Only a genuine identity conflict blocks the start.
  const needsProvision = !idr.ok && idr.conflict?.kind === "unregistered_slot" && mission.needs_provision !== false;
  if (!idr.ok && !needsProvision) {
    audit("start", targetOf(mission, idr.identity), "blocked", { error: idr.conflict?.detail });
    return { ok: false, error: "identity_conflict", conflict: idr.conflict };
  }
  const identity = idr.ok ? idr.identity : null;
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

  // APPROVAL CONTRACT: Start means "execute the mission I just reviewed." Snapshot
  // the exact objective + acceptance the operator is approving, so any later
  // material change is detectable and cannot be accepted without re-review.
  const approved = { objective: pkg.objective, acceptance_ids: (pkg.acceptance_criteria || []).map((c) => c.id).sort(), operator_directed: !!pkg.operator_directed, at: new Date().toISOString() };

  // Durable request: a mission turn is a first-class Director request.
  const req = createRequest({
    slot: mission.worker_slot, worktree: identity?.worktree_name || `(provisioning slot ${mission.worker_slot})`, provider: identity?.provider || mission.provider,
    instruction: `[mission] ${mission.title}`, request_type: "worker-instruction", mission_id,
  });
  updateMission(mission_id, { active_request_id: req.request_id, status: "starting", approved_contract: approved, error_code: null, error_message: null, acceptance_error: null });
  updateRequest(req.request_id, { status: "starting", started_at: new Date().toISOString() });

  setImmediate(async () => {
    try {
      let id = identity;
      if (needsProvision) {
        // The launcher: create the worker's worktree on the free slot, then run.
        updateMission(mission_id, { status: "provisioning", current_phase: `provisioning a worker on slot ${mission.worker_slot} (new worktree + deps, ~1–3 min)` });
        const prov = await provisionSlotForMission(getMission(mission_id));
        if (!prov.ok) {
          updateMission(mission_id, { status: "failed", error_code: "provision_failed", error_message: prov.error, current_phase: null });
          updateRequest(req.request_id, { status: "failed", error_code: "provision_failed", error_message: prov.error, failed_at: new Date().toISOString() });
          audit("start", targetOf(getMission(mission_id), null), "failed", { error: prov.error });
          return;
        }
        id = prov.identity;
        updateMission(mission_id, { worktree: id.worktree_name, branch: id.branch, provider: id.provider || mission.provider, needs_provision: false });
      }
      await runMissionTurn(getMission(mission_id), pkg, { provider: id.provider || mission.provider || "claude", identity: id });
      const after = getMission(mission_id);
      updateRequest(req.request_id, { status: after?.status === "failed" ? "failed" : "worker-responded", completed_at: new Date().toISOString() });
    } catch (e) {
      updateMission(mission_id, { status: "failed", error_code: "exception", error_message: String(e?.message || e) });
      updateRequest(req.request_id, { status: "failed", error_code: "exception", error_message: String(e?.message || e), failed_at: new Date().toISOString() });
    }
  });

  audit("start", targetOf(mission, identity), "succeeded", { confirmed: true, summary: identity ? `started in ${identity.worktree_name}` : `provisioning + starting on slot ${mission.worker_slot}`, input: { mission_id } });
  return { ok: true, mission_id, status: "starting", request_id: req.request_id, worktree: identity?.worktree_name || `(provisioning slot ${mission.worker_slot})` };
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

  // Implement missions need a fresh Claude turn when Bash allowlist is required:
  // resumed sessions keep the prior --allowedTools / permission posture (e.g. the
  // old Bash(npx *) that enabled raw tsc). Force a fresh session so the brokered
  // allowlist from providers.mjs applies. Non-implement continues may resume.
  const forceFresh = isImplementMission(mission, pkg);
  const resume = forceFresh ? null : (mission.provider_session_id || null);
  const req = createRequest({
    slot: mission.worker_slot, worktree: identity.worktree_name, provider: identity.provider || mission.provider,
    instruction, request_type: "worker-instruction", mission_id,
  });
  // Clear any stale failure from a prior attempt so the UI doesn't show a dead
  // run's error banner over a fresh, live turn. Clear session when forcing fresh.
  updateMission(mission_id, {
    pending_question: null, status: "starting", active_request_id: req.request_id,
    error_code: null, error_message: null, acceptance_error: null,
    ...(forceFresh ? { provider_session_id: null } : {}),
  });
  updateRequest(req.request_id, { status: "starting", started_at: new Date().toISOString() });

  setImmediate(() => {
    runMissionTurn({ ...mission, pending_question: null, ...(forceFresh ? { provider_session_id: null } : {}) }, pkg, { provider: identity.provider || mission.provider || "claude", identity, resume, instruction })
      .then(() => {
        const after = getMission(mission_id);
        updateRequest(req.request_id, { status: after?.status === "failed" ? "failed" : "worker-responded", completed_at: new Date().toISOString() });
      })
      .catch((e) => {
        updateMission(mission_id, { status: "failed", error_code: "exception", error_message: String(e?.message || e) });
        updateRequest(req.request_id, { status: "failed", error_code: "exception", error_message: String(e?.message || e), failed_at: new Date().toISOString() });
      });
  });

  audit("steer", targetOf(mission, identity), "succeeded", { confirmed: true, summary: forceFresh ? "fresh turn (implement allowBash)" : (resume ? "resumed session" : "fresh turn"), input: { mission_id } });
  return { ok: true, mission_id, status: "starting", resumed: Boolean(resume), fresh_for_implement: forceFresh, request_id: req.request_id };
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
  // INTEGRITY: the mission that is accepted must be the mission that was approved.
  // If the objective or acceptance changed since Start, refuse — it needs re-review.
  const approved = mission.approved_contract;
  if (approved) {
    const nowIds = (pkg.acceptance_criteria || []).map((c) => c.id).sort();
    const drifted = approved.objective !== pkg.objective || JSON.stringify(approved.acceptance_ids) !== JSON.stringify(nowIds);
    if (drifted) {
      audit("accept", targetOf(mission, identity), "blocked", { confirmed: true, error: "objective_changed_since_approval" });
      return { ok: false, error: "objective_changed_since_approval", detail: "The objective or acceptance changed after you approved this. Review the updated mission and approve again before accepting." };
    }
  }
  const result = evaluateMission(mission, pkg, { worktreePath: identity.worktree_path });
  // Accept advances the objective spine. Only a full evidence pass may do that.
  // needs_operator (e.g. migration awaiting_authorization) must be resolved first —
  // otherwise Accept rubber-stamps judgment and autonomous mode races into the next
  // phase while shared DB work is still outstanding (Access & Roles Phase 0, 2026-07-29).
  if (result.gate === "fail") {
    audit("accept", targetOf(mission, identity), "blocked", { confirmed: true, error: "gate failed" });
    return { ok: false, error: "gate_failed", result };
  }
  if (result.gate !== "pass") {
    const review = (result.criteria || []).filter((c) => c.status === "operator_review");
    const detail = review.length
      ? `Resolve before Accept: ${review.map((c) => `${c.criterion_id}${(c.evidence || [])[0]?.detail ? ` — ${String((c.evidence || [])[0].detail).slice(0, 120)}` : ""}`).join("; ")}`
      : `Acceptance gate is ${result.gate}; only gate=pass may Accept and advance.`;
    audit("accept", targetOf(mission, identity), "blocked", { confirmed: true, error: "gate_needs_operator", summary: detail.slice(0, 240) });
    return { ok: false, error: "gate_needs_operator", detail, result };
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
  // Conductor: advance the objective's phase spine, then PROPOSE the next phase
  // (gated) or PREPARE + RUN it (autonomous — the operator has stepped out).
  let conductor = null;
  try {
    const cap = mission.capability_id ? getCapability(mission.capability_id) : null;
    if (cap) {
      // If this was the audit/plan mission (not an "— implement:" phase), adopt the
      // phases it produced — the plan becomes the script the conductor sequences.
      const isImplement = /—\s*implement:/i.test(String(mission.intent || pkg.title || ""));
      if (!isImplement) {
        try { const rep = readLatestReport(mission_id); if (rep?.implementation_phases?.length) adoptPhases(cap, rep.implementation_phases); } catch { /* plan without structured phases → spine stays as-is */ }
      }
      const adv = advanceOnAccept(cap, { mission_id, worker_slot: mission.worker_slot });
      conductor = { complete: adv.complete, next: adv.next || null, mode: adv.objective?.mode || "gated" };
      if (!adv.complete && conductor.mode === "autonomous") {
        conductor.conducted = conductNext(cap, adv.next, { autonomous: true });
      }
    }
  } catch { /* conductor is best-effort; acceptance already recorded */ }
  audit("accept", targetOf(mission, identity), "succeeded", { confirmed: true, summary: `accepted (gate=${result.gate})${conductor?.next ? ` → next: ${conductor.next.title}` : conductor?.complete ? " → objective complete" : ""}` });
  return { ok: true, result, status: "completed", conductor };
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
