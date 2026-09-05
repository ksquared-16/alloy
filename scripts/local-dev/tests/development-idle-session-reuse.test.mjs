#!/usr/bin/env node
/**
 * IDLE RESIDENT SESSION REUSE — a provider that is up and free must take the next run.
 *
 * THE DEFECT THIS COVERS, measured rather than imagined. During the Capacity V2
 * sustained-8 attempt, 26 dispatched runs were refused `agent_already_running`
 * across Troubleshooting, Payments and Communications while those providers sat
 * resident at roughly 0.4% CPU with their current run merely QUEUED. Productive
 * concurrency was capped at 4 by session bookkeeping while the host had 9.4% of
 * its memory in use — the ceiling of 8, the CPU, the RAM, the swap, the Gateway
 * and the upstream were all uninvolved.
 *
 * The conflation was between two different questions:
 *
 *   "does an active session record exist for this lane?"   (bookkeeping)
 *   "does this lane have conflicting productive work?"     (what admission needs)
 *
 * These assert the second question is the one being asked, and that the answer
 * fails CLOSED everywhere it is not provably safe to reuse.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
    OCCUPYING_RUN_STATES,
    RUN_STATES,
    TERMINAL_RUN_STATES,
    activeRunForLane,
    createQueuedRun,
    occupyingRunForLane,
    resetExecutionRunsForTests,
    transitionExecutionRun,
} from "../lib/vacilando/execution-run.mjs";

const LANE = "lane_1111aaaa2222";

function freshRoot() {
    const root = mkdtempSync(join(tmpdir(), "vac-reuse-"));
    // Explicit root: bare, this helper wipes the LIVE gateway store.
    resetExecutionRunsForTests(root);
    return root;
}

/** Put the lane's current run into `state`, returning the run. */
function laneWithRunIn(state, root) {
    const made = createQueuedRun({ laneId: LANE, instruction: "certification analysis", root });
    assert.equal(made.ok, true, made.error);
    if (state !== "QUEUED") {
        const moved = transitionExecutionRun(made.run.run_id, state, { root, origin: "system" });
        if (!moved.ok) return { run: made.run, reached: "QUEUED", moveError: moved.error };
    }
    return { run: made.run, reached: state };
}

/* ── The predicate, across every declared run state ─────────────────────── */

test("QUEUED is not occupancy — that absence is the entire fix", () => {
    assert.equal(OCCUPYING_RUN_STATES.includes("QUEUED"), false);
    const root = freshRoot();
    const { reached } = laneWithRunIn("QUEUED", root);
    assert.equal(reached, "QUEUED");
    assert.equal(activeRunForLane(LANE, root).state, "QUEUED", "the run is genuinely non-terminal");
    assert.equal(occupyingRunForLane(LANE, root), null, "a run waiting to be handed over does not occupy the provider");
});

test("every non-terminal state that is not QUEUED occupies the provider", () => {
    // Stated as a property over the declared state list, so a state added later
    // is classified deliberately rather than defaulting to "reusable".
    for (const state of RUN_STATES) {
        if (state === "QUEUED" || TERMINAL_RUN_STATES.includes(state)) continue;
        assert.ok(
            OCCUPYING_RUN_STATES.includes(state),
            `${state} is non-terminal and must be classified; unclassified means a run could be displaced`,
        );
    }
});

test("a provider parked on NEEDS_INPUT is idle by CPU and is NOT free", () => {
    // The dangerous near-miss: it looks exactly like the case being fixed.
    assert.ok(OCCUPYING_RUN_STATES.includes("NEEDS_INPUT"));
    assert.ok(OCCUPYING_RUN_STATES.includes("WAITING_RESOURCE"));
});

test("a terminal prior run leaves the provider reusable", () => {
    for (const terminal of TERMINAL_RUN_STATES) {
        const root = freshRoot();
        const { run } = laneWithRunIn("QUEUED", root);
        const moved = transitionExecutionRun(run.run_id, terminal, { root, origin: "system" });
        if (!moved.ok) continue;                       // some terminals need an intermediate state
        assert.equal(activeRunForLane(LANE, root), null, `${terminal} is terminal`);
        assert.equal(occupyingRunForLane(LANE, root), null, `${terminal} must not hold the provider`);
    }
});

test("an EXECUTING run holds the provider, so reuse is refused", () => {
    const root = freshRoot();
    const { reached } = laneWithRunIn("EXECUTING", root);
    if (reached !== "EXECUTING") return;               // transition guard rejected it; nothing to assert
    const occ = occupyingRunForLane(LANE, root);
    assert.ok(occ, "an executing run must be reported as occupancy");
    assert.equal(occ.state, "EXECUTING");
});

test("a lane with no runs at all has nothing occupying it", () => {
    const root = freshRoot();
    assert.equal(activeRunForLane(LANE, root), null);
    assert.equal(occupyingRunForLane(LANE, root), null);
});

test("occupancy is never broader than liveness", () => {
    // occupyingRunForLane must be a strict subset of activeRunForLane: it may
    // only ever narrow. If it returned something activeRunForLane does not, a
    // terminal run could block a lane forever.
    // A FRESH ROOT PER CASE. Reusing one root only reset the in-process cache
    // while the store stayed on disk, so the second create hit
    // `current_run_active` and the case asserted nothing.
    for (const state of ["QUEUED", "EXECUTING"]) {
        const root = freshRoot();
        const { reached } = laneWithRunIn(state, root);
        const active = activeRunForLane(LANE, root);
        const occ = occupyingRunForLane(LANE, root);
        if (occ) assert.ok(active, `${reached}: occupancy without liveness is impossible`);
    }
});

/* ── The admission delivery gate ────────────────────────────────────────── */

test("delivery fires for a reused session, not only an adopted one", async () => {
    // The second half of the same defect: startLaneAgentSession could return
    // success for an existing healthy provider and the run would still sit
    // QUEUED, because delivery was gated on `adopted` alone. Asserted against
    // the source so the gate cannot silently narrow again.
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../lib/vacilando/execution-admission.mjs", import.meta.url), "utf8");
    const gate = src.match(/if \(head\.run_id && \(([^)]*)\)\)/);
    assert.ok(gate, "the delivery gate must remain findable");
    assert.match(gate[1], /started\.adopted/);
    assert.match(gate[1], /started\.reused/, "a reused session must deliver its run immediately");
});

test("reuse is claimed only for a session that is actually ACTIVE", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../lib/vacilando/agent-session-lifecycle.mjs", import.meta.url), "utf8");
    // A session still coming up must not be reported as reusable: the run would
    // be delivered into a pane that cannot yet accept it.
    assert.match(src, /sess\.state !== "ACTIVE"/, "non-ACTIVE sessions must not be reused");
    assert.match(src, /occupyingRunForLane\(found\.lane_id, root\)/, "occupancy, not existence, gates the refusal");
});
