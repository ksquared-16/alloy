/**
 * Vacilando — Compiled Mission contract + durable store.
 *
 * Mission Brief (human intent) → Mission Compiler → Compiled Mission
 * → Director (execution). Director consumes this contract, not the raw brief.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "compiled-missions");

export const COMPILED_MISSION_SCHEMA = "vacilando.compiled_mission.v1";
export const COMPILATION_REPORT_SCHEMA = "vacilando.compilation_report.v1";
export const MISSION_COMPILER_VERSION = "vacilando.mission_compiler.brief.v1";

const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

function fileFor(missionId) {
  return join(DIR, `${missionId}.json`);
}

export function getCompiledMission(missionId) {
  if (!missionId) return null;
  try {
    return JSON.parse(readFileSync(fileFor(missionId), "utf8"));
  } catch {
    return null;
  }
}

export function listCompiledMissions({ limit = 100 } = {}) {
  ensureDir();
  return readdirSync(DIR)
    .filter((n) => n.endsWith(".json"))
    .map((n) => {
      try { return JSON.parse(readFileSync(join(DIR, n), "utf8")); } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.compiled_at || "").localeCompare(String(a.compiled_at || "")))
    .slice(0, limit);
}

export function saveCompiledMission(compiled) {
  if (!compiled?.missionId) throw new Error("compiled_mission_requires_mission_id");
  ensureDir();
  const path = fileFor(compiled.missionId);
  writeFileSync(path, JSON.stringify(compiled, null, 2));
  // Also persist report as sibling evidence copy
  if (compiled.report) {
    const reportPath = join(DIR, `${compiled.missionId}.report.json`);
    writeFileSync(reportPath, JSON.stringify(compiled.report, null, 2));
  }
  return compiled;
}

export function newCompiledMissionId() {
  return "cmp_" + createHash("sha256").update(`${Date.now()}:${randomBytes(8).toString("hex")}`).digest("hex").slice(0, 16);
}

/** Empty shell used by the compiler before fill. */
export function emptyCompiledMission({ missionId, brief, nowMs } = {}) {
  return {
    schema_version: COMPILED_MISSION_SCHEMA,
    compiledMissionId: newCompiledMissionId(),
    missionId,
    briefVersion: brief?.version ?? null,
    briefContentHash: brief?.contentHash ?? null,
    title: "",
    objective: "",
    scope: { included: [], excluded: [] },
    exclusions: [],
    deliverables: [],
    deliverableDependencies: [],
    acceptanceCriteria: [],
    evidenceRequirements: [],
    workerDisciplines: [],
    executionPhases: [],
    expectedDecisions: [],
    knownAmbiguities: [],
    referencedAcceptedArtifacts: [],
    compilationWarnings: [],
    compilationErrors: [],
    compilationConfidence: 0,
    status: "draft",
    readyToExecute: false,
    report: null,
    compiler_version: MISSION_COMPILER_VERSION,
    compiled_at: iso(nowMs),
    compiled_by: "mission_compiler",
  };
}

export function buildCompilationReport(compiled, {
  inputs = {},
  compilerDecisions = [],
  nowMs,
} = {}) {
  const reused = (compiled.referencedAcceptedArtifacts || []).filter((a) => a.status === "reused");
  const toExecute = (compiled.deliverables || []).filter((d) => d.status === "to_execute");
  return {
    schema_version: COMPILATION_REPORT_SCHEMA,
    compiledMissionId: compiled.compiledMissionId,
    missionId: compiled.missionId,
    compiled_at: iso(nowMs),
    compiler_version: compiled.compiler_version || MISSION_COMPILER_VERSION,
    inputs: {
      briefVersion: compiled.briefVersion,
      briefContentHash: compiled.briefContentHash,
      acceptedArtifactRoots: inputs.acceptedArtifactRoots || [],
      templates: inputs.templates || ["access_identity_discovery_v1"],
      platformCapabilities: inputs.platformCapabilities || ["mission_control", "claude_execution", "decisions", "evidence"],
      ...inputs,
    },
    accepted_artifacts_reused: reused.map((a) => ({
      path: a.path,
      title: a.title,
      covers: a.coversDeliverableIds || [],
    })),
    new_work_identified: toExecute.map((d) => ({
      id: d.id,
      title: d.title,
      phaseId: d.phaseId || null,
    })),
    warnings: compiled.compilationWarnings || [],
    conflicts: (compiled.compilationErrors || []).concat(
      (compiled.knownAmbiguities || []).filter((a) => a.severity === "conflict"),
    ),
    compiler_decisions: compilerDecisions,
    execution_summary: {
      phaseCount: (compiled.executionPhases || []).length,
      deliverableCount: (compiled.deliverables || []).length,
      reuseCount: reused.length,
      executeCount: toExecute.length,
      readyToExecute: compiled.readyToExecute === true,
      status: compiled.status,
    },
    compilation_confidence: compiled.compilationConfidence,
  };
}

export function compiledMissionReady(compiled) {
  if (!compiled) return false;
  if (compiled.readyToExecute !== true) return false;
  if ((compiled.compilationErrors || []).length > 0) return false;
  if (compiled.status === "blocked" || compiled.status === "needs_decision") return false;
  return (compiled.executionPhases || []).length > 0
    || (compiled.deliverables || []).some((d) => d.status === "to_execute");
}
