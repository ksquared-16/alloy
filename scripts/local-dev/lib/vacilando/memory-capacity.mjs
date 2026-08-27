/**
 * The canonical memory measurement for capacity admission.
 *
 * THE QUESTION THIS ANSWERS. How much memory can this host give to additional
 * expensive work without entering active memory pressure?
 *
 * NOT the question it used to answer, which was "how many pages happen to be
 * completely unused right now". On macOS those are wildly different numbers,
 * and the difference produced a false refusal: `Pages free` read 0.06 GB while
 * the machine had roughly 5 GB it could hand out and was doing zero swapping.
 * S4 concluded it was 2.3 GB below its reserve and blocked every production
 * build. No amount of cleanup could fix that, because macOS deliberately keeps
 * free pages near zero — unused RAM is wasted RAM, so it holds file cache and
 * idle anonymous pages on the inactive queue until something needs them.
 *
 * THE SECOND-AXIS INVARIANT IS UNCHANGED. Memory still constrains expensive
 * work, and this module can still block. What changed is the measurement, not
 * the doctrine — and it blocks on live evidence (available below reserve, or
 * the host actually swapping, or the OS itself reporting pressure) rather than
 * on a page counter that means something else.
 *
 * CONSERVATIVE ON PURPOSE. Available is DISCOUNTED, not renamed. macOS's own
 * accounting says ~5.35 GB is available on this host; this model reports ~3.6 GB
 * — about a third less — because reclaiming an inactive anonymous page costs a
 * compression even when it costs no disk, and the compressor here is already
 * holding 11 GB. Under-reporting availability is the safe direction; the defect
 * being fixed was under-reporting it by ninety-eight percent.
 *
 * COMPRESSED MEMORY IS NEVER AVAILABLE. It is memory that has already been
 * squeezed because something needed the space. Counting it would be counting
 * the same bytes twice.
 *
 * LIFETIME COUNTERS ARE NEVER PRESSURE. 253 million lifetime swapouts say
 * nothing about now. Only a delta between two bounded samples does.
 */

export const MEMORY_CAPACITY_SCHEMA = "vacilando.memory_capacity.v1";

const GB = 1073741824;

/** How the numbers were obtained. Recorded so a reading can be audited later. */
export const MEASUREMENT_STRATEGIES = Object.freeze([
  "darwin_vm_stat_page_accounting",
  "linux_meminfo_available",
  "generic_os_freemem",
  "unavailable",
]);

/** Pressure states, worst last. */
export const PRESSURE_STATES = Object.freeze(["healthy", "watch", "pressure", "unknown"]);

/**
 * V1 policy for turning macOS page categories into available bytes.
 *
 * `inactive_reclaim_fraction` is the one judgement call. The inactive queue
 * holds both clean file-backed pages (droppable for free) and idle anonymous
 * pages (reclaimable, but only by compressing them). Counting all of it would
 * be the rename this correction is explicitly not allowed to be; counting none
 * of it reproduces the defect. Three quarters reflects that most of the queue
 * is genuinely recoverable without touching disk, while withholding a margin
 * for the CPU cost of compression.
 */
export const MEMORY_POLICY_V1 = Object.freeze({
  version: "v1",
  source: "capacity-doctrine-2026-08-27",
  inactive_reclaim_fraction: 0.75,
  // Speculative pages are read-ahead file cache: dropped without cost.
  count_speculative: true,
  // Purgeable memory is explicitly volatile — the kernel may discard it freely.
  count_purgeable: true,
  // Never. Compressed pages are already-squeezed memory, not spare memory.
  count_compressor: false,
  // Watch when availability is within this multiple of the reserve.
  watch_reserve_multiple: 1.5,
  // Any swapout in a bounded sample is a real signal; this many means pressure.
  swapout_pressure_threshold: 1,
  // The OS's own free-percentage floor, where that signal is readable.
  os_free_pct_pressure_below: 10,
  os_free_pct_watch_below: 20,
  // Compressor larger than this share of RAM is a watch signal on its own.
  compressor_watch_fraction: 0.5,
});

function gb(bytes) {
  return Number.isFinite(bytes) ? Number((bytes / GB).toFixed(2)) : null;
}

/**
 * Parse `vm_stat`, using the page size the tool itself declares.
 *
 * The page size must come from the header and nowhere else. `memory_pressure`
 * on this host prints "6291456 pages with a page size of 4096" while vm_stat
 * reports 16384 — mixing the two silently produces numbers four times wrong in
 * either direction.
 */
export function parseVmStat(text) {
  const raw = String(text ?? "");
  const header = raw.match(/page size of (\d+)/);
  if (!header) return null;
  const pageSize = Number(header[1]);
  const pages = {};
  for (const line of raw.split("\n")) {
    const kv = line.match(/^(.+?):\s+(\d+)\.?$/);
    if (kv) pages[kv[1].trim()] = Number(kv[2]);
  }
  if (!Object.keys(pages).length) return null;
  return { pageSize, pages };
}

/** macOS's own free-percentage line, when `memory_pressure` is readable. */
export function parseMemoryPressure(text) {
  const m = String(text ?? "").match(/System-wide memory free percentage:\s*(\d+)%/);
  return m ? Number(m[1]) : null;
}

/**
 * macOS available bytes from page accounting.
 *
 * available = free + speculative + purgeable + (inactive x reclaim fraction)
 *
 * Active and wired are in use. Compressor is already-reclaimed. Inactive is
 * discounted rather than trusted whole.
 */
export function darwinAvailableBytes(parsed, { policy = MEMORY_POLICY_V1 } = {}) {
  if (!parsed) return null;
  const { pageSize, pages } = parsed;
  const p = (name) => (Number.isFinite(pages[name]) ? pages[name] : 0) * pageSize;
  const free = p("Pages free");
  const speculative = policy.count_speculative ? p("Pages speculative") : 0;
  const purgeable = policy.count_purgeable ? p("Pages purgeable") : 0;
  const inactive = p("Pages inactive");
  const reclaimable = inactive * policy.inactive_reclaim_fraction;
  return {
    free_bytes: free,
    speculative_bytes: speculative,
    purgeable_bytes: purgeable,
    inactive_bytes: inactive,
    reclaimable_bytes: reclaimable,
    available_bytes: free + speculative + purgeable + reclaimable,
    active_bytes: p("Pages active"),
    wired_bytes: p("Pages wired down"),
    compressor_bytes: p("Pages occupied by compressor"),
    file_backed_bytes: p("File-backed pages"),
    anonymous_bytes: p("Anonymous pages"),
  };
}

/** Linux answers this question itself; MemAvailable is the kernel's estimate. */
export function linuxAvailableBytes(meminfoText) {
  const kb = (name) => {
    const m = String(meminfoText ?? "").match(new RegExp(`^${name}:\\s+(\\d+) kB`, "m"));
    return m ? Number(m[1]) * 1024 : null;
  };
  const available = kb("MemAvailable");
  if (available == null) return null;
  return {
    free_bytes: kb("MemFree") ?? 0,
    inactive_bytes: kb("Inactive") ?? 0,
    reclaimable_bytes: (kb("SReclaimable") ?? 0) + (kb("Cached") ?? 0),
    available_bytes: available,
    compressor_bytes: null,
  };
}

/**
 * Classify pressure from live evidence.
 *
 * ANY of the blocking conditions is enough — the instruction that every signal
 * must be bad before blocking is how a host ends up swapping while its capacity
 * axis reports healthy.
 */
export function classifyPressure({
  availableBytes = null,
  reserveBytes = null,
  swapoutsDelta = null,
  swapRateKnown = false,
  osFreePct = null,
  compressorBytes = null,
  totalBytes = null,
  policy = MEMORY_POLICY_V1,
} = {}) {
  const reasons = [];
  let state = "healthy";
  const worsen = (next, why) => {
    reasons.push(why);
    const rank = { healthy: 0, watch: 1, pressure: 2, unknown: 0 };
    if (rank[next] > rank[state]) state = next;
  };

  if (!Number.isFinite(availableBytes)) {
    // Degrade conservatively: an unreadable host is not a healthy host.
    return { state: "unknown", reasons: ["available memory could not be measured"], blocking: true };
  }

  // Live swapping is the strongest evidence there is, and it outranks a
  // comfortable-looking availability number.
  if (swapRateKnown && Number.isFinite(swapoutsDelta) && swapoutsDelta >= policy.swapout_pressure_threshold) {
    worsen("pressure", `${swapoutsDelta} swapout(s) during the bounded sample`);
  }
  if (Number.isFinite(osFreePct)) {
    if (osFreePct < policy.os_free_pct_pressure_below) worsen("pressure", `the OS reports ${osFreePct}% memory free`);
    else if (osFreePct < policy.os_free_pct_watch_below) worsen("watch", `the OS reports ${osFreePct}% memory free`);
  }
  if (Number.isFinite(reserveBytes)) {
    if (availableBytes < reserveBytes) {
      worsen("pressure", `available ${gb(availableBytes)} GB is below the ${gb(reserveBytes)} GB reserve`);
    } else if (availableBytes < reserveBytes * policy.watch_reserve_multiple) {
      worsen("watch", `available ${gb(availableBytes)} GB is within ${policy.watch_reserve_multiple}x of the reserve`);
    }
  }
  // Elevated compression is a warning, never an availability figure.
  if (Number.isFinite(compressorBytes) && Number.isFinite(totalBytes) && totalBytes > 0
    && compressorBytes / totalBytes >= policy.compressor_watch_fraction) {
    worsen("watch", `the compressor holds ${gb(compressorBytes)} GB, over ${Math.round(policy.compressor_watch_fraction * 100)}% of RAM`);
  }

  return { state, reasons, blocking: state === "pressure" };
}

/**
 * Build the one snapshot both health and admission consume.
 *
 * Everything downstream reads `available_gb`. Nothing recomputes availability,
 * so health and the capacity axis cannot disagree about what the host has.
 */
export function memorySnapshot({
  platform = null,
  totalBytes = null,
  vmStatText = null,
  memoryPressureText = null,
  meminfoText = null,
  osFreeBytes = null,
  swapoutsDelta = null,
  swapinsDelta = null,
  swapRateKnown = false,
  reserveFraction = 0.10,
  policy = MEMORY_POLICY_V1,
} = {}) {
  const total = Number.isFinite(totalBytes) ? totalBytes : null;
  const reserve = total != null ? total * reserveFraction : null;

  let parts = null;
  let strategy = "unavailable";
  let confidence = "unavailable";

  if (platform === "darwin" && vmStatText) {
    const parsed = parseVmStat(vmStatText);
    parts = darwinAvailableBytes(parsed, { policy });
    if (parts) { strategy = "darwin_vm_stat_page_accounting"; confidence = "authoritative"; }
  } else if (platform === "linux" && meminfoText) {
    parts = linuxAvailableBytes(meminfoText);
    if (parts) { strategy = "linux_meminfo_available"; confidence = "authoritative"; }
  }
  if (!parts && Number.isFinite(osFreeBytes)) {
    // The portable fallback is genuinely weaker, and says so rather than
    // pretending macOS page math applies everywhere.
    parts = { free_bytes: osFreeBytes, available_bytes: osFreeBytes, inactive_bytes: null, reclaimable_bytes: null, compressor_bytes: null };
    strategy = "generic_os_freemem";
    confidence = "best_effort";
  }

  const osFreePct = memoryPressureText ? parseMemoryPressure(memoryPressureText) : null;
  const available = parts?.available_bytes ?? null;
  const pressure = classifyPressure({
    availableBytes: available,
    reserveBytes: reserve,
    swapoutsDelta, swapRateKnown, osFreePct,
    compressorBytes: parts?.compressor_bytes ?? null,
    totalBytes: total,
    policy,
  });

  return {
    schema_version: MEMORY_CAPACITY_SCHEMA,
    platform,
    measurement_strategy: strategy,
    measurement_source: strategy === "darwin_vm_stat_page_accounting" ? "vm_stat + memory_pressure"
      : strategy === "linux_meminfo_available" ? "/proc/meminfo MemAvailable"
        : strategy === "generic_os_freemem" ? "os.freemem()" : "none",
    confidence,
    incomplete: parts == null,

    total_gb: gb(total),
    free_gb: gb(parts?.free_bytes ?? null),
    inactive_gb: gb(parts?.inactive_bytes ?? null),
    reclaimable_gb: gb(parts?.reclaimable_bytes ?? null),
    available_gb: gb(available),
    reserve_gb: gb(reserve),
    available_above_reserve_gb: (available != null && reserve != null) ? Number(((available - reserve) / GB).toFixed(2)) : null,
    compressor_gb: gb(parts?.compressor_bytes ?? null),

    // Percentages are of AVAILABLE, not of free pages — the distinction the
    // whole correction turns on.
    available_pct: (available != null && total) ? (available / total) * 100 : null,
    os_free_pct: osFreePct,

    swapouts_delta: swapRateKnown ? swapoutsDelta : null,
    swapins_delta: swapRateKnown ? swapinsDelta : null,
    swap_rate_known: swapRateKnown === true,

    pressure_state: pressure.state,
    pressure_reasons: pressure.reasons,
    under_pressure: pressure.blocking,

    policy_version: policy.version,
    inactive_reclaim_fraction: policy.inactive_reclaim_fraction,
  };
}

/** Would admitting an expensive workload be unsafe right now? */
export function memoryAdmits(snapshot) {
  if (!snapshot || snapshot.incomplete) return { admits: false, reason: "memory state could not be measured" };
  if (snapshot.under_pressure) {
    return { admits: false, reason: snapshot.pressure_reasons.join("; ") || "the host is under memory pressure" };
  }
  return { admits: true, reason: `${snapshot.available_gb} GB available against a ${snapshot.reserve_gb} GB reserve` };
}
