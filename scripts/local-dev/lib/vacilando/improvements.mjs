/**
 * Vacilando — Continuous Improvement runtime.
 *
 * Operator friction captured during real mission use. Not a bug tracker —
 * structured product feedback that drives future Vacilando evolution.
 *
 * Persistence: ~/.local/state/alloy-dev/vacilando/improvements/
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  rmSync,
  lstatSync,
} from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { appendTimelineEvent } from "./timeline.mjs";
import { getBrief } from "./mission-brief.mjs";
import { getMission, updateMission } from "./commands/missions.mjs";
import { projectMissionRow } from "./director-summary.mjs";
import { listAssignments } from "./worker-assignment.mjs";
import { listDecisions } from "./decisions.mjs";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "improvements");

export const IMPROVEMENT_CATEGORIES = Object.freeze([
  "Communication",
  "Workflow",
  "Navigation",
  "Director",
  "Worker",
  "Decision",
  "Evidence",
  "Performance",
  "UI",
  "Architecture",
  "Other",
]);

export const IMPROVEMENT_STATUSES = Object.freeze([
  "New",
  "Reviewed",
  "Accepted",
  "Planned",
  "Implemented",
  "Rejected",
  "Deferred",
]);

export const IMPROVEMENT_SEVERITIES = Object.freeze(["Low", "Medium", "High", "Blocker"]);

const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

function fileFor(id) {
  return join(DIR, `${id}.json`);
}

/** Infer category from operator text + screen context. */
export function inferImprovementCategory({ title = "", description = "", screen = "", section = "", route = "" } = {}) {
  const blob = `${title} ${description} ${screen} ${section} ${route}`.toLowerCase();
  const rules = [
    ["Decision", /decision|needs me|approve|recommend/],
    ["Director", /director|chief of staff|assessment|ask director|clarif/],
    ["Worker", /worker|claude|cursor|heartbeat|slot|assignment package/],
    ["Evidence", /evidence|screenshot|certif|validation|qa artifact/],
    ["Navigation", /nav|route|tab|breadcrumb|where am i|find|menu/],
    ["Communication", /wording|copy|label|confus|unclear|message|prompt/],
    ["Performance", /slow|lag|freeze|load|spin|timeout/],
    ["Workflow", /kickoff|brief|ready|flow|steps|resume|approve kickoff/],
    ["UI", /layout|spacing|button|dialog|mobile|overflow|scroll|visual/],
    ["Architecture", /schema|runtime|contract|api|persist|ownership/],
  ];
  for (const [cat, re] of rules) {
    if (re.test(blob)) return cat;
  }
  return "Other";
}

function enrichContext({
  missionId = null,
  currentScreen = null,
  currentSection = null,
  currentRoute = null,
  workerId = null,
  decisionId = null,
  screenshotRef = null,
} = {}) {
  const brief = missionId ? getBrief(missionId) : null;
  const mission = missionId ? getMission(missionId) : null;
  const row = missionId ? projectMissionRow(missionId, mission) : null;
  const openDecision = missionId
    ? (listDecisions(missionId, { status: "open" })[0] || null)
    : null;
  const assignments = missionId ? listAssignments(missionId) : [];

  return {
    missionId: missionId || null,
    missionTitle: brief?.title || mission?.title || row?.title || null,
    currentPhase: row?.current_phase?.title || null,
    currentScreen: currentScreen || null,
    currentSection: currentSection || null,
    currentRoute: currentRoute || null,
    workerId: workerId || null,
    decisionId: decisionId || openDecision?.decisionId || null,
    screenshotRef: screenshotRef || null,
    directorContext: {
      status: row?.status_label || row?.status || null,
      directorState: row?.director_state || null,
      openDecisionTitle: openDecision?.title || null,
      activeDeliverables: assignments
        .filter((a) => ["running", "paused", "ready", "waiting"].includes(a.status))
        .map((a) => a.title),
      confidenceHint: null,
    },
  };
}

/**
 * Capture an operator observation. Technical context is Director-enriched.
 */
export function captureImprovement({
  title,
  description,
  expectedBehavior = null,
  severity = "Medium",
  category = null,
  missionId = null,
  currentScreen = null,
  currentSection = null,
  currentRoute = null,
  workerId = null,
  decisionId = null,
  screenshotRef = null,
  createdBy = "operator",
  nowMs,
} = {}) {
  const cleanTitle = String(title || "").trim();
  const cleanDesc = String(description || "").trim();
  if (!cleanTitle) throw new Error("improvement_requires_title");
  if (!cleanDesc) throw new Error("improvement_requires_description");

  const sev = IMPROVEMENT_SEVERITIES.includes(severity) ? severity : "Medium";
  const ctx = enrichContext({
    missionId,
    currentScreen,
    currentSection,
    currentRoute,
    workerId,
    decisionId,
    screenshotRef,
  });
  const inferred = category && IMPROVEMENT_CATEGORIES.includes(category)
    ? category
    : inferImprovementCategory({
      title: cleanTitle,
      description: cleanDesc,
      screen: ctx.currentScreen,
      section: ctx.currentSection,
      route: ctx.currentRoute,
    });

  const id = "imp_" + createHash("sha256")
    .update(`${cleanTitle}:${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 14);

  const rec = {
    schema_version: "vacilando.improvement.v1",
    id,
    missionId: ctx.missionId,
    missionTitle: ctx.missionTitle,
    currentPhase: ctx.currentPhase,
    currentScreen: ctx.currentScreen,
    currentSection: ctx.currentSection,
    currentRoute: ctx.currentRoute,
    timestamp: iso(nowMs),
    severity: sev,
    category: inferred,
    title: cleanTitle,
    description: cleanDesc,
    expectedBehavior: expectedBehavior ? String(expectedBehavior).trim() : null,
    screenshotRef: ctx.screenshotRef,
    workerId: ctx.workerId,
    decisionId: ctx.decisionId,
    status: "New",
    createdBy,
    directorEnrichment: ctx.directorContext,
    updated_at: iso(nowMs),
  };

  ensureDir();
  writeFileSync(fileFor(id), JSON.stringify(rec, null, 2));

  if (ctx.missionId) {
    try {
      appendTimelineEvent(ctx.missionId, {
        type: "improvement_captured",
        summary: `Continuous improvement: ${cleanTitle}`,
        headline: "Improve Vacilando observation",
        visibility: "summary",
        actor: createdBy,
        detail: {
          improvementId: id,
          category: inferred,
          severity: sev,
          screen: ctx.currentScreen,
          section: ctx.currentSection,
        },
        nowMs,
      });
    } catch { /* timeline optional if mission missing */ }
  }

  return rec;
}

export function getImprovement(id) {
  try {
    return JSON.parse(readFileSync(fileFor(id), "utf8"));
  } catch {
    return null;
  }
}

export function listImprovements({ status = null, missionId = null, limit = 200 } = {}) {
  ensureDir();
  let items = [];
  try {
    for (const name of readdirSync(DIR).filter((n) => n.endsWith(".json"))) {
      try {
        items.push(JSON.parse(readFileSync(join(DIR, name), "utf8")));
      } catch { /* skip */ }
    }
  } catch {
    return [];
  }
  if (status) items = items.filter((i) => i.status === status);
  if (missionId) items = items.filter((i) => i.missionId === missionId);
  return items
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
    .slice(0, limit);
}

export function updateImprovement(id, patch = {}, { actor = "operator", nowMs } = {}) {
  const rec = getImprovement(id);
  if (!rec) return { ok: false, error: "not_found" };
  if (patch.status && !IMPROVEMENT_STATUSES.includes(patch.status)) {
    return { ok: false, error: "invalid_status" };
  }
  if (patch.category && !IMPROVEMENT_CATEGORIES.includes(patch.category)) {
    return { ok: false, error: "invalid_category" };
  }
  if (patch.severity && !IMPROVEMENT_SEVERITIES.includes(patch.severity)) {
    return { ok: false, error: "invalid_severity" };
  }
  Object.assign(rec, {
    ...(patch.status != null ? { status: patch.status } : {}),
    ...(patch.category != null ? { category: patch.category } : {}),
    ...(patch.severity != null ? { severity: patch.severity } : {}),
    ...(patch.title != null ? { title: String(patch.title).trim() } : {}),
    ...(patch.description != null ? { description: String(patch.description).trim() } : {}),
    ...(patch.expectedBehavior != null ? { expectedBehavior: String(patch.expectedBehavior).trim() } : {}),
    updated_at: iso(nowMs),
    updated_by: actor,
  });
  writeFileSync(fileFor(id), JSON.stringify(rec, null, 2));
  return { ok: true, improvement: rec };
}

/** Operator list card / detail view models */
export function improvementListVm(rec) {
  return {
    kind: "improvement_card",
    id: rec.id,
    title: rec.title,
    missionTitle: rec.missionTitle || "No mission",
    category: rec.category,
    severity: rec.severity,
    status: rec.status,
    created: rec.timestamp,
    href: `improvements/${rec.id}`,
  };
}

export function improvementDetailVm(id) {
  const rec = getImprovement(id);
  if (!rec) return null;
  return {
    kind: "improvement_detail",
    ...rec,
    list: improvementListVm(rec),
  };
}

export function improvementsHomeVm() {
  return {
    kind: "improvements_home",
    improvements: listImprovements().map(improvementListVm),
  };
}

/**
 * Remove a mission's durable V2 artifacts from local runtime state.
 * Used to clear seeded demos before production-like operation.
 */
export function purgeMissionRuntime(missionId) {
  if (!missionId) return { ok: false, error: "missing_id" };
  const root = join(RUNTIME_ROOT, "vacilando");
  const removed = [];
  const paths = [
    join(root, "missions", `${missionId}.json`),
    join(root, "mission-briefs", `${missionId}.json`),
    join(root, "assignments", `${missionId}.json`),
    join(root, "decisions", `${missionId}.json`),
    join(root, "timeline", `${missionId}.jsonl`),
    join(root, "mission-confidence", `${missionId}.json`),
    join(root, "objectives", `${missionId}.json`),
    join(root, "director-messages", `${missionId}.jsonl`),
    join(root, "evidence", missionId),
  ];
  for (const p of paths) {
    try {
      if (!existsSync(p)) continue;
      if (lstatSync(p).isDirectory()) rmSync(p, { recursive: true, force: true });
      else unlinkSync(p);
      removed.push(p);
    } catch { /* best effort */ }
  }
  try {
    const verDir = join(root, "mission-briefs", "versions", missionId);
    if (existsSync(verDir)) {
      rmSync(verDir, { recursive: true, force: true });
      removed.push(verDir);
    }
  } catch { /* */ }

  try {
    if (getMission(missionId)) {
      updateMission(missionId, {
        status: "stopped",
        kickoff_status: "purged",
        mission_brief_id: null,
        mission_brief_version: null,
        latest_summary: "Purged seeded/demo mission",
      });
      removed.push(`missions.jsonl:${missionId}:stopped`);
    }
  } catch { /* */ }

  return { ok: true, missionId, removed };
}
