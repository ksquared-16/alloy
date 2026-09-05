#!/usr/bin/env node
/**
 * ONE CANONICAL OWNER OF RUN IDENTITY.
 *
 * THE SPLIT-BRAIN THIS COVERS, with the numbers that made it undeniable. After
 * run erun_9bccef4667cc68ef vanished from the execution-run store, FOURTEEN
 * governed actions remained bound to it and TWELVE COMPLETED — push, pull
 * request, merge, toolkit install, cross-lane dispatch — every one authorized
 * against a run `getExecutionRun` reported as absent. `checkpoint-create` asked
 * the same question, got the honest answer, and refused.
 *
 * So two subsystems disagreed about whether the same run existed, and the one
 * that could promote code to staging was the one that had stopped checking.
 * `requestGovernedAction` read the canonical store and discarded the answer,
 * trusting the caller-supplied run id instead.
 *
 * The ownership map that made this possible, measured on the live host:
 *
 *   execution-runs/runs.json          16 run ids   CANONICAL
 *   governed-actions/requests.json    66 run ids   authorized work anyway
 *   execution-runs/admissions.json   153 run ids   references only
 *   execution-runs/agent-sessions    51 run ids    references only
 *   checkpoint-adoptions.jsonl        24 run ids   append-only audit
 *
 * Only the first is canonical. These assert that everything else holds
 * references, never an independently authoritative identity.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
    createQueuedRun,
    executionRunStorePath,
    getExecutionRun,
    resetExecutionRunsForTests,
} from "../lib/vacilando/execution-run.mjs";
import { createDurableLane, resetDevelopmentLanesForTests } from "../lib/vacilando/development-lane.mjs";
import { requestGovernedAction } from "../lib/vacilando/governed-action-request.mjs";

let LANE = null;
const MISSION = "msn_identity_probe";

/**
 * A root with a REAL registered lane. Without one the request is refused for
 * `lane_not_found` long before the run invariant is reached, and the test would
 * pass while asserting nothing about run identity.
 */
function freshRoot() {
    const root = mkdtempSync(join(tmpdir(), "vac-identity-"));
    // Explicit root: the helpers default to ALLOY_RUNTIME_ROOT, which in a worker
    // shell is the LIVE gateway root. Calling them bare wiped the real registries.
    resetExecutionRunsForTests(root);
    resetDevelopmentLanesForTests(root);
    const wt = join(root, "wt-identity");
    mkdirSync(wt, { recursive: true });
    const made = createDurableLane({
        name: "Identity",
        binding: {
            worktree_path: wt,
            worktree_name: "wt-identity",
            branch: "agent/claude/1-identity",
            provider: "claude",
            tmux_session: "alloy-identity",
        },
        origin: "adopted",
        root,
    });
    LANE = made?.lane?.lane_id || made?.lane_id;
    assert.ok(LANE, "the fixture must register a lane");
    return root;
}

/** A governed request that is well formed in every respect except the run it names. */
function push(runId, root) {
    return requestGovernedAction({
        action_key: "repository.push",
        target: "staging",
        purpose: "regression probe",
        title: "probe",
        requested_mode: "promotion",
        reason_worker_cannot_execute: "probe of the canonical-run invariant",
        run_id: runId,
        lane_id: LANE,
        mission_id: MISSION,
        inputs: {
            repository: "ksquared-16/alloy",
            branch: "feat/probe",
            expected_head_sha: "0".repeat(40),
            worktree_path: "/tmp/probe",
        },
    }, { processNow: false, root });
}

/* ── 5. Canonical run missing → governance may not continue on stale identity ─ */

test("a governed action naming a run the canonical owner lacks is REFUSED", () => {
    const root = freshRoot();
    const out = push("erun_000000000000dead", root);
    assert.equal(out.ok, false, "a ghost run must never authorize governed work");
    assert.equal(out.error, "run_not_found");
});

test("the refusal survives the store being emptied under it", () => {
    // The live sequence: the run existed, work was authorized, the store lost
    // it, and governance carried on regardless. It must not.
    const root = freshRoot();
    const made = createQueuedRun({ laneId: LANE, instruction: "real work", root });
    assert.equal(made.ok, true, made.error);
    assert.equal(push(made.run.run_id, root).ok, true, "a real run must still be usable");

    writeFileSync(executionRunStorePath(root), JSON.stringify({ lanes: {} }), "utf8");
    resetExecutionRunsForTests(root);

    assert.equal(getExecutionRun(made.run.run_id, root), null, "the canonical owner has lost it");
    const after = push(made.run.run_id, root);
    assert.equal(after.ok, false, "governance must not outlive canonical run truth");
    assert.equal(after.error, "run_not_found");
});

test("governance and checkpoint now resolve the SAME run truth", () => {
    // The defect was precisely that these two disagreed. Asserted as agreement
    // rather than as two separate behaviours, because agreement is the property.
    const root = freshRoot();
    const made = createQueuedRun({ laneId: LANE, instruction: "real work", root });
    const id = made.run.run_id;

    const canonicalSays = (runId) => getExecutionRun(runId, root) !== null;
    const governanceSays = (runId) => push(runId, root).error !== "run_not_found";

    assert.equal(canonicalSays(id), governanceSays(id), "both must see the live run");
    assert.equal(canonicalSays("erun_000000000000dead"), governanceSays("erun_000000000000dead"),
        "and both must see the absence of a dead one");
});

/* ── A request that names NO run is still legitimate ────────────────────── */

test("naming no run at all is unaffected", () => {
    // Plenty of governed work legitimately has no run. The invariant is about
    // naming a ghost, not about requiring a run.
    const root = freshRoot();
    const out = requestGovernedAction({
        action_key: "repository.push",
        target: "staging",
        purpose: "regression probe",
        title: "probe",
        requested_mode: "promotion",
        reason_worker_cannot_execute: "probe with no run named",
        lane_id: LANE,
        mission_id: MISSION,
        inputs: {
            repository: "ksquared-16/alloy",
            branch: "feat/probe",
            expected_head_sha: "0".repeat(40),
            worktree_path: "/tmp/probe",
        },
    }, { processNow: false, root });
    assert.notEqual(out.error, "run_not_found", "an unnamed run must not be treated as a missing one");
});

/* ── The canonical store stays the only authority ───────────────────────── */

test("a live run authorizes governed work, as it always did", () => {
    const root = freshRoot();
    const made = createQueuedRun({ laneId: LANE, instruction: "real work", root });
    const out = push(made.run.run_id, root);
    assert.equal(out.ok, true, out.error);
});
