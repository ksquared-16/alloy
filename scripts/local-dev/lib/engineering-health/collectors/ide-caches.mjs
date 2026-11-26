/**
 * IDE / AI tool caches — Cursor, Claude, VS Code.
 * Includes orphaned backup DBs (today's incident: CursorBackupLocal).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

function dirBytes(path, { timeoutMs = 15000 } = {}) {
  if (!path || !existsSync(path)) return 0;
  try {
    const out = execFileSync("du", ["-sk", path], {
      encoding: "utf8",
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return Number(out.trim().split(/\s+/)[0] || 0) * 1024;
  } catch {
    return 0;
  }
}

function fileInfo(path) {
  if (!existsSync(path)) return null;
  try {
    const st = statSync(path);
    return {
      path,
      bytes: st.isDirectory() ? dirBytes(path) : st.blocks * 512,
      logical_bytes: st.size,
      mtime: st.mtime.toISOString(),
      is_directory: st.isDirectory(),
    };
  } catch {
    return null;
  }
}

export function collectIdeCaches() {
  const home = os.homedir();
  const cursorApp = join(home, "Library/Application Support/Cursor");
  const cursorDot = join(home, ".cursor");
  const cursorBackup = join(home, "CursorBackupLocal");
  const cursorStateLive = join(cursorApp, "User/globalStorage/state.vscdb");
  const cursorStateBackup = join(cursorBackup, "state.vscdb");
  const claudeApp = join(home, "Library/Application Support/Claude");
  const claudeCli = join(home, "Library/Caches/claude-cli-nodejs");
  const vscodeApp = join(home, "Library/Application Support/Code");

  const orphans = [];
  const backup = fileInfo(cursorStateBackup) || (existsSync(cursorBackup) ? {
    path: cursorBackup,
    bytes: dirBytes(cursorBackup),
    mtime: null,
    is_directory: true,
  } : null);
  if (backup && backup.bytes > 100 * 1024 ** 2) {
    orphans.push({
      kind: "cursor_backup_local",
      ...backup,
      reason: "Orphaned Cursor backup database/directory — not the live Application Support DB.",
    });
  }

  // Other *Backup* state.vscdb under home (shallow)
  try {
    for (const name of readdirSync(home)) {
      if (!/backup|Backup/i.test(name)) continue;
      const p = join(home, name, "state.vscdb");
      if (!existsSync(p) || p === cursorStateBackup) continue;
      const info = fileInfo(p);
      if (info && info.bytes > 100 * 1024 ** 2) {
        orphans.push({
          kind: "ide_backup_state_vscdb",
          ...info,
          reason: `Large IDE backup DB under ~/${name}`,
        });
      }
    }
  } catch { /* ignore */ }

  const cursorBytes = dirBytes(cursorApp) + dirBytes(cursorDot);
  const claudeBytes = dirBytes(claudeApp) + dirBytes(claudeCli);
  const vscodeBytes = dirBytes(vscodeApp);
  const liveState = fileInfo(cursorStateLive);

  return {
    ok: true,
    collector: "ide_caches",
    cursor: {
      app_support_bytes: dirBytes(cursorApp),
      dot_cursor_bytes: dirBytes(cursorDot),
      cached_data_bytes: dirBytes(join(cursorApp, "CachedData")),
      total_bytes: cursorBytes,
      total_gb: Math.round((cursorBytes / 1024 ** 3) * 10) / 10,
      live_state_vscdb: liveState,
    },
    claude: {
      app_support_bytes: dirBytes(claudeApp),
      cli_cache_bytes: dirBytes(claudeCli),
      vm_bundle_bytes: dirBytes(join(claudeApp, "vm_bundles")),
      total_bytes: claudeBytes,
      total_gb: Math.round((claudeBytes / 1024 ** 3) * 10) / 10,
    },
    vscode: {
      app_support_bytes: vscodeBytes,
      total_gb: Math.round((vscodeBytes / 1024 ** 3) * 10) / 10,
    },
    orphans,
  };
}
