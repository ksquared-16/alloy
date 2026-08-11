/**
 * Slot missions rail — every managed slot (1–6) appears in Vacilando whether the
 * work started via Claude, Cursor, or the Vacilando app. Free slots show as free;
 * occupied slots show sprint name + provider + controls.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { TOOLKIT_DIR } from "../sources.mjs";
import { getMission, readMissions } from "../commands/missions.mjs";
import { getBrief } from "../mission-brief.mjs";
import { resolveSlotIdentity } from "../identity.mjs";
import { displayMissionTitle } from "./mission-conversation.mjs";
import { isFixtureMission } from "./mission-filters.mjs";
import { deriveMissionPosture } from "../mission-posture.mjs";
import { missionHealthVm } from "./mission-health.mjs";

const META_DIR = join(homedir(), ".local", "state", "alloy-dev", "metadata");
const WT_ROOT = join(homedir(), "Code", "alloy-worktrees");

function healthBits(missionId) {
  if (!missionId || String(missionId).startsWith("slot_")) {
    return { needsYou: false, phase: null, healthLabel: null };
  }
  try {
    const posture = deriveMissionPosture(missionId);
    const health = missionHealthVm(missionId, { posture });
    const healthLabel = health
      ? `${health.lifecycleLabel}${health.waitingOnYou && health.decision?.title ? ` · ${health.decision.title}` : (health.register?.complete ? " · current work complete" : "")}`
      : (posture?.label || null);
    return {
      needsYou: Boolean(health?.waitingOnYou || (posture?.needsYou && posture?.id === "decision_required")),
      phase: healthLabel || posture?.label || null,
      healthLabel,
    };
  } catch {
    return { needsYou: false, phase: null, healthLabel: null };
  }
}

function parseEnvFile(path) {
  if (!existsSync(path)) return null;
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)="(.*)"\s*$/);
    if (m) out[m[1]] = m[2].replace(/\\n/g, "\n").replace(/\\"/g, '"');
  }
  return out;
}

function listActiveSlotMetadata() {
  const bySlot = new Map();
  if (!existsSync(META_DIR)) return bySlot;
  for (const f of readdirSync(META_DIR)) {
    if (!f.endsWith(".env") || !/^wt[1-6]-/.test(f)) continue;
    const meta = parseEnvFile(join(META_DIR, f));
    if (!meta) continue;
    const slot = Number(meta.ALLOY_WORKTREE_SLOT || f.match(/^wt([1-6])-/)?.[1]);
    if (!slot || slot < 1 || slot > 6) continue;
    bySlot.set(slot, {
      slot,
      worktree: meta.ALLOY_WORKTREE_NAME || f.replace(/\.env$/, ""),
      path: meta.ALLOY_WORKTREE_PATH || join(WT_ROOT, f.replace(/\.env$/, "")),
      branch: meta.ALLOY_WORKTREE_BRANCH || null,
      provider: meta.ALLOY_AGENT || null,
      sprintName: meta.ALLOY_SPRINT_NAME || null,
      objective: meta.ALLOY_SPRINT_OBJECTIVE || null,
      lifecycle: meta.ALLOY_WORKER_LIFECYCLE || "active",
      port: Number(meta.ALLOY_WORKTREE_PORT) || 3010 + slot,
    });
  }
  return bySlot;
}

function missionForSlot(slot) {
  const rows = readMissions(null, 80) || [];
  for (const m of rows) {
    if (m?.archived) continue;
    const s = Number(m.worker_slot ?? m.slot);
    if (s !== slot) continue;
    const id = m.mission_id || m.missionId;
    const title = displayMissionTitle(id, m.title);
    if (isFixtureMission(title, id) || isFixtureMission(m.title, id)) continue;
    return m;
  }
  return null;
}

/**
 * Left-rail items: always 6 slot rows (free or occupied), then any Vacilando
 * missions that are not already represented by a slot.
 */
export function slotMissionRailVm({ limit = 24 } = {}) {
  const slots = listActiveSlotMetadata();
  const items = [];
  const seenMissionIds = new Set();

  for (let slot = 1; slot <= 6; slot++) {
    const meta = slots.get(slot) || null;
    const identity = resolveSlotIdentity(slot);
    const mission = missionForSlot(slot);
    const missionId = mission?.mission_id || mission?.missionId || null;
    if (missionId) seenMissionIds.add(missionId);

    const sprintTitle =
      meta?.sprintName
      || (missionId ? displayMissionTitle(missionId, mission?.title) : null)
      || (meta ? meta.worktree.replace(/^wt\d+-/, "") : null)
      || `Slot ${slot}`;

    const occupied = Boolean(meta);
    const provider = meta?.provider || identity?.provider || mission?.provider || null;
    const serverRunning = identity?.server_state === "running" || identity?.server === "running";

    const hb = healthBits(missionId);
    items.push({
      kind: "slot_mission_nav_item",
      missionId: missionId || `slot_${slot}`,
      workspaceId: missionId || `slot_${slot}`,
      slot,
      title: occupied
        ? (missionId ? displayMissionTitle(missionId, mission?.title) || sprintTitle : sprintTitle)
        : `Slot ${slot} · free`,
      subtitle: occupied
        ? (hb.healthLabel || `${provider || "worker"} · slot ${slot}`)
        : "Free capacity",
      occupied,
      free: !occupied,
      provider,
      worktree: meta?.worktree || null,
      path: meta?.path || null,
      branch: meta?.branch || null,
      port: meta?.port || 3010 + slot,
      lifecycle: meta?.lifecycle || (occupied ? "active" : "free"),
      serverRunning: Boolean(serverRunning),
      needsYou: Boolean(hb.needsYou),
      needsCount: hb.needsYou ? 1 : 0,
      phase: hb.phase || (occupied ? (meta?.lifecycle || "active") : "free"),
      diagnosticActions: occupied
        ? [
            { key: "worker.pause", label: "Pause", command: "worker.pause", input: { slot } },
            { key: "worker.resume", label: "Resume", command: "worker.resume", input: { slot } },
            { key: "sprint.finish", label: "Finish", command: "sprint.finish", input: { slot } },
            serverRunning
              ? { key: "server.stop", label: "Stop server", command: "server.stop", input: { slot } }
              : { key: "server.start", label: "Start server", command: "server.start", input: { slot } },
          ]
        : [
            { key: "sprint.start", label: "Start sprint", command: "sprint.start", input: { slot, provider: "cursor" } },
          ],
      // Keep `actions` for back-compat with existing rail renderer; prefer diagnostics.
      actions: occupied
        ? [
            { key: "worker.pause", label: "Pause", command: "worker.pause", input: { slot } },
            { key: "worker.resume", label: "Resume", command: "worker.resume", input: { slot } },
            { key: "sprint.finish", label: "Finish", command: "sprint.finish", input: { slot } },
            serverRunning
              ? { key: "server.stop", label: "Stop server", command: "server.stop", input: { slot } }
              : { key: "server.start", label: "Start server", command: "server.start", input: { slot } },
          ]
        : [
            { key: "sprint.start", label: "Start sprint", command: "sprint.start", input: { slot, provider: "cursor" } },
          ],
    });
  }

  // Vacilando missions without a slot still appear (e.g. Identity parked).
  for (const m of readMissions(null, 40) || []) {
    if (items.length >= limit) break;
    const id = m.mission_id || m.missionId;
    if (!id || seenMissionIds.has(id) || m.archived) continue;
    const title = displayMissionTitle(id, m.title);
    if (isFixtureMission(title, id)) continue;
    if (!getBrief(id) && !m.title) continue;
    const slot = Number(m.worker_slot ?? m.slot) || null;
    const hb = healthBits(id);
    items.push({
      kind: "mission_nav_item",
      missionId: id,
      workspaceId: id,
      slot,
      title,
      subtitle: hb.healthLabel || "Mission",
      occupied: slot != null && slots.has(slot),
      free: false,
      provider: m.provider || null,
      needsYou: Boolean(hb.needsYou),
      needsCount: hb.needsYou ? 1 : 0,
      phase: hb.phase,
      actions: [],
    });
  }

  return {
    kind: "slot_mission_rail",
    label: "Missions",
    slotsOccupied: [...slots.keys()].length,
    slotsTotal: 6,
    missions: items.slice(0, limit),
  };
}

/** Best-effort sync helper used by tests — runs alloy-worker-status JSON if present. */
export function readWorkerStatusTable() {
  try {
    const out = execFileSync(join(TOOLKIT_DIR, "alloy-worker-status"), ["--json"], {
      encoding: "utf8",
      timeout: 20000,
      maxBuffer: 4 << 20,
    });
    return JSON.parse(out);
  } catch {
    return null;
  }
}
