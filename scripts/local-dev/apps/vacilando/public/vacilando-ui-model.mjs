/**
 * Vacilando UI V2 — the data-maturity layer and the typed view models.
 *
 * ============================================================================
 * WHY THIS MODULE EXISTS
 * ============================================================================
 *
 * The V2 surfaces show the COMPLETE intended product: system health, provider
 * usage, effectiveness, progress. Some of that is wired to canonical runtime
 * truth today. Some of it is not, and will not be for a while.
 *
 * There are only two dishonest ways to handle that, and this module refuses
 * both:
 *
 *   1. Print a plausible number and let the operator believe it. That is how a
 *      dashboard becomes a liability — the one time it matters, it is wrong,
 *      and nothing on screen said it might be.
 *   2. Hide the field until the backend catches up. That hides the product
 *      shape from the people deciding what to build next, which is the whole
 *      reason this phase exists.
 *
 * So EVERY value on a V2 surface passes through `field()` and arrives at the
 * component already carrying its own provenance: what it is, where it came
 * from, and whether it is real. A component renders `state` — it never decides
 * it. There is no other way for a number to reach the screen, which is the
 * point: you cannot sprinkle a hardcoded 87% into a card, because the card
 * takes fields, not numbers.
 *
 * The governed classifications are defined in
 * docs/platform/planning/vacilando-os/ui-v2/DATA-CONTRACT.md, which lists every
 * field on every surface. This module is that document's executable half.
 */

/* ---------------------------------------------------------------------------
 * Maturity — the six classifications from the data contract.
 * ------------------------------------------------------------------------- */

export const MATURITY = Object.freeze({
  /** Canonical data exists and this UI consumes it. */
  LIVE: "LIVE",
  /** A canonical source exists; the Vacilando UI does not read it yet. */
  AVAILABLE_NOT_WIRED: "AVAILABLE_NOT_WIRED",
  /** Enough canonical evidence exists to compute it; no owner projects it yet. */
  DERIVABLE: "DERIVABLE",
  /** The platform does not collect what this needs. */
  INSTRUMENTATION_REQUIRED: "INSTRUMENTATION_REQUIRED",
  /** The provider/session must begin reporting it. */
  PROVIDER_REQUIRED: "PROVIDER_REQUIRED",
  /** Represented in the design only. No reliable source exists. */
  PLACEHOLDER: "PLACEHOLDER",
});

export const MATURITIES = Object.freeze(Object.values(MATURITY));

/**
 * Which classifications may show a demo value when the development
 * placeholder mode is on? LIVE never does — a live field that is missing is
 * genuinely missing, and covering that with a demo value would hide a real
 * outage behind a pretty number.
 */
export const PLACEHOLDER_ELIGIBLE = Object.freeze([
  MATURITY.AVAILABLE_NOT_WIRED,
  MATURITY.DERIVABLE,
  MATURITY.INSTRUMENTATION_REQUIRED,
  MATURITY.PROVIDER_REQUIRED,
  MATURITY.PLACEHOLDER,
]);

/**
 * The three states a component can be asked to draw. This is the whole
 * vocabulary; there is no fourth.
 */
export const DATA_STATE = Object.freeze({
  LIVE: "live",
  /** A representative value, shown only in development placeholder mode. */
  PLACEHOLDER: "placeholder",
  /** Honestly nothing. Renders as copy, never as a number. */
  UNAVAILABLE: "unavailable",
});

/* ---------------------------------------------------------------------------
 * Placeholder mode.
 *
 * ONE mechanism, not a flag per surface. Off unless deliberately turned on, and
 * turning it on is a visible act: the app paints a persistent banner while it
 * is on, so a screenshot taken in this mode can never be mistaken for
 * production truth.
 * ------------------------------------------------------------------------- */

export const PLACEHOLDER_MODE_KEY = "vac.ui.placeholders";

export function readPlaceholderMode(storage, search = "") {
  // An explicit query parameter wins, and persists, so a certification run and
  // a design review can both ask for it without hunting through settings.
  const q = String(search || "");
  if (/[?&]placeholders=1\b/.test(q)) {
    try { storage?.setItem(PLACEHOLDER_MODE_KEY, "1"); } catch { /* private mode */ }
    return true;
  }
  if (/[?&]placeholders=0\b/.test(q)) {
    try { storage?.removeItem(PLACEHOLDER_MODE_KEY); } catch { /* private mode */ }
    return false;
  }
  try { return storage?.getItem(PLACEHOLDER_MODE_KEY) === "1"; } catch { return false; }
}

export function writePlaceholderMode(on, storage) {
  try {
    if (on) storage?.setItem(PLACEHOLDER_MODE_KEY, "1");
    else storage?.removeItem(PLACEHOLDER_MODE_KEY);
  } catch { /* private mode */ }
  return Boolean(on);
}

/* ---------------------------------------------------------------------------
 * field() — the only way a value reaches a V2 component.
 * ------------------------------------------------------------------------- */

/**
 * @param {*}      value      the live value, or null/undefined when absent
 * @param {string} maturity   one of MATURITY
 * @param {object} opts
 * @param {string} opts.label      what this field is called on screen
 * @param {*}      opts.demo       representative value for placeholder mode
 * @param {string} opts.unit       "%", "GB", "tokens", …
 * @param {string} opts.absent     copy when there is nothing ("No data yet")
 * @param {function} opts.format   (value) => display string
 * @param {boolean} opts.placeholders  whether placeholder mode is on
 * @param {string} opts.note       one short line of provenance for the operator
 */
export function field(value, maturity, {
  label = null,
  demo = undefined,
  unit = null,
  absent = "Not available yet",
  format = null,
  placeholders = false,
  note = null,
} = {}) {
  const mat = MATURITIES.includes(maturity) ? maturity : MATURITY.PLACEHOLDER;
  const present = value !== null && value !== undefined && value !== "" && !(typeof value === "number" && Number.isNaN(value));

  if (present && mat === MATURITY.LIVE) {
    return frame(value, DATA_STATE.LIVE, mat, { label, unit, format, note });
  }
  // A non-LIVE field that nonetheless arrived with a real value is live data.
  // Classification describes the *plumbing*, not the individual reading, and a
  // wired-up field must not keep rendering as a placeholder.
  if (present) {
    return frame(value, DATA_STATE.LIVE, mat, { label, unit, format, note });
  }
  if (placeholders && demo !== undefined && PLACEHOLDER_ELIGIBLE.includes(mat)) {
    return frame(demo, DATA_STATE.PLACEHOLDER, mat, { label, unit, format, note });
  }
  return {
    value: null,
    display: absent,
    state: DATA_STATE.UNAVAILABLE,
    maturity: mat,
    label,
    unit,
    note,
  };
}

function frame(value, state, maturity, { label, unit, format, note }) {
  let display;
  if (typeof format === "function") display = format(value);
  else if (typeof value === "number") display = `${formatNumber(value)}${unit || ""}`;
  else display = `${value}${unit || ""}`;
  return { value, display, state, maturity, label, unit, note };
}

export function isLive(f) { return f?.state === DATA_STATE.LIVE; }
export function isPlaceholder(f) { return f?.state === DATA_STATE.PLACEHOLDER; }
export function isUnavailable(f) { return !f || f.state === DATA_STATE.UNAVAILABLE; }

/** Does this whole surface currently rest on any non-canonical value? */
export function surfaceHasPlaceholders(vm) {
  let found = false;
  walkFields(vm, (f) => { if (f.state === DATA_STATE.PLACEHOLDER) found = true; });
  return found;
}

export function collectFields(vm) {
  const out = [];
  walkFields(vm, (f) => out.push(f));
  return out;
}

function walkFields(node, visit, seen = new Set(), depth = 0) {
  if (!node || typeof node !== "object" || depth > 8 || seen.has(node)) return;
  seen.add(node);
  if (typeof node.state === "string" && "display" in node && "maturity" in node) {
    visit(node);
    return;
  }
  for (const v of Array.isArray(node) ? node : Object.values(node)) walkFields(v, visit, seen, depth + 1);
}

/* ---------------------------------------------------------------------------
 * Formatting. Shared so two surfaces never round the same number differently.
 * ------------------------------------------------------------------------- */

export function formatNumber(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (Number.isInteger(v)) return String(v);
  return String(Math.round(v * 10) / 10);
}

export function formatTokens(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
}

export function formatUsd(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "$0.00";
  if (v < 0.01) return "<$0.01";
  if (v < 100) return `$${v.toFixed(2)}`;
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

export function formatGb(mb) {
  const v = Number(mb);
  if (!Number.isFinite(v)) return "—";
  return `${(v / 1024).toFixed(1)} GB`;
}

export function formatDurationMs(ms) {
  const v = Number(ms);
  if (!Number.isFinite(v) || v < 0) return "—";
  const s = v / 1000;
  if (s < 90) return `${Math.round(s)}s`;
  const m = s / 60;
  if (m < 90) return `${Math.round(m)}m`;
  return `${(m / 60).toFixed(1)}h`;
}

export function formatClock(iso) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/* ---------------------------------------------------------------------------
 * HEALTH — one vocabulary for every state dot in the product.
 * ------------------------------------------------------------------------- */

export const HEALTH = Object.freeze({
  HEALTHY: "healthy",
  WATCH: "watch",
  PROBLEM: "problem",
  UNKNOWN: "unknown",
});

export function healthFromPressure(pressure) {
  if (pressure === "ok") return HEALTH.HEALTHY;
  if (pressure === "elevated") return HEALTH.WATCH;
  if (pressure === "high") return HEALTH.PROBLEM;
  return HEALTH.UNKNOWN;
}

/** Utilisation to health, with the thresholds stated once. */
export function healthFromPercent(pct, { watch = 80, problem = 92 } = {}) {
  const v = Number(pct);
  if (!Number.isFinite(v)) return HEALTH.UNKNOWN;
  if (v >= problem) return HEALTH.PROBLEM;
  if (v >= watch) return HEALTH.WATCH;
  return HEALTH.HEALTHY;
}

export function worstHealth(list = []) {
  const order = [HEALTH.PROBLEM, HEALTH.WATCH, HEALTH.UNKNOWN, HEALTH.HEALTHY];
  for (const h of order) if (list.includes(h)) return h;
  return HEALTH.UNKNOWN;
}

export const HEALTH_LABEL = Object.freeze({
  healthy: "Healthy",
  watch: "Watch",
  problem: "Problem",
  unknown: "Unknown",
});

/* ---------------------------------------------------------------------------
 * The development fixture.
 *
 * ONE object. Every demo value in the product comes from here, so the set of
 * things that are not yet real is enumerable by reading a single declaration
 * rather than by grepping for suspicious constants.
 * ------------------------------------------------------------------------- */

export const DEMO = Object.freeze({
  host: {
    swap_trend: "rising slowly",
    swap_trend_direction: "up",
    disk_free_gb: 214,
    disk_total_gb: 926,
  },
  usage: {
    runs: 34,
    input_tokens: 4_120_000,
    output_tokens: 286_000,
    cache_tokens: 11_400_000,
    total_tokens: 15_806_000,
    cost_usd: 18.42,
    runtime_ms: 5_400_000,
    context_pct: 38,
    retries: 3,
  },
  effectiveness: {
    runs_completed: 28,
    autonomous_completions: 21,
    autonomous_pct: 75,
    interventions: 7,
    approval_interruptions: 4,
    rework_rate_pct: 11,
    avg_runtime_ms: 1_920_000,
    commits: 46,
    tests_run: 312,
    tests_passed: 309,
    certifications: 3,
    promotions: 2,
  },
});

/* ---------------------------------------------------------------------------
 * HOME view model.
 * ------------------------------------------------------------------------- */

/**
 * @param {object} src  raw runtime payloads, each one already the response of
 *                      the canonical owner that produces it
 */
export function buildHomeViewModel({
  lanes = [],
  approvals = [],
  resources = null,
  capacity = null,
  usage = null,
  effectiveness = null,
  activity = [],
  laneState = () => null,
  placeholders = false,
  nowMs = Date.now(),
} = {}) {
  return {
    placeholders,
    needsYou: buildNeedsYou({ lanes, approvals, laneState, nowMs }),
    health: buildSystemHealth({ resources, capacity, placeholders }),
    lanes: buildLaneSummaries({ lanes, laneState, nowMs }),
    usage: buildUsageModel({ usage, placeholders }),
    effectiveness: buildEffectivenessModel({ effectiveness, placeholders }),
    activity: Array.isArray(activity) ? activity.slice(0, 8) : [],
  };
}

/**
 * NEEDS YOU is not a notification feed.
 *
 * It contains only things that are BLOCKED ON A HUMAN: a governed action
 * awaiting authorization, a run in NEEDS_INPUT, an operator decision. A lane
 * that is merely working, merely queued, or merely finished is not here — it is
 * on the lane list, where routine state belongs.
 */
export function buildNeedsYou({ lanes = [], approvals = [], laneState = () => null, nowMs = Date.now() } = {}) {
  const items = [];
  const labelById = new Map();
  for (const l of lanes) labelById.set(l.lane_id, l.label || l.lane_id);

  for (const a of Array.isArray(approvals) ? approvals : []) {
    const laneId = a.lane_id || a.laneId || null;
    items.push({
      kind: "governed_action",
      lane_id: laneId,
      lane_label: labelById.get(laneId) || a.lane_label || laneId || "Vacilando",
      request: a.title || a.action_key || a.label || "Authorization required",
      detail: a.reason_worker_cannot_execute || a.summary || null,
      at_ms: parseMs(a.requested_at || a.created_at || a.at),
      href: laneId ? `#/lanes/${encodeURIComponent(laneId)}` : "#/lanes",
      severity: a.destructive || a.mode === "destructive" ? "destructive" : "authorize",
    });
  }

  for (const l of lanes) {
    const st = laneState(l);
    const run = l.execution_run;
    // Already represented by its governed action; do not count the same
    // blocker twice.
    const alreadyListed = items.some((i) => i.lane_id === l.lane_id);
    if (alreadyListed) continue;
    if (st?.key === "needs_input" || run?.state === "NEEDS_INPUT") {
      items.push({
        kind: "needs_input",
        lane_id: l.lane_id,
        lane_label: l.label || l.lane_id,
        request: run?.state_reason || st?.hint || "The agent asked a question",
        detail: null,
        at_ms: parseMs(run?.updated_at) || Number(l.last_activity_ms) || null,
        href: `#/lanes/${encodeURIComponent(l.lane_id)}`,
        severity: "answer",
      });
    }
  }

  items.sort((a, b) => (a.at_ms || 0) - (b.at_ms || 0));
  return { items, count: items.length, nowMs };
}

export function buildSystemHealth({ resources = null, capacity = null, placeholders = false } = {}) {
  const o = resources?.overall || null;
  const f = (v, mat, opts) => field(v, mat, { placeholders, ...opts });

  const cpuPct = o?.cpu_load_pct ?? null;
  const memPct = o?.mem_used_pct ?? null;
  const swapUsedMb = o?.swap?.used_mb ?? null;
  const swapTotalMb = o?.swap?.total_mb ?? null;
  const pressure = o?.slots?.pressure || null;

  const slotsTotal = capacity?.total ?? o?.slots?.total ?? null;
  const slotsActive = capacity?.active ?? o?.slots?.occupied ?? null;

  const overall = worstHealth([
    healthFromPercent(cpuPct, { watch: 100, problem: 160 }),
    healthFromPercent(memPct),
    healthFromPressure(pressure),
  ]);

  return {
    overall,
    overall_label: HEALTH_LABEL[overall],
    host_name: f(resources?.host?.name || "Mac mini", MATURITY.LIVE, { label: "Host" }),
    cpu: f(cpuPct, MATURITY.LIVE, { label: "CPU load", unit: "%", absent: "No CPU reading" }),
    cpu_health: healthFromPercent(cpuPct, { watch: 100, problem: 160 }),
    load_1m: f(o?.load_1m ?? null, MATURITY.LIVE, { label: "Load (1m)" }),
    memory: f(memPct, MATURITY.LIVE, { label: "Memory", unit: "%", absent: "No memory reading" }),
    memory_health: healthFromPercent(memPct),
    memory_used: f(o?.mem_used_mb ?? null, MATURITY.LIVE, { label: "Memory used", format: formatGb }),
    memory_total: f(o?.mem_total_mb ?? null, MATURITY.LIVE, { label: "Memory total", format: formatGb }),
    memory_pressure: f(pressure, MATURITY.LIVE, { label: "Memory pressure", absent: "Unknown" }),
    swap: f(swapUsedMb, MATURITY.LIVE, { label: "Swap", format: formatGb, absent: "No swap reading" }),
    swap_total: f(swapTotalMb, MATURITY.LIVE, { label: "Swap allocated", format: formatGb }),
    // Level is measured; TRAJECTORY is not persisted anywhere. See the data
    // contract: DERIVABLE from repeated samples, no owner projects it yet.
    swap_trend: f(null, MATURITY.DERIVABLE, {
      label: "Swap trajectory",
      demo: DEMO.host.swap_trend,
      absent: "No trend yet",
      note: "Needs a rolling host-pressure series",
    }),
    disk_free: f(resources?.disk?.free_gb ?? null, MATURITY.AVAILABLE_NOT_WIRED, {
      label: "Disk free",
      demo: DEMO.host.disk_free_gb,
      unit: " GB",
      absent: "Not available yet",
      note: "health-probes.probeDisk measures it; the Home projection does not read it yet",
    }),
    slots_active: f(slotsActive, MATURITY.LIVE, { label: "Active slots" }),
    slots_total: f(slotsTotal, MATURITY.LIVE, { label: "Slot capacity" }),
    slots_available: f(
      slotsTotal != null && slotsActive != null ? Math.max(0, slotsTotal - slotsActive) : null,
      MATURITY.LIVE, { label: "Available" },
    ),
    admission_pressure: f(pressure, MATURITY.LIVE, { label: "Admission pressure", absent: "Unknown" }),
    gateway: f(resources?.gateway?.state || (o ? "responsive" : null), MATURITY.LIVE, {
      label: "Gateway", absent: "Unknown",
    }),
    gateway_health: resources?.gateway?.state === "unresponsive" ? HEALTH.PROBLEM : (o ? HEALTH.HEALTHY : HEALTH.UNKNOWN),
    dev_servers: f(o?.running_servers ?? null, MATURITY.LIVE, { label: "Development servers" }),
    warning: o?.warning || null,
  };
}

export function buildLaneSummaries({ lanes = [], laneState = () => null, nowMs = Date.now() } = {}) {
  return (Array.isArray(lanes) ? lanes : []).map((l) => {
    const st = laneState(l) || {};
    const run = l.execution_run || null;
    return {
      lane_id: l.lane_id,
      // READ-ONLY IS A STATE, NOT A PROVIDER INTERNAL. An observation-only lane
      // cannot be sent an instruction, so plain "Ready" is a promise it cannot
      // keep. It travels with the state everywhere the operator picks a lane.
      label: l.label || l.lane_id,
      state: `${st.label || "Unknown"}${st.read_only || l.observation_only ? " · read-only" : ""}`,
      state_key: st.key || "idle",
      tone: st.tone || "",
      mark: st.mark || "○",
      live: Boolean(st.live),
      blockers: Number(l.unseen_needs_you || 0) || (st.key === "needs_input" ? 1 : 0),
      at_ms: Number(l.last_activity_ms) || parseMs(run?.updated_at) || null,
      progress: laneProgress(run, { nowMs }),
      href: `#/lanes/${encodeURIComponent(l.lane_id)}`,
    };
  });
}

/* ---------------------------------------------------------------------------
 * PROGRESS — the UI half of the provider progress contract.
 * ------------------------------------------------------------------------- */

/** Mirrors execution-run.mjs PROGRESS_STALE_MS. Restated, not imported: this
 *  module runs in the browser and must not pull in the server store. */
export const PROGRESS_STALE_MS = 30 * 60 * 1000;

/**
 * Turn a run's `progress_estimate` into something a bar can draw, or into an
 * explicit unavailable state.
 *
 * It NEVER computes an ETA. There is no estimator, and dividing elapsed time by
 * a provider's own guess would dress a guess up as a schedule.
 */
export function laneProgress(run, { nowMs = Date.now(), staleMs = PROGRESS_STALE_MS } = {}) {
  const est = run?.progress_estimate || null;
  if (!est) {
    return {
      available: false,
      percent: null,
      label: "Progress estimate unavailable",
      summary: run?.latest_progress?.summary || null,
      updated_label: null,
      source: null,
      confidence: null,
      stale: false,
    };
  }
  const at = Date.parse(est.updated_at || "");
  const age = Number.isFinite(at) ? nowMs - at : Infinity;
  const stale = !(age <= staleMs);
  if (stale) {
    return {
      available: false,
      percent: null,
      label: "Progress estimate unavailable",
      summary: est.summary || run?.latest_progress?.summary || null,
      updated_label: Number.isFinite(at) ? `last estimate ${relativeAge(age)} ago` : null,
      source: est.source || null,
      confidence: est.confidence || null,
      stale: true,
    };
  }
  const pct = Number.isFinite(Number(est.percent)) ? Number(est.percent) : null;
  return {
    available: pct != null,
    percent: pct,
    // "~" and the word ESTIMATE are load-bearing. This number is a provider's
    // guess about its own remaining plan, and the copy has to keep saying so.
    label: pct == null
      ? "Progress estimate unavailable"
      : `${sourceLabel(est.source)}: ~${pct}% complete`,
    summary: est.summary || run?.latest_progress?.summary || null,
    updated_label: Number.isFinite(at) ? `Updated ${relativeAge(age)} ago` : null,
    remaining_work: est.remaining_work || null,
    source: est.source || null,
    confidence: est.confidence || null,
    stale: false,
  };
}

function sourceLabel(source) {
  if (source === "deterministic") return "Measured";
  if (source === "operator") return "Operator estimate";
  if (source === "derived") return "Derived estimate";
  return "Provider estimate";
}

export function relativeAge(ms) {
  const s = Math.max(0, Number(ms) / 1000);
  if (s < 60) return `${s | 0}s`;
  if (s < 3600) return `${(s / 60) | 0}m`;
  if (s < 86400) return `${(s / 3600) | 0}h`;
  return `${(s / 86400) | 0}d`;
}

/* ---------------------------------------------------------------------------
 * AI USAGE and AI EFFECTIVENESS.
 * ------------------------------------------------------------------------- */

export const USAGE_WINDOWS = Object.freeze([
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
]);

export function buildUsageModel({ usage = null, placeholders = false, window = "today" } = {}) {
  const f = (v, mat, opts) => field(v, mat, { placeholders, ...opts });
  const rows = Array.isArray(usage?.providers) ? usage.providers : [];
  const win = usage?.window || window;
  const totals = rows.reduce((a, p) => ({
    runs: a.runs + (Number(p.calls) || 0),
    input: a.input + (Number(p.input_tokens) || 0),
    output: a.output + (Number(p.output_tokens) || 0),
    cache: a.cache + (Number(p.cache_tokens) || 0),
    cost: a.cost + (p.cost?.value_usd != null ? Number(p.cost.value_usd) : 0),
    costKnown: a.costKnown || p.cost?.kind === "authoritative" || p.cost?.kind === "estimate",
    failures: a.failures + (Number(p.failures) || 0),
    runtime: a.runtime + (Number(p.total_duration_ms) || 0),
  }), { runs: 0, input: 0, output: 0, cache: 0, cost: 0, costKnown: false, failures: 0, runtime: 0 });

  return {
    window: win,
    windows: USAGE_WINDOWS,
    // The historical windows need an aggregation this runtime does not perform;
    // only "today" can be answered from the current usage collector.
    window_supported: win === "today",
    providers: rows.map((p) => ({
      provider: p.provider,
      model: f(p.model || null, MATURITY.AVAILABLE_NOT_WIRED, {
        label: "Model", absent: "Model not reported",
        note: "Lane telemetry knows the model; the usage aggregate does not carry it",
      }),
      runs: f(p.calls ?? null, MATURITY.LIVE, { label: "Runs" }),
      auth_state: p.auth_state || "unknown",
      failures: f(p.failures ?? null, MATURITY.LIVE, { label: "Errors" }),
      cost: f(p.cost?.value_usd ?? null, MATURITY.AVAILABLE_NOT_WIRED, {
        label: "Cost", format: formatUsd, absent: "Cost not reported",
        note: "Authoritative only when the provider reports it; no pricing table is configured",
      }),
    })),
    runs: f(totals.runs || null, MATURITY.LIVE, { label: "Runs", demo: DEMO.usage.runs }),
    input_tokens: f(totals.input || null, MATURITY.AVAILABLE_NOT_WIRED, {
      label: "Input tokens", demo: DEMO.usage.input_tokens, format: formatTokens,
      note: "usage.mjs aggregates Director round-trips only; lane provider usage is not aggregated",
    }),
    output_tokens: f(totals.output || null, MATURITY.AVAILABLE_NOT_WIRED, {
      label: "Output tokens", demo: DEMO.usage.output_tokens, format: formatTokens,
      note: "As input tokens",
    }),
    cache_tokens: f(totals.cache || null, MATURITY.INSTRUMENTATION_REQUIRED, {
      label: "Cache tokens", demo: DEMO.usage.cache_tokens, format: formatTokens,
      note: "No collector records cache read/write tokens",
    }),
    total_tokens: f((totals.input + totals.output) || null, MATURITY.AVAILABLE_NOT_WIRED, {
      label: "Total tokens", demo: DEMO.usage.total_tokens, format: formatTokens,
    }),
    cost: f(totals.costKnown ? totals.cost : null, MATURITY.AVAILABLE_NOT_WIRED, {
      label: "Estimated cost", demo: DEMO.usage.cost_usd, format: formatUsd,
      absent: "Cost not reported",
      note: "Shown only when a provider reports it; never blindly estimated",
    }),
    runtime: f(totals.runtime || null, MATURITY.DERIVABLE, {
      label: "Provider runtime", demo: DEMO.usage.runtime_ms, format: formatDurationMs,
      note: "Per-call durations exist; no total is projected",
    }),
    context: f(usage?.context_pct ?? null, MATURITY.AVAILABLE_NOT_WIRED, {
      label: "Context utilisation", demo: DEMO.usage.context_pct, unit: "%",
      note: "lane-telemetry reports per-lane context; no fleet aggregate exists",
    }),
    retries: f(totals.failures || null, MATURITY.LIVE, { label: "Retries / errors", demo: DEMO.usage.retries }),
    note: usage?.cost_note || null,
  };
}

/**
 * EFFECTIVENESS is the surface that answers "is this actually helping?".
 *
 * Almost none of it is instrumented today, and that is the honest answer. The
 * shape is built now so the instrumentation has somewhere to land, and every
 * cell says INSTRUMENTATION_REQUIRED until a run-outcome event exists.
 */
export function buildEffectivenessModel({ effectiveness = null, placeholders = false } = {}) {
  const e = effectiveness || {};
  const f = (v, mat, opts) => field(v, mat, { placeholders, ...opts });
  const need = "Requires run-outcome instrumentation";
  return {
    runs_completed: f(e.runs_completed ?? null, MATURITY.DERIVABLE, {
      label: "Runs completed", demo: DEMO.effectiveness.runs_completed,
      note: "Countable from execution-runs/events.jsonl; no projection exists",
    }),
    autonomous_pct: f(e.autonomous_pct ?? null, MATURITY.INSTRUMENTATION_REQUIRED, {
      label: "Completed without intervention", demo: DEMO.effectiveness.autonomous_pct, unit: "%",
      note: need,
    }),
    interventions: f(e.interventions ?? null, MATURITY.INSTRUMENTATION_REQUIRED, {
      label: "Human interventions", demo: DEMO.effectiveness.interventions, note: need,
    }),
    approval_interruptions: f(e.approval_interruptions ?? null, MATURITY.DERIVABLE, {
      label: "Approval interruptions", demo: DEMO.effectiveness.approval_interruptions,
      note: "Governed action records carry this; no aggregate projection exists",
    }),
    rework_rate: f(e.rework_rate_pct ?? null, MATURITY.INSTRUMENTATION_REQUIRED, {
      label: "Retry / rework rate", demo: DEMO.effectiveness.rework_rate_pct, unit: "%", note: need,
    }),
    avg_runtime: f(e.avg_runtime_ms ?? null, MATURITY.DERIVABLE, {
      label: "Average runtime", demo: DEMO.effectiveness.avg_runtime_ms, format: formatDurationMs,
      note: "Run start/complete timestamps exist; no projection computes the mean",
    }),
    commits: f(e.commits ?? null, MATURITY.AVAILABLE_NOT_WIRED, {
      label: "Commits produced", demo: DEMO.effectiveness.commits,
      note: "source-control.mjs observes commits per lane; not aggregated for this surface",
    }),
    tests: f(e.tests_passed != null && e.tests_run != null ? `${e.tests_passed}/${e.tests_run}` : null,
      MATURITY.INSTRUMENTATION_REQUIRED, {
        label: "Tests passed",
        demo: `${DEMO.effectiveness.tests_passed}/${DEMO.effectiveness.tests_run}`,
        note: "The validation broker runs tests; results are not recorded per run",
      }),
    certifications: f(e.certifications ?? null, MATURITY.INSTRUMENTATION_REQUIRED, {
      label: "Certifications", demo: DEMO.effectiveness.certifications, note: need,
    }),
    promotions: f(e.promotions ?? null, MATURITY.AVAILABLE_NOT_WIRED, {
      label: "Promotions", demo: DEMO.effectiveness.promotions,
      note: "Promotion is recorded in source control events; not aggregated",
    }),
  };
}

/* ---------------------------------------------------------------------------
 * ACTIVITY.
 * ------------------------------------------------------------------------- */

export const ACTIVITY_KINDS = Object.freeze([
  { key: "work", label: "Work" },
  { key: "governance", label: "Governance" },
  { key: "git", label: "Git" },
  { key: "browser", label: "Browser / QA" },
  { key: "system", label: "System" },
  { key: "provider", label: "Provider" },
  { key: "promotion", label: "Promotion" },
  { key: "failure", label: "Failure" },
]);

export const ACTIVITY_OUTCOMES = Object.freeze([
  { key: "all", label: "All" },
  { key: "ok", label: "Succeeded" },
  { key: "attention", label: "Needed attention" },
  { key: "failed", label: "Failed" },
]);

export function buildActivityViewModel({
  events = [],
  lanes = [],
  filters = {},
  nowMs = Date.now(),
} = {}) {
  const labelById = new Map();
  for (const l of lanes) labelById.set(l.lane_id, l.label || l.lane_id);
  const rows = (Array.isArray(events) ? events : []).map((e) => ({
    id: e.id || `${e.at || ""}:${e.type || ""}:${e.lane_id || ""}`,
    lane_id: e.lane_id || null,
    lane_label: labelById.get(e.lane_id) || e.lane_label || e.lane_id || "Vacilando",
    kind: e.kind || "system",
    summary: e.summary || e.type || "Event",
    detail: e.detail || null,
    outcome: e.outcome || "ok",
    provider: e.provider || null,
    at_ms: parseMs(e.at) || Number(e.at_ms) || null,
  }));
  const filtered = rows.filter((r) => {
    if (filters.lane && r.lane_id !== filters.lane) return false;
    if (filters.kind && filters.kind !== "all" && r.kind !== filters.kind) return false;
    if (filters.provider && r.provider !== filters.provider) return false;
    if (filters.outcome && filters.outcome !== "all" && r.outcome !== filters.outcome) return false;
    return true;
  });
  filtered.sort((a, b) => (b.at_ms || 0) - (a.at_ms || 0));
  return {
    rows: filtered,
    total: rows.length,
    kinds: ACTIVITY_KINDS,
    outcomes: ACTIVITY_OUTCOMES,
    lanes: lanes.map((l) => ({ lane_id: l.lane_id, label: l.label || l.lane_id })),
    filters: { lane: null, kind: "all", provider: null, outcome: "all", ...filters },
    nowMs,
  };
}

/* ---------------------------------------------------------------------------
 * SYSTEM view model.
 * ------------------------------------------------------------------------- */

export function buildSystemViewModel({
  resources = null,
  capacity = null,
  diagnostics = null,
  providers = null,
  usage = null,
  history = [],
  placeholders = false,
} = {}) {
  const f = (v, mat, opts) => field(v, mat, { placeholders, ...opts });
  const health = buildSystemHealth({ resources, capacity, placeholders });
  const o = resources?.overall || null;
  return {
    placeholders,
    health,
    host: {
      name: health.host_name,
      cpu: health.cpu,
      load_1m: health.load_1m,
      load_5m: f(o?.load_5m ?? null, MATURITY.LIVE, { label: "Load (5m)" }),
      cpu_count: f(o?.cpu_count ?? null, MATURITY.LIVE, { label: "Cores" }),
      memory: health.memory,
      memory_used: health.memory_used,
      memory_total: health.memory_total,
      memory_pressure: health.memory_pressure,
      swap: health.swap,
      swap_total: health.swap_total,
      swap_trend: health.swap_trend,
      disk_free: health.disk_free,
    },
    capacity: {
      total: health.slots_total,
      active: health.slots_active,
      available: health.slots_available,
      reserved: f(capacity?.reserved ?? null, MATURITY.DERIVABLE, {
        label: "Reserved",
        note: "execution-admission tracks PROVISIONING/ADMITTED claims; not projected as a count",
      }),
      pressure: health.admission_pressure,
      holders: Array.isArray(capacity?.holders) ? capacity.holders : [],
    },
    runtime: {
      gateway: health.gateway,
      gateway_health: health.gateway_health,
      dev_servers: health.dev_servers,
      stale_processes: f(diagnostics?.stale_processes ?? null, MATURITY.AVAILABLE_NOT_WIRED, {
        label: "Stale processes",
        note: "health-probes.probeProcessTable observes them; not projected here",
      }),
      failed_processes: f(diagnostics?.failed_processes ?? null, MATURITY.AVAILABLE_NOT_WIRED, {
        label: "Failed processes",
        note: "As stale processes",
      }),
    },
    providers: {
      rows: Array.isArray(providers?.providers) ? providers.providers : [],
      usage: buildUsageModel({ usage, placeholders }),
    },
    environment: {
      runtime_root: f(resources?.runtime_root || null, MATURITY.LIVE, { label: "Runtime root" }),
      gateway_port: f(resources?.gateway?.port ?? null, MATURITY.LIVE, { label: "Gateway port" }),
      workers: Array.isArray(resources?.workers) ? resources.workers : [],
    },
    // Samples ARE recorded (platform resource history); this surface reads them
    // when the projection supplies them and says so plainly when it does not.
    history: {
      samples: Array.isArray(history) ? history : [],
      available: Array.isArray(history) && history.length > 0,
    },
  };
}

/* ------------------------------------------------------------------------- */

export function parseMs(iso) {
  if (!iso) return null;
  const ms = typeof iso === "number" ? iso : Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/* ===========================================================================
 * THE LANE THREAD
 *
 * A lane is a CONVERSATION between an operator and a provider, with the system
 * occasionally speaking up. V2's first cut rendered every one of those as a
 * similarly weighted white card — Current Work, latest output, the governed
 * outcome, the user's instruction — and in doing so destroyed the two things a
 * conversation is made of: WHO SAID IT and WHEN.
 *
 * This builds one ordered, typed thread. Authorship and chronology are
 * properties of the data, not decisions a renderer makes ad hoc, so no surface
 * can quietly start attributing a provider's output to the operator's composer
 * again.
 * ========================================================================= */

export const MESSAGE_ROLE = Object.freeze({
  /** The operator's submitted instruction, verbatim. */
  USER: "user",
  /** The provider's readable result or update. */
  PROVIDER: "provider",
  /** Something the runtime did. Lower hierarchy; never competes with work. */
  SYSTEM: "system",
  /** A decision waiting on the operator. Only this one is allowed to shout. */
  GOVERNANCE: "governance",
  /** What the run is doing right now, when nothing has been said yet. */
  RUN_STATUS: "run_status",
});

export const ROLE_ORDER = Object.freeze([
  MESSAGE_ROLE.USER,
  MESSAGE_ROLE.PROVIDER,
  MESSAGE_ROLE.SYSTEM,
  MESSAGE_ROLE.GOVERNANCE,
  MESSAGE_ROLE.RUN_STATUS,
]);

function clockOf(ms) {
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/**
 * Build the ordered thread for a lane.
 *
 * `assistant` is the pre-existing assistantMessageSource() result — the
 * canonical owner of "which provider utterance is current". It is consumed
 * rather than re-derived, because two answers to that question is exactly the
 * bug that made a finished summary vanish behind a late pane poll.
 */
export function buildLaneThread(lane, {
  assistant = null,
  lastInstruction = null,
  attachments = [],
  nowMs = Date.now(),
  providerLabel = "Provider",
} = {}) {
  const entries = [];
  const run = lane?.execution_run || lane?.previous_run || null;

  // ---- the operator's instruction -------------------------------------
  const rec = lastInstruction || lane?.last_instruction || null;
  if (rec?.instruction && (rec.status === "delivered" || rec.status === "queued")) {
    const at = parseMs(rec.delivered_at || rec.queued_at) || parseMs(run?.created_at);
    entries.push({
      id: `user:${rec.delivered_at || rec.queued_at || "now"}`,
      role: MESSAGE_ROLE.USER,
      author: "You",
      at_ms: at,
      clock: clockOf(at),
      body: String(rec.instruction),
      attachments: Array.isArray(attachments) ? attachments : [],
      // Delivery is QUIET METADATA. It is a fact about plumbing, not about
      // what the operator said.
      meta: rec.status === "queued" ? "Queued" : "Delivered",
      pending: rec.status === "queued",
    });
  }

  // ---- system history --------------------------------------------------
  // A COMPLETED governed action is HISTORY. It used to render as a permanent
  // high-weight banner directly above the composer, competing with current work
  // forever. It belongs in the thread, at system weight, where it happened.
  const outcome = lane?.last_governed_outcome || null;
  if (outcome) {
    const at = parseMs(outcome.at);
    entries.push({
      id: `system:governed:${outcome.at || outcome.title}`,
      role: MESSAGE_ROLE.SYSTEM,
      author: "System",
      at_ms: at,
      clock: clockOf(at),
      ok: outcome.ok !== false,
      body: [outcome.title, outcome.detail].filter(Boolean).join(" — "),
      meta: outcome.approved_by ? `approved by ${outcome.approved_by}` : null,
    });
  }
  for (const item of (lane?.recent_system_activity || []).slice(0, 3)) {
    const at = parseMs(item.at) || parseMs(item.occurred_at);
    if (!item?.summary) continue;
    entries.push({
      id: `system:${item.at || item.summary}`,
      role: MESSAGE_ROLE.SYSTEM,
      author: "System",
      at_ms: at,
      clock: clockOf(at),
      ok: true,
      body: String(item.summary),
      meta: null,
    });
  }

  // ---- the provider ----------------------------------------------------
  // THE PROVIDER SLOT ALWAYS EXISTS ON AN OPEN LANE.
  //
  // Gated on `assistant.text` this dropped the entry whenever the provider had
  // said nothing yet — and "nothing yet" is itself the answer the operator came
  // for. assistantMessageSource already renders that state ("this run has not
  // reported a summary yet"); silently omitting the row made a lane look empty
  // when it was merely quiet.
  if (assistant) {
    const at = parseMs(run?.updated_at) || Number(lane?.last_activity_ms) || nowMs;
    const working = assistant.kind === "working" || assistant.kind === "live";
    entries.push({
      id: `provider:${assistant.kind}:${run?.run_id || "none"}`,
      role: MESSAGE_ROLE.PROVIDER,
      author: providerLabel,
      at_ms: at,
      clock: clockOf(at),
      body: assistant.text || "",
      source: assistant,
      working,
      // "CLAUDE · WORKING" rather than a clock, when it is mid-utterance.
      meta: working ? "Working" : (assistant.finalized ? "Final report" : null),
    });
  }

  entries.sort((a, b) => (a.at_ms || 0) - (b.at_ms || 0));
  return { entries, nowMs, count: entries.length };
}

/* ---------------------------------------------------------------------------
 * CURRENT WORK IS AN ORIENTATION CARD, NOT A DOCUMENT VIEWER.
 * ------------------------------------------------------------------------- */

export const WORK_TITLE_MAX = 72;
export const WORK_SUMMARY_MAX = 130;

/**
 * Reduce a run to the four things the card is for: what the work is, what phase
 * it is in, how far along, and what state it is in.
 *
 * The full instruction is NOT part of that. It was printed into the card in
 * full, so a long mission pushed the conversation entirely below the fold — the
 * card became a transcript viewer for the one piece of text the operator had
 * just written themselves. It is returned separately as `details` for a
 * disclosure.
 */
export function buildCurrentWork(lane, { nowMs = Date.now() } = {}) {
  const run = lane?.execution_run || null;
  if (!run?.state) return { active: false, title: null, summary: null, details: null, progress: laneProgress(null) };

  const instruction = String(run.instruction || "").trim();
  const lines = instruction.split("\n").map((l) => l.trim()).filter(Boolean);
  const rawTitle = lines[0] || "";
  // A title is a NAME, not the first 400 characters of a briefing.
  const title = rawTitle.length > WORK_TITLE_MAX
    ? `${rawTitle.slice(0, WORK_TITLE_MAX - 1).trimEnd()}…`
    : (rawTitle || "Current work");

  const progress = laneProgress(run, { nowMs });
  // The phase the provider reported beats a re-statement of the instruction:
  // it is the only part of this card that changes as the work advances.
  const phase = progress.summary || run.latest_progress?.summary || run.completion_report?.summary || lines[1] || null;
  const summary = phase && phase.length > WORK_SUMMARY_MAX
    ? `${phase.slice(0, WORK_SUMMARY_MAX - 1).trimEnd()}…`
    : phase;

  const truncated = rawTitle.length > WORK_TITLE_MAX
    || lines.length > 1
    || instruction.length > WORK_TITLE_MAX + WORK_SUMMARY_MAX;

  return {
    active: true,
    title,
    summary,
    progress,
    // Everything the card deliberately did not print, for the disclosure.
    details: truncated ? instruction : null,
    truncated,
    run,
  };
}
