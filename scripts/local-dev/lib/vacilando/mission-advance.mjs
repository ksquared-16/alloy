/**
 * Vacilando — Advance mission stage (discovery → implementation) in-place.
 *
 * Same mission ID, continuous timeline. Does not close the mission.
 * Creates the next ready implementation assignments from an accepted plan.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { getMission, updateMission } from "./commands/missions.mjs";
import { getBrief } from "./mission-brief.mjs";
import { appendTimelineEvent } from "./timeline.mjs";
import { listAssignments, createAssignmentsFromCompiled } from "./worker-assignment.mjs";
import { getCompiledMission, saveCompiledMission, newCompiledMissionId } from "./compiled-mission.mjs";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

/** Known discovery → implementation handoff packages. */
const IMPLEMENTATION_PLAN_CANDIDATES = [
  "docs/platform/planning/vacilando-os/qa/access-identity-v2/03-implementation-qa-sequence.md",
  "docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md",
];

function isAlloyRepoRoot(dir) {
  // Prefer real Alloy checkouts. scripts/local-dev has a stub docs/ tree that
  // must not win over the worktree root where product plans actually live.
  return existsSync(join(dir, "web", "package.json"))
    && existsSync(join(dir, "docs", "platform", "planning"));
}

function findRepoRoot() {
  const fromEnv = process.env.VACILANDO_CHECKOUT || process.env.ALLOY_WORKTREE;
  if (fromEnv) {
    const root = String(fromEnv).replace(/\/scripts\/local-dev\/?$/, "");
    if (isAlloyRepoRoot(root)) return root;
  }
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (isAlloyRepoRoot(dir)) return dir;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: two levels up from scripts/local-dev
  const guess = join(process.cwd(), "..", "..");
  return isAlloyRepoRoot(guess) ? guess : process.cwd();
}

export function resolveImplementationPlan(missionId) {
  const root = findRepoRoot();
  const mission = getMission(missionId);
  const custom = mission?.implementation_plan_path;
  const paths = custom ? [custom, ...IMPLEMENTATION_PLAN_CANDIDATES] : IMPLEMENTATION_PLAN_CANDIDATES;
  for (const rel of paths) {
    const abs = join(root, rel);
    if (existsSync(abs)) return { relative: rel, absolute: abs, root };
  }
  return null;
}

/** Access & Identity first waves from 03-implementation-qa-sequence. */
function accessIdentityImplementationPhases(planRelative) {
  return [
    {
      phaseId: "impl_w0",
      order: 1,
      kind: "implement",
      title: "Wave 0 — Live authority census",
      objective:
        "Run Wave 0 (W-0) from the accepted Access & Identity implementation plan: five read-only SELECTs against the deployed database that produce a JSON evidence file. Change nothing in product code, schema, or UI. Record results under the mission evidence gallery and a durable path next to the plan.",
      dependencies: [],
      requiredOutputs: [
        planRelative,
        "docs/platform/planning/vacilando-os/qa/access-identity-v2/wave0-authority-census.json",
      ],
      acceptanceCriteriaIds: ["AC_W0"],
    },
    {
      phaseId: "impl_w1",
      order: 2,
      kind: "implement",
      title: "Wave 1 — Fail-closed quick wins (W-1…W-3)",
      objective:
        "Implement Wave 1 workstreams W-1 (analytics route gates), W-2 (self-elevation ban), and W-3 (unsavable grid row repair) per the accepted implementation plan. No Wave 2 lockout-class changes. Prove each with the plan's QA exit criteria and attach evidence.",
      dependencies: ["impl_w0"],
      requiredOutputs: [
        planRelative,
        "web/tests/access/analyticsRouteGates.test.ts",
      ],
      acceptanceCriteriaIds: ["AC_W1"],
    },
    {
      phaseId: "impl_w1b",
      order: 3,
      kind: "implement",
      title: "Wave 1 — Service-client principal check (W-4)",
      objective:
        "Implement W-4 from the accepted plan: build-time check that service-role routes resolve a principal (or sit on a reviewed allow-list). Do not remediate the full sweep (that is later). Record baseline exception count as evidence.",
      dependencies: ["impl_w1"],
      requiredOutputs: [planRelative],
      acceptanceCriteriaIds: ["AC_W1B"],
    },
  ];
}

function implementationPhasesFor(planRelative) {
  if (/access-identity/i.test(planRelative || "")) {
    return accessIdentityImplementationPhases(planRelative);
  }
  return [
    {
      phaseId: "impl_slice_1",
      order: 1,
      kind: "implement",
      title: "Implementation slice 1",
      objective:
        `Begin implementation using the accepted plan at ${planRelative}. Deliver the first bounded slice with evidence. Do not expand scope beyond what the plan schedules first.`,
      dependencies: [],
      requiredOutputs: [planRelative],
      acceptanceCriteriaIds: ["AC_IMPL_1"],
    },
  ];
}

function markDiscoveryAssignments(missionId, { nowMs } = {}) {
  const path = join(RUNTIME_ROOT, "vacilando", "assignments", `${missionId}.json`);
  if (!existsSync(path)) return [];
  const store = JSON.parse(readFileSync(path, "utf8"));
  const marked = [];
  for (const a of store.assignments || []) {
    if (String(a.phaseId || "").startsWith("impl_")) continue;
    if (a.status === "complete" || a.stage === "discovery") {
      a.stage = "discovery";
      a.stage_closed_at = a.stage_closed_at || iso(nowMs);
      a.updated_at = iso(nowMs);
      marked.push(a.assignmentId);
    }
  }
  writeFileSync(path, JSON.stringify(store, null, 2));
  return marked;
}

function alreadyHasImplementationAssignments(missionId) {
  return listAssignments(missionId).some((a) =>
    a.stage === "implementation" || String(a.phaseId || "").startsWith("impl_"));
}

/**
 * Advance the same mission from discovery review into implementation.
 */
export function advanceMissionToImplementation(missionId, {
  actor = "operator",
  response = null,
  nowMs,
} = {}) {
  if (!missionId) return { ok: false, error: "missing_mission_id" };
  const mission = getMission(missionId);
  const brief = getBrief(missionId);
  if (!mission && !brief) return { ok: false, error: "mission_not_found" };

  if (mission?.stage === "implementation" && alreadyHasImplementationAssignments(missionId)) {
    return {
      ok: false,
      error: "already_advanced",
      detail: "This mission is already in implementation with open phases.",
      mission: getMission(missionId),
    };
  }

  const plan = resolveImplementationPlan(missionId);
  if (!plan) {
    return {
      ok: false,
      error: "implementation_plan_not_found",
      detail: "No implementation sequence doc found for this mission. Add 03-implementation-qa-sequence.md or set implementation_plan_path.",
    };
  }

  const phases = implementationPhasesFor(plan.relative);
  const priorCompiled = getCompiledMission(missionId);
  const compiled = {
    ...(priorCompiled || {}),
    schema_version: "vacilando.compiled_mission.v1",
    compiledMissionId: newCompiledMissionId(),
    missionId,
    briefVersion: brief?.version ?? priorCompiled?.briefVersion ?? null,
    briefContentHash: brief?.contentHash ?? priorCompiled?.briefContentHash ?? null,
    title: brief?.title || mission?.title || missionId,
    objective:
      "Continue this mission into implementation using the accepted discovery package and sequenced plan. Discovery outputs remain authoritative context — do not re-derive them.",
    exclusions: [
      ...(priorCompiled?.exclusions || []),
      "Do not re-open closed discovery deliverables unless a defect is proven",
    ],
    executionPhases: phases,
    deliverables: phases.map((p, i) => ({
      id: `del_impl_${i + 1}`,
      title: p.title,
      expectedPath: (p.requiredOutputs || [])[0] || null,
      status: "to_execute",
      phaseId: p.phaseId,
    })),
    acceptanceCriteria: phases.flatMap((p) =>
      (p.acceptanceCriteriaIds || []).map((id) => ({
        id,
        statement: `${p.title} meets exit criteria in ${plan.relative}`,
        evidenceType: "document",
      }))),
    stage: "implementation",
    implementationPlanPath: plan.relative,
    readyToExecute: true,
    compilationConfidence: 80,
    compiled_at: iso(nowMs),
    advanced_from: "discovery",
  };

  saveCompiledMission(compiled);
  markDiscoveryAssignments(missionId, { nowMs });

  // Avoid duplicate impl phases if a prior partial advance left some.
  const existing = new Set(listAssignments(missionId).map((a) => a.phaseId));
  const phasesToCreate = {
    ...compiled,
    executionPhases: phases.filter((p) => !existing.has(p.phaseId)),
  };
  const created = phasesToCreate.executionPhases.length
    ? createAssignmentsFromCompiled(missionId, phasesToCreate, {
      actor,
      nowMs,
      brief,
      slot: mission?.worker_slot || 6,
    })
    : [];

  // Tag new assignments as implementation stage.
  try {
    const path = join(RUNTIME_ROOT, "vacilando", "assignments", `${missionId}.json`);
    const store = JSON.parse(readFileSync(path, "utf8"));
    for (const a of store.assignments || []) {
      if (created.some((c) => c.assignmentId === a.assignmentId) || String(a.phaseId || "").startsWith("impl_")) {
        a.stage = "implementation";
        a.evidenceProfile = a.phaseId === "impl_w0" ? "execution_v1" : "code_only";
        a.completionContract = {
          ...(a.completionContract || {}),
          evidenceProfile: a.phaseId === "impl_w0" ? "execution_v1" : "code_only",
        };
      }
    }
    writeFileSync(path, JSON.stringify(store, null, 2));
  } catch { /* best effort */ }

  const at = iso(nowMs);
  updateMission(missionId, {
    status: "executing",
    kickoff_status: "executing",
    stage: "implementation",
    discovery_accepted_at: at,
    discovery_accepted_by: actor,
    advanced_to_implementation_at: at,
    implementation_plan_path: plan.relative,
    compiled_mission_id: compiled.compiledMissionId,
    completion_certified_at: null,
    completion_certified_by: null,
    completion_response: null,
    completion_rejected_at: null,
    completion_rejected_by: null,
    completion_rejection_reason: null,
    outcome_parked_at: null,
    pending_question: null,
    pending_approval: null,
    completed_at: null,
  }, { nowMs });

  try {
    appendTimelineEvent(missionId, {
      type: "phase_started",
      headline: "You advanced this mission to implementation",
      summary: response
        || `Discovery accepted. Implementation continues on the same mission using ${plan.relative}. First ready phase: ${created[0]?.title || phases[0]?.title}.`,
      visibility: "summary",
      actor,
      detail: {
        plan: plan.relative,
        createdAssignmentIds: created.map((a) => a.assignmentId),
        phases: phases.map((p) => p.phaseId),
      },
      nowMs,
    });
  } catch { /* optional */ }

  return {
    ok: true,
    mission: getMission(missionId),
    plan: plan.relative,
    compiled,
    createdAssignments: created,
    nextAction: created.some((a) => a.status === "ready")
      ? { kind: "dispatch_ready", label: "Start work", missionId }
      : { kind: "open_mission", label: "Open mission", href: `missions/${missionId}`, missionId },
  };
}

export function canAdvanceToImplementation(missionId) {
  const mission = getMission(missionId);
  if (mission?.stage === "implementation" && alreadyHasImplementationAssignments(missionId)) {
    return { ok: false, reason: "already_advanced" };
  }
  const plan = resolveImplementationPlan(missionId);
  if (!plan) return { ok: false, reason: "implementation_plan_not_found" };
  return { ok: true, plan: plan.relative };
}
