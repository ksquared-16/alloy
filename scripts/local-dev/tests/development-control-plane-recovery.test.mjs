#!/usr/bin/env node
/**
 * Control-plane recovery — certification.
 *
 * The properties under test are mostly REFUSALS. Anyone can restart a service;
 * the hard part is not restarting it when the evidence does not support it, and
 * stopping when the theory has been disproven. So the cases that carry weight
 * here are: a single failed probe is not a wedged process, a healthy Gateway
 * behind a broken route is not restarted, and an exhausted class escalates
 * instead of trying a fourth time.
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
    ATTEMPT_CEILINGS,
    ATTEMPT_COOLDOWN_MS,
    FAILURE_CLASSES,
    RECOVERY_LEVELS,
    RECOVERY_POLICY,
    UNHEALTHY_CONFIRM_MS,
    classifyControlPlane,
    controlPlaneScoreboard,
    levelForClass,
    planRecovery,
    readEpisode,
    recordAttempt,
    recordVerification,
} from "../lib/vacilando/control-plane-recovery.mjs";

const NOW = Date.parse("2026-09-06T18:00:00.000Z");
const root = () => mkdtempSync(join(tmpdir(), "vac-cpr-"));

/** A fully healthy observation; individual cases spoil one signal at a time. */
const healthy = (over = {}) => ({
    now_ms: NOW, host_reachable: true, launchd_job_loaded: true, process_exists: true,
    loopback_healthy: true, director_route_healthy: true, toolkit_drift: false,
    tailscale_up: true, supervisor_healthy: true,
    installed_sha: "606e77d21552", running_sha: "606e77d21552", ...over,
});

/* ── classification ─────────────────────────────────────────────────────── */

test("a healthy control plane is L0 and asks for nothing", () => {
    const p = planRecovery(healthy(), { root: root(), nowMs: NOW });
    assert.equal(p.failure_class, "HEALTHY");
    assert.equal(p.level, RECOVERY_LEVELS.L0_NORMAL);
    assert.equal(p.action, null);
    assert.equal(p.escalate, false);
});

test("a dead process is PROCESS_DEAD and authorises exactly one owned restart", () => {
    const p = planRecovery(healthy({ process_exists: false, loopback_healthy: false }), { root: root(), nowMs: NOW });
    assert.equal(p.failure_class, "PROCESS_DEAD");
    assert.equal(p.level, RECOVERY_LEVELS.L2_BOUNDED_SERVICE_RECOVERY);
    assert.equal(p.action, "restart_owned_gateway");
    assert.match(p.blast_radius, /never another pid/);
});

test("ONE failed probe is not a wedged process", () => {
    // Slow bind and a genuinely stuck process look identical for one sample.
    // Restarting here is the reflex this model exists to prevent.
    const p = planRecovery(healthy({ loopback_healthy: false, unhealthy_since_ms: NOW - 5_000 }), { root: root(), nowMs: NOW });
    assert.equal(p.failure_class, "UNKNOWN");
    assert.equal(p.action, null, "no restart on a single failed probe");
});

test("sustained unhealthy IS distinguished from dead, and is restartable", () => {
    const p = planRecovery(
        healthy({ loopback_healthy: false, unhealthy_since_ms: NOW - UNHEALTHY_CONFIRM_MS - 1_000 }),
        { root: root(), nowMs: NOW });
    assert.equal(p.failure_class, "PROCESS_ALIVE_UNHEALTHY");
    assert.notEqual(p.failure_class, "PROCESS_DEAD", "the two must not collapse; launchd already covers dead");
    assert.equal(p.action, "restart_owned_gateway");
});

test("a healthy Gateway behind a broken route is NOT restarted", () => {
    // Restarting a working service to fix a network destroys the thing that works.
    const p = planRecovery(healthy({ director_route_healthy: false }), { root: root(), nowMs: NOW });
    assert.equal(p.failure_class, "SERVE_ROUTE_FAILURE");
    assert.equal(p.action, "reconcile_serve_mapping");
    assert.equal(p.level, RECOVERY_LEVELS.L1_LOCAL_RECONCILIATION);
    assert.match(RECOVERY_POLICY.SERVE_ROUTE_FAILURE.prohibited.join(" "), /restarting the Gateway/);
});

test("a down tailnet is never repaired autonomously", () => {
    // The tailnet may be the only channel back to the host.
    const p = planRecovery(healthy({ director_route_healthy: false, tailscale_up: false }), { root: root(), nowMs: NOW });
    assert.equal(p.failure_class, "TAILSCALE_FAILURE");
    assert.equal(p.action, null);
    assert.equal(p.level, RECOVERY_LEVELS.L4_REMOTE_DIRECTOR);
    assert.equal(ATTEMPT_CEILINGS.TAILSCALE_FAILURE, 0);
});

test("toolkit drift converges rather than restarts blindly", () => {
    const p = planRecovery(healthy({ toolkit_drift: true, running_sha: "old000000000" }), { root: root(), nowMs: NOW });
    assert.equal(p.failure_class, "TOOLKIT_DRIFT");
    assert.equal(p.action, "converge_toolkit_then_restart");
    assert.equal(p.level, RECOVERY_LEVELS.L3_TOOLKIT_CONVERGENCE);
    assert.match(p.verify.join(" "), /running argv names the installed sha/);
});

test("an unreachable host is L5 and names the physical action", () => {
    const s = controlPlaneScoreboard(healthy({ host_reachable: false }), { root: root(), nowMs: NOW });
    assert.equal(s.failure_class, "HOST_UNREACHABLE");
    assert.equal(s.recovery_level, RECOVERY_LEVELS.L5_PHYSICAL_ACCESS);
    assert.equal(s.director_action.physical, true);
    assert.match(s.director_action.what, /at the machine/);
});

/* ── UNKNOWN fails closed ───────────────────────────────────────────────── */

test("incomplete evidence is UNKNOWN and repairs nothing", () => {
    const p = planRecovery({ now_ms: NOW, host_reachable: true }, { root: root(), nowMs: NOW });
    assert.equal(p.failure_class, "UNKNOWN");
    assert.equal(p.action, null, "an unestablished diagnosis authorises no repair");
    assert.equal(p.escalate, true);
});

test("a blind process table is UNKNOWN, not PROCESS_DEAD", () => {
    // Absence of evidence is not evidence of absence — restarting on a failed
    // read would be a generic kill dressed as recovery.
    const c = classifyControlPlane({ now_ms: NOW, host_reachable: true, launchd_job_loaded: true, process_exists: null });
    assert.equal(c.failure_class, "UNKNOWN");
    assert.match(c.why, /cannot be distinguished from blindness/);
});

test("contradictory evidence still refuses to repair", () => {
    const p = planRecovery({ now_ms: NOW, host_reachable: true, launchd_job_loaded: false, process_exists: true,
        loopback_healthy: null, director_route_healthy: true }, { root: root(), nowMs: NOW });
    assert.equal(p.failure_class, "UNKNOWN");
    assert.equal(p.action, null);
});

test("a service that did not answer is measured false, never unmeasured", () => {
    // Found during live certification: curl exits non-zero on connection failure,
    // so a generic guard turned "the Gateway did not respond" into "loopback was
    // not measured". A SIGSTOPped Gateway then read as UNKNOWN rather than
    // PROCESS_ALIVE_UNHEALTHY — the model's own conflation, in its own observer.
    const measuredDown = classifyControlPlane(healthy({
        loopback_healthy: false, unhealthy_since_ms: NOW - UNHEALTHY_CONFIRM_MS - 1,
    }));
    assert.equal(measuredDown.failure_class, "PROCESS_ALIVE_UNHEALTHY");
    const unmeasured = classifyControlPlane(healthy({ loopback_healthy: null }));
    assert.equal(unmeasured.failure_class, "UNKNOWN", "genuinely unmeasured must still fail closed");
});

/* ── loop protection ────────────────────────────────────────────────────── */

test("attempts are bounded and exhaustion escalates rather than retrying", () => {
    const r = root();
    const obs = healthy({ process_exists: false, loopback_healthy: false });
    let plan = planRecovery(obs, { root: r, nowMs: NOW });
    let ep = plan.episode;
    const ceiling = ATTEMPT_CEILINGS.PROCESS_DEAD;
    for (let i = 0; i < ceiling; i++) {
        ep = recordAttempt(ep, { action: "restart_owned_gateway", nowMs: NOW + i * ATTEMPT_COOLDOWN_MS * 2, root: r });
        ep = recordVerification(ep, { ok: false, detail: "still dead", nowMs: NOW + i * ATTEMPT_COOLDOWN_MS * 2, root: r });
    }
    plan = planRecovery(obs, { root: r, nowMs: NOW + ceiling * ATTEMPT_COOLDOWN_MS * 2 });
    assert.equal(plan.action, null, "no attempt beyond the ceiling");
    assert.equal(plan.level, RECOVERY_LEVELS.L4_REMOTE_DIRECTOR);
    assert.equal(plan.escalate, true);
    assert.match(plan.reason, /authority exhausted/);
});

test("a rapid retry inside the cooldown is refused as a loop", () => {
    const r = root();
    const obs = healthy({ process_exists: false, loopback_healthy: false });
    const first = planRecovery(obs, { root: r, nowMs: NOW });
    recordAttempt(first.episode, { action: "restart_owned_gateway", nowMs: NOW, root: r });
    const again = planRecovery(obs, { root: r, nowMs: NOW + 10_000 });
    assert.equal(again.action, null);
    assert.equal(again.waiting, true);
    assert.match(again.reason, /would be a loop/);
});

test("episode memory survives the process it restarts", () => {
    // The decisive property: the Gateway is the thing being restarted, so an
    // in-memory counter would reset every iteration and each attempt would look
    // like a first attempt forever.
    const r = root();
    const obs = healthy({ process_exists: false, loopback_healthy: false });
    const plan = planRecovery(obs, { root: r, nowMs: NOW });
    recordAttempt(plan.episode, { action: "restart_owned_gateway", nowMs: NOW, root: r });
    // Simulate the restart: nothing in memory carries over.
    const after = readEpisode(r);
    assert.equal(after.ok, true);
    assert.equal(after.episode.attempts.length, 1, "the previous Gateway's attempt is remembered");
    const next = planRecovery(obs, { root: r, nowMs: NOW + ATTEMPT_COOLDOWN_MS * 2 });
    assert.equal(next.attempts_used, 1, "and counted against the ceiling");
});

test("unreadable recovery memory refuses to act", () => {
    const r = root();
    const obs = healthy({ process_exists: false, loopback_healthy: false });
    planRecovery(obs, { root: r, nowMs: NOW });
    const { recoveryEpisodePath } = { recoveryEpisodePath: (x) => join(x, "vacilando", "control-plane-recovery", "episode.json") };
    recordAttempt({ schema_version: "x", failure_class: "PROCESS_DEAD", attempts: [] }, { action: "a", nowMs: NOW, root: r });
    writeFileSync(recoveryEpisodePath(r), "{ corrupted", "utf8");
    const plan = planRecovery(obs, { root: r, nowMs: NOW });
    assert.equal(plan.ok, false);
    assert.equal(plan.escalate, true);
    assert.match(plan.reason, /refusing to act without it/);
});

test("a different failure class opens a NEW episode, not a continuation", () => {
    const r = root();
    const dead = planRecovery(healthy({ process_exists: false, loopback_healthy: false }), { root: r, nowMs: NOW });
    recordAttempt(dead.episode, { action: "restart_owned_gateway", nowMs: NOW, root: r });
    const drift = planRecovery(healthy({ toolkit_drift: true }), { root: r, nowMs: NOW });
    assert.equal(drift.failure_class, "TOOLKIT_DRIFT");
    assert.equal(drift.attempts_used, 0, "a different theory starts its own count");
});

/* ── policy completeness ────────────────────────────────────────────────── */

test("every non-healthy class has a declared policy with a ceiling", () => {
    for (const cls of FAILURE_CLASSES) {
        if (cls === "HEALTHY") continue;
        const p = RECOVERY_POLICY[cls];
        assert.ok(p, `${cls} must declare a policy`);
        assert.equal(typeof p.max_attempts, "number", `${cls} must declare an attempt ceiling`);
        assert.ok(Array.isArray(p.prohibited), `${cls} must say what it may not do`);
        if (p.action) assert.ok(p.verify.length, `${cls} acts, so it must verify`);
        else assert.equal(p.max_attempts, 0, `${cls} has no action, so it must have no attempts`);
    }
});

test("classes with no autonomous authority escalate immediately", () => {
    for (const cls of ["TAILSCALE_FAILURE", "HOST_UNREACHABLE", "UNKNOWN"]) {
        assert.equal(ATTEMPT_CEILINGS[cls], 0);
        assert.ok(levelForClass(cls, 0) >= RECOVERY_LEVELS.L4_REMOTE_DIRECTOR, `${cls} must not act`);
    }
});

test("recovery declares no authority over lanes, runs or providers", () => {
    // §9: recovery must not destroy work. Asserted on the policy surface so a
    // future action cannot quietly acquire that reach.
    const blast = Object.values(RECOVERY_POLICY).map((p) => p.blast_radius || "").join(" ").toLowerCase();
    for (const forbidden of ["lane", "run registry", "provider", "worktree", "queue"]) {
        assert.equal(blast.includes(forbidden), false, `no policy may claim blast radius over ${forbidden}`);
    }
});
