/**
 * S2 — first-class read-only health for the host and the Vacilando runtime.
 *
 * WHAT THIS REPLACES. A manual audit that took a long sequence of ad-hoc shell
 * commands and a person to interpret them. That audit found load 54.47, 85 MB
 * free, a 95%-full disk and a Gateway answering in 10 seconds — none of which
 * any Vacilando command could report.
 *
 * TWO LESSONS FROM THAT AUDIT ARE BUILT IN AS CONSTRAINTS.
 *
 * First, a short probe lies under saturation. A 3-second GET of the Gateway
 * returned nothing and looked like an outage; a 15-second GET returned 200 in
 * 10.3s. A health command that concluded "down" from the first would have been
 * confidently wrong, so gateway health distinguishes slow from unreachable and
 * always retries once with a longer bound before saying down.
 *
 * Second, the moment health matters most is the moment the machine can least
 * afford to answer. Every probe is bounded, failures are isolated with
 * allSettled, and a check that cannot complete becomes INCOMPLETE rather than
 * hanging the report. A partial answer during an incident beats a perfect one
 * that never arrives.
 *
 * SCOPE. Observation only. S2 does not correct metadata, cap workers, change
 * admission, reclaim seats or terminate anything. Where a precise conclusion
 * needs workload classification, the check says so and marks itself approximate
 * rather than guessing — validation.collisions is the honest example.
 */

export const HEALTH_SCHEMA = "vacilando.health.v1";
export const SEVERITIES = Object.freeze(["healthy", "watch", "problem"]);

export const CHECKS = Object.freeze([
  "compute.load",
  "memory.pressure",
  "disk.headroom",
  "gateway.responsive",
  "provider.capacity",
  "validation.collisions",
  "runs.stale",
  "providers.orphaned",
  "subprocess.ancestry",
  "lanes.consistency",
  "ports.registry",
  "worktrees.registry",
  "toolkit.retention",
]);

/** Severity ordering, so a report's verdict is the worst finding it contains. */
const RANK = { healthy: 0, watch: 1, problem: 2 };
export function worstSeverity(list = []) {
  let worst = "healthy";
  for (const s of list) if ((RANK[s] ?? 0) > RANK[worst]) worst = s;
  return worst;
}
export function exitCodeFor(severity) {
  return severity === "problem" ? 2 : severity === "watch" ? 1 : 0;
}

/**
 * Hardware, measured — never assumed.
 *
 * `sysctl hw.ncpu` returns EMPTY on this host because the shell runs x86_64
 * under Rosetta, which is exactly why the doctrine's formulas read from `os`
 * instead. A machine that cannot report its own core count falls back to 4,
 * conservative on purpose: under-reporting cores lowers every derived ceiling.
 */
export function measuredHardware({ os } = {}) {
  const cores = Number(os?.cpus?.().length) || 4;
  const memoryBytes = Number(os?.totalmem?.()) || 0;
  return {
    cores,
    memory_bytes: memoryBytes,
    memory_gb: memoryBytes ? Number((memoryBytes / 1073741824).toFixed(1)) : null,
    platform: os?.platform?.() || null,
    hostname: os?.hostname?.() || null,
    uptime_seconds: Number(os?.uptime?.()) || null,
    // Recorded so a future report can be read against the machine it came from.
    cores_source: os?.cpus ? "os.cpus" : "fallback",
  };
}

/**
 * Every threshold as a function of measured hardware.
 *
 * The doctrine's scaling guarantee lives here: nothing in this table is a
 * constant chosen for the machine it was authored on, so the same binary
 * reports honestly on a 14-core Mac mini without turning extra cores into
 * unbounded concurrency.
 */
export function thresholdsFor(hw) {
  const cores = hw?.cores || 4;
  const memGb = hw?.memory_gb || 8;
  return {
    load_watch: cores,
    load_problem: cores * 1.5,
    memory_watch_pct: 15,
    memory_problem_pct: 5,
    memory_floor_gb: Number((memGb * 0.10).toFixed(1)),
    disk_watch_pct: 15,
    disk_problem_pct: 8,
    gateway_watch_ms: 500,
    gateway_problem_ms: 3000,
    max_active_providers: Math.max(1, Math.floor(cores / 3)),
    toolkit_keep_n: 10,
    toolkit_watch_multiple: 2,
    toolkit_problem_multiple: 4,
  };
}

/** A finding, in the contract's shape. Every field is explicit. */
export function finding({
  check,
  severity,
  owner_resource = null,
  measurements = {},
  evidence = [],
  explanation = "",
  suggested_action = null,
  confidence = "measured",
  incomplete = false,
}) {
  return {
    check,
    severity,
    owner_resource,
    measurements,
    evidence: Array.isArray(evidence) ? evidence : [evidence],
    explanation,
    suggested_action,
    confidence,
    incomplete,
  };
}

/** A check that could not complete. Never fatal; never silently healthy. */
export function incompleteFinding(check, reason) {
  return finding({
    check,
    severity: "watch",
    owner_resource: null,
    measurements: {},
    evidence: [String(reason || "probe failed")],
    explanation: "This check could not complete, so the report is partial.",
    suggested_action: "Re-run when the host is quieter, or run this check alone.",
    confidence: "unavailable",
    incomplete: true,
  });
}

// ── Individual checks. Each is PURE: probe results in, one finding out. ───────

export function checkComputeLoad({ hw, thresholds, load }) {
  if (!load || !Number.isFinite(load.one)) return incompleteFinding("compute.load", "load average unavailable");
  const sev = load.one > thresholds.load_problem ? "problem"
    : load.one >= thresholds.load_watch ? "watch" : "healthy";
  return finding({
    check: "compute.load",
    severity: sev,
    owner_resource: "host.cpu",
    measurements: { load_1m: load.one, load_5m: load.five, load_15m: load.fifteen, cores: hw.cores,
      watch_at: thresholds.load_watch, problem_at: thresholds.load_problem },
    evidence: [`load ${load.one.toFixed(2)} / ${load.five.toFixed(2)} / ${load.fifteen.toFixed(2)} on ${hw.cores} cores`],
    explanation: sev === "healthy"
      ? "Load is below the core count; there is room for additional work."
      : `Load is ${(load.one / hw.cores).toFixed(1)}× the core count.`,
    suggested_action: sev === "healthy" ? null : "Identify the heaviest owned workloads before admitting more.",
  });
}

export function checkMemoryPressure({ hw, thresholds, memory }) {
  if (!memory || !Number.isFinite(memory.free_pct)) return incompleteFinding("memory.pressure", "memory statistics unavailable");
  const swapping = memory.swap_rate_known === true && memory.swapouts_delta > 0;
  const sev = memory.free_pct < thresholds.memory_problem_pct || swapping ? "problem"
    : memory.free_pct < thresholds.memory_watch_pct ? "watch" : "healthy";
  return finding({
    check: "memory.pressure",
    severity: sev,
    owner_resource: "host.memory",
    measurements: {
      free_pct: memory.free_pct, free_gb: memory.free_gb, compressor_gb: memory.compressor_gb,
      swapouts_delta: memory.swap_rate_known ? memory.swapouts_delta : null,
      swap_rate_known: memory.swap_rate_known === true, total_gb: hw.memory_gb,
    },
    evidence: [
      `${memory.free_gb} GB free of ${hw.memory_gb} GB (${memory.free_pct.toFixed(1)}%)`,
      `compressor holding ${memory.compressor_gb} GB`,
      memory.swap_rate_known
        ? `${memory.swapouts_delta} swapouts in the sample interval`
        : "swap rate unavailable (single sample) — lifetime counters deliberately not used as a pressure signal",
    ],
    explanation: swapping
      ? "The machine is actively swapping during the sample, not merely showing lifetime counters."
      : sev === "healthy" ? "Free memory is comfortable." : "Free memory is low; the compressor is absorbing the difference.",
    suggested_action: sev === "healthy" ? null : "Reduce concurrent heavy workloads or release an idle provider seat.",
    // A single sample cannot prove live pressure from swap alone.
    confidence: memory.swap_rate_known ? "measured" : "approximate",
  });
}

export function checkDiskHeadroom({ thresholds, disk }) {
  if (!disk || !Number.isFinite(disk.free_pct)) return incompleteFinding("disk.headroom", "filesystem statistics unavailable");
  const sev = disk.free_pct < thresholds.disk_problem_pct ? "problem"
    : disk.free_pct < thresholds.disk_watch_pct ? "watch" : "healthy";
  return finding({
    check: "disk.headroom",
    severity: sev,
    owner_resource: "host.disk",
    measurements: { free_pct: disk.free_pct, free_gb: disk.free_gb, total_gb: disk.total_gb, mount: disk.mount },
    evidence: [`${disk.free_gb} GB free of ${disk.total_gb} GB on ${disk.mount} (${disk.free_pct.toFixed(1)}%)`],
    explanation: sev === "healthy" ? "Disk headroom is sufficient for builds and installs." : "Disk headroom is low.",
    suggested_action: sev === "healthy" ? null : "Review caches, npm store and retained toolkit versions.",
  });
}

/**
 * Gateway responsiveness, with the false-outage lesson encoded.
 *
 * `gateway` carries the outcome of a bounded first probe and, only when that
 * one timed out, a second longer-bounded retry. Down is asserted ONLY when both
 * fail — the audit's 3s probe reported nothing for a Gateway that was serving
 * in 10.3s.
 */
export function checkGatewayResponsive({ thresholds, gateway }) {
  if (!gateway) return incompleteFinding("gateway.responsive", "gateway probe did not run");
  const { status, ms, retried, retry_ok, retry_ms } = gateway;
  let sev; let explanation; let action = null;
  if (status === "ok" && ms < thresholds.gateway_watch_ms) {
    sev = "healthy"; explanation = "The Gateway answers promptly.";
  } else if (status === "ok" && ms < thresholds.gateway_problem_ms) {
    sev = "watch"; explanation = "The Gateway is answering slowly.";
    action = "Check host load; the Gateway degrades with CPU saturation before it fails.";
  } else if (status === "ok") {
    sev = "problem"; explanation = "The Gateway is answering, but far slower than usable.";
    action = "Reduce host load; the Gateway is live but degraded.";
  } else if (retried && retry_ok) {
    sev = "problem";
    explanation = "The first bounded probe timed out; a longer retry succeeded. The Gateway is live but severely degraded.";
    action = "Treat as degraded, not down. Reduce host load.";
  } else {
    sev = "problem";
    explanation = "The Gateway did not answer the first probe or the longer retry. Treated as unreachable.";
    action = "Check the launchd job com.alloy.vacilando-gateway.";
  }
  return finding({
    check: "gateway.responsive",
    severity: sev,
    owner_resource: "vacilando.gateway",
    measurements: { status, first_probe_ms: ms ?? null, retried: Boolean(retried), retry_ok: retry_ok ?? null, retry_ms: retry_ms ?? null,
      watch_at_ms: thresholds.gateway_watch_ms, problem_at_ms: thresholds.gateway_problem_ms },
    evidence: [
      status === "ok" ? `responded in ${ms} ms` : "first bounded probe did not respond",
      retried ? (retry_ok ? `bounded retry succeeded in ${retry_ms} ms` : "bounded retry also failed") : "no retry required",
    ],
    explanation,
    suggested_action: action,
  });
}

export function checkProviderCapacity({ thresholds, seats = [], configuredMax = null }) {
  const max = Number.isFinite(configuredMax) ? configuredMax : thresholds.max_active_providers;
  const active = seats.length;
  const sev = active > max ? "problem" : active === max ? "watch" : "healthy";
  return finding({
    check: "provider.capacity",
    severity: sev,
    owner_resource: "vacilando.provider_capacity",
    measurements: { active_seats: active, max_active: max, derived_max: thresholds.max_active_providers },
    evidence: seats.map((s) => `pid ${s.pid} · ${s.provider} · ${s.lane_name || s.lane_id || "unbound"}`),
    explanation: sev === "problem"
      ? "More provider seats are live than the configured ceiling allows."
      : sev === "watch" ? "Provider seats are at the ceiling." : "Provider seats are within the ceiling.",
    suggested_action: sev === "healthy" ? null : "Seats are counted, not gated at spawn; release an idle seat or raise the ceiling deliberately.",
  });
}

/**
 * Validation collisions — now backed by S3 classification.
 *
 * Until S3 this reported a shape heuristic and marked itself
 * approximate_pending_s3, because claiming a weighted cost it could not compute
 * would have invented the number the doctrine says must be measured. It now
 * consumes authoritative workload classes and reports real weights.
 *
 * WHAT IT STILL MUST NOT DO. There is no enforcement budget in S3. The
 * comparison against `proposed_budget` is a DIAGNOSTIC — it says what a future
 * S5 budget would have concluded, and says so in the finding. Exceeding it is
 * not a violation, because nothing has agreed to enforce it yet.
 */
export function checkValidationCollisions({ hw, workloads = [], cost = null, proposedBudget = null }) {
  const classified = workloads.filter((w) => w.workload_class);
  const unknown = workloads.filter((w) => !w.workload_class);
  const seats = new Set(classified.map((w) => w.root_provider_pid).filter((p) => p != null));
  const total = cost?.total_weight ?? 0;
  const budget = Number.isFinite(proposedBudget)
    ? proposedBudget
    : Math.max(2, Math.floor((hw?.cores || 4) * 0.75));

  const exceedsProposed = total > budget || cost?.machine_exclusive_present === true;
  const sev = exceedsProposed ? "watch" : seats.size > 1 ? "watch" : "healthy";

  return finding({
    check: "validation.collisions",
    severity: sev,
    owner_resource: "vacilando.validation",
    measurements: {
      classified_workloads: classified.length,
      unknown_invocations: unknown.length,
      distinct_seats: seats.size,
      concurrent_weight: total,
      by_lane: cost?.by_lane || {},
      machine_exclusive_present: cost?.machine_exclusive_present || false,
      // Named to make its status unmistakable at every call site.
      proposed_s5_budget: budget,
      exceeds_proposed_s5_budget: exceedsProposed,
      weight_policy_version: classified[0]?.weight_policy_version || null,
    },
    evidence: classified.slice(0, 8).map((w) => ({
      pid: w.pid,
      lane_id: w.lane_id,
      lane_name: w.lane_name,
      execution_run_id: w.execution_run_id,
      workload_class: w.workload_class,
      workload_label: w.workload_label,
      workers_requested: w.workers_requested,
      expected_weight: w.expected_weight,
      confidence: w.confidence,
      command: String(w.command || "").slice(0, 60),
    })),
    explanation: exceedsProposed
      ? `Concurrent validation weight is ${total} against a proposed future budget of ${budget}. S3 measures; it does not enforce.`
      : seats.size > 1
        ? `Validation is running under ${seats.size} seats at once, within the proposed budget of ${budget}.`
        : "No concurrent cross-seat validation detected.",
    suggested_action: exceedsProposed
      ? "Diagnostic only — no budget is enforced until S5. Confirm the concurrent runs are intended."
      : null,
    // Classification is authoritative; the BUDGET comparison is not enforcement.
    confidence: classified.length ? "measured" : "measured",
  });
}

export function checkRunsStale({ runs = [], bounds = {} }) {
  const unbounded = [];
  const breached = [];
  for (const r of runs) {
    if (!r || r.terminal) continue;
    const reason = r.state_reason || null;
    const bound = reason ? bounds[reason] : undefined;
    if (bound === undefined) {
      // The doctrine's rule: a waiting state with no bound IS the problem.
      unbounded.push(r);
    } else if (Number.isFinite(r.age_ms) && r.age_ms > bound) {
      breached.push(r);
    }
  }
  const sev = unbounded.length || breached.length ? "problem" : "healthy";
  return finding({
    check: "runs.stale",
    severity: sev,
    owner_resource: "vacilando.execution_run",
    measurements: { non_terminal: runs.filter((r) => !r.terminal).length, unbounded: unbounded.length, breached: breached.length },
    evidence: [...unbounded, ...breached].map((r) =>
      `${r.run_id} · ${r.state} · reason ${r.state_reason || "none"} · ${Math.round((r.age_ms || 0) / 60000)}m`),
    explanation: unbounded.length
      ? "A non-terminal run is waiting on a reason that has no configured bound, so nothing can ever resolve it."
      : breached.length ? "A run has waited past its configured bound." : "Every non-terminal run is within a bound.",
    // Age alone is never the verdict — the reason and its bound are.
    suggested_action: sev === "healthy" ? null : "Give the waiting reason a bound, or resolve the run explicitly.",
  });
}

export function checkProvidersOrphaned({ seats = [], panes = [] }) {
  const paneBySeatPid = new Set(panes.map((p) => p.pid));
  const orphaned = seats.filter((s) => !paneBySeatPid.has(s.pid));
  const unbound = seats.filter((s) => !s.lane_id);
  const sev = orphaned.length ? "problem" : unbound.length ? "watch" : "healthy";
  return finding({
    check: "providers.orphaned",
    severity: sev,
    owner_resource: "vacilando.provider_capacity",
    measurements: { seats: seats.length, without_pane: orphaned.length, without_lane: unbound.length },
    evidence: [...orphaned, ...unbound].map((s) => `pid ${s.pid} · ${s.tmux_session || "no session"} · ${s.lane_id || "no lane"}`),
    explanation: orphaned.length ? "A provider seat has no owning tmux pane."
      : unbound.length ? "A provider seat is not bound to a lane." : "Every provider seat has a pane and a lane.",
    suggested_action: sev === "healthy" ? null : "Correlate the seat before acting; do not terminate on this signal alone.",
  });
}

/**
 * Subprocess ancestry — the S1 integration point.
 *
 * S1's records are consumed as-is. Health never re-derives ancestry, and an
 * unattributed heavy process stays visible rather than being dropped for being
 * inconvenient.
 */
export function checkSubprocessAncestry({ attribution }) {
  if (!attribution) return incompleteFinding("subprocess.ancestry", "attribution report unavailable");
  const records = attribution.records || [];
  const unattributed = records.filter((r) => r.attribution_status === "unattributed");
  const outside = records.filter((r) => r.execution_location === "outside_worktree");
  const sev = unattributed.length ? "problem" : outside.length ? "watch" : "healthy";
  return finding({
    check: "subprocess.ancestry",
    severity: sev,
    owner_resource: "vacilando.process_attribution",
    measurements: {
      attributed: attribution.attributed_count ?? records.filter((r) => r.attribution_status !== "unattributed").length,
      unattributed: unattributed.length,
      outside_worktree: outside.length,
      seats: attribution.seat_count ?? null,
    },
    evidence: [...unattributed, ...outside].slice(0, 8).map((r) => ({
      pid: r.pid,
      root_provider_pid: r.root_provider_pid,
      lane_id: r.lane_id,
      execution_run_id: r.execution_run_id,
      repository_id: r.repository_id,
      worktree_path: r.worktree_path,
      attribution_status: r.attribution_status,
      execution_location: r.execution_location,
      command: String(r.command || "").slice(0, 70),
    })),
    explanation: unattributed.length
      ? "A heavy process has no provider seat in its ancestry, so Vacilando cannot say who owns it."
      : outside.length ? "Owned work is running outside its registered worktree." : "Every observed workload resolves to a provider seat.",
    suggested_action: sev === "healthy" ? null : "Identify the owner before acting. Unattributed does not mean abandoned.",
  });
}

/**
 * States in which a run is ACTUALLY being worked, and therefore must have a
 * provider process. Mirrors provider-capacity's ACTIVE_RUN_STATES.
 *
 * QUEUED, NEEDS_INPUT and WAITING_RESOURCE are parked: having no provider is
 * what those states MEAN. Treating every non-terminal run as active reported
 * the Fixture Proof queue entry as an "impossible combination" when it is
 * merely waiting — a false problem, caught on the first live run.
 */
export const RUNNING_RUN_STATES = Object.freeze(["EXECUTING", "VALIDATING", "RECOVERING"]);

export function checkLanesConsistency({ lanes = [], seats = [] }) {
  const seatByLane = new Map();
  for (const s of seats) if (s.lane_id) seatByLane.set(s.lane_id, s);
  const runsWithoutSeat = [];
  const seatsWithoutRun = [];
  for (const l of lanes) {
    const hasSeat = seatByLane.has(l.lane_id);
    const activeRun = RUNNING_RUN_STATES.includes(l.run_state);
    if (activeRun && !hasSeat) runsWithoutSeat.push(l);
    if (hasSeat && !activeRun) seatsWithoutRun.push(l);
  }
  const sev = runsWithoutSeat.length ? "problem" : seatsWithoutRun.length ? "watch" : "healthy";
  return finding({
    check: "lanes.consistency",
    severity: sev,
    owner_resource: "vacilando.development_lane",
    measurements: { lanes: lanes.length, seats: seats.length, runs_without_seat: runsWithoutSeat.length, seats_without_run: seatsWithoutRun.length },
    evidence: [
      ...runsWithoutSeat.map((l) => `${l.name || l.lane_id}: run ${l.run_state} with no provider process`),
      ...seatsWithoutRun.map((l) => `${l.name || l.lane_id}: seat held, no active run`),
    ],
    explanation: runsWithoutSeat.length
      ? "A lane reports active work with no provider process to do it — an impossible combination."
      : seatsWithoutRun.length ? "A seat is held with no active run. Normal, and reclaimable under contention." : "Seats and runs agree.",
    suggested_action: runsWithoutSeat.length ? "Reconcile the run; the work is not actually progressing." : null,
  });
}

export function checkPortsRegistry({ ports = [] }) {
  const foreign = ports.filter((p) => p.verdict === "foreign-owner" || p.verdict === "unregistered-server");
  const stale = ports.filter((p) => p.verdict === "stale-record");
  const sev = foreign.length ? "problem" : stale.length ? "watch" : "healthy";
  return finding({
    check: "ports.registry",
    severity: sev,
    owner_resource: "vacilando.slot_registry",
    measurements: { inspected: ports.length, matched: ports.filter((p) => p.verdict === "matched").length, stale: stale.length, foreign: foreign.length },
    evidence: [...foreign, ...stale].map((p) => `port ${p.port}: ${p.verdict} · registered ${p.registered || "none"} · serving ${p.serving || "nothing"}`),
    explanation: foreign.length ? "A port is served by something the registry does not record as its owner."
      : stale.length ? "The registry records a server that is not running." : "Registry and observed ports agree.",
    suggested_action: sev === "healthy" ? null : "S2 observes only. Reconciliation is S7; do not stop a working server to match a file.",
  });
}

export function checkWorktreesRegistry({ onDisk = 0, registered = 0, unmanaged = [] }) {
  const sev = unmanaged.length > 0 ? "watch" : "healthy";
  return finding({
    check: "worktrees.registry",
    severity: sev,
    owner_resource: "vacilando.repository_worktree",
    measurements: { on_disk: onDisk, registered, unmanaged: unmanaged.length },
    evidence: unmanaged.slice(0, 10),
    explanation: unmanaged.length
      ? `${unmanaged.length} worktrees exist on disk with no registry entry. Registration happens on one path only.`
      : "Every worktree on disk is registered.",
    suggested_action: unmanaged.length ? "Adopt as unmanaged in S7; never delete on this signal." : null,
  });
}

export function checkToolkitRetention({ thresholds, installed = 0, current = null }) {
  const keep = thresholds.toolkit_keep_n;
  const sev = installed > keep * thresholds.toolkit_problem_multiple ? "problem"
    : installed > keep * thresholds.toolkit_watch_multiple ? "watch" : "healthy";
  return finding({
    check: "toolkit.retention",
    severity: sev,
    owner_resource: "vacilando.toolkit",
    measurements: { installed, keep_n: keep, watch_above: keep * thresholds.toolkit_watch_multiple, problem_above: keep * thresholds.toolkit_problem_multiple, current },
    evidence: [`${installed} installed versions; current ${current || "unknown"}`],
    explanation: sev === "healthy" ? "Toolkit retention is within policy."
      : "Toolkit versions have accumulated well past the retention target; no prune capability exists yet.",
    suggested_action: sev === "healthy" ? null : "Pruning is S9 and must stay explicit — the toolkit is the machine's recovery path.",
  });
}

/**
 * Compose one report.
 *
 * `probeResults` is whatever the caller managed to gather; anything missing
 * becomes an INCOMPLETE finding rather than a missing row or a false healthy.
 */
export function composeReport({
  hw,
  thresholds,
  probeResults = {},
  only = null,
  startedAt,
  endedAt,
}) {
  const want = only ? CHECKS.filter((c) => c === only) : CHECKS;
  const findings = [];
  const safe = (name, fn) => {
    if (!want.includes(name)) return;
    try { findings.push(fn()); }
    catch (err) { findings.push(incompleteFinding(name, err?.message || String(err))); }
  };

  safe("compute.load", () => checkComputeLoad({ hw, thresholds, load: probeResults.load }));
  safe("memory.pressure", () => checkMemoryPressure({ hw, thresholds, memory: probeResults.memory }));
  safe("disk.headroom", () => checkDiskHeadroom({ thresholds, disk: probeResults.disk }));
  safe("gateway.responsive", () => checkGatewayResponsive({ thresholds, gateway: probeResults.gateway }));
  safe("provider.capacity", () => checkProviderCapacity({ thresholds, seats: probeResults.seats || [], configuredMax: probeResults.configured_max }));
  safe("validation.collisions", () => checkValidationCollisions({
    hw,
    workloads: probeResults.workloads || [],
    cost: probeResults.workload_cost || null,
    proposedBudget: probeResults.proposed_budget ?? null,
  }));
  safe("runs.stale", () => checkRunsStale({ runs: probeResults.runs || [], bounds: probeResults.run_bounds || {} }));
  safe("providers.orphaned", () => checkProvidersOrphaned({ seats: probeResults.seats || [], panes: probeResults.panes || [] }));
  safe("subprocess.ancestry", () => checkSubprocessAncestry({ attribution: probeResults.attribution }));
  safe("lanes.consistency", () => checkLanesConsistency({ lanes: probeResults.lanes || [], seats: probeResults.seats || [] }));
  safe("ports.registry", () => checkPortsRegistry({ ports: probeResults.ports || [] }));
  safe("worktrees.registry", () => checkWorktreesRegistry(probeResults.worktrees || {}));
  safe("toolkit.retention", () => checkToolkitRetention({ thresholds, ...(probeResults.toolkit || {}) }));

  const counts = { healthy: 0, watch: 0, problem: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
  const verdict = worstSeverity(findings.map((f) => f.severity));
  const incomplete = findings.some((f) => f.incomplete);

  // Problems first, then watch, then healthy — an incident reads top-down.
  const ordered = [...findings].sort((a, b) => RANK[b.severity] - RANK[a.severity]);

  return {
    schema_version: HEALTH_SCHEMA,
    host: { hostname: hw.hostname, platform: hw.platform, uptime_seconds: hw.uptime_seconds },
    hardware: hw,
    thresholds,
    verdict,
    exit_code: exitCodeFor(verdict),
    started_at: startedAt,
    ended_at: endedAt,
    duration_ms: startedAt && endedAt ? Date.parse(endedAt) - Date.parse(startedAt) : null,
    incomplete,
    counts,
    findings: ordered,
  };
}
