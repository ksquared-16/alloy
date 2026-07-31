/**
 * Vacilando — Mission Brief authority (Director Execution System V2 §4–5).
 *
 * The user-owned plan is immutable by default. Director may operationalize it
 * but must not silently mutate plan content. Revisions create a new version
 * with a new contentHash; prior versions remain under versions/.
 *
 * Persistence: ~/.local/state/alloy-dev/vacilando/mission-briefs/
 *   <missionId>.json              — current head
 *   versions/<missionId>-vN.json  — immutable snapshots
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "mission-briefs");
const VERSIONS = join(DIR, "versions");

const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

function ensureDirs() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  if (!existsSync(VERSIONS)) mkdirSync(VERSIONS, { recursive: true });
}

function headPath(missionId) {
  return join(DIR, `${missionId}.json`);
}

function versionPath(missionId, version) {
  return join(VERSIONS, `${missionId}-v${version}.json`);
}

/** Stable stringify for hashing (sorted object keys; arrays preserve order). */
export function canonicalStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(",")}}`;
}

/**
 * Hash plan + acceptance criteria + constraints + sources only (§4.2 / Phase 1).
 * Metadata (version, createdAt, contentHash itself) is excluded so identical
 * bodies produce a stable hash across versions when content is unchanged.
 */
export function computeContentHash(body) {
  const material = {
    title: body.title ?? "",
    objective: body.objective ?? "",
    context: body.context ?? null,
    plan: body.plan ?? [],
    acceptanceCriteria: body.acceptanceCriteria ?? [],
    constraints: body.constraints ?? [],
    sourceMaterials: body.sourceMaterials ?? [],
    knownDecisions: body.knownDecisions ?? null,
    outOfScope: body.outOfScope ?? null,
    executionPreferences: body.executionPreferences ?? null,
  };
  return createHash("sha256").update(canonicalStringify(material)).digest("hex").slice(0, 32);
}

function normalizePhase(p, index) {
  const order = Number.isFinite(p?.order) ? p.order : index + 1;
  const phaseId = String(p?.phaseId || p?.id || `phase_${order}`).trim();
  return {
    phaseId,
    order,
    title: String(p?.title || "").trim() || `Phase ${order}`,
    objective: String(p?.objective || "").trim(),
    requiredOutputs: Array.isArray(p?.requiredOutputs) ? p.requiredOutputs.map(String) : [],
    dependencies: Array.isArray(p?.dependencies) ? p.dependencies.map(String) : [],
    acceptanceCriteriaIds: Array.isArray(p?.acceptanceCriteriaIds) ? p.acceptanceCriteriaIds.map(String) : [],
    implementationNotes: p?.implementationNotes != null ? String(p.implementationNotes) : undefined,
    approvalGate: ["none", "director", "user"].includes(p?.approvalGate) ? p.approvalGate : "none",
  };
}

function normalizeCriterion(c, index) {
  const id = String(c?.id || c?.criterionId || `AC${index + 1}`).trim();
  return {
    id,
    statement: String(c?.statement || c?.text || c?.title || "").trim(),
    evidenceType: c?.evidenceType || null,
    phaseIds: Array.isArray(c?.phaseIds) ? c.phaseIds.map(String) : [],
  };
}

function normalizeConstraint(c, index) {
  if (typeof c === "string") return { id: `C${index + 1}`, text: c };
  return {
    id: String(c?.id || `C${index + 1}`).trim(),
    text: String(c?.text || c?.statement || "").trim(),
    kind: c?.kind || null,
  };
}

function normalizeSource(s, index) {
  if (typeof s === "string") return { id: `S${index + 1}`, ref: s, kind: "text" };
  return {
    id: String(s?.id || `S${index + 1}`).trim(),
    ref: String(s?.ref || s?.path || s?.url || s?.title || "").trim(),
    kind: s?.kind || "document",
    title: s?.title != null ? String(s.title) : undefined,
  };
}

function normalizeBody(input = {}) {
  const plan = (Array.isArray(input.plan) ? input.plan : []).map(normalizePhase);
  const acceptanceCriteria = (Array.isArray(input.acceptanceCriteria) ? input.acceptanceCriteria : []).map(normalizeCriterion);
  const constraints = (Array.isArray(input.constraints) ? input.constraints : []).map(normalizeConstraint);
  const sourceMaterials = (Array.isArray(input.sourceMaterials) ? input.sourceMaterials : []).map(normalizeSource);
  return {
    title: String(input.title || "").trim() || "(untitled mission)",
    objective: String(input.objective || "").trim(),
    context: input.context != null ? String(input.context) : undefined,
    plan,
    acceptanceCriteria,
    constraints,
    sourceMaterials,
    knownDecisions: Array.isArray(input.knownDecisions) ? input.knownDecisions : undefined,
    outOfScope: Array.isArray(input.outOfScope) ? input.outOfScope.map(String) : undefined,
    executionPreferences: input.executionPreferences && typeof input.executionPreferences === "object"
      ? { ...input.executionPreferences }
      : undefined,
  };
}

function writeImmutableVersion(brief) {
  ensureDirs();
  const path = versionPath(brief.missionId, brief.version);
  if (existsSync(path)) {
    throw new Error(`brief_version_exists:${brief.missionId}:v${brief.version}`);
  }
  writeFileSync(path, JSON.stringify(brief, null, 2));
}

function writeHead(brief) {
  ensureDirs();
  writeFileSync(headPath(brief.missionId), JSON.stringify(brief, null, 2));
  return brief;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** Create a new Mission Brief (version 1). missionId optional — generated if omitted. */
export function createBrief(input = {}, { actor = "operator", nowMs } = {}) {
  const now = nowMs ?? Date.now();
  const body = normalizeBody(input);
  const missionId = String(input.missionId || input.mission_id || "").trim()
    || (`msn_${randomBytes(9).toString("hex")}`);
  if (existsSync(headPath(missionId))) {
    throw new Error(`brief_exists:${missionId}`);
  }
  const contentHash = computeContentHash(body);
  const brief = {
    schema_version: "vacilando.mission_brief.v1",
    missionId,
    ...body,
    createdBy: String(input.createdBy || actor),
    createdAt: iso(now),
    version: 1,
    contentHash,
    changeSummary: "Initial Mission Brief",
    approvalSource: input.approvalSource || "operator_create",
  };
  writeImmutableVersion(brief);
  return writeHead(brief);
}

/** Current head brief, or null. */
export function getBrief(missionId) {
  if (!missionId) return null;
  return readJson(headPath(missionId));
}

/** Immutable snapshot at a specific version, or null. */
export function getBriefVersion(missionId, version) {
  if (!missionId || !Number.isFinite(Number(version))) return null;
  return readJson(versionPath(missionId, Number(version)));
}

/** List stored immutable versions (newest first). */
export function listBriefVersions(missionId) {
  if (!missionId || !existsSync(VERSIONS)) return [];
  const prefix = `${missionId}-v`;
  return readdirSync(VERSIONS)
    .filter((n) => n.startsWith(prefix) && n.endsWith(".json"))
    .map((n) => {
      const m = n.match(/-v(\d+)\.json$/);
      return m ? Number(m[1]) : null;
    })
    .filter((v) => v != null)
    .sort((a, b) => b - a)
    .map((version) => getBriefVersion(missionId, version))
    .filter(Boolean);
}

/**
 * Propose a revision — creates a NEW immutable version. Never mutates prior
 * version files. Requires an explicit changeSummary (operator decision / edit).
 */
export function proposeBriefRevision(missionId, patch = {}, { actor = "operator", changeSummary, approvalSource = "operator_edit", nowMs } = {}) {
  const head = getBrief(missionId);
  if (!head) throw new Error(`brief_not_found:${missionId}`);
  const summary = String(changeSummary || patch.changeSummary || "").trim();
  if (!summary) throw new Error("brief_revision_requires_change_summary");

  const merged = normalizeBody({
    ...head,
    ...patch,
    plan: patch.plan !== undefined ? patch.plan : head.plan,
    acceptanceCriteria: patch.acceptanceCriteria !== undefined ? patch.acceptanceCriteria : head.acceptanceCriteria,
    constraints: patch.constraints !== undefined ? patch.constraints : head.constraints,
    sourceMaterials: patch.sourceMaterials !== undefined ? patch.sourceMaterials : head.sourceMaterials,
    knownDecisions: patch.knownDecisions !== undefined ? patch.knownDecisions : head.knownDecisions,
    outOfScope: patch.outOfScope !== undefined ? patch.outOfScope : head.outOfScope,
    executionPreferences: patch.executionPreferences !== undefined ? patch.executionPreferences : head.executionPreferences,
  });

  const now = nowMs ?? Date.now();
  const version = Number(head.version) + 1;
  const contentHash = computeContentHash(merged);
  const brief = {
    schema_version: "vacilando.mission_brief.v1",
    missionId,
    ...merged,
    createdBy: String(actor),
    createdAt: head.createdAt,
    revisedAt: iso(now),
    version,
    contentHash,
    changeSummary: summary,
    approvalSource,
    priorVersion: head.version,
    priorContentHash: head.contentHash,
  };
  writeImmutableVersion(brief);
  return writeHead(brief);
}

/** Refuse in-place mutation of a stored version file (test + safety helper). */
export function assertVersionImmutable(missionId, version) {
  const path = versionPath(missionId, version);
  const before = readFileSync(path, "utf8");
  return {
    path,
    before,
    tryMutate() {
      writeFileSync(path, before); // restore is caller's job — tests compare hash
      return before;
    },
  };
}
