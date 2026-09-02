/**
 * Vacilando durable-state classification + backup/restore.
 *
 * Permanent Development Lane identity must survive a dead execution node.
 * Host-specific execution bindings are rebound, not treated as identity.
 * Secrets are never copied into the durable backup unit.
 *
 * This is not a cluster snapshot and does not migrate live processes,
 * tmux sessions, Git worktrees, or provider conversations.
 */
import { createHash, randomUUID } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";

import {
  ensureLocalNode,
  localNodeId,
  vacilandoGatewayRoot,
  vacilandoRuntimeRoot,
} from "./execution-node.mjs";
import {
  getDurableLane,
  invalidateStaleExecutionBindings,
  listDurableLanes,
  readDevelopmentLaneStore,
} from "./development-lane.mjs";
import { endAgentSession, listCurrentAgentSessions } from "./agent-session.mjs";

export const DURABLE_BACKUP_SCHEMA = "vacilando.durable_backup.v1";
export const DEFAULT_BACKUP_RETENTION = 7;

/** Classification of Vacilando-owned state families. */
export const STATE_FAMILIES = Object.freeze([
  {
    id: "development_lanes",
    class: "AUTHORITATIVE",
    paths: ["lanes/lanes.json"],
    backup: true,
    restore: true,
    notes: "Permanent lane_id + name + aliases. Binding is host-specific and invalidated on restore.",
  },
  {
    id: "execution_runs",
    class: "AUTHORITATIVE",
    paths: ["execution-runs/runs.json", "execution-runs/events.jsonl"],
    backup: true,
    restore: true,
    notes: "Historical runs stay attached to lane_id. worktree_path is observational.",
  },
  {
    id: "agent_sessions",
    class: "AUTHORITATIVE",
    paths: ["execution-runs/agent-sessions.json", "execution-runs/agent-session-events.jsonl"],
    backup: true,
    restore: true,
    notes: "Session history is durable; live provider context is replaceable.",
  },
  {
    id: "agent_handoffs",
    class: "AUTHORITATIVE",
    paths: ["execution-runs/agent-handoffs.json"],
    backup: true,
    restore: true,
  },
  {
    id: "admissions",
    class: "AUTHORITATIVE",
    paths: ["execution-runs/admissions.json", "execution-runs/admission-events.jsonl"],
    backup: true,
    restore: true,
    notes: "Open admissions are not live capacity. Restore keeps history; in-flight queue is operator-reviewed.",
  },
  {
    id: "resource_requests",
    class: "AUTHORITATIVE",
    paths: ["execution-runs/resource-requests.json", "execution-runs/resource-events.jsonl"],
    backup: true,
    restore: true,
    notes: "GRANTED claims are not valid on a new node; restore leaves records but does not re-grant.",
  },
  {
    id: "source_control_governor",
    class: "AUTHORITATIVE",
    paths: ["execution-runs/source-control.json", "execution-runs/source-control-events.jsonl"],
    backup: true,
    restore: true,
  },
  {
    id: "recovery_state",
    class: "AUTHORITATIVE",
    paths: [
      "execution-runs/recovery-budgets.json",
      "execution-runs/recovery-events.jsonl",
    ],
    backup: true,
    restore: true,
  },
  {
    id: "lane_runtime_sends",
    class: "AUTHORITATIVE",
    paths: ["lane-runtime/sends.json"],
    backup: true,
    restore: true,
  },
  {
    id: "audit",
    class: "AUTHORITATIVE",
    paths: ["audit.jsonl"],
    backup: true,
    restore: true,
  },
  {
    id: "usage_economics",
    class: "AUTHORITATIVE",
    paths: ["usage-ledger", "director"],
    backup: true,
    restore: true,
  },
  {
    id: "notification_subscriptions",
    class: "AUTHORITATIVE",
    paths: ["notifications"],
    backup: true,
    restore: true,
    notes: "Subscription endpoints restore. VAPID keys do not — they live in web-push.json (secrets).",
  },
  {
    id: "governed_actions",
    class: "AUTHORITATIVE",
    paths: ["governed-actions/requests.json", "governed-actions/audit.jsonl"],
    backup: true,
    restore: true,
  },
  {
    id: "mission_records",
    class: "AUTHORITATIVE",
    paths: ["missions", "timeline", "decisions", "mission-briefs", "objectives", "product-definitions"],
    backup: true,
    restore: true,
  },
  {
    id: "execution_node",
    class: "EPHEMERAL",
    paths: ["node.json"],
    backup: false,
    restore: false,
    notes: "Host identity. Regenerated with ensureLocalNode on the destination root.",
  },
  {
    id: "control_plane_process",
    class: "EPHEMERAL",
    paths: ["control-plane-owner.json", "control-plane-health.json"],
    backup: false,
    restore: false,
  },
  {
    id: "owned_processes",
    class: "EPHEMERAL",
    paths: ["execution-runs/owned-processes.json", "execution-runs/machine-exclusive.json"],
    backup: false,
    restore: false,
  },
  {
    id: "api_token",
    class: "EPHEMERAL",
    paths: ["api-token"],
    backup: false,
    restore: false,
    notes: "Secret. Bootstrap places a new token; never copy into source control or lane backups.",
  },
  {
    id: "push_vapid",
    class: "EPHEMERAL",
    paths: ["web-push.json"],
    backup: false,
    restore: false,
    notes: "Contains VAPID private key. Re-provision on the new host.",
  },
  {
    id: "trusted_secrets",
    class: "EPHEMERAL",
    paths: ["trusted-secrets"],
    backup: false,
    restore: false,
    notes: "Trusted-host credentials stay on the trusted host; not part of lane backup.",
  },
  {
    id: "trusted_host_runtime",
    class: "RECONSTRUCTABLE",
    paths: ["trusted-host-actions", "trusted-host-authz"],
    backup: false,
    restore: false,
    notes: "Certification artifacts and authz caches. Reconstruct from GitHub/DB on the trusted host.",
  },
  {
    id: "repository_registry",
    class: "RECONSTRUCTABLE",
    paths: ["repositories.json"],
    backup: false,
    restore: false,
    notes: "Absolute host paths. A MacBook's roots are wrong on a Mac mini, so it is never restored — the Gateway reconstructs it at boot from this host's ALLOY_REPO (migrateLanesToAlloy). It was previously unclassified and reconstructed by nobody, which left managedWorktreePath refusing every worktree on a fresh host.",
  },
  {
    id: "knowledge_cache",
    class: "RECONSTRUCTABLE",
    paths: ["knowledge", "director-capabilities.json", "director-idempotency", "resource-claims.json"],
    backup: false,
    restore: false,
  },
  {
    id: "evidence_blobs",
    class: "RECONSTRUCTABLE",
    paths: ["evidence"],
    backup: false,
    restore: false,
    notes: "Large and regenerable from worktrees/certification. Omit from the minimum backup unit.",
  },
]);

const SECRET_NAME_RE = /(^|\/)(api-token|web-push\.json|trusted-secrets)(\/|$)/i;
const SECRET_BASENAME_RE = /(\.env|\.pem|\.key)$/i;

function atomicWrite(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

function sha256File(path) {
  const buf = readFileSync(path);
  return createHash("sha256").update(buf).digest("hex");
}

function listFilesRecursive(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  const st = statSync(dir);
  if (st.isFile()) {
    acc.push(dir);
    return acc;
  }
  if (!st.isDirectory()) return acc;
  for (const name of readdirSync(dir)) {
    if (name === "." || name === "..") continue;
    listFilesRecursive(join(dir, name), acc);
  }
  return acc;
}

function isSecretRel(rel) {
  const n = rel.split(sep).join("/");
  return SECRET_NAME_RE.test(n) || SECRET_BASENAME_RE.test(n);
}

export function durableRelPaths() {
  const out = [];
  for (const fam of STATE_FAMILIES) {
    if (!fam.backup) continue;
    for (const p of fam.paths) out.push(p);
  }
  return out;
}

export function vacilandoStateDir(root = vacilandoRuntimeRoot()) {
  return join(root, "vacilando");
}

export function defaultBackupRoot(sourceRoot = vacilandoGatewayRoot()) {
  return join(sourceRoot, "backups");
}

function copyDurableTree(srcVac, destVac, rels) {
  const copied = [];
  for (const rel of rels) {
    const src = join(srcVac, rel);
    if (!existsSync(src)) continue;
    if (isSecretRel(rel)) continue;
    const dest = join(destVac, rel);
    mkdirSync(dirname(dest), { recursive: true });
    const st = statSync(src);
    if (st.isDirectory()) {
      cpSync(src, dest, {
        recursive: true,
        filter: (p) => !isSecretRel(relative(srcVac, p)),
      });
    } else {
      copyFileSync(src, dest);
    }
    copied.push(rel);
  }
  return copied;
}

function fileManifest(vacDir) {
  const files = [];
  for (const abs of listFilesRecursive(vacDir)) {
    const rel = relative(vacDir, abs).split(sep).join("/");
    if (rel === "MANIFEST.json" || rel.startsWith("MANIFEST.")) continue;
    if (isSecretRel(rel)) continue;
    const st = statSync(abs);
    if (!st.isFile()) continue;
    files.push({ path: rel, bytes: st.size, sha256: sha256File(abs) });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

export function backupDurableState({
  sourceRoot = vacilandoGatewayRoot(),
  backupRoot = defaultBackupRoot(sourceRoot),
  nowMs = Date.now(),
  retention = DEFAULT_BACKUP_RETENTION,
} = {}) {
  const srcVac = vacilandoStateDir(sourceRoot);
  if (!existsSync(srcVac)) {
    return { ok: false, error: "source_missing", source_root: sourceRoot };
  }
  const stamp = new Date(nowMs).toISOString().replace(/[:.]/g, "-");
  const backupId = `vbak_${stamp}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const finalDir = join(backupRoot, backupId);
  const tmpDir = `${finalDir}.${process.pid}.tmp`;
  rmSync(tmpDir, { recursive: true, force: true });
  const destVac = join(tmpDir, "vacilando");
  mkdirSync(destVac, { recursive: true });
  const copied = copyDurableTree(srcVac, destVac, durableRelPaths());
  const files = fileManifest(destVac);
  const manifest = {
    schema_version: DURABLE_BACKUP_SCHEMA,
    backup_id: backupId,
    created_at: new Date(nowMs).toISOString(),
    source_root: sourceRoot,
    families: STATE_FAMILIES.filter((f) => f.backup).map((f) => f.id),
    excluded_families: STATE_FAMILIES.filter((f) => !f.backup).map((f) => f.id),
    copied_roots: copied,
    files,
    git_mutated: false,
    worktree_mutated: false,
  };
  atomicWrite(join(tmpDir, "MANIFEST.json"), manifest);
  mkdirSync(backupRoot, { recursive: true });
  rmSync(finalDir, { recursive: true, force: true });
  renameSync(tmpDir, finalDir);
  pruneBackups(backupRoot, retention);
  return { ok: true, backup_id: backupId, path: finalDir, manifest };
}

export function pruneBackups(backupRoot, retention = DEFAULT_BACKUP_RETENTION) {
  if (!existsSync(backupRoot)) return [];
  const dirs = readdirSync(backupRoot)
    .filter((n) => n.startsWith("vbak_") && existsSync(join(backupRoot, n, "MANIFEST.json")))
    .sort()
    .reverse();
  const removed = [];
  for (const extra of dirs.slice(Math.max(0, Number(retention) || DEFAULT_BACKUP_RETENTION))) {
    rmSync(join(backupRoot, extra), { recursive: true, force: true });
    removed.push(extra);
  }
  return removed;
}

export function readBackupManifest(backupPath) {
  const manifestPath = join(backupPath, "MANIFEST.json");
  const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!raw || raw.schema_version !== DURABLE_BACKUP_SCHEMA) {
    throw new Error("invalid_backup_manifest");
  }
  return raw;
}

export function verifyBackup(backupPath) {
  const manifest = readBackupManifest(backupPath);
  const vac = join(backupPath, "vacilando");
  const errors = [];
  for (const f of manifest.files || []) {
    const abs = join(vac, f.path);
    if (!existsSync(abs)) {
      errors.push({ path: f.path, error: "missing" });
      continue;
    }
    const sha = sha256File(abs);
    if (sha !== f.sha256) errors.push({ path: f.path, error: "checksum_mismatch" });
  }
  return { ok: errors.length === 0, errors, backup_id: manifest.backup_id };
}

/**
 * Restore durable Vacilando state into destRoot.
 * Never writes Git, worktrees, tmux, or secrets.
 * Regenerates Node identity. Invalidates host bindings by default.
 */
export function restoreDurableState({
  backupPath,
  destRoot,
  invalidateBindings = true,
  nowMs = Date.now(),
} = {}) {
  if (!backupPath || !destRoot) return { ok: false, error: "restore_paths_required" };
  const verified = verifyBackup(backupPath);
  if (!verified.ok) return { ok: false, error: "backup_corrupt", details: verified.errors };
  const srcVac = join(backupPath, "vacilando");
  const destVac = vacilandoStateDir(destRoot);
  mkdirSync(destRoot, { recursive: true });
  mkdirSync(destVac, { recursive: true });
  copyDurableTree(srcVac, destVac, durableRelPaths());
  const node = ensureLocalNode({ root: destRoot, nowMs });
  let bindings = { invalidated: 0 };
  let sessionsEnded = 0;
  if (invalidateBindings) {
    bindings = invalidateStaleExecutionBindings({
      root: destRoot,
      reason: "restored_onto_different_node",
      nowMs,
      currentNodeId: node.node_id,
    });
    // A binding and a session are two halves of the same runtime claim. The
    // binding was invalidated because the runtime it names is on another
    // machine; a non-terminal session names a PROCESS on that same machine and
    // is no more valid here. Left ACTIVE, it makes the lane permanently
    // unstartable — createAgentSession refuses `lane_has_active_session`.
    //
    // History is preserved: the session is ended, never deleted, and SUSPENDED
    // is untouched because a suspended session is what the operator resumes.
    sessionsEnded = endSessionsFromAnotherNode(destRoot, nowMs);
  }
  return {
    ok: true,
    dest_root: destRoot,
    node_id: node.node_id,
    backup_id: verified.backup_id,
    bindings_invalidated: bindings.invalidated,
    agent_sessions_ended: sessionsEnded,
    git_mutated: false,
    worktree_mutated: false,
    lanes: listDurableLanes(destRoot).map((l) => ({
      lane_id: l.lane_id,
      name: l.name,
      work_class: l.work_class || "product",
      binding_status: l.binding?.status || (l.binding?.stale ? "stale" : (l.binding ? "bound" : "unbound")),
    })),
  };
}

/**
 * End every non-terminal Agent Session carried in from another node.
 *
 * SUSPENDED is deliberately excluded: it is an operator-visible state meaning
 * "the computation stopped, the session did not", and it survives a move.
 */
function endSessionsFromAnotherNode(destRoot, nowMs) {
  const CARRIED_OVER = new Set([
    "STARTING", "ACTIVE", "ROTATION_PENDING", "HANDOFF", "RESTARTING", "VERIFYING",
  ]);
  let ended = 0;
  for (const session of listCurrentAgentSessions(destRoot)) {
    if (!CARRIED_OVER.has(session.state)) continue;
    const out = endAgentSession(session.agent_session_id, {
      reason: "restored_onto_different_node",
      nowMs,
      root: destRoot,
    });
    if (out?.ok !== false) ended += 1;
  }
  return ended;
}

export function laneIdentitySnapshot(root) {
  return listDurableLanes(root).map((l) => ({
    lane_id: l.lane_id,
    name: l.name,
    aliases: l.aliases || [],
    work_class: l.work_class || "product",
  })).sort((a, b) => a.lane_id.localeCompare(b.lane_id));
}

export function assertLaneIdentitiesPreserved(before, after) {
  const a = new Map(before.map((l) => [l.lane_id, l]));
  const b = new Map(after.map((l) => [l.lane_id, l]));
  const missing = [...a.keys()].filter((id) => !b.has(id));
  const renamed = [...a.keys()].filter((id) => b.has(id) && a.get(id).name !== b.get(id).name);
  return { ok: missing.length === 0 && renamed.length === 0, missing, renamed };
}

export function getLaneInRoot(laneId, root) {
  return getDurableLane(laneId, root);
}

export function readLaneStore(root) {
  return readDevelopmentLaneStore(root);
}
