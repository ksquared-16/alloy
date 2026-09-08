#!/usr/bin/env node
/**
 * V3 PHASE 8 — the resident cycle actually drives recovery.
 *
 * WHY THIS EXISTS. `control-plane-recovery` has been certified since Phase 3
 * and nothing called it on a cadence. That is the whole reason
 * `director-forced-to-mac-mini` stayed MITIGATED for four phases: the decision
 * model existed, and no resident loop consulted it. Recovery code existing is
 * not evidence that recovery happens — the same distinction that made a wired
 * evidence collector and an uncalled one look identical until a merge escalated.
 *
 * THE HONEST LIMIT, asserted here rather than discovered later. The Steward runs
 * INSIDE the Gateway process, so PROCESS_DEAD cannot be recovered from here —
 * launchd's KeepAlive owns that. What the stage adds is the class launchd cannot
 * see: a Gateway alive and not serving, which is exactly the condition
 * `director-forced-to-mac-mini` was opened for.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const S = await import("../lib/vacilando/host-steward-run.mjs");
const R = await import("../lib/vacilando/control-plane-recovery.mjs");

const freshRoot = () => mkdtempSync(join(tmpdir(), "resident-rec-"));

/** An observation shaped like the real one, with named faults injected. */
/**
 * A single failed probe is not a wedged process — slow bind looks identical, so
 * the classifier debounces for UNHEALTHY_CONFIRM_MS before naming a fault. A
 * fixture that omits `unhealthy_since_ms` is therefore correctly UNKNOWN, and
 * the confirmed cases below supply it deliberately.
 */
const CONFIRMED_AGO = R.UNHEALTHY_CONFIRM_MS + 5_000;
const obs = (over = {}) => ({
    process_exists: true,
    running_sha: "aaaaaaaaaaaa",
    installed_sha: "aaaaaaaaaaaa",
    toolkit_drift: false,
    loopback_healthy: true,
    launchd_loaded: true,
    director_route_healthy: true,
    supervisor_healthy: true,
    tailscale_up: true,
    ...over,
});

const stage = (over = {}, { root, repair = async () => ({ ok: true }), nowMs = Date.now() } = {}) =>
    S.runResidentRecoveryStage({ root, nowMs, observe: async () => obs(over), repair });

/** A loopback fault that has persisted long enough to be a fault. */
const wedged = (nowMs) => obs({ loopback_healthy: false, unhealthy_since_ms: nowMs - CONFIRMED_AGO, now_ms: nowMs });

/* ── The stage drives the decision owner ─────────────────────────────────── */

await test("a healthy control plane repairs nothing", async () => {
    const out = await stage({}, { root: freshRoot() });
    assert.equal(out.failure_class, "HEALTHY");
    assert.equal(out.acted, false);
    assert.equal(out.action, null);
});

await test("an alive-but-not-serving Gateway IS repaired by the resident stage", async () => {
    // The condition launchd cannot see, and the reason the finding was opened.
    const root = freshRoot();
    let repaired = 0;
    let observations = 0;
    const out = await S.runResidentRecoveryStage({
        root,
        observe: async () => {
            observations += 1;
            const now = Date.now();
            return observations === 1 ? wedged(now) : obs({ now_ms: now });
        },
        repair: async () => { repaired += 1; return { ok: true }; },
    });
    assert.equal(out.failure_class, "PROCESS_ALIVE_UNHEALTHY");
    assert.equal(out.acted, true);
    assert.equal(repaired, 1);
    // Verified by RE-OBSERVING, not by trusting the repair's return value.
    assert.equal(out.verified, true);
    assert.equal(out.after_class, "HEALTHY");
});

await test("a repair that claims success while the fault persists is NOT verified", async () => {
    const out = await S.runResidentRecoveryStage({
        root: freshRoot(),
        observe: async () => wedged(Date.now()),   // never recovers
        repair: async () => ({ ok: true }),        // but says it did
    });
    assert.equal(out.acted, true);
    assert.equal(out.verified, false, "verification must re-measure, never trust the repair");
    assert.notEqual(out.after_class, "HEALTHY");
});

/* ── §13 — the things recovery must never do ─────────────────────────────── */

await test("A HEALTHY GATEWAY IS NOT RESTARTED BECAUSE THE DIRECTOR ROUTE FAILED", async () => {
    const root = freshRoot();
    let restarted = 0;
    const out = await S.runResidentRecoveryStage({
        root,
        observe: async () => obs({ director_route_healthy: false }),
        repair: async (plan) => { if (plan.action === "restart_owned_gateway") restarted += 1; return { ok: true }; },
    });
    assert.equal(restarted, 0, "restarting a serving Gateway over a route fault is the exact hazard");
    assert.notEqual(out.action, "restart_owned_gateway");
});

await test("Tailscale is never repaired autonomously", async () => {
    const out = await stage({ tailscale_up: false, director_route_healthy: false }, { root: freshRoot() });
    assert.equal(out.acted, false);
    assert.equal(out.action, null);
    assert.equal(out.escalate, true, "it escalates instead — the recovery channel is not something to gamble with");
});

await test("an unreachable host is the Director's, physically, and nothing is attempted", async () => {
    const out = await stage({ process_exists: null, loopback_healthy: null, launchd_loaded: null, tailscale_up: null },
        { root: freshRoot() });
    assert.equal(out.acted, false);
    assert.equal(out.escalate, true);
});

await test("UNKNOWN is never acted on", async () => {
    // Nothing measurable: the classifier cannot name a fault, so nothing is done.
    const out = await S.runResidentRecoveryStage({
        root: freshRoot(),
        observe: async () => ({}),
        repair: async () => { throw new Error("must not be called"); },
    });
    assert.equal(out.acted, false);
});

await test("an action with no wired repair owner is reported, never improvised", async () => {
    /*
     * TOOLKIT_DRIFT used to be this test's example of an unowned action. It is
     * owned now — the resident stage restarts through launchd — so the property
     * needs a class that genuinely has no in-process repair. SUPERVISOR_FAILURE
     * is one: its action is named and nothing performs it, which is exactly the
     * state TOOLKIT_DRIFT was in while a verified install sat unused.
     */
    const out = await S.runResidentRecoveryStage({
        root: freshRoot(),
        observe: async () => obs({ loopback_healthy: true, supervisor_healthy: false }),
        repair: null,
    });
    assert.equal(out.acted, false);
    assert.match(String(out.why), /no wired repair owner/);
    assert.equal(out.escalate, true);
});

await test("TOOLKIT_DRIFT is no longer among the unowned actions", async () => {
    // The regression guard for the gap this closeout fixed: a classified drift
    // must reach a repair owner rather than escalating as unimplemented.
    const out = await S.runResidentRecoveryStage({
        root: freshRoot(),
        observe: async () => obs({ toolkit_drift: true, running_sha: "aaaaaaaaaaaa", installed_sha: "bbbbbbbbbbbb" }),
        repair: async (plan) => ({ ok: true, saw: plan.action }),
    });
    assert.equal(out.acted, true, "the drift is acted on");
    assert.ok(!/no wired repair owner/.test(String(out.why || "")), "and not as an unimplemented action");
});

/* ── Bounds and memory ───────────────────────────────────────────────────── */

await test("the retry ceiling is honoured and then escalates", async () => {
    const root = freshRoot();
    const observe = async () => wedged(Date.now());
    let attempts = 0;
    const repair = async () => { attempts += 1; return { ok: true }; };
    const ceiling = R.ATTEMPT_CEILINGS.PROCESS_ALIVE_UNHEALTHY;
    // Space the attempts past the cooldown so the ceiling, not the cooldown, is
    // what stops it.
    for (let i = 0; i < ceiling + 3; i += 1) {
        await S.runResidentRecoveryStage({ root, observe, repair, nowMs: Date.now() + i * (R.ATTEMPT_COOLDOWN_MS + 1000) });
    }
    assert.equal(attempts, ceiling, `must attempt exactly ${ceiling} times, not ${attempts}`);
    const final = await S.runResidentRecoveryStage({
        root, observe, repair, nowMs: Date.now() + 99 * (R.ATTEMPT_COOLDOWN_MS + 1000),
    });
    assert.equal(final.acted, false);
    assert.equal(final.escalate, true);
    assert.match(String(final.reason), /authority exhausted/);
});

await test("a second attempt inside the cooldown is refused — a faster retry is a loop", async () => {
    const root = freshRoot();
    const observe = async () => wedged(Date.now());
    let attempts = 0;
    const repair = async () => { attempts += 1; return { ok: true }; };
    const t = Date.now();
    await S.runResidentRecoveryStage({ root, observe, repair, nowMs: t });
    const second = await S.runResidentRecoveryStage({ root, observe, repair, nowMs: t + 1000 });
    assert.equal(attempts, 1);
    assert.equal(second.acted, false);
    assert.match(String(second.why), /cooldown/);
});

await test("THE ATTEMPT IS RECORDED BEFORE THE ACTION — a restart loop must record that it is looping", async () => {
    const root = freshRoot();
    let episodeAtActionTime = null;
    await S.runResidentRecoveryStage({
        root,
        observe: async () => wedged(Date.now()),
        repair: async () => {
            episodeAtActionTime = R.readEpisode(root).episode;
            return { ok: true };
        },
    });
    assert.ok(episodeAtActionTime, "the episode must already be on disk when the action runs");
    assert.equal(episodeAtActionTime.attempts.length, 1);
});

await test("recovery memory survives a restart of the process that wrote it", async () => {
    const root = freshRoot();
    await S.runResidentRecoveryStage({
        root, observe: async () => wedged(Date.now()), repair: async () => ({ ok: false }),
    });
    const cold = await import(`../lib/vacilando/control-plane-recovery.mjs?restart=${Date.now()}`);
    const ep = cold.readEpisode(root).episode;
    assert.equal(ep.failure_class, "PROCESS_ALIVE_UNHEALTHY");
    assert.equal(ep.attempts.length, 1);
    assert.equal(ep.attempts[0].verified, false, "and it remembers the attempt did not work");
});

await test("unreadable recovery memory refuses to act rather than starting fresh", async () => {
    const root = freshRoot();
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const p = R.recoveryEpisodePath(root);
    mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true });
    writeFileSync(p, "{ not json");
    const out = await S.runResidentRecoveryStage({
        root, observe: async () => wedged(Date.now()),
        repair: async () => { throw new Error("must not be called"); },
    });
    assert.equal(out.acted, false);
    assert.equal(out.escalate, true);
    assert.match(String(out.reason), /recovery memory is unreadable/);
});

/* ── Ordering: recovery outranks ordinary work ───────────────────────────── */

await test("recovery runs before hygiene, and a broken control plane defers it", () => {
    const src = readFileSync(new URL("../lib/vacilando/host-steward-run.mjs", import.meta.url), "utf8");
    const wrapper = src.slice(src.indexOf("export async function runStewardCycleWithHygiene"));
    const recoveryAt = wrapper.indexOf("runResidentRecoveryStage");
    const hygieneAt = wrapper.indexOf("runHygieneCycle");
    assert.ok(recoveryAt > 0 && hygieneAt > 0);
    assert.ok(recoveryAt < hygieneAt, "a host that needs repairing must not spend its cycle tidying");
    assert.match(wrapper, /recoveryBlocking/);
    assert.match(wrapper, /control_plane_not_healthy/);
});

await test("the stage owns sequencing only — no recovery rule is written in the caller", () => {
    const src = readFileSync(new URL("../lib/vacilando/host-steward-run.mjs", import.meta.url), "utf8");
    const fn = src.slice(src.indexOf("export async function runResidentRecoveryStage"));
    // No thresholds, no ceilings, no class list: those belong to the decision owner.
    for (const forbidden of ["ATTEMPT_CEILINGS =", "UNHEALTHY_CONFIRM_MS =", "FAILURE_CLASSES ="]) {
        assert.equal(fn.includes(forbidden), false, `${forbidden} must stay in control-plane-recovery`);
    }
    assert.match(fn, /planRecovery\(/);
    assert.match(fn, /recordAttempt\(/);
    assert.match(fn, /recordVerification\(/);
});

await test("PROCESS_DEAD is honestly out of scope for an in-process stage", () => {
    // Asserted so the limit is documented where it cannot rot: the Steward runs
    // inside the Gateway, so it cannot restart a Gateway that is not running.
    const src = readFileSync(new URL("../lib/vacilando/host-steward-run.mjs", import.meta.url), "utf8");
    assert.match(src, /launchd/, "the independent execution path must be named");
    assert.match(src, /PROCESS_DEAD is not recoverable from here/);
});

/*
 * AN IN-PROCESS OBSERVER MUST NOT PROBE ITSELF SYNCHRONOUSLY.
 *
 * The honest limit noted at the top of this file had a second half nobody had
 * written down. The Steward runs inside the Gateway, so it cannot recover a dead
 * process — that much was asserted. But it also cannot MEASURE the live one with
 * a synchronous subprocess, because the event loop that would answer the probe
 * is the one `execFileSync` is blocking. curl exits at its deadline, the guard
 * reports "unmeasured", the classifier says UNKNOWN, and recovery — correctly —
 * outranks and cancels all ordinary work.
 *
 * Measured on the live host: 7.5 hours of uptime, ~90 ticks, not one of them
 * reaching hygiene or scheduling; Backend unoccupied and eligible for 33 minutes
 * across eight ticks with no dispatch; an external poll answered 200 after
 * 8064 ms while the internal probe gave up at 8000 ms.
 *
 * These tests pin the two properties that failure violated: the probe answers
 * rather than blocking, and a silent service is measured as unhealthy rather
 * than as unmeasured.
 */
import { createServer } from "node:http";

const RR = await import("../lib/vacilando/host-steward-run.mjs");

/** A server on an ephemeral port, so a test never touches the real Gateway. */
function listen(handler) {
  const server = createServer(handler);
  return new Promise((res) => server.listen(0, "127.0.0.1", () => res({
    server, port: server.address().port, close: () => new Promise((r) => server.close(r)),
  })));
}

test("a Gateway that answers 200 is healthy", async () => {
  const s = await listen((_req, res) => { res.writeHead(200); res.end("{}"); });
  try {
    assert.equal(await RR.probeLoopbackInProcess({ root: mkdtempSync(join(tmpdir(), "probe-")), port: s.port }), true);
  } finally { await s.close(); }
});

test("a Gateway that accepts the connection and never answers is UNHEALTHY, not unmeasured", async () => {
  // The live failure exactly: the socket is accepted, and nothing ever replies.
  // Reporting `null` here is what let a wedged loop read as a blind spot.
  const s = await listen(() => { /* deliberately never responds */ });
  try {
    const verdict = await RR.probeLoopbackInProcess({
      root: mkdtempSync(join(tmpdir(), "probe-")), port: s.port, timeoutMs: 300,
    });
    assert.equal(verdict, false, "a service that did not answer is a measurement");
    assert.notEqual(verdict, null, "and must never be reported as unmeasured");
  } finally { await s.close(); }
});

test("the probe yields to the event loop instead of blocking it", async () => {
  /*
   * THE PROPERTY THE OLD PROBE VIOLATED. A synchronous probe cannot be answered
   * by the process running it. This asserts the probe is genuinely async: a
   * timer scheduled alongside it must fire while the probe is still outstanding.
   * Under `execFileSync` this tick could not happen, which is precisely why the
   * self-request was never served.
   */
  const s = await listen(() => { /* never responds, so the probe stays pending */ });
  try {
    let ticked = false;
    const timer = setTimeout(() => { ticked = true; }, 50);
    await RR.probeLoopbackInProcess({
      root: mkdtempSync(join(tmpdir(), "probe-")), port: s.port, timeoutMs: 400,
    });
    clearTimeout(timer);
    assert.equal(ticked, true, "the loop kept running while the probe was in flight");
  } finally { await s.close(); }
});

test("a closed port is refused, and a refusal is also an answer", async () => {
  const s = await listen((_req, res) => { res.writeHead(200); res.end("{}"); });
  const port = s.port;
  await s.close();
  assert.equal(await RR.probeLoopbackInProcess({ root: mkdtempSync(join(tmpdir(), "probe-")), port }), false);
});

/*
 * THE SECOND STEP OF AN INSTALL, AND WHO OWNS IT.
 *
 * `executeToolkitInstall` never restarts the Gateway from inside the Gateway —
 * killing the process before its own completion record is durable would lose
 * the one audit line nobody can reconstruct. That is correct and is unchanged.
 *
 * What was missing is the owner of the step it hands off to. TOOLKIT_DRIFT has
 * been a classified failure class with a named action, a ceiling of 2, a
 * cooldown and a verification list since Phase 3, and the resident stage
 * supplied no repair for it — so every tick returned "no wired repair owner"
 * and escalated. Measured live: a verified install of df81b7957dd8 sat unused
 * for the better part of an hour while `planToolkitConvergence` reported
 * `converged`, because that plan compares installed against promoted and never
 * consults what is actually running.
 *
 * launchd is the independent context. The kickstart terminates the process that
 * issues it, which is safe here and was not safe inside the installer: the
 * episode is recorded BEFORE the action precisely because an action may kill
 * the memory's holder, and bringing the job back is launchd's job. Verification
 * lands on the next process's first cycle.
 */
const CPR = await import("../lib/vacilando/control-plane-recovery.mjs");

test("a real toolkit drift is restarted through launchd, from the job it names", () => {
  const calls = [];
  const out = CPR.restartGatewayForConvergence({
    installedSha: "df81b7957dd8", runningSha: "baea5812f4ae",
    provenanceValid: true, rollbackRetained: true, uid: 501,
    exec: (c, a) => { calls.push([c, ...a]); return ""; },
  });
  assert.equal(out.ok, true);
  assert.equal(out.from, "baea5812f4ae");
  assert.equal(out.to, "df81b7957dd8");
  assert.deepEqual(calls, [["launchctl", "kickstart", "-k", "gui/501/com.alloy.vacilando-gateway"]],
    "one bounded command against one named job");
  assert.equal(out.verified_by, "next_cycle_observation",
    "it does not claim to have verified a restart that kills the verifier");
});

test("it refuses anything short of provable drift", () => {
  const never = () => { throw new Error("must not restart"); };
  const cases = [
    [{}, "convergence_unmeasured"],
    [{ installedSha: "a", runningSha: "a" }, "no_drift"],
    [{ installedSha: "a", runningSha: "b", provenanceValid: false, rollbackRetained: true }, "provenance_not_valid"],
    [{ installedSha: "a", runningSha: "b", provenanceValid: true, rollbackRetained: false }, "no_rollback_target"],
  ];
  for (const [input, expected] of cases) {
    const r = CPR.restartGatewayForConvergence({ ...input, uid: 501, exec: never });
    assert.equal(r.ok, false);
    assert.equal(r.error, expected);
  }
});

test("a converged host is never restarted, so the same install is idempotent", () => {
  // The property that stops a stale request becoming a restart loop: once
  // running matches installed there is no drift, and no drift means no action.
  const never = () => { throw new Error("must not restart"); };
  const r = CPR.restartGatewayForConvergence({
    installedSha: "df81b7957dd8", runningSha: "df81b7957dd8",
    provenanceValid: true, rollbackRetained: true, uid: 501, exec: never,
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, "no_drift");
});

test("UNKNOWN still carries no action, so it can never reach the restart owner", () => {
  // Fail-closed by construction rather than by a check inside the repair.
  const plan = CPR.planRecovery
    ? CPR.planRecovery({ failure_class: "UNKNOWN" })
    : { action: null };
  assert.ok(!plan.action || plan.action === null, "UNKNOWN authorises nothing");
  assert.equal(CPR.ATTEMPT_CEILINGS.UNKNOWN, 0);
});
