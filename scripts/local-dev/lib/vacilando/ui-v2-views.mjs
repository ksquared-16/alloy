/**
 * Vacilando UI V2 — Home / Activity / System projections.
 *
 * A PROJECTION, NOT AN OWNER. Nothing here measures, decides or stores
 * anything. Every value is read from the module that already owns it:
 *
 *   host telemetry     resources.mjs collectResources()
 *   capacity           managed-slots.mjs + execution-admission.mjs
 *   approvals          governed-action-request.mjs pendingApprovals()
 *   provider usage     usage.mjs collectUsage()
 *   run history        execution-run.mjs — events.jsonl and run transitions
 *   git history        source-control.mjs events.jsonl
 *   diagnostics        runtime-diagnostics.mjs
 *
 * If a number is wrong, it is wrong in its owner, and this file is where you
 * find out which owner to open.
 *
 * WHAT THIS FILE MAY NOT DO: invent a value to fill a gap. Where the platform
 * does not collect something, the projection omits the key and the browser's
 * data-maturity layer renders the governed unavailable state. See
 * docs/platform/planning/vacilando-os/ui-v2/DATA-CONTRACT.md.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function runtimeRoot() {
  return process.env.ALLOY_RUNTIME_ROOT?.trim()
    || join(homedir(), ".local", "state", "alloy-dev");
}

/* ---------------------------------------------------------------------------
 * ACTIVITY
 * ------------------------------------------------------------------------- */

export const ACTIVITY_LIMIT_DEFAULT = 200;

/**
 * How an event type becomes a product event.
 *
 * `kind` is the operator-facing category from the IA (Work, Governance, Git,
 * Browser/QA, System, Provider, Promotion, Failure). `outcome` is how it ended.
 * A type that is not listed falls through to a System/ok event rather than
 * being dropped — silently discarding history is worse than a generic label.
 */
const EVENT_RULES = [
  [/^execution_run\.complete/i, { kind: "work", outcome: "ok", verb: "Work completed" }],
  [/^execution_run\.failed/i, { kind: "failure", outcome: "failed", verb: "Run failed" }],
  [/^execution_run\.abandoned/i, { kind: "failure", outcome: "failed", verb: "Run abandoned" }],
  [/^execution_run\.needs_input/i, { kind: "governance", outcome: "attention", verb: "Needs input" }],
  [/^execution_run\.waiting_resource/i, { kind: "system", outcome: "attention", verb: "Waiting on a resource" }],
  [/^execution_run\.validating/i, { kind: "work", outcome: "ok", verb: "Validation started" }],
  [/^execution_run\.executing/i, { kind: "work", outcome: "ok", verb: "Work started" }],
  [/^execution_run\.recovered/i, { kind: "system", outcome: "attention", verb: "Run recovered" }],
  [/^execution_run\.push_dispatch/i, { kind: "system", outcome: "ok", verb: "Notification dispatched" }],
  [/^scm\.(commit|checkpoint)/i, { kind: "git", outcome: "ok", verb: "Checkpoint committed" }],
  [/^scm\.push/i, { kind: "git", outcome: "ok", verb: "Branch pushed" }],
  [/^scm\.(promote|merge|pr)/i, { kind: "promotion", outcome: "ok", verb: "Promotion" }],
  [/^scm\.conflict/i, { kind: "failure", outcome: "failed", verb: "Merge conflict" }],
  [/^scm\./i, { kind: "git", outcome: "ok", verb: "Source control" }],
  [/^admission\.(admitted|active)/i, { kind: "system", outcome: "ok", verb: "Admitted to capacity" }],
  [/^admission\.(queued|provisioning)/i, { kind: "system", outcome: "ok", verb: "Queued for capacity" }],
  [/^admission\./i, { kind: "system", outcome: "ok", verb: "Admission" }],
  [/^resource\.(granted|released)/i, { kind: "system", outcome: "ok", verb: "Resource" }],
  [/^resource\./i, { kind: "system", outcome: "ok", verb: "Resource" }],
  [/^governed[_.]/i, { kind: "governance", outcome: "attention", verb: "Governed action" }],
  [/browser|qa[_.]/i, { kind: "browser", outcome: "ok", verb: "Browser session" }],
  [/provider/i, { kind: "provider", outcome: "ok", verb: "Provider" }],
];

export function classifyEvent(type) {
  const t = String(type || "");
  for (const [re, meta] of EVENT_RULES) if (re.test(t)) return meta;
  return { kind: "system", outcome: "ok", verb: t || "Event" };
}

function readJsonl(path, { limit = 2000 } = {}) {
  let text = "";
  try { text = readFileSync(path, "utf8"); } catch { return []; }
  const lines = text.split("\n").filter(Boolean);
  // Newest events are at the end of an append-only log, so read the tail.
  const tail = lines.slice(-limit);
  const out = [];
  for (const line of tail) {
    try { out.push(JSON.parse(line)); } catch { /* a torn final line is not a failure */ }
  }
  return out;
}

/**
 * Build the Activity feed.
 *
 * TWO SOURCES, deliberately. The append-only event log is the richer one, but
 * it is best-effort by construction (`appendRunEvent` swallows its own errors)
 * and a fresh runtime root has none. The run store's own `transitions` array is
 * always present wherever a run exists. Reading both and de-duplicating means
 * Activity is never mysteriously empty on a machine that has plainly been
 * doing work.
 */
export async function projectActivityFeed({ limit = ACTIVITY_LIMIT_DEFAULT, root = runtimeRoot() } = {}) {
  const events = [];
  const seen = new Set();

  const push = (rec) => {
    const key = `${rec.at || ""}|${rec.type || ""}|${rec.lane_id || ""}|${rec.run_id || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    events.push(rec);
  };

  for (const rec of readJsonl(join(root, "vacilando", "execution-runs", "events.jsonl"))) {
    push({ ...rec, source: "execution_run_events" });
  }
  for (const rec of readJsonl(join(root, "vacilando", "source-control", "events.jsonl"))) {
    push({ ...rec, source: "source_control_events" });
  }
  for (const rec of readJsonl(join(root, "vacilando", "execution-admission", "events.jsonl"))) {
    push({ ...rec, type: rec.type || "admission.event", source: "admission_events" });
  }
  for (const rec of readJsonl(join(root, "vacilando", "resource-requests", "events.jsonl"))) {
    push({ ...rec, type: rec.type || "resource.event", source: "resource_events" });
  }

  // Run transitions from the store itself.
  try {
    const { readExecutionRunStore } = await import("./execution-run.mjs");
    const store = readExecutionRunStore(root);
    for (const [laneId, pack] of Object.entries(store.lanes || {})) {
      for (const run of pack.runs || []) {
        for (const t of run.transitions || []) {
          push({
            at: t.occurred_at,
            type: `execution_run.${String(t.to_state || "").toLowerCase()}`,
            lane_id: laneId,
            run_id: run.run_id,
            state: t.to_state,
            reason: t.reason || null,
            origin: t.origin || null,
            instruction: run.instruction || null,
            source: "run_transitions",
          });
        }
      }
    }
  } catch { /* the log alone is still a feed */ }

  // Resolved governed actions are governance history, not a pending blocker.
  try {
    const { listGovernedActions } = await import("./governed-action-request.mjs");
    for (const g of listGovernedActions({ limit: 100 }) || []) {
      if (!g?.status) continue;
      push({
        at: g.resolved_at || g.updated_at || g.requested_at,
        type: `governed_action.${g.status}`,
        lane_id: g.lane_id || null,
        summary: g.title || g.action_key || "Governed action",
        outcome: g.status === "approved" ? "ok" : (g.status === "denied" ? "attention" : "attention"),
        source: "governed_actions",
      });
    }
  } catch { /* governance history is additive */ }

  const rows = events.map((e) => {
    const meta = classifyEvent(e.type);
    return {
      id: `${e.at || ""}:${e.type || ""}:${e.lane_id || ""}:${e.run_id || ""}`,
      at: e.at || null,
      lane_id: e.lane_id || null,
      run_id: e.run_id || null,
      kind: e.kind || meta.kind,
      outcome: e.outcome || meta.outcome,
      provider: e.provider || null,
      summary: summarize(e, meta),
      detail: e.reason || e.detail || null,
      source: e.source || null,
      type: e.type || null,
    };
  }).filter((r) => r.at);

  rows.sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0));
  return { ok: true, events: rows.slice(0, limit), total: rows.length };
}

function summarize(e, meta) {
  if (e.summary) return String(e.summary);
  const bits = [meta.verb];
  if (e.reason) bits.push(String(e.reason).slice(0, 120));
  else if (e.instruction) bits.push(`“${String(e.instruction).slice(0, 80)}”`);
  return bits.join(" — ");
}

/* ---------------------------------------------------------------------------
 * SYSTEM / HOME shared runtime composition
 * ------------------------------------------------------------------------- */

/**
 * Compose the host + capacity + runtime picture from its owners.
 *
 * Every await is individually guarded. A dashboard that 500s because one probe
 * is slow is worse than a dashboard that says one number is unknown — and
 * "unknown" is a state the UI knows how to draw.
 */
export async function projectSystemSnapshot({ root = runtimeRoot() } = {}) {
  const out = { ok: true };

  try {
    const { collectResources } = await import("./resources.mjs");
    out.resources = await collectResources();
  } catch (e) {
    out.resources = null;
    out.resources_error = String(e?.message || e);
  }

  // Disk headroom is measured by the health probe, and Home wants it. Reading
  // it here is the whole of "wire the easy data".
  try {
    const { probeDisk } = await import("./health-probes.mjs");
    const disk = probeDisk();
    if (disk && Number.isFinite(Number(disk.free_gb))) {
      out.disk = { free_gb: Number(disk.free_gb), total_gb: Number(disk.total_gb) || null };
    }
  } catch { /* disk stays unavailable */ }

  try {
    const { managedSlotCount, gatewayPort } = await import("./managed-slots.mjs");
    const total = managedSlotCount();
    out.capacity = { total, port: gatewayPort() };
  } catch { /* capacity stays unavailable */ }

  try {
    const { readAdmissionStore, ADMISSION_OCCUPYING } = await import("./execution-admission.mjs");
    const store = readAdmissionStore(root);
    const recs = Object.values(store?.lanes || store?.admissions || {}).flatMap((v) => (Array.isArray(v) ? v : [v]));
    const occupying = recs.filter((r) => r && ADMISSION_OCCUPYING.has(r.state));
    out.capacity = {
      ...(out.capacity || {}),
      active: occupying.filter((r) => r.state === "ACTIVE").length,
      reserved: occupying.filter((r) => r.state !== "ACTIVE").length,
      holders: occupying.map((r) => ({ lane_id: r.lane_id, label: r.lane_id, state: r.state })),
    };
  } catch { /* admission detail stays unavailable */ }

  try {
    const { buildRuntimeDiagnostics } = await import("./runtime-diagnostics.mjs");
    out.diagnostics = await buildRuntimeDiagnostics();
  } catch { /* diagnostics stay unavailable */ }

  try {
    const { collectUsage } = await import("./usage.mjs");
    out.usage = collectUsage();
  } catch { /* usage stays unavailable */ }

  out.runtime_root = root;
  return out;
}

/**
 * HOME.
 *
 * Home is a COMPOSITION of things that already answer their own question:
 * pending approvals, the host snapshot, and the activity head. It deliberately
 * does not fetch lanes — the browser already polls the canonical lane list, and
 * a second lane read here would be a second source of truth for the same thing.
 */
export async function projectHome({ root = runtimeRoot(), activityLimit = 12 } = {}) {
  const out = { ok: true };

  try {
    const { pendingApprovals } = await import("./governed-action-request.mjs");
    out.approvals = pendingApprovals({ root }) || [];
  } catch {
    out.approvals = [];
  }

  const system = await projectSystemSnapshot({ root });
  out.resources = system.resources || null;
  out.disk = system.disk || null;
  out.capacity = system.capacity || null;
  out.usage = system.usage || null;
  out.diagnostics = system.diagnostics || null;

  try {
    const feed = await projectActivityFeed({ limit: activityLimit, root });
    out.activity = feed.events;
  } catch {
    out.activity = [];
  }

  // EFFECTIVENESS IS NOT REPORTED, AND SAYING SO IS THE POINT.
  //
  // Nothing in the platform records whether a run completed without operator
  // intervention, so every effectiveness figure would have to be guessed. The
  // projection returns the empty object rather than a plausible one, and the
  // browser renders the governed unavailable state for each field. See the
  // telemetry backlog for what has to exist first.
  out.effectiveness = {};

  return out;
}
