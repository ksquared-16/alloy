#!/usr/bin/env node
/**
 * AN ORCHESTRATION RUN'S WORK HAPPENS IN OTHER LANES.
 *
 * THE DEFECT THIS COVERS. Every liveness signal in execution-stale assumed the
 * run's worker touches its OWN lane: a heartbeat report, a busy session,
 * movement in its own worktree. A control run has none of those shapes. It
 * dispatches bounded work to other lanes, watches telemetry and refills the
 * cohort; its session rests in ACTIVE between actions (deliberately not
 * "busy"), and it may never touch a git control file of its own.
 *
 * So during the capacity experiment the Capacity lane's own run was repeatedly
 * collected as ABANDONED *while it was dispatching the cohort it was measuring*
 * — and then vanished from the observed cohort, which is the one thing it
 * existed to observe. Idle provider process is not an abandoned run.
 *
 * These assert the general rule, not a capacity-lane exemption: recent governed
 * work protects the run that caused it, and a genuinely dead worker still ages
 * out normally.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
    GOVERNED_ACTION_RECENT_MS,
    STALE_SETTLE_MS,
    classifyExecutionRunStale,
} from "../lib/vacilando/execution-stale.mjs";

const NOW = Date.parse("2026-09-05T12:00:00.000Z");

/** A run that has been EXECUTING long enough to be past the settle window. */
function orchestrationRun() {
    const started = new Date(NOW - STALE_SETTLE_MS - 10 * 60 * 1000).toISOString();
    return {
        run_id: "erun_orchestrator01",
        lane_id: "lane_db3431e755a8",
        state: "EXECUTING",
        origin: "operator",
        started_at: started,
        worker_report_count: 0,
        transitions: [{ from_state: "QUEUED", to_state: "EXECUTING", occurred_at: started, origin: "operator" }],
    };
}

/**
 * The exact shape that was being abandoned: provider idle between actions, so
 * no heartbeat, no busy session, no movement in its own worktree.
 */
function idleProviderFacts(overrides = {}) {
    return {
        now_ms: NOW,
        session_state: "ACTIVE",          // resting between turns, NOT busy
        session_alive: true,
        worker_report_ms: null,           // no run-status report in the window
        worktree_activity_ms: null,       // orchestration touches other lanes
        activity_ms: null,
        open_resource: false,
        in_flight_continuation: false,
        ...overrides,
    };
}

test("an orchestration run dispatching governed work is ACTIVE, not abandoned", () => {
    const verdict = classifyExecutionRunStale(orchestrationRun(), idleProviderFacts({
        governed_action_ms: NOW - 60 * 1000,       // dispatched a minute ago
    }));
    assert.equal(verdict.class, "active", "recent governed work must protect the run that caused it");
    assert.equal(verdict.reason, "governed_action_activity");
});

test("the same run WITHOUT governed activity is not protected by this signal", () => {
    // The control: proves the case above passes because of the new evidence and
    // not because the fixture was protective for some other reason.
    const verdict = classifyExecutionRunStale(orchestrationRun(), idleProviderFacts({
        governed_action_ms: null,
    }));
    assert.notEqual(verdict.reason, "governed_action_activity");
    assert.notEqual(verdict.class, "active", "with no live signal at all this must not read as active");
});

test("governed activity that is genuinely old does not protect forever", () => {
    const verdict = classifyExecutionRunStale(orchestrationRun(), idleProviderFacts({
        governed_action_ms: NOW - GOVERNED_ACTION_RECENT_MS - 60 * 1000,
    }));
    assert.notEqual(verdict.reason, "governed_action_activity",
        "a worker whose governed actions stopped long ago must still age out");
});

test("idle provider between actions does not by itself mean abandoned", () => {
    // The instruction's rule, stated directly: idle provider process != abandoned run.
    const verdict = classifyExecutionRunStale(orchestrationRun(), idleProviderFacts({
        governed_action_ms: NOW - 5 * 60 * 1000,
    }));
    assert.equal(verdict.class, "active");
    assert.equal(verdict.evidence.session_state, "ACTIVE", "the session was idle, and that was fine");
    assert.equal(verdict.evidence.worker_heartbeat_recent, false, "no heartbeat was needed");
    assert.equal(verdict.evidence.worktree_activity_recent, false, "no own-worktree movement was needed");
});

test("a real dead worker still reconciles normally", () => {
    // No session, no heartbeat ever, no worktree movement, no governed work.
    const verdict = classifyExecutionRunStale(orchestrationRun(), idleProviderFacts({
        session_state: null,
        session_alive: false,
        governed_action_ms: null,
    }));
    assert.notEqual(verdict.class, "active", "the fix must not make every run immortal");
});

test("a subsequent control action continues the SAME run", () => {
    // Sequenced: dispatch, wait past the settle, dispatch again. The run must be
    // continuously active — never abandoned between the two actions.
    const run = orchestrationRun();
    const first = classifyExecutionRunStale(run, idleProviderFacts({ governed_action_ms: NOW - 30 * 60 * 1000 }));
    const second = classifyExecutionRunStale(run, idleProviderFacts({ governed_action_ms: NOW - 30 * 1000 }));
    assert.equal(first.class, "active", "still protected 30 minutes after the first dispatch");
    assert.equal(second.class, "active", "and after the next one");
    assert.equal(second.reason, "governed_action_activity");
});
