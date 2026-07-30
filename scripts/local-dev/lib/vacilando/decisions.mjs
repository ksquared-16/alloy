/**
 * Vacilando — Decision runtime (Execution System V2 §8).
 *
 * Structured decisions with affected-assignment pause/resume. Routine engineering
 * issues are NOT escalated here — callers must classify first.
 *
 * Notification: durable event + deep-link contract; push transport is adapter-backed.
 */
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { appendTimelineEvent } from "./timeline.mjs";
import { proposeBriefRevision } from "./mission-brief.mjs";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "decisions");
const NOTIFY_LOG = join(RUNTIME_ROOT, "vacilando", "notifications", "events.jsonl");

const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  const nd = join(RUNTIME_ROOT, "vacilando", "notifications");
  if (!existsSync(nd)) mkdirSync(nd, { recursive: true });
}

function fileFor(missionId) {
  return join(DIR, `${missionId}.json`);
}

function readStore(missionId) {
  try {
    return JSON.parse(readFileSync(fileFor(missionId), "utf8"));
  } catch {
    return { schema_version: "vacilando.decisions.v1", mission_id: missionId, decisions: [] };
  }
}

function writeStore(store) {
  ensureDir();
  writeFileSync(fileFor(store.mission_id), JSON.stringify(store, null, 2));
  return store;
}

/** Deep-link + notification event contract (push adapter may deliver later). */
export function emitDecisionNotification(decision, { channel = "adapter" } = {}) {
  ensureDir();
  const deepLink = `vacilando://decision/${decision.missionId}/${decision.decisionId}`;
  const webPath = `#/decisions/${decision.decisionId}?mission=${encodeURIComponent(decision.missionId)}`;
  const event = {
    schema_version: "vacilando.notification.v1",
    notification_id: "ntf_" + randomBytes(8).toString("hex"),
    type: "decision_required",
    channel,
    title: decision.title,
    body: decision.situation,
    deep_link: deepLink,
    web_path: webPath,
    mission_id: decision.missionId,
    decision_id: decision.decisionId,
    mobile_ready: true,
    created_at: iso(),
  };
  appendFileSync(NOTIFY_LOG, JSON.stringify(event) + "\n");
  return event;
}

/**
 * Create an open decision. Does not escalate routine issues — caller classifies.
 * Pauses affected assignments via optional hook (passed to avoid cycles).
 */
export function createDecision({
  missionId,
  title,
  situation,
  whyThisMatters,
  currentPlan,
  discovery,
  options = [],
  recommendation,
  recommendationReason,
  impact = {},
  evidence = [],
  affectedAssignments = [],
  defaultAction = null,
  responseDeadline = null,
  actor = "director",
  pauseAssignments = null,
  nowMs,
} = {}) {
  if (!missionId) throw new Error("decision_requires_mission_id");
  const decisionId = "dec_" + createHash("sha256").update(`${missionId}:${title}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 14);
  const decision = {
    schema_version: "vacilando.decision.v1",
    decisionId,
    missionId,
    title: String(title || "").trim() || "Decision required",
    situation: String(situation || "").trim(),
    whyThisMatters: String(whyThisMatters || "").trim(),
    currentPlan: String(currentPlan || "").trim(),
    discovery: String(discovery || "").trim(),
    options: (options || []).map((o, i) => ({
      optionId: o.optionId || o.id || `opt_${i + 1}`,
      label: o.label || o.title || `Option ${i + 1}`,
      description: o.description || "",
      consequences: o.consequences || null,
    })),
    recommendation: recommendation || null,
    recommendationReason: recommendationReason || null,
    impact,
    evidence: evidence || [],
    affectedAssignments: affectedAssignments || [],
    defaultAction,
    responseDeadline,
    status: "open",
    created_at: iso(nowMs),
    created_by: actor,
    answered_at: null,
    chosen_option_id: null,
    response: null,
    brief_revision: null,
  };

  const store = readStore(missionId);
  store.decisions.push(decision);
  writeStore(store);

  if (typeof pauseAssignments === "function" && affectedAssignments.length) {
    pauseAssignments(missionId, affectedAssignments, { reason: "decision", decisionId });
  }

  appendTimelineEvent(missionId, {
    type: "decision_requested",
    summary: `Decision required — ${decision.title}`,
    headline: decision.title,
    visibility: "summary",
    decisionId,
    actor,
    detail: { affectedAssignments, recommendation },
    nowMs,
  });

  const notification = emitDecisionNotification(decision);
  return { decision, notification };
}

export function listDecisions(missionId = null, { status = null } = {}) {
  if (!missionId) {
    ensureDir();
    const out = [];
    try {
      for (const name of readdirSync(DIR).filter((n) => n.endsWith(".json"))) {
        const store = JSON.parse(readFileSync(join(DIR, name), "utf8"));
        for (const d of store.decisions || []) {
          if (status && d.status !== status) continue;
          out.push(d);
        }
      }
    } catch { /* empty */ }
    return out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }
  const store = readStore(missionId);
  let list = store.decisions || [];
  if (status) list = list.filter((d) => d.status === status);
  return list;
}

export function getDecision(missionId, decisionId) {
  if (!decisionId) return null;
  if (missionId) return listDecisions(missionId).find((d) => d.decisionId === decisionId) || null;
  return listDecisions(null).find((d) => d.decisionId === decisionId) || null;
}

/**
 * Answer a decision. Optionally re-versions the Mission Brief when intent changes.
 * Resumes affected assignments via hook.
 */
export function answerDecision({
  missionId,
  decisionId,
  chosenOptionId,
  response = null,
  changesApprovedIntent = false,
  briefPatch = null,
  changeSummary = null,
  actor = "operator",
  resumeAssignments = null,
  invalidateWorkerContexts = null,
  nowMs,
} = {}) {
  const store = readStore(missionId);
  const decision = store.decisions.find((d) => d.decisionId === decisionId);
  if (!decision) return { ok: false, error: "decision_not_found" };
  if (decision.status !== "open") return { ok: false, error: "decision_not_open" };

  decision.status = "answered";
  decision.answered_at = iso(nowMs);
  decision.answered_by = actor;
  decision.chosen_option_id = chosenOptionId || null;
  decision.response = response || chosenOptionId;

  let brief = null;
  if (changesApprovedIntent) {
    const summary = String(changeSummary || `Decision ${decisionId}: ${decision.title}`).trim();
    brief = proposeBriefRevision(missionId, briefPatch || {}, {
      actor,
      changeSummary: summary,
      approvalSource: `decision:${decisionId}`,
      nowMs,
    });
    decision.brief_revision = { version: brief.version, contentHash: brief.contentHash };
    if (typeof invalidateWorkerContexts === "function") {
      invalidateWorkerContexts(missionId, {
        missionVersion: brief.version,
        missionContentHash: brief.contentHash,
        reason: "decision_intent_change",
        decisionId,
      });
    }
  }

  writeStore(store);

  appendTimelineEvent(missionId, {
    type: "decision_answered",
    summary: `Decision answered — ${decision.title}`,
    headline: decision.title,
    visibility: "summary",
    decisionId,
    actor,
    detail: {
      chosenOptionId,
      brief_version: brief?.version || null,
      changesApprovedIntent: Boolean(changesApprovedIntent),
    },
    nowMs,
  });

  if (typeof resumeAssignments === "function" && (decision.affectedAssignments || []).length) {
    resumeAssignments(missionId, decision.affectedAssignments, { reason: "decision_answered", decisionId });
  }

  return { ok: true, decision, brief };
}

/** Classify whether an issue should escalate (product) vs Director-handled (routine). */
export function classifyIssue(kind) {
  const ROUTINE = new Set([
    "merge_conflict", "stale_process", "port_collision", "branch_naming",
    "test_rerun", "lint", "formatting", "typescript_current_work", "worker_restart",
    "task_reassignment", "context_refresh", "cache_cleanup", "safe_process_termination",
    "retryable_infra", "reschedule_cpu", "evidence_recollection", "implementation_correction",
    "migration_ordering_nondestructive",
  ]);
  const PRODUCT = new Set([
    "product_behavior", "architecture", "scope_change", "doctrine_conflict",
    "data_loss_risk", "destructive_migration", "security", "invalidate_acceptance",
    "ux_material", "product_alternatives", "schedule_boundary", "merge_strategy",
  ]);
  if (ROUTINE.has(kind)) return { escalate: false, handler: "director" };
  if (PRODUCT.has(kind)) return { escalate: true, handler: "user" };
  return { escalate: true, handler: "user", note: "unknown_kind_defaults_to_user" };
}
