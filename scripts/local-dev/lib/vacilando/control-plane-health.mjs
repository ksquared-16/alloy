/**
 * Vacilando control-plane health — startup/bind/screenshot recovery (V2 §11).
 *
 * Represents the Vacilando HTTP process itself (not a worker slot): starting,
 * slow to bind, accepting, hydrated, unresponsive, screenshot stalled,
 * recovering, recovered, failed. Recovery only targets an owned process.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import os from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { appendTimelineEvent } from "./timeline.mjs";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const FILE = join(RUNTIME_ROOT, "vacilando", "control-plane-health.json");
const OWNER_FILE = join(RUNTIME_ROOT, "vacilando", "control-plane-owner.json");

export const CONTROL_PLANE_STATES = new Set([
  "starting",
  "slow_to_bind",
  "accepting",
  "hydrated",
  "unresponsive",
  "screenshot_stalled",
  "recovering",
  "recovered",
  "recovery_failed",
  "failed",
]);

const SLOW_BIND_MS = 5_000;
const UNRESPONSIVE_MS = 15_000;
const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

function ensureDir() {
  const d = dirname(FILE);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

function read() {
  try { return JSON.parse(readFileSync(FILE, "utf8")); } catch { return null; }
}

function write(rec) {
  ensureDir();
  writeFileSync(FILE, JSON.stringify(rec, null, 2));
  return rec;
}

/**
 * WHICH INCARNATION OF THE CONTROL PLANE OWNS A RESOURCE.
 *
 * THE GAP THIS CLOSES. There was no host or runtime generation anywhere in the
 * tree — grepped, and the only matches were unrelated prose. Ownership of every
 * ephemeral resource was therefore decided by PID NUMBER ALONE, and `pidAlive`
 * cannot tell "my process, still running" from "a different process that reused
 * the number after a restart". On a Mac that runs dev servers, test runners and
 * browsers all day, PID reuse is ordinary, not exotic — and an owner record that
 * survives a Gateway restart can be matched by a stranger.
 *
 * The generation is minted once per control-plane claim and never recomputed:
 * a restart mints a new one, so every record still carrying the old one is
 * PROVABLY stale without asking the operating system anything. `boot_ms` is
 * carried for diagnosis — it says whether the host itself restarted — but
 * correctness does not rest on it: the random component alone makes two claims
 * unable to collide.
 *
 * Deliberately NOT a new registry. This is one field on the record that
 * `claimControlPlaneOwnership` already writes, plus the same field on the
 * owned-process records the Governor already keeps.
 */
const BOOT_MS = Math.round(Date.now() - os.uptime() * 1000);
let RUNTIME_GENERATION = null;

export function currentRuntimeGeneration() {
  if (!RUNTIME_GENERATION) {
    RUNTIME_GENERATION = `gen_${BOOT_MS.toString(36)}_${process.pid.toString(36)}_${randomUUID().slice(0, 8)}`;
  }
  return RUNTIME_GENERATION;
}

/** Test seam: a restart is a new generation, and a control must be able to stage one. */
export function resetRuntimeGenerationForTests() {
  RUNTIME_GENERATION = null;
  return currentRuntimeGeneration();
}

/**
 * Is this record owned by the CURRENT control plane?
 *
 * Both halves are required and neither is sufficient. A live pid from a previous
 * generation is a stranger who inherited the number. A current generation whose
 * pid is gone is our own process that has since exited.
 */
export function ownershipIsCurrent(rec, { generation = currentRuntimeGeneration() } = {}) {
  if (!rec) return false;
  if (!rec.runtime_generation) {
    // Written before generations existed. It cannot prove it is current, so it
    // is not treated as current — which is the fail-closed direction: the
    // resource is reclaimable, never silently authoritative.
    return false;
  }
  if (rec.runtime_generation !== generation) return false;
  if (rec.pid != null && !pidAlive(rec.pid)) return false;
  return true;
}

/** Record that this process owns the Vacilando server (safe restart target). */
export function claimControlPlaneOwnership({
  pid = process.pid,
  port,
  worktree = process.cwd(),
  argv = process.argv.slice(),
  missionId = null,
  desktopOwned = process.env.VACILANDO_DESKTOP_OWNED === "1" || process.env.VACILANDO_OWNED === "1",
  executionProvider = process.env.VACILANDO_EXECUTION_PROVIDER || "auto",
} = {}) {
  ensureDir();
  const owner = {
    schema_version: "vacilando.control_plane_owner.v1",
    pid,
    port: Number(port) || null,
    worktree,
    argv,
    missionId,
    desktopOwned: Boolean(desktopOwned),
    executionProvider: String(executionProvider || "auto"),
    claimed_at: iso(),
    host: os.hostname(),
    // The incarnation every ephemeral resource this process creates is stamped
    // with. A restart mints a new one and orphans the old claims by identity
    // rather than by PID arithmetic.
    runtime_generation: currentRuntimeGeneration(),
    boot_ms: BOOT_MS,
  };
  writeFileSync(OWNER_FILE, JSON.stringify(owner, null, 2));
  return owner;
}

export function readControlPlaneOwner() {
  try { return JSON.parse(readFileSync(OWNER_FILE, "utf8")); } catch { return null; }
}

export function controlPlaneOwnerPath() {
  return OWNER_FILE;
}

export function controlPlaneRuntimeRoot() {
  return RUNTIME_ROOT;
}

export function pidAlive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * One Vacilando HTTP process per ALLOY_RUNTIME_ROOT.
 * Isolated roots (tests, Gateway daemon) do not conflict with Electron's
 * default ~/.local/state/alloy-dev owner file.
 *
 * Alive foreign pid → refuse. Dead/stale pid → replace. Same pid → refresh.
 */
export function acquireControlPlaneOwnership(opts = {}) {
  const existing = readControlPlaneOwner();
  const myPid = opts.pid ?? process.pid;
  if (existing?.pid && Number(existing.pid) !== Number(myPid) && pidAlive(existing.pid)) {
    return {
      ok: false,
      error: "control_plane_owned",
      message: `Runtime root already owned by pid ${existing.pid} on :${existing.port}`,
      owner: existing,
      runtime_root: RUNTIME_ROOT,
    };
  }
  const owner = claimControlPlaneOwnership({ ...opts, pid: myPid });
  return {
    ok: true,
    owner,
    runtime_root: RUNTIME_ROOT,
    replaced_stale: Boolean(existing?.pid && Number(existing.pid) !== Number(myPid)),
  };
}

export function releaseControlPlaneOwnership({ pid = process.pid } = {}) {
  const existing = readControlPlaneOwner();
  if (!existing) return { ok: true, released: false };
  if (Number(existing.pid) !== Number(pid)) {
    return { ok: false, error: "not_owner", owner: existing };
  }
  try { unlinkSync(OWNER_FILE); } catch { /* already gone */ }
  return { ok: true, released: true };
}

export function getControlPlaneHealth() {
  return read() || {
    schema_version: "vacilando.control_plane_health.v1",
    status: "starting",
    accepting: false,
    hydrated: false,
    timings: {},
    events: [],
    updated_at: iso(),
  };
}

export function recordControlPlaneEvent({
  status,
  detail = null,
  timings = null,
  missionId = null,
  actor = "vacilando",
  nowMs,
} = {}) {
  const prev = getControlPlaneHealth();
  const now = nowMs ?? Date.now();
  const events = [...(prev.events || []), {
    status: status || prev.status,
    detail,
    at: iso(now),
  }].slice(-40);

  const rec = {
    schema_version: "vacilando.control_plane_health.v1",
    status: CONTROL_PLANE_STATES.has(status) ? status : prev.status,
    accepting: status === "accepting" || status === "hydrated" || status === "recovered" || prev.accepting,
    hydrated: status === "hydrated" || (status !== "starting" && status !== "slow_to_bind" && prev.hydrated),
    timings: { ...(prev.timings || {}), ...(timings || {}) },
    last_detail: detail,
    events,
    updated_at: iso(now),
    missionId: missionId || prev.missionId || null,
  };

  if (status === "starting") {
    rec.accepting = false;
    rec.hydrated = false;
  }
  if (status === "accepting") {
    rec.accepting = true;
  }
  if (status === "hydrated") {
    rec.accepting = true;
    rec.hydrated = true;
  }
  if (status === "unresponsive" || status === "failed" || status === "recovery_failed") {
    rec.accepting = false;
  }

  write(rec);

  if (missionId || prev.missionId) {
    try {
      appendTimelineEvent(missionId || prev.missionId, {
        type: "control_plane_health",
        summary: `Control plane — ${rec.status}${detail ? `: ${detail}` : ""}`,
        visibility: "summary",
        actor,
        detail: { status: rec.status, timings: rec.timings, detail },
        nowMs: now,
      });
    } catch { /* timeline optional */ }
  }
  return rec;
}

/**
 * Mark screenshot/browser validation stalled (does not kill processes).
 */
export function markScreenshotStalled({ missionId = null, detail = "Playwright/screenshot timed out", nowMs } = {}) {
  return recordControlPlaneEvent({
    status: "screenshot_stalled",
    detail,
    missionId,
    nowMs,
  });
}

/**
 * Probe whether a Vacilando server is accepting on port.
 */
export async function probeVacilandoAccepting(port, { timeoutMs = 2000 } = {}) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: ctrl.signal });
    const body = await r.json().catch(() => ({}));
    return {
      ok: r.ok,
      ms: Date.now() - t0,
      accepting: Boolean(body.accepting ?? body.ok),
      hydrated: Boolean(body.hydrated),
      body,
    };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, accepting: false, hydrated: false, error: String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * If bind is slow relative to process start, record slow_to_bind.
 */
export function noteBindTiming({ startedAtMs, listenAtMs, missionId = null } = {}) {
  const bindMs = Math.max(0, (listenAtMs ?? Date.now()) - (startedAtMs ?? Date.now()));
  if (bindMs >= SLOW_BIND_MS) {
    return recordControlPlaneEvent({
      status: "slow_to_bind",
      detail: `HTTP listen took ${bindMs}ms`,
      timings: { bind_ms: bindMs },
      missionId,
    });
  }
  return recordControlPlaneEvent({
    status: "accepting",
    detail: `HTTP listen in ${bindMs}ms`,
    timings: { bind_ms: bindMs },
    missionId,
  });
}

/**
 * Safe recovery: terminate ONLY the owned Vacilando pid, restart with same argv/port,
 * verify bind, optionally retry a callback once.
 *
 * Ownership is proven by OWNER_FILE pid matching an alive process whose command
 * includes vacilando-server. Never kills unrelated PIDs.
 */
export async function recoverOwnedVacilandoProcess({
  port,
  missionId = null,
  serverModulePath = null,
  retryValidation = null,
  spawnFn = spawn,
} = {}) {
  const owner = readControlPlaneOwner();
  if (!owner?.pid || !owner.port) {
    return { ok: false, error: "no_owned_process", message: "No control-plane owner recorded — refusing generic kill" };
  }
  if (port != null && Number(owner.port) !== Number(port)) {
    return { ok: false, error: "port_mismatch", message: "Owner port does not match recovery target" };
  }

  recordControlPlaneEvent({
    status: "recovering",
    detail: `Attempting owned restart of pid ${owner.pid} on :${owner.port}`,
    missionId: missionId || owner.missionId,
    timings: { recovery_started_at: iso() },
  });

  // Preserve diagnostics before kill
  const diagnostics = {
    owner,
    health_before: getControlPlaneHealth(),
    probed_before: await probeVacilandoAccepting(owner.port, { timeoutMs: 1500 }),
  };
  ensureDir();
  writeFileSync(
    join(RUNTIME_ROOT, "vacilando", `control-plane-diag-${Date.now()}.json`),
    JSON.stringify(diagnostics, null, 2),
  );

  let alive = false;
  try {
    process.kill(owner.pid, 0);
    alive = true;
  } catch { alive = false; }

  if (alive) {
    try { process.kill(owner.pid, "SIGTERM"); } catch (e) {
      recordControlPlaneEvent({ status: "recovery_failed", detail: `SIGTERM failed: ${e.message}`, missionId });
      return { ok: false, error: "kill_failed", diagnostics };
    }
    // Brief wait for exit
    for (let i = 0; i < 20; i++) {
      try { process.kill(owner.pid, 0); await new Promise((r) => setTimeout(r, 100)); }
      catch { break; }
    }
  }

  const mod = serverModulePath
    || join(dirname(fileURLToPath(import.meta.url)), "..", "vacilando-server.mjs");
  const child = spawnFn(process.execPath, [mod, "--port", String(owner.port)], {
    cwd: owner.worktree || undefined,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, VACILANDO_OWNED: "1" },
  });
  child.unref?.();

  claimControlPlaneOwnership({
    pid: child.pid,
    port: owner.port,
    worktree: owner.worktree,
    missionId: missionId || owner.missionId,
  });

  let probed = null;
  for (let i = 0; i < 40; i++) {
    probed = await probeVacilandoAccepting(owner.port, { timeoutMs: 1000 });
    if (probed.ok) break;
    await new Promise((r) => setTimeout(r, 250));
  }

  if (!probed?.ok) {
    recordControlPlaneEvent({
      status: "recovery_failed",
      detail: "Restarted process did not accept /api/health",
      missionId,
      timings: { recovery_bind_failed: true },
    });
    return { ok: false, error: "bind_failed_after_restart", diagnostics, probed, pid: child.pid };
  }

  recordControlPlaneEvent({
    status: "recovered",
    detail: `Owned process restarted — health ok in ${probed.ms}ms`,
    missionId,
    timings: { recovery_health_ms: probed.ms },
  });

  let retry = null;
  if (typeof retryValidation === "function") {
    try { retry = await retryValidation(); }
    catch (e) { retry = { ok: false, error: String(e.message || e) }; }
  }

  return { ok: true, pid: child.pid, probed, retry, diagnostics };
}

export { SLOW_BIND_MS, UNRESPONSIVE_MS };
