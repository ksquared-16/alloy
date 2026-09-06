#!/usr/bin/env node
/**
 * `vac scoreboard` — the one view a Director reads on returning to the machine.
 *
 * WHAT IT REPLACES. "Which terminal do I need to inspect?" Every number here
 * already existed, in six different stores, behind six different calls. Nothing
 * is computed twice: this composes the canonical owners and says where each
 * answer came from.
 *
 * ABSENT TRUTH IS UNKNOWN, NEVER HEALTHY. Phases 5 and 6 shipped a scheduling
 * row whose `seats_available` was null because capacity was passed in rather
 * than probed, and whose authorization revalidation received no dependency or
 * finding maps. Both defaulted to unmeasured — correct, and useless. This
 * supplies live truth, and where it genuinely cannot, the field reads `unknown`
 * rather than borrowing a comfortable default.
 */
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import "./lib/vacilando/bind-worker-cli-gateway-root.mjs";

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const unknown = argv.filter((a) => a.startsWith("--") && a !== "--json");
if (unknown.length) {
  process.stderr.write(`vac scoreboard: unknown option ${unknown[0]}\nUsage: vac scoreboard [--json]\n`);
  process.exit(2);
}
const root = process.env.ALLOY_RUNTIME_ROOT || join(homedir(), ".local", "state", "alloy-dev", "gateway");

function safe(fn, fallback = null) { try { return fn(); } catch { return fallback; } }
function sh(cmd, args, opts = {}) {
  try { return execFileSync(cmd, args, { encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "ignore"], ...opts }).trim(); }
  catch { return null; }
}

const { stewardStatus } = await import("./lib/vacilando/host-steward-cycle.mjs");
const { listDurableLanes } = await import("./lib/vacilando/development-lane.mjs");
const { activeRunForLane } = await import("./lib/vacilando/execution-run.mjs");
const { getLaneMemory, checkpointFreshness } = await import("./lib/vacilando/lane-memory.mjs");
const { authorizedNextStep } = await import("./lib/vacilando/authorized-next-step.mjs");
const { summarizeFindings, listFindings } = await import("./lib/vacilando/operational-findings.mjs");
const { allLaneAttentionViews, attentionRollup } = await import("./lib/vacilando/lane-attention-view.mjs");
const { observeScheduling } = await import("./lib/vacilando/work-scheduler-observe.mjs");

// ── Live truth, probed rather than assumed ──────────────────────────────────
const stagingSha = safe(() => sh("git", ["rev-parse", "origin/staging"], { cwd: join(homedir(), "Alloy") }));
const runningToolkit = safe(() => {
  const ps = sh("ps", ["-Ao", "args="]) || "";
  const line = ps.split("\n").find((l) => l.includes("vacilando-server.mjs") && !l.includes("grep"));
  const m = line && line.match(/toolkit\/([^/]+)\//);
  return m ? m[1] : null;
});
const installedToolkit = safe(() => {
  const link = sh("readlink", [join(homedir(), ".local", "share", "alloy", "toolkit", "current")]);
  return link ? link.split("/").filter(Boolean).pop() : null;
});
const health = safe(() => sh("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "8", "http://127.0.0.1:3030/api/health"]));

// Findings, and the map the authorization revalidation needs.
const findings = safe(() => listFindings(root), []) || [];
const findingStatuses = Object.fromEntries(findings.map((f) => [f.id, f.status]));
const liveTruth = { staging_sha: stagingSha ?? undefined, dependency_states: {}, finding_statuses: findingStatuses };

const steward = safe(() => stewardStatus({ root }), null);
const scheduling = safe(() => observeScheduling({ root, liveTruth }), null);
const lanes = safe(() => listDurableLanes(root), []) || [];

const laneRows = lanes.map((l) => {
  const run = safe(() => activeRunForLane(l.lane_id, root), null);
  const memory = safe(() => getLaneMemory(l.lane_id, root), null);
  const contract = authorizedNextStep({
    record: memory,
    live: { lane_id: l.lane_id, run_state: run?.state ?? null, ...liveTruth },
  });
  return {
    lane_id: l.lane_id,
    name: l.name ?? null,
    run_state: run?.state ?? null,
    mission: memory ? (memory.mission?.complete === true ? "complete" : "active") : "none",
    checkpoint: memory ? (checkpointFreshness(memory).fresh ? "fresh" : "stale") : "none",
    next_action: contract.action_class ?? null,
    authorization: contract.authorization,
    dependency: contract.dependency_state,
  };
});

const views = safe(() => allLaneAttentionViews({
  lanes: laneRows.map((r) => ({ lane_id: r.lane_id, run_state: r.run_state })), root,
}), []) || [];

const board = {
  schema_version: "vacilando.operating_scoreboard.v1",
  observed_at: new Date().toISOString(),
  runtime: {
    staging: stagingSha,
    installed: installedToolkit,
    running: runningToolkit,
    converged: Boolean(stagingSha && installedToolkit && runningToolkit
      && String(stagingSha).startsWith(installedToolkit) && installedToolkit === runningToolkit),
    health: health === "200" ? "healthy" : (health ? `http ${health}` : "unknown"),
  },
  control_plane: steward?.control_plane_recovery ?? { unavailable: true },
  lanes: {
    total: laneRows.length,
    executing: laneRows.filter((r) => ["EXECUTING", "VALIDATING", "RECOVERING"].includes(String(r.run_state))).length,
    authorized: laneRows.filter((r) => r.authorization === "AUTHORIZED").length,
    requires_director: laneRows.filter((r) => r.authorization === "REQUIRES_DIRECTOR").length,
    mission_complete: laneRows.filter((r) => r.mission === "complete").length,
    unknown: laneRows.filter((r) => r.authorization === "UNKNOWN").length,
    without_memory: laneRows.filter((r) => r.mission === "none").length,
    stale_checkpoints: laneRows.filter((r) => r.checkpoint === "stale").length,
    rows: laneRows,
  },
  scheduling: scheduling ? {
    eligible: scheduling.eligible,
    scheduled_next: scheduling.scheduled_next,
    by_wait_reason: scheduling.by_wait_reason,
    dispatch_enabled: scheduling.dispatch_enabled,
    idle_capacity_explained: scheduling.idle_capacity_explained,
  } : { unavailable: true },
  hygiene: steward?.hygiene ?? { unavailable: true },
  findings: safe(() => summarizeFindings(root), { unavailable: true }),
  attention: attentionRollup(views),
  director: {
    obligations: laneRows.filter((r) => r.authorization === "REQUIRES_DIRECTOR").map((r) => r.lane_id),
    unread_lanes: views.filter((v) => v.has_unread_output).map((v) => v.lane_id),
  },
};

if (json) { process.stdout.write(`${JSON.stringify(board, null, 2)}\n`); process.exit(0); }

const r = board.runtime;
process.stdout.write(`Vacilando  ${board.observed_at}\n\n`);
process.stdout.write(`  runtime       ${r.health} · staging ${short(r.staging)} · installed ${r.installed ?? "?"} · running ${r.running ?? "?"}${r.converged ? " · converged" : " · NOT converged"}\n`);
const cp = board.control_plane;
process.stdout.write(`  control plane ${cp?.episode_active ? `episode ${cp.failure_class} level ${cp.recovery_level}` : "no episode"}${cp?.director_action_required ? " · DIRECTOR REQUIRED" : ""}\n`);
const L = board.lanes;
process.stdout.write(`  lanes         ${L.total} · executing ${L.executing} · authorized ${L.authorized} · needs Director ${L.requires_director} · complete ${L.mission_complete} · unknown ${L.unknown} (${L.without_memory} with no memory)\n`);
const S = board.scheduling;
process.stdout.write(`  scheduling    eligible ${S.eligible ?? "?"} · next ${S.scheduled_next ?? "—"} · dispatch ${S.dispatch_enabled ? "enabled" : "disabled"}\n`);
if (S.idle_capacity_explained) process.stdout.write(`                idle: ${S.idle_capacity_explained.reason} — ${S.idle_capacity_explained.detail}\n`);
const H = board.hygiene;
process.stdout.write(`  hygiene       last ${H?.last_cycle?.ended_at ?? "never"}${H?.last_cycle ? ` · reclaimed ${H.last_cycle.reclaimed.length}` : ""}\n`);
const F = board.findings;
process.stdout.write(`  findings      ${JSON.stringify(F?.counts ?? F)}\n`);
process.stdout.write(`  attention     unread ${board.attention.with_unread_output} · requiring you ${board.attention.requiring_director}\n\n`);
for (const row of L.rows) {
  process.stdout.write(`  ${String(row.name ?? row.lane_id).padEnd(22)} ${String(row.run_state ?? "ready").padEnd(11)} ${row.mission.padEnd(9)} ${row.authorization.padEnd(18)} ${row.next_action ?? "—"}\n`);
}
process.stdout.write(`\n  ${board.director.obligations.length ? `Director: ${board.director.obligations.join(", ")}` : "Director: nothing required"}\n`);

function short(s) { return s ? String(s).slice(0, 12) : "?"; }
