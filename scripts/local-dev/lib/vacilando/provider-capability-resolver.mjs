/**
 * Second-stage resolution: what is the provider actually trying to DO?
 *
 * Decision Delivery V1 correctly refuses to auto-answer a privileged provider
 * prompt. It then stops, leaving the operator holding a surfaced prompt rather
 * than a decision. That is safe and incomplete: a provider prompt is EVIDENCE
 * that the provider is attempting an action, never the governance object
 * itself. If the attempted action is a capability Vacilando already governs,
 * the prompt must become that capability's canonical request.
 *
 * WHAT THIS REFUSES TO DO. It does not rename an unknown prompt into a known
 * capability because the words look similar. Resolution is structural — the
 * command must actually be the operation, and every canonical input must be
 * independently resolvable — or the answer is `still_unknown`.
 *
 * THE FALSE-STATE RULE. A migration request is never filed unless the migration
 * content exists at a canonical, resolvable repository SHA. Filing one that
 * cannot execute produces an approval the operator can grant and the executor
 * can only fail, which this system has already been burned by once.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

export const CAPABILITY_RESOLUTION_SCHEMA = "vacilando.provider_capability_resolution.v1";

/** The three outcomes of second-stage resolution. */
export const RESOLUTIONS = Object.freeze([
  "registered_governed_capability",
  "unsupported_privileged_action",
  "still_unknown",
]);

/**
 * Who legitimately performs a resolved capability.
 *
 * `trusted_executor` means the provider's raw command must NEVER be approved —
 * the capability has its own executor and answering "yes" would run the
 * privileged operation outside governance while a governed record claims to own
 * it. `provider_local` exists only for capabilities that explicitly declare the
 * managed provider as the legitimate executor; nothing does today.
 */
export const EXECUTOR_MODES = Object.freeze(["trusted_executor", "provider_local"]);

/**
 * Structural signatures. Each must positively identify the OPERATION, not merely
 * mention a noun. Deliberately narrow: a near miss must resolve to unknown.
 */
const SIGNATURES = Object.freeze([
  {
    capability: "database.apply_migration",
    executor: "trusted_executor",
    // psql (directly or through docker exec) fed a file under the canonical
    // migrations directory. The migration path is the load-bearing evidence.
    match(command) {
      if (!/\bpsql\b/.test(command)) return null;
      const file = command.match(/(supabase\/migrations\/(\d{14})_[A-Za-z0-9._-]+\.sql)/);
      if (!file) return null;
      return { migrationPath: file[1], version: file[2] };
    },
  },
  {
    capability: "repository.push",
    executor: "trusted_executor",
    match(command) {
      const m = command.match(/\bgit\s+push\b[^\n]*/);
      return m ? { detail: m[0] } : null;
    },
  },
  {
    capability: "repository.merge_pull_request",
    executor: "trusted_executor",
    match(command) {
      const m = command.match(/\bgh\s+pr\s+merge\s+(\d+)/);
      return m ? { pullRequestNumber: Number(m[1]) } : null;
    },
  },
  {
    capability: "repository.delete_remote_branch",
    executor: "trusted_executor",
    match(command) {
      const m = command.match(/\bgit\s+push\s+(?:--delete|-d)\s+\S+\s+(\S+)/);
      return m ? { branch: m[1] } : null;
    },
  },
]);

/** Local Supabase/docker stacks map to the certification environment, not staging. */
const ENVIRONMENT_HINTS = Object.freeze([
  { re: /supabase_db_alloy-cert|alloy-cert/, environment: "certification" },
  { re: /\bproduction\b|prod\b/, environment: "production" },
  { re: /\bstaging\b/, environment: "staging" },
]);

export function resolveEnvironment(command, { fallback = null } = {}) {
  for (const h of ENVIRONMENT_HINTS) if (h.re.test(String(command))) return h.environment;
  return fallback;
}

const git = (args, cwd) => {
  try { return execFileSync("git", args, { cwd, encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return null; }
};
const gitOk = (args, cwd) => {
  try { execFileSync("git", args, { cwd, timeout: 20000, stdio: "ignore" }); return true; } catch { return false; }
};

/**
 * Find a canonical SHA at which this migration content actually exists.
 *
 * Prefers the canonical branch, then sanctioned remote-tracking refs — the same
 * set the certification reachability gate admits. A worktree-local commit is
 * NEVER acceptable: content only this checkout has cannot be executed by a
 * trusted host that does not share the checkout.
 */
export function resolveCanonicalSha({
  migrationPath, repoRoot, canonicalRef = "origin/staging",
  sanctionedGlobs = ["refs/remotes/origin/agent/**", "refs/remotes/origin/promotion/**"],
} = {}) {
  if (!migrationPath || !repoRoot) return null;
  if (gitOk(["cat-file", "-e", `${canonicalRef}:${migrationPath}`], repoRoot)) {
    const sha = git(["rev-parse", canonicalRef], repoRoot);
    if (sha) return { sha, ref: canonicalRef, reachability: "canonical_branch" };
  }
  const listed = git(["for-each-ref", "--format=%(refname)", ...sanctionedGlobs], repoRoot);
  for (const ref of String(listed || "").split("\n").filter(Boolean)) {
    if (!ref.startsWith("refs/remotes/")) continue;
    if (ref.endsWith("/HEAD")) continue;
    if (!gitOk(["cat-file", "-e", `${ref}:${migrationPath}`], repoRoot)) continue;
    const sha = git(["rev-parse", ref], repoRoot);
    if (sha) return { sha, ref, reachability: "sanctioned_remote_ref" };
  }
  return null;
}

/**
 * Resolve a provider command into a governed capability request.
 *
 * Returns the resolution, and — only for `registered_governed_capability` — the
 * canonical inputs the registered action requires. Anything it cannot resolve
 * independently is a refusal, not a default.
 */
export function resolveProviderCapability({
  command = null,
  repository = null,
  repoRoot = null,
  registeredCapabilities = [],
  canonicalRef = "origin/staging",
} = {}) {
  const cmd = String(command || "").trim();
  if (!cmd) return { schema_version: CAPABILITY_RESOLUTION_SCHEMA, resolution: "still_unknown", reason: "no command to resolve" };

  const hit = SIGNATURES.map((s) => ({ s, m: s.match(cmd) })).find((x) => x.m);
  if (!hit) {
    return { schema_version: CAPABILITY_RESOLUTION_SCHEMA, resolution: "still_unknown",
      reason: "the command does not structurally match any registered governed capability" };
  }

  const capability = hit.s.capability;
  if (registeredCapabilities.length && !registeredCapabilities.includes(capability)) {
    return { schema_version: CAPABILITY_RESOLUTION_SCHEMA, resolution: "unsupported_privileged_action",
      capability, reason: `${capability} is not registered on this host` };
  }

  const base = {
    schema_version: CAPABILITY_RESOLUTION_SCHEMA,
    capability,
    executor_mode: hit.s.executor,
    matched: hit.m,
  };

  if (capability !== "database.apply_migration") {
    // Structurally recognised, but this slice only builds canonical inputs for
    // migrations. Reporting it honestly beats filing a request we cannot fill.
    return { ...base, resolution: "unsupported_privileged_action",
      reason: `${capability} is recognised but this bridge does not yet construct its canonical inputs` };
  }

  const environment = resolveEnvironment(cmd);
  if (!environment) {
    return { ...base, resolution: "still_unknown", reason: "the target environment could not be resolved from the command" };
  }

  const canonical = resolveCanonicalSha({ migrationPath: hit.m.migrationPath, repoRoot, canonicalRef });
  if (!canonical) {
    // THE FALSE-STATE RULE. No executable request without resolvable content.
    return {
      ...base,
      resolution: "registered_governed_capability",
      executable: false,
      blocked_reason: "migration_content_not_at_canonical_sha",
      environment,
      migration_path: hit.m.migrationPath,
      version: hit.m.version,
      reason: `${hit.m.migrationPath} does not exist at ${canonicalRef} or any sanctioned remote ref; promote the content first`,
      prerequisite: "Promote the migration content to a canonical SHA",
    };
  }

  return {
    ...base,
    resolution: "registered_governed_capability",
    executable: true,
    environment,
    migration_path: hit.m.migrationPath,
    version: hit.m.version,
    canonical_sha: canonical.sha,
    canonical_ref: canonical.ref,
    reachability: canonical.reachability,
    canonical_inputs: {
      environment,
      expectedSha: canonical.sha,
      migrations: [{ version: hit.m.version, path: hit.m.migrationPath }],
      repository: repository || null,
    },
    content_fingerprint: createHash("sha256").update(JSON.stringify({
      capability, environment, sha: canonical.sha, path: hit.m.migrationPath, version: hit.m.version,
    })).digest("hex").slice(0, 32),
    reason: `psql applying ${hit.m.migrationPath}, which exists at ${canonical.ref}`,
  };
}

/**
 * Who runs it.
 *
 * A capability with a trusted executor is NEVER answered affirmatively at the
 * provider. Approving the raw `docker exec … psql` would run the privileged
 * operation outside governance while a governed record claimed to own it —
 * two executors for one action, which is worse than either alone.
 */
export function selectExecutor(resolution) {
  if (!resolution || resolution.resolution !== "registered_governed_capability") {
    return { mode: null, may_answer_provider: false, reason: "no registered capability resolved" };
  }
  if (resolution.executor_mode === "provider_local") {
    return { mode: "provider_local", may_answer_provider: true,
      reason: "the capability explicitly declares the managed provider as its executor" };
  }
  return {
    mode: "trusted_executor",
    may_answer_provider: false,
    reason: "a trusted executor owns this capability; the provider's raw command must never be approved",
  };
}
