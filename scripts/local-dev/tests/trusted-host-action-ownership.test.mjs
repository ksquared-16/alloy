/**
 * Ownership-safe deduplication of trusted-host actions.
 *
 * Reuse is an identity claim: adopting a stored action says it is the same piece of work, so a grant
 * issued for the new request may drive it. When that claim is wrong the consequences are not
 * theoretical — a record owned by `run_x`, written by a diagnostic reproduction, was adopted for
 * `erun_89f9cbad389cc851` because both carried an undefined `queryHash` and `undefined === undefined`
 * matched. `grantAuthorizesAction` refused it with `grant_run_mismatch`, correctly, and the request
 * bounced back to `awaiting_operator` on every approval. Two operator approvals could not execute.
 *
 * Every case here runs against an ISOLATED store: `ALLOY_RUNTIME_ROOT` is pointed at a temp
 * directory before the module is loaded, which is the second half of the fix — the reproduction that
 * caused the contamination could not isolate itself because the path was frozen at import.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// Isolate BEFORE importing: the store path is read per call, so this contains every write below.
const ISOLATED = mkdtempSync(join(tmpdir(), "tha-ownership-"));
process.env.ALLOY_RUNTIME_ROOT = ISOLATED;

const { ACTION_TYPES } = await import("../lib/vacilando/trusted-host-action-registry.mjs");
const {
    grantAuthorizesAction,
    requestTrustedHostAction,
    sameActionOwnership,
} = await import("../lib/vacilando/trusted-host-actions.mjs");

const MISSION = "repo_alloy";
const LANE = "lane_73a897409906";
const RUN = "erun_89f9cbad389cc851";
const TYPE = ACTION_TYPES.ENVIRONMENT_RESTORE_QA_SESSION;

const req = (over = {}) => requestTrustedHostAction({
    missionId: MISSION,
    assignmentId: RUN,
    executionSessionId: RUN,
    requestedBy: "director",
    actionType: TYPE,
    inputs: { laneId: LANE },
    nowMs: Date.now(),
    ...over,
});

test("the isolated store is actually isolated — nothing lands in the shared one", () => {
    assert.equal(process.env.ALLOY_RUNTIME_ROOT, ISOLATED);
    assert.ok(ISOLATED.startsWith(tmpdir()), "writes must go to a temp directory");
});

test("an exact ownership match remains reusable", () => {
    const first = req();
    assert.equal(first.ok, true);
    const second = req();
    assert.equal(second.ok, true);
    assert.equal(second.deduped, true, "identical ownership should still dedupe");
    assert.equal(second.action.id, first.action.id);
});

test("a different execution session is NOT deduplicated — the exact contamination case", () => {
    const mine = req();
    const foreign = req({ executionSessionId: "run_x", assignmentId: "run_x" });
    assert.equal(foreign.ok, true);
    assert.notEqual(foreign.action.id, mine.action.id, "run_x must not adopt the run's action");
    assert.equal(foreign.deduped, undefined);
});

test("a different assignment is NOT deduplicated", () => {
    const mine = req();
    const other = req({ assignmentId: "assignment_other" });
    assert.notEqual(other.action.id, mine.action.id);
});

test("a different lane is NOT deduplicated", () => {
    const mine = req();
    const other = req({ inputs: { laneId: "lane_faacca6079ad" } });
    assert.notEqual(other.action.id, mine.action.id, "another lane's work is not this lane's work");
});

test("the ownership predicate is null-tolerant, so lane-less actions still dedupe", () => {
    // Pre-existing census behaviour: both sides carry no run/assignment/lane and remain reusable.
    assert.equal(sameActionOwnership({ executionSessionId: null, assignmentId: null, inputs: {} }, {}), true);
    assert.equal(sameActionOwnership({ executionSessionId: undefined, assignmentId: undefined, inputs: {} }, {}), true);
});

test("a grant refuses a foreign-owned action, and authorizes a correctly owned one", () => {
    const grant = {
        status: "ACTIVE",
        action_key: TYPE,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        run_id: RUN,
        repository_id: MISSION,
    };
    const foreign = { actionType: TYPE, missionId: MISSION, executionSessionId: "run_x", inputs: { laneId: LANE } };
    const mine = { actionType: TYPE, missionId: MISSION, executionSessionId: RUN, inputs: { laneId: LANE } };
    assert.equal(grantAuthorizesAction(grant, foreign).ok, false, "grant must refuse a foreign action");
    assert.equal(grantAuthorizesAction(grant, foreign).error, "grant_run_mismatch");
    assert.equal(grantAuthorizesAction(grant, mine).ok, true, "grant must authorize its own action");
});

test("REGRESSION CONTROL: the old broad dedupe would adopt the foreign action", () => {
    /*
     * Models the predicate as it was — action type, dedupe key and state only. If ownership checking
     * were removed, `find` would return the run_x record for this request, which is exactly how two
     * operator approvals were spent on an action the grant could never authorize.
     */
    const stored = [{
        actionType: TYPE, executionSessionId: "run_x", assignmentId: "run_x",
        inputs: { laneId: LANE }, state: "policy_review", id: "tha_contaminated",
    }];
    const broadMatch = stored.find((a) =>
        a.actionType === TYPE
        && a.inputs?.queryHash === undefined
        && ["requested", "policy_review", "authorized", "executing", "completed", "retrying"].includes(a.state));
    assert.ok(broadMatch, "the old predicate DID adopt it — this is the defect being fixed");

    const ownershipMatch = stored.find((a) =>
        a.actionType === TYPE
        && sameActionOwnership(a, { executionSessionId: RUN, assignmentId: RUN, inputs: { laneId: LANE } }));
    assert.equal(ownershipMatch, undefined, "the ownership-safe predicate must refuse it");
});
