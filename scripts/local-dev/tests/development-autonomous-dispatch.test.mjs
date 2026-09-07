#!/usr/bin/env node
/**
 * V3 PHASE 8 — bounded autonomous dispatch, and every reason it refuses.
 *
 * THE SAFETY PROPERTY BEING CERTIFIED, in the Director's own words: real
 * authority causes real autonomous action, while every lane lacking authority
 * remains untouched. Both halves matter, and the second half is the one that
 * needs the most controls — a dispatcher that only ever says yes is not a
 * dispatcher, it is a loop.
 *
 * THE NEGATIVE STATES ARE CERTIFIED HERE, NOT MANUFACTURED IN PRODUCTION. The
 * earlier activation gate would have required altering unrelated live lanes to
 * exhibit REQUIRES_DIRECTOR and MISSION_COMPLETE. That is mutating production
 * truth to satisfy a test, which is exactly what the governing safety model
 * forbids. They are proven mechanically instead, against the same code the live
 * path runs.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const D = await import("../lib/vacilando/work-scheduler-dispatch.mjs");
const M = await import("../lib/vacilando/lane-memory.mjs");
const A = await import("../lib/vacilando/authorized-next-step.mjs");

const LANE = "lane_1111aaaa2222";
const STAGING = "7d4bb87ac54c4701dfde9b7bb735335463af7ca8";
/**
 * Live truth, with every field the revalidator needs SUPPLIED — including
 * `run_state: null`. An omitted field is `undefined`, which revalidation
 * treats as unmeasurable and therefore invalidating. That is the correct
 * behaviour and it makes an incomplete fixture look like a stale checkpoint.
 */
const live = (over = {}) => ({ run_state: null, staging_sha: STAGING, dependency_states: {}, finding_statuses: {}, ...over });

function freshRoot() {
    const root = mkdtempSync(join(tmpdir(), "dispatch-"));
    M.resetLaneMemoryForTests(root);
    return root;
}

const memory = (over = {}) => M.laneMemoryRecord({
    laneId: LANE,
    mission: { objective: "Complete Autonomous Operations V1", complete: false, exclusions: ["begin_phase_9"] },
    authorization: {
        authorized_classes: ["run_tests"], prohibited_classes: ["begin_phase_9"],
        provenance: ["director_instruction"],
    },
    nextStep: {
        action_class: "run_tests", description: "Run the certification suites", deterministic: true,
        authorization: "AUTHORIZED", authorization_provenance: ["director_instruction"],
    },
    ...over,
});

/* ── Off by default, and it cannot enable itself ─────────────────────────── */

await test("autonomous dispatch is OFF unless explicitly enabled", async () => {
    assert.equal(D.dispatchEnabled({}), false);
    assert.equal(D.dispatchEnabled({ VACILANDO_AUTONOMOUS_DISPATCH: "0" }), false);
    assert.equal(D.dispatchEnabled({ VACILANDO_AUTONOMOUS_DISPATCH: "1" }), true);
    const root = freshRoot();
    M.saveLaneMemory(memory(), { root });
    const out = await D.dispatchCandidate({ laneId: LANE, root, liveTruth: live() });
    assert.equal(out.refusal, "not_enabled");
});

await test("the module cannot enable itself — the switch is outside the code", () => {
    const src = readFileSync(new URL("../lib/vacilando/work-scheduler-dispatch.mjs", import.meta.url), "utf8");
    assert.match(src, /VACILANDO_AUTONOMOUS_DISPATCH/);
    // No constant that could be flipped to true in a refactor.
    assert.equal(/const\s+ENABLED\s*=\s*true/.test(src), false);
});

/* ── The negative states — certified, not manufactured in production ─────── */

await test("REQUIRES_DIRECTOR cannot dispatch", async () => {
    const root = freshRoot();
    M.saveLaneMemory(memory({
        nextStep: { action_class: "run_tests", deterministic: true, authorization: "REQUIRES_DIRECTOR", authorization_provenance: ["director_instruction"] },
    }), { root });
    const out = await D.dispatchCandidate({ laneId: LANE, root, enabled: true, liveTruth: live() });
    assert.equal(out.dispatched, false);
    assert.equal(out.refusal, "not_authorized");
    assert.equal(out.authorization, "REQUIRES_DIRECTOR");
});

await test("MISSION_COMPLETE cannot dispatch", async () => {
    const root = freshRoot();
    M.saveLaneMemory(memory({ mission: { objective: "done", complete: true } }), { root });
    const out = await D.dispatchCandidate({ laneId: LANE, root, enabled: true, liveTruth: live() });
    assert.equal(out.dispatched, false);
    assert.equal(out.refusal, "mission_not_remaining");
});

await test("UNKNOWN — a lane with no memory at all — cannot dispatch", async () => {
    const root = freshRoot();
    const out = await D.dispatchCandidate({ laneId: LANE, root, enabled: true, liveTruth: live() });
    assert.equal(out.dispatched, false);
    // No memory means no next action to authorize, which is refused before the
    // authorization question is even reached. Either refusal is correct; the
    // one that fires is the earlier and more specific.
    assert.equal(out.refusal, "no_next_action");
    assert.equal(out.contract.authorization, "UNKNOWN");
});

await test("STALE MEMORY cannot authorize execution", async () => {
    const root = freshRoot();
    M.saveLaneMemory(memory({
        nextStep: {
            action_class: "run_tests", deterministic: true, authorization: "AUTHORIZED",
            authorization_provenance: ["director_instruction"], evidence: { staging_sha: STAGING },
        },
    }), { root });
    // Staging moved under the checkpoint.
    const out = await D.dispatchCandidate({
        laneId: LANE, root, enabled: true,
        liveTruth: live({ staging_sha: "0000000000000000000000000000000000000000" }),
    });
    assert.equal(out.dispatched, false);
    assert.equal(out.refusal, "not_authorized");
    assert.equal(out.contract.stale, true);
});

await test("UNPROVENANCED and OFF-LIST authorization cannot authorize", async () => {
    for (const provenance of [[], ["it_seemed_reasonable"], ["model_judgement"]]) {
        const root = freshRoot();
        M.saveLaneMemory(memory({
            authorization: { authorized_classes: ["run_tests"], provenance },
            nextStep: { action_class: "run_tests", deterministic: true, authorization: "AUTHORIZED", authorization_provenance: provenance },
        }), { root });
        const out = await D.dispatchCandidate({ laneId: LANE, root, enabled: true, liveTruth: live() });
        assert.equal(out.dispatched, false, JSON.stringify(provenance));
        assert.equal(out.authorization, "UNKNOWN");
    }
});

await test("a non-deterministic next action cannot dispatch", async () => {
    const root = freshRoot();
    M.saveLaneMemory(memory({
        nextStep: { action_class: "run_tests", deterministic: false, authorization: "AUTHORIZED", authorization_provenance: ["director_instruction"] },
    }), { root });
    const out = await D.dispatchCandidate({ laneId: LANE, root, enabled: true, liveTruth: live() });
    assert.equal(out.refusal, "not_deterministic");
});

await test("an unmet dependency cannot dispatch", async () => {
    const root = freshRoot();
    M.saveLaneMemory(memory({ dependencies: [{ id: "d1", state: "WAITING" }] }), { root });
    const out = await D.dispatchCandidate({
        laneId: LANE, root, enabled: true, liveTruth: live({ dependency_states: { d1: "WAITING" } }),
    });
    assert.equal(out.refusal, "dependencies_not_ready");
    assert.equal(out.dependency_state, "WAITING");
});

/* ── The canonical chain, and nothing beside it ──────────────────────────── */

await test("NO SECOND DISPATCHER — the provider is never started from here", () => {
    const src = readFileSync(new URL("../lib/vacilando/work-scheduler-dispatch.mjs", import.meta.url), "utf8")
        .split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
    for (const forbidden of ["startLaneAgentSession", "tmux", "spawn(", "execFile"]) {
        assert.equal(src.includes(forbidden), false, `${forbidden} must not appear: admission owns provider start`);
    }
    // It goes through the canonical owners, in order.
    const body = src.slice(src.indexOf("export async function dispatchCandidate"));
    const run = body.indexOf("createQueuedRun");
    const adm = body.indexOf("createAdmissionRequest");
    const queue = body.indexOf("evaluateAdmissionQueue");
    assert.ok(run > 0 && adm > run && queue > adm, "run identity, then admission, then the queue");
});

await test("the instruction is built from recorded memory, never generated prose", () => {
    const rec = memory();
    const contract = A.authorizedNextStep({ record: rec, live: live() });
    const text = D.instructionFor(rec, contract);
    assert.match(text, /Complete Autonomous Operations V1/);
    assert.match(text, /Next authorized action: run_tests/);
    assert.match(text, /Authorization provenance: director_instruction/);
    assert.match(text, /Explicitly out of scope: begin_phase_9/);
    // Without an objective there is nothing to say, and it says nothing.
    assert.equal(D.instructionFor({ mission: {} }, contract), null);
    assert.equal(D.instructionFor(rec, {}), null);
});

await test("verification RE-READS the run rather than trusting the queue's answer", () => {
    const src = readFileSync(new URL("../lib/vacilando/work-scheduler-dispatch.mjs", import.meta.url), "utf8");
    const body = src.slice(src.indexOf("// 7. Verify"));
    assert.match(body, /activeRunForLane\(laneId, root\)/);
    assert.match(body, /run\.run_id === created\.run\.run_id/);
});

await test("every refusal reason is a declared one", () => {
    assert.ok(D.DISPATCH_REFUSALS.includes("lane_occupied"));
    assert.ok(D.DISPATCH_REFUSALS.includes("admission_open"));
    assert.ok(D.DISPATCH_REFUSALS.includes("not_authorized"));
    assert.ok(D.DISPATCH_REFUSALS.includes("mission_not_remaining"));
});

/* ── The stage must actually be REACHED ──────────────────────────────────── */

await test("SCHEDULING IS NOT ON HYGIENE'S CADENCE — the stage is reached on an ordinary tick", () => {
    // THE DEFECT THIS COVERS, found by watching 50 real Steward cycles produce
    // zero scheduling decisions. The dispatch stage was called only on the path
    // where hygiene had actually run, so an ordinary five-minute tick returned
    // early and never reached it. Hygiene is due every six hours; scheduling was
    // therefore attempted at most four times a day.
    //
    // Same shape as every other "wired but never called" defect in this
    // programme: an evidence collector that existed and was not invoked, a
    // recovery model that was certified and never driven. Building a stage is
    // not the same as reaching it.
    const src = readFileSync(new URL("../lib/vacilando/host-steward-run.mjs", import.meta.url), "utf8");
    const wrapper = src.slice(
        src.indexOf("export async function runStewardCycleWithHygiene"),
        src.indexOf("export async function runSchedulerDispatchStage"),
    );
    // Every return that carries a hygiene verdict must also carry a dispatch
    // verdict — otherwise there is a tick on which scheduling silently does not
    // happen.
    const hygieneReturns = [...wrapper.matchAll(/return \{ \.\.\.steward, recovery, hygiene: [^\n]*\}/g)].map((m) => m[0]);
    assert.ok(hygieneReturns.length >= 2, "the wrapper has several hygiene return paths");
    const notDue = hygieneReturns.find((r) => r.includes("not_due"));
    assert.ok(notDue, "the hygiene-not-due path exists");
    assert.match(notDue, /dispatch:/, "and it must still carry a dispatch verdict");
    // The stage is invoked on that path, not only on the hygiene-ran path.
    const calls = [...wrapper.matchAll(/runSchedulerDispatchStage\(/g)];
    assert.ok(calls.length >= 2, "the dispatch stage is invoked on more than one path");
});
