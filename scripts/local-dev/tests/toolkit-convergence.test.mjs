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
import { readFileSync } from "node:fs";

const T = await import("../lib/vacilando/toolkit-convergence.mjs");
const DA = await import("../lib/vacilando/director-authority.mjs");
const R = await import("../lib/vacilando/trusted-host-action-registry.mjs");

const STAGING = "684153774d2ae2b37c4d7051c3cb04967b6f5f1f";
const OLD = "4ee65145b96b";

/** A host where `current` is OLD and canonical staging resolves to STAGING. */
function fixture({
  installed = OLD, staging = STAGING, subdirIsTree = true, retained = true,
  // What the local remote-tracking ref says BEFORE the gate refreshes it.
  // Defaults to already-current so existing fixtures are unaffected.
  cached = null, fetchOk = true, resolvable = true,
} = {}) {
  // The refresh is what moves the cache to the remote's value, so the fixture
  // has to model order: a rev-parse before the fetch sees the stale cache.
  let fetched = false;
  const calls = [];
  return {
    toolkitRoot: "/toolkit",
    canonicalRepo: "/repo",
    calls,
    exists: (p) => {
      if (p === "/repo/.git") return true;
      if (p === `/toolkit/${installed}`) return retained;
      return false;
    },
    exec: (_cmd, args) => {
      calls.push(args);
      if (args.includes("fetch")) {
        if (!fetchOk) return { ok: false, out: "", err: "could not read from remote repository" };
        fetched = true;
        return { ok: true, out: "" };
      }
      if (args.includes("rev-parse")) {
        if (!resolvable) return { ok: false, out: "" };
        return { ok: true, out: fetched ? staging : (cached ?? staging) };
      }
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
  // The refresh succeeds; the ref still will not resolve. Distinct from a
  // refresh that failed, and both must block.
  const f = fixture({ resolvable: false });
  const ev = T.measureToolkitConvergence({ ...f, readLink: () => `/toolkit/${OLD}` });
  assert.equal(ev.artifact_provenance_valid, false);
  assert.equal(ev.ref_freshness, "UNRESOLVABLE_AFTER_REFRESH");
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

/* ── Part 3: drift must be observable without terminal archaeology ───────── */

const owner = (path) => () => ({ pid: 1176, argv: ["/usr/bin/node", path, "--port", "3030"] });

test("a sha-pinned gateway path is read as pinned", () => {
  const gw = T.observeGatewayExecution({
    readOwner: owner("/Users/x/.local/share/alloy/toolkit/4ee65145b96b/lib/vacilando-server.mjs"),
  });
  assert.equal(gw.executing_sha, "4ee65145b96b");
  assert.equal(gw.path_is_pinned, true);
  assert.equal(gw.resolves_through_current, false);
});

test("a path through `current` is UNPINNED — it says where to look, not what is loaded", () => {
  const gw = T.observeGatewayExecution({
    readOwner: owner("/Users/x/.local/share/alloy/toolkit/current/lib/vacilando-gateway-host.mjs"),
  });
  assert.equal(gw.executing_sha, null);
  assert.equal(gw.path_is_pinned, false);
  assert.equal(gw.resolves_through_current, true);
});

test("installed-but-not-running is its own state, never 'converged'", () => {
  // The exact hazard: the symlink was flipped, the process was not restarted.
  const st = T.convergenceStatus({
    ...fixture({ installed: STAGING.slice(0, 12) }),
    readLink: () => `/toolkit/${STAGING.slice(0, 12)}`,
    readOwner: owner(`/Users/x/.local/share/alloy/toolkit/${OLD}/lib/vacilando-server.mjs`),
  });
  assert.equal(st.drifted, false, "the install itself did land");
  assert.equal(st.gateway_matches_installed, false);
  assert.equal(st.converged, false, "a flipped symlink is not a converged host");
  assert.match(st.headline, /GATEWAY BEHIND INSTALL/);
});

test("a gateway behind the install says so in STATE, not only in the headline", () => {
  // The defect this pins: `state` was `plan.state` verbatim, and `plan` answers only
  // "is the installed toolkit the promoted one?". So this exact host reported
  // `state: "converged"` beside `converged: false` and a GATEWAY BEHIND INSTALL headline —
  // two fields disagreeing, with the misleading one being the short field callers key on.
  // A governed action was promoted, installed, filed, and failed `action_unavailable`
  // while `state` said converged the whole way.
  const st = T.convergenceStatus({
    ...fixture({ installed: STAGING.slice(0, 12) }),
    readLink: () => `/toolkit/${STAGING.slice(0, 12)}`,
    readOwner: owner(`/Users/x/.local/share/alloy/toolkit/${OLD}/lib/vacilando-server.mjs`),
  });
  assert.equal(st.state, "gateway_restart_required");
  assert.notEqual(st.state, "converged", "state must never read converged while the gateway is behind");
  assert.match(st.reason, /code installed is not code running/);
  // The two fields must agree, which is the general form of the bug.
  assert.equal(st.converged, st.state === "converged");
});

test("an unpinned gateway leaves convergence UNVERIFIED, never ok", () => {
  const st = T.convergenceStatus({
    ...fixture({ installed: STAGING.slice(0, 12) }),
    readLink: () => `/toolkit/${STAGING.slice(0, 12)}`,
    readOwner: owner("/Users/x/.local/share/alloy/toolkit/current/lib/vacilando-gateway-host.mjs"),
  });
  assert.equal(st.gateway_matches_installed, null);
  assert.equal(st.converged, false);
  assert.match(st.headline, /TOOLKIT UNVERIFIED/);
});

test("LIVE — this host reports drift in one line", () => {
  const st = T.convergenceStatus({
    ownerPath: "/Users/vacilando/.local/state/alloy-dev/gateway/vacilando/control-plane-owner.json",
  });
  assert.match(st.headline, /^(TOOLKIT DRIFT|CONVERGED|GATEWAY BEHIND INSTALL|TOOLKIT UNVERIFIED)/);
  assert.equal(typeof st.staging_sha, "string");
  assert.equal(typeof st.installed_sha, "string");
});

/* ── Part 5: convergence fails closed ────────────────────────────────────── */

const okStatus = {
  installed_sha: "684153774d2a", gateway_executing_sha: "684153774d2a",
  gateway_matches_installed: true, gateway_path_is_pinned: true,
};

test("a fully verified convergence is the only thing called converged", () => {
  const v = T.verifyConvergenceOutcome({
    expectedSha: "684153774d2a", status: okStatus, loopbackHealth: 200, directorHealth: 200,
  });
  assert.equal(v.verified, true);
  assert.equal(v.outcome, "converged");
  assert.equal(v.rollback_recommended, false);
});

test("an install that landed the wrong sha is not converged", () => {
  const v = T.verifyConvergenceOutcome({
    expectedSha: "684153774d2a",
    status: { ...okStatus, installed_sha: OLD, gateway_executing_sha: OLD },
    loopbackHealth: 200, directorHealth: 200,
  });
  assert.equal(v.verified, false);
  assert.ok(v.reasons.some((r) => r.includes("not the expected")));
});

test("unmeasured health is not healthy, and does NOT trigger rollback", () => {
  const v = T.verifyConvergenceOutcome({ expectedSha: "684153774d2a", status: okStatus });
  assert.equal(v.verified, false);
  assert.equal(v.outcome, "unverified");
  // Rolling back a possibly-fine toolkit on no evidence is its own outage.
  assert.equal(v.rollback_recommended, false);
});

test("an OBSERVED health failure recommends rollback", () => {
  const v = T.verifyConvergenceOutcome({
    expectedSha: "684153774d2a", status: okStatus, loopbackHealth: 503, directorHealth: 200,
  });
  assert.equal(v.verified, false);
  assert.equal(v.outcome, "failed_health");
  assert.equal(v.rollback_recommended, true);
});

test("an unreadable status can never verify", () => {
  const v = T.verifyConvergenceOutcome({ expectedSha: "684153774d2a", status: null, loopbackHealth: 200, directorHealth: 200 });
  assert.equal(v.verified, false);
  assert.ok(v.reasons.some((r) => r.includes("unreadable")));
});

test("the convergence gates are actually COLLECTED, not merely named", async () => {
  // The third occurrence of one defect in this subsystem: merge, then the
  // provider ceiling, then this. A policy names the right gates, no collector
  // fills them, and every request escalates with "required gates were not
  // measured" — which reads like caution and is really an absent function call.
  const E = await import("../lib/vacilando/director-evidence.mjs");
  const src = readFileSync(new URL("../lib/vacilando/director-evidence.mjs", import.meta.url), "utf8");
  assert.match(src, /measureToolkitConvergence/,
    "director-evidence must collect convergence evidence, or every install escalates");
  assert.match(src, /rec\?\.action_key === "host\.install_toolkit"/);
  assert.equal(typeof E.collectDirectorEvidence, "function");
});

test("measured convergence evidence satisfies every gate the policy names", async () => {
  const DA2 = await import("../lib/vacilando/director-authority.mjs");
  const policy = DA2.DELEGATED_POLICIES_V1.find((p) => p.policy_id === "routine_toolkit_convergence_v1");
  const ev = T.measureToolkitConvergence({
    ...fixture(), readLink: () => `/toolkit/${OLD}`,
  });
  const decision = DA2.evaluateDirectorAuthority({
    request: { action_key: "host.install_toolkit", target: "development_certification" },
    evidence: { ...ev, governance_exception_active: false, operator_hold: false },
  });
  assert.equal(decision.decision, "director_approved",
    `unmeasured: ${JSON.stringify(decision.unmeasured_gates || [])}`);
  // Every gate the policy names must have been filled by the collector.
  for (const gate of policy.gates) {
    assert.notEqual(decision.deterministic_evidence[gate], null, `${gate} was not measured`);
  }
});

/*
 * A SAFETY GATE THAT DEPENDS ON REMOTE TRUTH MUST REFRESH THAT TRUTH ITSELF.
 *
 * THE DEFECT, measured live. This module resolved `origin/staging` in the
 * canonical repository with a bare `rev-parse` and never refreshed it. A
 * remote-tracking ref is a cache. Nothing here kept it current, so the gate
 * compared a freshly promoted SHA against whatever that cache happened to hold
 * — which depended on whether some unrelated person or process had run
 * `git fetch` recently.
 *
 * PR #735 merged to staging as 0305688057fa and three install attempts were
 * refused with "request names 0305688057fa; promoted staging is d8d680f48cb4"
 * while the checkout's FETCH_HEAD sat an hour old. The audit log shows the same
 * failure pair a day earlier before a third attempt happened to succeed. That
 * is the tell: an install gate that works only when somebody else fetched
 * recently is not a gate, it is a coincidence.
 *
 * The safety comparison is NOT relaxed by any of this. A requested SHA must
 * still be provably promoted staging. What changed is where that truth comes
 * from.
 */

const NEWER = "0305688057fa2e70eb413e54da26026d2fd648fd";
const STALE = "d8d680f48cb457d344f337e30e8640be8e6e2b88";

test("A — a stale but resolvable ref is refreshed, and the gate sees the newer SHA", () => {
  // The regression case, reproduced exactly: the cache resolves fine and is
  // simply out of date. Nothing about it looks broken, which is why the old
  // code had no reason to distrust it.
  const f = fixture({ installed: OLD, staging: NEWER, cached: STALE });
  const ev = T.measureToolkitConvergence({ ...f, readLink: () => `/toolkit/${OLD}` });

  assert.equal(ev.promoted_staging_sha_cached, STALE.slice(0, 12), "the stale cache is recorded as evidence");
  assert.equal(ev.promoted_staging_sha, NEWER.slice(0, 12), "and the decision uses the refreshed value");
  assert.equal(ev.ref_freshness, "REFRESHED");
  assert.equal(ev.promoted_ref_fresh, true);
  assert.equal(ev.artifact_provenance_valid, true);
});

test("B — an already-current ref refreshes and behaves exactly as before", () => {
  const f = fixture({ installed: OLD, staging: NEWER, cached: NEWER });
  const ev = T.measureToolkitConvergence({ ...f, readLink: () => `/toolkit/${OLD}` });
  assert.equal(ev.ref_freshness, "REFRESHED");
  assert.equal(ev.promoted_staging_sha, NEWER.slice(0, 12));
  assert.equal(ev.artifact_provenance_valid, true);
  assert.equal(ev.toolkit_drift, true);
});

test("C — a failed refresh REFUSES rather than falling back to the cache", () => {
  /*
   * The heart of it. The cached ref is present, resolvable, and here even
   * happens to be correct — and it is still not allowed to confer install
   * authority. Trusting it whenever the network is down would reproduce the
   * defect silently, on the one path where being wrong matters most.
   */
  const f = fixture({ installed: OLD, staging: NEWER, cached: NEWER, fetchOk: false });
  const ev = T.measureToolkitConvergence({ ...f, readLink: () => `/toolkit/${OLD}` });

  assert.equal(ev.ref_freshness, "REFRESH_FAILED");
  assert.equal(ev.promoted_ref_fresh, false);
  assert.equal(ev.artifact_provenance_valid, false, "freshness unavailable means refuse");
  assert.equal(ev.promoted_staging_sha, null, "no promoted SHA is asserted from a stale cache");
  assert.equal(T.planToolkitConvergence(ev).state, "blocked");
  assert.match(ev.detail, /cannot refresh/);
});

test("D — a requested SHA that is not promoted is still refused after a good refresh", () => {
  // The freshness repair must not become a way to install something unpromoted.
  const f = fixture({ installed: OLD, staging: NEWER, cached: STALE });
  const ev = T.measureToolkitConvergence({ ...f, readLink: () => `/toolkit/${OLD}` });
  assert.equal(ev.promoted_staging_sha, NEWER.slice(0, 12));
  assert.notEqual(ev.promoted_staging_sha, STALE.slice(0, 12),
    "the superseded SHA is not promoted truth merely because it was cached");
  assert.equal(ev.source_is_promoted_staging, true, "the ref is still not caller-supplied");
});

test("E — refreshing never touches the working tree or the index", () => {
  const f = fixture({ installed: OLD, staging: NEWER, cached: STALE });
  T.measureToolkitConvergence({ ...f, readLink: () => `/toolkit/${OLD}` });
  const forbidden = /^(checkout|reset|merge|rebase|switch|pull|clean|stash|add|commit|update-index|update-ref)$/;
  for (const args of f.calls) {
    for (const a of args) {
      assert.ok(!forbidden.test(String(a)),
        `convergence must not run a working-tree command, saw: ${args.join(" ")}`);
    }
  }
});

test("F — the fetch is the narrowest one that answers the question", () => {
  const args = T.promotedRefFetchArgs({ canonicalRepo: "/repo", ref: "origin/staging" });
  assert.deepEqual(args, [
    "-C", "/repo", "fetch", "--no-tags", "--no-write-fetch-head",
    "origin", "+refs/heads/staging:refs/remotes/origin/staging",
  ]);
  // One branch into one tracking ref. A bare `fetch origin` would drag in every
  // branch on the remote, and --prune would delete refs another session is
  // using; neither is needed to learn what staging is.
  assert.ok(!args.includes("--prune"), "no broad ref mutation");
  assert.ok(!args.includes("--all"), "no other branches");
  assert.equal(T.promotedRefFetchArgs({ canonicalRepo: "/repo", ref: "nonsense" }), null,
    "a ref that is not <remote>/<branch> yields no command at all");
});

test("a malformed convergence ref is refused, not guessed at", () => {
  const f = fixture();
  const ev = T.measureToolkitConvergence({ ...f, ref: "nonsense", readLink: () => `/toolkit/${OLD}` });
  assert.equal(ev.ref_freshness, "REF_MALFORMED");
  assert.equal(ev.artifact_provenance_valid, false);
});
