/**
 * Vacilando — Worker Assignment lifecycle (Execution System V2 §5.3, §6–7).
 *
 * Bounded assignments against an exact Mission Brief version + contentHash.
 * Stale context is rejected. Completion requires evidence. Cursor and Claude
 * receive the same structured package (prompt serialization is equivalent).
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { getBrief } from "./mission-brief.mjs";
import {
  buildMissionContextPackage,
  validateContextAcknowledgement,
  EXECUTION_PROTOCOL_VERSION,
} from "./mission-context.mjs";
import { appendTimelineEvent } from "./timeline.mjs";
import { listEvidence, missingRequiredEvidence, attachEvidence } from "./evidence.mjs";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "assignments");

export const ASSIGNMENT_STATUSES = new Set([
  "ready", "running", "waiting", "verification", "complete",
  "blocked", "paused", "failed", "superseded",
]);

const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

function fileFor(missionId) {
  return join(DIR, `${missionId}.json`);
}

function readStore(missionId) {
  try {
    return JSON.parse(readFileSync(fileFor(missionId), "utf8"));
  } catch {
    return {
      schema_version: "vacilando.assignments.v1",
      mission_id: missionId,
      assignments: [],
      context_epoch: null,
    };
  }
}

function writeStore(store) {
  ensureDir();
  writeFileSync(fileFor(store.mission_id), JSON.stringify(store, null, 2));
  return store;
}

function defaultProhibited(brief) {
  const out = ["Do not push, merge, or promote without explicit operator approval"];
  for (const c of brief?.constraints || []) out.push(typeof c === "string" ? c : c.text);
  for (const s of brief?.outOfScope || []) out.push(`Out of scope: ${s}`);
  return out.filter(Boolean);
}

/**
 * Create assignments from Mission Brief phases after kickoff approval.
 * Phase dependency order becomes assignment dependency graph.
 */
/**
 * Create assignments from a Compiled Mission execution plan (preferred).
 * Falls back to Mission Brief phases only when no compiled mission exists.
 */
export function createAssignmentsFromCompiled(missionId, compiled, { slot = null, branch = null, actor = "director", nowMs, brief = null } = {}) {
  if (!compiled) throw new Error(`compiled_mission_required:${missionId}`);
  const b = brief || getBrief(missionId);
  const store = readStore(missionId);
  store.context_epoch = {
    version: compiled.briefVersion ?? b?.version,
    contentHash: compiled.briefContentHash ?? b?.contentHash,
    compiledMissionId: compiled.compiledMissionId,
  };

  const plan = (compiled.executionPhases || []).slice().sort((a, c) => a.order - c.order);

  // Resolve deps against already-persisted phases (next-wave opens), not only this batch.
  const phaseToAssignment = new Map();
  for (const existing of store.assignments || []) {
    if (existing.phaseId && existing.assignmentId) {
      phaseToAssignment.set(existing.phaseId, existing.assignmentId);
    }
  }
  const created = [];
  for (const phase of plan) {
    if (phaseToAssignment.has(phase.phaseId)) continue; // already present
    const assignmentId = "asg_" + createHash("sha256")
      .update(`${missionId}:${phase.phaseId}:${compiled.compiledMissionId}:${Math.random()}`)
      .digest("hex").slice(0, 14);
    const deps = (phase.dependencies || [])
      .map((depPhaseId) => phaseToAssignment.get(depPhaseId))
      .filter(Boolean);
    const depsComplete = (phase.dependencies || []).every((depPhaseId) => {
      const depId = phaseToAssignment.get(depPhaseId);
      if (!depId) return false;
      const depAsg = (store.assignments || []).find((a) => a.assignmentId === depId);
      return depAsg && ["complete", "accepted"].includes(String(depAsg.status || "").toLowerCase());
    });
    const outputs = phase.requiredOutputs
      || (compiled.deliverables || [])
        .filter((d) => (phase.deliverableIds || []).includes(d.id) && d.status === "to_execute")
        .map((d) => d.expectedPath || d.title);

    const assignment = {
      schema_version: "vacilando.worker_assignment.v1",
      assignmentId,
      missionId,
      missionVersion: compiled.briefVersion ?? b?.version,
      missionContentHash: compiled.briefContentHash ?? b?.contentHash,
      compiledMissionId: compiled.compiledMissionId,
      phaseId: phase.phaseId,
      title: phase.title,
      objective: phase.objective || compiled.objective,
      scope: outputs,
      prohibitedChanges: [
        ...(compiled.exclusions || []).map((e) => `Out of scope: ${e}`),
        "Do not reinterpret Compiled Mission intent — escalate if reality diverges",
      ],
      expectedDeliverables: outputs,
      acceptanceCriteriaIds: phase.acceptanceCriteriaIds || [],
      dependencies: deps,
      repository: {
        mergeTarget: b?.executionPreferences?.mergeTarget || "staging",
      },
      branch: branch || null,
      slot: slot != null ? String(slot) : (b?.executionPreferences?.preferredSlots?.[0] || null),
      port: null,
      requiredValidation: (b?.executionPreferences?.requiredValidationProfiles || []).map((p) => ({ profile: p })),
      requiredEvidence: ["log", "document"],
      evidenceProfile: "execution_v1",
      escalationRules: [{ kind: "product_behavior", escalate: true }],
      completionContract: {
        requireEvidence: true,
        evidenceProfile: "code_only",
        requireContextAck: true,
      },
      status: (!deps.length || depsComplete) ? "ready" : "waiting",
      workerId: null,
      provider: null,
      contextAcknowledgement: null,
      startReport: null,
      progress: [],
      blockers: [],
      completionReport: null,
      validation: null,
      paused_reason: null,
      created_at: iso(nowMs),
      updated_at: iso(nowMs),
      created_by: actor,
    };
    phaseToAssignment.set(phase.phaseId, assignmentId);
    store.assignments.push(assignment);
    created.push(assignment);
  }
  writeStore(store);
  return created;
}

export function createAssignmentsFromBrief(missionId, brief = null, { slot = null, branch = null, actor = "director", nowMs } = {}) {
  const b = brief || getBrief(missionId);
  if (!b) throw new Error(`brief_not_found:${missionId}`);
  const store = readStore(missionId);
  store.context_epoch = { version: b.version, contentHash: b.contentHash };

  const phases = (b.plan || []).slice().sort((a, c) => a.order - c.order);
  const phaseToAssignment = new Map();
  const created = [];

  for (const phase of phases) {
    const assignmentId = "asg_" + createHash("sha256")
      .update(`${missionId}:${phase.phaseId}:${b.version}:${Math.random()}`)
      .digest("hex").slice(0, 14);
    const deps = (phase.dependencies || [])
      .map((depPhaseId) => phaseToAssignment.get(depPhaseId))
      .filter(Boolean);

    const assignment = {
      schema_version: "vacilando.worker_assignment.v1",
      assignmentId,
      missionId: b.missionId || missionId,
      missionVersion: b.version,
      missionContentHash: b.contentHash,
      phaseId: phase.phaseId,
      title: phase.title,
      objective: phase.objective || b.objective,
      scope: phase.requiredOutputs || [],
      prohibitedChanges: defaultProhibited(b),
      expectedDeliverables: phase.requiredOutputs || [],
      acceptanceCriteriaIds: phase.acceptanceCriteriaIds || [],
      dependencies: deps,
      repository: {
        mergeTarget: b.executionPreferences?.mergeTarget || "staging",
      },
      branch: branch || null,
      slot: slot != null ? String(slot) : (b.executionPreferences?.preferredSlots?.[0] || null),
      port: null,
      requiredValidation: (b.executionPreferences?.requiredValidationProfiles || []).map((p) => ({ profile: p })),
      // V1 Director dispatch collects an execution log; richer profiles opt in via brief prefs later.
      requiredEvidence: ["log"],
      evidenceProfile: "execution_v1",
      escalationRules: [{ kind: "product_behavior", escalate: true }],
      completionContract: {
        requireEvidence: true,
        evidenceProfile: "code_only",
        requireContextAck: true,
      },
      status: deps.length ? "waiting" : "ready",
      workerId: null,
      provider: null,
      contextAcknowledgement: null,
      startReport: null,
      progress: [],
      blockers: [],
      completionReport: null,
      validation: null,
      paused_reason: null,
      created_at: iso(nowMs),
      updated_at: iso(nowMs),
      created_by: actor,
    };
    phaseToAssignment.set(phase.phaseId, assignmentId);
    store.assignments.push(assignment);
    created.push(assignment);
  }

  // Mark ready ones whose deps are all complete (none yet) — already set.
  writeStore(store);
  return created;
}

export function listAssignments(missionId = null) {
  if (!missionId) {
    ensureDir();
    const out = [];
    try {
      for (const name of readdirSync(DIR).filter((n) => n.endsWith(".json"))) {
        const store = JSON.parse(readFileSync(join(DIR, name), "utf8"));
        out.push(...(store.assignments || []));
      }
    } catch { /* empty */ }
    return out;
  }
  return readStore(missionId).assignments || [];
}

export function getAssignment(missionId, assignmentId) {
  return listAssignments(missionId).find((a) => a.assignmentId === assignmentId) || null;
}

export function updateAssignment(missionId, assignmentId, mutator, { nowMs } = {}) {
  const store = readStore(missionId);
  const a = store.assignments.find((x) => x.assignmentId === assignmentId);
  if (!a) return null;
  mutator(a);
  a.updated_at = iso(nowMs);
  writeStore(store);
  return a;
}

/** Dependency graph projection. */
export function assignmentDependencyGraph(missionId) {
  const assignments = listAssignments(missionId);
  const byId = new Map(assignments.map((a) => [a.assignmentId, a]));
  return assignments.map((a) => ({
    assignmentId: a.assignmentId,
    title: a.title,
    status: a.status,
    phaseId: a.phaseId,
    dependencies: a.dependencies || [],
    dependents: assignments.filter((o) => (o.dependencies || []).includes(a.assignmentId)).map((o) => o.assignmentId),
    resourceRequirements: a.slot ? [{ type: "worker_slot", slot: a.slot }] : [],
    estimatedConflictDomains: [],
    priority: "normal",
    node: byId.get(a.assignmentId),
  }));
}

export function buildAssignmentPackage(missionId, assignmentId) {
  const a = getAssignment(missionId, assignmentId);
  if (!a) return null;
  const context = buildMissionContextPackage(missionId, { phaseId: a.phaseId });
  return {
    assignment: a,
    context,
    protocolVersion: EXECUTION_PROTOCOL_VERSION,
    /** Equivalent packaging for Cursor and Claude — same JSON contract. */
    workerPromptEnvelope: serializeAssignmentPrompt(a, context),
  };
}

/** Structured prompt for both Cursor and Claude (no ad-hoc assembly). */
export function serializeAssignmentPrompt(assignment, context) {
  const lines = [
    `# Worker Assignment ${assignment.assignmentId}`,
    `Mission: ${assignment.missionId} v${assignment.missionVersion}`,
    `contentHash: ${assignment.missionContentHash}`,
    `Protocol: ${EXECUTION_PROTOCOL_VERSION}`,
    "",
    `## Title`,
    assignment.title,
    "",
    `## Objective`,
    assignment.objective,
    "",
    `## Scope`,
    ...(assignment.scope || []).map((s) => `- ${s}`),
    "",
    `## Prohibited changes`,
    ...(assignment.prohibitedChanges || []).map((s) => `- ${s}`),
    "",
    `## Acceptance criteria`,
    ...(assignment.acceptanceCriteriaIds || []).map((id) => {
      const ac = (context?.relevantAcceptanceCriteria || []).find((c) => c.id === id);
      return `- ${id}: ${ac?.statement || "(see Mission Brief)"}`;
    }),
    "",
    `## Constraints`,
    ...(context?.globalConstraints || []).map((c) => `- ${c.text || c}`),
    "",
    ...(assignment.reopen_reason ? [
      `## Operator change request (reopen)`,
      assignment.reopen_reason,
      "",
    ] : []),
    ...((context?.operatorGuidance || []).length ? [
      `## Open operator guidance (from mission conversation)`,
      ...(context.operatorGuidance.map((g) => `- [${g.type}] ${g.body}`)),
      "",
    ] : []),
    `## Completion contract`,
    `- Acknowledge context (version + contentHash) before changing code`,
    `- Submit start report before edits`,
    `- Attach required evidence before claiming complete`,
    `- Do not begin if contentHash is stale`,
  ];
  return lines.join("\n");
}

/**
 * Worker acknowledges context. Rejects stale hash/version.
 */
export function acknowledgeWorkerContext({
  missionId,
  assignmentId,
  workerId,
  missionVersion,
  missionContentHash,
  protocolVersion = EXECUTION_PROTOCOL_VERSION,
  provider = null,
  nowMs,
} = {}) {
  const a = getAssignment(missionId, assignmentId);
  if (!a) return { ok: false, error: "assignment_not_found" };
  const context = buildMissionContextPackage(missionId, { phaseId: a.phaseId });
  if (!context) return { ok: false, error: "context_unavailable" };

  const ack = {
    workerId,
    missionId,
    missionVersion: Number(missionVersion),
    missionContentHash,
    protocolVersion,
    acknowledgedAt: iso(nowMs),
  };
  const check = validateContextAcknowledgement(ack, context);
  if (!check.ok) return { ok: false, ...check };

  // Also reject if assignment itself is bound to an obsolete brief
  if (Number(a.missionVersion) !== Number(context.missionVersion)
    || a.missionContentHash !== context.missionContentHash) {
    return {
      ok: false,
      code: "stale_assignment_binding",
      message: "Assignment was compiled against an obsolete Mission Brief — refresh required",
    };
  }

  updateAssignment(missionId, assignmentId, (asg) => {
    asg.contextAcknowledgement = ack;
    asg.workerId = workerId;
    asg.provider = provider;
  }, { nowMs });

  return { ok: true, acknowledgement: ack, context };
}

export function submitWorkerStartReport({
  missionId,
  assignmentId,
  understoodObjective,
  intendedApproach = [],
  filesOrSystemsExpectedToChange = [],
  detectedRisks = [],
  nowMs,
} = {}) {
  const a = getAssignment(missionId, assignmentId);
  if (!a) return { ok: false, error: "assignment_not_found" };
  if (!a.contextAcknowledgement) {
    return { ok: false, error: "context_not_acknowledged", message: "Acknowledge Mission Context before starting" };
  }
  // Re-check hash freshness at start
  const context = buildMissionContextPackage(missionId, { phaseId: a.phaseId });
  const recheck = validateContextAcknowledgement(a.contextAcknowledgement, context);
  if (!recheck.ok) return { ok: false, ...recheck };

  const report = {
    assignmentId,
    understoodObjective,
    intendedApproach,
    filesOrSystemsExpectedToChange,
    detectedRisks,
    contextAcknowledgement: a.contextAcknowledgement,
    at: iso(nowMs),
  };

  updateAssignment(missionId, assignmentId, (asg) => {
    asg.startReport = report;
    if (asg.status === "ready" || asg.status === "waiting") asg.status = "running";
  }, { nowMs });

  appendTimelineEvent(missionId, {
    type: "assignment_started",
    summary: `Assignment started — ${a.title}`,
    visibility: "summary",
    phaseId: a.phaseId,
    assignmentId,
    actor: a.workerId || "worker",
    detail: { understoodObjective },
    nowMs,
  });

  return { ok: true, report, assignment: getAssignment(missionId, assignmentId) };
}

export function reportWorkerProgress({
  missionId,
  assignmentId,
  summary,
  percent = null,
  nowMs,
} = {}) {
  const a = updateAssignment(missionId, assignmentId, (asg) => {
    asg.progress = asg.progress || [];
    asg.progress.push({ summary, percent, at: iso(nowMs) });
    asg.last_progress_at = iso(nowMs);
  }, { nowMs });
  if (!a) return { ok: false, error: "assignment_not_found" };
  appendTimelineEvent(missionId, {
    type: "progress",
    summary: summary || "Progress update",
    visibility: "detail",
    assignmentId,
    actor: a.workerId || "worker",
    nowMs,
  });
  return { ok: true, assignment: a };
}

export function reportWorkerBlocker({
  missionId,
  assignmentId,
  kind,
  message,
  routine = null,
  nowMs,
} = {}) {
  const a = updateAssignment(missionId, assignmentId, (asg) => {
    asg.blockers = asg.blockers || [];
    asg.blockers.push({ kind, message, routine, at: iso(nowMs) });
    asg.status = "blocked";
  }, { nowMs });
  if (!a) return { ok: false, error: "assignment_not_found" };
  appendTimelineEvent(missionId, {
    type: "blocker",
    summary: message || `Blocked — ${kind}`,
    visibility: "summary",
    assignmentId,
    actor: a.workerId || "worker",
    detail: { kind, routine },
    nowMs,
  });
  return { ok: true, assignment: a, escalate: routine === false };
}

/**
 * Submit completion. Rejects when required evidence missing (§7.4).
 * Director validation runs separately via validateAssignmentCompletion.
 */
export function submitWorkerCompletion({
  missionId,
  assignmentId,
  status = "complete",
  summary,
  changesMade = [],
  acceptanceCriteriaResults = [],
  evidence = [],
  tests = [],
  commits = [],
  migrations = [],
  residualRisks = [],
  followUpItems = [],
  confidence = "medium",
  recommendation = "",
  nowMs,
} = {}) {
  const a = getAssignment(missionId, assignmentId);
  if (!a) return { ok: false, error: "assignment_not_found" };

  // Persist any inline evidence artifacts first
  for (const ev of evidence) {
    if (ev && !ev.evidenceId) {
      attachEvidence({
        missionId,
        assignmentId,
        type: ev.type,
        title: ev.title || ev.type,
        description: ev.description || "",
        fileUri: ev.fileUri,
        exitCode: ev.exitCode,
        acceptanceCriteriaIds: ev.acceptanceCriteriaIds || a.acceptanceCriteriaIds || [],
        createdBy: a.workerId || "worker",
        command: ev.command,
        repositorySha: ev.repositorySha,
        branch: ev.branch,
        nowMs,
      });
    }
  }

  const artifacts = listEvidence(missionId, { assignmentId });
  if (status === "complete") {
    const missing = missingRequiredEvidence(a, artifacts);
    if (missing.length) {
      updateAssignment(missionId, assignmentId, (asg) => {
        asg.status = "verification";
        asg.completionReport = {
          rejected: true,
          reason: "missing_evidence",
          missing,
          at: iso(nowMs),
        };
      }, { nowMs });
      return {
        ok: false,
        error: "missing_evidence",
        missing,
        message: `Completion rejected — missing evidence: ${missing.join(", ")}`,
        assignment: getAssignment(missionId, assignmentId),
      };
    }
  }

  const report = {
    assignmentId,
    status,
    summary,
    changesMade,
    acceptanceCriteriaResults,
    evidence: artifacts,
    tests,
    commits,
    migrations,
    residualRisks,
    followUpItems,
    confidence,
    recommendation,
    at: iso(nowMs),
  };

  updateAssignment(missionId, assignmentId, (asg) => {
    asg.completionReport = report;
    asg.status = status === "complete" ? "verification" : status === "blocked" ? "blocked" : "failed";
  }, { nowMs });

  return { ok: true, report, assignment: getAssignment(missionId, assignmentId) };
}

/** Director validates worker completion claims (§10). */
export function validateAssignmentCompletion(missionId, assignmentId, { actor = "director", nowMs } = {}) {
  const a = getAssignment(missionId, assignmentId);
  if (!a) return { ok: false, error: "assignment_not_found" };
  const artifacts = listEvidence(missionId, { assignmentId });
  const missing = missingRequiredEvidence(a, artifacts);
  const deliverablesOk = (a.expectedDeliverables || []).length === 0
    || (a.completionReport?.changesMade || []).length > 0
    || artifacts.length > 0;
  const withinScope = true; // Phase tranche: structural check; deeper diff scan later
  const passed = missing.length === 0 && deliverablesOk && a.completionReport && a.completionReport.status === "complete";

  const validation = {
    passed,
    missing_evidence: missing,
    deliverables_ok: deliverablesOk,
    within_scope: withinScope,
    validated_at: iso(nowMs),
    validated_by: actor,
  };

  updateAssignment(missionId, assignmentId, (asg) => {
    asg.validation = validation;
    if (passed) {
      asg.status = "complete";
    } else {
      asg.status = "verification";
    }
  }, { nowMs });

  if (passed) {
    const short = (a.title || "").match(/\b(W-\d+)\b/i)?.[1] || a.title || "assignment";
    appendTimelineEvent(missionId, {
      type: "assignment_completed",
      headline: `Claude completed ${short}`,
      summary: `Worker finished ${a.title}. Director continues the implementation chain unless a decision is required.`,
      visibility: "summary",
      phaseId: a.phaseId,
      assignmentId,
      actor,
      nowMs,
    });
    // Dependent unlock moves to Deliverable Review acceptance.
    // Callers must invoke createDeliverableReview after a successful validate.
  }

  return { ok: true, validation, assignment: getAssignment(missionId, assignmentId) };
}

function unlockDependents(missionId, completedId, { nowMs } = {}) {
  const store = readStore(missionId);
  for (const a of store.assignments) {
    if (a.status !== "waiting") continue;
    const deps = a.dependencies || [];
    const allDone = deps.every((d) => {
      const dep = store.assignments.find((x) => x.assignmentId === d);
      return dep && dep.status === "complete";
    });
    if (allDone) {
      a.status = "ready";
      a.updated_at = iso(nowMs);
    }
  }
  writeStore(store);
}

export function pauseAssignments(missionId, assignmentIds, { reason = null, decisionId = null, nowMs } = {}) {
  const ids = new Set(assignmentIds || []);
  const store = readStore(missionId);
  for (const a of store.assignments) {
    if (!ids.has(a.assignmentId)) continue;
    if (a.status === "complete" || a.status === "failed") continue;
    a.status = "paused";
    a.paused_reason = reason;
    a.paused_decision_id = decisionId;
    a.updated_at = iso(nowMs);
  }
  writeStore(store);
  return listAssignments(missionId).filter((a) => ids.has(a.assignmentId));
}

export function resumeAssignments(missionId, assignmentIds, { reason = null, nowMs } = {}) {
  const ids = new Set(assignmentIds || []);
  const store = readStore(missionId);
  for (const a of store.assignments) {
    if (!ids.has(a.assignmentId)) continue;
    if (a.status !== "paused") continue;
    const deps = a.dependencies || [];
    const allDone = deps.every((d) => {
      const dep = store.assignments.find((x) => x.assignmentId === d);
      return !dep || dep.status === "complete";
    });
    a.status = allDone ? "ready" : "waiting";
    a.paused_reason = null;
    a.resume_reason = reason;
    a.updated_at = iso(nowMs);
  }
  writeStore(store);
  return listAssignments(missionId).filter((a) => ids.has(a.assignmentId));
}

/**
 * Clear stale completion/dispatch so a ready assignment can be launched again.
 */
export function clearAssignmentDispatchState(missionId, assignmentIds = null, { nowMs } = {}) {
  const ids = assignmentIds ? new Set(assignmentIds) : null;
  const store = readStore(missionId);
  for (const a of store.assignments) {
    if (ids && !ids.has(a.assignmentId)) continue;
    if (!["ready", "paused", "waiting"].includes(a.status) && a.status !== "complete") continue;
    if (a.status === "complete") a.status = "ready";
    a.dispatch = null;
    a.completionReport = null;
    a.contextAcknowledgement = null;
    a.workerId = null;
    a.pause_reason = null;
    a.paused_reason = null;
    a.updated_at = iso(nowMs);
  }
  writeStore(store);
  return listAssignments(missionId);
}

/** Reopen completed assignments for another execution pass. */
export function reopenAssignmentsForMoreWork(missionId, {
  reason = "Operator sent work back for another pass",
  nowMs,
} = {}) {
  const store = readStore(missionId);
  const touched = [];
  for (const a of store.assignments) {
    if (a.status !== "complete" && a.status !== "paused" && a.status !== "ready") continue;
    a.status = "ready";
    a.dispatch = null;
    a.completionReport = null;
    a.contextAcknowledgement = null;
    a.workerId = null;
    a.pause_reason = null;
    a.paused_reason = null;
    a.reopen_reason = reason;
    a.updated_at = iso(nowMs);
    touched.push(a.assignmentId);
  }
  writeStore(store);
  return { ok: true, missionId, reopened: touched, assignments: listAssignments(missionId) };
}

/**
 * Create one ready assignment from a freeform operator/Director objective
 * when the implementation register has no remaining phases.
 */
export function createOperatorObjectiveAssignment(missionId, {
  title = "Beyond-register objective",
  objective,
  actor = "operator",
  phaseId = null,
  nowMs,
} = {}) {
  const text = String(objective || "").trim();
  if (!missionId || !text) return { ok: false, error: "missing_objective" };
  const brief = getBrief(missionId);
  const store = readStore(missionId);
  // Reuse an existing ready/running beyond-register row with the same title prefix.
  const existing = (store.assignments || []).find((a) =>
    String(a.phaseId || "").startsWith("impl_obj_")
    && ["ready", "running", "waiting", "verification"].includes(a.status));
  if (existing) {
    existing.objective = text.slice(0, 12000);
    existing.title = String(title || existing.title).slice(0, 160);
    existing.updated_at = iso(nowMs);
    writeStore(store);
    return { ok: true, reused: true, assignment: existing };
  }
  const pid = phaseId || `impl_obj_${createHash("sha256").update(`${missionId}:${Date.now()}`).digest("hex").slice(0, 10)}`;
  const assignmentId = "asg_" + createHash("sha256")
    .update(`${missionId}:${pid}:${Math.random()}`)
    .digest("hex")
    .slice(0, 14);
  const assignment = {
    schema_version: "vacilando.worker_assignment.v1",
    assignmentId,
    missionId,
    missionVersion: brief?.version || null,
    missionContentHash: brief?.contentHash || null,
    compiledMissionId: null,
    phaseId: pid,
    title: String(title || "Beyond-register objective").slice(0, 160),
    objective: text.slice(0, 12000),
    scope: ["promotion", "certification", "remaining plan"],
    prohibitedChanges: [
      "Escalate only for genuine operator-owned product/security decisions",
      "Do not declare Access & Identity V2 complete from assignment labels alone",
    ],
    expectedDeliverables: [
      "Authoritative progress report",
      "Promotion / migration evidence",
      "Certification matrix against shared environment",
    ],
    acceptanceCriteriaIds: [],
    dependencies: [],
    repository: {
      mergeTarget: brief?.executionPreferences?.mergeTarget || "staging",
    },
    branch: null,
    slot: brief?.executionPreferences?.preferredSlots?.[0] || null,
    port: null,
    requiredValidation: [],
    requiredEvidence: ["log", "document"],
    evidenceProfile: "execution_v1",
    escalationRules: [{ kind: "product_behavior", escalate: true }],
    completionContract: {
      requireEvidence: true,
      evidenceProfile: "execution_v1",
      requireContextAck: true,
    },
    status: "ready",
    stage: "implementation",
    workerId: null,
    provider: null,
    contextAcknowledgement: null,
    startReport: null,
    progress: [],
    blockers: [],
    completionReport: null,
    validation: null,
    paused_reason: null,
    created_at: iso(nowMs),
    updated_at: iso(nowMs),
    created_by: actor,
    operator_objective: true,
  };
  store.assignments.push(assignment);
  writeStore(store);
  return { ok: true, reused: false, assignment };
}

/**
 * Reset claimed-running assignments that have no live worker so they can relaunch.
 * Does not touch complete/waiting/paused rows.
 */
export function resetStalledRunningAssignments(missionId, {
  assignmentIds = null,
  reason = "Worker went silent — reset for relaunch",
  nowMs,
} = {}) {
  const ids = assignmentIds ? new Set(assignmentIds) : null;
  const store = readStore(missionId);
  const touched = [];
  for (const a of store.assignments) {
    if (ids && !ids.has(a.assignmentId)) continue;
    if (!["running", "verification"].includes(a.status)) continue;
    a.status = "ready";
    a.dispatch = null;
    a.completionReport = null;
    a.contextAcknowledgement = null;
    a.workerId = null;
    a.provider = null;
    a.pause_reason = null;
    a.paused_reason = null;
    a.stalled_reset_reason = reason;
    a.updated_at = iso(nowMs);
    touched.push(a.assignmentId);
  }
  writeStore(store);
  return { ok: true, missionId, reset: touched, assignments: listAssignments(missionId) };
}

/** Invalidate acknowledgements after brief re-version; mark assignments for refresh. */
export function invalidateWorkerContexts(missionId, { missionVersion, missionContentHash, reason, decisionId, nowMs } = {}) {
  const store = readStore(missionId);
  store.context_epoch = { version: missionVersion, contentHash: missionContentHash };
  for (const a of store.assignments) {
    if (a.status === "complete") continue;
    a.missionVersion = missionVersion;
    a.missionContentHash = missionContentHash;
    a.contextAcknowledgement = null;
    a.context_invalidated_at = iso(nowMs);
    a.context_invalidation_reason = reason;
    if (a.status === "running") a.status = "paused";
    a.paused_reason = "context_invalidated";
  }
  writeStore(store);
  appendTimelineEvent(missionId, {
    type: "context_invalidated",
    summary: `Mission context invalidated — workers must re-acknowledge v${missionVersion}`,
    visibility: "summary",
    decisionId,
    actor: "director",
    detail: { missionVersion, missionContentHash, reason },
    nowMs,
  });
  return store.assignments;
}

export function phaseDeliverableGroups(missionId) {
  const brief = getBrief(missionId);
  const assignments = listAssignments(missionId);
  return (brief?.plan || []).map((phase) => {
    const asgs = assignments.filter((a) => a.phaseId === phase.phaseId);
    const done = asgs.filter((a) => a.status === "complete").length;
    return {
      phaseId: phase.phaseId,
      title: phase.title,
      order: phase.order,
      assignments: asgs,
      progress: asgs.length ? done / asgs.length : 0,
      status: !asgs.length ? "pending"
        : done === asgs.length ? "complete"
        : asgs.some((a) => a.status === "running") ? "running"
        : asgs.some((a) => a.status === "blocked" || a.status === "paused") ? "blocked"
        : "ready",
    };
  });
}
