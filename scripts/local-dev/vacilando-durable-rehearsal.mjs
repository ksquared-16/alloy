#!/usr/bin/env node
/**
 * Non-destructive Mac mini migration rehearsal on this host.
 *
 * Backs up the live Gateway durable store (read-only copy) and restores into
 * an isolated root. Never writes the live Gateway, Git, or worktrees unless
 * --ensure-live-lane is passed (Workstream G only).
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

process.env.VACILANDO_SKIP_NODE_PROBE = process.env.VACILANDO_SKIP_NODE_PROBE || "1";

const liveRoot = process.env.VACILANDO_GATEWAY_ROOT?.trim()
  || join(homedir(), ".local", "state", "alloy-dev", "gateway");
const ensureLive = process.argv.includes("--ensure-live-lane");
const outPath = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : null;

const { backupDurableState, restoreDurableState, laneIdentitySnapshot, verifyBackup } = await import("./lib/vacilando/durable-state.mjs");
const { ensureVacilandoSpecialistLane, listDurableLanes } = await import("./lib/vacilando/development-lane.mjs");
const { listExecutionRunsForLane } = await import("./lib/vacilando/execution-run.mjs");

const evidence = {
  at: new Date().toISOString(),
  live_root: liveRoot,
  git_mutated: false,
  worktree_mutated: false,
  live_gateway_written: false,
  steps: {},
};

if (ensureLive) {
  const live = ensureVacilandoSpecialistLane({ root: liveRoot });
  evidence.live_gateway_written = true;
  evidence.steps.ensure_live_lane = {
    ok: live.ok,
    created: live.created,
    lane_id: live.lane?.lane_id || null,
    name: live.lane?.name || null,
    work_class: live.lane?.work_class || null,
    scarce_resource_priority: live.lane?.scarce_resource_priority ?? null,
  };
}

const before = laneIdentitySnapshot(liveRoot);
evidence.steps.live_lane_count = before.length;
evidence.steps.live_lane_ids = before.map((l) => l.lane_id);

const bakRoot = mkdtempSync(join(tmpdir(), "vac-rehearsal-bak-"));
const destRoot = mkdtempSync(join(tmpdir(), "vac-rehearsal-dest-"));
const bak = backupDurableState({ sourceRoot: liveRoot, backupRoot: bakRoot });
evidence.steps.backup = {
  ok: bak.ok,
  backup_id: bak.backup_id || null,
  path: bak.path || null,
  error: bak.error || null,
  files: bak.manifest?.files?.length || 0,
};
if (!bak.ok) {
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  process.exit(1);
}
evidence.steps.verify = verifyBackup(bak.path);

const restored = restoreDurableState({ backupPath: bak.path, destRoot });
evidence.steps.restore = restored;
evidence.steps.restored_lanes = laneIdentitySnapshot(destRoot);
evidence.steps.historical_runs = {};
for (const lane of listDurableLanes(destRoot)) {
  evidence.steps.historical_runs[lane.lane_id] = listExecutionRunsForLane(lane.lane_id, destRoot).map((r) => ({
    run_id: r.run_id,
    state: r.state,
    lane_id: r.lane_id,
  }));
}
evidence.steps.bindings_stale = listDurableLanes(destRoot).every((l) => !l.binding || l.binding.stale === true || l.binding.status === "stale" || l.binding.status === "unbound" || !l.binding.tmux_session);
evidence.steps.arrival_day_uncertified = [
  "physical Mac mini hardware and disk layout",
  "Tailscale HTTPS Serve on the mini",
  "Claude Code login on the mini",
  "empirical provider/CPU/RAM capacity vs this MacBook",
  "launchd KeepAlive under the mini's logged-in user",
  "Docker/alloy-stack lease behavior on the mini",
];

if (outPath) writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
if (!bak.ok || !restored.ok) process.exit(1);
