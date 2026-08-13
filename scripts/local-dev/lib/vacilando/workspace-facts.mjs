#!/usr/bin/env node
/**
 * Vacilando — one Node pass over stable workspace facts.
 *
 * Replaces the prior fan-out of six parallel `alloy-ro` Bash processes that each
 * re-discovered config, metadata, and (often) git independently. Status hot path
 * reads files + a batched port listen table + cached git facts here instead.
 */
import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readManifest } from "../manifest-io.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const TOOLKIT_DIR = resolve(HERE, "..", "..");

const EXEC_TIMEOUT_MS = 12000;
const GIT_FACTS_TTL_MS = 60_000;
const PORT_TABLE_TTL_MS = 15_000;

const gitFactsCache = new Map(); // path -> { at, git, ahead_behind, branch }
const portTableCache = { at: 0, byPort: new Map() };

function run(cmd, args, opts = {}) {
  return new Promise((res) => {
    execFile(
      cmd,
      args,
      { timeout: opts.timeout ?? EXEC_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, cwd: opts.cwd, env: process.env },
      (err, stdout, stderr) => res({ ok: !err, stdout: stdout ?? "", stderr: stderr ?? "", error: err ? String(err.message || err) : null }),
    );
  });
}

function kvRaw(file, key) {
  if (!existsSync(file)) return null;
  let found = null;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*(?:export\\s+)?${key}=(.*)$`));
    if (!m) continue;
    let rhs = m[1];
    if (rhs.startsWith('"')) rhs = rhs.slice(1).split('"')[0];
    else if (rhs.startsWith("'")) rhs = rhs.slice(1).split("'")[0];
    else rhs = rhs.replace(/#.*$/, "").trim();
    found = rhs;
  }
  return found;
}

function isSafeValue(v) {
  if (v == null) return false;
  if (/[;|&><`\\\n$]/.test(v)) return false;
  if (v.includes("$(") || v.includes("<(") || v.includes(">(")) return false;
  return true;
}

function expandValue(v, bases) {
  let out = String(v);
  out = out.replace(/\$\{HOME\}/g, bases.HOME).replace(/\$HOME/g, bases.HOME);
  out = out.replace(/\$\{ALLOY_REPO\}/g, bases.ALLOY_REPO || "").replace(/\$ALLOY_REPO/g, bases.ALLOY_REPO || "");
  out = out.replace(/\$\{ALLOY_RUNTIME_ROOT\}/g, bases.ALLOY_RUNTIME_ROOT || "").replace(/\$ALLOY_RUNTIME_ROOT/g, bases.ALLOY_RUNTIME_ROOT || "");
  out = out.replace(/\$\{ALLOY_WORKTREE_ROOT\}/g, bases.ALLOY_WORKTREE_ROOT || "").replace(/\$ALLOY_WORKTREE_ROOT/g, bases.ALLOY_WORKTREE_ROOT || "");
  out = out.replace(/\$\{ALLOY_CONFIG_DIR\}/g, bases.ALLOY_CONFIG_DIR || "").replace(/\$ALLOY_CONFIG_DIR/g, bases.ALLOY_CONFIG_DIR || "");
  if (!isSafeValue(out)) return null;
  return out;
}

function configGet(key, files, bases) {
  let val = null;
  for (const f of files) {
    const raw = kvRaw(f, key);
    if (raw == null) continue;
    const expanded = expandValue(raw, bases);
    if (expanded != null) val = expanded;
  }
  return val;
}

/** Resolve the same path layout alloy-ro runtime-paths / config_init expose. */
export function resolveRuntimeConfig() {
  const HOME = process.env.HOME || homedir();
  const cfgExample = join(TOOLKIT_DIR, "alloy-config.example");
  const cfgUser = process.env.ALLOY_CONFIG_FILE || join(HOME, ".config", "alloy-dev", "config");
  const files = [cfgExample, cfgUser];
  const bases = {
    HOME,
    ALLOY_REPO: "",
    ALLOY_RUNTIME_ROOT: join(HOME, ".local", "state", "alloy-dev"),
    ALLOY_WORKTREE_ROOT: join(HOME, "Code", "alloy-worktrees"),
    ALLOY_CONFIG_DIR: join(HOME, ".config", "alloy-dev"),
  };
  // Two-pass: defaults first, then re-read with expanded bases.
  bases.ALLOY_REPO = configGet("ALLOY_REPO", files, bases) || "/Users/Kelly/Alloy";
  bases.ALLOY_RUNTIME_ROOT = configGet("ALLOY_RUNTIME_ROOT", files, bases) || bases.ALLOY_RUNTIME_ROOT;
  bases.ALLOY_WORKTREE_ROOT = configGet("ALLOY_WORKTREE_ROOT", files, bases) || bases.ALLOY_WORKTREE_ROOT;
  bases.ALLOY_CONFIG_DIR = configGet("ALLOY_CONFIG_DIR", files, bases) || bases.ALLOY_CONFIG_DIR;
  const baseRemote = configGet("ALLOY_BASE_REMOTE", files, bases) || "origin";
  const baseBranch = configGet("ALLOY_BASE_BRANCH", files, bases) || "staging";
  const webDir = configGet("ALLOY_WEB_DIR", files, bases) || "web";
  const runtimeRoot = bases.ALLOY_RUNTIME_ROOT;
  return {
    config_file: cfgUser,
    runtime_root: runtimeRoot,
    metadata_dir: join(runtimeRoot, "metadata"),
    pids_dir: join(runtimeRoot, "pids"),
    logs_dir: join(runtimeRoot, "logs"),
    locks_dir: join(runtimeRoot, "locks"),
    auth_dir: join(runtimeRoot, "auth"),
    evidence_dir: join(runtimeRoot, "evidence"),
    initiatives_dir: join(runtimeRoot, "initiatives"),
    manifests_dir: join(runtimeRoot, "manifests"),
    worktree_root: bases.ALLOY_WORKTREE_ROOT,
    canonical_repo: bases.ALLOY_REPO,
    base_remote: baseRemote,
    base_branch: baseBranch,
    base_ref: `${baseRemote}/${baseBranch}`,
    web_dir: webDir,
    runtime_root_exists: existsSync(runtimeRoot),
  };
}

function metaGet(file, key) {
  const raw = kvRaw(file, key);
  if (raw == null || !isSafeValue(raw)) return "";
  return raw;
}

export function listMetadataNames(metadataDir) {
  if (!existsSync(metadataDir)) return [];
  return readdirSync(metadataDir)
    .filter((f) => f.endsWith(".env"))
    .map((f) => basename(f, ".env"))
    .sort();
}

export function readAllMetadata(cfg) {
  const out = [];
  for (const name of listMetadataNames(cfg.metadata_dir)) {
    const file = join(cfg.metadata_dir, `${name}.env`);
    out.push({
      worktree: name,
      slot: metaGet(file, "ALLOY_WORKTREE_SLOT"),
      path: metaGet(file, "ALLOY_WORKTREE_PATH"),
      branch_expected: metaGet(file, "ALLOY_WORKTREE_BRANCH"),
      provider: metaGet(file, "ALLOY_AGENT"),
      port: metaGet(file, "PORT"),
      sprint: metaGet(file, "ALLOY_SPRINT_NAME"),
      lifecycle: metaGet(file, "ALLOY_WORKER_LIFECYCLE"),
      agent_status: metaGet(file, "ALLOY_AGENT_STATUS"),
      role: metaGet(file, "ALLOY_AGENT_ROLE"),
      created_at: metaGet(file, "ALLOY_CREATED_AT"),
      opened_at: metaGet(file, "ALLOY_AGENT_OPENED_AT"),
      closed_at: metaGet(file, "ALLOY_AGENT_CLOSED_AT"),
      session_id: metaGet(file, "ALLOY_PROVIDER_SESSION_ID"),
      pause_recorded_at: metaGet(file, "ALLOY_PAUSE_RECORDED_AT"),
      finished_at: metaGet(file, "ALLOY_FINISHED_AT"),
      sprint_objective: metaGet(file, "ALLOY_SPRINT_OBJECTIVE"),
    });
  }
  return out;
}

async function listenPortTable() {
  const now = Date.now();
  if (now - portTableCache.at < PORT_TABLE_TTL_MS && portTableCache.byPort.size >= 0) {
    return portTableCache.byPort;
  }
  const byPort = new Map();
  const r = await run("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"], { timeout: 4000 });
  if (r.ok) {
    for (const line of r.stdout.split(/\n/).slice(1)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 9) continue;
      const pid = parts[1];
      const name = parts[8] || "";
      const m = name.match(/:(\d+)$/);
      if (!m) continue;
      byPort.set(m[1], pid);
    }
  }
  portTableCache.at = now;
  portTableCache.byPort = byPort;
  return byPort;
}

async function gitFactsForPath(path, cfg) {
  const now = Date.now();
  const hit = gitFactsCache.get(path);
  if (hit && now - hit.at < GIT_FACTS_TTL_MS) return hit;
  if (!path || !existsSync(path)) {
    const miss = { at: now, git: "missing", ahead_behind: "?/?", branch: "?" };
    gitFactsCache.set(path || "", miss);
    return miss;
  }
  const webRel = `${cfg.web_dir}/next-env.d.ts`;
  const [dirtyR, abAhead, abBehind, branchR] = await Promise.all([
    run("git", ["--no-optional-locks", "-C", path, "status", "--porcelain"], { timeout: 8000 }),
    run("git", ["--no-optional-locks", "-C", path, "rev-list", "--count", `${cfg.base_ref}..HEAD`], { timeout: 8000 }),
    run("git", ["--no-optional-locks", "-C", path, "rev-list", "--count", `HEAD..${cfg.base_ref}`], { timeout: 8000 }),
    run("git", ["--no-optional-locks", "-C", path, "rev-parse", "--abbrev-ref", "HEAD"], { timeout: 4000 }),
  ]);
  let git = "unknown";
  if (dirtyR.ok) {
    const lines = dirtyR.stdout.split(/\n/).filter((l) => l && !/^\?\? \.env\.local\.agent$/.test(l));
    const meaningful = lines.filter((l) => l.slice(3) !== webRel);
    git = meaningful.length ? "dirty" : "clean";
  } else if (!existsSync(path)) {
    git = "missing";
  }
  const ahead = abAhead.ok ? (abAhead.stdout.trim() || "?") : "?";
  const behind = abBehind.ok ? (abBehind.stdout.trim() || "?") : "?";
  const fact = {
    at: now,
    git,
    ahead_behind: `${ahead}/${behind}`,
    branch: branchR.ok ? (branchR.stdout.trim() || "?") : "?",
  };
  gitFactsCache.set(path, fact);
  return fact;
}

function projectInitiative(statePath) {
  try {
    const d = JSON.parse(readFileSync(statePath, "utf8"));
    const decisions = Array.isArray(d.human_decisions) ? d.human_decisions : [];
    return {
      key: d.key || null,
      state: d.state || null,
      title: d.title || null,
      created_at: d.created_at || null,
      updated_at: d.updated_at || null,
      remediation_round: d.remediation_round || 0,
      product_revision: d.product_revision ?? null,
      approver: d.approver || null,
      human_decisions: decisions.map((x) => ({
        id: x.id || null,
        question: x.question || "",
        why_it_matters: x.why_it_matters || "",
        options: Array.isArray(x.options) ? x.options : [],
        recommendation: x.recommendation || null,
        status: x.status || "open",
        parallel_work_ok: x.parallel_work_ok === true,
      })),
    };
  } catch {
    return null;
  }
}

export function readInitiatives(cfg) {
  const dir = cfg.initiatives_dir;
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (!/^[a-z0-9]+([_-][a-z0-9]+)*$/.test(name)) continue;
    const sf = join(dir, name, "state.json");
    if (!existsSync(sf)) continue;
    const proj = projectInitiative(sf);
    if (proj) out.push(proj);
  }
  return out;
}

export function readSprintManifests(cfg, names) {
  const map = new Map();
  for (const name of names) {
    const file = join(cfg.manifests_dir, `${name}.json`);
    const m = readManifest(file);
    if (!m) {
      map.set(name, { worktree: name, present: false });
      continue;
    }
    map.set(name, {
      worktree: name,
      present: true,
      stage: m.stage ?? null,
      role: m.role ?? null,
      lane: m.lane ?? null,
      sprint_name: m.sprint_name ?? null,
      initiative_key: m.initiative_key && m.initiative_key !== "undeclared" ? m.initiative_key : null,
    });
  }
  return map;
}

export function evidenceCountFor(cfg, name) {
  const dir = join(cfg.evidence_dir, name);
  if (!existsSync(dir)) return 0;
  try {
    let n = 0;
    const walk = (d) => {
      for (const ent of readdirSync(d, { withFileTypes: true })) {
        if (ent.name.startsWith(".")) continue;
        const p = join(d, ent.name);
        if (ent.isDirectory()) walk(p);
        else n += 1;
      }
    };
    walk(dir);
    return n;
  } catch {
    return 0;
  }
}

function classifyRoot(toplevel, canon, wtRoot) {
  if (!toplevel) return { class: "outside", detail: "not inside a git repository", sanctioned: false };
  if (toplevel === canon) return { class: "canonical", detail: "the canonical repository", sanctioned: true };
  if (toplevel.startsWith(`${wtRoot}/`)) return { class: "managed-worktree", detail: "a managed worktree under ALLOY_WORKTREE_ROOT", sanctioned: true };
  const retired = (process.env.ALLOY_RETIRED_ROOTS || join(homedir(), "Alloy-Claude")).split(/\s+/);
  for (const r of retired) {
    if (!r) continue;
    if (toplevel === r || toplevel.startsWith(`${r}/`)) return { class: "retired", detail: "a RETIRED engineering root", sanctioned: false };
  }
  return { class: "unmanaged", detail: "a git repository that is neither canonical nor a managed worktree", sanctioned: false };
}

/**
 * One consolidated workspace snapshot for Vacilando board compose.
 * Does not run `du`. Does not spawn `alloy-ro`.
 */
export async function buildWorkspaceFacts(opts = {}) {
  const cfg = resolveRuntimeConfig();
  const meta = readAllMetadata(cfg);
  const names = meta.map((m) => m.worktree);
  const ports = await listenPortTable();

  const agents = [];
  for (const m of meta) {
    const facts = await gitFactsForPath(m.path, cfg);
    const port = m.port;
    const pid = port && /^\d+$/.test(port) ? ports.get(String(port)) : null;
    agents.push({
      worktree: m.worktree,
      slot: m.slot,
      provider: m.provider,
      path: m.path,
      branch: facts.branch,
      branch_expected: m.branch_expected,
      git: facts.git,
      ahead_behind: facts.ahead_behind,
      sprint: m.sprint,
      lifecycle: m.lifecycle,
      agent_status: m.agent_status,
      server: pid ? "running" : "stopped",
      port: port || null,
    });
  }

  const details = new Map(
    meta.map((m) => [
      m.worktree,
      {
        worktree: m.worktree,
        role: m.role,
        agent_status: m.agent_status,
        lifecycle: m.lifecycle,
        created_at: m.created_at,
        opened_at: m.opened_at,
        closed_at: m.closed_at,
        session_id: m.session_id,
        pause_recorded_at: m.pause_recorded_at,
        finished_at: m.finished_at,
        sprint_name: m.sprint,
        sprint_objective: m.sprint_objective,
      },
    ]),
  );

  const manifests = readSprintManifests(cfg, names);
  const initiatives = readInitiatives(cfg);

  const evidence = new Map(names.map((n) => [n, evidenceCountFor(cfg, n)]));

  const here = opts.cwd || process.cwd();
  let toplevel = "";
  const topR = await run("git", ["--no-optional-locks", "-C", here, "rev-parse", "--show-toplevel"], { timeout: 3000 });
  if (topR.ok) toplevel = topR.stdout.trim();
  const cls = classifyRoot(toplevel, cfg.canonical_repo, cfg.worktree_root);
  let branch = "?", remote = "(no remote)";
  if (toplevel) {
    const br = await run("git", ["--no-optional-locks", "-C", toplevel, "rev-parse", "--abbrev-ref", "HEAD"], { timeout: 3000 });
    if (br.ok) branch = br.stdout.trim() || "?";
    const rem = await run("git", ["--no-optional-locks", "-C", toplevel, "remote", "get-url", cfg.base_remote], { timeout: 3000 });
    if (rem.ok) remote = rem.stdout.trim() || "(no remote)";
  }
  // Root ahead/behind is presentation-only for Vacilando project projection (unused for counts).
  // Skip a duplicate full-repo rev-list on the hot path — agents already carry per-slot A/B.
  const root = {
    root: here,
    class: cls.class,
    detail: cls.detail,
    sanctioned: cls.sanctioned,
    canonical: cfg.canonical_repo,
    repo: toplevel || "",
    branch,
    remote,
    ahead_behind: "?/?",
  };

  const paths = {
    config_file: cfg.config_file,
    runtime_root: cfg.runtime_root,
    metadata_dir: cfg.metadata_dir,
    pids_dir: cfg.pids_dir,
    logs_dir: cfg.logs_dir,
    locks_dir: cfg.locks_dir,
    auth_dir: cfg.auth_dir,
    evidence_dir: cfg.evidence_dir,
    initiatives_dir: cfg.initiatives_dir,
    runtime_root_exists: cfg.runtime_root_exists,
  };

  // Lightweight server list for resources (no git, no du).
  const servers = agents.map((a) => ({
    worktree: a.worktree,
    slot: Number(a.slot) || null,
    port: a.port,
    server: a.server,
    server_pid: a.port && ports.get(String(a.port)) ? ports.get(String(a.port)) : "",
  }));

  return {
    cfg,
    paths,
    agents: { ok: true, agents, error: null },
    root,
    initiatives,
    details,
    manifests,
    evidence,
    servers,
    generated_at_ms: Date.now(),
  };
}

/** Test/helper: clear in-process caches. */
export function clearWorkspaceFactCaches() {
  gitFactsCache.clear();
  portTableCache.at = 0;
  portTableCache.byPort = new Map();
}

export const WORKSPACE_FACT_TTLS = {
  git_facts_ms: GIT_FACTS_TTL_MS,
  port_table_ms: PORT_TABLE_TTL_MS,
};
