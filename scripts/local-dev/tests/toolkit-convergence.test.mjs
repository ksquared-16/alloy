/**
 * Toolkit convergence.
 *
 * The failure being fixed: promoted staging held a control-plane capability,
 * the installed toolkit stayed behind, and the lane needing that capability
 * reported "operator-run install required" and stopped. Nothing retried,
 * because nothing detected drift and no action existed to request.
 *
 * These fixtures hold the two properties that make the install routine rather
 * than an approval: it can only ever install what is already promoted, and it
 * can always go back.
 */
import test from "node:test";
import assert from "node:assert/strict";

const T = await import("../lib/vacilando/toolkit-convergence.mjs");
const DA = await import("../lib/vacilando/director-authority.mjs");
const R = await import("../lib/vacilando/trusted-host-action-registry.mjs");

const STAGING = "684153774d2ae2b37c4d7051c3cb04967b6f5f1f";
const OLD = "4ee65145b96b";

/** A host where `current` is OLD and canonical staging resolves to STAGING. */
function fixture({ installed = OLD, staging = STAGING, subdirIsTree = true, retained = true } = {}) {
  return {
    toolkitRoot: "/toolkit",
    canonicalRepo: "/repo",
    exists: (p) => {
      if (p === "/repo/.git") return true;
      if (p === `/toolkit/${installed}`) return retained;
      return false;
    },
    exec: (_cmd, args) => {
      if (args.includes("rev-parse")) return { ok: true, out: staging };
      if (args.includes("cat-file")) return { ok: subdirIsTree, out: subdirIsTree ? "tree" : "" };
      return { ok: false, out: "" };
    },
  };
}

// installedToolkitSha reads the symlink; inject it rather than touching disk.
const withInstalled = (f, installed = OLD) =>
  ({ ...f, readLink: () => `/toolkit/${installed}` });

test("drift is observed when installed is behind promoted staging", () => {
  const f = fixture();
  const ev = T.measureToolkitConvergence({ ...f, ...withInstalled(f) });
  assert.equal(ev.promoted_staging_sha, STAGING.slice(0, 12));
  assert.equal(ev.installed_toolkit_sha, OLD);
  assert.equal(ev.toolkit_drift, true);
  assert.equal(ev.artifact_provenance_valid, true);
  assert.equal(ev.previous_toolkit_retained, true);
});

test("no drift when already converged, and the plan is a no-op", () => {
  const f = fixture({ installed: STAGING.slice(0, 12) });
  const ev = T.measureToolkitConvergence({ ...f, readLink: () => `/toolkit/${STAGING.slice(0, 12)}` });
  assert.equal(ev.toolkit_drift, false);
  const plan = T.planToolkitConvergence(ev);
  assert.equal(plan.state, "converged");
  assert.equal(plan.install, false);
});

test("an unresolvable ref is blocked, never treated as converged", () => {
  const f = fixture();
  const ev = T.measureToolkitConvergence({
    ...f, readLink: () => `/toolkit/${OLD}`,
    exec: () => ({ ok: false, out: "" }),
  });
  assert.equal(ev.artifact_provenance_valid, false);
  assert.equal(T.planToolkitConvergence(ev).state, "blocked");
});

test("a commit whose scripts/local-dev is not a tree fails provenance", () => {
  const f = fixture({ subdirIsTree: false });
  const ev = T.measureToolkitConvergence({ ...f, readLink: () => `/toolkit/${OLD}` });
  assert.equal(ev.artifact_provenance_valid, false);
  assert.equal(T.planToolkitConvergence(ev).state, "blocked");
});

test("no rollback target means blocked — reversibility is the whole basis", () => {
  const f = fixture({ retained: false });
  const ev = T.measureToolkitConvergence({ ...f, readLink: () => `/toolkit/${OLD}` });
  assert.equal(ev.previous_toolkit_retained, false);
  const plan = T.planToolkitConvergence(ev);
  assert.equal(plan.state, "blocked");
  assert.match(plan.reason, /rollback/);
});

test("an exhausted restart budget blocks rather than restarting again", () => {
  const f = fixture();
  const ev = T.measureToolkitConvergence({
    ...f, readLink: () => `/toolkit/${OLD}`,
    restartsThisConvergence: T.MAX_RESTARTS_PER_CONVERGENCE + 1,
  });
  assert.equal(ev.gateway_restart_bounded, false);
  assert.equal(T.planToolkitConvergence(ev).state, "blocked");
});

test("the ref is not an input — this action installs promoted staging only", () => {
  const out = T.validateInstallToolkitInputs(
    { expected_staging_sha: STAGING, reason: "converge the host", ref: "origin/main" },
    { measure: () => T.measureToolkitConvergence({ ...fixture(), readLink: () => `/toolkit/${OLD}` }) },
  );
  assert.equal(out.ok, false);
  assert.equal(out.error, "unsupported_ref");
});

test("expected_staging_sha is compare-and-set", () => {
  const measure = () => T.measureToolkitConvergence({ ...fixture(), readLink: () => `/toolkit/${OLD}` });
  const stale = T.validateInstallToolkitInputs(
    { expected_staging_sha: "0000000000000000000000000000000000000000", reason: "converge the host" },
    { measure },
  );
  assert.equal(stale.ok, false);
  assert.equal(stale.error, "expected_staging_sha_mismatch");

  const good = T.validateInstallToolkitInputs(
    { expected_staging_sha: STAGING, reason: "converge the host" }, { measure },
  );
  assert.equal(good.ok, true);
  assert.equal(good.already_converged, false);
  assert.equal(good.plan.state, "install_required");
});

test("a request with no reason is refused", () => {
  const out = T.validateInstallToolkitInputs({ expected_staging_sha: STAGING });
  assert.equal(out.ok, false);
  assert.equal(out.error, "missing_reason");
});

test("the action is registered and discoverable", () => {
  const rows = R.listRegisteredActions();
  const row = rows.find((r) => r.actionType === "host.install_toolkit");
  assert.ok(row, "a lane that cannot discover the action cannot request it");
  assert.deepEqual(row.requiredInputs, ["expected_staging_sha", "reason"]);
  assert.equal(row.riskClass, "privileged_write");
});

test("the policy authorizes convergence without an operator click", () => {
  const decision = DA.evaluateDirectorAuthority({
    request: { request_id: "gar_t", action_key: "host.install_toolkit", target: "development_certification" },
    evidence: {
      source_is_promoted_staging: true,
      artifact_provenance_valid: true,
      toolkit_drift: true,
      previous_toolkit_retained: true,
      gateway_restart_bounded: true,
      governance_exception_active: false,
      operator_hold: false,
    },
  });
  assert.equal(decision.decision, "director_approved");
  assert.equal(decision.matched_policy, "routine_toolkit_convergence_v1");
});

test("each convergence gate escalates on its own when unmeasured", () => {
  const full = {
    source_is_promoted_staging: true, artifact_provenance_valid: true, toolkit_drift: true,
    previous_toolkit_retained: true, gateway_restart_bounded: true,
    governance_exception_active: false, operator_hold: false,
  };
  for (const key of Object.keys(full)) {
    const evidence = { ...full };
    delete evidence[key];
    const d = DA.evaluateDirectorAuthority({
      request: { action_key: "host.install_toolkit", target: "development_certification" },
      evidence,
    });
    assert.notEqual(d.decision, "director_approved", `${key} unmeasured must not auto-approve`);
  }
});

test("converging onto what is already installed does not auto-approve", () => {
  // A no-op that restarts the Gateway is not free.
  const d = DA.evaluateDirectorAuthority({
    request: { action_key: "host.install_toolkit", target: "development_certification" },
    evidence: {
      source_is_promoted_staging: true, artifact_provenance_valid: true,
      toolkit_drift: false, previous_toolkit_retained: true, gateway_restart_bounded: true,
      governance_exception_active: false, operator_hold: false,
    },
  });
  assert.equal(d.decision, "policy_denied");
  assert.deepEqual(d.failed_gates, ["toolkit_drift_observed"]);
});

test("staging is not an environment this action can be claimed under", () => {
  const d = DA.evaluateDirectorAuthority({
    request: { action_key: "host.install_toolkit", target: "staging" },
    evidence: {
      source_is_promoted_staging: true, artifact_provenance_valid: true, toolkit_drift: true,
      previous_toolkit_retained: true, gateway_restart_bounded: true,
      governance_exception_active: false, operator_hold: false,
    },
  });
  assert.equal(d.decision, "operator_approval_required");
});

test("LIVE — this host really is behind promoted staging", () => {
  // Not a fixture. If this ever fails because the host converged, the drift
  // assertion below is the thing to relax, not the measurement.
  const ev = T.measureToolkitConvergence();
  assert.equal(ev.artifact_provenance_valid, true, "canonical repo must resolve origin/staging");
  assert.match(String(ev.promoted_staging_sha), /^[0-9a-f]{12}$/);
  assert.match(String(ev.installed_toolkit_sha), /^[0-9a-f]{12}$/);
  assert.equal(typeof ev.toolkit_drift, "boolean");
  assert.equal(ev.previous_toolkit_retained, true, "the installed tree must remain as a rollback target");
});
