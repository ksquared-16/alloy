/**
 * Bounded probes for `vac health`.
 *
 * Separated from health.mjs on purpose: the checks are pure and fully testable
 * with fixtures, and everything that touches the machine — and can therefore
 * hang — lives here behind a timeout.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE. The moment health matters most is the
 * moment the host can least afford to answer. Every probe is bounded, every
 * failure is isolated, and a probe that misses its budget yields `null` so its
 * check becomes INCOMPLETE. Nothing here may block the report.
 */
import { execFile } from "node:child_process";
import { statfsSync } from "node:fs";

/** Run a command with a hard time budget. Never throws; never hangs. */
import { gatewayPort } from "./managed-slots.mjs";
import { memorySnapshot } from "./memory-capacity.mjs";

export function boundedExec(cmd, args, { timeoutMs = 2000, maxBuffer = 32 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    let child;
    try {
      child = execFile(cmd, args, { timeout: timeoutMs, maxBuffer, encoding: "utf8" }, (err, stdout) => {
        done(err ? { ok: false, stdout: String(stdout || ""), error: String(err.message || err) } : { ok: true, stdout: String(stdout || "") });
      });
    } catch (err) {
      done({ ok: false, stdout: "", error: String(err?.message || err) });
      return;
    }
    // Belt and braces: execFile's own timeout kills the child, but a child that
    // ignores SIGTERM would still hold the promise open. The timer is NOT
    // unref'd — unref'ing every handle let node exit before the probes settled,
    // which surfaced as "unsettled top-level await" and an empty report.
    const t = setTimeout(() => {
      try { child?.kill?.("SIGKILL"); } catch { /* already gone */ }
      done({ ok: false, stdout: "", error: "probe_timeout" });
    }, timeoutMs + 250);
    const clear = () => clearTimeout(t);
    child?.once?.("close", clear);
    child?.once?.("error", clear);
  });
}

/** Wrap any promise in a budget so one slow probe cannot stall the report. */
export function withBudget(promise, ms, fallback = null) {
  let timer = null;
  const budget = new Promise((r) => { timer = setTimeout(() => r(fallback), ms); });
  return Promise.race([promise.catch(() => fallback), budget])
    .finally(() => { if (timer) clearTimeout(timer); });
}

export function probeLoad({ os }) {
  try {
    const [one, five, fifteen] = os.loadavg();
    return { one, five, fifteen };
  } catch { return null; }
}

const PAGE = 16384;

/**
 * Memory, measured as AVAILABILITY rather than as unused pages.
 *
 * This used to return `Pages free` and call it free memory. On macOS that is
 * not what the number means: the kernel keeps free pages near zero on purpose
 * and holds reclaimable memory on the inactive queue. The result was a host
 * with ~5 GB it could hand out reporting 0.06 GB, and S4 refusing every
 * production build against a 2.4 GB reserve that was never actually breached.
 *
 * The measurement now goes through memory-capacity.mjs, which is the single
 * owner: health and capacity admission read the same snapshot, so they cannot
 * disagree about what the host has. The bounded two-sample swap delta stays,
 * because a lifetime counter is still not a rate.
 *
 * Legacy fields are kept so nothing downstream breaks, but `free_gb` now means
 * what it says — genuinely unused pages — and is no longer what the reserve is
 * compared against. `available_gb` is.
 */
export async function probeMemory({ os, sampleMs = 700, exec = boundedExec } = {}) {
  const readVmStat = async () => {
    const out = await exec("vm_stat", [], { timeoutMs: 1500 });
    return out.ok ? out.stdout : null;
  };
  const counters = (text) => {
    const m = {};
    for (const line of String(text ?? "").split("\n")) {
      const kv = line.match(/^(.+?):\s+(\d+)\.?$/);
      if (kv) m[kv[1].trim()] = Number(kv[2]);
    }
    return m;
  };

  const first = await readVmStat();
  if (!first) return null;
  const a = counters(first);

  let swapRateKnown = false;
  let swapoutsDelta = null;
  let swapinsDelta = null;
  if (sampleMs > 0) {
    await new Promise((r) => { setTimeout(r, sampleMs); });
    const second = await readVmStat();
    const b = second ? counters(second) : null;
    if (b && Number.isFinite(b.Swapouts) && Number.isFinite(a.Swapouts)) {
      swapoutsDelta = b.Swapouts - a.Swapouts;
      swapinsDelta = Number.isFinite(b.Swapins) && Number.isFinite(a.Swapins) ? b.Swapins - a.Swapins : null;
      swapRateKnown = true;
    }
  }

  // macOS's own availability opinion, where it is readable. Bounded and
  // optional: its absence degrades confidence, never correctness.
  let pressureText = null;
  const platform = os?.platform?.() || null;
  if (platform === "darwin") {
    const mp = await exec("memory_pressure", [], { timeoutMs: 2500 });
    if (mp.ok) pressureText = mp.stdout;
  }
  let meminfoText = null;
  if (platform === "linux") {
    const mi = await exec("cat", ["/proc/meminfo"], { timeoutMs: 1500 });
    if (mi.ok) meminfoText = mi.stdout;
  }

  const snapshot = memorySnapshot({
    platform,
    totalBytes: Number(os?.totalmem?.()) || null,
    vmStatText: first,
    memoryPressureText: pressureText,
    meminfoText,
    osFreeBytes: Number(os?.freemem?.()) || null,
    swapoutsDelta, swapinsDelta, swapRateKnown,
  });

  return {
    ...snapshot,
    // Legacy shape, retained so existing readers keep working. `free_pct` is
    // the percentage of genuinely unused pages and is NOT the admission signal.
    free_pct: snapshot.total_gb ? (snapshot.free_gb / snapshot.total_gb) * 100 : NaN,
  };
}

export function probeDisk({ mount = "/System/Volumes/Data" } = {}) {
  try {
    const s = statfsSync(mount);
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    return {
      mount,
      total_gb: Number((total / 1073741824).toFixed(1)),
      free_gb: Number((free / 1073741824).toFixed(1)),
      free_pct: total ? (free / total) * 100 : NaN,
    };
  } catch { return null; }
}

/**
 * Gateway probe with the false-outage lesson encoded.
 *
 * A short probe is tried first. ONLY if it times out is a second, longer probe
 * attempted — because a 3s timeout once reported an outage for a Gateway that
 * was serving in 10.3s. Down is asserted only when both fail.
 */
export async function probeGateway({ url = null, firstMs = 3000, retryMs = 15000, exec = boundedExec } = {}) {
  // Derived from the one owner: a health probe pinned to a literal port reports
  // the control plane down the moment the control plane legitimately moves.
  url = url || `http://127.0.0.1:${gatewayPort()}/`;
  const hit = async (budget) => {
    const t0 = Date.now();
    const out = await exec("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "-m", String(Math.ceil(budget / 1000)), url], { timeoutMs: budget + 500 });
    const ms = Date.now() - t0;
    const code = out.ok ? out.stdout.trim() : "000";
    return { ok: out.ok && code !== "000" && code !== "", code, ms };
  };
  const first = await hit(firstMs);
  if (first.ok) return { status: "ok", ms: first.ms, code: first.code, retried: false };
  const retry = await hit(retryMs);
  return retry.ok
    ? { status: "degraded", ms: null, retried: true, retry_ok: true, retry_ms: retry.ms, code: retry.code }
    : { status: "down", ms: null, retried: true, retry_ok: false, retry_ms: null };
}

/** ps table for attribution. Bounded; a miss yields null and an INCOMPLETE check. */
export async function probeProcessTable({ exec = boundedExec, timeoutMs = 4000 } = {}) {
  const out = await exec("ps", ["-Ao", "pid=,ppid=,command="], { timeoutMs });
  return out.ok ? out.stdout : null;
}

export async function probeTmuxPanes({ exec = boundedExec, timeoutMs = 2500 } = {}) {
  const fmt = "#{pane_id}|#{pane_pid}|#{session_name}|#{pane_current_command}|#{pane_current_path}|#{pane_title}";
  const out = await exec("tmux", ["list-panes", "-a", "-F", fmt], { timeoutMs });
  if (!out.ok) return null;
  return out.stdout.trim().split("\n").filter(Boolean).map((l) => {
    const [pane_id, pid, session, command, cwd, title] = l.split("|");
    return { pane_id, pid: Number(pid), session, command, cwd, title };
  });
}

/**
 * Which running processes look like heavy validation?
 *
 * S2 must NOT decide workload cost — that is S3. This is a shape heuristic used
 * only to populate an explicitly approximate check, and it is named so that no
 * later reader mistakes it for a classifier.
 */
export function looksLikeValidation(command) {
  const s = String(command || "");
  if (/\bvac-run\b|\balloy-validate\b/.test(s)) return false;
  return /\bvitest\b|\bjest\b|\bplaywright\b|typescript\/bin\/tsc\b|\btsc\b|next\s+build\b/.test(s);
}
