/**
 * Sprint Runtime — projects sprint lifecycle, phase, state, progress, evidence,
 * and questions for each occupied slot.
 *
 * Source of truth per field:
 *   lifecycle/state → initiative state.json (if the sprint is initiative-backed)
 *                     else worker metadata ALLOY_WORKER_LIFECYCLE + live signals
 *   stage/phase     → sprint manifest.json `stage`  (else initiative.state)
 *   progress        → DERIVED from position on the canonical lifecycle line;
 *                     null (a registered gap) for non-initiative sprints
 *   questions       → initiative.human_decisions[]  (authoritative, JSON)
 *   evidence        → evidence/<worktree>/ file count
 *   git/server/port → alloy-ro worker-status / dev-status
 *
 * Nothing is invented. Where a widget field (numeric phase index, % complete)
 * has no source, it is emitted as null and recorded in the snapshot gap list.
 */
import { INITIATIVE_LIFECYCLE, STATUS, glyphFor } from "./model.mjs";

/** Is a human decision still open (blocking eligible work)? */
export function decisionIsOpen(d) {
  const status = String(d?.status || "open").toLowerCase();
  return status !== "resolved" && status !== "decided" && status !== "superseded";
}

/** Deterministic operator status for a sprint, from real signals only. */
export function deriveStatus(e) {
  if (e.lifecycle === "paused" || e.detail?.pause_recorded_at) return STATUS.PAUSED;
  const st = e.initiative?.state;
  if (st) {
    if (st === "reviewing") return STATUS.REVIEW;
    if (st === "remediation_required") return STATUS.BLOCKED;
    if (st === "merge_ready" || st === "closed") return STATUS.COMPLETE;
    if (st === "awaiting_promotion_approval") return STATUS.REVIEW;
    if (["draft", "auditing", "planning", "awaiting_plan_approval", "approved"].includes(st)) return STATUS.PLANNING;
  }
  const openQuestions = (e.initiative?.human_decisions || []).filter(decisionIsOpen).length;
  if (openQuestions > 0) return STATUS.BLOCKED;
  const active = e.agent_status === "active" || e.lifecycle === "active";
  const hasWork = e.server === "running" || e.ahead > 0 || e.git_recent?.last_ms;
  if (active && hasWork) return STATUS.RUNNING;
  return STATUS.IDLE;
}

/** Coarse, explicitly-derived progress (0–100) or null when unsourceable. */
function deriveProgress(e) {
  const st = e.initiative?.state;
  if (!st) return { value: null, derived: false, source: null, note: "no initiative — numeric progress not tracked for managed sprints" };
  const idx = INITIATIVE_LIFECYCLE.indexOf(st);
  if (idx < 0) return { value: null, derived: false, source: "initiative.state", note: `unknown state '${st}'` };
  const value = Math.round((idx / (INITIATIVE_LIFECYCLE.length - 1)) * 100);
  return { value, derived: true, source: "initiative.state ordinal on canonical lifecycle", note: null };
}

function projectQuestions(e) {
  const decisions = e.initiative?.human_decisions || [];
  return decisions.filter(decisionIsOpen).map((d) => ({
    id: d.id || null,
    question: d.question || "",
    why_it_matters: d.why_it_matters || "",
    options: Array.isArray(d.options) ? d.options : [],
    recommendation: d.recommendation || null,
    blocking: d.parallel_work_ok !== true,
    source: `initiative:${e.initiative.key || e.manifest?.initiative_key || "?"}`,
  }));
}

export function projectSprint(e) {
  const status = deriveStatus(e);
  const progress = deriveProgress(e);
  const questions = projectQuestions(e);
  const stage = e.manifest?.stage && e.manifest.stage !== "undeclared" ? e.manifest.stage : e.initiative?.state || null;
  // Prefer a concise, stable title. The free-text objective can be a paragraph,
  // so it becomes a subtitle, never the heading.
  const title = e.initiative?.title || humanize(e.sprint);
  const objective = e.detail?.sprint_objective || null;
  return {
    slot: e.slot,
    key: e.sprint,
    worktree: e.worktree,
    title,
    objective,
    glyph: glyphFor(e.worktree),
    provider: e.provider,
    status,
    lifecycle: e.lifecycle || null,
    initiative_key: e.initiative?.key || e.manifest?.initiative_key || null,
    stage,
    phase: {
      label: stage ? humanize(stage) : "—",
      index: null, // GAP: numbered phases ("4 of 7") are not modelled by the toolkit
      total: null,
    },
    progress,
    git: { state: e.git, ahead: e.ahead, behind: e.behind },
    server: e.server,
    port: e.port,
    branch: e.branch || null,
    questions,
    question_count: questions.length,
    evidence_count: e.evidence?.count ?? 0,
    updated_at_ms: e.git_recent?.last_ms ?? e.evidence?.newest_ms ?? null,
  };
}

export function projectSprints(sprintsCtx) {
  return sprintsCtx.map(projectSprint).sort((a, b) => a.slot - b.slot);
}

function humanize(s) {
  return String(s || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
export { humanize };
