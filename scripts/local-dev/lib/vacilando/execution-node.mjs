/**
 * Vacilando — minimal execution Node.
 *
 * A Node is the host this Gateway process currently executes on. It is not
 * a cluster member, scheduler, or remote workload target.
 *
 * Development Lane identity is independent of Node.
 * Execution Binding references a Node.
 * Historical Execution Runs may record which Node they ran on.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { dirname, join } from "node:path";

import { resolveRuntimeConfig } from "./workspace-facts.mjs";

export const EXECUTION_NODE_SCHEMA = "vacilando.execution_node.v1";
export const NODE_ID_RE = /^node_[a-f0-9]{12}$/;

export function vacilandoRuntimeRoot(root) {
  if (root) return String(root).replace(/\/+$/, "");
  return process.env.ALLOY_RUNTIME_ROOT?.trim()
    || join(homedir(), ".local", "state", "alloy-dev");
}

/** Isolated Gateway state root. Distinct from the Alloy toolkit runtime root. */
export function vacilandoGatewayRoot() {
  const env = process.env.VACILANDO_GATEWAY_ROOT?.trim() || process.env.ALLOY_RUNTIME_ROOT?.trim();
  if (env && /(^|\/)gateway$/.test(env.replace(/\/+$/, ""))) return env.replace(/\/+$/, "");
  if (process.env.VACILANDO_GATEWAY_ROOT?.trim()) {
    return process.env.VACILANDO_GATEWAY_ROOT.trim().replace(/\/+$/, "");
  }
  return join(homedir(), ".local", "state", "alloy-dev", "gateway");
}

const DEFAULT_TOOLKIT_RUNTIME = join(homedir(), ".local", "state", "alloy-dev");

/**
 * Worker protocol CLIs (`vac run-status`, `vac governed-action`) must write
 * the same store the Gateway process uses. Alloy config sets ALLOY_RUNTIME_ROOT
 * to the toolkit root; Gateway isolates under …/gateway. Without this remap,
 * a live run is invisible to the app and gets abandoned as missing.
 *
 * Explicit test/fixture roots (anything other than the default toolkit path)
 * are left alone.
 */
export function bindWorkerCliToGatewayRoot() {
  const current = process.env.ALLOY_RUNTIME_ROOT?.trim().replace(/\/+$/, "") || "";
  if (current && current !== DEFAULT_TOOLKIT_RUNTIME) return current;
  const root = vacilandoGatewayRoot();
  process.env.ALLOY_RUNTIME_ROOT = root;
  if (!process.env.VACILANDO_GATEWAY_ROOT?.trim()) {
    process.env.VACILANDO_GATEWAY_ROOT = root;
  }
  return root;
}

export function newNodeId() {
  return `node_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function isNodeId(id) {
  return NODE_ID_RE.test(String(id || ""));
}

function atomicWrite(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

export function executionNodeStorePath(root = vacilandoRuntimeRoot()) {
  return join(root, "vacilando", "node.json");
}

function probeCmd(bin, args = ["--version"]) {
  try {
    execFileSync(bin, args, { encoding: "utf8", timeout: 800, stdio: ["ignore", "pipe", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

let cachedCapabilities = null;

/** Capability flags actually used by today's runtime — not a cluster inventory. */
export function probeNodeCapabilities({ force = false } = {}) {
  if (process.env.VACILANDO_SKIP_NODE_PROBE === "1") {
    return { tmux: false, git: true, node: true, claude: false, docker: false, tailscale: false };
  }
  if (cachedCapabilities && !force) return cachedCapabilities;
  cachedCapabilities = {
    tmux: probeCmd("tmux", ["-V"]),
    git: probeCmd("git", ["--version"]),
    node: true,
    claude: probeCmd("claude", ["--version"]) || probeCmd("claude", ["-v"]),
    docker: probeCmd("docker", ["--version"]),
    tailscale: probeCmd("tailscale", ["version"])
      || existsSync("/Applications/Tailscale.app/Contents/MacOS/Tailscale"),
  };
  return cachedCapabilities;
}

function defaultNodeName() {
  const env = process.env.VACILANDO_NODE_NAME?.trim();
  if (env) return env.slice(0, 80);
  const host = hostname() || "local";
  return host.replace(/\.local$/i, "") || "local";
}

function emptyNode(nowMs = Date.now()) {
  const cfg = safeRuntimeConfig();
  return {
    schema_version: EXECUTION_NODE_SCHEMA,
    node_id: newNodeId(),
    name: defaultNodeName(),
    hostname: hostname() || null,
    created_at: new Date(nowMs).toISOString(),
    updated_at: new Date(nowMs).toISOString(),
    runtime_root: vacilandoRuntimeRoot(),
    worktree_root: cfg.worktree_root || join(homedir(), "Code", "alloy-worktrees"),
    canonical_repo: cfg.canonical_repo || join(homedir(), "Alloy"),
    config_dir: cfg.config_file ? dirname(cfg.config_file) : join(homedir(), ".config", "alloy-dev"),
    capabilities: probeNodeCapabilities(),
  };
}

function safeRuntimeConfig() {
  try {
    return resolveRuntimeConfig();
  } catch {
    return {};
  }
}

export function readExecutionNode(root = vacilandoRuntimeRoot()) {
  try {
    const raw = JSON.parse(readFileSync(executionNodeStorePath(root), "utf8"));
    if (!raw || typeof raw !== "object" || !isNodeId(raw.node_id)) return null;
    return raw;
  } catch {
    return null;
  }
}

/**
 * Stable node identity for this runtime root. Created once; never recycled
 * just because hostname or paths changed. Operator-readable name may update.
 */
export function ensureLocalNode({
  root = vacilandoRuntimeRoot(),
  nowMs = Date.now(),
  name = null,
} = {}) {
  const existing = readExecutionNode(root);
  if (existing) {
    const cfg = safeRuntimeConfig();
    let dirty = false;
    if (name && existing.name !== name) {
      existing.name = String(name).slice(0, 80);
      dirty = true;
    }
    const host = hostname() || null;
    if (host && existing.hostname !== host) {
      existing.hostname = host;
      dirty = true;
    }
    if (existing.runtime_root !== root) {
      existing.runtime_root = root;
      dirty = true;
    }
    if (cfg.worktree_root && existing.worktree_root !== cfg.worktree_root) {
      existing.worktree_root = cfg.worktree_root;
      dirty = true;
    }
    if (cfg.canonical_repo && existing.canonical_repo !== cfg.canonical_repo) {
      existing.canonical_repo = cfg.canonical_repo;
      dirty = true;
    }
    if (dirty) {
      existing.updated_at = new Date(nowMs).toISOString();
      existing.capabilities = probeNodeCapabilities();
      atomicWrite(executionNodeStorePath(root), existing);
    }
    return existing;
  }
  const rec = emptyNode(nowMs);
  rec.runtime_root = root;
  if (name) rec.name = String(name).slice(0, 80);
  atomicWrite(executionNodeStorePath(root), rec);
  return rec;
}

export function getLocalNode(root = vacilandoRuntimeRoot()) {
  return readExecutionNode(root) || ensureLocalNode({ root });
}

export function localNodeId(root = vacilandoRuntimeRoot()) {
  return getLocalNode(root).node_id;
}

/** "local" remains a compatibility alias for the current node. */
export function resolveExecutionNodeRef(value, root = vacilandoRuntimeRoot()) {
  const raw = String(value || "").trim();
  if (!raw || raw === "local") return localNodeId(root);
  return raw;
}

export function publicExecutionNode(rec) {
  if (!rec) return null;
  return {
    node_id: rec.node_id,
    name: rec.name,
    hostname: rec.hostname || null,
    runtime_root: rec.runtime_root || null,
    worktree_root: rec.worktree_root || null,
    canonical_repo: rec.canonical_repo || null,
    capabilities: rec.capabilities || null,
    created_at: rec.created_at || null,
  };
}

export function resetExecutionNodeForTests(root = vacilandoRuntimeRoot()) {
  try { unlinkSync(executionNodeStorePath(root)); } catch { /* */ }
}
