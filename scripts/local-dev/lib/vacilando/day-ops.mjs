/**
 * Start-of-day / stop-of-day operator controls.
 *
 * Stop of day → alloy-worker-pause --all
 * Start of day → alloy-worker-resume --all
 *
 * These mirror the toolkit overnight pause / morning resume workflow as
 * clickable Vacilando actions.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveRuntimeConfig } from "./workspace-facts.mjs";

function pauseDir() {
  return join(resolveRuntimeConfig().runtime_root, "pause-state");
}

function metaDir() {
  return resolveRuntimeConfig().metadata_dir;
}

function whichBin(name) {
  try {
    return execFileSync("which", [name], { encoding: "utf8", timeout: 3000 }).trim() || null;
  } catch {
    return null;
  }
}

function listPausedSlots() {
  const dir = pauseDir();
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json") || /^\d+$/.test(f) || f.startsWith("slot"))
      .map((f) => f.replace(/\.json$/, "").replace(/^slot-?/, ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function listActiveSlotsFromMetadata() {
  const dir = metaDir();
  if (!existsSync(dir)) return [];
  const out = [];
  try {
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".env"))) {
      const t = readFileSync(join(dir, f), "utf8");
      const g = (k) => (t.match(new RegExp(`^${k}="?([^"\\n]*)"?`, "m")) || [])[1] || null;
      const slot = Number(g("ALLOY_WORKTREE_SLOT"));
      const life = g("ALLOY_WORKER_LIFECYCLE") || "";
      if (Number.isFinite(slot) && slot >= 1 && slot <= 6 && life !== "finished") {
        out.push({
          slot,
          worktree: g("ALLOY_WORKTREE_NAME"),
          pausedAt: g("ALLOY_PAUSE_RECORDED_AT") || null,
        });
      }
    }
  } catch { /* */ }
  return out;
}

/**
 * Operator VM for Settings / day controls.
 */
export function dayOpsVm() {
  const paused = listPausedSlots();
  const slots = listActiveSlotsFromMetadata();
  const anyPaused = paused.length > 0 || slots.some((s) => s.pausedAt);
  return {
    kind: "day_ops",
    title: "Start / stop of day",
    detail: anyPaused
      ? "Workers are paused overnight (or from Stop of day). Start of day restores them."
      : "Stop of day safely pauses registered workers for the night. Start of day resumes them.",
    note: "Uses alloy-worker-pause --all / alloy-worker-resume --all. Worktrees and changes are preserved.",
    pausedSlots: paused,
    activeSlots: slots,
    status: anyPaused ? "paused" : "active",
    statusLabel: anyPaused ? "Day stopped (paused)" : "Day active",
    actions: {
      stopDay: { kind: "stop_day", label: "Stop of day", command: "alloy-worker-pause --all" },
      startDay: { kind: "start_day", label: "Start of day", command: "alloy-worker-resume --all" },
    },
  };
}

function runDayCli(binName, argv) {
  const bin = whichBin(binName);
  if (!bin) {
    return { ok: false, error: "cli_missing", detail: `${binName} is not on PATH` };
  }
  try {
    const stdout = execFileSync(bin, argv, {
      encoding: "utf8",
      timeout: 120_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, stdout: String(stdout || "").trim() };
  } catch (e) {
    const detail = String(e?.stderr || e?.stdout || e?.message || e).split("\n").slice(0, 8).join(" ");
    // Some pause/resume exits non-zero when already paused/resumed — still useful.
    if (/already|nothing to|no pause/i.test(detail)) {
      return { ok: true, already: true, detail, stdout: detail };
    }
    return { ok: false, error: "cli_failed", detail };
  }
}

export function stopOfDay() {
  const out = runDayCli("alloy-worker-pause", ["--all"]);
  return {
    ...out,
    action: "stop_day",
    message: out.ok ? "Stop of day complete — workers paused." : out.detail,
    dayOps: dayOpsVm(),
  };
}

export function startOfDay() {
  const out = runDayCli("alloy-worker-resume", ["--all"]);
  return {
    ...out,
    action: "start_day",
    message: out.ok ? "Start of day complete — workers resumed." : out.detail,
    dayOps: dayOpsVm(),
  };
}
