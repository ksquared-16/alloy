/**
 * Cheap Mission Control presentation revision.
 * Fingerprints Vacilando runtime state dirs so the SPA can detect Director /
 * worker updates that happened outside the browser window.
 *
 * Names and mtimes only — never reads secret values.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import os from "node:os";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim()
  || join(os.homedir(), ".local", "state", "alloy-dev");

const WATCH_DIRS = [
  "vacilando/decisions",
  "vacilando/assignments",
  "vacilando/missions",
  "vacilando/timeline",
  "vacilando/evidence",
  "vacilando/execution-sessions",
  "vacilando/trusted-host-actions",
  "vacilando/trusted-host-authz",
  "vacilando/worker-health",
  "vacilando/dispatch",
  "vacilando/briefs",
];

function walkMtimes(dir, depth = 0, acc = []) {
  if (!existsSync(dir) || depth > 2) return acc;
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const ent of entries) {
    const p = join(dir, ent.name);
    try {
      const st = statSync(p);
      acc.push(`${ent.name}:${Math.floor(st.mtimeMs)}`);
      if (ent.isDirectory()) walkMtimes(p, depth + 1, acc);
    } catch { /* race */ }
  }
  return acc;
}

/**
 * @returns {{ revision: string, generated_at: string, roots: number }}
 */
export function computePresentationRevision() {
  const parts = [];
  for (const rel of WATCH_DIRS) {
    const abs = join(RUNTIME_ROOT, rel);
    parts.push(rel);
    if (!existsSync(abs)) {
      parts.push("missing");
      continue;
    }
    try {
      const st = statSync(abs);
      parts.push(`dir:${Math.floor(st.mtimeMs)}`);
    } catch {
      parts.push("err");
    }
    parts.push(...walkMtimes(abs, 0, []).sort());
  }
  const revision = createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 20);
  return {
    revision,
    generated_at: new Date().toISOString(),
    roots: WATCH_DIRS.length,
  };
}
