import { managedSlotCount } from "./managed-slots.mjs";
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
  // MEASURED, 2026-09-04, on the 48 GB / 12-core Mac mini. The old value here
  // was 6 GB per provider, which is not what a provider costs — it is closer to
  // what someone feared one might cost. Five resident providers measured
  // 344, 566, 597, 671 and 739 MB, totalling 2.9 GB: a mean of 583 MB and a
  // maximum under 0.75 GB.
  //
  // The error mattered because it was load-bearing. At 6 GB each, 48 GB of RAM
  // implies eight providers and memory looks like a real constraint; at the
  // measured cost it implies dozens, and memory is not the constraint at all —
  // cores and upstream throughput are. This is the same class of mistake as
  // dev_server_memory_gb_each, which claimed 8 GB against a measured ~2 GB and
  // capped a 48 GB host at six servers while it demonstrably ran eight.
  //
  // 1 GB rather than 0.583: providers grow over a long session, and rounding
  // toward the expensive side costs nothing here because cores bind first.
  provider_memory_gb_each: 1,

  // Validation: 8 cores -> 6 tokens, 14 -> 10.
  validation_core_fraction: 0.75,
  validation_token_floor: 2,

  // Workers per job: 8 cores -> 2, 14 -> 3.
  worker_divisor: 4,
  worker_floor: 1,
  worker_memory_gb_each: 2,

  // Dev servers: bounded by managed slots AND RAM. `dev_server_slots` is the
  // FALLBACK for an injected policy; the live number comes from managed-slots,
  // the one owner of how many slots exist. It was the literal 6 here, which is
  // how the control plane could disagree with the shell about topology.
  dev_server_slots: 6,

  // MEASURED, 2026-09-03, on the 48 GB / 12-core Mac mini. The old value here
  // was 8 GB per server, which is what a heavily exercised UI server can reach
  // after hours — not what a server costs. On 48 GB that assumption capped the
  // policy at six servers while the host demonstrably ran eight under
  // authenticated compilation, a brokered typecheck and two browser
  // certifications with ZERO swap. Cost follows AGE and USE, not existence:
  // freshly started servers measured 390-440 MB, and eight under real load
  // totalled 11-14 GB, so ~2 GB is the honest steady-state working set.
  dev_server_memory_gb_each: 2,

  // The staircase found the envelope directly, so these are observations rather
  // than formulas. 8, 9 and 10 all held ZERO swap. Eleven is where swap first
  // appeared and then grew within the hold (0 -> 240 MB -> 729 MB). Twelve
  // accelerated to ~2.3 GB while macOS expanded the swapfile 1 -> 2 -> 3 GB.
  // CPU was never the limit: loadavg settled to 2.9-5.5 between compile bursts
  // and Gateway latency stayed at 1-3 ms at every level, including twelve.
  dev_server_normal_ceiling: 8,
  dev_server_burst_ceiling: 10,
  dev_server_measured_knee: 11,

  // CERTIFIED 2026-09-03. Two concurrent browser certifications were not
  // slower than one — 39.4 s and 47.7 s run together against 50.7 s solo, at
  // eight servers. This is the AUTOMATED pool only. A human driving a browser
  // from the MacBook against a QA route consumes none of it: that traffic is
  // not scheduled here, cannot be queued here, and counting it would let a
  // person looking at a page block the fleet.
  browser_concurrency_ceiling: 2,

  // Deliberately NOT raised. These are CPU-bound and were never independently
  // measured; the server staircase says nothing about them, and raising a
  // ceiling on evidence gathered about a different resource is the mistake the
  // second-axis invariant exists to prevent.
  validation_job_ceiling: 1,
  heavy_job_ceiling: 1,
  install_ceiling: 1,

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
  // The slot bound comes from the topology owner when the default policy is in
  // force, so raising ALLOY_MAX_AGENTS for an experiment moves this too rather
  // than leaving capacity policy insisting on six.
  const slotBound = policy === CAPACITY_POLICY_V1 ? managedSlotCount() : policy.dev_server_slots;
  const devByMemory = memGb ? Math.floor(memGb / policy.dev_server_memory_gb_each) : slotBound;

  // NORMAL is what routine work targets. BURST is controlled headroom above it,
  // offered only while the host is healthy. Both are clamped by the same two
  // axes as before — slots and RAM — so a smaller machine still gets a smaller
  // number and this does not become a way to overcommit a laptop.
  //
  // The measured knee is carried through deliberately. A consumer that only
  // learns the ceilings cannot explain WHY it stops, and the next person to
  // raise a number should have to argue with the evidence rather than rediscover
  // it. Nothing admits at the knee: burst stops one below it.
  const devNormalCeiling = Math.max(1, Math.min(slotBound, devByMemory, policy.dev_server_normal_ceiling ?? slotBound));
  const devBurstCeiling = Math.max(devNormalCeiling, Math.min(slotBound, devByMemory, policy.dev_server_burst_ceiling ?? devNormalCeiling));
  const devServerCeiling = devNormalCeiling;
  if (devByMemory < slotBound) {
    constrained.push(gate("dev_server_capacity", devServerCeiling,
      `RAM allows ${devByMemory} servers at ${policy.dev_server_memory_gb_each} GB each; ${slotBound} managed slots exist`));
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
  // NO FALLBACK TO `Pages free`. The first cut of this correction fell back to
  // `memory_free_gb` when availability was missing, which left the entire old
  // shape — Pages free -> free_gb -> memoryBelowReserve — reachable for any
  // caller passing a legacy memory object. That is the exact path this hotfix
  // exists to remove, so a snapshot without availability is now treated as an
  // unmeasured host and constrains, rather than silently reverting to the
  // number that refused every build.
  const memoryAvailableGb = Number.isFinite(cap?.memory_available_gb) ? cap.memory_available_gb : null;
  const memoryUnmeasured = memoryAvailableGb == null;
  const memoryBelowReserve = memoryAvailableGb != null && memoryReserveGb != null
    && memoryAvailableGb < memoryReserveGb;
  if (memoryUnmeasured) {
    constrained.push(gate("memory_capacity", null,
      "available memory could not be measured; expensive work is constrained rather than admitted on an unknown host"));
  } else if (memoryBelowReserve) {
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
        under_pressure: Boolean(cap?.under_memory_pressure) || memoryUnmeasured,
        unmeasured: memoryUnmeasured,
        pressure_signal: cap?.swap_rate_known ? "swap_rate" : "unavailable",
      },
      // Automated browser sessions. Flat and policy-owned rather than derived:
      // the number came from measurement, not from a formula over cores.
      browser_capacity: {
        ceiling: policy.browser_concurrency_ceiling ?? null,
        current: Number(cap?.browser_sessions) || 0,
        remaining: Math.max(0, (policy.browser_concurrency_ceiling ?? 0) - (Number(cap?.browser_sessions) || 0)),
        pool: "automated_only",
        excludes: "human QA browsing a lane's QA route",
      },
      // One owner for the three ceilings that stay at one.
      serialized_capacity: {
        validation_jobs: { ceiling: policy.validation_job_ceiling ?? 1, current: Number(cap?.active_validation_jobs) || 0 },
        heavy_jobs: { ceiling: policy.heavy_job_ceiling ?? 1, current: Number(cap?.active_heavy_jobs) || 0 },
        installs: { ceiling: policy.install_ceiling ?? 1, current: Number(cap?.active_installs) || 0 },
        why_not_raised: "CPU-bound and not independently measured; server-memory evidence does not apply",
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
        bounded_by: devByMemory < slotBound ? "memory" : "slots",
        by_slots: slotBound, by_memory: devByMemory,
        // Normal vs burst, from the one owner, so health and admission can show
        // "6 / 8" or "9 / 10 - burst" without recomputing anything.
        normal_ceiling: devNormalCeiling,
        burst_ceiling: devBurstCeiling,
        measured_knee: policy.dev_server_measured_knee ?? null,
        normal_remaining: Math.max(0, devNormalCeiling - (cap?.dev_servers ?? 0)),
        burst_remaining: Math.max(0, devBurstCeiling - (cap?.dev_servers ?? 0)),
        using_burst: (cap?.dev_servers ?? 0) > devNormalCeiling,
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
/**
 * May another persistent dev server start right now, and on whose budget?
 *
 * THE GAP THIS CLOSES. The policy learned normal 8 / burst 10 / knee 11, and
 * nothing consumed them: admission still compared a count against a single
 * number and refused. So the measured envelope was published and unenforced —
 * the fleet could not use its burst headroom, and nothing knew the difference
 * between "at budget" and "at the knee".
 *
 * The decision lives here because the ceilings do. Callers act; they do not
 * recompute. `normalCeiling` is passed in because the OPERATOR owns it through
 * host config — burst headroom is the policy's contribution above whatever the
 * operator has chosen, not a replacement for it.
 *
 * Burst is not free capacity. It is offered only while the host is actually
 * healthy, because the measured knee is one server above the burst ceiling and
 * the cost of being wrong there is swap. `pressure` is the live signal; when it
 * is unknown we do NOT burst, because "we could not tell" is not evidence of
 * health.
 */
export function serverAdmissionDecision({
  running = 0,
  normalCeiling = null,
  policy = CAPACITY_POLICY_V1,
  pressure = null,
  slotBound = null,
} = {}) {
  const normal = Number.isInteger(normalCeiling) && normalCeiling > 0
    ? normalCeiling
    : (policy.dev_server_normal_ceiling ?? 1);
  let burst = Math.max(normal, policy.dev_server_burst_ceiling ?? normal);
  const knee = policy.dev_server_measured_knee ?? null;
  if (Number.isInteger(slotBound) && slotBound > 0) burst = Math.min(burst, slotBound);

  const base = { running, normal_ceiling: normal, burst_ceiling: burst, measured_knee: knee };

  if (running < normal) {
    return { ...base, allow: true, tier: "normal", state: "normal",
      reason: `${running}/${normal} normal servers` };
  }
  if (running >= burst) {
    // The knee sits one above burst. Nothing here starts a server at it; the
    // caller reclaims or queues instead.
    return { ...base, allow: false, tier: null, state: "burst_exhausted",
      reason: `${running}/${burst} servers — burst exhausted; the measured pressure knee is ${knee}. Reclaim an idle holder or queue.` };
  }
  // Between normal and burst: healthy host only, judged by the CANONICAL
  // pressure owner rather than a second model invented here.
  //
  // The first cut keyed on absolute swap used, and that was wrong in a way the
  // memory manager had already written down: macOS keeps swap allocated long
  // after pressure normalises, so "this machine has ever swapped" is not
  // "this machine is constrained now". MEASURED on this host after the
  // staircase: swap_pct 66 with kernel pressure level 1, thrashing false — a
  // fully recovered machine that the absolute rule would have denied burst
  // until the next reboot, making the measured headroom permanently unusable.
  //
  // So: burst needs a kernel that says normal. Level 2 (warn) and 4 (critical)
  // both withhold, and thrashing withholds regardless of level. Retained swap
  // is not consulted directly at all — the pressure level already accounts for
  // it when it matters, which is precisely what makes it the canonical answer.
  //
  // `readable` is the difference between a calm host and a blind probe. A probe
  // that could not run must never look like good news.
  const healthy = pressure !== null
    && pressure.readable !== false
    && pressure.thrashing !== true
    && pressure.level === 1;
  if (!healthy) {
    return { ...base, allow: false, tier: null, state: "pressure_constrained",
      reason: (pressure === null || pressure.readable === false)
        ? `${running}/${normal} normal servers — burst withheld because host pressure could not be read`
        : `${running}/${normal} normal servers — burst withheld: kernel pressure ${pressure.level_label ?? pressure.level}${pressure.thrashing ? ", thrashing" : ""}` };
  }
  return { ...base, allow: true, tier: "burst", state: "using_burst",
    reason: `${running}/${normal} normal exhausted; admitting burst server ${running + 1} of ${burst} on a healthy host` };
}

/**
 * Admission for the flat ceilings: browser sessions, validation jobs, heavy
 * jobs, installs.
 *
 * These share a shape that the dev-server ladder does not: no burst, no
 * reclaim, no pressure judgement — just a count against a number that came
 * from measurement or from deliberate restraint. Giving them one function
 * keeps four ceilings from drifting into four slightly different opinions
 * about what "full" means.
 *
 * Full is QUEUE, never silent overrun. Exceeding a ceiling quietly is how a
 * certified concurrency number becomes decorative.
 */
export const FLAT_CEILINGS = Object.freeze({
  browser: "browser_concurrency_ceiling",
  validation_job: "validation_job_ceiling",
  heavy_job: "heavy_job_ceiling",
  install: "install_ceiling",
});

export function flatCeilingAdmission({ kind, active = 0, policy = CAPACITY_POLICY_V1 } = {}) {
  const field = FLAT_CEILINGS[kind];
  if (!field) {
    return { allow: false, kind, ceiling: null, active, remaining: null,
      reason: `unknown capacity kind ${JSON.stringify(kind)}; refusing rather than admitting against no ceiling` };
  }
  const ceiling = policy[field];
  if (!Number.isInteger(ceiling) || ceiling < 1) {
    return { allow: false, kind, ceiling: null, active, remaining: null,
      reason: `${field} is not configured; refusing rather than admitting against no ceiling` };
  }
  const n = Number.isFinite(active) ? active : 0;
  const remaining = Math.max(0, ceiling - n);
  if (n < ceiling) {
    return { allow: true, kind, ceiling, active: n, remaining,
      reason: `${n}/${ceiling} ${kind} in use` };
  }
  return { allow: false, kind, ceiling, active: n, remaining: 0, queue: true,
    reason: `${n}/${ceiling} ${kind} in use — queue rather than exceed a certified ceiling` };
}

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
