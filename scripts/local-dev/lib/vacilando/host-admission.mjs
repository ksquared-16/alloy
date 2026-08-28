/**
 * Host Admission V2 — a verdict from several signals, not one.
 *
 * THE CONTRADICTION THIS RESOLVES. A host with 0.11 GB genuinely free, 42.5 GB
 * of data squeezed into an 8.3 GB compressor, and 14.9 of 16.4 GB of swap
 * consumed returned ADMITS, because `available` counted reclaimable inactive
 * memory and 4.81 GB cleared a 2.4 GB reserve. Every number was correct. The
 * verdict was still wrong, because "available" on macOS means "reclaimable by
 * compressing or swapping", and this host had almost nowhere left to put it.
 *
 * THE OPPOSITE MISTAKE IS EASIER AND WORSE. Judging macOS by free memory alone
 * fails every healthy machine: a well-running Mac deliberately keeps free near
 * zero and holds the rest as cache. So low free MUST NOT fail a host on its own.
 *
 * THE RULE. Low free is only alarming in company. It takes low free AND spent
 * swap AND heavy compression before the host stops being admissible — each of
 * those alone is ordinary, and together they mean the next allocation has
 * nowhere to go.
 *
 * THRESHOLDS ARE DECLARED HERE, FROM PRINCIPLE, and are not tuned to any
 * measurement taken on any particular day.
 */
export const HOST_ADMISSION_SCHEMA = "vacilando.host_admission.v2";

export const ADMISSION_STATES = Object.freeze(["HEALTHY", "WATCH", "PROBLEM", "NOT_ADMITTED"]);

export const ADMISSION_POLICY_V2 = Object.freeze({
  version: "host_admission_v2",
  // Swap headroom is the signal that cannot be argued with: when swap is gone,
  // "available" memory has nowhere to be made available TO.
  swap_headroom_watch: 0.35,
  swap_headroom_problem: 0.20,
  swap_headroom_critical: 0.10,
  // Compressor size relative to RAM. Ordinary macOS compresses; a compressor
  // holding a quarter of physical memory is doing so under duress.
  compressor_fraction_watch: 0.15,
  compressor_fraction_extreme: 0.25,
  // Free memory ALONE never fails a host. It only ever contributes.
  free_fraction_floor: 0.02,
  // Available must still clear a reserve, as in v1.
  available_reserve_fraction: 0.10,
  // Load relative to cores, matching capacity-policy v1.
  load_watch_multiple: 1.0,
  load_problem_multiple: 1.5,
  // Residue holding this share of the compressor makes a HEALTHY verdict
  // dishonest even when every other number is fine.
  residue_compressor_fraction: 0.20,
});

const frac = (n, d) => (d > 0 ? Number(n) / Number(d) : null);
const pct = (x) => (x == null ? "unknown" : `${(x * 100).toFixed(1)}%`);
const gb = (b) => (b == null ? "unknown" : `${(Number(b) / 1073741824).toFixed(2)} GB`);

/**
 * Classify one host.
 *
 * Every signal is measured independently and reported with its own state, so a
 * verdict can always be traced to the signal that produced it. A missing signal
 * is `unknown` and never silently passes.
 */
export function classifyHostAdmission({
  totalBytes = null,
  freeBytes = null,
  availableBytes = null,
  compressorBytes = null,
  swapTotalBytes = null,
  swapUsedBytes = null,
  pressureState = null,
  residueFootprintBytes = 0,
  loadAvg = null,
  cores = null,
  policy = ADMISSION_POLICY_V2,
} = {}) {
  const signals = [];
  const add = (name, state, detail, value) => signals.push({ signal: name, state, detail, value });

  const freeFrac = frac(freeBytes, totalBytes);
  const availFrac = frac(availableBytes, totalBytes);
  const comprFrac = frac(compressorBytes, totalBytes);
  const swapFree = (swapTotalBytes != null && swapUsedBytes != null) ? swapTotalBytes - swapUsedBytes : null;
  const swapHeadroom = frac(swapFree, swapTotalBytes);

  // 1. Free memory — informational by design. Never escalates on its own.
  if (freeFrac == null) add("free_memory", "unknown", "free memory not measured", null);
  else if (freeFrac < policy.free_fraction_floor) {
    add("free_memory", "low", `${gb(freeBytes)} free (${pct(freeFrac)}) — ordinary on macOS in isolation`, freeFrac);
  } else add("free_memory", "healthy", `${gb(freeBytes)} free (${pct(freeFrac)})`, freeFrac);

  // 2. Available against reserve.
  if (availFrac == null) add("available_memory", "unknown", "available memory not measured", null);
  else if (availFrac < policy.available_reserve_fraction) {
    add("available_memory", "problem", `${gb(availableBytes)} available, under the ${pct(policy.available_reserve_fraction)} reserve`, availFrac);
  } else add("available_memory", "healthy", `${gb(availableBytes)} available (${pct(availFrac)})`, availFrac);

  // 3. Swap headroom — the decisive signal.
  if (swapHeadroom == null) add("swap_headroom", "unknown", "swap not measured", null);
  else if (swapHeadroom < policy.swap_headroom_critical) {
    add("swap_headroom", "critical", `${gb(swapFree)} of swap free (${pct(swapHeadroom)}) — nowhere left to spill`, swapHeadroom);
  } else if (swapHeadroom < policy.swap_headroom_problem) {
    add("swap_headroom", "problem", `${gb(swapFree)} of swap free (${pct(swapHeadroom)})`, swapHeadroom);
  } else if (swapHeadroom < policy.swap_headroom_watch) {
    add("swap_headroom", "watch", `${gb(swapFree)} of swap free (${pct(swapHeadroom)})`, swapHeadroom);
  } else add("swap_headroom", "healthy", `${gb(swapFree)} of swap free (${pct(swapHeadroom)})`, swapHeadroom);

  // 4. Compression magnitude.
  if (comprFrac == null) add("compressor", "unknown", "compressor not measured", null);
  else if (comprFrac >= policy.compressor_fraction_extreme) {
    add("compressor", "extreme", `compressor holds ${gb(compressorBytes)} (${pct(comprFrac)} of RAM)`, comprFrac);
  } else if (comprFrac >= policy.compressor_fraction_watch) {
    add("compressor", "watch", `compressor holds ${gb(compressorBytes)} (${pct(comprFrac)} of RAM)`, comprFrac);
  } else add("compressor", "healthy", `compressor holds ${gb(compressorBytes)} (${pct(comprFrac)} of RAM)`, comprFrac);

  // 5. OS pressure verdict, when the OS offers one.
  if (pressureState == null) add("os_pressure", "unknown", "no OS pressure verdict", null);
  else add("os_pressure", String(pressureState).toLowerCase() === "normal" ? "healthy" : "problem", `OS reports ${pressureState}`, null);

  // 6. Load.
  const load15 = Array.isArray(loadAvg) ? Number(loadAvg[2]) : null;
  if (load15 == null || !cores) add("load", "unknown", "load or core count not measured", null);
  else if (load15 > cores * policy.load_problem_multiple) add("load", "problem", `15m load ${load15.toFixed(2)} on ${cores} cores`, load15);
  else if (load15 >= cores * policy.load_watch_multiple) add("load", "watch", `15m load ${load15.toFixed(2)} on ${cores} cores`, load15);
  else add("load", "healthy", `15m load ${load15.toFixed(2)} on ${cores} cores`, load15);

  // 7. Terminal-run residue share of the compressor.
  const residueFrac = frac(residueFootprintBytes, compressorBytes);
  if (residueFrac != null && residueFrac >= policy.residue_compressor_fraction) {
    add("terminal_residue", "problem", `terminal-run residue holds ${gb(residueFootprintBytes)} (${pct(residueFrac)} of the compressor)`, residueFrac);
  } else add("terminal_residue", "healthy", `terminal-run residue ${gb(residueFootprintBytes)}`, residueFrac ?? 0);

  const s = (n) => signals.find((x) => x.signal === n)?.state ?? "unknown";

  // ── The combination rule ───────────────────────────────────────────────────
  const swapSpent = ["critical", "problem"].includes(s("swap_headroom"));
  const heavilyCompressed = ["extreme"].includes(s("compressor"));
  const freeLow = s("free_memory") === "low";
  const reasons = [];
  let state;

  if (s("swap_headroom") === "critical" && heavilyCompressed) {
    // Nowhere to spill AND already spilling hard. The next allocation has no home.
    state = "NOT_ADMITTED";
    reasons.push("swap is effectively exhausted while the compressor is already carrying an extreme load");
  } else if (freeLow && swapSpent && heavilyCompressed) {
    state = "NOT_ADMITTED";
    reasons.push("free memory, swap headroom and compression are all past their limits together");
  } else if (s("available_memory") === "problem" && swapSpent) {
    state = "NOT_ADMITTED";
    reasons.push("available memory is under reserve and swap cannot absorb the difference");
  } else if (swapSpent || heavilyCompressed || s("load") === "problem" || s("os_pressure") === "problem") {
    state = "PROBLEM";
    if (swapSpent) reasons.push(signals.find((x) => x.signal === "swap_headroom").detail);
    if (heavilyCompressed) reasons.push(signals.find((x) => x.signal === "compressor").detail);
    if (s("load") === "problem") reasons.push(signals.find((x) => x.signal === "load").detail);
    if (s("os_pressure") === "problem") reasons.push(signals.find((x) => x.signal === "os_pressure").detail);
  } else if (s("swap_headroom") === "watch" || s("compressor") === "watch" || s("load") === "watch" || freeLow) {
    state = "WATCH";
    if (freeLow) reasons.push("free memory is low, which alone is ordinary on macOS");
    for (const n of ["swap_headroom", "compressor", "load"]) {
      if (s(n) === "watch") reasons.push(signals.find((x) => x.signal === n).detail);
    }
  } else {
    state = "HEALTHY";
  }

  // Residue can never leave a verdict looking uncomplicated.
  if (s("terminal_residue") === "problem" && state === "HEALTHY") {
    state = "WATCH";
    reasons.push(signals.find((x) => x.signal === "terminal_residue").detail);
  }

  // An unknown signal cannot be read as a passed one.
  const unknown = signals.filter((x) => x.state === "unknown").map((x) => x.signal);
  if (unknown.length && state === "HEALTHY") {
    state = "WATCH";
    reasons.push(`not measured: ${unknown.join(", ")}`);
  }

  return {
    schema_version: HOST_ADMISSION_SCHEMA,
    policy_version: policy.version,
    state,
    admitted: state === "HEALTHY" || state === "WATCH",
    reasons,
    signals,
    unknown_signals: unknown,
  };
}
