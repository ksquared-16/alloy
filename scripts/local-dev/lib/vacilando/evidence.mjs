/**
 * Vacilando — Evidence + validation foundation (Execution System V2 §9–10).
 *
 * Evidence artifacts, validation runs, AC coverage, completion certification gate.
 * Rejects assignment completion when required evidence is absent.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { appendTimelineEvent } from "./timeline.mjs";
import { getBrief } from "./mission-brief.mjs";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "evidence");

export const EVIDENCE_TYPES = new Set([
  "screenshot", "video", "test", "build", "typecheck", "browser",
  "database", "migration", "diff", "log", "performance", "security", "commit",
]);

export const EVIDENCE_PROFILES = {
  code_only: ["diff", "test", "typecheck", "build", "commit"],
  ui: ["diff", "test", "typecheck", "build", "commit", "screenshot", "browser"],
  migration: ["migration", "database", "test", "diff", "commit", "log"],
  security: ["security", "test", "browser", "log", "diff", "commit"],
  performance: ["performance", "log", "test", "diff", "commit"],
};

const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

function ensureDir(missionId) {
  const d = join(DIR, missionId || "_");
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
}

function galleryPath(missionId) {
  return join(ensureDir(missionId), "gallery.json");
}

function runsPath(missionId) {
  return join(ensureDir(missionId), "validation-runs.jsonl");
}

function readGallery(missionId) {
  try {
    return JSON.parse(readFileSync(galleryPath(missionId), "utf8"));
  } catch {
    return { schema_version: "vacilando.evidence_gallery.v1", mission_id: missionId, artifacts: [] };
  }
}

function writeGallery(g) {
  ensureDir(g.mission_id);
  writeFileSync(galleryPath(g.mission_id), JSON.stringify(g, null, 2));
  return g;
}

export function attachEvidence({
  missionId,
  assignmentId = null,
  type,
  title,
  description = "",
  fileUri = null,
  externalUri = null,
  command = null,
  exitCode = null,
  repositorySha = null,
  branch = null,
  environment = null,
  acceptanceCriteriaIds = [],
  createdBy = "worker",
  verifiedBy = null,
  nowMs,
} = {}) {
  if (!missionId) throw new Error("evidence_requires_mission_id");
  if (!EVIDENCE_TYPES.has(type)) throw new Error(`unknown_evidence_type:${type}`);
  const evidenceId = "ev_" + randomBytes(8).toString("hex");
  const artifact = {
    schema_version: "vacilando.evidence.v1",
    evidenceId,
    assignmentId,
    missionId,
    type,
    title: String(title || type).trim(),
    description: String(description || "").trim(),
    createdAt: iso(nowMs),
    createdBy,
    fileUri,
    externalUri,
    command,
    exitCode,
    repositorySha,
    branch,
    environment,
    acceptanceCriteriaIds: acceptanceCriteriaIds || [],
    verifiedBy,
  };
  const g = readGallery(missionId);
  g.artifacts.push(artifact);
  writeGallery(g);
  appendTimelineEvent(missionId, {
    type: "evidence_added",
    summary: `Evidence added — ${artifact.title}`,
    visibility: artifact.type === "screenshot" ? "summary" : "detail",
    assignmentId,
    evidenceIds: [evidenceId],
    actor: createdBy,
    detail: { type, acceptanceCriteriaIds },
    nowMs,
  });
  return artifact;
}

export function listEvidence(missionId, { assignmentId = null, type = null } = {}) {
  let arts = readGallery(missionId).artifacts || [];
  if (assignmentId) arts = arts.filter((a) => a.assignmentId === assignmentId);
  if (type) arts = arts.filter((a) => a.type === type);
  return arts;
}

export function recordValidationRun({
  missionId,
  assignmentId = null,
  command,
  environment = null,
  exitStatus,
  branch = null,
  commitSha = null,
  profile = null,
  actor = "system",
  nowMs,
} = {}) {
  if (!missionId) throw new Error("validation_requires_mission_id");
  const run = {
    schema_version: "vacilando.validation_run.v1",
    runId: "vr_" + createHash("sha256").update(`${missionId}:${command}:${Date.now()}`).digest("hex").slice(0, 14),
    missionId,
    assignmentId,
    command: String(command || "").trim(),
    environment,
    exitStatus: Number(exitStatus),
    ok: Number(exitStatus) === 0,
    branch,
    commitSha,
    profile,
    at: iso(nowMs),
    actor,
  };
  ensureDir(missionId);
  appendFileSync(runsPath(missionId), JSON.stringify(run) + "\n");
  appendTimelineEvent(missionId, {
    type: "validation",
    summary: `Validation ${run.ok ? "passed" : "failed"} — ${run.command}`,
    visibility: "summary",
    assignmentId,
    actor,
    detail: run,
    nowMs,
  });
  return run;
}

export function listValidationRuns(missionId, { limit = 100 } = {}) {
  try {
    return readFileSync(runsPath(missionId), "utf8").split("\n").filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean)
      .slice(-limit);
  } catch {
    return [];
  }
}

/** Map AC ids → attached evidence (coverage). */
export function acceptanceEvidenceCoverage(missionId, acceptanceCriteria = null) {
  const brief = getBrief(missionId);
  const criteria = acceptanceCriteria || brief?.acceptanceCriteria || [];
  const arts = listEvidence(missionId);
  return criteria.map((c) => {
    const linked = arts.filter((a) => (a.acceptanceCriteriaIds || []).includes(c.id));
    const hasFail = linked.some((a) => a.exitCode != null && a.exitCode !== 0);
    const status = !linked.length ? "missing"
      : hasFail ? "failed"
      : "passed";
    return {
      id: c.id,
      statement: c.statement,
      status,
      evidence: linked,
      evidence_count: linked.length,
    };
  });
}

/**
 * Required evidence types for an assignment profile. Missing → reject completion.
 */
export function missingRequiredEvidence(assignment, artifacts) {
  const profile = assignment?.evidenceProfile || assignment?.completionContract?.evidenceProfile || "code_only";
  const required = assignment?.requiredEvidence?.length
    ? assignment.requiredEvidence.map((r) => (typeof r === "string" ? r : r.type))
    : (EVIDENCE_PROFILES[profile] || EVIDENCE_PROFILES.code_only);
  const have = new Set((artifacts || []).map((a) => a.type));
  return required.filter((t) => !have.has(t));
}

export function canCertifyMission(missionId) {
  const coverage = acceptanceEvidenceCoverage(missionId);
  const incomplete = coverage.filter((c) => c.status !== "passed");
  const runs = listValidationRuns(missionId);
  const failedRuns = runs.filter((r) => !r.ok);
  const ready = incomplete.length === 0 && coverage.length > 0;
  return {
    ready,
    coverage,
    incomplete,
    validation_runs: runs,
    failed_runs: failedRuns,
    directorRecommendation: ready
      ? (failedRuns.length ? "needs_user_review" : "ready_to_merge")
      : "not_ready",
    confidence: ready ? (failedRuns.length ? "medium" : "high") : "low",
  };
}

export function buildMissionCompletionPackage(missionId) {
  const brief = getBrief(missionId);
  const cert = canCertifyMission(missionId);
  return {
    schema_version: "vacilando.mission_completion.v1",
    missionId,
    missionVersion: brief?.version || null,
    resultSummary: cert.ready
      ? "All acceptance criteria have evidence coverage"
      : `${cert.incomplete.length} acceptance criteria incomplete`,
    acceptanceCriteria: cert.coverage,
    evidenceGallery: listEvidence(missionId),
    validationRuns: cert.validation_runs,
    unresolvedRisks: cert.incomplete.map((c) => ({ id: c.id, status: c.status })),
    deferredItems: [],
    directorRecommendation: cert.directorRecommendation,
    confidence: cert.confidence,
  };
}

/** Cross-mission evidence listing for Evidence nav. */
export function listAllEvidenceGalleries() {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((n) => existsSync(join(DIR, n, "gallery.json")))
    .map((missionId) => ({
      mission_id: missionId,
      artifacts: listEvidence(missionId),
      coverage: acceptanceEvidenceCoverage(missionId),
    }));
}
