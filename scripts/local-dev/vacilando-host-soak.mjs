#!/usr/bin/env node
/**
 * HOST LIFECYCLE V1 SOAK PROBE — the same measurements the September 11
 * incident was diagnosed with, sampled on a schedule so "bounded" can be a
 * finding rather than an impression.
 *
 *   node vacilando-host-soak.mjs --run [--interval 60] [--hours 24] [--out PATH]
 *                                 [--own-resource --owner-run <erun> [--owner-lane <lane>]]
 *   node vacilando-host-soak.mjs --report [--out PATH]
 *
 * Acceptance 12 asks for bounded Gateway RSS, idle CPU, owned process count,
 * stale ownership count, recovery backlog and event-store growth over 24 hours.
 * That is wall-clock and cannot be short-circuited, so this writes JSONL samples
 * and a separate pass reads them. A soak whose result depends on one session
 * staying open is not a soak.
 *
 * Every probe here is CHEAP and read-only: `ps` for the two control-plane
 * processes, `stat` on ledgers, and a count of JSON records. Deliberately no
 * `du`, no `git status`, no `docker` — measuring the host must not reproduce the
 * load being measured.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const GATEWAY_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim()
  || join(homedir(), ".local", "state", "alloy-dev", "gateway");
const DEFAULT_OUT = join(GATEWAY_ROOT, "vacilando", "host-soak.jsonl");

const LEDGERS = {
  recovery_events: join(GATEWAY_ROOT, "vacilando", "execution-runs", "recovery-events.jsonl"),
  audit: join(GATEWAY_ROOT, "vacilando", "audit.jsonl"),
  admission_events: join(GATEWAY_ROOT, "vacilando", "execution-runs", "admission-events.jsonl"),
  runs: join(GATEWAY_ROOT, "vacilando", "execution-runs", "runs.json"),
};

function sizeOf(path) {
  try { return statSync(path).size; } catch { return null; }
}

/** The control-plane processes, by their absolute executable path — never by name. */
function controlPlane() {
  let out = "";
  try { out = execFileSync("ps", ["-eo", "pid,rss,%cpu,command"], { encoding: "utf8", maxBuffer: 8 << 20 }); } catch { return []; }
  return out.split("\n")
    .filter((l) => /toolkit\/[0-9a-f]+\/lib\/vacilando-(server|gateway-host)\.mjs|toolkit\/current\/lib\/vacilando-gateway-host\.mjs/.test(l))
    .map((l) => {
      const m = l.trim().match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+(.*)$/);
      if (!m) return null;
      const toolkit = m[4].match(/toolkit\/([0-9a-f]+|current)\//)?.[1] || null;
      return {
        pid: Number(m[1]),
        rss_kb: Number(m[2]),
        cpu_pct: Number(m[3]),
        role: /vacilando-server/.test(m[4]) ? "server" : "gateway_host",
        toolkit,
      };
    })
    .filter(Boolean);
}

function ownership() {
  const out = { owned_total: null, owned_current: null, owned_stale_generation: null, pid_claims: null, pid_claims_stale: null };
  try {
    const raw = JSON.parse(readFileSync(join(GATEWAY_ROOT, "vacilando", "execution-runs", "owned-processes.json"), "utf8"));
    const procs = Array.isArray(raw?.processes) ? raw.processes : [];
    const owner = JSON.parse(readFileSync(join(GATEWAY_ROOT, "vacilando", "control-plane-owner.json"), "utf8"));
    const gen = owner?.runtime_generation || null;
    out.owned_total = procs.length;
    out.owned_current = gen ? procs.filter((p) => p.runtime_generation === gen).length : null;
    out.owned_stale_generation = gen ? procs.filter((p) => p.runtime_generation !== gen).length : null;
  } catch { /* absent stores read as null, never as zero */ }
  try {
    const dir = join(GATEWAY_ROOT, "pids");
    const files = readdirSync(dir).filter((n) => n.endsWith(".pid"));
    out.pid_claims = files.length;
    out.pid_claims_stale = files.filter((n) => {
      const pid = Number(readFileSync(join(dir, n), "utf8").trim());
      if (!Number.isInteger(pid) || pid <= 0) return true;
      try { process.kill(pid, 0); return false; } catch { return true; }
    }).length;
  } catch { /* */ }
  return out;
}

/** Recovery backlog: episodes that are neither resolved nor terminal. */
function recoveryBacklog() {
  try {
    const raw = JSON.parse(readFileSync(join(GATEWAY_ROOT, "vacilando", "execution-runs", "recovery-budgets.json"), "utf8"));
    const eps = Object.values(raw?.episodes || {});
    const now = Date.now();
    // `open` counts only what is CURRENT. The ledger keeps one episode per
    // (policy, target) forever, so counting every non-terminal row reports three
    // weeks of history as live backlog — it read 73 on an idle host.
    const recent = eps.filter((e) => {
      if (e.terminal === true) return false;
      const t = Date.parse(e.last_at || e.first_at || "");
      return Number.isFinite(t) && (now - t) <= 15 * 60_000;
    });
    return {
      episodes: eps.length,
      terminal: eps.filter((e) => e.terminal === true).length,
      open: recent.length,
      unresolved_historical: eps.filter((e) => e.terminal !== true).length - recent.length,
    };
  } catch { return { episodes: null, terminal: null, open: null }; }
}

async function sample() {
  const procs = controlPlane();
  const server = procs.find((p) => p.role === "server") || null;
  return {
    at: new Date().toISOString(),
    processes: procs,
    server_rss_kb: server?.rss_kb ?? null,
    server_cpu_pct: server?.cpu_pct ?? null,
    server_toolkit: server?.toolkit ?? null,
    ledger_bytes: Object.fromEntries(Object.entries(LEDGERS).map(([k, p]) => [k, sizeOf(p)])),
    ownership: ownership(),
    recovery: recoveryBacklog(),
  };
}

function report(out) {
  if (!existsSync(out)) {
    process.stdout.write(`no samples at ${out}\n`);
    process.exit(2);
  }
  const rows = readFileSync(out, "utf8").split("\n").filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
  if (!rows.length) { process.stdout.write("no parseable samples\n"); process.exit(2); }
  const first = rows[0];
  const last = rows[rows.length - 1];
  const spanMs = Date.parse(last.at) - Date.parse(first.at);
  const nums = (f) => rows.map(f).filter((n) => Number.isFinite(n));
  const stat = (xs) => xs.length
    ? { min: Math.min(...xs), max: Math.max(...xs), last: xs[xs.length - 1], p95: xs.slice().sort((a, b) => a - b)[Math.floor(xs.length * 0.95)] ?? Math.max(...xs) }
    : null;
  const growth = Object.fromEntries(Object.keys(LEDGERS).map((k) => [k, {
    first: first.ledger_bytes?.[k] ?? null,
    last: last.ledger_bytes?.[k] ?? null,
    growth_bytes: (last.ledger_bytes?.[k] ?? 0) - (first.ledger_bytes?.[k] ?? 0),
  }]));
  process.stdout.write(`${JSON.stringify({
    samples: rows.length,
    span_hours: Math.round((spanMs / 3_600_000) * 100) / 100,
    from: first.at,
    to: last.at,
    server_rss_kb: stat(nums((r) => r.server_rss_kb)),
    server_cpu_pct: stat(nums((r) => r.server_cpu_pct)),
    owned_processes: stat(nums((r) => r.ownership?.owned_total)),
    stale_generation_ownership: stat(nums((r) => r.ownership?.owned_stale_generation)),
    stale_pid_claims: stat(nums((r) => r.ownership?.pid_claims_stale)),
    recovery_open_episodes: stat(nums((r) => r.recovery?.open)),
    ledger_growth: growth,
    toolkits_observed: [...new Set(rows.map((r) => r.server_toolkit).filter(Boolean))],
  }, null, 2)}\n`);
}

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const out = flag("out", DEFAULT_OUT);

/**
 * THE SOAK OWNS ITS OWN PROTECTION.
 *
 * An authoritative soak measures ONE build. If the build can be replaced while
 * it samples, the samples describe a host that no longer exists — which is
 * exactly what invalidated the first 24-hour attempt. So the soak takes
 * `gateway_host_mutation` itself, as the process, and the governor's ordinary
 * refusal does the rest.
 *
 * WHY THE PROCESS AND NOT THE RUN THAT STARTED IT. The claim previously belonged
 * to whichever Execution Run requested it, and `cleanupRunResources` released it
 * the instant that run completed — hours before the soak finished. The run
 * stays the requester and the audit origin; this attaches the soak's own pid and
 * start time, so the claim lasts exactly as long as the measurement does.
 *
 * RELEASED ON EVERY ORDINARY EXIT, and reclaimed by liveness on every
 * extraordinary one: a killed soak leaves a claim whose pid is gone, and the
 * first reader that would be blocked by it releases it. There is no path that
 * leaves the host protected by something that is not running.
 */
async function ownHostMutation() {
  const runId = flag("owner-run", process.env.VACILANDO_RUN_ID || null);
  if (!runId) {
    process.stderr.write("host-soak: --own-resource needs --owner-run <erun_...>\n");
    process.exit(2);
  }
  const laneId = flag("owner-lane", null);
  const mod = await import("./lib/vacilando/gateway-host-mutation.mjs");
  const { execFileSync } = await import("node:child_process");
  let startedAt = null;
  try {
    startedAt = execFileSync("ps", ["-o", "lstart=", "-p", String(process.pid)], {
      encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch { /* unverified is handled by the governor, never guessed at here */ }

  const res = mod.acquireGatewayHostMutation({
    runId,
    laneId,
    reason: `host lifecycle soak (pid ${process.pid}) observing ${out}`,
    origin: "agent",
    processOwner: {
      pid: process.pid,
      started_at: startedAt,
      kind: "host_soak",
      label: "Host Lifecycle criterion-12 soak",
      evidence: out,
    },
    root: GATEWAY_ROOT,
  });
  if (!res.ok || !res.granted) {
    const holder = res.holder ? `${res.holder.run_id} (${res.holder.lane_id})` : "another run";
    process.stderr.write(`host-soak: refusing to start unprotected — gateway_host_mutation is held by ${holder}\n`);
    process.exit(3);
  }
  process.stderr.write(`host-soak: holding gateway_host_mutation ${res.request.request_id} as pid ${process.pid}\n`);

  const release = () => {
    try { mod.releaseGatewayHostMutation({ runId, requestId: res.request.request_id, origin: "agent", root: GATEWAY_ROOT }); } catch { /* exiting anyway */ }
  };
  // A completed observation window is a terminal soak, and a terminal soak must
  // not keep the host. Signals are covered too, so an operator stopping the soak
  // frees the host immediately rather than waiting for a reader to notice.
  process.on("exit", release);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(sig, () => { release(); process.exit(0); });
  }
  return res.request.request_id;
}

if (args.includes("--report")) {
  report(out);
} else if (args.includes("--run")) {
  const intervalMs = Number(flag("interval", "60")) * 1000;
  const hours = Number(flag("hours", "24"));
  const until = Date.now() + hours * 3_600_000;
  if (args.includes("--own-resource")) await ownHostMutation();
  const tick = async () => {
    try { appendFileSync(out, `${JSON.stringify(await sample())}\n`, "utf8"); } catch { /* a probe must never be the thing that fails */ }
    if (Date.now() >= until) process.exit(0);
  };
  await tick();
  setInterval(() => { tick().catch(() => {}); }, intervalMs);
} else if (args.includes("--once")) {
  process.stdout.write(`${JSON.stringify(await sample(), null, 2)}\n`);
} else {
  process.stdout.write("usage: vacilando-host-soak.mjs --run [--interval S] [--hours H] [--out PATH] | --report [--out PATH] | --once\n");
  process.exit(2);
}
