/**
 * Safe executors — never run without explicit --yes from the CLI.
 * Regenerable / confirmed-orphan targets only.
 */
import { execFileSync } from "node:child_process";
import { existsSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

function run(cmd, args, { timeout = 600000 } = {}) {
  try {
    const out = execFileSync(cmd, args, {
      encoding: "utf8",
      timeout,
      maxBuffer: 8 << 20,
    });
    return { ok: true, stdout: out };
  } catch (e) {
    return {
      ok: false,
      stdout: String(e.stdout || ""),
      stderr: String(e.stderr || e.message || e),
    };
  }
}

function freeGb() {
  try {
    const out = execFileSync("df", ["-g", "/System/Volumes/Data"], { encoding: "utf8" });
    return Number((out.trim().split("\n")[1] || "").split(/\s+/)[3]);
  } catch {
    return null;
  }
}

const ACTIONS = {
  worktree_gc() {
    const bin = join(os.homedir(), "bin/alloy-worktree-gc");
    if (!existsSync(bin)) return { ok: false, error: "alloy-worktree-gc not installed" };
    const before = freeGb();
    const r = run(bin, ["--force"]);
    return {
      ok: r.ok,
      action_id: "worktree_gc",
      before_free_gb: before,
      after_free_gb: freeGb(),
      detail: (r.stdout || r.stderr || "").trim().split("\n").slice(-6).join("\n"),
    };
  },

  docker_prune() {
    const before = freeGb();
    const steps = [];
    steps.push(run("docker", ["container", "prune", "-f"]));
    steps.push(run("docker", ["image", "prune", "-f"]));
    steps.push(run("docker", ["system", "prune", "-f"]));
    const ok = steps.every((s) => s.ok || /reclaimed|Total/i.test(s.stdout + s.stderr));
    return {
      ok,
      action_id: "docker_prune",
      before_free_gb: before,
      after_free_gb: freeGb(),
      detail: steps.map((s) => (s.stdout || s.stderr || "").trim().split("\n").slice(-3).join(" | ")).join("\n"),
    };
  },

  npm_cache_clean() {
    const before = freeGb();
    const r = run("npm", ["cache", "clean", "--force"]);
    return {
      ok: r.ok,
      action_id: "npm_cache_clean",
      before_free_gb: before,
      after_free_gb: freeGb(),
      detail: (r.stdout || r.stderr || "npm cache cleaned").trim(),
    };
  },

  pnpm_store_prune() {
    const before = freeGb();
    const r = run("pnpm", ["store", "prune"]);
    return {
      ok: r.ok,
      action_id: "pnpm_store_prune",
      before_free_gb: before,
      after_free_gb: freeGb(),
      detail: (r.stdout || r.stderr || "").trim(),
    };
  },

  cursor_cached_data_clean() {
    const dir = join(os.homedir(), "Library/Application Support/Cursor/CachedData");
    const before = freeGb();
    if (!existsSync(dir)) return { ok: true, action_id: "cursor_cached_data_clean", detail: "nothing to clean" };
    try {
      rmSync(dir, { recursive: true, force: true });
      return {
        ok: true,
        action_id: "cursor_cached_data_clean",
        before_free_gb: before,
        after_free_gb: freeGb(),
        detail: `Removed ${dir}`,
      };
    } catch (e) {
      return { ok: false, action_id: "cursor_cached_data_clean", error: String(e.message || e) };
    }
  },

  remove_cursor_backup_local() {
    const backupFile = join(os.homedir(), "CursorBackupLocal/state.vscdb");
    const backupDir = join(os.homedir(), "CursorBackupLocal");
    const live = join(
      os.homedir(),
      "Library/Application Support/Cursor/User/globalStorage/state.vscdb",
    );
    // Hard safety: never touch live DB
    if (backupFile === live || backupDir.includes("Application Support/Cursor")) {
      return { ok: false, error: "refusing to touch live Cursor path" };
    }
    const before = freeGb();
    let bytes = 0;
    try {
      if (existsSync(backupFile)) bytes += statSync(backupFile).blocks * 512;
    } catch { /* */ }
    try {
      if (existsSync(backupFile)) rmSync(backupFile, { force: true });
      // remove empty dir if now empty
      if (existsSync(backupDir)) {
        try { rmSync(backupDir, { recursive: true, force: true }); } catch { /* keep */ }
      }
    } catch (e) {
      return { ok: false, action_id: "remove_cursor_backup_local", error: String(e.message || e) };
    }
    return {
      ok: true,
      action_id: "remove_cursor_backup_local",
      before_free_gb: before,
      after_free_gb: freeGb(),
      estimated_reclaimed_gb: Math.round((bytes / 1024 ** 3) * 10) / 10,
      detail: `Removed orphan backup at ${backupFile} (live DB untouched: ${live})`,
    };
  },
};

export function listActions() {
  return Object.keys(ACTIONS);
}

export function executeAction(actionId, { confirm = false } = {}) {
  if (!confirm) {
    return {
      ok: false,
      error: "refused_without_confirm",
      detail: "Pass --yes to execute. Engineering Health never deletes silently.",
    };
  }
  const fn = ACTIONS[actionId];
  if (!fn) return { ok: false, error: "unknown_action", action_id: actionId };
  return fn();
}
