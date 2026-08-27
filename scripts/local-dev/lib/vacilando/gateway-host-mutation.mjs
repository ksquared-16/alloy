/**
 * Exclusive ownership for SHARED HOST Gateway mutation.
 *
 * Two lanes each ran `install-vacilando-gateway.sh` against the same machine and
 * silently undid one another: one installed the Gateway from the canonical
 * toolkit, the other rewrote the launchd plist back to a sprint worktree minutes
 * later. Nothing was corrupt, and nothing warned — the change simply vanished,
 * and the next reboot would have served the worktree copy.
 *
 * This is a narrow governor invariant, not a scheduler. It reuses the ordinary
 * resource request/queue/grant path: `gateway_host_mutation` is a queueable
 * EXCLUSIVE_NAMED resource with capacity 1, so `tryGrantHead` already refuses a
 * second grant while one is held, and `cleanupRunResources` already releases it
 * when the owning run reaches a terminal state — including ABANDONED. There is
 * deliberately no second lock, no new store, and no new lifecycle.
 *
 * Protected operations: Gateway installation/reinstallation, launchd plist
 * mutation, Gateway service deployment/rebinding, and Tailscale Serve mutation
 * where Vacilando governs it.
 */
import {
  activeRequestForRunResource,
  ensureResourceRequest,
  readResourceRequestStore,
  releaseResourceRequest,
} from "./execution-resource.mjs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Same resolution the resource governor uses; kept local, not re-exported. */
function runtimeRoot() {
  return process.env.ALLOY_RUNTIME_ROOT?.trim()
    || join(homedir(), ".local", "state", "alloy-dev");
}

export const GATEWAY_HOST_MUTATION_RESOURCE = "gateway_host_mutation";

/**
 * The current holder, if any. Reported so ownership is visible and auditable
 * rather than inferred from a failure.
 */
export function gatewayHostMutationHolder(root = runtimeRoot()) {
  const store = readResourceRequestStore(root);
  const held = (store.requests || []).find(
    (r) => r.resource_key === GATEWAY_HOST_MUTATION_RESOURCE && r.state === "GRANTED",
  );
  if (!held) return null;
  return {
    request_id: held.request_id,
    run_id: held.run_id,
    lane_id: held.lane_id,
    granted_at: held.granted_at,
    reason: held.reason || null,
  };
}

/**
 * Acquire the right to mutate shared Gateway host configuration.
 *
 * Returns `{ok:true, granted:true}` only when this run holds it. A competing
 * lane gets `{ok:true, granted:false, state:"QUEUED"}` and must WAIT — it must
 * not proceed to mutate the host.
 */
export function acquireGatewayHostMutation({
  runId,
  laneId,
  reason = null,
  origin = "agent",
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  const out = ensureResourceRequest({
    runId,
    laneId,
    resourceKey: GATEWAY_HOST_MUTATION_RESOURCE,
    reason,
    origin,
    nowMs,
    root,
  });
  if (!out.ok) return out;
  const rec = activeRequestForRunResource(runId, GATEWAY_HOST_MUTATION_RESOURCE, root) || out.request;
  const granted = rec.state === "GRANTED";
  return {
    ok: true,
    granted,
    state: rec.state,
    request: rec,
    holder: granted ? null : gatewayHostMutationHolder(root),
  };
}

export function releaseGatewayHostMutation({
  runId,
  requestId = null,
  origin = "agent",
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  const id = requestId
    || activeRequestForRunResource(runId, GATEWAY_HOST_MUTATION_RESOURCE, root)?.request_id;
  if (!id) return { ok: false, error: "no_active_request" };
  return releaseResourceRequest(id, { origin, nowMs, root, expectedRunId: runId || null });
}

/**
 * Fail-closed check for callers that are not themselves an Execution Run — the
 * installer shell script in particular. It never grants anything; it answers
 * only "may this run touch the host right now?".
 *
 * An unowned host is permitted: this guards against a CONCURRENT owner, not
 * against operating the machine by hand.
 */
export function assertGatewayHostMutationAllowed({ runId = null, root = runtimeRoot() } = {}) {
  const holder = gatewayHostMutationHolder(root);
  if (!holder) return { ok: true, holder: null };
  if (runId && holder.run_id === runId) return { ok: true, holder };
  return {
    ok: false,
    error: "gateway_host_mutation_held",
    holder,
    detail:
      `Gateway host mutation is held by run ${holder.run_id} (lane ${holder.lane_id})`
      + ` since ${holder.granted_at}. Wait for release rather than overwriting shared host state.`,
  };
}

// ---------------------------------------------------------------------------
// CLI: used by install-vacilando-gateway.sh as a fail-closed preflight.
//   node gateway-host-mutation.mjs check [--run <run_id>]
// Exit 0 = may proceed. Exit 3 = another lane holds the host.
// ---------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const cmd = argv[0] || "check";
  const runId = argv.includes("--run") ? argv[argv.indexOf("--run") + 1] : (process.env.VACILANDO_RUN_ID || null);
  if (cmd === "holder") {
    const h = gatewayHostMutationHolder();
    process.stdout.write(h ? `${h.run_id} ${h.lane_id} ${h.granted_at}\n` : "none\n");
    process.exit(0);
  }
  const out = assertGatewayHostMutationAllowed({ runId });
  if (out.ok) {
    process.stdout.write(out.holder ? "gateway host mutation: held by this run\n" : "gateway host mutation: free\n");
    process.exit(0);
  }
  process.stderr.write(`REFUSED: ${out.detail}\n`);
  process.exit(3);
}
