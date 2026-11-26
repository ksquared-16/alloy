/**
 * Vacilando — Continuous Improvement runtime.
 *
 * Operator friction captured during real mission use — conversational feedback
 * to Director, not a bug tracker. Director classifies and interprets.
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
import { projectMissionRow, buildDirectorSummary } from "./director-summary.mjs";
import { listAssignments } from "./worker-assignment.mjs";
import { listDecisions } from "./decisions.mjs";
import { getMissionConfidence } from "./mission-confidence.mjs";
import { listWorkerTelemetry } from "./worker-health.mjs";

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

/** Operator interrupt language → internal severity (hidden from form). */
export const INTERRUPT_LEVELS = Object.freeze({
  Minor: "Low",
  Moderate: "Medium",
  Significant: "High",
  "Blocked me": "Blocker",
});

const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

function fileFor(id) {
  return join(DIR, `${id}.json`);
}

export function interruptToSeverity(interrupt) {
  return INTERRUPT_LEVELS[interrupt] || (IMPROVEMENT_SEVERITIES.includes(interrupt) ? interrupt : "Medium");
}

/** Infer category from operator text + screen context. */
export function inferImprovementCategory({ title = "", description = "", screen = "", section = "", route = "" } = {}) {
  const blob = `${title} ${description} ${screen} ${section} ${route}`.toLowerCase();
  const rules = [
    ["Decision", /decision|needs me|approve|recommend/],
    ["Director", /director|chief of staff|assessment|ask director|clarif|started|launch/],
    ["Worker", /worker|claude|cursor|heartbeat|slot|assignment|acknowledg/],
    ["Evidence", /evidence|screenshot|certif|validation|qa artifact/],
    ["Navigation", /nav|route|tab|breadcrumb|where am i|find|menu|couldn't find/],
    ["Communication", /wording|copy|label|confus|unclear|message|prompt|explain|paused|why/],
    ["Performance", /slow|lag|freeze|load|spin|timeout/],
    ["Workflow", /kickoff|brief|ready|flow|steps|resume|approve kickoff|lifecycle/],
    ["UI", /layout|spacing|button|dialog|mobile|overflow|scroll|visual/],
    ["Architecture", /schema|runtime|contract|api|persist|ownership/],
  ];
  for (const [cat, re] of rules) {
    if (re.test(blob)) return cat;
  }
  return "Other";
}

/**
 * Director interpretation of an operator observation.
 * Plain language — searchable later; not shown as a form field.
 */
export function interpretObservation({
  description = "",
  expectedBehavior = null,
  category = "Other",
  severity = "Medium",
  screen = null,
  section = null,
} = {}) {
  const text = `${description} ${expectedBehavior || ""}`.toLowerCase();
  const categoryHints = {
    Worker: "Likely a worker visibility or lifecycle communication issue.",
    Director: "Likely a Director communication or guidance gap.",
    Decision: "Likely a decision framing or recommendation clarity issue.",
    Evidence: "Likely an evidence discovery or certification clarity issue.",
    Navigation: "Likely a navigation or findability issue.",
    Communication: "Likely a wording or explanation gap.",
    Workflow: "Likely a workflow step or sequencing issue.",
    Performance: "Likely a responsiveness or wait-state issue.",
    UI: "Likely a presentation or interaction issue.",
    Architecture: "Likely a platform contract or ownership issue.",
    Other: "Likely a product experience gap worth reviewing.",
  };
  const expectation = expectedBehavior
    ? ` Operator expected: ${String(expectedBehavior).trim().replace(/\s+/g, " ").slice(0, 180)}`
    : "";
  const place = screen
    ? ` Seen on ${screen}${section ? ` · ${section}` : ""}.`
    : "";

  let focus = "Operator expected clearer guidance about what Vacilando was doing.";
  if (/start|launch|worker|claude|cursor|ack/.test(text)) {
    focus = "Operator expected assignment lifecycle visibility after kickoff.";
  } else if (/pause|why|stuck|blocked/.test(text)) {
    focus = "Operator expected a plain explanation for why work stopped.";
  } else if (/evidence|proof|certif/.test(text)) {
    focus = "Operator expected to find proof of progress without digging.";
  } else if (/timeline|changed|what happened/.test(text)) {
    focus = "Operator expected the timeline to narrate what changed.";
  } else if (/decision|recommend/.test(text)) {
    focus = "Operator expected clearer decision framing from Director.";
  }

  const potentialMission = ({
    Worker: "Worker Visibility & Lifecycle",
    Director: "Director Communication Clarity",
    Decision: "Decision Framing Polish",
    Evidence: "Evidence Findability",
    Navigation: "Mission Control Navigation",
    Communication: "Operator Language Pass",
    Workflow: "Kickoff & Execution Flow",
    Performance: "Runtime Responsiveness",
    UI: "Mission Control Interaction Polish",
    Architecture: "Runtime Contract Hardening",
    Other: "Operator Friction Follow-up",
  })[category] || "Operator Friction Follow-up";

  return {
    operatorObservation: String(description).trim(),
    directorInterpretation: `${categoryHints[category] || categoryHints.Other} ${focus}${expectation}${place}`.replace(/\s+/g, " ").trim(),
    potentialCategory: category,
    potentialSeverity: severity,
    potentialFutureMission: potentialMission,
  };
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
  const confidence = missionId ? getMissionConfidence(missionId) : null;
  const directorSummary = missionId ? buildDirectorSummary(missionId) : null;
  const telemetry = missionId
    ? listWorkerTelemetry().filter((t) => t.missionId === missionId)
    : [];
  const primaryWorker = workerId
    ? telemetry.find((t) => t.workerId === workerId)
    : telemetry[0] || null;
  const provider = primaryWorker?.provider
    || (primaryWorker?.workerId?.startsWith("cursor") ? "cursor" : primaryWorker?.workerId?.startsWith("claude") ? "claude" : mission?.provider || null);

  return {
    missionId: missionId || null,
    missionTitle: brief?.title || mission?.title || row?.title || null,
    currentPhase: row?.current_phase?.title || null,
    currentScreen: currentScreen || null,
    currentSection: currentSection || null,
    currentRoute: currentRoute || null,
    workerId: workerId || primaryWorker?.workerId || null,
    decisionId: decisionId || openDecision?.decisionId || null,
    screenshotRef: screenshotRef || null,
    missionVersion: brief?.version ?? mission?.mission_brief_version ?? null,
    missionContentHash: brief?.contentHash || mission?.mission_content_hash || null,
    provider,
    model: primaryWorker?.model || null,
    directorContext: {
      status: row?.status_label || row?.status || null,
      directorState: row?.director_state || null,
      directorSummary: directorSummary?.what_happens_next || directorSummary?.what_changed || null,
      openDecisionTitle: openDecision?.title || null,
      activeDeliverables: assignments
        .filter((a) => ["running", "paused", "ready", "waiting"].includes(a.status))
        .map((a) => a.title),
      confidencePercent: confidence?.percent ?? null,
      confidenceBand: confidence?.bandLabel ?? null,
      workerState: telemetry.map((t) => ({
        workerId: t.workerId,
        status: t.status,
        assignmentId: t.assignmentId || null,
      })),
      telemetrySnapshot: {
        workerCount: telemetry.length,
        assignmentCount: assignments.length,
        openDecisions: openDecision ? 1 : 0,
        capturedAt: iso(),
      },
    },
  };
}

function deriveTitle(description) {
  const line = String(description || "").trim().split(/\n/)[0].replace(/\s+/g, " ");
  if (!line) return "Operator observation";
  return line.length > 96 ? `${line.slice(0, 93)}…` : line;
}

/**
 * Capture an operator observation. Technical context is Director-enriched.
 * Prefer whatHappened + expectedBehavior + interrupt (conversational).
 */
export function captureImprovement({
  title = null,
  description = null,
  whatHappened = null,
  expectedBehavior = null,
  severity = null,
  interrupt = null,
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
  const cleanDesc = String(whatHappened || description || "").trim();
  if (!cleanDesc) throw new Error("improvement_requires_description");
  const cleanTitle = String(title || "").trim() || deriveTitle(cleanDesc);
  const sev = interruptToSeverity(interrupt || severity || "Moderate");

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

  const interpretation = interpretObservation({
    description: cleanDesc,
    expectedBehavior,
    category: inferred,
    severity: sev,
    screen: ctx.currentScreen,
    section: ctx.currentSection,
  });

  const id = "imp_" + createHash("sha256")
    .update(`${cleanTitle}:${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 14);

  const rec = {
    schema_version: "vacilando.improvement.v2",
    id,
    missionId: ctx.missionId,
    missionTitle: ctx.missionTitle,
    currentPhase: ctx.currentPhase,
    currentScreen: ctx.currentScreen,
    currentSection: ctx.currentSection,
    currentRoute: ctx.currentRoute,
    timestamp: iso(nowMs),
    severity: sev,
    interrupt: interrupt || null,
    category: inferred,
    title: cleanTitle,
    description: cleanDesc,
    expectedBehavior: expectedBehavior ? String(expectedBehavior).trim() : null,
    screenshotRef: ctx.screenshotRef,
    workerId: ctx.workerId,
    decisionId: ctx.decisionId,
    provider: ctx.provider,
    model: ctx.model,
    missionVersion: ctx.missionVersion,
    missionContentHash: ctx.missionContentHash,
    status: "New",
    createdBy,
    directorEnrichment: ctx.directorContext,
    directorInterpretation: interpretation,
    updated_at: iso(nowMs),
  };

  ensureDir();
  writeFileSync(fileFor(id), JSON.stringify(rec, null, 2));

  if (ctx.missionId) {
    try {
      appendTimelineEvent(ctx.missionId, {
        type: "improvement_captured",
        summary: interpretation.directorInterpretation,
        headline: "You told Director something felt off",
        visibility: "summary",
        actor: createdBy,
        detail: {
          improvementId: id,
          category: inferred,
          severity: sev,
          screen: ctx.currentScreen,
          section: ctx.currentSection,
          interpretation,
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

export function listImprovements({
  status = null,
  missionId = null,
  missionScope = "all", // active | archived | all
  limit = 200,
  archivedMissionIds = null,
} = {}) {
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
  if ((missionScope === "active" || missionScope === "archived") && archivedMissionIds instanceof Set) {
    items = items.filter((i) => {
      const arch = i.missionId ? archivedMissionIds.has(i.missionId) : false;
      return missionScope === "archived" ? arch : !arch;
    });
  }
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
    category: rec.directorInterpretation?.potentialCategory || rec.category,
    severity: rec.directorInterpretation?.potentialSeverity || rec.severity,
    status: rec.status,
    created: rec.timestamp,
    interpretationPreview: rec.directorInterpretation?.directorInterpretation || null,
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

export function improvementsHomeVm({
  status = null,
  missionScope = "active",
} = {}) {
  const archivedIds = new Set();
  for (const imp of listImprovements({ limit: 500 })) {
    if (imp.missionId && getMission(imp.missionId)?.archived === true) {
      archivedIds.add(imp.missionId);
    }
  }
  const scopeRaw = String(missionScope || "active");
  const scope = scopeRaw === "All" || scopeRaw === "all" ? "all" : scopeRaw.toLowerCase();
  const statusFilter = status && status !== "All" && status !== "all" ? status : null;
  const items = listImprovements({
    status: statusFilter,
    missionScope: scope,
    archivedMissionIds: archivedIds,
  });
  return {
    kind: "improvements_home",
    filter: { status: status || "All", missionScope: scopeRaw || "active" },
    counts: {
      total: listImprovements({ limit: 500 }).length,
      activeMissions: listImprovements({ missionScope: "active", archivedMissionIds: archivedIds, limit: 500 }).length,
      archivedMissions: listImprovements({ missionScope: "archived", archivedMissionIds: archivedIds, limit: 500 }).length,
    },
    improvements: items.map(improvementListVm),
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
