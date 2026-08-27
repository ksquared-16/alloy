/**
 * Controls for `environment.assign_qa_identity_access`.
 *
 * This action writes a membership row, so the property that matters is that no row is written unless
 * an operator approved exactly this request for exactly this registry-resolved identity. Every case
 * drives the executor with a fake assigner that RECORDS whether it ran — asserting only on returned
 * status would pass against an implementation that wrote the row first and refused afterwards.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ACTION_TYPES, getActionDefinition, listRegisteredActions } from "../lib/vacilando/trusted-host-action-registry.mjs";
import {
    ASSIGNABLE_ROLE,
    FORBIDDEN_ASSIGN_INPUTS,
    executeAssignQaAccessSync,
    safeAssignFailure,
    validateAssignQaAccessInputs,
} from "../lib/vacilando/qa-access-assign-action.mjs";

const LANE = "lane_73a897409906";
const IDENTITY = "qa-slot5-refactor@example.com";

const laneFor = (over = {}) => () => ({
    lane_id: LANE,
    binding: { worktree_path: "/Users/Kelly/Code/alloy-worktrees/wt5-runtime-performance-ux-completion", slot: 5 },
    slot: 5,
    ...over,
});
const action = (over = {}) => ({
    actionType: ACTION_TYPES.ENVIRONMENT_ASSIGN_QA_IDENTITY_ACCESS,
    inputs: { laneId: LANE },
    ...over,
});
const validGrant = () => ({
    status: "APPROVED",
    action_key: ACTION_TYPES.ENVIRONMENT_ASSIGN_QA_IDENTITY_ACCESS,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
});
function spyAssign(result = { ok: true, result: "assigned", mutated: true, user_id: "u1", org_id: "org1", memberships_for_user: 1, candidate_orgs_seen: 1 }) {
    const calls = [];
    const fn = (...a) => { calls.push(a); return result; };
    fn.calls = calls;
    return fn;
}

test("the action is registered, dispatchable and always requires operator approval", () => {
    const def = getActionDefinition(ACTION_TYPES.ENVIRONMENT_ASSIGN_QA_IDENTITY_ACCESS);
    assert.ok(def);
    assert.equal(def.alwaysRequiresOperatorApproval, true);
    assert.equal(def.riskClass, "privileged_write");
    assert.deepEqual(def.inputSchema.required, ["laneId"]);
    assert.ok(listRegisteredActions().map((a) => a.actionType).includes("environment.assign_qa_identity_access"));
});

test("a pending request writes nothing — no grant means no assignment child", () => {
    const assign = spyAssign();
    const r = executeAssignQaAccessSync({ action: action(), grant: null, assign, getLane: laneFor() });
    assert.equal(r.ok, false);
    assert.equal(r.failure_code, "grant_missing");
    assert.equal(r.mutated, false);
    assert.equal(assign.calls.length, 0, "no membership row may be written while pending");
});

test("the executor is SYNCHRONOUS", () => {
    assert.ok(typeof executeAssignQaAccessSync({ action: action(), grant: null })?.then !== "function");
});

test("denied, revoked, expired and mismatched grants all write nothing", () => {
    for (const code of ["grant_revoked", "grant_expired", "grant_already_used", "grant_action_mismatch"]) {
        const assign = spyAssign();
        const r = executeAssignQaAccessSync({
            action: action(), grant: validGrant(), assign, getLane: laneFor(),
            grantCheck: () => ({ ok: false, error: code }),
        });
        assert.equal(r.failure_code, code);
        assert.equal(assign.calls.length, 0);
    }
});

test("a caller cannot supply an org, a role, an email or any other target field", () => {
    for (const key of FORBIDDEN_ASSIGN_INPUTS) {
        const r = validateAssignQaAccessInputs({ laneId: LANE, [key]: "anything" });
        assert.equal(r.ok, false, `${key} must be refused`);
        assert.equal(r.error, "caller_supplied_forbidden_input");
    }
});

test("the role is a CONSTANT, not a parameter", () => {
    assert.equal(ASSIGNABLE_ROLE, "admin");
    // It is passed to the child by this module; a caller-supplied role is refused above.
    const assign = spyAssign();
    executeAssignQaAccessSync({
        action: action(), grant: validGrant(), assign, grantCheck: () => ({ ok: true }), getLane: laneFor(),
    });
    assert.equal(assign.calls[0][1].role, "admin");
});

test("a registry resolving a non-QA identity fails closed and writes nothing", () => {
    const assign = spyAssign();
    const r = executeAssignQaAccessSync({
        action: action(), grant: validGrant(), assign, grantCheck: () => ({ ok: true }),
        getLane: () => ({ lane_id: LANE, binding: { worktree_path: "/tmp/wt", slot: 99 }, slot: 99 }),
    });
    assert.equal(r.ok, false);
    assert.equal(assign.calls.length, 0, "a customer or employee account must never be granted access");
});

test("an unregistered lane or worktree disagreement fails closed", () => {
    for (const getLane of [() => null, laneFor({ binding: { worktree_path: "", slot: 5 } })]) {
        const assign = spyAssign();
        const r = executeAssignQaAccessSync({ action: action(), grant: validGrant(), assign, grantCheck: () => ({ ok: true }), getLane });
        assert.equal(r.ok, false);
        assert.equal(assign.calls.length, 0);
    }
});

test("an existing membership is idempotent and mutates nothing", () => {
    const assign = spyAssign({ ok: true, result: "already_exists", mutated: false, user_id: "u1", org_id: "org1", memberships_for_user: 1, candidate_orgs_seen: 1 });
    const r = executeAssignQaAccessSync({ action: action(), grant: validGrant(), assign, grantCheck: () => ({ ok: true }), getLane: laneFor() });
    assert.equal(r.ok, true);
    assert.equal(r.status, "already_exists");
    assert.equal(r.mutated, false);
});

test("an ambiguous canonical organization is REFUSED, not guessed", () => {
    // The child refuses when several organizations have admins; a wrong tenant is not recoverable.
    const assign = spyAssign({ ok: false, error: "canonical_org_ambiguous", detail: "3 organizations have admin members; refusing to choose" });
    const r = executeAssignQaAccessSync({ action: action(), grant: validGrant(), assign, grantCheck: () => ({ ok: true }), getLane: laneFor() });
    assert.equal(r.ok, false);
    assert.equal(r.failure_code, "canonical_org_ambiguous");
});

test("a duplicate membership is a failure, not a success", () => {
    const assign = spyAssign({ ok: false, error: "post_condition_failed", detail: "expected exactly one membership, found 2" });
    const r = executeAssignQaAccessSync({ action: action(), grant: validGrant(), assign, grantCheck: () => ({ ok: true }), getLane: laneFor() });
    assert.equal(r.ok, false);
    assert.equal(r.failure_code, "post_condition_failed");
});

test("assignment never reports a verified session", () => {
    const r = executeAssignQaAccessSync({
        action: action(), grant: validGrant(), assign: spyAssign(), grantCheck: () => ({ ok: true }), getLane: laneFor(),
    });
    assert.equal(r.ok, true);
    assert.equal(r.verified, false, "granting access is not signing in");
});

test("no result shape can carry secret-bearing material", () => {
    const results = [
        executeAssignQaAccessSync({ action: action(), grant: validGrant(), assign: spyAssign(), grantCheck: () => ({ ok: true }), getLane: laneFor() }),
        safeAssignFailure({ code: "assignment_failed", detail: "password=hunter2 access_token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhIn0.sig" }),
    ];
    for (const r of results) {
        const text = JSON.stringify(r);
        assert.ok(!/eyJ[A-Za-z0-9_-]{6,}\./.test(text));
        assert.ok(!/hunter2/.test(text));
        for (const k of Object.keys(r)) {
            assert.ok(!/token|cookie|secret|service_role|password/i.test(k), `field ${k} must not exist`);
        }
    }
});
