/**
 * S4 — the canonical capacity-policy owner.
 *
 * THE QUESTION. Given this host's measured hardware and current resource state,
 * what level of Vacilando concurrency is safe to OFFER? S4 computes and
 * explains. S5 enforces. Nothing here throttles, admits, reclaims or kills.
 *
 * ONE OWNER, ON PURPOSE. Before this module, `max_active_providers` was derived
 * inside health, `DEFAULT_MAX_ACTIVE_PROVIDERS` lived in provider-capacity, and
 * `DEV_SERVER_CAP` was a constant in execution-resource. Three places, three
 * chances to disagree. Health now READS this policy; a test asserts it does not
 * recompute the formulas.
 *
 * THE SECOND-AXIS INVARIANT. Every growth dimension is bounded by a second
 * resource — providers by cores AND memory, validation by cores AND memory
 * pressure, dev servers by slots AND RAM, builds by tokens AND disk. No major
 * ceiling derives from core count alone. That single rule is what makes a
 * larger machine expose more USEFUL capacity instead of more room to overcommit:
 * doubling cores cannot double concurrency if memory did not also double.
 *
 * SUB-LINEAR BY CONSTRUCTION. Ceilings grow as fractions of cores and are then
 * clamped by a second axis, so hardware raises the ceiling without removing it.
 */

export const CAPACITY_POLICY_SCHEMA = "vacilando.capacity_policy.v1";

/**
 * Machine-exclusive capacity is not a number.
 *
 * Encoding "all validation capacity" as a large finite weight invites a future
 * budget to treat exclusivity as merely expensive and schedule alongside it.
 * A distinct symbol cannot be summed by accident.
 */
export const EXCLUSIVE = Symbol("machine_exclusive_capacity");

/**
 * V1 policy defaults — versioned so telemetry can revise the numbers without
 * touching a classifier or a check. Formulas live here and nowhere else.
 */
export const CAPACITY_POLICY_V1 = Object.freeze({
  version: "v1",
  source: "capacity-doctrine-2026-08-26",

  // Providers: sub-linear in cores, with a floor that preserves the operator's
  // current intended capacity on the 8-core host.
  provider_divisor: 3,
  provider_floor: 3,
  provider_memory_gb_each: 6,

  // Validation: 8 cores -> 6 tokens, 14 -> 10.
  validation_core_fraction: 0.75,
  validation_token_floor: 2,

  // Workers per job: 8 cores -> 2, 14 -> 3.
  worker_divisor: 4,
  worker_floor: 1,
  worker_memory_gb_each: 2,

  // Dev servers: bounded by managed slots AND RAM.
  dev_server_slots: 6,
  dev_server_memory_gb_each: 8,

  memory_reserve_fraction: 0.10,
  disk_reserve_fraction: 0.08,
  disk_reserve_min_gb: 20,

  // Load bounds, expressed against cores.
  load_watch_multiple: 1.0,
  load_problem_multiple: 1.5,

  // Under live memory pressure, expensive work loses capacity before cheap work.
  pressure_token_fraction: 0.5,
});

/** Classes whose admission would expand disk usage. */
export const DISK_EXPANDING_CLASSES = Object.freeze([
  "production_build", "typecheck", "browser_e2e",
]);

// ── Host capability ──────────────────────────────────────────────────────────

/**
 * A structured, source-tagged snapshot of what this machine actually is.
 *
 * Sources are recorded because they differ by host: `sysctl hw.ncpu` returns
 * EMPTY under Rosetta on this Mac, which is why cores come from os.cpus(). A
 * capacity number whose provenance is unknown cannot be audited later.
 */
export function hostCapability({
  os = null,
  disk = null,
  memory = null,
  load = null,
  seats = [],
  devServers = 0,
  workloads = [],
  sysctl = null,
} = {}) {
  const logicalCores = Number(os?.cpus?.().length) || null;
  const totalBytes = Number(os?.totalmem?.()) || null;

  const physicalRaw = typeof sysctl === "function" ? sysctl("hw.physicalcpu") : null;
  const physicalCores = Number(physicalRaw) || null;

  // Rosetta: sysctl.proc_translated is 1 under translation, and ABSENT on a
  // native process — including on genuinely Intel hardware. Absent is therefore
  // "unknown", never "native".
  const translatedRaw = typeof sysctl === "function" ? sysctl("sysctl.proc_translated") : null;
  const translated = translatedRaw == null || translatedRaw === ""
    ? null
    : String(translatedRaw).trim() === "1";

  const activeWeight = workloads.reduce((sum, w) => {
    if (!Number.isFinite(w?.expected_weight)) return sum;
    return sum + w.expected_weight;
  }, 0);
  const exclusivePresent = workloads.some((w) => w?.workload_class === "machine_exclusive");

  return {
    schema_version: "vacilando.host_capability.v1",
    logical_cores: logicalCores,
    physical_cores: physicalCores,
    cores_source: logicalCores ? "os.cpus" : "unavailable",
    physical_cores_source: physicalCores ? "sysctl hw.physicalcpu" : "unavailable",

    memory_total_gb: totalBytes ? Number((totalBytes / 1073741824).toFixed(1)) : null,
    memory_source: totalBytes ? "os.totalmem" : "unavailable",
    memory_free_gb: memory?.free_gb ?? null,
    // AVAILABILITY, not unused pages. The reserve is compared against this.
    // See memory-capacity.mjs: on macOS `free` is near zero by design and says
    // nothing about what the host can give to new work.
    memory_available_gb: memory?.available_gb ?? null,
    memory_reclaimable_gb: memory?.reclaimable_gb ?? null,
    memory_pressure_state: memory?.pressure_state ?? null,
    memory_measurement_strategy: memory?.measurement_strategy ?? null,
    memory_measurement_incomplete: memory?.incomplete === true,
    memory_free_pct: Number.isFinite(memory?.free_pct) ? memory.free_pct : null,
    memory_compressor_gb: memory?.compressor_gb ?? null,
    // The S2 live-pressure model: a RATE, never a lifetime counter.
    swap_rate_known: memory?.swap_rate_known === true,
    swapouts_delta: memory?.swap_rate_known ? memory.swapouts_delta : null,
    // The canonical owner decides pressure from ALL live evidence — swap rate,
    // the OS's own free percentage, availability against the reserve — not from
    // a swap delta alone. An unreadable measurement counts as pressure.
    under_memory_pressure: memory?.under_pressure === true,

    arch: os?.arch?.() || null,
    platform: os?.platform?.() || null,
    process_translated: translated,
    process_translated_source: translatedRaw == null ? "unavailable" : "sysctl sysctl.proc_translated",

    disk_total_gb: disk?.total_gb ?? null,
    disk_free_gb: disk?.free_gb ?? null,
    disk_free_pct: Number.isFinite(disk?.free_pct) ? disk.free_pct : null,

    load_1m: Number.isFinite(load?.one) ? load.one : null,

    provider_seats: seats.length,
    dev_servers: devServers,
    active_workloads: workloads.length,
    active_validation_weight: activeWeight,
    machine_exclusive_present: exclusivePresent,
  };
}

// ── Policy computation ───────────────────────────────────────────────────────

const gate = (value, limit, reason) => ({ value, limit, reason });

/**
 * Compute every capacity axis from a host capability snapshot.
 *
 * Deterministic: the same snapshot always yields the same policy, which is what
 * makes the Mac mini certifiable without the Mac mini being present.
 */
export function computeCapacityPolicy(cap, { policy = CAPACITY_POLICY_V1 } = {}) {
  const cores = Number(cap?.logical_cores) || 1;
  const memGb = Number(cap?.memory_total_gb) || 0;
  const constrained = [];

  // ── providers: cores AND memory ────────────────────────────────────────────
  const providerByCores = Math.max(policy.provider_floor, Math.floor(cores / policy.provider_divisor));
  const providerByMemory = memGb ? Math.floor(memGb / policy.provider_memory_gb_each) : providerByCores;
  const providerCeiling = Math.max(1, Math.min(providerByCores, providerByMemory));
  if (providerByMemory < providerByCores) {
    constrained.push(gate("provider_capacity", providerCeiling,
      `memory allows ${providerByMemory} providers at ${policy.provider_memory_gb_each} GB each; cores would allow ${providerByCores}`));
  }

  // ── validation tokens: cores AND live memory pressure ──────────────────────
  const tokensByCores = Math.max(policy.validation_token_floor, Math.floor(cores * policy.validation_core_fraction));
  const tokensByMemory = memGb
    ? Math.max(policy.validation_token_floor, Math.floor((memGb - memGb * policy.memory_reserve_fraction) / 2))
    : tokensByCores;
  let validationTokens = Math.min(tokensByCores, tokensByMemory);
  if (cap?.under_memory_pressure) {
    const reduced = Math.max(policy.validation_token_floor, Math.floor(validationTokens * policy.pressure_token_fraction));
    constrained.push(gate("validation_capacity", reduced,
      `live memory pressure (swapouts observed in sample) reduced tokens from ${validationTokens} to ${reduced}`));
    validationTokens = reduced;
  } else if (tokensByMemory < tokensByCores) {
    constrained.push(gate("validation_capacity", validationTokens,
      `memory allows ${tokensByMemory} tokens; cores would allow ${tokensByCores}`));
  }

  // ── workers per job: cores AND memory ──────────────────────────────────────
  //
  // Cores alone gave a 32-core / 8 GB host a ceiling of 8 workers in a single
  // job — a core-only ceiling, which the second-axis invariant forbids. The
  // simulation matrix caught it before any of this was enforced.
  const workersByCores = Math.max(policy.worker_floor, Math.floor(cores / policy.worker_divisor));
  const workersByMemory = memGb
    ? Math.max(policy.worker_floor, Math.floor((memGb - memGb * policy.memory_reserve_fraction) / policy.worker_memory_gb_each))
    : workersByCores;
  const workerCeiling = Math.min(workersByCores, workersByMemory);
  if (workersByMemory < workersByCores) {
    constrained.push(gate("validation_worker_ceiling", workerCeiling,
      `memory allows ${workersByMemory} workers at ${policy.worker_memory_gb_each} GB each; cores would allow ${workersByCores}`));
  }

  // ── dev servers: managed slots AND RAM ─────────────────────────────────────
  const devByMemory = memGb ? Math.floor(memGb / policy.dev_server_memory_gb_each) : policy.dev_server_slots;
  const devServerCeiling = Math.max(1, Math.min(policy.dev_server_slots, devByMemory));
  if (devByMemory < policy.dev_server_slots) {
    constrained.push(gate("dev_server_capacity", devServerCeiling,
      `RAM allows ${devByMemory} servers at ${policy.dev_server_memory_gb_each} GB each; ${policy.dev_server_slots} managed slots exist`));
  }

  // ── reserves ───────────────────────────────────────────────────────────────
  const memoryReserveGb = memGb ? Number((memGb * policy.memory_reserve_fraction).toFixed(1)) : null;
  const diskTotal = Number(cap?.disk_total_gb) || 0;
  const diskReserveGb = diskTotal
    ? Number(Math.max(policy.disk_reserve_min_gb, diskTotal * policy.disk_reserve_fraction).toFixed(1))
    : policy.disk_reserve_min_gb;
  const diskFree = Number(cap?.disk_free_gb) || 0;
  const diskBelowReserve = diskTotal > 0 && diskFree < diskReserveGb;
  if (diskBelowReserve) {
    constrained.push(gate("disk_headroom", diskFree,
      `free ${diskFree} GB is below the ${diskReserveGb} GB reserve; disk-expanding classes are unavailable`));
  }
  // Compared against AVAILABLE, which is what the host can actually give out.
  // Comparing unused pages here is the defect this replaces: a machine with
  // ~5 GB available and zero swapping reported 0.06 GB and refused every build.
  const memoryAvailableGb = Number.isFinite(cap?.memory_available_gb)
    ? cap.memory_available_gb
    : cap?.memory_free_gb;
  const memoryBelowReserve = Number.isFinite(memoryAvailableGb) && memoryReserveGb != null
    && memoryAvailableGb < memoryReserveGb;
  if (memoryBelowReserve) {
    constrained.push(gate("memory_capacity", memoryAvailableGb,
      `available ${memoryAvailableGb} GB is below the ${memoryReserveGb} GB reserve`));
  }

  // ── compute bounds ─────────────────────────────────────────────────────────
  const loadWatch = cores * policy.load_watch_multiple;
  const loadProblem = cores * policy.load_problem_multiple;
  if (Number.isFinite(cap?.load_1m) && cap.load_1m > loadProblem) {
    constrained.push(gate("compute_capacity", cap.load_1m, `load ${cap.load_1m.toFixed(2)} exceeds ${loadProblem} on ${cores} cores`));
  }

  // ── machine-exclusive availability ─────────────────────────────────────────
  const exclusiveAvailable = (cap?.active_validation_weight || 0) === 0 && !cap?.machine_exclusive_present;
  if (!exclusiveAvailable) {
    constrained.push(gate("machine_exclusive", false,
      cap?.machine_exclusive_present
        ? "a machine-exclusive workload is already running"
        : `validation weight ${cap?.active_validation_weight} must reach 0 before exclusive work can start`));
  }

  const usedTokens = Number(cap?.active_validation_weight) || 0;

  return {
    schema_version: CAPACITY_POLICY_SCHEMA,
    policy_version: policy.version,
    policy_source: policy.source,
    host: cap,

    axes: {
      provider_capacity: {
        ceiling: providerCeiling, current: cap?.provider_seats ?? 0,
        remaining: Math.max(0, providerCeiling - (cap?.provider_seats ?? 0)),
        bounded_by: providerByMemory < providerByCores ? "memory" : "cores",
        by_cores: providerByCores, by_memory: providerByMemory,
      },
      compute_capacity: {
        cores, load: cap?.load_1m ?? null,
        watch_at: loadWatch, problem_at: loadProblem,
        remaining: Number.isFinite(cap?.load_1m) ? Number((loadProblem - cap.load_1m).toFixed(2)) : null,
      },
      memory_capacity: {
        total_gb: memGb,
        free_gb: cap?.memory_free_gb ?? null,
        available_gb: memoryAvailableGb ?? null,
        reclaimable_gb: cap?.memory_reclaimable_gb ?? null,
        pressure_state: cap?.memory_pressure_state ?? null,
        measurement_strategy: cap?.memory_measurement_strategy ?? null,
        measurement_incomplete: cap?.memory_measurement_incomplete === true,
        reserve_gb: memoryReserveGb,
        remaining_gb: Number.isFinite(memoryAvailableGb) && memoryReserveGb != null
          ? Number((memoryAvailableGb - memoryReserveGb).toFixed(2)) : null,
        under_pressure: Boolean(cap?.under_memory_pressure),
        pressure_signal: cap?.swap_rate_known ? "swap_rate" : "unavailable",
      },
      validation_capacity: {
        tokens: validationTokens, used: usedTokens,
        remaining: Math.max(0, validationTokens - usedTokens),
        worker_ceiling: workerCeiling,
        worker_ceiling_bounded_by: workersByMemory < workersByCores ? "memory" : "cores",
        workers_by_cores: workersByCores, workers_by_memory: workersByMemory,
        bounded_by: cap?.under_memory_pressure ? "memory_pressure"
          : (tokensByMemory < tokensByCores ? "memory" : "cores"),
        by_cores: tokensByCores, by_memory: tokensByMemory,
      },
      dev_server_capacity: {
        ceiling: devServerCeiling, current: cap?.dev_servers ?? 0,
        remaining: Math.max(0, devServerCeiling - (cap?.dev_servers ?? 0)),
        bounded_by: devByMemory < policy.dev_server_slots ? "memory" : "slots",
        by_slots: policy.dev_server_slots, by_memory: devByMemory,
      },
      disk_headroom: {
        total_gb: diskTotal || null, free_gb: diskFree || null,
        reserve_gb: diskReserveGb,
        remaining_gb: diskTotal ? Number((diskFree - diskReserveGb).toFixed(1)) : null,
        below_reserve: diskBelowReserve,
        disk_expanding_classes_available: !diskBelowReserve,
      },
      machine_exclusive: {
        // Never a number. A future budget cannot add this to a sum.
        capacity: EXCLUSIVE,
        available: exclusiveAvailable,
        blocking_weight: usedTokens,
      },
    },

    constrained_axes: constrained,
    // A workload is admissible in S5 only if every axis it touches permits it.
    // S4 states the axes; it grants nothing.
    enforcement: "none_s4_is_advisory",
  };
}

// ── S3 observed-cost feedback ────────────────────────────────────────────────

/**
 * Does observed behaviour suggest the V1 weights are optimistic?
 *
 * Diagnostics only. A workload declared at weight 2 that fanned out to twelve
 * workers is NOT silently reweighted — doing that would let a measurement error
 * rewrite policy. The report says the declaration looks optimistic and leaves
 * the decision to a human revising the policy version.
 */
export function observedCostDiagnostics({ workloads = [], observations = [] } = {}) {
  const byId = new Map(observations.map((o) => [o.workload_id, o]));
  const notes = [];
  let declaredTotal = 0;
  let observedTotal = 0;

  for (const w of workloads) {
    if (!Number.isFinite(w?.expected_weight)) continue;
    declaredTotal += w.expected_weight;
    const obs = byId.get(w.workload_id);
    const workers = Number(obs?.observed_workers);
    if (!Number.isFinite(workers) || workers <= 0) {
      observedTotal += w.expected_weight;
      continue;
    }
    const impliedHeavy = workers * 2;
    observedTotal += Math.max(w.expected_weight, impliedHeavy);
    if (impliedHeavy > w.expected_weight * 2) {
      notes.push({
        workload_id: w.workload_id,
        declared_class: w.workload_class,
        declared_weight: w.expected_weight,
        observed_workers: workers,
        implied_weight: impliedHeavy,
        peak_rss_bytes: obs?.peak_rss_bytes ?? null,
        note: `declared weight ${w.expected_weight} but observed ${workers} workers implies ${impliedHeavy}`,
      });
    }
  }

  return {
    declared_total_weight: declaredTotal,
    observed_implied_weight: observedTotal,
    // The honest headline: is V1 under-counting what is actually running?
    v1_weights_look_optimistic: observedTotal > declaredTotal,
    diagnostic_pressure: declaredTotal ? Number((observedTotal / declaredTotal).toFixed(2)) : null,
    notes,
    action: "diagnostic_only_no_reweighting",
  };
}

/**
 * Is a workload's execution blocked for a reason that is NOT capacity?
 *
 * The S3 live proof hit exactly this: a vitest run failed instantly because
 * @rolldown/binding-darwin-x64 was missing under a Rosetta shell. The host had
 * ample capacity. Counting that failure as evidence of scarcity would teach the
 * policy the wrong lesson, so capacity and runnability are reported separately.
 */
export function executionBlockedReason({ exitCode = null, stderr = "", durationMs = null } = {}) {
  const s = String(stderr || "");
  if (/Cannot find native binding|Cannot find module '@[^']*binding-[^']*'/.test(s)) {
    return { blocked: true, reason: "native_binding_missing", capacity_related: false };
  }
  if (/Cannot find module/.test(s)) {
    return { blocked: true, reason: "module_missing", capacity_related: false };
  }
  if (exitCode !== 0 && Number.isFinite(durationMs) && durationMs < 2000) {
    return { blocked: true, reason: "failed_before_starting", capacity_related: false };
  }
  return { blocked: false, reason: null, capacity_related: null };
}
