/**
 * Large-file collector — Spotlight (mdfind) for multi-GB files that hide in backups.
 */
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import os from "node:os";

const MIN_BYTES = 2 * 1024 ** 3; // 2 GB

export function collectLargeFiles({ minBytes = MIN_BYTES } = {}) {
  const home = os.homedir();
  let paths = [];
  try {
    const out = execFileSync(
      "mdfind",
      [`kMDItemFSSize > ${minBytes}`, "-onlyin", home],
      { encoding: "utf8", timeout: 20000 },
    );
    paths = out.trim().split("\n").filter(Boolean);
  } catch {
    paths = [];
  }

  const files = [];
  for (const p of paths.slice(0, 40)) {
    if (!existsSync(p)) continue;
    try {
      const st = statSync(p);
      const allocated = st.blocks * 512;
      // Skip Docker.raw logical trap — report allocated separately in docker collector
      if (/Docker\.raw$/i.test(p) && st.size > 100 * 1024 ** 3) {
        files.push({
          path: p,
          logical_bytes: st.size,
          allocated_bytes: allocated,
          note: "sparse_docker_raw",
        });
        continue;
      }
      files.push({
        path: p,
        logical_bytes: st.size,
        allocated_bytes: allocated,
        gb: Math.round((allocated / 1024 ** 3) * 10) / 10,
      });
    } catch { /* skip */ }
  }
  files.sort((a, b) => (b.allocated_bytes || 0) - (a.allocated_bytes || 0));

  return {
    ok: true,
    collector: "large_files",
    min_bytes: minBytes,
    files: files.slice(0, 20),
  };
}
