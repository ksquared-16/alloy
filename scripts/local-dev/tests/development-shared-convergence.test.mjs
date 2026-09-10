#!/usr/bin/env node
/**
 * SHARED CHANGE PROPAGATION, AND THE INSTALLED-NOT-RUNNING BLIND SPOT.
 *
 * The blind spot has cost Director intervention repeatedly: the symlink moves,
 * every surface says "installed", and the code that is actually executing is
 * the old one. Measured while writing these controls — promoted ccebf644dc3d,
 * installed ccebf644dc3d, running fd27ee82c3bf.
 */
import test from "node:test";
import assert from "node:assert/strict";

const C = await import("../lib/vacilando/shared-convergence.mjs");

const SHA_OLD = "fd27ee82c3bf";
const SHA_NEW = "ccebf644dc3d";
const PROMOTED = "ccebf644dc3d756a74ec0a0312f3545ea9a088c7";

await test("SC1 — every named shared capability is classified from a boundary", () => {
  const expected = [
    "gateway_toolkit", "scheduler", "operator_state_projection", "notifications",
    "provider_lifecycle", "browser_session_infra", "managed_slots", "tailnet_serve",
    "supabase_browser_transport", "provider_ceiling", "dev_server_env", "lane_metadata",
  ];
  assert.deepEqual(C.SHARED_CAPABILITIES.map((c) => c.id), expected, "all twelve, in the order asked for");
  const classes = new Set(Object.values(C.PROPAGATION));
  for (const cap of C.SHARED_CAPABILITIES) {
    assert.ok(classes.has(cap.propagation), `${cap.id} must carry exactly one propagation class`);
    // A classification nobody can re-derive is an opinion with a schema.
    assert.ok(cap.evidence && cap.evidence.length > 40, `${cap.id} must carry its evidence`);
    assert.ok(cap.owner, `${cap.id} must name the boundary that owns it`);
  }
});

await test("SC2 — the classifications match the boundaries actually measured", () => {
  const P = C.PROPAGATION;
  // Loaded into a process at start.
  for (const id of ["gateway_toolkit", "scheduler", "operator_state_projection", "notifications",
                    "browser_session_infra", "managed_slots", "tailnet_serve"]) {
    assert.equal(C.capability(id).propagation, P.GATEWAY_RESTART_REQUIRED, id);
  }
  // Read from durable state on each use.
  assert.equal(C.capability("provider_ceiling").propagation, P.LIVE_SHARED);
  assert.equal(C.capability("lane_metadata").propagation, P.LIVE_SHARED);
  // Carried by something other than the Gateway.
  assert.equal(C.capability("provider_lifecycle").propagation, P.PROVIDER_RESTART_REQUIRED);
  assert.equal(C.capability("dev_server_env").propagation, P.DEV_SERVER_RESTART_REQUIRED);
  assert.equal(C.capability("supabase_browser_transport").propagation, P.WORKTREE_CONVERGENCE_REQUIRED);
  // managed_slots is the one that needs the SUPERVISOR, not the child alone.
  assert.match(C.capability("managed_slots").restart_owner, /supervisor/);
});

await test("SC3 — a moved symlink is not convergence", () => {
  const v = C.runtimeConvergence({
    staging_sha: PROMOTED, installed_sha: SHA_NEW, gateway_executing_sha: SHA_OLD,
  });
  assert.equal(v.installed_is_promoted, true, "the install IS the promoted revision");
  assert.equal(v.running_is_installed, false);
  assert.equal(v.converged, false, "installed == promoted must not imply converged");
  assert.equal(v.restart_required, true);
  assert.equal(v.restart_owner, "gateway supervisor");
  assert.match(v.reason, /still executing fd27ee82c3bf/);
});

await test("SC4 — converged only when all three agree", () => {
  const v = C.runtimeConvergence({
    staging_sha: PROMOTED, installed_sha: SHA_NEW, gateway_executing_sha: SHA_NEW,
  });
  assert.equal(v.converged, true);
  assert.equal(v.restart_required, false);

  // Running matches installed, but the install is behind promoted: no restart
  // would help, so demanding one would be wrong.
  const behind = C.runtimeConvergence({
    staging_sha: PROMOTED, installed_sha: SHA_OLD, gateway_executing_sha: SHA_OLD,
  });
  assert.equal(behind.converged, false);
  assert.equal(behind.restart_required, false, "a restart cannot install a newer toolkit");
  assert.match(behind.reason, /behind promoted/);
});

await test("SC5 — an unpinned executing path is UNKNOWN, never converged", () => {
  const v = C.runtimeConvergence({
    staging_sha: PROMOTED, installed_sha: SHA_NEW, gateway_executing_sha: null,
  });
  assert.equal(v.running_is_installed, null);
  assert.equal(v.converged, false, "unknown must never read as converged");
  assert.equal(v.restart_required, null, "and must not be reported as a restart that would fix it");
  assert.equal(C.convergencePlan({ convergence: v }).action, "investigate");
});

await test("SC6 — safe convergence is automated only while nothing is executing", () => {
  const stale = C.runtimeConvergence({
    staging_sha: PROMOTED, installed_sha: SHA_NEW, gateway_executing_sha: SHA_OLD,
  });
  const idle = C.convergencePlan({ convergence: stale, busyLanes: 0 });
  assert.equal(idle.action, "restart");
  assert.equal(idle.automatic, true);
  assert.equal(idle.director_action_required, false, "an idle policy-covered restart is not an obligation");

  const busy = C.convergencePlan({ convergence: stale, busyLanes: 4 });
  assert.equal(busy.action, "defer");
  assert.equal(busy.automatic, false);
  assert.match(busy.reason, /interrupt productive work/);

  const uncovered = C.convergencePlan({ convergence: stale, busyLanes: 0, policyCoveredRestart: false });
  assert.equal(uncovered.action, "ask");
  assert.equal(uncovered.director_action_required, true);
});

await test("SC7 — a newer revision alone never pages the Director", () => {
  // The old process is still correct until something needs the new behaviour.
  const converged = C.runtimeConvergence({
    staging_sha: PROMOTED, installed_sha: SHA_NEW, gateway_executing_sha: SHA_NEW,
  });
  const plan = C.convergencePlan({ convergence: converged, busyLanes: 3 });
  assert.equal(plan.action, "none");
  assert.equal(plan.director_action_required, false);
});

// ── the per-lane projection ─────────────────────────────────────────────────

const LANE = {
  lane_id: "lane_x", name: "Backend",
  binding: { worktree_path: "/wt/wt5", worktree_name: "wt5", branch: "feat/x", tmux_session: "alloy-x" },
};

await test("SC8 — a stale gateway makes every lane's shared behaviour stale", () => {
  const runtime = C.runtimeConvergence({ staging_sha: PROMOTED, installed_sha: SHA_NEW, gateway_executing_sha: SHA_OLD });
  const idle = C.laneConvergence({ lane: LANE, runtime, runState: null });
  assert.equal(idle.restart_required, true);
  assert.equal(idle.restart_type, C.RESTART_TYPE.GATEWAY);
  assert.equal(idle.restart_owner, "gateway supervisor");
  assert.equal(idle.safe_to_restart, true, "idle: reconcilable now");
  assert.equal(idle.director_action_required, false, "safe and idle is automation, not an obligation");

  // A LANE RUNNING OLD-BUT-VALID CODE IS NOT AN OBLIGATION. This asserted the
  // opposite until the model was run against the real host: two lanes were
  // mid-run on the previous toolkit, working, and it demanded a person for both
  // while the host plan correctly said "defer". Staleness becomes an obligation
  // only when it blocks work or correctness, which this projection cannot see —
  // so it does not claim it, and the one host-level decision stays with
  // convergencePlan.
  const busy = C.laneConvergence({ lane: LANE, runtime, runState: "EXECUTING" });
  assert.equal(busy.safe_to_restart, false, "still not safe to restart under it");
  assert.equal(busy.director_action_required, false,
    "busy is a reason to defer, not a reason to page the Director");
});

await test("SC9 — freshness is never inferred, and UNKNOWN stays UNKNOWN", () => {
  const runtime = C.runtimeConvergence({ staging_sha: PROMOTED, installed_sha: SHA_NEW, gateway_executing_sha: SHA_NEW });
  // No provider/dev-server revision supplied: not measurable.
  const l = C.laneConvergence({ lane: LANE, runtime, providerState: "active", devServerState: "listening" });
  assert.equal(l.provider_current, null, "an unmeasured provider revision is not 'current'");
  assert.equal(l.dev_server_current, null);
  assert.equal(l.restart_required, false, "and an unknown revision is not a restart demand either");

  // Measured and matching is a positive answer, so SC9 cannot pass by the
  // field being permanently null.
  const measured = C.laneConvergence({ lane: LANE, runtime, providerRevision: SHA_NEW, devServerRevision: SHA_NEW });
  assert.equal(measured.provider_current, true);
  assert.equal(measured.dev_server_current, true);
});

await test("SC10 — a lane behind staging is reported, not demanded", () => {
  const runtime = C.runtimeConvergence({ staging_sha: PROMOTED, installed_sha: SHA_NEW, gateway_executing_sha: SHA_NEW });
  const l = C.laneConvergence({ lane: LANE, runtime, worktreeContainsPromoted: false, worktreeHeadSha: "abc123" });
  assert.equal(l.restart_type, C.RESTART_TYPE.WORKTREE);
  assert.equal(l.restart_required, false, "a lane on its own branch is work in progress, not a fault");
  assert.equal(l.director_action_required, false);
  assert.equal(l.worktree_revision, "abc123");
});
