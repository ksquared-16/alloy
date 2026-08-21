/**
 * Vacilando Runtime — worker outputs (Slice 5).
 *
 * Projects only AUTHORITATIVE artifacts owned by a worker session: evidence
 * files (screenshots / summaries), recent commits, and a changed-file summary.
 * Nothing is invented. Screenshots are served (and rendered) by the server via
 * a path-validated /api/evidence endpoint; here we only enumerate them.
 */
import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import { extname, join } from "node:path";

import { worktreePathForName } from "./workspace-facts.mjs";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const EVIDENCE_ROOT = join(RUNTIME_ROOT, "evidence");
const IMG = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

function git(args, cwd) {
  return new Promise((res) => {
    execFile("git", args, { cwd, timeout: 6000, maxBuffer: 2 * 1024 * 1024 }, (err, out) => res(err ? "" : out));
  });
}

function evidenceArtifacts(worktree) {
  const dir = join(EVIDENCE_ROOT, worktree);
  if (!existsSync(dir)) return [];
  const out = [];
  const walk = (d, rel) => {
    let entries = [];
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(d, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { walk(full, r); continue; }
      let st; try { st = statSync(full); } catch { continue; }
      const ext = extname(e.name).toLowerCase();
      const isImage = IMG.has(ext);
      out.push({
        type: isImage ? "screenshot" : ext === ".json" ? "report" : ext === ".md" ? "summary" : "evidence",
        title: r,
        created_ms: st.mtimeMs,
        source: "evidence",
        size_kb: Math.round(st.size / 1024),
        is_image: isImage,
        evidence_file: r, // served via /api/evidence?worktree=&file=
        preview: isImage ? null : safeHead(full, ext),
      });
    }
  };
  walk(dir, "");
  return out;
}

function safeHead(full, ext) {
  try {
    const txt = readFileSync(full, "utf8");
    if (ext === ".json") { try { const o = JSON.parse(txt); return JSON.stringify(o).slice(0, 240); } catch { return txt.slice(0, 240); } }
    return txt.slice(0, 240);
  } catch { return null; }
}

/** Full outputs stream for one worker session, newest first. */
export async function workerOutputs(worktree) {
  const path = worktreePathForName(worktree);
  const items = evidenceArtifacts(worktree);

  // commits
  if (path && existsSync(path)) {
    const log = await git(["log", "-8", "--pretty=format:%H%x1f%h%x1f%an%x1f%cI%x1f%s"], path);
    for (const line of log.split("\n").filter(Boolean)) {
      const [, short, author, iso, subject] = line.split("\x1f");
      items.push({ type: "commit", title: subject, created_ms: iso ? Date.parse(iso) : null, source: "git log", author, short, preview: null });
    }
    // changed-file summary (uncommitted)
    const stat = await git(["--no-optional-locks", "status", "--porcelain"], path);
    const changed = stat.split("\n").filter(Boolean);
    if (changed.length) {
      items.push({
        type: "changed-files", title: `${changed.length} uncommitted change${changed.length > 1 ? "s" : ""}`,
        created_ms: Date.now(), source: "git status", preview: changed.slice(0, 12).map((l) => l.trim()).join("\n"),
      });
    }
  }

  items.sort((a, b) => (b.created_ms || 0) - (a.created_ms || 0));
  return { worktree, count: items.length, items };
}

/** Resolve a validated evidence file path (path-traversal safe) or null. */
export function evidenceFilePath(worktree, file) {
  if (!worktree || !file || /\.\./.test(worktree + file) || worktree.includes("/")) return null;
  const base = join(EVIDENCE_ROOT, worktree);
  const full = join(base, file);
  if (!full.startsWith(base + "/") || !existsSync(full) || !statSync(full).isFile()) return null;
  return full;
}
