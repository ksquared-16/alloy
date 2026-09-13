/**
 * RUN A REGISTERED RECONCILIATION — and nothing else.
 *
 * The executor resolves everything that could be dangerous from the REGISTRY, never from the
 * request. The action's inputs are a key, an environment name and a boolean; by the time execution
 * begins, the npm script and the environment it runs under have already been decided by
 * `reconciliation-registry.mjs`. There is no code path here that can be handed a command.
 *
 * ── WHY THE ENVIRONMENT IS RE-RESOLVED RATHER THAN CARRIED ──
 *
 * `validateInputs` normalised the runner env, but this re-reads the registry entry before spawning.
 * A stored action record is a file, and a file is a thing that can be edited between authorization
 * and execution. Re-resolving from the frozen table means an edited record cannot change what runs —
 * it can only fail to resolve.
 *
 * ── WHY DRY RUN IS NOT A FLAG THIS CODE INTERPRETS ──
 *
 * The registry states the env for each mode. This executor does not decide what "dry run" means, so
 * it cannot get it wrong: it selects one of two declared environments. The script's own DRY_RUN
 * default remains the last line of defence beneath that.
 */

import { spawnSync } from "node:child_process";
import { join } from "node:path";

import {
  REGISTERED_RECONCILIATIONS,
  RECONCILIATION_REFUSALS,
  resolveReconciliationRequest,
} from "./reconciliation-registry.mjs";

/** Parse whatever structured counts the runner printed, without inventing any. */
/** A canonical organization id. Anything else is ambiguity, and ambiguity is refused. */
const ORG_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Best-effort provenance. A checkout that cannot answer is reported as null, never guessed. */
function gitValue(args, cwd) {
  try {
    const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 15_000 });
    return r.status === 0 ? String(r.stdout || "").trim() || null : null;
  } catch { return null; }
}

export function parseReconciliationOutput(stdout) {
  const text = String(stdout ?? "");
  // Runners emit a single JSON object on a line of their own; anything else is human narration.
  for (const line of text.split("\n").map((l) => l.trim()).reverse()) {
    if (!line.startsWith("{") || !line.endsWith("}")) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch { /* keep looking */ }
  }
  return null;
}

/**
 * Execute one registered reconciliation.
 *
 * Dependency-injected spawn and env resolution so the refusals can be proven without running
 * anything — a capability whose safety rests on "we never reach the spawn" must be testable at
 * exactly that boundary.
 */
export function runRegisteredReconciliation(inputs = {}, deps = {}) {
  const resolved = resolveReconciliationRequest(inputs);
  if (!resolved.ok) return { ok: false, error: resolved.code, detail: resolved.detail ?? null };

  // Re-resolved from the frozen table, not carried from the request or the stored record.
  const entry = REGISTERED_RECONCILIATIONS[resolved.normalized.reconciliation_key];
  if (!entry) return { ok: false, error: "unregistered_reconciliation_key" };

  const runnerEnv = { ...(resolved.normalized.dry_run ? entry.dry_run_env : entry.apply_env) };
  const repoRoot = deps.repoRoot ?? process.env.VACILANDO_CHECKOUT ?? process.cwd();
  const spawn = deps.spawn ?? spawnSync;
  const workingDirectory = join(repoRoot, "web");

  /*
   * REQUIRED CONTEXT, RESOLVED HERE AND REFUSED BEFORE THE SPAWN.
   *
   * converge_placement_waitlisted_children needs ORG_ID and the request has
   * nowhere to put one. Until now nothing supplied it, so the capability was
   * registered, reachable, approvable and could not succeed for anyone: the
   * script exited "ORG_ID is required." before doing anything.
   *
   * The value comes from the trusted environment the control plane already
   * hands the child, never from the caller. Absent or malformed refuses HERE
   * rather than becoming a runner failure, because "nobody configured the
   * staging org" and "the reconciliation ran and failed" need different people.
   */
  const context = {};
  for (const [runnerVar, sourceVar] of Object.entries(entry.required_context ?? {})) {
    const trusted = deps.trustedEnv ?? {};
    const value = String(trusted[sourceVar] ?? process.env[sourceVar] ?? "").trim();
    const where = { repo_root: repoRoot, working_directory: workingDirectory, runner: entry.runner };
    if (!value) {
      return { ok: false, error: RECONCILIATION_REFUSALS.CONTEXT_UNRESOLVED,
        detail: entry.key + " requires " + runnerVar + ", resolved from " + sourceVar + ", which is not set in the trusted environment.",
        provenance: where };
    }
    if (runnerVar === "ORG_ID" && !ORG_LIKE.test(value)) {
      return { ok: false, error: RECONCILIATION_REFUSALS.CONTEXT_INVALID,
        detail: sourceVar + " is not a canonical UUID, so " + runnerVar + " cannot be resolved. Ambiguity is refused rather than guessed.",
        provenance: where };
    }
    // Registry-resolved, and written last so nothing a request carried shadows it.
    runnerEnv[runnerVar] = value;
    context[runnerVar] = value;
  }

  const provenance = {
    repo_root: repoRoot,
    repo_head: gitValue(["rev-parse", "HEAD"], repoRoot),
    repo_branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot),
    working_directory: workingDirectory,
    runner: entry.runner,
    target_environment: resolved.normalized.target_environment,
    dry_run: resolved.normalized.dry_run,
    resolved_context: Object.keys(context),
  };

  const child = spawn("npm", ["run", "--silent", entry.runner], {
    cwd: workingDirectory,
    env: {
      ...process.env,
      // The trusted target's credentials, supplied by the control plane. The caller never names them.
      ...(deps.trustedEnv ?? {}),
      ...runnerEnv,
    },
    timeout: deps.timeoutMs ?? 540_000,
    encoding: "utf8",
  });

  const stdout = String(child.stdout ?? "");
  const stderr = String(child.stderr ?? "");
  const exitCode = typeof child.status === "number" ? child.status : -1;

  /*
   * A SPAWN THAT NEVER RAN IS NOT A RECONCILIATION THAT FAILED.
   *
   * child.error was ignored entirely. If the working directory does not exist
   * — what a mis-resolved repo root produces — spawnSync returns no status and
   * no streams, and the old code reported an empty detail that fell through to
   * a generic sentence. An operator then cannot tell "the script said no" from
   * "the script was never started".
   */
  if (child.error) {
    return { ok: false, error: RECONCILIATION_REFUSALS.RUNNER_NOT_STARTED,
      detail: "the runner could not be started in " + workingDirectory + ": " + String(child.error?.message || child.error).slice(0, 240),
      exit_code: exitCode, dry_run: resolved.normalized.dry_run, provenance };
  }

  if (exitCode !== 0) {
    // BOTH streams. `stderr || stdout` discarded a script that reported its
    // refusal on stdout whenever stderr held anything at all — a dotenv banner
    // was enough to hide the actual reason.
    const said = [stderr.trim(), stdout.trim()].filter(Boolean).join(String.fromCharCode(10)).slice(-2000);
    return {
      ok: false,
      error: "reconciliation_failed",
      detail: said || ("the runner exited " + exitCode + " without output; see provenance for the checkout it ran from"),
      exit_code: exitCode,
      dry_run: resolved.normalized.dry_run,
      provenance,
    };
  }

  return {
    ok: true,
    reconciliation_key: entry.key,
    target_environment: resolved.normalized.target_environment,
    dry_run: resolved.normalized.dry_run,
    exit_code: exitCode,
    provenance,
    counts: parseReconciliationOutput(stdout),
    stdout_tail: stdout.slice(-4000),
  };
}
