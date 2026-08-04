/**
 * Cheap Mission Control presentation revision.
 * Fingerprints Vacilando runtime state dirs so the SPA can detect Director /
 * worker updates that happened outside the browser window.
 *
 * Heartbeat / telemetry dirs are excluded — worker-health and execution-sessions
 * rewrite every few seconds and must not force a full Mission Control repaint.
 * Assignment stores are content-fingerprinted with volatile timestamps stripped
 * so heartbeat `updated_at` writes do not thrash the revision either.
 *
 * Never reads secret values into logs; hashes only.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import os from "node:os";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim()
  || join(os.homedir(), ".local", "state", "alloy-dev");

/** Durable operator-visible state — not live worker telemetry. */
const WATCH_DIRS = [
  "vacilando/decisions",
  "vacilando/assignments",
  "vacilando/missions",
  "vacilando/timeline",
  "vacilando/evidence",
  "vacilando/trusted-host-actions",
  "vacilando/trusted-host-authz",
  "vacilando/dispatch",
  "vacilando/briefs",
  "vacilando/improvements",
];

/** Directories whose JSON is hashed with volatile fields stripped (mtime alone churns). */
const CONTENT_STABLE_DIRS = new Set([
  "vacilando/assignments",
]);

const VOLATILE_KEYS = new Set([
  "updated_at",
  "updatedAt",
  "lastHeartbeatAt",
  "lastProgressAt",
  "heartbeatAt",
  "lastSeen",
  "generated_at",
]);

function stripVolatile(value) {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (VOLATILE_KEYS.has(k)) continue;
      out[k] = stripVolatile(v);
    }
    return out;
  }
  return value;
}

function contentStablePart(filePath) {
  try {
    const raw = readFileSync(filePath, "utf8");
    try {
      const stable = JSON.stringify(stripVolatile(JSON.parse(raw)));
      return createHash("sha256").update(stable).digest("hex").slice(0, 16);
    } catch {
      return createHash("sha256").update(raw).digest("hex").slice(0, 16);
    }
  } catch {
    return "unreadable";
  }
}

function walkParts(dir, relDir, depth = 0, acc = []) {
  if (!existsSync(dir) || depth > 2) return acc;
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  const contentStable = CONTENT_STABLE_DIRS.has(relDir);
  for (const ent of entries) {
    const p = join(dir, ent.name);
    try {
      const st = statSync(p);
      if (ent.isDirectory()) {
        acc.push(`${ent.name}:dir:${Math.floor(st.mtimeMs)}`);
        walkParts(p, relDir, depth + 1, acc);
      } else if (contentStable && ent.name.endsWith(".json")) {
        acc.push(`${ent.name}:c:${contentStablePart(p)}`);
      } else {
        acc.push(`${ent.name}:${Math.floor(st.mtimeMs)}`);
      }
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
    // Directory mtime churns on every heartbeat rewrite of child files — skip it
    // for content-stable roots so only substantive JSON changes matter.
    if (!CONTENT_STABLE_DIRS.has(rel)) {
      try {
        const st = statSync(abs);
        parts.push(`dir:${Math.floor(st.mtimeMs)}`);
      } catch {
        parts.push("err");
      }
    }
    parts.push(...walkParts(abs, rel, 0, []).sort());
  }
  const revision = createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 20);
  return {
    revision,
    generated_at: new Date().toISOString(),
    roots: WATCH_DIRS.length,
  };
}
