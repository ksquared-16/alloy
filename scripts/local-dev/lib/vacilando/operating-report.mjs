/**
 * THE OPERATING REPORT IS A MEASUREMENT, NOT A NARRATIVE.
 *
 * Everything here is derived from authoritative platform state — the governed
 * action store, the execution-run store, the lane store, health — and nothing is
 * inferred from prose, logs or a model's recollection. A number that cannot be
 * derived is reported as null rather than estimated, because an operating report
 * whose figures are sometimes guesses is one nobody can act on.
 *
 * ── WHY OPERATOR TIME IS SEPARATED FROM SYSTEM TIME ──
 *
 * The measured end-to-end P50 was 13.63s and the max 256s, and almost all of the
 * difference was a person deciding. Reporting that as platform latency would
 * have sent the next mission to optimise a queue that was already answering in
 * 70ms. Every duration here says whose time it was.
 *
 * ── WHY IT IS IDEMPOTENT BY WINDOW ──
 *
 * A report identifies its window, not the moment it ran. Asking twice for the
 * same day yields the same report_id, so a retry cannot produce a second
 * "today", and a cadence that fires twice cannot double-count a week.
 */

import { createHash } from "node:crypto";

export const OPERATING_REPORT_SCHEMA = "vacilando.operating_report.v1";

/** Deterministic identity: the window, never the clock. */
export function reportId({ kind, windowStart, windowEnd }) {
  const h = createHash("sha256").update(`${kind}|${windowStart}|${windowEnd}`).digest("hex").slice(0, 12);
  return `vrep_${h}`;
}

const ms = (a, b) => (a && b ? (new Date(b) - new Date(a)) / 1000 : null);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Percentile over a sorted copy. Empty input is null, never zero — zero is a measurement. */
export function percentile(values, q) {
  const v = values.filter((x) => num(x) !== null).sort((a, b) => a - b);
  if (!v.length) return null;
  const k = (v.length - 1) * q;
  const f = Math.floor(k);
  const c = Math.min(f + 1, v.length - 1);
  return Number((v[f] + (v[c] - v[f]) * (k - f)).toFixed(3));
}

export function distribution(values) {
  const v = values.filter((x) => num(x) !== null);
  return {
    n: v.length,
    p50: percentile(v, 0.5),
    p95: percentile(v, 0.95),
    max: v.length ? Number(Math.max(...v).toFixed(3)) : null,
  };
}

const within = (iso, start, end) => Boolean(iso) && iso >= start && iso < end;

/**
 * Terminal codes that mean "a guard stopped this", not "this broke".
 *
 * Deliberately a closed list. An unknown code counts as a failure, which is the
 * safe direction: a new guard reads as a failure until someone adds it here,
 * rather than a new breakage quietly reading as governance working.
 */
export const GOVERNANCE_REFUSALS = new Set([
  "result_validation_failed", "missing_expected_head_sha", "source_sha_not_reachable",
  "policy_denied", "approval_denied", "authorization_required", "branch_mismatch",
  "head_drift", "not_retirable_now", "destructive_result_ownership_mismatch",
  "action_identity_mismatch", "required_context_unresolved", "required_context_invalid",
  "blocked_run_not_failed", "input_validation_failed",
]);

/**
 * Build one report from state the caller supplies.
 *
 * Dependency-injected rather than reading the stores itself, so the whole
 * derivation is testable without a runtime root — and so a weekly report is the
 * same code over a wider window rather than a second analytics stack.
 */
export function buildOperatingReport({
  kind = "daily",
  windowStart,
  windowEnd,
  requests = [],
  runs = [],
  lanes = [],
  notifications = [],
  health = null,
  runtime = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const inWindow = requests.filter((r) => within(r.updated_at, windowStart, windowEnd));
  const runsIn = runs.filter((r) => within(r.created_at, windowStart, windowEnd)
    || within(r.updated_at, windowStart, windowEnd));

  const terminal = inWindow.filter((r) => r.status === "complete" || r.status === "failed");
  const complete = terminal.filter((r) => r.status === "complete");
  const failed = terminal.filter((r) => r.status === "failed");
  const t = (r) => r.decision_timing || {};

  /*
   * APPROVAL TIME IS THE OPERATOR'S, EXECUTION IS THE SYSTEM'S, AND THEY ARE
   * NEVER ADDED TOGETHER. The one number that mixed them read 256 seconds.
   */
  const speed = {
    dispatch: distribution(inWindow.map((r) => ms(t(r).accepted_at, t(r).execution_started_at))),
    execution: distribution(inWindow.map((r) => ms(t(r).execution_started_at, t(r).execution_settled_at))),
    projection: distribution(inWindow.map((r) => ms(t(r).execution_settled_at, t(r).projection_visible_at))),
    approval_operator_time: distribution(
      inWindow.filter((r) => r.operator_approval?.at)
        .map((r) => ms(r.created_at, r.operator_approval.at)),
    ),
    approval_to_visible: distribution(
      inWindow.filter((r) => r.operator_approval?.at)
        .map((r) => ms(r.operator_approval.at, t(r).projection_visible_at)),
    ),
  };

  /*
   * NOTIFICATION LATENCY NEEDED NO NEW INSTRUMENTATION.
   *
   * It was reported as UNMEASURED, and the assumption was that a stamp had to be
   * invented. The notification store already carries `created_at`,
   * `delivery.at` and `seen_at` — creation, dispatch, and the operator actually
   * looking at it. Building a parallel pipeline to measure what the existing one
   * already records would have added a second source of truth to answer a
   * question the first could already answer.
   *
   * `created -> seen` is the only end-to-end figure, and it is NOT a system
   * latency: it contains a person noticing. It is reported separately and
   * labelled, never folded into the platform's own stages.
   */
  const byRequest = new Map();
  for (const n of notifications) {
    if (!n?.request_id) continue;
    const prev = byRequest.get(n.request_id);
    if (!prev || String(n.created_at) > String(prev.created_at)) byRequest.set(n.request_id, n);
  }
  const joined = inWindow.map((r) => byRequest.get(r.request_id)).filter(Boolean);
  /*
   * ONLY A NOTIFICATION THAT FOLLOWS THE OUTCOME CAN MEASURE THE OUTCOME.
   *
   * A request also emits `governed_action_approval_required`, which is created
   * BEFORE execution settles. Joining on request id alone produced a P50 of
   * MINUS 58 seconds — a notification arriving a minute before the thing it
   * announces. A negative latency is not a fast system; it is a join that
   * matched the wrong row.
   */
  speed.notification_settled_to_created = distribution(
    inWindow.map((r) => {
      const n = byRequest.get(r.request_id);
      const settled = t(r).execution_settled_at;
      if (!n || !settled || !n.created_at || n.created_at < settled) return null;
      return ms(settled, n.created_at);
    }),
  );
  /*
   * RUNS ARE WHERE COMPLETION ACTUALLY REACHES THE OPERATOR.
   *
   * A governed action's completion notification goes to the adapter stream; the
   * operator's notification store carries RUN terminal states. So the honest
   * end-to-end question is "the run finished — how long until that was
   * deliverable", joined on run id. Measured separately from the approval
   * notifications so the two are never averaged into one meaningless figure.
   */
  const runNotifications = notifications.filter((n) =>
    n?.run_id && ["complete", "failed", "abandoned"].includes(String(n.event_type)));
  const runById = new Map(runsIn.map((r) => [r.run_id, r]));
  /*
   * ANCHORED ON THE TERMINAL TRANSITION, NOT `updated_at`.
   *
   * `updated_at` is the last time anything touched the record, which for a run
   * that was later resumed or re-reported is AFTER its notification. Measured
   * that way the P50 was minus 33 seconds. The moment a run became terminal is
   * the transition that made it terminal, and nothing else.
   */
  const terminalAt = (run) => {
    const last = (run?.transitions || []).filter((x) =>
      ["COMPLETE", "FAILED", "ABANDONED"].includes(String(x.to_state))).pop();
    return last?.occurred_at || null;
  };
  speed.run_terminal_to_notified = distribution(
    runNotifications.map((n) => {
      const at = terminalAt(runById.get(n.run_id));
      if (!at || !n.created_at || n.created_at < at) return null;
      return ms(at, n.created_at);
    }),
  );
  speed.notification_created_to_delivered = distribution(
    [...joined, ...runNotifications].map((n) => ms(n.created_at, n.delivery?.at)),
  );
  speed.notification_created_to_seen_operator_time = distribution(
    [...joined, ...runNotifications].map((n) => ms(n.created_at, n.seen_at)),
  );
  speed.notification_emit_to_visible = speed.notification_created_to_delivered;
  const systemStages = [["dispatch", speed.dispatch], ["execution", speed.execution], ["projection", speed.projection]];
  const slowest = systemStages
    .filter(([, d]) => d.p95 !== null)
    .sort((a, b) => b[1].p95 - a[1].p95)[0];

  const approvals = inWindow.filter((r) => r.operator_approval?.decision);
  const granted = approvals.filter((r) => r.operator_approval.decision === "approved");
  const denied = approvals.filter((r) => r.operator_approval.decision !== "approved");
  // AUTONOMOUS means nobody was asked, not that nobody was told.
  const autonomous = terminal.filter((r) => !r.operator_approval?.decision);

  const resumed = runsIn.flatMap((r) => (r.transitions || []).filter((x) =>
    x.to_state === "EXECUTING" && x.reason === "governed_action_complete"));
  const governorFailures = runsIn.filter((r) =>
    (r.transitions || []).some((x) => x.origin === "governor" && ["FAILED", "ABANDONED"].includes(x.to_state)));

  const staleProjections = runsIn.filter((run) => {
    const mine = requests.filter((r) => r.run_id === run.run_id)
      .sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)));
    const shown = run.governed_action?.request_id;
    return Boolean(shown && mine.length && shown !== mine[mine.length - 1].request_id);
  }).length;

  const counts = (key) => inWindow.filter((r) => r.action_key === key).length;
  const mergedShas = complete.filter((r) => r.action_key === "repository.merge_pull_request")
    .map((r) => r.result?.merge_sha || r.result?.mergeSha).filter(Boolean);

  const report = {
    schema_version: OPERATING_REPORT_SCHEMA,
    kind,
    report_id: reportId({ kind, windowStart, windowEnd }),
    window: { start: windowStart, end: windowEnd },
    generated_at: generatedAt,
    today: {
      staging_sha: runtime?.staging ?? null,
      installed_toolkit: runtime?.installed ?? null,
      running_gateway: runtime?.running ?? null,
      converged: runtime?.converged ?? null,
      lanes_total: lanes.length,
      lanes_active: runsIn.filter((r) => r.state === "EXECUTING").length,
      runs_started: runsIn.filter((r) => within(r.created_at, windowStart, windowEnd)).length,
      runs_completed: runsIn.filter((r) => r.state === "COMPLETE").length,
      runs_failed: runsIn.filter((r) => r.state === "FAILED").length,
      runs_abandoned: runsIn.filter((r) => r.state === "ABANDONED").length,
    },
    shipping: {
      prs_opened: counts("promotion.open_pr"),
      merges_requested: counts("repository.merge_pull_request"),
      merges_completed: mergedShas.length,
      merged_shas: mergedShas.slice(0, 20),
      pushes: counts("repository.push"),
      toolkit_installs: counts("host.install_toolkit"),
      migrations_applied: counts("database.apply_migration") + counts("database.apply_promoted_migration"),
    },
    speed: { ...speed, slowest_system_stage: slowest ? { stage: slowest[0], p95: slowest[1].p95 } : null },
    quality: {
      governed_actions: terminal.length,
      succeeded: complete.length,
      failed: failed.length,
      failure_codes: failed.reduce((acc, r) => {
        const k = r.failure_code || r.failure_reason || "unknown";
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {}),
      /*
       * A REFUSAL IS THE SYSTEM WORKING, AND IS NOT A FAILURE.
       *
       * Enumerated rather than pattern-matched. The first attempt used a regex
       * over the code and scored 0 of 19 real failures as refusals, because the
       * codes that actually occur — `result_validation_failed`,
       * `missing_expected_head_sha`, `source_sha_not_reachable` — contain none
       * of the words a person would guess. A list is auditable; a regex over
       * codes nobody enumerated is a guess wearing a measurement's clothes.
       */
      governance_refusals: failed.filter((r) => GOVERNANCE_REFUSALS.has(String(r.failure_code || r.failure_reason || ""))).length,
    },
    autonomy: {
      terminal_actions: terminal.length,
      autonomous: autonomous.length,
      required_approval: approvals.length,
      approvals_granted: granted.length,
      approvals_denied: denied.length,
      runs_auto_resumed: resumed.length,
      autonomous_pct: terminal.length ? Math.round((autonomous.length / terminal.length) * 100) : null,
    },
    health: {
      verdict: health?.verdict ?? null,
      counts: health?.counts ?? null,
      problems: (health?.findings || []).filter((f) => f.severity === "problem").map((f) => f.check),
      governor_failures: governorFailures.length,
      stale_projections: staleProjections,
    },
    needs_you: [],
    vacilando: { defects_closed: [], defects_found: [], new_debt: [] },
  };
  return report;
}

/** The same numbers as prose. Derived from the object, never computed twice. */
export function renderOperatingReport(r) {
  const d = (x) => (x && x.n ? `P50 ${x.p50}s  P95 ${x.p95}s  max ${x.max}s  (n=${x.n})` : "no samples");
  const L = [];
  L.push(`${r.kind === "weekly" ? "WEEK" : "DAY"}  ${r.window.start} → ${r.window.end}`);
  L.push(`report ${r.report_id}`);
  L.push("");
  L.push(`staging ${r.today.staging_sha || "—"} · toolkit ${r.today.installed_toolkit || "—"} · gateway ${r.today.running_gateway || "—"}${r.today.converged === false ? " (NOT CONVERGED)" : ""}`);
  L.push(`runs  started ${r.today.runs_started} · completed ${r.today.runs_completed} · failed ${r.today.runs_failed} · abandoned ${r.today.runs_abandoned}`);
  L.push("");
  L.push("SHIPPING");
  L.push(`  PRs opened ${r.shipping.prs_opened} · merges ${r.shipping.merges_completed}/${r.shipping.merges_requested} · pushes ${r.shipping.pushes} · toolkit installs ${r.shipping.toolkit_installs} · migrations ${r.shipping.migrations_applied}`);
  L.push("");
  L.push("SPEED — system time and operator time are never added together");
  L.push(`  dispatch      ${d(r.speed.dispatch)}`);
  L.push(`  execution     ${d(r.speed.execution)}`);
  L.push(`  projection    ${d(r.speed.projection)}`);
  L.push(`  notification  run terminal→notified ${d(r.speed.run_terminal_to_notified)}`);
  L.push(`                created→delivered     ${d(r.speed.notification_created_to_delivered)}`);
  L.push(`  OPERATOR wait approval ${d(r.speed.approval_operator_time)}`);
  L.push(`  OPERATOR wait notice   ${d(r.speed.notification_created_to_seen_operator_time)}`);
  L.push(`  slowest system stage: ${r.speed.slowest_system_stage ? `${r.speed.slowest_system_stage.stage} (P95 ${r.speed.slowest_system_stage.p95}s)` : "—"}`);
  L.push("");
  L.push("QUALITY");
  L.push(`  ${r.quality.succeeded}/${r.quality.governed_actions} governed actions succeeded · ${r.quality.failed} failed · ${r.quality.governance_refusals} were governance refusing something`);
  L.push("");
  L.push("AUTONOMY");
  L.push(`  ${r.autonomy.autonomous_pct === null ? "—" : `${r.autonomy.autonomous_pct}%`} needed nobody · ${r.autonomy.required_approval} asked · ${r.autonomy.approvals_granted} granted · ${r.autonomy.approvals_denied} denied · ${r.autonomy.runs_auto_resumed} runs auto-resumed`);
  L.push("");
  L.push("HEALTH");
  L.push(`  ${r.health.verdict || "—"} · problems: ${r.health.problems.length ? r.health.problems.join(", ") : "none"} · governor failures ${r.health.governor_failures} · stale projections ${r.health.stale_projections}`);
  if (r.needs_you.length) {
    L.push("");
    L.push("NEEDS YOU");
    for (const item of r.needs_you.slice(0, 5)) {
      L.push(`  [${item.priority}] ${item.what} — ${item.why}`);
      L.push(`      → ${item.action}`);
    }
  }
  return L.join("\n");
}

/*
 * ── CADENCE, DECLARED RATHER THAN EMBEDDED ──
 *
 * There is no time-of-day scheduler in this platform, deliberately: the steward
 * runs on a recovery cadence and its own doctrine says it must not become "a
 * second scheduler". Building one tonight to fire a report would be exactly
 * that.
 *
 * So the schedule is DATA. The host already runs a real timer — the launchd
 * agent that keeps the Gateway up — and it asks this module whether a report is
 * due. The report generator itself knows nothing about clocks or geography; it
 * knows about windows.
 *
 * The timezone is a setting, not a fact about where anyone lives. It is read
 * from the environment so a host in another place is a configuration change
 * rather than a code change.
 */
export const OPERATING_REPORT_SCHEDULE = Object.freeze({
  daily: Object.freeze({ kind: "daily", hour: 18, minute: 30, days: null }),
  // Sunday. The week's report is written after the week's last working day.
  weekly: Object.freeze({ kind: "weekly", hour: 18, minute: 30, days: Object.freeze([0]) }),
});

/**
 * Is a report of this kind due at this local moment?
 *
 * Deliberately a WINDOW rather than an instant: a timer that fires a minute late
 * must still find the report due, and one that fires twice must not produce two.
 * Duplication is prevented by identity, not by timing — `reportId` is derived
 * from the window, so a second run rewrites the same file.
 */
export function reportIsDue(kind, at = new Date(), { graceMinutes = 30 } = {}) {
  const spec = OPERATING_REPORT_SCHEDULE[kind];
  if (!spec) return { due: false, reason: "unknown_kind" };
  if (Array.isArray(spec.days) && !spec.days.includes(at.getDay())) {
    return { due: false, reason: "not_a_scheduled_day" };
  }
  const minutesNow = at.getHours() * 60 + at.getMinutes();
  const target = spec.hour * 60 + spec.minute;
  const delta = minutesNow - target;
  if (delta < 0) return { due: false, reason: "before_window", minutes_until: -delta };
  if (delta > graceMinutes) return { due: false, reason: "after_window", minutes_late: delta };
  return { due: true, reason: "in_window", minutes_late: delta };
}
