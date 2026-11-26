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
import { listDecisions } from "./decisions.mjs";
import { autoAcceptDeliverableForChain } from "./deliverable-review.mjs";

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
    {
      phaseId: "impl_w2",
      order: 4,
      kind: "implement",
      title: "Wave 2 — Membership+profile atomic create (W-5)",
      objective:
        "Implement W-5 from the accepted Access & Identity plan (Wave 2 — scope invariant): membership creation and profile creation MUST be one transaction (RPC or equivalent). Route every membership-creating path through it so Q4 (memberships without profiles) cannot grow. Audit other membership writers before implementing. Do not flip absent-scope deny (W-7) or remove department bypass (W-8) in this assignment. Prove with Tier B handler wiring + Tier C integration test web/tests/access/membershipProfileInvariant.integration.test.ts (guarded with describe.skipIf(!hasEnv)).",
      dependencies: ["impl_w1b"],
      requiredOutputs: [
        planRelative,
        "web/tests/access/membershipProfileInvariant.integration.test.ts",
      ],
      acceptanceCriteriaIds: ["AC_W5"],
    },
    {
      phaseId: "impl_w2b",
      order: 5,
      kind: "implement",
      title: "Wave 2 — Backfill membership profiles (W-6)",
      objective:
        "Implement W-6 from the accepted Access & Identity plan (Wave 2 — scope invariant): one additive migration creating a profile row for every membership lacking one, at the scope the resolver currently infers (both dimensions all) so behaviour is unchanged by construction. Preflight: re-run W-0 Q4 immediately before apply; count of rows to create must equal that census; zero memberships left uncovered afterwards; no existing profile row modified. Do not flip absent-scope deny (W-7) or remove department bypass (W-8) in this assignment. Attach Tier A post-apply anti-join evidence.",
      dependencies: ["impl_w2"],
      requiredOutputs: [
        planRelative,
        "docs/platform/planning/vacilando-os/qa/access-identity-v2/wave0-authority-census.json",
      ],
      acceptanceCriteriaIds: ["AC_W6"],
    },
    {
      phaseId: "impl_w2c",
      order: 6,
      kind: "implement",
      title: "Wave 2 — Absent scope denies (W-7)",
      objective:
        "Implement W-7 from the accepted Access & Identity plan: flip resolveAdminAccessCore missing-profile fallback from both scopes all to deny, and delete the legacy-transition comment. Follow the dual-read ritual after W-6 seeds. Do not remove the department-scope bypass (W-8) in this assignment.",
      dependencies: ["impl_w2b"],
      requiredOutputs: [planRelative],
      acceptanceCriteriaIds: ["AC_W7"],
    },
    {
      phaseId: "impl_w2d",
      order: 7,
      kind: "implement",
      title: "Wave 2 — Department scope bypass removal (W-8)",
      objective:
        "Implement W-8 from the accepted Access & Identity plan: remove portalAdminBypassesDepartmentScope so department scope is enforced for admin/ops. Announce impact for the one W-0 Q6 principal. Do not expand into Wave 3 catalog work.",
      dependencies: ["impl_w2c"],
      requiredOutputs: [planRelative],
      acceptanceCriteriaIds: ["AC_W8"],
    },
    {
      phaseId: "impl_w3",
      order: 8,
      kind: "implement",
      title: "Wave 3 — Consolidate to one catalog (W-9)",
      objective:
        "Implement W-9 from the accepted Access & Identity plan (Wave 3 — one catalog, one vocabulary): consolidate permission_keys / permissions / permission_definitions to one catalog per the plan. Migration-backed. Do not start W-10–W-12 in this assignment.",
      dependencies: ["impl_w2d"],
      requiredOutputs: [planRelative],
      acceptanceCriteriaIds: ["AC_W9"],
    },
    {
      phaseId: "impl_w3b",
      order: 9,
      kind: "implement",
      title: "Wave 3 — Grid becomes a projection (W-10)",
      objective:
        "Implement W-10 from the accepted plan: the permission grid becomes a projection of the single catalog (closes C5 structurally). Do not start W-11/W-12 here.",
      dependencies: ["impl_w3"],
      requiredOutputs: [planRelative],
      acceptanceCriteriaIds: ["AC_W10"],
    },
    {
      phaseId: "impl_w3c",
      order: 10,
      kind: "implement",
      title: "Wave 3 — One vocabulary (W-11)",
      objective:
        "Implement W-11 from the accepted plan: one permission vocabulary (closes C4). Do not start W-12 here.",
      dependencies: ["impl_w3b"],
      requiredOutputs: [planRelative],
      acceptanceCriteriaIds: ["AC_W11"],
    },
    {
      phaseId: "impl_w3d",
      order: 11,
      kind: "implement",
      title: "Wave 3 — Seeds enumerate grants (W-12)",
      objective:
        "Implement W-12 from the accepted plan: seeds enumerate their grants (closes G5). End of Wave 3.",
      dependencies: ["impl_w3c"],
      requiredOutputs: [planRelative],
      acceptanceCriteriaIds: ["AC_W12"],
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

/**
 * Parse operator text for wave / workstream intent (e.g. "start wave 2", "open W-5").
 * @returns {{ wave: number|null, workstream: number|null }|null}
 */
export function parseWaveStartIntent(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  // Long promotion / certification / beyond-register briefs mention W-n historically.
  // Those are not "open wave N" commands.
  const beyondRegisterBrief = raw.length > 420
    || /\bdirector objective\b/i.test(raw)
    || /\b(promotion|certification matrix|plan of record|remaining-plan|product-certified)\b/i.test(lower);
  if (beyondRegisterBrief) {
    // Allow only an explicit short command line at the very start.
    const firstLine = raw.split(/\n/)[0].trim();
    if (firstLine.length > 80 || !/^(open|start|begin|launch|dispatch)\b/i.test(firstLine)) {
      return null;
    }
  }

  const wantsStart = /\b(open|start|begin|launch|dispatch|run|kick\s*off)\b/i.test(lower)
    || /\bnext\s+wave\b/i.test(lower)
    || /^(conti?nue|conintue|proceed)\b/i.test(lower)
    || /\b(conti?nue|conintue|proceed)\s+(with\s+)?(the\s+)?(next\s+)?wave\b/i.test(lower);
  // Bare "continue" inside a long sentence about completed W-0…W-12 is not a wave open.
  if (!wantsStart && !/\b(open|start|begin|launch)\b.{0,40}\b(wave|w-?\d+)\b/i.test(lower)) {
    return null;
  }
  // Short "continue" / "proceed" alone → next incomplete phase.
  if (raw.length < 120 && /^(conti?nue|conintue|proceed)\.?$/i.test(raw)) {
    return { wave: "next", workstream: null };
  }
  if (!/\b(wave|w-?\d+|implementation|next)\b/i.test(lower)) return null;

  // Prefer an explicit wave/workstream that is being opened — skip "completed W-0…W-12".
  let wave = null;
  let workstream = null;
  const openWave = lower.match(/\b(?:open|start|begin|launch|dispatch|run)\b[^.\n]{0,40}\bwave\s*(\d+)\b/i)
    || lower.match(/\bwave\s*(\d+)\b[^.\n]{0,20}\b(?:open|start|begin|launch)\b/i);
  if (openWave) wave = Number(openWave[1]);
  else {
    const waveMatch = lower.match(/\bwave\s*(\d+)\b/i);
    // Ignore wave numbers that only appear in "completed W-0…W-12" / "through W-12" history.
    if (waveMatch && !/\b(completed|done|finished|through|from the completed)\b[^.\n]{0,40}\bwave\s*\d+/i.test(lower)) {
      wave = Number(waveMatch[1]);
    }
  }

  const openWs = lower.match(/\b(?:open|start|begin|launch|dispatch|run)\b[^.\n]{0,40}\bw-?(\d+)\b/i)
    || lower.match(/\bw-?(\d+)\b[^.\n]{0,20}\b(?:open|start|begin|launch)\b/i);
  if (openWs) workstream = Number(openWs[1]);
  else {
    const wMatch = lower.match(/\bw-?(\d+)\b/i);
    if (wMatch && !/\b(completed|done|finished|through|from the completed)\b[^.\n]{0,60}\bw-?\d+/i.test(lower)) {
      workstream = Number(wMatch[1]);
    }
  }

  // Map workstream → wave when only W-n is given (Identity plan).
  if (wave == null && workstream != null) {
    if (workstream === 0) wave = 0;
    else if (workstream >= 1 && workstream <= 4) wave = 1;
    else if (workstream >= 5 && workstream <= 8) wave = 2;
    else if (workstream >= 9 && workstream <= 12) wave = 3;
    else if (workstream >= 13 && workstream <= 15) wave = 4;
    else if (workstream >= 16) wave = 5;
  }

  if (wave == null && workstream == null && /\bnext\s+wave\b/i.test(lower)) {
    return { wave: "next", workstream: null };
  }
  if (wave == null && workstream == null && /^(conti?nue|conintue|proceed)\b/i.test(lower) && raw.length < 120) {
    return { wave: "next", workstream: null };
  }
  if (wave == null && workstream == null) return null;
  return { wave, workstream };
}

/** True when the operator brief is beyond the W-0…W-12 register (promotion / certify / remaining plan). */
export function isBeyondRegisterObjective(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (raw.length < 180 && !/\bdirector objective\b/i.test(raw)) return false;
  return /\b(promotion|certif|plan of record|remaining-plan|remaining plan|waves?\s*4|waves?\s*5|beyond|deployed|shared environment|product-certified|reconcile)\b/i.test(lower)
    || /\bdirector objective\b/i.test(raw);
}

function phaseIdForWaveIntent({ wave, workstream } = {}) {
  if (workstream === 12) return "impl_w3d";
  if (workstream === 11) return "impl_w3c";
  if (workstream === 10) return "impl_w3b";
  if (workstream === 9) return "impl_w3";
  if (workstream === 8) return "impl_w2d";
  if (workstream === 7) return "impl_w2c";
  if (workstream === 6) return "impl_w2b";
  if (workstream === 5) return "impl_w2";
  if (workstream === 4) return "impl_w1b";
  if (workstream === 3 || workstream === 2 || workstream === 1) return "impl_w1";
  if (workstream === 0) return "impl_w0";
  if (wave === 0) return "impl_w0";
  if (wave === 1) return "impl_w1";
  // Wave 2+ or explicit "next" → first incomplete phase in the register.
  if (wave === 2 || wave === 3 || wave === "next" || wave > 3) return "next";
  return null;
}

/** Read-only: next incomplete implementation phase from the plan register. */
export function peekNextImplementationPhase(missionId) {
  const plan = resolveImplementationPlan(missionId);
  if (!plan) return null;
  const phases = implementationPhasesFor(plan.relative);
  const byPhase = new Map((listAssignments(missionId) || []).map((a) => [a.phaseId, a]));
  const next = phases.find((p) => {
    const a = byPhase.get(p.phaseId);
    return !a || !["complete", "accepted"].includes(String(a.status || "").toLowerCase());
  });
  if (!next) return null;
  return {
    phaseId: next.phaseId,
    title: next.title,
    plan: plan.relative,
    alreadyStatus: byPhase.get(next.phaseId)?.status || null,
  };
}

export function shouldAutoContinueImplementation(missionId) {
  if (process.env.VACILANDO_AUTO_CONTINUE === "0") {
    return { ok: false, reason: "disabled" };
  }
  const mission = getMission(missionId);
  if (!mission && !getBrief(missionId)) return { ok: false, reason: "mission_not_found" };
  // Parked only blocks silent auto-continue — explicit Start next / open_next_wave still works
  // via ensureNextImplementationWave (clears parked). Soft card may still offer Start Wave N.
  if (mission?.outcome_parked_at && !peekNextImplementationPhase(missionId)) {
    return { ok: false, reason: "parked" };
  }
  if (mission?.stage && mission.stage !== "implementation") {
    if (!alreadyHasImplementationAssignments(missionId)) {
      return { ok: false, reason: "not_implementation" };
    }
  }
  const open = listDecisions(missionId, { status: "open" }) || [];
  if (open.length) {
    return {
      ok: false,
      reason: "open_decision",
      decisionId: open[0].decisionId || open[0].id,
      detail: open[0].title || "Open decision requires an answer",
    };
  }
  const blocked = (listAssignments(missionId) || []).some((a) => a.status === "blocked");
  if (blocked) return { ok: false, reason: "blocked" };
  return { ok: true };
}

/**
 * Auto-accept the just-finished wave (when safe) and open+dispatch the next phase.
 */
export function continueImplementationChain(missionId, {
  fromAssignmentId = null,
  actor = "director",
  nowMs,
} = {}) {
  const gate = shouldAutoContinueImplementation(missionId);
  if (!gate.ok) return { ok: false, ...gate };

  let accepted = null;
  if (fromAssignmentId) {
    accepted = autoAcceptDeliverableForChain(missionId, fromAssignmentId, { actor, nowMs });
    if (accepted && accepted.ok === false) {
      return {
        ok: false,
        reason: accepted.error || "cannot_auto_accept",
        detail: accepted.detail || null,
        accepted,
      };
    }
  }

  const opened = ensureNextImplementationWave(missionId, {
    actor,
    waveHint: { wave: "next" },
    nowMs,
    response: "Auto-continue after accepted implementation wave",
  });

  if (!opened?.ok) {
    if (opened?.error === "no_remaining_phases" || opened?.error === "phase_already_complete") {
      try {
        appendTimelineEvent(missionId, {
          type: "progress",
          headline: "Implementation plan register is complete",
          summary: "No further wave is queued. Review the outcome or certify mission completion when ready.",
          visibility: "summary",
          actor,
          nowMs,
        });
      } catch { /* */ }
      return { ok: true, done: true, reason: "plan_exhausted", accepted, opened };
    }
    return { ok: false, reason: opened?.error || "open_failed", detail: opened?.detail, accepted, opened };
  }

  import("./assignment-dispatch.mjs").then(({ scheduleDispatchAfterKickoff }) => {
    scheduleDispatchAfterKickoff(missionId, { actor: "director" });
  }).catch(() => {});

  try {
    appendTimelineEvent(missionId, {
      type: "phase_started",
      headline: `Continuing — ${opened.readyAssignment?.title || opened.phase?.title || "next wave"}`,
      summary: "Director auto-continued the approved implementation chain.",
      visibility: "summary",
      actor,
      nowMs,
    });
  } catch { /* */ }

  return {
    ok: true,
    continued: true,
    accepted,
    opened,
    nextAction: opened.nextAction || null,
  };
}

const _chainContinueScheduled = new Set();

export function scheduleImplementationChainContinue(missionId, opts = {}) {
  const key = `${missionId}:${opts.fromAssignmentId || ""}`;
  if (_chainContinueScheduled.has(key)) {
    return { ok: true, scheduled: false, deduped: true, missionId };
  }
  _chainContinueScheduled.add(key);
  // Allow a later retry if this attempt fails to continue (e.g. review not written yet).
  const run = () => {
    try {
      const out = continueImplementationChain(missionId, opts);
      if (out?.ok && (out.continued || out.done)) return;
      // Retry once shortly if review was not ready yet.
      if (out?.reason === "cannot_auto_accept" || out?.reason === "no_open_review" || out?.accepted?.skipped) {
        setTimeout(() => {
          _chainContinueScheduled.delete(key);
          continueImplementationChain(missionId, opts);
        }, 200);
      }
    } catch (e) {
      _chainContinueScheduled.delete(key);
      try {
        appendTimelineEvent(missionId, {
          type: "blocker",
          headline: "Auto-continue failed",
          summary: String(e?.message || e),
          visibility: "summary",
          actor: opts.actor || "director",
        });
      } catch { /* */ }
    }
  };
  // Let createDeliverableReview finish writing before we auto-accept it.
  setTimeout(run, opts.delayMs ?? 50);
  return { ok: true, scheduled: true, missionId };
}

/**
 * Open the next implementation assignment from the accepted plan (e.g. Wave 2 / W-5)
 * when discovery→implementation already advanced but later waves were never queued.
 */
export function ensureNextImplementationWave(missionId, {
  actor = "operator",
  waveHint = null,
  nowMs,
  response = null,
} = {}) {
  if (!missionId) return { ok: false, error: "missing_mission_id" };
  const mission = getMission(missionId);
  const brief = getBrief(missionId);
  if (!mission && !brief) return { ok: false, error: "mission_not_found" };

  const plan = resolveImplementationPlan(missionId);
  if (!plan) {
    return {
      ok: false,
      error: "implementation_plan_not_found",
      detail: "No implementation sequence doc found for this mission.",
    };
  }

  const phases = implementationPhasesFor(plan.relative);
  const existing = listAssignments(missionId);
  const byPhase = new Map(existing.map((a) => [a.phaseId, a]));

  let targetPhaseId = phaseIdForWaveIntent(waveHint || {});
  if (targetPhaseId === "next" || !targetPhaseId) {
    const next = phases.find((p) => {
      const a = byPhase.get(p.phaseId);
      return !a || !["complete", "accepted"].includes(String(a.status || "").toLowerCase());
    });
    targetPhaseId = next?.phaseId || null;
  } else {
    // Asked for a completed phase → roll forward to the next incomplete one.
    const asked = byPhase.get(targetPhaseId);
    if (asked && ["complete", "accepted"].includes(String(asked.status || "").toLowerCase())) {
      const idx = phases.findIndex((p) => p.phaseId === targetPhaseId);
      const roll = phases.slice(idx + 1).find((p) => {
        const a = byPhase.get(p.phaseId);
        return !a || !["complete", "accepted"].includes(String(a.status || "").toLowerCase());
      });
      targetPhaseId = roll?.phaseId || null;
    }
  }
  if (!targetPhaseId) {
    return { ok: false, error: "no_remaining_phases", detail: "All known implementation phases are complete." };
  }

  const target = phases.find((p) => p.phaseId === targetPhaseId);
  if (!target) {
    return {
      ok: false,
      error: "phase_not_in_register",
      detail: `Phase ${targetPhaseId} is not in the implementation register yet.`,
    };
  }

  const already = byPhase.get(targetPhaseId);
  if (already) {
    // Promote waiting → ready when prerequisites are already complete.
    if (already.status === "waiting") {
      const deps = already.dependencies || [];
      const all = listAssignments(missionId);
      const depsDone = deps.every((id) => {
        const d = all.find((x) => x.assignmentId === id);
        return d && ["complete", "accepted"].includes(String(d.status || "").toLowerCase());
      });
      if (depsDone || !deps.length) {
        try {
          const path = join(RUNTIME_ROOT, "vacilando", "assignments", `${missionId}.json`);
          const store = JSON.parse(readFileSync(path, "utf8"));
          const row = (store.assignments || []).find((a) => a.assignmentId === already.assignmentId);
          if (row) {
            row.status = "ready";
            row.updated_at = iso(nowMs);
            writeFileSync(path, JSON.stringify(store, null, 2));
            already.status = "ready";
          }
        } catch { /* best effort */ }
      }
    }
    if (["ready", "running", "verification", "paused", "waiting"].includes(already.status)) {
      updateMission(missionId, {
        status: "executing",
        kickoff_status: "executing",
        stage: "implementation",
        implementation_plan_path: plan.relative,
        outcome_parked_at: null,
      }, { nowMs });
      return {
        ok: true,
        reused: true,
        createdAssignments: [],
        phase: target,
        readyAssignment: already,
        plan: plan.relative,
        nextAction: already.status === "ready"
          ? { kind: "dispatch_ready", label: `Start: ${already.title}`, missionId }
          : { kind: "open_mission", label: "Open mission", href: `missions/${missionId}`, missionId },
      };
    }
    if (["complete", "accepted"].includes(String(already.status || "").toLowerCase())) {
      return {
        ok: false,
        error: "phase_already_complete",
        detail: `${already.title} is already complete.`,
        assignment: already,
      };
    }
  }

  // Create any missing prerequisites + the target (deps resolve via existing phaseIds).
  const toCreate = [];
  const needed = new Set([targetPhaseId]);
  for (const p of phases) {
    if (!needed.has(p.phaseId)) continue;
    for (const dep of p.dependencies || []) needed.add(dep);
  }
  for (const p of phases) {
    if (!needed.has(p.phaseId)) continue;
    const a = byPhase.get(p.phaseId);
    if (!a) toCreate.push(p);
  }

  if (!toCreate.length && already) {
    return { ok: true, reused: true, createdAssignments: [], readyAssignment: already, plan: plan.relative };
  }

  const priorCompiled = getCompiledMission(missionId);
  const compiled = {
    ...(priorCompiled || {}),
    schema_version: "vacilando.compiled_mission.v1",
    compiledMissionId: priorCompiled?.compiledMissionId || newCompiledMissionId(),
    missionId,
    briefVersion: brief?.version ?? priorCompiled?.briefVersion ?? null,
    briefContentHash: brief?.contentHash ?? priorCompiled?.briefContentHash ?? null,
    title: brief?.title || mission?.title || missionId,
    objective: priorCompiled?.objective
      || "Continue implementation using the accepted discovery package and sequenced plan.",
    exclusions: priorCompiled?.exclusions || [],
    executionPhases: toCreate,
    stage: "implementation",
    implementationPlanPath: plan.relative,
    readyToExecute: true,
    compiled_at: iso(nowMs),
  };

  const created = createAssignmentsFromCompiled(missionId, compiled, {
    actor,
    nowMs,
    brief,
    slot: mission?.worker_slot || 6,
  });

  try {
    const path = join(RUNTIME_ROOT, "vacilando", "assignments", `${missionId}.json`);
    const store = JSON.parse(readFileSync(path, "utf8"));
    for (const a of store.assignments || []) {
      if (created.some((c) => c.assignmentId === a.assignmentId) || a.phaseId === targetPhaseId) {
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

  const ready = listAssignments(missionId).find((a) =>
    a.phaseId === targetPhaseId && a.status === "ready")
    || created.find((a) => a.status === "ready")
    || null;

  updateMission(missionId, {
    status: "executing",
    kickoff_status: "executing",
    stage: "implementation",
    implementation_plan_path: plan.relative,
    outcome_parked_at: null,
    pending_question: null,
    pending_approval: null,
  }, { nowMs });

  try {
    appendTimelineEvent(missionId, {
      type: "phase_started",
      headline: `Opened ${target.title}`,
      summary: response
        || `Queued ${target.title} from ${plan.relative}.`,
      visibility: "summary",
      actor,
      detail: {
        plan: plan.relative,
        phaseId: targetPhaseId,
        createdAssignmentIds: created.map((a) => a.assignmentId),
      },
      nowMs,
    });
  } catch { /* optional */ }

  return {
    ok: true,
    reused: false,
    plan: plan.relative,
    phase: target,
    createdAssignments: created,
    readyAssignment: ready,
    nextAction: ready
      ? { kind: "dispatch_ready", label: `Start: ${ready.title}`, missionId }
      : { kind: "open_mission", label: "Open mission", href: `missions/${missionId}`, missionId },
  };
}
