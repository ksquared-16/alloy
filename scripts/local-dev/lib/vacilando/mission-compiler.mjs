/**
 * Vacilando — Mission Compiler V1 (Brief → Compiled Mission).
 *
 * Responsibilities:
 *   Mission Brief (human) → Mission Compiler → Compiled Mission → Director → Workers
 *
 * Director executes compiled missions. It must not discover contradictory
 * instructions after execution has begun — the compiler surfaces conflicts first.
 *
 * Legacy capability → Mission Package compilation lives in
 * `mission-package-compiler.mjs` (re-exported below for compatibility).
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { getBrief } from "./mission-brief.mjs";
import { getMission, updateMission } from "./commands/missions.mjs";
import { appendTimelineEvent } from "./timeline.mjs";
import { createDecision } from "./decisions.mjs";
import {
  emptyCompiledMission,
  saveCompiledMission,
  getCompiledMission,
  buildCompilationReport,
  compiledMissionReady,
  MISSION_COMPILER_VERSION,
} from "./compiled-mission.mjs";

export {
  compile,
  compile as compileCapabilityPackage,
  isOperatorDirected,
  proposalPath,
  PROPOSAL_SECTIONS,
  COMPILER_VERSION,
} from "./mission-package-compiler.mjs";

export {
  getCompiledMission,
  saveCompiledMission,
  compiledMissionReady,
  MISSION_COMPILER_VERSION,
} from "./compiled-mission.mjs";

const REPO_ROOT = process.env.ALLOY_REPO_ROOT?.trim()
  || process.env.VACILANDO_CHECKOUT?.trim()
  || null;

function worktreeRoot() {
  return process.env.ALLOY_WORKTREE?.trim()
    || process.env.VACILANDO_CHECKOUT?.trim()
    || process.cwd();
}

function resolveRepoPath(rel) {
  // When ALLOY_WORKTREE is set (tests / isolated runs), do not fall through to
  // the real checkout — that would falsely mark host artifacts as reused.
  const isolated = Boolean(process.env.ALLOY_WORKTREE?.trim());
  const roots = isolated
    ? [process.env.ALLOY_WORKTREE.trim()]
    : [
      worktreeRoot(),
      REPO_ROOT,
      join(worktreeRoot(), "scripts/local-dev"),
    ].filter(Boolean);
  for (const root of roots) {
    const p = join(root, rel);
    if (existsSync(p)) return { absolute: p, relative: rel };
  }
  if (!isolated && existsSync(rel)) return { absolute: rel, relative: rel };
  return null;
}

/** Canonical Access & Identity discovery deliverable catalog. */
export const ACCESS_IDENTITY_DELIVERABLE_CATALOG = [
  {
    id: "d1_existing_state",
    title: "Existing-state inventory",
    patterns: [/existing[- ]state/i, /inventory/i],
    artifacts: [
      "docs/platform/planning/access-identity-v2/01-existing-state-inventory.md",
      "docs/platform/planning/vacilando-os/qa/access-identity-v2/01-existing-state-inventory.md",
      "docs/platform/planning/access-identity-v2/authority-path-inventory.md",
      "docs/platform/planning/vacilando-os/qa/access-identity-v2/authority-path-inventory.md",
    ],
  },
  {
    id: "d2_surface_catalog",
    title: "Surface and capability access catalog",
    patterns: [/surface/i, /capability access catalog/i, /command.?action enforcement/i],
    artifacts: [
      "docs/platform/planning/vacilando-os/qa/access-identity-v2/05-command-enforcement-census.md",
    ],
    partialOk: true,
  },
  {
    id: "d3_identity_model",
    title: "Person ↔ user ↔ role ↔ scope model",
    patterns: [/person/i, /role.*scope/i, /canonical access/i],
    artifacts: [
      "docs/platform/planning/access-identity-v2/02-canonical-access-identity-model.md",
      "docs/platform/planning/vacilando-os/qa/access-identity-v2/02-canonical-access-identity-model.md",
    ],
  },
  {
    id: "d4_authentication",
    title: "Authentication model",
    patterns: [/authentication model/i, /\bMFA\b/, /passwordless/i, /SSO/i],
    artifacts: [
      "docs/platform/planning/vacilando-os/qa/access-identity-v2/04-authentication-model.md",
    ],
  },
  {
    id: "d5_effective_access",
    title: "Effective-access resolution model",
    patterns: [/effective[- ]access/i, /resolution model/i],
    artifacts: [
      "docs/platform/planning/access-identity-v2/02-canonical-access-identity-model.md",
      "docs/platform/planning/vacilando-os/qa/access-identity-v2/02-canonical-access-identity-model.md",
    ],
  },
  {
    id: "d6_product_ia",
    title: "Product IA and principal flows",
    patterns: [/product IA/i, /principal flows/i, /operator flows/i],
    artifacts: [
      "docs/platform/planning/vacilando-os/qa/access-identity-v2/06-product-ia-and-flows.md",
    ],
  },
  {
    id: "d7_security_matrix",
    title: "Security threat and enforcement matrix",
    patterns: [/threat/i, /enforcement matrix/i, /security matrix/i],
    artifacts: [
      "docs/platform/planning/access-identity-v2/01-existing-state-inventory.md",
      "docs/platform/planning/vacilando-os/qa/access-identity-v2/01-existing-state-inventory.md",
    ],
    partialOk: true,
  },
  {
    id: "d8_gap_analysis",
    title: "Gap analysis",
    patterns: [/gap analysis/i, /divergence/i],
    artifacts: [
      "docs/platform/planning/access-identity-v2/01-existing-state-inventory.md",
      "docs/platform/planning/access-identity-v2/02-canonical-access-identity-model.md",
    ],
  },
  {
    id: "d9_decisions",
    title: "Decisions requiring approval",
    patterns: [/decisions requiring/i, /product decisions/i],
    artifacts: [
      "docs/platform/planning/access-identity-v2/02-canonical-access-identity-model.md",
    ],
  },
  {
    id: "d10_sequence",
    title: "Sequenced implementation / QA plan",
    patterns: [/sequenced/i, /implementation.?qa/i, /delivery plan/i],
    artifacts: [
      "docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md",
      "docs/platform/planning/vacilando-os/qa/access-identity-v2/03-implementation-qa-sequence.md",
    ],
  },
  {
    id: "d11_acceptance_rubric",
    title: "Director acceptance rubric",
    patterns: [/acceptance rubric/i, /director acceptance/i],
    artifacts: [
      "docs/platform/planning/vacilando-os/qa/access-identity-v2/07-director-acceptance-rubric.md",
    ],
  },
  {
    id: "d12_qa_evidence",
    title: "QA and evidence plan",
    patterns: [/QA and evidence/i, /evidence plan/i],
    artifacts: [
      "docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md",
    ],
  },
];

function artifactPresent(relPaths) {
  for (const rel of relPaths) {
    const hit = resolveRepoPath(rel);
    if (hit) {
      try {
        const st = statSync(hit.absolute);
        if (st.size > 200) {
          return { path: hit.relative, bytes: st.size };
        }
      } catch { /* */ }
    }
  }
  return null;
}

function isAccessIdentityBrief(brief) {
  const blob = `${brief?.title || ""} ${brief?.objective || ""}`.toLowerCase();
  return /access\s*&\s*identity|access and identity|access\s*&\s*roles|identity.*auth|roles?\s*&\s*access/.test(blob);
}

function forbidsImplementation(brief) {
  const blob = `${brief?.objective || ""} ${(brief?.constraints || []).map((c) => c.text || c).join(" ")}`;
  return /do not (materially )?implement|should not begin implementation|not ask .* to build|discover and specify/i.test(blob);
}

function planLooksLikeImplement(brief) {
  const plan = brief?.plan || [];
  return plan.some((p) =>
    /implement/i.test(p.kind || "")
    || /implement/i.test(p.title || "")
    || ((p.requiredOutputs || []).length === 0 && /implement/i.test(JSON.stringify(p))));
}

function planIsTruncatedShell(brief) {
  const plan = brief?.plan || [];
  if (plan.length !== 1) return false;
  const p = plan[0];
  const outputsEmpty = !(p.requiredOutputs || []).length;
  const titleIsEllipsis = /…|\.\.\./.test(p.title || "") || (p.title || "").length < 40;
  const objIsTitle = (p.objective || "") === (p.title || "") || (p.objective || "").length < 80;
  return outputsEmpty && (titleIsEllipsis || objIsTitle);
}

function detectCircularDeps(phases) {
  const byId = new Map(phases.map((p) => [p.phaseId, p]));
  const visiting = new Set();
  const seen = new Set();
  const cycles = [];
  function walk(id, stack) {
    if (visiting.has(id)) {
      cycles.push([...stack, id]);
      return;
    }
    if (seen.has(id)) return;
    visiting.add(id);
    const p = byId.get(id);
    for (const dep of p?.dependencies || []) walk(dep, [...stack, id]);
    visiting.delete(id);
    seen.add(id);
  }
  for (const p of phases) walk(p.phaseId, []);
  return cycles;
}

function synthesizeAccessIdentityPhases(deliverables) {
  const execute = deliverables.filter((d) => d.status === "to_execute");
  const reused = deliverables.filter((d) => d.status === "reused");
  const phases = [];
  if (execute.length === 0) {
    return [{
      phaseId: "p_reuse_only",
      order: 1,
      title: "Confirm reused specification corpus",
      objective: "No new discovery deliverables remain — confirm accepted artifacts cover the Mission Brief.",
      deliverableIds: reused.map((d) => d.id),
      dependencies: [],
      kind: "validation",
    }];
  }
  // Group remaining into focused phases (max ~2 deliverables each)
  let order = 1;
  for (let i = 0; i < execute.length; i += 1) {
    const d = execute[i];
    phases.push({
      phaseId: `p${order}`,
      order,
      title: d.title,
      objective: `Produce ${d.title} as a durable specification artifact. Reuse accepted corpus as inputs — do not re-derive covered outputs.`,
      deliverableIds: [d.id],
      dependencies: order > 1 ? [`p${order - 1}`] : [],
      kind: "discovery",
      requiredOutputs: d.expectedPath ? [d.expectedPath] : [`docs/platform/planning/vacilando-os/qa/access-identity-v2/${d.id}.md`],
      acceptanceCriteriaIds: [d.acceptanceCriterionId].filter(Boolean),
    });
    order += 1;
  }
  return phases;
}

/**
 * Compile a Mission Brief into a Compiled Mission (+ Compilation Report).
 * Never starts workers. May create a Compilation Decision when operator intent is required.
 */
export function compileMissionBrief(missionId, {
  brief = null,
  actor = "mission_compiler",
  nowMs,
  createCompilationDecision = true,
} = {}) {
  const b = brief || getBrief(missionId);
  if (!b) throw new Error(`brief_not_found:${missionId}`);
  const mid = b.missionId || missionId;
  const compiled = emptyCompiledMission({ missionId: mid, brief: b, nowMs });
  const compilerDecisions = [];
  const warnings = [];
  const errors = [];
  const ambiguities = [];

  const objective = String(b.objective || "").trim();
  let title = String(b.title || "").trim();
  if (!title || /…|\.\.\./.test(title) || title.length < 8) {
    title = /access|identity|roles/i.test(objective)
      ? "Access & Identity V2 — Discovery & Specification"
      : (objective.split(/[.!\n]/)[0].trim().slice(0, 72) || "Untitled mission");
    compilerDecisions.push({
      decision: "normalized_title",
      reason: "Brief title was truncated or missing — recovered a display title from intent",
      value: title,
    });
  }
  compiled.title = title;
  compiled.objective = objective || title;

  const noImplement = forbidsImplementation(b);
  const implementPlan = planLooksLikeImplement(b) || (/kind spe?c.*implement/i.test(JSON.stringify(b.plan || [])));
  const truncated = planIsTruncatedShell(b);
  const ai = isAccessIdentityBrief(b);

  compiled.scope.included = ai
    ? ["Discovery and specification for Access & Identity V2", "Reuse of accepted planning artifacts"]
    : ["Work described in the Mission Brief objective and plan"];
  compiled.exclusions = [];
  if (noImplement) {
    compiled.exclusions.push("Material product implementation (code/schema shipping)");
    compiled.scope.excluded.push("Implementation beyond disposable investigation tooling");
  }

  // ——— Artifact reuse (Access & Identity catalog or brief sources) ———
  const deliverables = [];
  const reusedArtifacts = [];
  if (ai) {
    for (const cat of ACCESS_IDENTITY_DELIVERABLE_CATALOG) {
      const hit = artifactPresent(cat.artifacts);
      const acId = `AC_${cat.id}`;
      if (hit) {
        deliverables.push({
          id: cat.id,
          title: cat.title,
          status: "reused",
          dependsOn: [],
          acceptanceCriteriaIds: [acId],
          evidenceRequirements: ["document"],
          discipline: "Platform / Access",
          expectedPath: hit.path,
          phaseId: null,
        });
        reusedArtifacts.push({
          path: hit.path,
          title: cat.title,
          coversDeliverableIds: [cat.id],
          status: "reused",
          bytes: hit.bytes,
        });
      } else {
        deliverables.push({
          id: cat.id,
          title: cat.title,
          status: "to_execute",
          dependsOn: [],
          acceptanceCriteriaIds: [acId],
          evidenceRequirements: ["document"],
          discipline: "Platform / Access",
          expectedPath: cat.artifacts[0],
          acceptanceCriterionId: acId,
          phaseId: null,
        });
      }
    }
    compilerDecisions.push({
      decision: "catalog_access_identity_v1",
      reason: "Brief matches Access & Identity — applied discovery deliverable catalog and scanned accepted artifacts",
      reused: reusedArtifacts.length,
      remaining: deliverables.filter((d) => d.status === "to_execute").length,
    });
  } else {
    // Generic: map brief plan outputs; mark sourceMaterials as reusable refs
    for (const src of b.sourceMaterials || []) {
      const ref = src.ref || src.path || src.title;
      if (!ref) continue;
      const hit = artifactPresent([ref]) || (existsSync(ref) ? { path: ref, bytes: 0 } : null);
      if (hit) {
        reusedArtifacts.push({
          path: hit.path || ref,
          title: src.title || ref,
          coversDeliverableIds: [],
          status: "reused",
        });
      }
    }
    let i = 1;
    for (const phase of (b.plan || []).slice().sort((a, c) => a.order - c.order)) {
      const outs = phase.requiredOutputs || [];
      if (!outs.length) {
        deliverables.push({
          id: `d_${phase.phaseId || i}`,
          title: phase.title || `Phase ${i} deliverable`,
          status: "to_execute",
          dependsOn: phase.dependencies || [],
          acceptanceCriteriaIds: phase.acceptanceCriteriaIds || [],
          evidenceRequirements: ["document"],
          discipline: "General engineering",
          phaseId: phase.phaseId,
        });
      } else {
        for (const out of outs) {
          const hit = artifactPresent([out]);
          deliverables.push({
            id: `d_${i++}`,
            title: out,
            status: hit ? "reused" : "to_execute",
            dependsOn: phase.dependencies || [],
            acceptanceCriteriaIds: phase.acceptanceCriteriaIds || [],
            evidenceRequirements: ["document"],
            discipline: "General engineering",
            expectedPath: out,
            phaseId: phase.phaseId,
          });
          if (hit) {
            reusedArtifacts.push({
              path: hit.path,
              title: out,
              coversDeliverableIds: [`d_${i - 1}`],
              status: "reused",
            });
          }
        }
      }
    }
  }

  compiled.deliverables = deliverables;
  compiled.referencedAcceptedArtifacts = reusedArtifacts;
  compiled.deliverableDependencies = deliverables.flatMap((d) =>
    (d.dependsOn || []).map((dep) => ({ from: dep, to: d.id })));

  // ——— Conflict: implement vs specify ———
  let needsCompilationDecision = false;
  if (noImplement && (implementPlan || truncated)) {
    const remaining = deliverables.filter((d) => d.status === "to_execute");
    warnings.push({
      code: "conflicting_implement_vs_specify",
      severity: "conflict",
      message: "Specification work already exists and conflicts with the requested execution plan.",
      recommendation: remaining.length
        ? "Compile only the remaining discovery work."
        : "Reuse the accepted corpus — do not start an implementation phase.",
    });
    ambiguities.push({
      code: "conflicting_instructions",
      severity: "conflict",
      message: "Mission Brief forbids implementation, but the ingested plan looked like implementation (or was a truncated shell).",
    });
    compilerDecisions.push({
      decision: "resolve_conflict_by_scoping_to_gaps",
      reason: "Compiler prefers reuse + remaining discovery over contradictory implementation",
      remainingDeliverables: remaining.map((d) => d.id),
    });
    // Auto-resolve: do not ask operator if we can compile a coherent discovery mission
    needsCompilationDecision = remaining.length === 0 && reusedArtifacts.length === 0;
  }

  if (truncated) {
    warnings.push({
      code: "truncated_brief_plan",
      message: "Ingested plan was a single truncated phase with empty outputs — compiler recovered structure from objective + accepted artifacts.",
    });
  }

  // ——— Acceptance criteria ———
  const ac = [];
  if (ai) {
    for (const d of deliverables.filter((x) => x.status === "to_execute")) {
      ac.push({
        id: d.acceptanceCriterionId || `AC_${d.id}`,
        statement: `${d.title} exists as a durable, reviewable specification with cited evidence.`,
        evidenceType: "document",
        deliverableId: d.id,
      });
    }
    if (!ac.length && reusedArtifacts.length) {
      ac.push({
        id: "AC_reuse_confirmed",
        statement: "Operator confirms accepted Access & Identity artifacts satisfy the Mission Brief without new discovery.",
        evidenceType: "document",
      });
    }
  } else {
    for (const c of b.acceptanceCriteria || []) {
      const statement = c.statement || String(c);
      if (/is complete with evidence$/i.test(statement) && statement.length < 80) {
        errors.push({
          code: "unfalsifiable_acceptance",
          message: `Acceptance criterion ${c.id || "?"} is tautological / unfalsifiable`,
        });
      } else {
        ac.push({
          id: c.id,
          statement,
          evidenceType: c.evidenceType || "document",
        });
      }
    }
  }
  if (!ac.length && deliverables.some((d) => d.status === "to_execute")) {
    errors.push({
      code: "missing_acceptance_criteria",
      message: "No falsifiable acceptance criteria could be compiled for remaining work",
    });
  }
  compiled.acceptanceCriteria = ac;
  compiled.evidenceRequirements = ac.map((c) => ({
    acceptanceCriterionId: c.id,
    evidenceType: c.evidenceType || "document",
  }));

  // ——— Phases ———
  let phases;
  if (ai || truncated || (noImplement && implementPlan)) {
    phases = synthesizeAccessIdentityPhases(deliverables);
  } else {
    phases = (b.plan || []).slice().sort((a, c) => a.order - c.order).map((p) => ({
      phaseId: p.phaseId,
      order: p.order,
      title: p.title,
      objective: p.objective || objective,
      deliverableIds: deliverables.filter((d) => d.phaseId === p.phaseId).map((d) => d.id),
      dependencies: p.dependencies || [],
      kind: p.kind || "execution",
      requiredOutputs: p.requiredOutputs || [],
      acceptanceCriteriaIds: p.acceptanceCriteriaIds || [],
    }));
  }
  const cycles = detectCircularDeps(phases);
  if (cycles.length) {
    errors.push({
      code: "circular_dependencies",
      message: `Circular phase dependencies detected: ${cycles.map((c) => c.join("→")).join("; ")}`,
    });
  }
  compiled.executionPhases = phases;

  // Wire deliverables to phases
  for (const phase of phases) {
    for (const id of phase.deliverableIds || []) {
      const d = deliverables.find((x) => x.id === id);
      if (d) d.phaseId = phase.phaseId;
    }
  }

  compiled.workerDisciplines = ai
    ? ["Platform / Access", "Security", "Operator experience", "Runtime / Workflow"]
    : ["General engineering"];

  if (!objective || objective.length < 24) {
    errors.push({ code: "ambiguous_objective", message: "Mission objective is missing or too incomplete to compile" });
  }

  // Confidence
  let confidence = 55;
  confidence += Math.min(25, reusedArtifacts.length * 3);
  confidence += deliverables.some((d) => d.status === "to_execute") ? 10 : 5;
  if (warnings.length) confidence -= 8;
  if (errors.length) confidence -= 25;
  if (ai && !truncated) confidence += 5;
  if (ai && truncated) confidence += 10; // recovered well
  compiled.compilationConfidence = Math.max(5, Math.min(98, confidence));
  compiled.compilationWarnings = warnings;
  compiled.compilationErrors = errors;
  compiled.knownAmbiguities = ambiguities;
  compiled.expectedDecisions = needsCompilationDecision
    ? [{
        kind: "compilation",
        title: "Mission cannot be compiled without your intent",
        prompt: warnings[0]?.recommendation || "Choose how to compile remaining work",
      }]
    : [];

  if (errors.length) {
    compiled.status = "blocked";
    compiled.readyToExecute = false;
  } else if (needsCompilationDecision) {
    compiled.status = "needs_decision";
    compiled.readyToExecute = false;
  } else {
    compiled.status = "ready";
    compiled.readyToExecute = phases.length > 0;
  }

  compiled.report = buildCompilationReport(compiled, {
    inputs: {
      acceptedArtifactRoots: [
        "docs/platform/planning/access-identity-v2",
        "docs/platform/planning/vacilando-os/qa/access-identity-v2",
      ],
      briefTitle: b.title,
      forbidsImplementation: noImplement,
      planTruncated: truncated,
    },
    compilerDecisions,
    nowMs,
  });

  saveCompiledMission(compiled);

  try {
    updateMission(mid, {
      compiled_mission_id: compiled.compiledMissionId,
      compilation_status: compiled.status,
      compilation_confidence: compiled.compilationConfidence,
      ready_to_execute: compiled.readyToExecute,
    }, { nowMs });
  } catch { /* mission row optional */ }

  // Timeline — compilation lifecycle
  const reusedN = reusedArtifacts.length;
  const execN = deliverables.filter((d) => d.status === "to_execute").length;
  appendTimelineEvent(mid, {
    type: "mission_compiled",
    headline: "Mission compiled",
    summary: `${reusedN} accepted artifact${reusedN === 1 ? "" : "s"} reused · ${execN} deliverable${execN === 1 ? "" : "s"} identified`,
    visibility: "summary",
    actor,
    detail: {
      compiledMissionId: compiled.compiledMissionId,
      confidence: compiled.compilationConfidence,
      status: compiled.status,
      warnings: warnings.length,
      errors: errors.length,
    },
    nowMs,
  });
  if (reusedN) {
    appendTimelineEvent(mid, {
      type: "compilation_reuse",
      headline: `${reusedN} accepted artifact${reusedN === 1 ? "" : "s"} reused`,
      summary: reusedArtifacts.slice(0, 5).map((a) => a.title).join("; "),
      visibility: "summary",
      actor,
      nowMs,
    });
  }
  if (warnings.some((w) => w.code === "conflicting_implement_vs_specify")) {
    appendTimelineEvent(mid, {
      type: "compilation_conflict",
      headline: "One conflict detected",
      summary: "Specification work already exists and conflicts with the requested execution plan — compiler scoped to remaining discovery.",
      visibility: "summary",
      actor,
      nowMs,
    });
  }
  if (compiled.readyToExecute) {
    appendTimelineEvent(mid, {
      type: "compilation_ready",
      headline: "Mission ready for approval",
      summary: `Compilation confidence ${compiled.compilationConfidence}% · ${phases.length} execution phase${phases.length === 1 ? "" : "s"}`,
      visibility: "summary",
      actor,
      nowMs,
    });
  } else if (compiled.status === "blocked") {
    appendTimelineEvent(mid, {
      type: "compilation_blocked",
      headline: "Mission cannot be compiled",
      summary: (errors[0] && errors[0].message) || "Compilation errors must be resolved before execution",
      visibility: "summary",
      actor,
      nowMs,
    });
  }

  let decision = null;
  if (needsCompilationDecision && createCompilationDecision) {
    decision = createDecision({
      missionId: mid,
      title: "Mission cannot be compiled — conflicting intent",
      situation: "The Mission Brief and the ingested execution plan disagree, and the compiler could not safely choose a path.",
      whyThisMatters: "Starting workers now would recreate the contradictory-instruction failure during execution.",
      discovery: "Raised by Mission Compiler before any worker was created",
      options: [
        {
          optionId: "scope_gaps",
          label: "Compile only remaining discovery work (recommended)",
          description: "Reuse accepted artifacts; execute only uncovered specification gaps.",
        },
        {
          optionId: "full_rediscovery",
          label: "Recompile full discovery from the brief",
          description: "Ignore reuse and regenerate every deliverable.",
        },
        {
          optionId: "implement",
          label: "Allow implementation despite the brief",
          description: "Treat implementation as in-scope — overrides do-not-implement language.",
        },
      ],
      recommendation: "scope_gaps",
      recommendationReason: "Matches Mission Compiler default: reuse accepted work and finish gaps only.",
      actor: "mission_compiler",
      nowMs,
    });
    appendTimelineEvent(mid, {
      type: "compilation_decision",
      headline: "Compilation decision required before execution",
      summary: "Director will not create workers until you answer the compilation decision.",
      visibility: "summary",
      actor,
      decisionId: decision.decision?.decisionId,
      nowMs,
    });
  }

  return {
    ok: true,
    compiled,
    report: compiled.report,
    readyToExecute: compiled.readyToExecute,
    decision: decision?.decision || null,
    compiler_version: MISSION_COMPILER_VERSION,
  };
}

/** Plan phases for assignment creation — from Compiled Mission only. */
export function executionPlanFromCompiled(compiled) {
  if (!compiled) return [];
  return (compiled.executionPhases || []).map((p) => ({
    phaseId: p.phaseId,
    order: p.order,
    title: p.title,
    objective: p.objective,
    requiredOutputs: p.requiredOutputs
      || (compiled.deliverables || [])
        .filter((d) => (p.deliverableIds || []).includes(d.id) && d.status === "to_execute")
        .map((d) => d.expectedPath || d.title),
    dependencies: p.dependencies || [],
    acceptanceCriteriaIds: p.acceptanceCriteriaIds
      || (compiled.acceptanceCriteria || [])
        .filter((c) => (p.deliverableIds || []).includes(c.deliverableId))
        .map((c) => c.id),
    kind: p.kind || "discovery",
  }));
}
