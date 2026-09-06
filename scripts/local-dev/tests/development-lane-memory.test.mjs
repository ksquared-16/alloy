#!/usr/bin/env node
/**
 * V3 PHASE 6 — durable lane memory and the authorized-next-step contract.
 *
 * THE GAP THIS CLOSES. Phase 5 built a planner that could rank work, explain
 * itself, and refuse safely — and then could not be used, because every one of
 * nine live lanes resolved UNKNOWN. Three facts a dispatch decision needs were
 * recorded by nothing: what a lane is authorized to do next, whether that
 * step's dependencies are ready, and what the step actually is. The durable
 * lane record proves it: lane_id, name, description, status, origin, aliases,
 * mission_id, work_class, binding, repository_id — an identity and a placement,
 * with no objective and no authorization anywhere in it.
 *
 * THE TWO RULES UNDER TEST.
 *
 *   Authorization is DERIVED, never inferred. Every AUTHORIZED verdict names
 *   durable evidence from a closed provenance list. No provenance is UNKNOWN.
 *
 *   A checkpoint is evidence of what was true THEN, revalidated at the moment
 *   of asking. This programme has twice shipped a defect whose whole shape was
 *   a measurement taken once and trusted forever — the merge gate, and the
 *   worktree safety snapshot. A stale assertion here downgrades to UNKNOWN and
 *   says which check failed.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const M = await import("../lib/vacilando/lane-memory.mjs");
const A = await import("../lib/vacilando/authorized-next-step.mjs");

const freshRoot = () => {
    const root = mkdtempSync(join(tmpdir(), "lane-mem-"));
    M.resetLaneMemoryForTests(root);
    return root;
};

const STAGING = "f21e12ed5b4298fd2d0ae3a61ca9974ba3db4f28";
const liveOk = (over = {}) => ({ run_state: null, staging_sha: STAGING, dependency_states: {}, finding_statuses: {}, ...over });

const record = (over = {}) => M.laneMemoryRecord({
    laneId: "lane_test",
    mission: { objective: "Phase 6", complete: false, exclusions: ["begin_phase_7"] },
    authorization: {
        authorized_classes: ["run_tests", "push"],
        prohibited_classes: ["begin_phase_7"],
        provenance: ["director_instruction"],
    },
    nextStep: {
        action_class: "run_tests", deterministic: true, authorization: "AUTHORIZED",
        authorization_provenance: ["director_instruction"],
    },
    ...over,
});

/* ── A — durable, and survives a restart ─────────────────────────────────── */

await test("A — lane memory persists, survives a cold re-read, and stays parseable", async () => {
    const root = freshRoot();
    assert.equal(M.saveLaneMemory(record(), { root }).ok, true);

    // "Restart" is a fresh module instance with no in-process state.
    const cold = await import(`../lib/vacilando/lane-memory.mjs?restart=${Date.now()}`);
    const back = cold.getLaneMemory("lane_test", root);
    assert.equal(back.lane_id, "lane_test");
    assert.equal(back.mission.objective, "Phase 6");
    assert.equal(back.next_step.action_class, "run_tests");
    assert.deepEqual(back.authorization.provenance, ["director_instruction"]);
    // And it is real JSON on disk, not a private encoding.
    JSON.parse(readFileSync(cold.laneMemoryStorePath(root), "utf8"));
});

await test("an unreadable store is never treated as an empty one", () => {
    const root = freshRoot();
    const p = M.laneMemoryStorePath(root);
    mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true });
    writeFileSync(p, "{ not json");
    const read = M.readLaneMemoryGuarded(root);
    assert.equal(read.ok, false);
    assert.equal(read.error, "lane_memory_unreadable");
    // And a write REFUSES rather than overwriting what it could not read — the
    // rule the lane and run stores learned by losing one.
    const w = M.saveLaneMemory(record(), { root });
    assert.equal(w.ok, false);
    assert.equal(w.error, "lane_memory_unreadable");
    assert.equal(readFileSync(p, "utf8"), "{ not json", "the unreadable file is left intact");
});

/* ── B — provider handoff ────────────────────────────────────────────────── */

await test("B — the handoff projection carries what a new provider needs, bounded", () => {
    const rec = record({
        progress: { completed: Array.from({ length: 20 }, (_, i) => `step ${i}`), decisions: ["one"], finding_refs: ["f1"] },
        blockers: [{ description: "waiting on CI", wait_reason: "dependency" }],
        documentation: ["docs/platform/governance/autonomous-operations.md"],
    });
    const p = M.laneContextProjection(rec, { limit: 8 });
    assert.equal(p.objective, "Phase 6");
    assert.equal(p.mission_complete, false);
    assert.equal(p.next_step.action_class, "run_tests");
    assert.deepEqual(p.constraints.items, ["begin_phase_7"]);
    assert.equal(p.blockers.items.length, 1);
    assert.equal(p.documentation.items[0], "docs/platform/governance/autonomous-operations.md");
    // Bounded, and honest about it — a projection that dumps everything is the
    // transcript problem with extra steps.
    assert.equal(p.completed.items.length, 8);
    assert.equal(p.completed.total, 20);
    assert.equal(p.completed.truncated, true);
});

/* ── C–F — the contract's verdicts ───────────────────────────────────────── */

await test("C — an authorized deterministic step with ready dependencies resolves AUTHORIZED + READY", () => {
    const out = A.authorizedNextStep({ record: record(), live: liveOk() });
    assert.equal(out.authorization, "AUTHORIZED");
    assert.equal(out.dependency_state, "READY");
    assert.equal(out.deterministic, true);
    assert.equal(out.mission_remaining, true);
    assert.deepEqual(out.provenance, ["director_instruction"]);
});

await test("D — a step needing judgment resolves REQUIRES_DIRECTOR", () => {
    const out = A.authorizedNextStep({
        record: record({ nextStep: { action_class: "run_tests", deterministic: false, authorization: "REQUIRES_DIRECTOR", authorization_provenance: ["director_instruction"] } }),
        live: liveOk(),
    });
    assert.equal(out.authorization, "REQUIRES_DIRECTOR");
    assert.match(out.reason, /only the Director/);
});

await test("E — a complete mission authorizes nothing", () => {
    const out = A.authorizedNextStep({ record: record({ mission: { complete: true } }), live: liveOk() });
    assert.equal(out.authorization, "PROHIBITED");
    assert.equal(out.mission_remaining, false);
});

await test("F — an unmet dependency is WAITING, not UNKNOWN and not capacity", () => {
    const out = A.authorizedNextStep({
        record: record({ dependencies: [{ id: "d1", state: "WAITING", description: "PR checks" }] }),
        live: liveOk({ dependency_states: { d1: "WAITING" } }),
    });
    assert.equal(out.authorization, "AUTHORIZED");
    assert.equal(out.dependency_state, "WAITING");
    // FAILED and UNKNOWN dependencies are distinct answers, not lumped in.
    const failed = A.authorizedNextStep({
        record: record({ dependencies: [{ id: "d1", state: "FAILED" }] }),
        live: liveOk({ dependency_states: { d1: "FAILED" } }),
    });
    assert.equal(failed.dependency_state, "FAILED");
});

/* ── G, H — staleness and unknown both fail closed ───────────────────────── */

await test("G — a checkpoint whose world moved cannot authorize anything", () => {
    const rec = record({
        nextStep: {
            action_class: "run_tests", deterministic: true, authorization: "AUTHORIZED",
            authorization_provenance: ["director_instruction"],
            evidence: { staging_sha: STAGING },
        },
    });
    // Same record, staging has since advanced.
    const out = A.authorizedNextStep({ record: rec, live: liveOk({ staging_sha: "0000000000000000000000000000000000000000" }) });
    assert.equal(out.authorization, "UNKNOWN");
    assert.equal(out.stale, true);
    assert.ok(out.revalidation.failed.includes("promoted_lineage_current"), "it must say WHICH check failed");
});

await test("G2 — an aged checkpoint is not fresh, and freshness is never assumed", () => {
    const old = record();
    old.updated_at = new Date(Date.now() - M.CHECKPOINT_FRESHNESS_MS - 60_000).toISOString();
    assert.equal(M.checkpointFreshness(old).fresh, false);
    assert.equal(A.authorizedNextStep({ record: old, live: liveOk() }).authorization, "UNKNOWN");
    // A checkpoint with no readable timestamp is not fresh either.
    const undated = record(); undated.updated_at = null;
    assert.equal(M.checkpointFreshness(undated).fresh, false);
});

await test("H — every incomplete evidence path returns UNKNOWN and fails closed", () => {
    // No memory at all.
    assert.equal(A.authorizedNextStep({ record: null, live: liveOk() }).authorization, "UNKNOWN");
    // Memory with no next step.
    assert.equal(A.authorizedNextStep({ record: record({ nextStep: null }), live: liveOk() }).authorization, "UNKNOWN");
    // An authorization with no durable provenance is an opinion, not a warrant.
    const unprovenanced = record({
        authorization: { authorized_classes: ["run_tests"], provenance: [] },
        nextStep: { action_class: "run_tests", deterministic: true, authorization: "AUTHORIZED", authorization_provenance: [] },
    });
    assert.equal(A.authorizedNextStep({ record: unprovenanced, live: liveOk() }).authorization, "UNKNOWN");
    // A provenance outside the closed list does not count.
    const bogus = record({ nextStep: { action_class: "run_tests", deterministic: true, authorization: "AUTHORIZED", authorization_provenance: ["it_seemed_reasonable"] } });
    assert.equal(A.authorizedNextStep({ record: bogus, live: liveOk() }).authorization, "UNKNOWN");
    // UNMEASURABLE live truth cannot be revalidated against, so it is unknown.
    assert.equal(A.authorizedNextStep({ record: record(), live: {} }).authorization, "UNKNOWN");
});

await test("the stored verdict may be NARROWED by scope, never widened", () => {
    // The step claims AUTHORIZED but is outside the lane's authorized classes.
    const out = A.authorizedNextStep({
        record: record({ nextStep: { action_class: "deploy_production", deterministic: true, authorization: "AUTHORIZED", authorization_provenance: ["director_instruction"] } }),
        live: liveOk(),
    });
    assert.equal(out.authorization, "UNKNOWN");
    assert.match(out.reason, /not inside the lane's authorized classes/);
});

await test("an explicitly excluded class is PROHIBITED whatever the step claims", () => {
    const out = A.authorizedNextStep({
        record: record({ nextStep: { action_class: "begin_phase_7", deterministic: true, authorization: "AUTHORIZED", authorization_provenance: ["director_instruction"] } }),
        live: liveOk(),
    });
    assert.equal(out.authorization, "PROHIBITED");
    assert.match(out.reason, /excluded by the lane's scope/);
});

/* ── K — the scheduler consumes it ───────────────────────────────────────── */

await test("K — the contract translates into scheduler candidate fields conservatively", () => {
    const ok = A.candidateFieldsFor(A.authorizedNextStep({ record: record(), live: liveOk() }));
    assert.equal(ok.authorized, true);
    assert.equal(ok.dependenciesReady, true);
    assert.equal(ok.directorJudgmentRequired, false);
    assert.equal(ok.nextAction.deterministic, true);
    assert.equal(ok.nextAction.within_policy, true);

    // UNKNOWN must arrive at the planner as NULL — not measured — so the
    // planner's own unknown handling applies rather than a false negative.
    const unknownFields = A.candidateFieldsFor(A.authorizedNextStep({ record: null, live: liveOk() }));
    assert.equal(unknownFields.authorized, null);
    assert.equal(unknownFields.dependenciesReady, null);
    assert.equal(unknownFields.directorJudgmentRequired, null);
});

await test("K2 — the scheduler observation consumes the contract, wired not merely written", () => {
    const src = readFileSync(new URL("../lib/vacilando/work-scheduler-observe.mjs", import.meta.url), "utf8");
    assert.match(src, /authorizedNextStep\(\{/, "the contract must be CALLED, not only imported");
    assert.match(src, /candidateFieldsFor\(contract\)/);
    // The lesson from lane.dispatch_measurement_instruction: a collector that
    // exists is not a collector that runs.
    assert.match(src, /getLaneMemory\(/);
});

/* ── The invariants that must not erode ──────────────────────────────────── */

await test("the memory owner dispatches nothing and starts nothing", () => {
    for (const f of ["lane-memory.mjs", "authorized-next-step.mjs"]) {
        const src = readFileSync(new URL(`../lib/vacilando/${f}`, import.meta.url), "utf8");
        for (const forbidden of ["startLaneAgentSession", "createQueuedRun", "sendLaneInstruction", "execFile", "spawn("]) {
            assert.equal(src.includes(forbidden), false, `${forbidden} must not appear in ${f}`);
        }
    }
});

await test("memory REFERENCES canonical truth and does not duplicate it", () => {
    const rec = record({ progress: { finding_refs: ["f1"], evidence_refs: ["sha"], promoted_lineage: ["PR728"] } });
    // Findings and runs are ids and shas here, never embedded bodies or states.
    assert.deepEqual(rec.progress.finding_refs, ["f1"]);
    assert.equal(rec.progress.run_state, undefined, "run state belongs to execution-run");
    assert.equal(rec.progress.provider, undefined, "provider state belongs to provider-seat-state");
    assert.equal(rec.progress.capacity, undefined, "capacity belongs to its own owner");
});

await test("TEST ISOLATION — the reset helper refuses the live gateway root", () => {
    assert.throws(() => M.resetLaneMemoryForTests("/Users/anyone/.local/state/alloy-dev/gateway"), /refusing to reset/);
    assert.throws(() => M.resetLaneMemoryForTests(), /explicit root/);
});

await test("declared enums are closed and include their unknown", () => {
    assert.deepEqual(M.AUTHORIZATION_STATES, ["AUTHORIZED", "REQUIRES_DIRECTOR", "PROHIBITED", "UNKNOWN"]);
    assert.deepEqual(M.DEPENDENCY_STATES, ["READY", "WAITING", "FAILED", "UNKNOWN"]);
    assert.ok(M.AUTHORIZATION_PROVENANCE.includes("director_instruction"));
    assert.equal(M.AUTHORIZATION_PROVENANCE.includes("model_judgement"), false,
        "an LLM deciding a step sounds authorized is exactly what this excludes");
});
