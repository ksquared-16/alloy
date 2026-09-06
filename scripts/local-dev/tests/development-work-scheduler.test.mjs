#!/usr/bin/env node
/**
 * V3 PHASE 5 — the scheduling decision, and the unread-output view.
 *
 * TWO QUESTIONS NOTHING OWNED.
 *
 *   Of the work Vacilando is already authorized to do, what deserves the next
 *   provider — and if nothing does, why is that the right answer?
 *
 *   Is there completed provider output the Director has not seen? A lane that
 *   finished work and a lane that is merely idle both present as `ready`, so
 *   finished work is found by opening lanes one at a time.
 *
 * The scheduler consumes truth and owns only the ordering decision; the view
 * derives from the notification store's existing `seen_at` cursor and owns no
 * storage at all. Both properties are asserted here, because a scheduler that
 * decides whether a run exists, or a presentation layer that becomes execution
 * truth, are the two ways this goes wrong.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const S = await import("../lib/vacilando/work-scheduler.mjs");
const V = await import("../lib/vacilando/lane-attention-view.mjs");
const N = await import("../lib/vacilando/lane-notifications.mjs");

const MIN = 60_000;
const ready = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const cand = (o = {}) => S.schedulableCandidate({
    authorized: true, dependenciesReady: true, directorJudgmentRequired: false,
    resourceDimensions: ["provider_seat"], readySince: ready(60_000), ...o,
});
const SEATS = (n) => ({ provider_seat: { available: n } });

/* ── Wait reasons: every non-running lane can say why ────────────────────── */

await test("every wait reason is a declared one, and unknown is among them", () => {
    assert.ok(S.WAIT_REASONS.includes("unknown"));
    const cases = [
        [cand({ laneId: "a", runState: "EXECUTING" }), SEATS(1), null, "executing"],
        [cand({ laneId: "b" }), SEATS(1), null, "eligible"],
        [cand({ laneId: "c" }), SEATS(0), null, "capacity"],
        [cand({ laneId: "d", authorized: false }), SEATS(1), null, "no_authorized_work"],
        [cand({ laneId: "e", directorJudgmentRequired: true }), SEATS(1), null, "director_answer"],
        [cand({ laneId: "f", blockedBy: { kind: "governed_action", detail: "gar_x" } }), SEATS(1), null, "governed_action"],
        [cand({ laneId: "g", dependenciesReady: false }), SEATS(1), null, "dependency"],
        [cand({ laneId: "h", findingConstraints: [{ id: "fnd", blocks: true }] }), SEATS(1), null, "finding_constraint"],
        [cand({ laneId: "i" }), SEATS(1), "CONSTRAINED", "host_constrained"],
        [cand({ laneId: "j", scheduledAfter: new Date(Date.now() + MIN).toISOString() }), SEATS(1), null, "scheduled_later"],
        [cand({ laneId: "k", attempts: 1, lastAttemptAt: new Date().toISOString() }), SEATS(1), null, "retry_cooldown"],
        [cand({ laneId: "l", runState: "COMPLETE" }), SEATS(1), null, "completed"],
    ];
    for (const [c, capacity, hostBand, expected] of cases) {
        const out = S.waitReasonFor(c, { capacity, hostBand });
        assert.equal(out.wait_reason, expected, `${c.lane_id}: got ${out.wait_reason}`);
        assert.ok(S.WAIT_REASONS.includes(out.wait_reason));
    }
});

await test("UNMEASURED IS NOT PERMISSION — every unmeasured input yields unknown", () => {
    for (const missing of [
        { authorized: null },
        { dependenciesReady: null },
    ]) {
        const out = S.waitReasonFor(cand({ laneId: "u", ...missing }), { capacity: SEATS(4) });
        assert.equal(out.wait_reason, "unknown", JSON.stringify(missing));
    }
    // And unmeasured CAPACITY is unknown, never "there is room".
    assert.equal(S.waitReasonFor(cand({ laneId: "u2" }), { capacity: { provider_seat: { available: null } } }).wait_reason, "unknown");
    assert.equal(S.isEligible(cand({ laneId: "u3", authorized: null }), { capacity: SEATS(4) }).eligible, false);
});

await test("the most actionable reason wins: a person outranks a full machine", () => {
    // Blocked on a person AND out of seats. Freeing a seat would not move it.
    const out = S.waitReasonFor(cand({ laneId: "p", directorJudgmentRequired: true }), { capacity: SEATS(0) });
    assert.equal(out.wait_reason, "director_answer");
});

/* ── Priority, fairness, determinism ─────────────────────────────────────── */

await test("priority classes order the plan, highest first", () => {
    const cs = ["maintenance", "planned", "control_plane", "director_explicit"]
        .map((k, i) => cand({ laneId: `lane_${i}`, priorityClass: k }));
    const ranked = S.rankCandidates(cs).map((r) => r.candidate.priority_class);
    assert.deepEqual(ranked, ["director_explicit", "control_plane", "planned", "maintenance"]);
});

await test("HYGIENE MUST NOT OUTRANK PRODUCT WORK BY RUNNING OFTEN", () => {
    const hygiene = cand({ laneId: "hyg", priorityClass: "maintenance", readySince: ready(10 * MIN) });
    const product = cand({ laneId: "prod", priorityClass: "planned", readySince: ready(1 * MIN) });
    const order = S.rankCandidates([hygiene, product]).map((r) => r.candidate.lane_id);
    assert.deepEqual(order, ["prod", "hyg"]);
});

await test("but an ordinary lane starved past the window is promoted — by exactly one class", () => {
    const starved = cand({ laneId: "old", priorityClass: "maintenance", readySince: ready(S.FAIRNESS_POLICY_V1.starvation_ms + MIN) });
    const r = S.effectiveRank(starved);
    assert.equal(r.promoted, true);
    assert.equal(r.base - r.effective, S.FAIRNESS_POLICY_V1.max_promotion_classes);
});

await test("fairness never promotes past safety, and never past explicit Director priority", () => {
    const ancient = ready(10 * S.FAIRNESS_POLICY_V1.starvation_ms);
    for (const cls of ["planned", "maintenance", "dependency_cleared"]) {
        const r = S.effectiveRank(cand({ laneId: "x", priorityClass: cls, readySince: ancient }));
        assert.ok(r.effective > S.FAIRNESS_POLICY_V1.never_promoted_past,
            `${cls} was promoted into or past the safety band`);
    }
    // A Director-priority lane still wins against anything, however long the wait.
    const order = S.rankCandidates([
        cand({ laneId: "starved", priorityClass: "maintenance", readySince: ancient }),
        cand({ laneId: "director", priorityClass: "director_explicit", readySince: ready(1) }),
    ]).map((r) => r.candidate.lane_id);
    assert.deepEqual(order, ["director", "starved"]);
});

await test("ordering is total and deterministic — two identical ticks agree", () => {
    const cs = ["b", "a", "c"].map((id) => cand({ laneId: id, priorityClass: "planned", readySince: ready(5 * MIN) }));
    const once = S.rankCandidates(cs).map((r) => r.candidate.lane_id);
    const twice = S.rankCandidates([...cs].reverse()).map((r) => r.candidate.lane_id);
    assert.deepEqual(once, twice, "ties must break on lane id, not on input order");
});

/* ── The plan, and the idle answer ───────────────────────────────────────── */

await test("an idle seat with nothing worth running is a correct outcome that says so", () => {
    const plan = S.planSchedule({ candidates: [], capacity: SEATS(8), hostBand: "NORMAL" });
    assert.equal(plan.dispatch.length, 0);
    assert.equal(plan.idle_capacity_explained.reason, "no_authorized_work");
    assert.equal(plan.idle_capacity_explained.seats_available, 8);
});

await test("when candidates exist but none is eligible, the plan names the dominant reason", () => {
    const plan = S.planSchedule({
        candidates: [cand({ laneId: "a", dependenciesReady: false }), cand({ laneId: "b", dependenciesReady: false })],
        capacity: SEATS(8),
    });
    assert.equal(plan.dispatch.length, 0);
    assert.equal(plan.idle_capacity_explained.reason, "dependency");
    assert.equal(plan.idle_capacity_explained.by_wait_reason.dependency, 2);
});

await test("the plan is bounded, and the overflow is deferred rather than dropped", () => {
    const cs = Array.from({ length: 6 }, (_, i) => cand({ laneId: `l${i}` }));
    const plan = S.planSchedule({ candidates: cs, capacity: SEATS(8), maxDispatch: 2 });
    assert.equal(plan.dispatch.length, 2);
    assert.equal(plan.deferred.length, 4);
    assert.equal(plan.considered, 6);
});

await test("NO DUPLICATE DISPATCH — the same work in flight is not selected again", () => {
    const c = cand({ laneId: "lane_dup" });
    const key = S.dispatchKey(c);
    assert.equal(key, "sched:lane_dup:start");
    // The key is stable across ticks: it is keyed on the work, not the moment.
    assert.equal(S.dispatchKey(cand({ laneId: "lane_dup" })), key);
    const plan = S.planSchedule({ candidates: [c], capacity: SEATS(8), inFlight: [key] });
    assert.equal(plan.dispatch.length, 0);
    assert.equal(plan.in_flight.length, 1);
});

await test("a constrained host holds ordinary work and lets control-plane work through", () => {
    const plan = S.planSchedule({
        candidates: [cand({ laneId: "ordinary" }), cand({ laneId: "safety", priorityClass: "control_plane" })],
        capacity: SEATS(8), hostBand: "CONSTRAINED",
    });
    assert.deepEqual(plan.dispatch.map((d) => d.lane_id), ["safety"]);
    assert.equal(plan.waiting.find((w) => w.lane_id === "ordinary").wait_reason, "host_constrained");
});

/* ── Continuation ────────────────────────────────────────────────────────── */

const step = (o = {}) => ({ kind: "run_tests", deterministic: true, within_policy: true, bounded: true, ...o });

await test("AUTO-CONTINUE requires every condition, measured", () => {
    const ok = S.continuationDecision(cand({ laneId: "c", nextAction: step() }));
    assert.equal(ok.verdict, "auto_continue");
    assert.equal(Object.values(ok.conditions).every(Boolean), true);
});

await test("each missing condition alone is enough to require the Director", () => {
    const cases = [
        ["already_authorized", { authorized: false }],
        ["deterministic_next_action", { nextAction: step({ deterministic: false }) }],
        ["within_policy", { nextAction: step({ within_policy: false }) }],
        ["dependencies_ready", { dependenciesReady: false }],
        ["no_new_judgment", { directorJudgmentRequired: true }],
        ["no_unresolved_blocker", { blockedBy: { kind: "director" } }],
        ["no_conflicting_finding", { findingConstraints: [{ id: "f", blocks: true }] }],
        ["bounded_and_auditable", { nextAction: step({ bounded: false }) }],
    ];
    for (const [name, over] of cases) {
        const d = S.continuationDecision(cand({ laneId: "c", nextAction: step(), ...over }));
        assert.equal(d.verdict, "director_required", name);
        assert.ok(d.unmet.includes(name), `${name} should be named as unmet, got ${d.unmet}`);
    }
});

await test("no next action is 'none', never a silent auto-continue", () => {
    assert.equal(S.continuationDecision(cand({ laneId: "c" })).verdict, "none");
});

await test("the continuation evaluator does not dispatch — one planner, not two", () => {
    const src = readFileSync(new URL("../lib/vacilando/work-scheduler.mjs", import.meta.url), "utf8");
    for (const forbidden of ["startLaneAgentSession", "createQueuedRun", "sendLaneInstruction", "execFile", "spawn("]) {
        assert.equal(src.includes(forbidden), false, `${forbidden} must not appear in the planner`);
    }
});

await test("the scheduler consumes truth and decides none of it", () => {
    // §3: it may not independently decide run existence, provider state, lane
    // closure, capacity, findings, health, approvals or dependencies.
    const src = readFileSync(new URL("../lib/vacilando/work-scheduler.mjs", import.meta.url), "utf8");
    assert.equal(/^import /m.test(src), false, "the planner imports nothing; every fact is passed in");
});

/* ── §18 — unread output ─────────────────────────────────────────────────── */

const note = (o = {}) => ({ lane_id: "l1", event_type: "complete", created_at: "2026-09-06T20:00:00Z", summary: "done", ...o });

await test("L1 — completed provider output after the last view shows the lane as unread", () => {
    const v = V.laneAttentionView({ laneId: "l1", notifications: [note()], runState: "COMPLETE" });
    assert.equal(v.has_unread_output, true);
    assert.equal(v.unread_count, 1);
    assert.equal(v.label, "Completed · New");
    assert.equal(v.treatment.colour_only, false, "colour alone is not a treatment");
});

await test("L2 — acknowledging through the canonical mechanism clears the unread state", () => {
    const v = V.laneAttentionView({ laneId: "l1", notifications: [note({ seen_at: "2026-09-06T20:05:00Z" })], runState: "COMPLETE" });
    assert.equal(v.has_unread_output, false);
    assert.equal(v.label, "Completed");
    assert.equal(v.treatment, null);
    // And the clearing mechanism is the existing owner's, not a new one.
    assert.equal(typeof N.markLaneNotificationsSeen, "function");
});

await test("L3 — an ordinary ready lane with nothing unseen shows no unread marker", () => {
    const v = V.laneAttentionView({ laneId: "l1", notifications: [], runState: null });
    assert.equal(v.has_unread_output, false);
    assert.equal(v.label, "Ready");
});

await test("L4 — NEEDS_ANSWER stays independently visible, and unread is not an obligation", () => {
    // Completed work: unread, but nothing is required.
    const completed = V.laneAttentionView({ laneId: "l1", notifications: [note()], runState: "COMPLETE" });
    assert.equal(completed.has_unread_output, true);
    assert.equal(completed.director_category, "completed");
    assert.equal(completed.requires_director, false, "unread must not imply an obligation");

    // Needs input: unread AND an obligation, reported as two separate facts.
    const asking = V.laneAttentionView({ laneId: "l1", notifications: [note({ event_type: "needs_input" })], runState: "NEEDS_INPUT" });
    assert.equal(asking.has_unread_output, true);
    assert.equal(asking.director_category, "needs_answer");
    assert.equal(asking.requires_director, true);

    // An obligation whose output has been read is still an obligation.
    const readButOwed = V.laneAttentionView({ laneId: "l1", notifications: [note({ event_type: "needs_input", seen_at: "x" })], runState: "NEEDS_INPUT" });
    assert.equal(readButOwed.has_unread_output, false);
    assert.equal(readButOwed.requires_director, true);
});

await test("L5 — unread state is durable because it is derived from a durable store", () => {
    // The view holds nothing: re-deriving from the same records gives the same
    // answer, which is what makes a restart uneventful.
    const notes = [note(), note({ created_at: "2026-09-06T20:01:00Z" })];
    const a = V.laneAttentionView({ laneId: "l1", notifications: notes, runState: "COMPLETE" });
    const b = V.laneAttentionView({ laneId: "l1", notifications: JSON.parse(JSON.stringify(notes)), runState: "COMPLETE" });
    assert.deepEqual(a, b);
    assert.equal(a.unread_count, 2, "and it does not duplicate or lose records");
});

await test("L6 — NO NEW EXECUTION-STATE SOURCE OF TRUTH WAS CREATED", () => {
    const src = readFileSync(new URL("../lib/vacilando/lane-attention-view.mjs", import.meta.url), "utf8");
    for (const forbidden of ["writeFileSync", "appendFileSync", "renameSync", "mkdirSync", "transitionExecutionRun", "saveRequest"]) {
        assert.equal(src.includes(forbidden), false, `${forbidden} must not appear: this is a view, not a store`);
    }
    // It reads the notification owner and nothing else stateful.
    assert.match(src, /from "\.\/lane-notifications\.mjs"/);
});

await test("only completed provider output counts as unread, not every event", () => {
    const v = V.laneAttentionView({
        laneId: "l1",
        notifications: [note({ event_type: "governed_action_requested" }), note({ event_type: "server_restarted" })],
        runState: null,
    });
    assert.equal(v.has_unread_output, false, "activity is not unread output");
});

await test("the rollup separates unread from obligation", () => {
    const views = [
        V.laneAttentionView({ laneId: "a", notifications: [note({ lane_id: "a" })], runState: "COMPLETE" }),
        V.laneAttentionView({ laneId: "b", notifications: [note({ lane_id: "b", event_type: "needs_input" })], runState: "NEEDS_INPUT" }),
        V.laneAttentionView({ laneId: "c", notifications: [], runState: null }),
    ];
    const r = V.attentionRollup(views);
    assert.equal(r.lanes, 3);
    assert.equal(r.with_unread_output, 2);
    assert.equal(r.requiring_director, 1);
    assert.equal(r.by_category.completed, 1);
    assert.equal(r.by_category.needs_answer, 1);
});
