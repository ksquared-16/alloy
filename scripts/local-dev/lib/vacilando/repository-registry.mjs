/**
 * Repository Registry — the canonical owner of repositories Vacilando can execute in.
 *
 * WHY THIS EXISTS. Every path in Vacilando assumed one repository: /Users/Kelly/Alloy,
 * worktrees under ~/Code/alloy-worktrees, a base of origin/staging, six sprint
 * slots, and Alloy's own validation tooling. The single hard chokepoint was
 * startPersistentAgentSession, which refuses any provider working directory
 * outside the one Alloy worktree root. That check is correct as a containment
 * boundary and wrong as a definition of "managed" — so the registry becomes the
 * authority for what "managed" means, and the check consults it instead of a
 * constant.
 *
 * WHAT A REPOSITORY IS. An execution and security boundary: a canonical root, a
 * Git common directory, a base branch, a worktree parent, and a profile that
 * says which conventions apply. It is NOT a folder. Folders organise lanes for
 * the eye; a repository decides where a provider is allowed to run. Moving a
 * lane between folders is presentation. Moving it between repositories is an
 * execution rebind and does not happen by reorganising a list.
 *
 * IDENTITY IS GIT'S, NOT THE NAME'S. Two registrations of the same repository
 * under different display names or different symlinked paths are the same
 * repository, and a Git WORKTREE of a repository is not a second repository —
 * it reports its parent's common directory, which is exactly how we tell them
 * apart. Registering a worktree as its own repository would let two "different"
 * repositories write to one Git object store.
 */
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export const REPOSITORY_SCHEMA = "vacilando.repository.v1";
export const REPOSITORY_NAME_MAX = 80;
export const ALLOY_REPOSITORY_ID = "repo_alloy";

/**
 * Profiles. A profile is the set of conventions a repository actually has —
 * never a set of conditionals sprinkled through the codebase.
 *
 * The generic profile assumes nothing: no staging, no alloy-root, no sprint
 * slots, no fixed ports, no validation commands, no governed promotion. A
 * repository with none of that must still work completely.
 */
export const REPOSITORY_PROFILES = Object.freeze({
  generic: {
    id: "generic",
    label: "Git repository",
    slots: false,               // no fixed slot placement
    governed_promotion: false,  // no push/merge automation of any kind
    sprint_tooling: false,      // no alloy-sprint-* lifecycle
    fixed_ports: false,
    // Instruction files a provider should be told about if present. Discovery
    // is READ-ONLY: nothing here is ever executed.
    instruction_files: ["AGENTS.md", "CLAUDE.md", ".cursorrules"],
    branch_policy: { style: "free", prefix: "" },
  },
  alloy: {
    id: "alloy",
    label: "Alloy managed sprint",
    slots: true,
    governed_promotion: true,
    sprint_tooling: true,
    fixed_ports: true,
    instruction_files: ["CLAUDE.md", "AGENTS.md"],
    branch_policy: { style: "agent", prefix: "agent/" },
  },
});

export function profileFor(id) {
  return REPOSITORY_PROFILES[String(id || "generic")] || REPOSITORY_PROFILES.generic;
}

function runtimeRoot() {
  return process.env.ALLOY_RUNTIME_ROOT?.trim()
    || join(homedir(), ".local", "state", "alloy-dev");
}

export function repositoryStorePath(root = runtimeRoot()) {
  return join(root, "vacilando", "repositories.json");
}

function iso(ms) { return new Date(ms ?? Date.now()).toISOString(); }

function atomicWrite(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

function emptyStore() {
  return { schema_version: REPOSITORY_SCHEMA, repositories: {} };
}

export function readRepositoryStore(root = runtimeRoot()) {
  try {
    const raw = JSON.parse(readFileSync(repositoryStorePath(root), "utf8"));
    if (!raw || typeof raw !== "object") return emptyStore();
    return {
      schema_version: REPOSITORY_SCHEMA,
      repositories: raw.repositories && typeof raw.repositories === "object" ? raw.repositories : {},
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store, root) {
  atomicWrite(repositoryStorePath(root), store);
  return store;
}

// ---------------------------------------------------------------- containment

/**
 * Roots a repository or worktree is allowed to live under.
 *
 * This is the containment boundary: nothing outside it can be registered, and
 * no provider can be started outside a registered repository's worktree parent.
 * The browser never supplies this list.
 */
export function approvedRoots() {
  const extra = String(process.env.VACILANDO_REPOSITORY_ROOTS || "")
    .split(":").map((s) => s.trim()).filter(Boolean);
  return [
    join(homedir(), "Alloy"),
    join(homedir(), "Code"),
    join(homedir(), "Projects"),
    join(homedir(), "src"),
    ...extra,
  ].map((p) => p.replace(/\/+$/, ""));
}

/**
 * Resolve a path to its real location and prove it is inside an approved root.
 *
 * realpath is the point: a symlink from an approved root to /etc would
 * otherwise pass a prefix test while resolving somewhere else entirely. The
 * check is done on the RESOLVED path, and with a separator so that
 * "/Users/Kelly/Codex" cannot pass as being inside "/Users/Kelly/Code".
 */
export function containPath(input, { roots = approvedRoots() } = {}) {
  const raw = String(input || "").trim();
  if (!raw) return { ok: false, error: "path_required" };
  if (!isAbsolute(raw)) return { ok: false, error: "path_must_be_absolute" };
  if (/[\u0000-\u001f]/.test(raw)) return { ok: false, error: "path_refused" };
  let real;
  try {
    real = realpathSync(resolve(raw));
  } catch {
    return { ok: false, error: "path_not_found" };
  }
  for (const root of roots) {
    let realRoot;
    try { realRoot = realpathSync(root); } catch { continue; }
    if (real === realRoot || real.startsWith(realRoot + sep)) {
      return { ok: true, path: real, root: realRoot };
    }
  }
  return { ok: false, error: "path_outside_approved_roots", roots };
}

// ------------------------------------------------------------------- identity

/**
 * Normalise a remote so the same repository is recognised across its forms.
 *
 * git@github.com:org/repo.git, https://github.com/org/repo.git and
 * ssh://git@github.com/org/repo all name one repository; without normalisation
 * they register as three.
 */
export function normalizeRemote(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;
  let s = raw.replace(/\.git$/i, "");
  const scp = s.match(/^([^@/]+)@([^:]+):(.+)$/);         // git@host:path
  if (scp) s = `${scp[2]}/${scp[3]}`;
  else s = s.replace(/^[a-z+]+:\/\//i, "").replace(/^[^@/]+@/, "");
  return s.replace(/\/+$/, "").toLowerCase();
}

/** A stable id derived from Git's own identity, not from a name or a path. */
export function repositoryFingerprint(gitCommonDir) {
  return createHash("sha256").update(String(gitCommonDir || ""), "utf8").digest("hex").slice(0, 16);
}

/**
 * Ask Git what this path actually is.
 *
 * `--git-common-dir` is the load-bearing answer: for a primary checkout it is
 * that checkout's own .git, and for a WORKTREE it is the PARENT's .git. That
 * single difference is how a worktree is prevented from registering as a
 * separate repository sharing another's object store.
 */
export async function inspectGitPath(path, { git = null } = {}) {
  const exec = git || ((args, cwd) => run("git", args, { cwd, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 }));
  const at = String(path);
  const one = async (args) => {
    try { const { stdout } = await exec(args, at); return String(stdout).trim(); }
    catch { return null; }
  };
  const inside = await one(["rev-parse", "--is-inside-work-tree"]);
  if (inside !== "true") return { ok: false, error: "not_a_git_repository" };
  const toplevel = await one(["rev-parse", "--show-toplevel"]);
  const commonDir = await one(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const gitDir = await one(["rev-parse", "--path-format=absolute", "--git-dir"]);
  if (!toplevel || !commonDir) return { ok: false, error: "git_identity_unavailable" };
  let realCommon = commonDir;
  let realTop = toplevel;
  try { realCommon = realpathSync(commonDir); } catch { /* keep as reported */ }
  try { realTop = realpathSync(toplevel); } catch { /* keep as reported */ }
  // A linked worktree's git-dir sits inside the parent's common dir; a primary
  // checkout's git-dir IS the common dir.
  const isWorktree = Boolean(gitDir && commonDir && gitDir !== commonDir);
  const branch = await one(["rev-parse", "--abbrev-ref", "HEAD"]);
  const remote = await one(["remote", "get-url", "origin"]);
  // The parent checkout of a linked worktree: the common dir's own directory.
  const parentRoot = realCommon.endsWith(`${sep}.git`) ? dirname(realCommon) : null;
  return {
    ok: true,
    root: realTop,
    git_common_dir: realCommon,
    git_dir: gitDir,
    is_worktree: isWorktree,
    parent_root: isWorktree ? parentRoot : realTop,
    branch: branch && branch !== "HEAD" ? branch : null,
    remote: remote || null,
    remote_normalized: normalizeRemote(remote),
  };
}

/** Resolve the default branch without assuming it is called staging or main. */
export async function detectDefaultBranch(path, { git = null } = {}) {
  const exec = git || ((args, cwd) => run("git", args, { cwd, timeout: 15_000 }));
  const one = async (args) => {
    try { const { stdout } = await exec(args, path); return String(stdout).trim(); }
    catch { return null; }
  };
  const head = await one(["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]);
  if (head) return head.replace(/^refs\/remotes\//, "");
  for (const candidate of ["main", "master", "develop", "trunk"]) {
    if (await one(["rev-parse", "--verify", "--quiet", `refs/heads/${candidate}`])) return candidate;
  }
  return (await one(["rev-parse", "--abbrev-ref", "HEAD"])) || null;
}

// --------------------------------------------------------------------- records

export function validateRepositoryName(raw) {
  const name = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "repository_name_empty" };
  if (name.length > REPOSITORY_NAME_MAX) return { ok: false, error: "repository_name_too_large" };
  if (/[\u0000-\u001f]/.test(name)) return { ok: false, error: "repository_name_invalid" };
  return { ok: true, name };
}

export function publicRepository(rec, { laneCount = 0 } = {}) {
  if (!rec) return null;
  const profile = profileFor(rec.profile);
  return {
    schema_version: REPOSITORY_SCHEMA,
    repository_id: rec.repository_id,
    name: rec.name,
    root: rec.root,
    git_common_dir: rec.git_common_dir,
    remote: rec.remote || null,
    remote_normalized: rec.remote_normalized || null,
    has_remote: Boolean(rec.remote),
    default_branch: rec.default_branch || null,
    worktree_parent: rec.worktree_parent,
    profile: profile.id,
    profile_label: profile.label,
    // The UI uses these to decide which Alloy-only concepts to show at all.
    supports_slots: profile.slots,
    supports_governed_promotion: profile.governed_promotion,
    branch_policy: rec.branch_policy || profile.branch_policy,
    validation_commands: rec.validation_commands || [],
    instruction_files: profile.instruction_files,
    state: rec.state,
    validation: rec.validation || null,
    created_at: rec.created_at,
    updated_at: rec.updated_at,
    lane_count: laneCount,
  };
}

export function listRepositories({ includeRetired = false, root = runtimeRoot() } = {}) {
  return Object.values(readRepositoryStore(root).repositories)
    .filter((r) => includeRetired || r.state === "ACTIVE")
    .sort((a, b) => {
      // Alloy first: it is the incumbent and the operator's default.
      if (a.repository_id === ALLOY_REPOSITORY_ID) return -1;
      if (b.repository_id === ALLOY_REPOSITORY_ID) return 1;
      return String(a.name).localeCompare(String(b.name));
    })
    .map((r) => publicRepository(r));
}

export function getRepository(repositoryId, root = runtimeRoot()) {
  return readRepositoryStore(root).repositories[String(repositoryId || "")] || null;
}

export function findRepositoryByCommonDir(gitCommonDir, root = runtimeRoot()) {
  const want = String(gitCommonDir || "");
  if (!want) return null;
  return Object.values(readRepositoryStore(root).repositories)
    .find((r) => r.git_common_dir === want) || null;
}

/**
 * Which registered repository owns this path?
 *
 * Used before every provider start and every instruction delivery. It asks Git,
 * not the lane record — a stale binding must never be able to redirect
 * execution into another repository.
 */
export async function repositoryForPath(path, { root = runtimeRoot(), git = null } = {}) {
  const contained = containPath(path);
  if (!contained.ok) return { ok: false, error: contained.error };
  const info = await inspectGitPath(contained.path, { git });
  if (!info.ok) return { ok: false, error: info.error };
  const rec = findRepositoryByCommonDir(info.git_common_dir, root);
  if (!rec) return { ok: false, error: "repository_not_registered", git_common_dir: info.git_common_dir };
  return { ok: true, repository: rec, git: info };
}

/**
 * Register a local repository.
 *
 * Fails closed on: a path outside approved roots, a non-repository, a linked
 * worktree (with the parent named so the operator can register that instead),
 * and a repository already registered under any name or path.
 */
export async function registerLocalRepository({
  path,
  name = null,
  profile = "generic",
  defaultBranch = null,
  worktreeParent = null,
  validationCommands = null,
  nowMs = Date.now(),
  root = runtimeRoot(),
  git = null,
} = {}) {
  const contained = containPath(path);
  if (!contained.ok) return { ok: false, error: contained.error, roots: contained.roots };

  const info = await inspectGitPath(contained.path, { git });
  if (!info.ok) return { ok: false, error: info.error, path: contained.path };

  if (info.is_worktree) {
    // A worktree shares its parent's object store. Registering it separately
    // would give two "repositories" write access to one Git database.
    return {
      ok: false,
      error: "path_is_worktree",
      parent_root: info.parent_root,
      git_common_dir: info.git_common_dir,
      hint: "connect_as_lane",
    };
  }

  const existing = findRepositoryByCommonDir(info.git_common_dir, root);
  if (existing) {
    return { ok: false, error: "repository_already_registered", repository: publicRepository(existing) };
  }

  const named = validateRepositoryName(name || info.root.split(sep).pop());
  if (!named.ok) return named;

  const base = defaultBranch || await detectDefaultBranch(info.root, { git });
  const prof = profileFor(profile);

  // Default worktree parent sits beside the repository, never inside it: a
  // worktree created inside its own repository pollutes that repository's
  // status and can be committed by accident.
  let parent = worktreeParent
    ? String(worktreeParent).replace(/\/+$/, "")
    : join(dirname(info.root), `${info.root.split(sep).pop()}-worktrees`);
  const parentContained = containPath(existsSync(parent) ? parent : dirname(parent));
  if (!parentContained.ok) {
    return { ok: false, error: "worktree_parent_outside_approved_roots", worktree_parent: parent };
  }
  if (parent.startsWith(info.root + sep)) {
    return { ok: false, error: "worktree_parent_inside_repository", worktree_parent: parent };
  }

  const rec = {
    schema_version: REPOSITORY_SCHEMA,
    repository_id: `repo_${repositoryFingerprint(info.git_common_dir)}`,
    name: named.name,
    root: info.root,
    git_common_dir: info.git_common_dir,
    remote: info.remote || null,
    remote_normalized: info.remote_normalized || null,
    default_branch: base || null,
    worktree_parent: parent,
    profile: prof.id,
    branch_policy: prof.branch_policy,
    // Lifecycle commands come from a trusted profile/local boundary only. The
    // API refuses this field from a browser body; see the route.
    validation_commands: Array.isArray(validationCommands) ? validationCommands.slice(0, 8) : [],
    state: "ACTIVE",
    validation: { ok: true, checked_at: iso(nowMs), reason: null },
    created_at: iso(nowMs),
    updated_at: iso(nowMs),
  };

  const store = readRepositoryStore(root);
  store.repositories[rec.repository_id] = rec;
  writeStore(store, root);
  return { ok: true, repository: publicRepository(rec), git: info };
}

/** Re-check a registered repository against the filesystem and Git. */
export async function validateRepository(repositoryId, { nowMs = Date.now(), root = runtimeRoot(), git = null } = {}) {
  const store = readRepositoryStore(root);
  const rec = store.repositories[String(repositoryId || "")];
  if (!rec) return { ok: false, error: "repository_not_found" };
  let result;
  if (!existsSync(rec.root)) {
    result = { ok: false, checked_at: iso(nowMs), reason: "root_missing" };
  } else {
    const info = await inspectGitPath(rec.root, { git });
    if (!info.ok) result = { ok: false, checked_at: iso(nowMs), reason: info.error };
    else if (info.git_common_dir !== rec.git_common_dir) {
      // The path now resolves to a DIFFERENT repository. Never silently adopt it.
      result = { ok: false, checked_at: iso(nowMs), reason: "git_identity_changed" };
    } else {
      result = { ok: true, checked_at: iso(nowMs), reason: null };
      rec.default_branch = rec.default_branch || info.branch;
      rec.remote = info.remote || rec.remote;
      rec.remote_normalized = info.remote_normalized || rec.remote_normalized;
    }
  }
  rec.validation = result;
  rec.updated_at = iso(nowMs);
  writeStore(store, root);
  return { ok: true, repository: publicRepository(rec), validation: result };
}

export function updateRepository(repositoryId, patch = {}, { nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const store = readRepositoryStore(root);
  const rec = store.repositories[String(repositoryId || "")];
  if (!rec) return { ok: false, error: "repository_not_found" };
  if (patch.name != null) {
    const named = validateRepositoryName(patch.name);
    if (!named.ok) return named;
    rec.name = named.name;
  }
  if (patch.default_branch != null) {
    const b = String(patch.default_branch).trim();
    if (!/^[A-Za-z0-9._\/-]{1,120}$/.test(b)) return { ok: false, error: "invalid_branch" };
    rec.default_branch = b;
  }
  if (patch.worktree_parent != null) {
    const p = String(patch.worktree_parent).replace(/\/+$/, "");
    const contained = containPath(existsSync(p) ? p : dirname(p));
    if (!contained.ok) return { ok: false, error: "worktree_parent_outside_approved_roots" };
    if (p.startsWith(rec.root + sep)) return { ok: false, error: "worktree_parent_inside_repository" };
    rec.worktree_parent = p;
  }
  rec.updated_at = iso(nowMs);
  writeStore(store, root);
  return { ok: true, repository: publicRepository(rec) };
}

/**
 * Retire a repository. Disconnect, never delete.
 *
 * Nothing on disk is touched: not the repository, not its worktrees, not its
 * branches. Lanes keep their history and their attribution. Active work blocks
 * the retirement rather than being torn down under the operator.
 */
export function retireRepository(repositoryId, { activeLaneIds = [], nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const store = readRepositoryStore(root);
  const rec = store.repositories[String(repositoryId || "")];
  if (!rec) return { ok: false, error: "repository_not_found" };
  if (activeLaneIds.length) {
    return { ok: false, error: "repository_has_active_work", active_lanes: activeLaneIds };
  }
  rec.state = "RETIRED";
  rec.retired_at = iso(nowMs);
  rec.updated_at = iso(nowMs);
  writeStore(store, root);
  return {
    ok: true,
    repository: publicRepository(rec),
    // Say plainly what did NOT happen, so "disconnect" is never read as delete.
    preserved: ["repository on disk", "worktrees", "branches", "lane history", "run history"],
  };
}

export function reactivateRepository(repositoryId, { nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const store = readRepositoryStore(root);
  const rec = store.repositories[String(repositoryId || "")];
  if (!rec) return { ok: false, error: "repository_not_found" };
  rec.state = "ACTIVE";
  delete rec.retired_at;
  rec.updated_at = iso(nowMs);
  writeStore(store, root);
  return { ok: true, repository: publicRepository(rec) };
}

/**
 * Is this path inside a registered, active repository's worktree parent?
 *
 * This replaces the constant that gated every provider start to one Alloy root.
 * The containment property is unchanged — a provider still cannot start in an
 * arbitrary directory — but "managed" now means "belongs to a repository the
 * operator registered" instead of "under ~/Code/alloy-worktrees".
 */
export function managedWorktreePath(path, { root = runtimeRoot() } = {}) {
  const raw = String(path || "").replace(/\/+$/, "");
  if (!raw) return { ok: false, error: "path_required" };
  let real = raw;
  try { real = realpathSync(raw); } catch { /* compare the literal path */ }
  for (const rec of Object.values(readRepositoryStore(root).repositories)) {
    if (rec.state !== "ACTIVE") continue;
    for (const base of [rec.worktree_parent, rec.root]) {
      if (!base) continue;
      let realBase = base;
      try { realBase = realpathSync(base); } catch { /* may not exist yet */ }
      if (real === realBase || real.startsWith(realBase + sep)) {
        return { ok: true, repository_id: rec.repository_id, repository: rec, path: real };
      }
    }
  }
  // A worktree the operator CONNECTED may legitimately live outside the
  // repository's default worktree parent — they made it before Vacilando knew
  // about the repository. Connect and start must agree, so a path a lane of an
  // active repository is actually bound to counts as managed too. Without this,
  // connecting succeeded and then starting the provider refused the same path.
  try {
    const lanes = boundLanePaths(root);
    const hit = lanes.get(real);
    if (hit) {
      const rec = readRepositoryStore(root).repositories[hit];
      if (rec && rec.state === "ACTIVE") {
        return { ok: true, repository_id: rec.repository_id, repository: rec, path: real, via: "lane_binding" };
      }
    }
  } catch { /* the parent-directory rule above is the primary boundary */ }
  return { ok: false, error: "worktree_not_managed", path: real };
}

/** Worktree path -> owning repository id, from durable lane bindings. */
function boundLanePaths(root) {
  const map = new Map();
  try {
    const storePath = join(root, "vacilando", "lanes", "lanes.json");
    const raw = JSON.parse(readFileSync(storePath, "utf8"));
    for (const lane of Object.values(raw?.lanes || {})) {
      const p = lane?.binding?.worktree_path;
      if (!p || !lane.repository_id) continue;
      let real = p;
      try { real = realpathSync(p); } catch { /* compare literally */ }
      map.set(real, lane.repository_id);
    }
  } catch { /* no lane store yet */ }
  return map;
}

/**
 * Seed the Alloy repository from its real runtime configuration.
 *
 * Idempotent: an existing record is left alone. Alloy's behaviour becomes a
 * PROFILE on this record rather than the global default it used to be.
 */
export async function ensureAlloyRepository({
  cfg = null,
  nowMs = Date.now(),
  root = runtimeRoot(),
  git = null,
  persist = true,
} = {}) {
  const store = readRepositoryStore(root);
  const existing = store.repositories[ALLOY_REPOSITORY_ID];
  if (existing) return { ok: true, created: false, repository: publicRepository(existing) };

  let config = cfg;
  if (!config) {
    try {
      const { resolveRuntimeConfig } = await import("./workspace-facts.mjs");
      config = resolveRuntimeConfig();
    } catch { config = {}; }
  }
  const alloyRoot = config.canonical_repo || join(homedir(), "Alloy");
  if (!existsSync(alloyRoot)) {
    return { ok: false, error: "alloy_root_missing", root: alloyRoot };
  }
  const info = await inspectGitPath(alloyRoot, { git });
  if (!info.ok) return { ok: false, error: info.error, root: alloyRoot };

  const rec = {
    schema_version: REPOSITORY_SCHEMA,
    // A fixed id, not a fingerprint: existing lanes migrate onto this exact
    // value and it must be stable across machines and re-clones.
    repository_id: ALLOY_REPOSITORY_ID,
    name: "Alloy",
    root: info.root,
    git_common_dir: info.git_common_dir,
    remote: info.remote || null,
    remote_normalized: info.remote_normalized || null,
    default_branch: config.base_ref || config.base_branch || "origin/staging",
    worktree_parent: String(config.worktree_root || join(homedir(), "Code", "alloy-worktrees")).replace(/\/+$/, ""),
    profile: "alloy",
    branch_policy: REPOSITORY_PROFILES.alloy.branch_policy,
    validation_commands: [],
    state: "ACTIVE",
    validation: { ok: true, checked_at: iso(nowMs), reason: null },
    created_at: iso(nowMs),
    updated_at: iso(nowMs),
  };
  // A dry run must not leave a record behind. Seeding the registry as a side
  // effect of *inspecting* it is exactly the kind of write a dry run promises
  // not to make.
  if (!persist) return { ok: true, created: false, would_create: true, repository: publicRepository(rec) };
  store.repositories[rec.repository_id] = rec;
  writeStore(store, root);
  return { ok: true, created: true, repository: publicRepository(rec) };
}

export function resetRepositoriesForTests(root = runtimeRoot()) {
  writeStore(emptyStore(), root);
}

/** Bounded metadata for logs. Never a remote with credentials in it. */
export function repositoryLogFields(rec) {
  if (!rec) return null;
  return {
    repository_id: rec.repository_id,
    profile: rec.profile,
    state: rec.state,
    has_remote: Boolean(rec.remote),
  };
}

export function directoryExists(path) {
  try { return statSync(path).isDirectory(); } catch { return false; }
}
