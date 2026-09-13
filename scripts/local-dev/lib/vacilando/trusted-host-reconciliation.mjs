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
  resolveReconciliationRequest,
} from "./reconciliation-registry.mjs";

/** Parse whatever structured counts the runner printed, without inventing any. */
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

  const runnerEnv = resolved.normalized.dry_run ? entry.dry_run_env : entry.apply_env;
  const repoRoot = deps.repoRoot ?? process.env.VACILANDO_CHECKOUT ?? process.cwd();
  const spawn = deps.spawn ?? spawnSync;

  const child = spawn("npm", ["run", "--silent", entry.runner], {
    cwd: join(repoRoot, "web"),
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
  if (exitCode !== 0) {
    return {
      ok: false,
      error: "reconciliation_failed",
      detail: (stderr || stdout).slice(-2000),
      exit_code: exitCode,
      dry_run: resolved.normalized.dry_run,
    };
  }

  return {
    ok: true,
    reconciliation_key: entry.key,
    target_environment: resolved.normalized.target_environment,
    dry_run: resolved.normalized.dry_run,
    exit_code: exitCode,
    counts: parseReconciliationOutput(stdout),
    stdout_tail: stdout.slice(-4000),
  };
}
