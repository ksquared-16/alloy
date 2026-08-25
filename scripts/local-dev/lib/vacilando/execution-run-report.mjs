/**
 * Structured agent reports — the canonical owner of the user-facing conversation.
 *
 * WHY THIS EXISTS. The Gateway showed raw tmux pane text as the assistant
 * message. A pane capture is a bounded window onto a terminal: it is truncated
 * by design, it scrolls, it contains TUI chrome, update banners and prompt
 * glyphs, and the PREVIOUS turn's output sits in it until the next one pushes it
 * out. Every failure that follows came from treating that as a message —
 * completions that vanished on the next poll, a "Complete" notification with no
 * final answer behind it, and a copy button that yielded whatever happened to be
 * on screen.
 *
 * THE MODEL. The terminal keeps the jobs it is actually good at — transport
 * receipt, readiness, liveness, diagnostics — and stops being the message. What
 * the operator reads is a structured report the agent submitted against a
 * specific run, stored durably in the run itself.
 *
 * ONE STORE. Reports live on the Execution Run record (execution-run.mjs). There
 * is no second run store, no second lifecycle, and no second notion of run
 * state. This module writes the message and then asks the existing transition
 * owner to move the run; it never moves a run itself.
 *
 * ORDER IS THE CONTRACT. The message is written and flushed BEFORE the
 * transition that notifies. That ordering is the whole reason a "Complete"
 * notification cannot arrive without its final message: by the time anything
 * can notify, the message is already durable.
 */
import { createHash } from "node:crypto";
import { resolve } from "node:path";

import {
  cwdOwnsRun,
  getExecutionRun,
  findExecutionRun,
  isTerminalRunState,
  patchRunFields,
  transitionExecutionRun,
} from "./execution-run.mjs";
import { canonicalLaneStoreId } from "./development-lane.mjs";

export const AGENT_REPORT_SCHEMA = "vacilando.agent_report.v1";

export const AGENT_REPORT_TYPES = Object.freeze(["progress", "needs_input", "completion", "failure"]);

/**
 * 256 KiB. Deliberately far above any terminal, pane, or summary bound — the
 * final message must never be shaped by how big a tmux window happens to be.
 * It is a sanity ceiling on a single JSON record, not a display budget.
 */
export const AGENT_REPORT_MESSAGE_MAX = 256 * 1024;
/** Kept per run so a refresh can still show how the work got here. */
export const AGENT_REPORT_HISTORY_MAX = 20;
export const AGENT_REPORT_PHASE_MAX = 80;
export const AGENT_REPORT_REASON_MAX = 2000;
export const AGENT_REPORT_CHOICES_MAX = 8;

/** Which run state each report type drives, through the canonical transition owner. */
const REPORT_TRANSITION = Object.freeze({
  progress: null,
  needs_input: "NEEDS_INPUT",
  completion: "COMPLETE",
  failure: "FAILED",
});

function iso(ms) {
  return new Date(ms ?? Date.now()).toISOString();
}

function fingerprint(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex").slice(0, 32);
}

function trimTo(value, max) {
  const s = String(value ?? "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

export function normalizeReportType(raw) {
  const s = String(raw || "").trim().toLowerCase().replace(/-/g, "_");
  const alias = { needs_input: "needs_input", question: "needs_input", complete: "completion", completed: "completion", done: "completion", fail: "failure", failed: "failure", update: "progress" };
  const t = alias[s] || s;
  return AGENT_REPORT_TYPES.includes(t) ? t : null;
}

function normalizeChoices(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const item of raw.slice(0, AGENT_REPORT_CHOICES_MAX)) {
    if (typeof item === "string") {
      const label = trimTo(item, 200);
      if (label) out.push({ id: fingerprint(label).slice(0, 8), label });
      continue;
    }
    if (item && typeof item === "object") {
      const label = trimTo(item.label ?? item.title ?? item.text, 200);
      if (!label) continue;
      out.push({
        id: trimTo(item.id, 64) || fingerprint(label).slice(0, 8),
        label,
        detail: trimTo(item.detail ?? item.description, 400) || null,
      });
    }
  }
  return out.length ? out : null;
}

/** Bounded, JSON-safe result metadata. Values are stringified, never objects. */
function normalizeResult(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (n >= 24) break;
    const key = trimTo(k, 64);
    if (!key) continue;
    if (Array.isArray(v)) {
      const items = v.slice(0, 40).map((x) => trimTo(typeof x === "object" ? JSON.stringify(x) : x, 400)).filter(Boolean);
      if (items.length) { out[key] = items; n += 1; }
      continue;
    }
    if (v && typeof v === "object") {
      const nested = trimTo(JSON.stringify(v), 2000);
      if (nested) { out[key] = nested; n += 1; }
      continue;
    }
    const value = trimTo(typeof v === "boolean" || typeof v === "number" ? String(v) : v, 2000);
    if (value) { out[key] = value; n += 1; }
  }
  return n ? out : null;
}

export function publicAgentReport(report) {
  if (!report || typeof report !== "object") return null;
  return {
    schema_version: AGENT_REPORT_SCHEMA,
    report_id: report.report_id,
    run_id: report.run_id,
    lane_id: report.lane_id,
    type: report.type,
    // The complete message, never a summary of it. Nothing downstream may
    // shorten this — see the truncation audit in the report round-trip tests.
    message: report.message,
    message_bytes: report.message_bytes,
    message_fingerprint: report.message_fingerprint,
    at: report.at,
    revision: report.revision,
    phase: report.phase || null,
    reason: report.reason || null,
    choices: report.choices || null,
    blocking: report.blocking === true,
    result: report.result || null,
  };
}

/**
 * Reports currently on a run: the one the conversation shows, plus history.
 */
export function agentReportsForRun(run) {
  const list = Array.isArray(run?.agent_reports) ? run.agent_reports : [];
  return {
    current: publicAgentReport(run?.agent_report || null),
    history: list.map(publicAgentReport).filter(Boolean),
  };
}

/** The report that owns the visible assistant message, if any. */
export function currentAgentReport(run) {
  return publicAgentReport(run?.agent_report || null);
}

function ownershipError(run, { laneId, cwd, root, origin }) {
  if (laneId) {
    const want = canonicalLaneStoreId(laneId, root);
    const have = canonicalLaneStoreId(run.lane_id, root);
    if (run.lane_id !== laneId && want !== have) return "lane_mismatch";
  }
  // Vacilando itself may file the last output when a worker forgot
  // `vac run-status complete --summary`. That is Gateway authority, not a
  // stolen worktree write.
  if (origin === "governor" || origin === "operator") return null;
  // Knowing a run id is not authority. The reporting process must be running
  // inside the worktree the run is bound to.
  if (!cwdOwnsRun(run, cwd)) return "worktree_mismatch";
  return null;
}

/**
 * Submit one structured agent report.
 *
 * Returns `{ ok, accepted, duplicate, report, run, transition }`. The message is
 * durable before any transition is attempted, so a caller that sees `ok` can
 * rely on the message being readable — and a notification that fires can only
 * have fired after it.
 */
export function submitAgentReport(runId, {
  type,
  message,
  phase = null,
  reason = null,
  revision = null,
  choices = null,
  blocking = undefined,
  result = null,
  at = null,
  laneId = null,
  cwd = null,
  origin = "agent",
  nowMs = Date.now(),
  root = null,
} = {}) {
  const found = root ? { run: getExecutionRun(runId, root), root } : findExecutionRun(runId);
  if (!found?.run) return { ok: false, error: "run_not_found" };
  const run = found.run;
  const storeRoot = found.root;

  const kind = normalizeReportType(type);
  if (!kind) return { ok: false, error: "invalid_report_type" };

  const owned = ownershipError(run, { laneId, cwd: cwd ? resolve(cwd) : null, root: storeRoot, origin });
  if (owned) return { ok: false, error: owned };

  const body = String(message ?? "");
  if (!body.trim()) return { ok: false, error: "message_empty" };
  const bytes = Buffer.byteLength(body, "utf8");
  if (bytes > AGENT_REPORT_MESSAGE_MAX) {
    return { ok: false, error: "message_too_large", message_bytes: bytes, limit: AGENT_REPORT_MESSAGE_MAX };
  }

  // A run that already finished does not get a new story. Its final message
  // stands; this is what stops a late pane read or a stray retry from rewriting
  // a completion the operator has already seen.
  const prior = run.agent_report || null;
  if (isTerminalRunState(run.state) && prior && prior.type !== kind) {
    return { ok: false, error: "run_already_terminal", state: run.state };
  }

  // Number(null) is 0 and 0 is finite, so an ABSENT revision must be tested for
  // absence before it is tested for finiteness — otherwise every unnumbered
  // report silently claims revision 0 and the monotonic check means nothing.
  const explicitRevision = revision != null && revision !== "" && Number.isFinite(Number(revision));
  const nextRevision = explicitRevision
    ? Number(revision)
    : (Number(prior?.revision) || 0) + 1;
  const priorRevision = Number(prior?.revision) || 0;
  const fp = fingerprint(`${kind}:${body}`);

  // Idempotent resubmission: same type, same revision, same message. Accept it,
  // change nothing, and do not notify twice.
  if (prior && prior.revision === nextRevision && prior.message_fingerprint === fp && prior.type === kind) {
    return {
      ok: true,
      accepted: true,
      duplicate: true,
      report: publicAgentReport(prior),
      run: getExecutionRun(run.run_id, storeRoot) || run,
      transition: null,
    };
  }
  if (prior && nextRevision < priorRevision) {
    return { ok: false, error: "stale_revision", revision: nextRevision, current_revision: priorRevision };
  }

  const report = {
    schema_version: AGENT_REPORT_SCHEMA,
    report_id: `arep_${fingerprint(`${run.run_id}:${kind}:${nextRevision}:${fp}`).slice(0, 16)}`,
    run_id: run.run_id,
    lane_id: run.lane_id,
    type: kind,
    message: body,
    message_bytes: bytes,
    message_fingerprint: fp,
    at: at ? String(at) : iso(nowMs),
    revision: nextRevision,
    phase: trimTo(phase, AGENT_REPORT_PHASE_MAX) || null,
    reason: trimTo(reason, AGENT_REPORT_REASON_MAX) || null,
    choices: kind === "needs_input" ? normalizeChoices(choices) : null,
    blocking: kind === "needs_input" ? blocking !== false : false,
    result: normalizeResult(result),
    origin,
  };

  const history = [report, ...(Array.isArray(run.agent_reports) ? run.agent_reports : [])]
    .slice(0, AGENT_REPORT_HISTORY_MAX);

  // ---- durable write happens HERE, before anything can notify ----
  const stored = patchRunFields(run.run_id, {
    agent_report: report,
    agent_reports: history,
  }, { nowMs, root: storeRoot });
  if (!stored.ok) return { ok: false, error: stored.error || "report_store_failed" };

  const verify = getExecutionRun(run.run_id, storeRoot);
  if (verify?.agent_report?.message_fingerprint !== fp) {
    return { ok: false, error: "report_not_durable" };
  }

  const to = REPORT_TRANSITION[kind];
  if (kind === "needs_input" && report.blocking === false) {
    // A non-blocking question is a note, not a gate: the run keeps working.
    return {
      ok: true,
      accepted: true,
      duplicate: false,
      report: publicAgentReport(report),
      run: verify,
      transition: null,
    };
  }
  if (!to) {
    // Progress keeps the run exactly where it is and keeps liveness fresh, so a
    // reporting agent is never mistaken for an abandoned one.
    const touched = transitionExecutionRun(run.run_id, run.state === "QUEUED" ? "EXECUTING" : run.state, {
      reason: "agent_progress",
      origin,
      nowMs,
      root: storeRoot,
      progress: report.phase ? `${report.phase}: ${firstLine(body)}` : firstLine(body),
    });
    return {
      ok: true,
      accepted: true,
      duplicate: false,
      report: publicAgentReport(report),
      run: getExecutionRun(run.run_id, storeRoot) || verify,
      transition: touched.ok ? touched.run.state : null,
    };
  }

  if (run.state === to) {
    return {
      ok: true,
      accepted: true,
      duplicate: false,
      report: publicAgentReport(report),
      run: verify,
      transition: to,
    };
  }

  const moved = transitionExecutionRun(run.run_id, to, {
    reason: `agent_${kind}`,
    origin,
    nowMs,
    root: storeRoot,
    progress: firstLine(body),
    // completion_report keeps its own bounded summary for lists and rows. The
    // COMPLETE message the operator reads is agent_report.message, unbounded.
    completion_report: { summary: firstLine(body), report_id: report.report_id },
  });
  if (!moved.ok) {
    return {
      ok: false,
      error: moved.error || "transition_failed",
      report: publicAgentReport(report),
      report_stored: true,
      run: verify,
    };
  }
  return {
    ok: true,
    accepted: true,
    duplicate: false,
    report: publicAgentReport(report),
    run: getExecutionRun(run.run_id, storeRoot) || moved.run,
    transition: moved.run.state,
  };
}

/** First meaningful line, for rows and progress lines that need one string. */
export function firstLine(text) {
  for (const raw of String(text || "").split("\n")) {
    const line = raw.replace(/^#{1,6}\s*/, "").replace(/^[-*]\s+/, "").trim();
    if (line) return line.length > 200 ? `${line.slice(0, 200)}…` : line;
  }
  return "";
}
