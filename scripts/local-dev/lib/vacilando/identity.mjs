/**
 * Vacilando — Slot Identity (single source of truth).
 *
 * A slot has EXACTLY ONE authoritative identity. Every projection — dock card,
 * repository, closeout, outputs, missions, execution cwd — must resolve through
 * here. No surface may reference a different worktree.
 *
 * Authority chain (deterministic, verifiable — never inference):
 *   1. The slot registry (toolkit metadata) declares slot → worktree NAME + BRANCH.
 *   2. The worktree must exist on disk.
 *   3. Git must confirm that worktree's checked-out branch EQUALS the registered
 *      branch. This cross-check is what makes the identity authoritative rather
 *      than a trusted name field — a stale/renamed entry is detected, not obeyed.
 *   4. Any mismatch produces an explicit `conflict`, and consumers fail closed.
 *
 * It also discloses the RUNTIME HOST worktree — the worktree this server process
 * itself runs from. That is a real, load-bearing fact: the host may be a worktree
 * registered to no slot (as during development), and the operator must never have
 * to guess which worktree a panel describes.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import { basename, join } from "node:path";

import { REPO_ROOT } from "./knowledge.mjs";
import { resolveRuntimeConfig } from "./workspace-facts.mjs";

const CACHE_TTL_MS = 10000;
const cache = new Map(); // slot -> { at, identity }

function runtimeLayout() {
  const cfg = resolveRuntimeConfig();
  return {
    wtRoot: cfg.worktree_root || join(os.homedir(), "Code", "alloy-worktrees"),
    metaDir: cfg.metadata_dir || join(os.homedir(), ".local", "state", "alloy-dev", "metadata"),
  };
}

function gitBranch(worktreePath) {
  if (!worktreePath || !existsSync(worktreePath)) return null;
  try {
    // stderr is CAPTURED, not inherited. execFileSync forwards a child's stderr
    // to the parent unless stdio says otherwise, so a path that is not a Git
    // repository printed `fatal: not a git repository` into the Gateway's log on
    // every poll — a caught, handled condition masquerading as a runtime fault.
    return execFileSync("git", ["-C", worktreePath, "rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch { return null; }
}

/** The worktree this server process is running from (a real, disclosed fact). */
export function runtimeHost() {
  return {
    worktree_path: REPO_ROOT,
    worktree_name: basename(REPO_ROOT),
    branch: gitBranch(REPO_ROOT),
  };
}

/** Read the slot registry entry (metadata) for a slot. */
function registryEntry(slot) {
  const { metaDir } = runtimeLayout();
  try {
    for (const f of readdirSync(metaDir).filter((x) => x.endsWith(".env"))) {
      const t = readFileSync(join(metaDir, f), "utf8");
      const g = (k) => (t.match(new RegExp(`^${k}="?([^"\n]*)"?`, "m")) || [])[1] || null;
      if (Number(g("ALLOY_WORKTREE_SLOT")) === slot) {
        const branch = g("ALLOY_WORKTREE_BRANCH");
        return {
          slot,
          worktree_name: g("ALLOY_WORKTREE_NAME"),
          branch,
          provider: branch ? (branch.match(/^agent\/([^/]+)\//) || [])[1] : null,
          port: Number(g("PORT")) || null,
          source_file: f,
        };
      }
    }
  } catch { /* no registry */ }
  return null;
}

/**
 * Resolve the ONE authoritative identity for a slot.
 * Returns { ok, slot, worktree_name, worktree_path, branch, provider, port,
 *           host, is_host, conflict }.
 * `conflict` is non-null when the identity cannot be trusted; consumers MUST
 * fail closed on destructive actions when a conflict is present.
 */
export function resolveSlotIdentity(slot, { force = false } = {}) {
  const c = cache.get(slot);
  if (!force && c && Date.now() - c.at < CACHE_TTL_MS) return c.identity;

  const host = runtimeHost();
  const reg = registryEntry(slot);
  let identity;

  if (!reg || !reg.worktree_name) {
    identity = { ok: false, slot, worktree_name: null, worktree_path: null, branch: null, provider: null, port: null, host, is_host: false,
      conflict: { kind: "unregistered_slot", detail: `Slot ${slot} has no registry entry.` } };
  } else {
    const { wtRoot } = runtimeLayout();
    const worktree_path = join(wtRoot, reg.worktree_name);
    const exists = existsSync(worktree_path);
    const actualBranch = exists ? gitBranch(worktree_path) : null;
    let conflict = null;
    if (!exists) {
      conflict = { kind: "worktree_missing", detail: `Registry names "${reg.worktree_name}" but that worktree does not exist on disk.` };
    } else if (reg.branch && actualBranch && actualBranch !== reg.branch) {
      // The cross-check that makes this authoritative rather than trusting a name.
      conflict = { kind: "branch_mismatch", detail: `Registry declares branch "${reg.branch}" but "${reg.worktree_name}" has "${actualBranch}" checked out.`, registered_branch: reg.branch, actual_branch: actualBranch };
    }
    identity = {
      ok: !conflict, slot,
      worktree_name: reg.worktree_name, worktree_path,
      branch: actualBranch || reg.branch, registered_branch: reg.branch,
      provider: reg.provider, port: reg.port,
      host, is_host: exists && worktree_path === host.worktree_path,
      conflict,
    };
  }
  cache.set(slot, { at: Date.now(), identity });
  return identity;
}

/**
 * Whether the runtime host worktree is registered to ANY slot. When false, the
 * server is running from a worktree no slot owns — surfaced so the operator is
 * never left guessing which worktree the runtime itself lives in.
 */
export function hostRegistration() {
  const host = runtimeHost();
  for (let s = 1; s <= 6; s++) {
    const id = resolveSlotIdentity(s);
    if (id.worktree_path === host.worktree_path) return { registered: true, slot: s, host };
  }
  return { registered: false, slot: null, host };
}

/** Invalidate cached identities (after a slot lifecycle change). */
export function invalidateIdentity(slot) { if (slot == null) cache.clear(); else cache.delete(slot); }

/** Every registered slot identity (the fast, always-available board spine). */
export function listSlotIdentities() {
  const out = [];
  for (let s = 1; s <= 6; s++) { const i = resolveSlotIdentity(s); if (i.worktree_name) out.push(i); }
  return out;
}

/**
 * The RUNTIME HOST workspace — a first-class, explicitly-typed workspace that is
 * NOT a worker slot.
 *
 * Decision (Part 2, option A): the worktree the Vacilando server runs from is
 * declared a dedicated **system host** workspace. It is never assigned to a slot
 * (silently or otherwise), and worker execution never falls back to it — the
 * Worker Runtime refuses to run without an authoritative slot identity.
 */
export function hostIdentity() {
  const h = runtimeHost();
  const reg = hostRegistration();
  return {
    ownership_type: "system_host",
    id: "host:" + h.worktree_name,
    project_id: "alloy",
    purpose: "Runs the Vacilando control-plane server (loopback 3020). Hosts no worker missions.",
    repository: "alloy",
    worktree_name: h.worktree_name,
    worktree_path: h.worktree_path,
    branch: h.branch,
    // A system host being registered to a slot would be the anomaly — surface it.
    conflicts_with_slot: reg.registered ? reg.slot : null,
    status: reg.registered ? "conflict — this worktree is also a worker slot" : "ok — system host, owned by no slot",
    executes_missions: false,
  };
}
