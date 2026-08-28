/**
 * S3 — measured cost for a classified workload.
 *
 * WHY MEASURE AT ALL IN AN OBSERVATION SLICE. The doctrine's V1 weights are
 * estimates. S5 will turn them into a budget, and a budget built on estimates
 * nobody checked is the same guess that produced the original blind spot, just
 * with more ceremony. This records what a workload actually cost so the weights
 * can be revised from evidence.
 *
 * BOUNDED, AND NEVER A PRECONDITION. Sampling is periodic and cheap, every
 * measurement is optional, and a workload whose cost could not be measured is
 * still classified and still recorded. Perfect measurement must never become a
 * prerequisite for classification — that would make the classifier fail exactly
 * when the host is too busy to sample, which is when it matters most.
 *
 * NOT ENFORCEMENT. Nothing here throttles, caps, defers or kills. The wrapper
 * runs the command exactly as it would have run anyway.
 */

export const WORKLOAD_OBSERVATION_SCHEMA = "vacilando.workload_observation.v1";

/** Descendants of a pid from a ps table, bounded in depth. */
export function descendantsOf(pid, rows, { maxDepth = 6 } = {}) {
  const childrenOf = new Map();
  for (const r of rows) {
    if (!childrenOf.has(r.ppid)) childrenOf.set(r.ppid, []);
    childrenOf.get(r.ppid).push(r);
  }
  const out = [];
  let frontier = [Number(pid)];
  const seen = new Set(frontier);
  for (let d = 0; d < maxDepth && frontier.length; d += 1) {
    const next = [];
    for (const p of frontier) {
      for (const child of childrenOf.get(p) || []) {
        if (seen.has(child.pid)) continue;
        seen.add(child.pid);
        out.push(child);
        next.push(child.pid);
      }
    }
    frontier = next;
  }
  return out;
}

/**
 * How many of a workload's descendants are actually workers?
 *
 * Counted by shape rather than by trusting a flag: a runner that ignored
 * --maxWorkers would otherwise report the number it was asked for instead of
 * the number it ran, which is precisely the drift this slice exists to catch.
 */
export function countWorkers(descendants = []) {
  return descendants.filter((d) => {
    const c = String(d.command || "");
    if (/tinypool|worker|--worker|child_process/i.test(c)) return true;
    // A runner's own node children doing the work.
    return /(^|\/)node\b/.test(c) && /vitest|jest|playwright/i.test(c);
  }).length;
}

/**
 * A bounded sampler over the life of a workload.
 *
 * `sample()` is called on an interval; each call is cheap and failures are
 * swallowed, because a missed sample must degrade the record, never the run.
 */
export function createSampler({ pid, readProcessTable, intervalMs = 1000 } = {}) {
  const state = {
    samples: 0,
    peak_descendants: 0,
    peak_workers: 0,
    peak_rss_bytes: null,
    failed_samples: 0,
  };
  let timer = null;

  const sample = async () => {
    try {
      const rows = await readProcessTable();
      if (!rows) { state.failed_samples += 1; return; }
      const kids = descendantsOf(pid, rows);
      state.samples += 1;
      state.peak_descendants = Math.max(state.peak_descendants, kids.length);
      state.peak_workers = Math.max(state.peak_workers, countWorkers(kids));
      const rss = kids.reduce((sum, k) => sum + (Number(k.rss_kb) || 0), 0);
      if (rss > 0) state.peak_rss_bytes = Math.max(state.peak_rss_bytes || 0, rss * 1024);
    } catch {
      state.failed_samples += 1;
    }
  };

  return {
    state,
    start() { if (!timer) { timer = setInterval(sample, intervalMs); } return this; },
    async sampleNow() { await sample(); return state; },
    stop() { if (timer) { clearInterval(timer); timer = null; } return state; },
  };
}

/**
 * Assemble the observation record.
 *
 * Every cost field may be null. `measurement_complete` says plainly whether the
 * numbers can be trusted, so a later reader never mistakes an unsampled run for
 * a cheap one.
 */
export function observationRecord({
  record,
  startedAt,
  endedAt,
  exitCode = null,
  sampler = null,
  cpuSeconds = null,
}) {
  const s = sampler?.state || {};
  const durationMs = startedAt && endedAt ? Date.parse(endedAt) - Date.parse(startedAt) : null;
  const observedWorkers = Number.isFinite(s.peak_workers) && s.peak_workers > 0 ? s.peak_workers : null;

  return {
    schema_version: WORKLOAD_OBSERVATION_SCHEMA,
    workload_id: record?.workload_id || null,
    pid: record?.pid ?? null,
    workload_class: record?.workload_class ?? null,
    expected_weight: record?.expected_weight ?? null,
    weight_policy_version: record?.weight_policy_version ?? null,

    // Attribution is copied from S1 through the classification record.
    root_provider_pid: record?.root_provider_pid ?? null,
    lane_id: record?.lane_id ?? null,
    execution_run_id: record?.execution_run_id ?? null,
    repository_id: record?.repository_id ?? null,
    worktree_path: record?.worktree_path ?? null,

    started_at: startedAt || null,
    ended_at: endedAt || null,
    duration_ms: durationMs,
    exit_code: exitCode,

    workers_requested: record?.workers_requested ?? null,
    observed_workers: observedWorkers,
    peak_descendants: Number.isFinite(s.peak_descendants) ? s.peak_descendants : null,
    peak_rss_bytes: s.peak_rss_bytes ?? null,
    cpu_seconds: cpuSeconds,

    samples: s.samples ?? 0,
    failed_samples: s.failed_samples ?? 0,
    // The honest flag. A run with zero samples is unmeasured, not free.
    measurement_complete: Boolean(s.samples) && !s.failed_samples,
  };
}

/**
 * Concurrent weighted cost across live workloads.
 *
 * S3 computes and REPORTS this. It does not compare it to a budget it is allowed
 * to enforce — S5 owns that. A caller may compare against a proposed budget, and
 * must label the result a diagnostic.
 */
export function concurrentWeightedCost(records = []) {
  let total = 0;
  let exclusive = false;
  const byLane = new Map();
  for (const r of records) {
    if (!r?.workload_class) continue;
    if (r.expected_weight === Infinity) { exclusive = true; continue; }
    const w = Number(r.expected_weight) || 0;
    total += w;
    const k = r.lane_id || "unattributed";
    byLane.set(k, (byLane.get(k) || 0) + w);
  }
  return {
    total_weight: total,
    machine_exclusive_present: exclusive,
    by_lane: Object.fromEntries(byLane),
    workloads: records.length,
  };
}
