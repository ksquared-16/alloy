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
  "provider.seats",
  "validation.collisions",
  "validation.routing",
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
    // Provider, token and worker ceilings are NOT derived here. capacity-policy
    // is their single owner; health reads them from the policy it is given.
    // Three modules once derived this independently and could disagree.
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
  if (!memory || memory.incomplete === true) return incompleteFinding("memory.pressure", "memory statistics unavailable");

  // Severity comes from the canonical snapshot, which health and capacity
  // admission both consume — they cannot disagree about what the host has.
  // It used to be derived here from `Pages free`, which on macOS is near zero
  // by design: a machine with 5 GB available and no swapping was reported as a
  // memory PROBLEM, and S4 refused every production build on the same number.
  const state = memory.pressure_state || "unknown";
  const sev = state === "pressure" || state === "unknown" ? "problem"
    : state === "watch" ? "watch" : "healthy";

  return finding({
    check: "memory.pressure",
    severity: sev,
    owner_resource: "host.memory",
    measurements: {
      total_gb: memory.total_gb ?? hw.memory_gb,
      // Kept, and clearly NOT the admission signal.
      free_gb: memory.free_gb,
      inactive_gb: memory.inactive_gb,
      reclaimable_gb: memory.reclaimable_gb,
      available_gb: memory.available_gb,
      available_pct: memory.available_pct,
      reserve_gb: memory.reserve_gb,
      available_above_reserve_gb: memory.available_above_reserve_gb,
      compressor_gb: memory.compressor_gb,
      os_free_pct: memory.os_free_pct,
      swapouts_delta: memory.swap_rate_known ? memory.swapouts_delta : null,
      swap_rate_known: memory.swap_rate_known === true,
      pressure_state: state,
      measurement_strategy: memory.measurement_strategy,
      inactive_reclaim_fraction: memory.inactive_reclaim_fraction,
      policy_version: memory.policy_version,
    },
    evidence: [
      `${memory.available_gb} GB available of ${memory.total_gb} GB against a ${memory.reserve_gb} GB reserve`,
      `free pages ${memory.free_gb} GB · inactive ${memory.inactive_gb} GB · ${memory.inactive_reclaim_fraction} of inactive counted as reclaimable`,
      `compressor holding ${memory.compressor_gb} GB — never counted as available`,
      memory.swap_rate_known
        ? `${memory.swapouts_delta} swapouts in the sample interval`
        : "swap rate unavailable (single sample) — lifetime counters deliberately not used as a pressure signal",
      ...(memory.pressure_reasons || []),
    ],
    explanation: sev === "healthy"
      ? "Available memory is above the reserve and the host is not swapping."
      : state === "watch"
        ? `Memory is usable but worth watching: ${(memory.pressure_reasons || []).join("; ")}`
        : `The host is under memory pressure: ${(memory.pressure_reasons || []).join("; ")}`,
    suggested_action: sev === "healthy" ? null
      : "Let running work finish. Expensive validation is gated by the same snapshot; nothing is killed to reclaim memory.",
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

export function checkProviderCapacity({ capacity = null, seats = [], configuredMax = null }) {
  // The ceiling comes from the canonical capacity policy; the configured
  // operator override still wins when present.
  const derived = capacity?.axes?.provider_capacity?.ceiling ?? null;
  const max = Number.isFinite(configuredMax) ? configuredMax : (derived ?? 1);
  const active = seats.length;
  const sev = active > max ? "problem" : active === max ? "watch" : "healthy";
  return finding({
    check: "provider.capacity",
    severity: sev,
    owner_resource: "vacilando.provider_capacity",
    measurements: {
      active_seats: active, max_active: max, derived_max: derived,
      bounded_by: capacity?.axes?.provider_capacity?.bounded_by ?? null,
      remaining: capacity?.axes?.provider_capacity?.remaining ?? null,
      capacity_policy_version: capacity?.policy_version ?? null,
    },
    evidence: seats.map((s) => `pid ${s.pid} · ${s.provider} · ${s.lane_name || s.lane_id || "unbound"}`),
    explanation: sev === "problem"
      ? "More provider seats are live than the configured ceiling allows."
      : sev === "watch" ? "Provider seats are at the ceiling." : "Provider seats are within the ceiling.",
    suggested_action: sev === "healthy" ? null : "Seats are counted, not gated at spawn; release an idle seat or raise the ceiling deliberately.",
  });
}

/**
 * S8 — provider seat state.
 *
 * WHAT THIS CHECK IS FOR. `provider.capacity` counts seats against a ceiling.
 * This one says what those seats ARE DOING, because the two failure modes that
 * matter are invisible to a count: capacity refused while a reclaimable idle
 * seat sits there, and a lane left claiming a live provider that is gone.
 *
 * AN IDLE RECLAIMABLE SEAT IS NOT A DEFECT. Nobody is waiting for it. It is
 * reported at the policy's `idle_severity` so an operator can see spare
 * capacity exists — never as a problem, because reporting it as one would
 * pressure a future reader into building the timer this slice exists to forbid.
 *
 * THE REAL PROBLEM IS THE PAIR. A run blocked on provider capacity WHILE
 * reclaimable seats exist and nothing is reclaiming means the yield path is not
 * working, and that is worth waking someone for.
 */
export function checkProviderSeats({
  seats = [],
  summary = null,
  waitingOnProviderCapacity = [],
  reclaimsInFlight = [],
  ceiling = null,
  policy = null,
}) {
  const idleSeverity = policy?.idle_severity || "watch";
  const counts = summary?.counts || {};
  const idleReclaimable = summary?.idle_reclaimable ?? seats.filter((s) => s.state === "idle" && s.reclaimable).length;
  const holding = summary?.holding_capacity ?? seats.filter((s) => s.holds_capacity).length;
  const resumeFailures = seats.filter((s) => s.state === "dormant" && s.last_resume_result && s.last_resume_result.ok === false);
  const waiting = waitingOnProviderCapacity.length;

  const problems = [];
  if (waiting > 0 && idleReclaimable > 0 && reclaimsInFlight.length === 0) {
    problems.push(`${waiting} admission(s) blocked on provider capacity while ${idleReclaimable} reclaimable idle seat(s) exist and no reclaim is running`);
  }
  if (Number.isFinite(ceiling) && holding > ceiling) {
    problems.push(`${holding} seats hold capacity against a ceiling of ${ceiling}`);
  }
  if (resumeFailures.length) {
    problems.push(`${resumeFailures.length} dormant lane(s) failed to resume`);
  }

  const severity = problems.length ? "problem"
    : (reclaimsInFlight.length || idleReclaimable) ? (reclaimsInFlight.length ? "watch" : idleSeverity)
      : "healthy";

  return finding({
    check: "provider.seats",
    severity,
    owner_resource: "vacilando.provider_capacity",
    measurements: {
      active: counts.active || 0,
      attentive: counts.attentive || 0,
      idle_reclaimable: idleReclaimable,
      dormant: counts.dormant || 0,
      blocked: counts.blocked || 0,
      holding_capacity: holding,
      ceiling,
      over_capacity: Number.isFinite(ceiling) ? Math.max(0, holding - ceiling) : null,
      provider_admission_waiting: waiting,
      reclaims_in_flight: reclaimsInFlight.length,
      resume_failures: resumeFailures.length,
      longest_idle_ms: summary?.longest_idle_ms ?? null,
      idle_grace_policy: policy?.version ?? null,
    },
    evidence: seats.map((s) => {
      const bits = [`${s.lane_name || s.lane_id || "unbound"} · ${s.state}`];
      if (s.state === "idle") bits.push(`idle ${Math.round((s.idle_ms || 0) / 60000)}m · reclaimable`);
      if (s.state === "dormant") bits.push(`resume available · resumed ${s.resume_count || 0}×`);
      if (s.state === "blocked") bits.push(`blocked on ${s.blocker_kind}`);
      if (s.state_reason && s.state !== "idle") bits.push(s.state_reason);
      return bits.join(" · ");
    }),
    explanation: problems.length ? problems.join("; ")
      : idleReclaimable
        ? `${idleReclaimable} idle seat(s) are reclaimable; nothing is waiting for them, so they stay live.`
        : "Every provider seat is doing work, attentive, blocked on a named condition, or dormant.",
    suggested_action: problems.length
      ? "Seats only yield under contention; check that the admission path is calling the reclaim, and that the candidates still pass their final eligibility recheck."
      : null,
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
export function checkValidationCollisions({ hw, workloads = [], cost = null, capacity = null, enforcement = null }) {
  const classified = workloads.filter((w) => w.workload_class);
  const unknown = workloads.filter((w) => !w.workload_class);
  const seats = new Set(classified.map((w) => w.root_provider_pid).filter((p) => p != null));
  const total = cost?.total_weight ?? 0;
  // S4 owns the token budget. Health reads it; it does not derive it.
  const budget = capacity?.axes?.validation_capacity?.tokens ?? 2;
  const workerCeiling = capacity?.axes?.validation_capacity?.worker_ceiling ?? null;

  // S5: the budget is ENFORCED. Health now distinguishes available capacity,
  // at-budget, queued-by-capacity, unbrokered work, over-budget and drift.
  const governedHeld = enforcement?.governed_held ?? 0;
  const unbrokered = enforcement?.unbrokered_observed ?? 0;
  const queued = enforcement?.queued ?? 0;
  const drift = enforcement?.worker_cap_drift ?? 0;
  const exclusiveActive = enforcement?.exclusive_held === true;
  const overBudget = governedHeld + unbrokered > budget;

  const exceedsProposed = total > budget || cost?.machine_exclusive_present === true;
  const sev = overBudget || drift > 0 ? "problem"
    : (unbrokered > 0 || queued > 0 || exceedsProposed) ? "watch"
      : seats.size > 1 ? "watch" : "healthy";

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
      canonical_token_budget: budget,
      worker_ceiling: workerCeiling,
      capacity_policy_version: capacity?.policy_version ?? null,
      bounded_by: capacity?.axes?.validation_capacity?.bounded_by ?? null,
      exceeds_canonical_budget: exceedsProposed,
      enforced: true,
      governed_held: governedHeld,
      unbrokered_observed_weight: unbrokered,
      queued_by_capacity: queued,
      worker_cap_drift: drift,
      machine_exclusive_active: exclusiveActive,
      over_enforced_budget: overBudget,
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
    explanation: overBudget
      ? `Governed ${governedHeld} plus unbrokered ${unbrokered} exceeds the enforced budget of ${budget}. Unbrokered work is not admitted through the broker and is counted, not killed.`
      : drift > 0
        ? `${drift} workload(s) exceeded their granted worker cap. Reported and accounted conservatively; nothing was terminated.`
      : queued > 0
        ? `${queued} validation request(s) waiting on capacity. Waiting is not failing.`
      : unbrokered > 0
        ? `${unbrokered} weight of validation is running outside the broker; later admissions are constrained accordingly.`
      : exceedsProposed
      ? `Concurrent validation weight is ${total} against the enforced budget of ${budget}.`
      : seats.size > 1
        ? `Validation is running under ${seats.size} seats at once, within the canonical budget of ${budget}.`
        : "No concurrent cross-seat validation detected.",
    suggested_action: exceedsProposed
      ? "Diagnostic only — the budget is computed but not enforced until S5. Confirm the concurrent runs are intended."
      : null,
    // Classification is authoritative; the BUDGET comparison is not enforcement.
    confidence: classified.length ? "measured" : "measured",
  });
}

/**
 * S6: run waits, judged by POLICY and DEADLINE — never by age.
 *
 * A five-day NEEDS_INPUT is healthy because its policy says so. A five-minute
 * machine wait past its bound is not. A wait nobody defined is invalid and is
 * surfaced rather than kept alive.
 */
/**
 * Validation routing — is the broker actually the only way in?
 *
 * `validation.collisions` reports COST. This reports OWNERSHIP: whether heavy
 * work on this host went through the single capacity authority, and where it
 * did not, whose it was.
 *
 * THE DISTINCTION THAT DECIDES SEVERITY. Heavy work owned by a MANAGED provider
 * running unbrokered is an ESCAPE — the routing this slice installed did not
 * hold, and that is a problem. Heavy work with no managed owner is a person in
 * their own shell: observed, never governed, never killed, and not a defect.
 * Collapsing the two would either cry wolf about every terminal on the machine
 * or hide the one case that matters.
 */
export function checkValidationRouting({ routing = null, bypasses = [] }) {
  if (!routing) {
    return incompleteFinding("validation.routing", "the routing owner did not report; health does not re-derive it");
  }
  const escaped = routing.escaped || 0;
  const external = routing.external || 0;
  const ambiguous = (routing.bypass_events?.ambiguous || 0) + (routing.bypass_events?.unclassifiable || 0);
  const routed = routing.bypass_events?.routed || 0;

  const severity = escaped > 0 ? "problem"
    : ambiguous > 0 ? "watch"
      : external > 0 ? "watch" : "healthy";

  return finding({
    check: "validation.routing",
    severity,
    owner_resource: "vacilando.validation_capacity",
    measurements: {
      governed_claims: routing.governed_claims || 0,
      managed_provider_escapes: escaped,
      external_unbrokered: external,
      routed_to_broker: routed,
      unresolved_bypasses: ambiguous,
      capacity_authority: routing.capacity_authority,
    },
    evidence: [
      ...bypasses.slice(-6).map((b) => `${b.kind}: ${b.detail || b.command || ""}`.slice(0, 160)),
    ],
    explanation: escaped > 0
      ? `${escaped} heavy workload(s) owned by a managed provider are running outside the broker.`
      : ambiguous > 0
        ? `${ambiguous} command(s) looked expensive but could not be governed safely; they ran and were recorded.`
        : external > 0
          ? `${external} unbrokered heavy workload(s) have no managed owner — observed, not governed.`
          : "All heavy validation on this host went through the single capacity authority.",
    suggested_action: escaped > 0
      ? "A managed provider bypassed its own broker. Check that the PreToolUse routing hook is installed for that provider; nothing is killed to correct this."
      : null,
  });
}

export function checkRunsStale({ runs = [], bounds = {}, waits = null }) {
  if (waits) {
    const { counts, expired, invalid } = waits;
    const sev = counts.expired > 0 || counts.invalid > 0 ? "problem"
      : counts.near_deadline > 0 ? "watch" : "healthy";
    return finding({
      check: "runs.stale",
      severity: sev,
      owner_resource: "vacilando.execution_run",
      measurements: {
        total_waits: waits.total,
        waiting: counts.waiting, near_deadline: counts.near_deadline,
        expired: counts.expired, invalid: counts.invalid,
        indefinite_human: counts.indefinite_human,
      },
      evidence: [...expired, ...invalid].slice(0, 6).map((d) => ({
        reason: d.reason, owner: d.owner, resource_type: d.resource_type,
        resource_id: d.resource_id, waiting_since: d.waiting_since, deadline: d.deadline,
        bound_policy: d.bound_policy,
      })),
      explanation: counts.invalid > 0
        ? "A run is waiting on a reason no policy defines, so nothing owns it and nothing can end it."
        : counts.expired > 0
          ? "A run has waited past its bound without resolving and must become terminal."
          : counts.near_deadline > 0
            ? "A run is approaching its wait bound."
            : `Every wait is within its bound${counts.indefinite_human ? `, and ${counts.indefinite_human} are explicit human waits` : ""}.`,
      suggested_action: sev === "healthy" ? null : "Reconcile through the canonical run path; do not terminate the provider.",
    });
  }
  return checkRunsStaleLegacy({ runs, bounds });
}

function checkRunsStaleLegacy({ runs = [], bounds = {} }) {
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
  // S7 verdicts. `foreign_owner` is a problem because the registry is wrong
  // about WHO owns a live port; `ambiguous` is a watch because we refused to
  // guess, which is correct behaviour rather than a fault.
  const foreign = ports.filter((p) => p.verdict === "foreign_owner" || p.verdict === "foreign-owner");
  const unregistered = ports.filter((p) => p.verdict === "unregistered_server" || p.verdict === "unregistered-server");
  const stale = ports.filter((p) => p.verdict === "stale_record" || p.verdict === "stale-record");
  const ambiguous = ports.filter((p) => p.verdict === "ambiguous");
  const sev = foreign.length ? "problem"
    : (unregistered.length || stale.length || ambiguous.length) ? "watch" : "healthy";
  return finding({
    check: "ports.registry",
    severity: sev,
    owner_resource: "vacilando.slot_registry",
    measurements: {
      inspected: ports.length,
      matched: ports.filter((p) => p.verdict === "matched").length,
      stale_record: stale.length, unregistered_server: unregistered.length,
      foreign_owner: foreign.length, ambiguous: ambiguous.length,
      free: ports.filter((p) => p.verdict === "free").length,
    },
    evidence: [...foreign, ...unregistered, ...stale, ...ambiguous].slice(0, 8).map((p) =>
      `port ${p.port}: ${p.verdict} · ${p.reason || `registered ${p.recorded_worktree || p.registered || "none"}`}`),
    explanation: foreign.length
      ? "A live server owns a port the registry assigns elsewhere. The registry is corrected; the server is not touched."
      : unregistered.length ? "A valid server is running that the registry does not describe."
      : stale.length ? "The registry records a server that is not running."
      : ambiguous.length ? "A port is served by a process whose owner could not be proven; no correction may be derived from a guess."
      : "Registry and observed ports agree.",
    suggested_action: sev === "healthy" ? null : "Reality corrects metadata. Never stop a working server to match a record.",
  });
}

export function checkWorktreesRegistry({ onDisk = 0, registered = 0, unmanaged = [], states = null }) {
  if (states) {
    // A retirable worktree is a tidy-up opportunity, not a fault. Live work that
    // Vacilando does not know about is the finding that matters.
    const liveUnregistered = states.live_but_unregistered || 0;
    const sev = liveUnregistered > 0 ? "problem" : (states.worktrees.unmanaged > 0 ? "watch" : "healthy");
    return finding({
      check: "worktrees.registry",
      severity: sev,
      owner_resource: "vacilando.repository_worktree",
      measurements: {
        total: states.total_worktrees, managed: states.managed, unmanaged: states.unmanaged,
        active: states.worktrees.active, dormant: states.worktrees.dormant,
        retirable: states.worktrees.retirable, protected: states.worktrees.protected,
        live_but_unregistered: liveUnregistered,
      },
      evidence: [`${states.total_worktrees} git worktrees · ${states.managed} managed · ${states.unmanaged} unmanaged`],
      explanation: liveUnregistered > 0
        ? "Live work is running in a worktree Vacilando has no registration for, so it is invisible to capacity accounting."
        : states.worktrees.unmanaged > 0
          ? `${states.worktrees.unmanaged} worktrees exist in git with no registration. They are adopted as discovered, never treated as garbage.`
          : "Every git worktree is registered.",
      suggested_action: sev === "healthy" ? null
        : "Adopt as discovered metadata. Retirement is classified only and stays an operator decision.",
    });
  }
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

/**
 * S9 — toolkit retention, read from the canonical owner.
 *
 * WHAT CHANGED AND WHY IT MATTERS. This check used to count directories and
 * compare the number against a multiple of keep_n. That made 74 versions look
 * identical whether 70 of them were protected or 70 were dead weight, and it
 * was a SECOND opinion about retention sitting beside the toolkit's own. It now
 * consumes the retention plan; when no plan is supplied the finding is
 * INCOMPLETE rather than recomputed here, because a health check that can still
 * answer without the owner is a health check that will drift from it.
 *
 * SEVERITY IS ABOUT UNMANAGED ACCUMULATION. Prunable versions relative to the
 * retention depth, not installed versions relative to anything. And a retention
 * state that cannot be safely determined — an unresolved live pin — is a
 * PROBLEM, because the honest reading of "we cannot tell" here is that nothing
 * can be safely reclaimed.
 */
export function checkToolkitRetention({ plan = null, severity = null, diskPressure = false }) {
  if (!plan) {
    return incompleteFinding("toolkit.retention",
      "the toolkit retention owner did not return a plan; health does not recompute retention itself");
  }
  const sev = severity || { severity: "problem", why: "retention severity was not resolved" };
  const reclaimable = plan.bytes_reclaimable || 0;
  return finding({
    check: "toolkit.retention",
    severity: sev.severity,
    owner_resource: "vacilando.toolkit",
    measurements: {
      total_installed: plan.total_installed,
      current: plan.current,
      retained: plan.retained_count,
      pinned_by_live_process: (plan.retained_detail || []).filter((r) => r.reasons.includes("live_process")).length,
      explicitly_pinned: (plan.retained_detail || []).filter((r) => r.reasons.includes("explicitly_pinned")).length,
      rollback_retained: (plan.retained_detail || []).filter((r) => r.reasons.includes("rollback_window")).length,
      protected_unknown: (plan.retained_detail || []).filter((r) => r.reasons.some((x) => x.startsWith("unknown_"))).length,
      prunable: plan.prunable_count,
      bytes_retained: plan.bytes_retained,
      bytes_reclaimable: reclaimable,
      keep_n: plan.keep_n,
      policy_version: plan.policy_version,
      execution_blocked: plan.execution_blocked,
    },
    evidence: [
      `${plan.total_installed} installed · current ${plan.current || "unresolved"} · ${plan.retained_count} retained · ${plan.prunable_count} prunable`,
      ...(plan.unresolved_pins || []).map((u) => `unresolved pin: pid ${u.pid ?? "?"} — ${u.reason}`),
    ],
    explanation: sev.why,
    suggested_action: sev.severity === "healthy" ? null
      : plan.execution_blocked
        ? "Resolve the live-process pin before any prune; nothing may be reclaimed while a running version is unknown."
        : `Review the plan with \`alloy-toolkit prune\`; it deletes nothing. Execution is explicit and reclaims ${plan.bytes_reclaimable} bytes.`,
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
  safe("provider.capacity", () => checkProviderCapacity({ capacity: probeResults.capacity, seats: probeResults.seats || [], configuredMax: probeResults.configured_max }));
  safe("provider.seats", () => checkProviderSeats({
    seats: probeResults.seat_states || [],
    summary: probeResults.seat_summary || null,
    waitingOnProviderCapacity: probeResults.provider_capacity_waits || [],
    reclaimsInFlight: probeResults.reclaims_in_flight || [],
    ceiling: probeResults.capacity?.axes?.provider_capacity?.ceiling ?? probeResults.configured_max ?? null,
    policy: probeResults.idle_grace_policy || null,
  }));
  safe("validation.collisions", () => checkValidationCollisions({
    hw,
    workloads: probeResults.workloads || [],
    cost: probeResults.workload_cost || null,
    capacity: probeResults.capacity || null,
    enforcement: probeResults.enforcement || null,
  }));
  safe("validation.routing", () => checkValidationRouting({
    routing: probeResults.validation_routing || null,
    bypasses: probeResults.validation_bypasses || [],
  }));
  safe("runs.stale", () => checkRunsStale({ runs: probeResults.runs || [], bounds: probeResults.run_bounds || {}, waits: probeResults.waits || null }));
  safe("providers.orphaned", () => checkProvidersOrphaned({ seats: probeResults.seats || [], panes: probeResults.panes || [] }));
  safe("subprocess.ancestry", () => checkSubprocessAncestry({ attribution: probeResults.attribution }));
  safe("lanes.consistency", () => checkLanesConsistency({ lanes: probeResults.lanes || [], seats: probeResults.seats || [] }));
  safe("ports.registry", () => checkPortsRegistry({ ports: probeResults.ports || [] }));
  safe("worktrees.registry", () => checkWorktreesRegistry({ ...(probeResults.worktrees || {}), states: probeResults.reconciliation || null }));
  safe("toolkit.retention", () => checkToolkitRetention({
    plan: probeResults.toolkit_plan || null,
    severity: probeResults.toolkit_severity || null,
    diskPressure: probeResults.disk_pressure === true,
  }));

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
    capacity: probeResults.capacity || null,
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
