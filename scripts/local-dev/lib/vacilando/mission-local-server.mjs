/**
 * Mission-scoped Alloy Next app server (operator QA only).
 *
 * Claude/Cursor coding does NOT require this process. Missions provision with
 * --without-server. The operator starts at most one slot server when they need
 * to click through the product.
 */
import { execFileSync } from "node:child_process";
import { getMission } from "./commands/missions.mjs";
import { resolveSlotIdentity } from "./identity.mjs";
import { listWorkerTelemetry } from "./worker-health.mjs";

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

/**
 * Operator-facing local Alloy app status for a mission.
 */
export function missionLocalServerVm(missionId) {
  const slot = resolveMissionSlot(missionId);
  if (slot == null) {
    return {
      kind: "mission_local_server",
      available: false,
      reason: "no_slot",
      title: "Local Alloy app",
      detail:
        "This mission is not bound to a worker slot yet, so there is no Alloy Next app to start. Workers can still code without a local app server.",
      workersNeedServer: false,
      note: "Claude and Cursor do not need the Alloy app server up to edit code, run tests, or commit.",
    };
  }

  const identity = resolveSlotIdentity(slot);
  const port = Number(identity.port) || (3010 + slot);
  const running = portListening(port);
  const url = `http://127.0.0.1:${port}`;
  const worktree = identity.worktree_name || null;
  const conflict = identity.conflict || null;

  return {
    kind: "mission_local_server",
    available: Boolean(identity.ok && worktree && !conflict),
    reason: conflict?.kind || (!worktree ? "no_worktree" : null),
    title: "Local Alloy app (for your QA)",
    detail: running
      ? `Alloy Next is listening on :${port} for slot ${slot}${worktree ? ` · ${worktree}` : ""}.`
      : `Alloy Next is stopped for slot ${slot}${worktree ? ` · ${worktree}` : ""}. Start it only when you need to click through the product.`,
    workersNeedServer: false,
    note: "Claude and Cursor code against the worktree without this server. Prefer one running Alloy app at a time (capacity ~3).",
    slot,
    port,
    url,
    worktree,
    worktreePath: identity.worktree_path || null,
    branch: identity.branch || null,
    status: running ? "running" : "stopped",
    statusLabel: running ? "Running" : "Stopped",
    conflictDetail: conflict?.detail || null,
    actions: {
      start: !running && identity.ok && worktree && !conflict
        ? { kind: "server_start", label: "Start local server", slot, port }
        : null,
      stop: running
        ? { kind: "server_stop", label: "Stop local server", slot, port }
        : null,
      open: running
        ? { kind: "open_url", label: "Open app", href: url, port }
        : null,
    },
  };
}
