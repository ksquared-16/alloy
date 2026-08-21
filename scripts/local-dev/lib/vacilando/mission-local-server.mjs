/**
 * Mission-scoped Alloy Next app server (operator QA only).
 *
 * Claude/Cursor coding does NOT require this process. Missions provision with
 * --without-server. The operator starts at most one slot server when they need
 * to click through the product.
 *
 * Resolution order for worktree/port:
 *   1. Toolkit slot registry (when healthy)
 *   2. Live / recent execution session cwd for this mission
 *   3. Runtime host worktree (Vacilando control-plane checkout)
 */
import { execFileSync, spawn } from "node:child_process";
import { basename } from "node:path";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getMission } from "./commands/missions.mjs";
import { resolveSlotIdentity, runtimeHost, invalidateIdentity } from "./identity.mjs";
import { listWorkerTelemetry } from "./worker-health.mjs";
import { listExecutionSessions } from "./execution-session.mjs";
import { resolveRuntimeConfig, worktreePathForName } from "./workspace-facts.mjs";

function portListening(port) {
  const p = Number(port);
  if (!Number.isFinite(p) || p <= 0) return false;
  try {
    execFileSync("lsof", ["-nP", `-iTCP:${p}`, "-sTCP:LISTEN"], {
      stdio: "ignore",
      timeout: 2500,
    });
    return true;
  } catch {
    return false;
  }
}

function metadataByWorktree(worktreeName) {
  const metaDir = resolveRuntimeConfig().metadata_dir;
  if (!worktreeName || !existsSync(metaDir)) return null;
  try {
    for (const f of readdirSync(metaDir).filter((x) => x.endsWith(".env"))) {
      const t = readFileSync(join(metaDir, f), "utf8");
      const g = (k) => (t.match(new RegExp(`^${k}="?([^"\\n]*)"?`, "m")) || [])[1] || null;
      if (g("ALLOY_WORKTREE_NAME") === worktreeName) {
        return {
          worktree_name: worktreeName,
          slot: Number(g("ALLOY_WORKTREE_SLOT")) || null,
          port: Number(g("PORT")) || null,
          branch: g("ALLOY_WORKTREE_BRANCH") || null,
          path: g("ALLOY_WORKTREE_PATH") || worktreePathForName(worktreeName),
        };
      }
    }
  } catch { /* */ }
  return null;
}

function resolveMissionSlot(missionId) {
  const mission = getMission(missionId);
  const fromMission = Number(mission?.worker_slot);
  if (Number.isFinite(fromMission) && fromMission >= 1 && fromMission <= 6) {
    return fromMission;
  }
  const tel = listWorkerTelemetry().find((w) => w.missionId === missionId && w.slot != null);
  const fromTel = Number(tel?.slot);
  if (Number.isFinite(fromTel) && fromTel >= 1 && fromTel <= 6) return fromTel;
  return null;
}

function resolveMissionWorktree(missionId) {
  const slot = resolveMissionSlot(missionId);
  if (slot != null) {
    const id = resolveSlotIdentity(slot);
    if (id?.worktree_name && existsSync(id.worktree_path || worktreePathForName(id.worktree_name))) {
      return {
        slot,
        worktree_name: id.worktree_name,
        worktree_path: id.worktree_path || worktreePathForName(id.worktree_name),
        port: Number(id.port) || (3010 + slot),
        branch: id.branch || null,
        source: "registry",
        conflict: id.conflict || null,
        ok: Boolean(id.ok),
      };
    }
  }

  // Prefer the newest session with a cwd on disk.
  let sessions = [];
  try {
    sessions = listExecutionSessions({ missionId, limit: 40 }) || [];
  } catch {
    sessions = [];
  }
  const withCwd = [...sessions]
    .filter((s) => s?.cwd && existsSync(s.cwd))
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  if (withCwd[0]) {
    const cwd = withCwd[0].cwd;
    const name = basename(cwd);
    const meta = metadataByWorktree(name);
    const resolvedSlot = slot ?? (Number.isFinite(Number(withCwd[0].slot)) ? Number(withCwd[0].slot) : meta?.slot);
    const port = meta?.port
      || (Number.isFinite(resolvedSlot) && resolvedSlot >= 1 && resolvedSlot <= 6 ? 3010 + resolvedSlot : null)
      || 3016;
    return {
      slot: resolvedSlot,
      worktree_name: name,
      worktree_path: cwd,
      port,
      branch: meta?.branch || null,
      source: "execution_session",
      conflict: null,
      ok: true,
    };
  }

  // Fall back to Vacilando host checkout (common for champion / slot-0 metadata).
  const host = runtimeHost();
  if (host?.worktree_name && existsSync(host.worktree_path)) {
    const meta = metadataByWorktree(host.worktree_name);
    const port = meta?.port || (slot != null ? 3010 + slot : 3016);
    return {
      slot: slot ?? meta?.slot ?? null,
      worktree_name: host.worktree_name,
      worktree_path: host.worktree_path,
      port,
      branch: host.branch || meta?.branch || null,
      source: "runtime_host",
      conflict: null,
      ok: true,
    };
  }

  return {
    slot,
    worktree_name: null,
    worktree_path: null,
    port: slot != null ? 3010 + slot : null,
    branch: null,
    source: null,
    conflict: { kind: "no_worktree", detail: "No worktree is bound to this mission yet." },
    ok: false,
  };
}

function whichBin(name) {
  try {
    return execFileSync("which", [name], { encoding: "utf8", timeout: 3000 }).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Operator-facing local Alloy app status for a mission.
 */
export function missionLocalServerVm(missionId) {
  const resolved = resolveMissionWorktree(missionId);
  if (!resolved.worktree_name) {
    return {
      kind: "mission_local_server",
      available: false,
      reason: resolved.conflict?.kind || "no_worktree",
      title: "Local Alloy app",
      detail: resolved.conflict?.detail
        || "This mission is not bound to a worktree yet, so there is no Alloy Next app to start.",
      workersNeedServer: false,
      note: "Claude and Cursor do not need the Alloy app server up to edit code, run tests, or commit.",
      actions: { start: null, stop: null, open: null },
    };
  }

  const port = Number(resolved.port) || 3016;
  const running = portListening(port);
  const url = `http://127.0.0.1:${port}`;
  const canStart = Boolean(resolved.ok && resolved.worktree_name && !running);
  const canStop = running;

  return {
    kind: "mission_local_server",
    available: true,
    reason: resolved.conflict?.kind || null,
    title: "Local Alloy app (for your QA)",
    detail: running
      ? `Alloy Next is listening on :${port}${resolved.worktree_name ? ` · ${resolved.worktree_name}` : ""}.`
      : `Alloy Next is stopped${resolved.worktree_name ? ` · ${resolved.worktree_name}` : ""}. Start it only when you need to click through the product.`,
    workersNeedServer: false,
    note: "Claude and Cursor code against the worktree without this server. Prefer one running Alloy app at a time (capacity ~3).",
    slot: resolved.slot,
    port,
    url,
    worktree: resolved.worktree_name,
    worktreePath: resolved.worktree_path,
    branch: resolved.branch,
    source: resolved.source,
    status: running ? "running" : "stopped",
    statusLabel: running ? "Running" : "Stopped",
    conflictDetail: resolved.conflict?.detail || null,
    actions: {
      start: canStart
        ? {
          kind: "server_start",
          label: "Start local server",
          missionId,
          slot: resolved.slot,
          port,
          worktree: resolved.worktree_name,
        }
        : null,
      stop: canStop
        ? {
          kind: "server_stop",
          label: "Stop local server",
          missionId,
          slot: resolved.slot,
          port,
          worktree: resolved.worktree_name,
        }
        : null,
      open: running
        ? { kind: "open_url", label: "Open app", href: url, port }
        : null,
    },
  };
}

/**
 * Start or stop the mission's Alloy Next app via toolkit CLIs.
 */
export function controlMissionLocalServer(missionId, action) {
  const act = String(action || "").toLowerCase();
  if (act !== "start" && act !== "stop") {
    return { ok: false, error: "invalid_action", detail: "action must be start or stop" };
  }
  const vm = missionLocalServerVm(missionId);
  const worktree = vm.worktree;
  if (!worktree) {
    return { ok: false, error: "no_worktree", detail: vm.detail || "No worktree for this mission" };
  }
  const bin = whichBin(act === "start" ? "alloy-dev-start" : "alloy-dev-stop");
  if (!bin) {
    return {
      ok: false,
      error: "cli_missing",
      detail: act === "start"
        ? "alloy-dev-start is not on PATH"
        : "alloy-dev-stop is not on PATH",
    };
  }
  if (act === "start" && vm.status === "running") {
    return { ok: true, already: true, ...vm, message: `Already running on :${vm.port}` };
  }
  if (act === "stop" && vm.status !== "running") {
    return { ok: true, already: true, ...vm, message: "Server was already stopped" };
  }

  try {
    if (act === "start") {
      // Detach — Next compile can take longer than a sync exec timeout.
      const child = spawn(bin, [worktree], {
        detached: true,
        stdio: "ignore",
        env: process.env,
      });
      child.unref();
    } else {
      execFileSync(bin, [worktree], {
        encoding: "utf8",
        timeout: 30_000,
        stdio: ["ignore", "pipe", "pipe"],
      });
    }
  } catch (e) {
    return {
      ok: false,
      error: "cli_failed",
      detail: String(e?.stderr || e?.stdout || e?.message || e).split("\n").slice(0, 6).join(" "),
    };
  }

  invalidateIdentity(vm.slot);
  const next = missionLocalServerVm(missionId);
  return {
    ok: true,
    action: act,
    worktree,
    message: act === "start"
      ? `Starting Alloy Next for ${worktree} on :${next.port}…`
      : `Stopped Alloy Next for ${worktree}`,
    localServer: next,
  };
}

export { resolveMissionWorktree, portListening };
