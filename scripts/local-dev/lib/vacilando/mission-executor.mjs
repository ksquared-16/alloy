/**
 * Vacilando — Worker Runtime executor (Mission Execution Runtime).
 *
 * Owns durable execution of a compiled Mission Package, independent of any single
 * provider process, browser connection, or Vacilando restart. This is the fix for
 * the 600.7s failure: a mission OUTLIVES any single turn. Each turn is a bounded,
 * resumable provider invocation the server owns via startMissionTurn (streaming,
 * layered timeouts, early session capture) — NOT a one-shot with a 600s SIGKILL.
 *
 * Contract enforced here:
 *   - a worker starts ONLY a ready package (preconditions checked before spawn)
 *   - the package is serialized into a STRUCTURED prompt (never a raw objective)
 *   - provider_session_id is captured from the first frame and persisted at once
 *   - outputs are persisted against expected_deliverables
 *   - a provider "completed" claim → waiting_for_acceptance (NEVER auto-complete)
 *   - questions/blocks/scope-contradiction stop and escalate
 *   - environment: the mission runs in its bound worktree (no push/merge/promote)
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

import { getMission, updateMission } from "./commands/missions.mjs";
import { getPackage } from "./commands/mission-packages.mjs";
import { evaluateMission } from "./acceptance.mjs";
import { precheckProvider, providerResumable, invalidateProviderProbe } from "./provider-runtime.mjs";
import { startMissionTurn } from "./providers.mjs";
import { REPO_ROOT } from "./knowledge.mjs";
import { WORKER_POLICY } from "./command-budget.mjs";
import { getBrief } from "./mission-brief.mjs";
import {
  getAssignment,
  listAssignments,
  buildAssignmentPackage,
  serializeAssignmentPrompt,
} from "./worker-assignment.mjs";
import { EXECUTION_PROTOCOL_VERSION } from "./mission-context.mjs";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const OUT_ROOT = join(RUNTIME_ROOT, "vacilando", "missions", "outputs");

// Per-turn runtime policy — layered, and deliberately NOT the old 600s bound.
const PER_TURN_MAX_MS = Number(process.env.VACILANDO_TURN_MAX_MS) || 30 * 60 * 1000; // ≥30 min, configurable
const INACTIVITY_MS = Number(process.env.VACILANDO_TURN_INACTIVITY_MS) || 5 * 60 * 1000;
const ACTIVITY_WRITE_THROTTLE_MS = 15000; // don't append last_activity_at more than every 15s

/** Implement phases (intent "— implement:" or package.implement_phase) need Bash. */
export function isImplementMission(mission, pkg) {
  if (pkg?.implement_phase) return true;
  return /—\s*implement:/i.test(String(mission?.intent || mission?.title || pkg?.title || ""));
}

// Live registry: mission_id → { kill, pid, startedAt }. A mission is only truly
// "running" if it is in this map; recovery relies on that.
const live = new Map();
export function liveMissionIds() { return [...live.keys()]; }
export function isLive(mission_id) { return live.has(mission_id); }

function outDir(mission_id) { const d = join(OUT_ROOT, mission_id); if (!existsSync(d)) mkdirSync(d, { recursive: true }); return d; }
export { REPO_ROOT };

/** Capture the set of already-dirty paths so Acceptance can attribute changes to the mission. */
export function gitDirtyPaths(cwd) {
  if (!cwd || !existsSync(cwd)) return [];
  try {
    const out = execFileSync("git", ["-C", cwd, "status", "--porcelain"], { encoding: "utf8", timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
    return out.split("\n").filter(Boolean).map((l) => l.slice(3).trim()).filter(Boolean);
  } catch { return []; }
}

/** The start preconditions from the Worker execution contract. */
export function checkStartPreconditions(pkg) {
  const blockers = [];
  if (!pkg) return { ok: false, blockers: [{ code: "no_package", message: "No package bound to this mission." }] };
  if (pkg.readiness_status !== "ready") blockers.push({ code: "not_ready", message: `Package readiness is "${pkg.readiness_status}", not "ready".`, findings: pkg.readiness_findings || [] });
  if (!pkg.objective?.trim()) blockers.push({ code: "objective_missing", message: "Objective missing." });
  if (!(pkg.scope_included?.length) || !(pkg.scope_excluded?.length)) blockers.push({ code: "scope_incomplete", message: "Scope or exclusions missing." });
  if (!(pkg.acceptance_criteria?.length)) blockers.push({ code: "criteria_missing", message: "No acceptance criteria." });
  if (!(pkg.QA_plan?.length)) blockers.push({ code: "qa_missing", message: "No QA plan." });
  const g = pkg.governance_constraints || {};
  if (!(g.no_push && g.no_merge && g.no_promote && g.no_scope_broadening)) blockers.push({ code: "governance_missing", message: "Governance constraints incomplete." });
  const openBlockingQ = (pkg.unresolved_questions || []).some((q) => q.blocking === true && !q.resolved);
  if (openBlockingQ) blockers.push({ code: "blocking_question", message: "An unresolved blocking question remains." });
  return { ok: blockers.length === 0, blockers };
}

const TURN_PROTOCOL = `
[VACILANDO MISSION RUNTIME — TURN PROTOCOL]
You are executing ONE turn of a durable engineering mission. Everything you need is in this package; do NOT rediscover context.
Hard governance (never violate): do not push, merge, promote, or open/modify pull requests; do not broaden scope beyond the objective; ask before any irreversible or consequential action.
Turn discipline: do the requested work within THIS turn; do not invent and execute unlimited successive work.

${WORKER_POLICY}

When finished, emit as the FINAL line exactly ONE control token and nothing after it:
  <<VACILANDO status=completed>>            — the objective is fully satisfied
  <<VACILANDO status=waiting_for_operator>> — you need an operator answer/decision (write the question on the lines just above)
  <<VACILANDO status=blocked>>              — you cannot proceed (explain why on the lines above)
Also, just before the control token, emit a fenced JSON block labelled vacilando-report:
\`\`\`vacilando-report
{ "implementation_summary": "...", "changed_files": [], "tests": {"ran": false, "results": null},
  "deliverables": [{"id":"D1","produced":true,"path":"..."}],
  "criterion_evidence": [{"criterion_id":"AC1","status":"met|partial|unmet|not_evidenced","evidence_ref":"..."}],
  "migrations": [{"path":"supabase/migrations/….sql","status":"applied|awaiting_authorization|not_required","target":"local|shared|none","note":"...","preflight":{"ok":true,"summary":"…","evidence_path":"docs/…/…-preflight.json"}}],
  "progress_board": {"headline":"…","overall_percent":0,"execution_blocks":[],"register":{"done":0,"total":0},"workstreams":[]},
  "deviations_from_package": [], "unresolved_items": [], "provider_completion_claim": true }
\`\`\`
`.trim();

/** Serialize a package into a STRUCTURED prompt — never the raw objective alone. */
export function serializePackagePrompt(pkg) {
  const L = [];
  const list = (title, items, fmt) => { if (items?.length) { L.push(`\n## ${title}`); for (const it of items) L.push("- " + fmt(it)); } };
  L.push(`# MISSION PACKAGE — ${pkg.title}`);
  L.push(`Package ${pkg.package_id} (v${pkg.version}) · capability ${pkg.capability_id} · mission ${pkg.mission_id}`);
  L.push(`\n## OBJECTIVE\n${pkg.objective}`);
  list("IN SCOPE", pkg.scope_included, (s) => s);
  list("EXCLUDED — HARD", pkg.scope_excluded, (s) => s);
  list("INHERITED PRODUCT RULES", pkg.inherited_product_rules, (r) => `[${r.id}] ${r.rule}`);
  list("ACCEPTED DECISIONS", pkg.accepted_decisions, (d) => `[${d.id}] ${d.statement}`);
  list("REJECTED PATTERNS — DO NOT REINTRODUCE", pkg.rejected_patterns, (r) => `[${r.id}] ${r.statement} (${r.reason})`);
  list("RELEVANT DOCUMENTS", pkg.relevant_documents, (d) => `${d.uri} — ${d.why_relevant || d.title}`);
  list("CURRENT IMPLEMENTATION (references)", pkg.approved_references, (r) => `${r.uri} — ${r.note || ""}`);
  list("ACCEPTANCE CRITERIA", pkg.acceptance_criteria, (c) => `[${c.id}] ${c.statement}`);
  list("EXPECTED DELIVERABLES", pkg.expected_deliverables, (d) => `[${d.id}] ${d.description}${d.path ? ` → ${d.path}` : ""}`);
  list("QA PLAN", pkg.QA_plan, (q) => `[${q.id}] ${q.step}`);
  const g = pkg.governance_constraints || {};
  L.push(`\n## GOVERNANCE\nno_push=${!!g.no_push} no_merge=${!!g.no_merge} no_promote=${!!g.no_promote} no_scope_broadening=${!!g.no_scope_broadening} ask_before_consequential=${!!g.ask_before_consequential} loopback_only=${!!g.loopback_only}`);
  L.push("\n" + TURN_PROTOCOL);
  return L.join("\n");
}

/**
 * True when this mission is bound to a V2 Mission Brief (assignment package path).
 * Brief-backed missions must NEVER silently fall through to serializePackagePrompt.
 */
export function isBriefBackedMission(mission) {
  if (!mission) return false;
  if (mission.mission_content_hash || mission.mission_brief_version != null) return true;
  if (mission.assignment_id || mission.kickoff_status) return true;
  try {
    return Boolean(getBrief(mission.mission_id));
  } catch {
    return false;
  }
}

function resolvedDeliverablesFromAssignment(mission) {
  try {
    const asg = mission.assignment_id
      ? getAssignment(mission.mission_id, mission.assignment_id)
      : listAssignments(mission.mission_id)[0];
    return (asg?.expectedDeliverables || []).map((d, i) => (
      typeof d === "string" ? { id: `D${i + 1}`, description: d, path: null } : d
    ));
  } catch {
    return [];
  }
}

/**
 * Resolve the authoritative stdin prompt for a durable turn.
 *
 * Modes:
 *   - brief_assignment: serializeAssignmentPrompt (+ turn protocol). Requires
 *     fresh context acknowledgement + start report before Running.
 *   - legacy_package: serializePackagePrompt (capability-compiler compatibility).
 *
 * Fail-closed: brief-backed missions without a valid assignment/ack do not
 * fall back to the legacy package prompt.
 *
 * @param {object} mission
 * @param {object|null} pkg — legacy Mission Package (optional for brief path)
 * @param {{ assignmentId?: string }} [opts]
 * @returns {{ ok: true, mode: string, message: string, meta: object } | { ok: false, error: string, code: string, detail?: object }}
 */
export function resolveExecutionPrompt(mission, pkg, { assignmentId = null } = {}) {
  const briefBacked = isBriefBackedMission(mission);
  if (!briefBacked) {
    if (!pkg) return { ok: false, error: "no_package", code: "no_package" };
    return {
      ok: true,
      mode: "legacy_package",
      message: serializePackagePrompt(pkg),
      meta: { package_id: pkg.package_id, version: pkg.version },
    };
  }

  const mid = mission.mission_id;
  const brief = getBrief(mid);
  if (!brief) {
    return {
      ok: false,
      error: "brief_required",
      code: "brief_missing_for_v2_mission",
      detail: { message: "Mission is brief-backed but no Mission Brief head exists — refusing legacy prompt fallback" },
    };
  }

  const assignments = listAssignments(mid);
  const asg = assignmentId
    ? getAssignment(mid, assignmentId)
    : (mission.assignment_id ? getAssignment(mid, mission.assignment_id) : null)
      || assignments.find((a) => a.status === "ready" || a.status === "waiting" || a.status === "running")
      || assignments[0];

  if (!asg) {
    return {
      ok: false,
      error: "assignment_required",
      code: "no_assignment_for_brief_mission",
      detail: { message: "V2 Mission Brief path requires a Worker Assignment Package before spawn" },
    };
  }

  if (!asg.contextAcknowledgement) {
    return {
      ok: false,
      error: "context_not_acknowledged",
      code: "ack_required_before_running",
      detail: { assignmentId: asg.assignmentId, message: "Worker must acknowledge Mission Context before execution becomes Running" },
    };
  }

  if (!asg.startReport) {
    return {
      ok: false,
      error: "start_report_required",
      code: "start_report_required_before_running",
      detail: { assignmentId: asg.assignmentId, message: "Submit start report after acknowledgement before spawn" },
    };
  }

  // Stale acknowledgement / binding
  if (Number(asg.contextAcknowledgement.missionVersion) !== Number(brief.version)
    || asg.contextAcknowledgement.missionContentHash !== brief.contentHash) {
    return {
      ok: false,
      error: "stale_mission_hash",
      code: "stale_acknowledgement",
      detail: {
        acknowledged: asg.contextAcknowledgement,
        current: { version: brief.version, contentHash: brief.contentHash },
      },
    };
  }
  if (Number(asg.missionVersion) !== Number(brief.version)
    || asg.missionContentHash !== brief.contentHash) {
    return {
      ok: false,
      error: "stale_assignment_binding",
      code: "stale_assignment_binding",
      detail: { assignmentId: asg.assignmentId },
    };
  }

  const built = buildAssignmentPackage(mid, asg.assignmentId);
  if (!built?.workerPromptEnvelope) {
    return { ok: false, error: "assignment_package_failed", code: "assignment_package_failed" };
  }

  // Prefer the live serializer so tests can assert exact envelope == serializeAssignmentPrompt
  const envelope = serializeAssignmentPrompt(asg, built.context);
  if (envelope !== built.workerPromptEnvelope) {
    // Should not diverge — use serializeAssignmentPrompt as authority
  }
  if (!envelope.includes(brief.contentHash) || !envelope.includes(`v${brief.version}`)) {
    return {
      ok: false,
      error: "envelope_missing_authority",
      code: "envelope_missing_version_or_hash",
    };
  }

  const message = `${envelope}\n\n${TURN_PROTOCOL}`;
  return {
    ok: true,
    mode: "brief_assignment",
    message,
    meta: {
      assignmentId: asg.assignmentId,
      missionVersion: brief.version,
      contentHash: brief.contentHash,
      protocolVersion: EXECUTION_PROTOCOL_VERSION,
      package_mode: "worker_assignment_v1",
    },
  };
}

/** Parse a finished turn's text → outcome token + question + completion report. */
export function parseOutcome(text) {
  const s = String(text || "");
  const tok = s.match(/<<VACILANDO\s+status=([a-z_]+)[^>]*>>/i);
  const token = tok ? tok[1].toLowerCase() : null;
  let report = null;
  const rep = s.match(/```vacilando-report\s*([\s\S]*?)```/i);
  if (rep) { try { report = JSON.parse(rep[1].trim()); } catch { report = { parse_error: true }; } }
  // question text = content between the report/preamble and the token (best-effort)
  let pending_question = null;
  if (token === "waiting_for_operator" && tok) {
    const before = s.slice(0, tok.index).replace(/```vacilando-report[\s\S]*?```/i, "").trim();
    pending_question = before.split("\n").filter(Boolean).slice(-6).join("\n").slice(0, 1200) || null;
  }
  return { token, pending_question, report };
}

function persistTurnOutput(mission_id, turn, text, report) {
  const dir = outDir(mission_id);
  const path = join(dir, `turn-${turn}.md`);
  try { writeFileSync(path, text || "", "utf8"); } catch { /* best-effort */ }
  if (report) { try { writeFileSync(join(dir, `turn-${turn}.report.json`), JSON.stringify(report, null, 2), "utf8"); } catch {} }
  // append to an index the Acceptance Runtime + UI read
  try { appendFileSync(join(dir, "outputs.jsonl"), JSON.stringify({ turn, path, at: new Date().toISOString(), has_report: !!report }) + "\n", "utf8"); } catch {}
  return path;
}

export function readMissionOutputs(mission_id) {
  try { return readFileSync(join(OUT_ROOT, mission_id, "outputs.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
}
export function readTurnOutput(mission_id, turn) {
  try { return readFileSync(join(OUT_ROOT, mission_id, `turn-${turn}.md`), "utf8"); } catch { return null; }
}
/** The latest turn's parsed vacilando-report (or null) — the conductor reads the
 *  plan mission's structured `implementation_phases` from here. */
export function readLatestReport(mission_id) {
  try {
    const idx = readMissionOutputs(mission_id);
    const withReport = idx.filter((o) => o.has_report);
    const turn = (withReport.length ? withReport : idx).slice(-1)[0]?.turn;
    if (turn == null) return null;
    return JSON.parse(readFileSync(join(OUT_ROOT, mission_id, `turn-${turn}.report.json`), "utf8"));
  } catch { return null; }
}

/**
 * Execute one turn of a mission against its bound package. Async, server-owned.
 * `opts.resume` continues the provider session; `opts.instruction` is an operator
 * steering/answer prepended for a continuation turn.
 */
export async function runMissionTurn(mission, pkg, { provider, identity, resume = null, instruction = null } = {}) {
  const mid = mission.mission_id;
  const turn = (mission.turn_count || 0) + 1;
  const t0 = Date.now();

  // SINGLE SOURCE OF TRUTH: a mission executes in its slot's authoritative
  // worktree — never the runtime host's worktree, and never a name we merely
  // recorded. If the identity is in conflict we refuse rather than guess.
  if (!identity?.ok || !identity.worktree_path) {
    updateMission(mid, { status: "blocked", error_code: "identity_conflict", error_message: identity?.conflict?.detail || "Slot identity could not be resolved authoritatively; refusing to execute.", current_phase: null });
    return;
  }
  const cwd = identity.worktree_path;
  // Record where execution ACTUALLY happens, so the record can never disagree
  // with reality (the defect this replaces).
  updateMission(mid, { worktree: identity.worktree_name, executed_in: cwd, branch: identity.branch });

  // Baseline the already-dirty tree ONCE (first turn) so Acceptance attributes
  // only mission-caused changes — the worktree carries unrelated dev work.
  const baseline = mission.git_baseline || gitDirtyPaths(cwd);
  // LAUNCH is a visible sequence, not dead air: each phase below maps to the REAL
  // step it names (see presence.mjs LAUNCH_STEPS), so the operator watches the worker
  // come online instead of interpreting a silent "running".
  updateMission(mid, { status: "starting", started_at: mission.started_at || new Date().toISOString(), current_phase: "preparing worker", ...(mission.git_baseline ? {} : { git_baseline: baseline }) });

  updateMission(mid, { current_phase: "verifying environment" });
  const auth = await precheckProvider(provider);
  if (!auth.ok) {
    updateMission(mid, { status: "failed", error_code: auth.auth_required ? "auth" : "unsupported", error_message: auth.error, current_phase: null });
    return;
  }

  // Prepare the environment: ensure declared deliverable directories exist so the
  // worker's write of a bounded doc path never needs an ad-hoc mkdir (which
  // acceptEdits would not auto-approve). Only creates dirs under the worktree.
  const deliverables = pkg?.expected_deliverables
    || (resolvedDeliverablesFromAssignment(mission));
  for (const d of deliverables) {
    if (d.path && cwd) {
      const abs = join(cwd, d.path);
      if (abs.startsWith(cwd)) { try { mkdirSync(join(abs, ".."), { recursive: true }); } catch { /* best-effort */ } }
    }
  }
  updateMission(mid, { current_phase: "attaching engine" });

  const resolved = resolveExecutionPrompt(mission, pkg, { assignmentId: mission.assignment_id || null });
  if (!resolved.ok) {
    updateMission(mid, {
      status: "blocked",
      error_code: resolved.code || resolved.error,
      error_message: resolved.detail?.message || resolved.error || "Execution prompt could not be resolved",
      current_phase: null,
      execution_prompt_mode: null,
    });
    return { ok: false, ...resolved };
  }

  let base = resolved.message;
  if (instruction) base = `[OPERATOR STEERING / ANSWER]\n${instruction}\n\n${base}`;

  let lastWrite = 0, sessionWritten = false, rollingSummary = null;
  const onActivity = (a) => {
    const now = Date.now();
    if (a.session_id && !sessionWritten) { sessionWritten = true; updateMission(mid, { provider_session_id: a.session_id }); }
    if (a.kind === "assistant" && a.text) rollingSummary = a.text;
    if (now - lastWrite >= ACTIVITY_WRITE_THROTTLE_MS) {
      lastWrite = now;
      updateMission(mid, { last_activity_at: new Date(now).toISOString(), status: "running", current_phase: a.tool ? `using ${a.tool}` : "running", ...(rollingSummary ? { latest_summary: rollingSummary.slice(0, 400) } : {}) });
    }
  };

  const handle = startMissionTurn({
    provider, message: base, cwd, resume, maxTurnMs: PER_TURN_MAX_MS, inactivityMs: INACTIVITY_MS, onActivity,
    // Implement phases must run tests + browser QA headlessly — pre-allow Bash.
    allowBash: isImplementMission(mission, pkg),
  });
  live.set(mid, { kill: handle.kill, pid: handle.pid, startedAt: t0 });
  // Dispatched: the engine is running but has not reported activity yet. Presence keeps
  // this as "launching" until the first onActivity flips it to a real execution event.
  updateMission(mid, {
    status: "running",
    current_phase: "dispatching work",
    turn_count: turn,
    execution_prompt_mode: resolved.mode,
    assignment_id: resolved.meta?.assignmentId || mission.assignment_id || null,
    mission_brief_version: resolved.meta?.missionVersion ?? mission.mission_brief_version ?? null,
    mission_content_hash: resolved.meta?.contentHash ?? mission.mission_content_hash ?? null,
  });

  let r;
  try { r = await handle.done; } finally { live.delete(mid); }

  const dur = Date.now() - t0;
  const now = new Date().toISOString();
  if (r.session_id) updateMission(mid, { provider_session_id: r.session_id });

  // --- classify outcome honestly ---
  if (r.timed_out) {
    updateMission(mid, { status: "interrupted", error_code: "timeout", error_message: `Turn timed out (${r.timeout_kind}). Provider session ${r.session_id ? "captured — resumable" : "not captured"}.`, current_phase: null });
    return;
  }
  if (r.auth_required || /oauth|auth|expired|log ?in|credential/i.test(r.error || "")) {
    invalidateProviderProbe(provider);
    updateMission(mid, { status: "failed", error_code: "auth", error_message: r.error || "authentication required", current_phase: null });
    return;
  }
  if (r.ok === false) {
    updateMission(mid, { status: "failed", error_code: "provider_error", error_message: r.error || "provider error", current_phase: null });
    return;
  }

  const { token, pending_question, report } = parseOutcome(r.text);
  const path = persistTurnOutput(mid, turn, r.text, report);

  const common = { latest_summary: (report?.implementation_summary || rollingSummary || r.text || "").slice(0, 800), last_activity_at: now, current_phase: null, usage: r.usage || null, last_output_path: path };

  if (token === "waiting_for_operator") {
    updateMission(mid, { ...common, status: "waiting_for_operator", pending_question: pending_question || "The worker is waiting for operator input." });
  } else if (token === "blocked") {
    updateMission(mid, { ...common, status: "blocked", error_code: "blocked", error_message: pending_question || "The worker reported it is blocked." });
  } else if (token === "completed") {
    // NEVER auto-complete: a completion CLAIM advances to waiting_for_acceptance,
    // then Vacilando VERIFIES it — completion is "evidence satisfies acceptance,"
    // not "the engine stopped." The gate is computed here so the operator lands
    // in Ready-for-Review with evidence in hand, never a raw provider claim.
    updateMission(mid, { ...common, status: "waiting_for_acceptance", pending_approval: "Provider claims the objective is complete — verifying evidence against acceptance.", completion_report: report || null, provider_completion_claim: true });
    try {
      const fresh = getMission(mid);
      const result = evaluateMission(fresh, pkg, { worktreePath: cwd });
      updateMission(mid, { acceptance_gate: result.gate, acceptance_at: result.evaluated_at });
    } catch (e) { updateMission(mid, { acceptance_gate: null, acceptance_error: String(e?.message || e) }); }
  } else {
    // No control token → the provider did not assert completion → operator-paced default.
    updateMission(mid, { ...common, status: "waiting_for_operator", pending_question: "The provider ended its turn without a completion signal. Review the output and steer or accept.", completion_report: report || null });
  }
}

/** Stop a running mission: kill the tracked child, preserve all state. */
export function stopMission(mission_id) {
  const m = getMission(mission_id);
  if (!m) return { ok: false, error: "unknown_mission" };
  const entry = live.get(mission_id);
  updateMission(mission_id, { status: "stopping" });
  if (entry) { try { entry.kill("SIGTERM"); } catch {} setTimeout(() => { try { entry.kill("SIGKILL"); } catch {} }, 3000); }
  updateMission(mission_id, { status: "stopped", stopped_at: new Date().toISOString(), current_phase: null });
  return { ok: true, was_live: !!entry };
}

/** Whether a provider adapter supports resume (for recovery honesty). */
export const canResume = providerResumable;
