/**
 * Git / worktree pressure — sizes, orphaned worktrees via alloy-worktree-gc dry-run.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

function dirBytes(path, { timeoutMs = 60000 } = {}) {
  if (!existsSync(path)) return 0;
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

function parseGc(text) {
  const s = String(text || "");
  const num = (re) => { const m = s.match(re); return m ? Number(m[1]) : null; };
  const mbMatch = s.match(/~\s*\d+\s*GB\s*\((\d+)\s*MB\)/i);
  const reclaim_mb = mbMatch
    ? Number(mbMatch[1])
    : (num(/~\s*(\d+)\s*GB/i) != null ? num(/~\s*(\d+)\s*GB/i) * 1024 : 0);
  return {
    reclaimable_worktrees: num(/worktrees reclaimed:\s*(\d+)/i) || 0,
    kept: num(/kept:\s*(\d+)/i) || 0,
    reclaimable_mb: reclaim_mb || 0,
    reclaimable_bytes: (reclaim_mb || 0) * 1024 * 1024,
    text_tail: s.trim().split("\n").slice(-8).join("\n"),
  };
}

export function collectGitRepos() {
  const home = os.homedir();
  const wtRoot = process.env.ALLOY_WORKTREE_ROOT || join(home, "Code/alloy-worktrees");
  const canonical = process.env.ALLOY_REPO || join(home, "Alloy");
  const retired = join(home, "Alloy-Claude");
  const gcBin = join(home, "bin/alloy-worktree-gc");

  let gc = null;
  if (existsSync(gcBin)) {
    try {
      const out = execFileSync(gcBin, [], {
        encoding: "utf8",
        timeout: 120000,
        maxBuffer: 4 << 20,
      });
      gc = parseGc(out);
    } catch (e) {
      gc = parseGc(String(e.stdout || "") + String(e.stderr || ""));
      gc.error = String(e.message || e).slice(0, 200);
    }
  }

  const wtBytes = dirBytes(wtRoot);
  const canonBytes = dirBytes(canonical, { timeoutMs: 30000 });
  return {
    ok: true,
    collector: "git_repos",
    worktree_root: wtRoot,
    worktree_root_bytes: wtBytes,
    worktree_root_gb: Math.round((wtBytes / 1024 ** 3) * 10) / 10,
    canonical_repo: canonical,
    canonical_bytes: canonBytes,
    retired_alloy_claude: existsSync(retired)
      ? { path: retired, bytes: dirBytes(retired, { timeoutMs: 30000 }) }
      : null,
    worktree_gc: gc,
  };
}
