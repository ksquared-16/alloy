/**
 * May this process really mutate a remote right now?
 *
 * WHY THIS EXISTS, PLAINLY. On 2026-08-25 a verification of the governed
 * approval path merged PR #508 into staging for real. The run was "isolated" by
 * pointing ALLOY_RUNTIME_ROOT at a throwaway copy of the Gateway state — which
 * isolated every STORE the code writes and isolated nothing about the `gh`
 * subprocess at the end of it. State redirection is not a sandbox for an
 * outward-facing write.
 *
 * The guard began life inside the merge executor. It lives here now because
 * merging is not the only thing that leaves this machine: pushing a branch and
 * opening a pull request are both visible to everyone the moment they succeed,
 * and both are just as unrecoverable from a test harness. One guard, one place,
 * every remote mutation behind it.
 *
 * WHAT IT REQUIRES. A real remote mutation runs only from the Gateway's own
 * runtime root, and never from inside a test runner. An injected client is
 * exempt because it is by definition not the real one — that is the seam tests
 * are meant to use, and this guard exists to make forgetting it harmless rather
 * than expensive.
 */
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** The only runtime root a real remote mutation may be executed from. */
export function canonicalGatewayRuntimeRoot() {
  return join(homedir(), ".local", "state", "alloy-dev", "gateway");
}

function resolvedPath(p) {
  const raw = String(p || "").trim().replace(/\/+$/, "");
  if (!raw) return null;
  try { return realpathSync(raw); } catch { return raw; }
}

/**
 * `operation` only shapes the message. The decision is identical for every
 * remote mutation on purpose: a push that escapes a harness is no better than a
 * merge that does.
 */
export function liveRemoteMutationPermitted({
  env = process.env,
  injectedGh = false,
  operation = "remote mutation",
} = {}) {
  if (injectedGh) return { ok: true, simulated: true };
  if (env.NODE_TEST_CONTEXT) {
    return {
      ok: false,
      code: "live_remote_mutation_from_test_runner",
      detail: `A real ${operation} cannot be executed from the test runner. Inject a client instead.`,
    };
  }
  const root = resolvedPath(env.ALLOY_RUNTIME_ROOT);
  if (!root) {
    return {
      ok: false,
      code: "live_remote_mutation_requires_gateway_runtime_root",
      detail: "ALLOY_RUNTIME_ROOT is unset, so this process cannot show it is the Gateway.",
    };
  }
  const canonical = resolvedPath(canonicalGatewayRuntimeRoot());
  if (root !== canonical) {
    return {
      ok: false,
      code: "live_remote_mutation_outside_gateway_runtime_root",
      // The path is the operator's own home directory, not a credential.
      detail: `A real ${operation} may only run from the Gateway runtime root. This process is rooted at ${root}.`,
    };
  }
  return { ok: true };
}

/**
 * The merge path's original names, kept so its call sites and its guard suite
 * keep working unchanged. The codes it returns are the merge-specific ones the
 * existing tests assert on.
 */
export function liveMergePermitted({ env = process.env, injectedGh = false } = {}) {
  const out = liveRemoteMutationPermitted({ env, injectedGh, operation: "merge" });
  if (out.ok) return out;
  const code = {
    live_remote_mutation_from_test_runner: "live_merge_from_test_runner",
    live_remote_mutation_requires_gateway_runtime_root: "live_merge_requires_gateway_runtime_root",
    live_remote_mutation_outside_gateway_runtime_root: "live_merge_outside_gateway_runtime_root",
  }[out.code] || out.code;
  return { ...out, code };
}
