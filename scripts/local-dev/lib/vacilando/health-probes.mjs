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
 * Memory, with a bounded two-sample swap delta.
 *
 * The audit's 249 million lifetime swapouts said almost nothing about current
 * pressure. Only the DELTA between two samples does, so this takes a second
 * sample after a short interval — and when it cannot, it says the rate is
 * unknown instead of reusing the lifetime counter as if it were a rate.
 */
export async function probeMemory({ os, sampleMs = 700, exec = boundedExec } = {}) {
  const read = async () => {
    const out = await exec("vm_stat", [], { timeoutMs: 1500 });
    if (!out.ok) return null;
    const m = {};
    for (const line of out.stdout.split("\n")) {
      const kv = line.match(/^(.+?):\s+(\d+)\.?$/);
      if (kv) m[kv[1].trim()] = Number(kv[2]);
    }
    return m;
  };
  const a = await read();
  if (!a) return null;

  const free = (a["Pages free"] || 0) * PAGE;
  const compressor = (a["Pages occupied by compressor"] || 0) * PAGE;
  const total = Number(os?.totalmem?.()) || 0;

  let swapRateKnown = false;
  let swapoutsDelta = null;
  if (sampleMs > 0) {
    await new Promise((r) => { setTimeout(r, sampleMs); });
    const b = await read();
    if (b && Number.isFinite(b.Swapouts) && Number.isFinite(a.Swapouts)) {
      swapoutsDelta = b.Swapouts - a.Swapouts;
      swapRateKnown = true;
    }
  }

  return {
    free_gb: Number((free / 1073741824).toFixed(2)),
    free_pct: total ? (free / total) * 100 : NaN,
    compressor_gb: Number((compressor / 1073741824).toFixed(2)),
    swapouts_delta: swapoutsDelta,
    swap_rate_known: swapRateKnown,
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
export async function probeGateway({ url = "http://127.0.0.1:3020/", firstMs = 3000, retryMs = 15000, exec = boundedExec } = {}) {
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
