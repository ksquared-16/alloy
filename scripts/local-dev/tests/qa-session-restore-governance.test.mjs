/**
 * Governance positive controls for `environment.restore_qa_session`.
 *
 * The property under test is not "restore works" — it is "restore cannot happen without an operator
 * grant". So every case here drives the executor with a fake mint that RECORDS whether it was
 * called: a test that only checked the returned status would pass just as well against an
 * implementation that minted a real session first and reported a failure afterwards. What must never
 * happen is the privileged child being spawned, and that is what these assert.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ACTION_TYPES, getActionDefinition, listRegisteredActions } from "../lib/vacilando/trusted-host-action-registry.mjs";
import {
    FORBIDDEN_RESTORE_INPUTS,
    executeRestoreQaSession,
    resolveRestoreTarget,
    safeFailure,
    validateRestoreQaSessionInputs,
} from "../lib/vacilando/qa-session-restore-action.mjs";
import { resetQaBootstrapsForTests } from "../lib/vacilando/qa-session-bootstrap.mjs";

const LANE = "lane_73a897409906";
const IDENTITY = "qa-slot5-refactor@example.com";

/** A lane registry stub: slot 5, this worktree, as the real registry would report it. */
const laneFor = (over = {}) => () => ({
    lane_id: LANE,
    binding: { worktree_path: "/Users/Kelly/Code/alloy-worktrees/wt5-runtime-performance-ux-completion", slot: 5 },
    slot: 5,
    ...over,
});

const action = (over = {}) => ({
    actionType: ACTION_TYPES.ENVIRONMENT_RESTORE_QA_SESSION,
    inputs: { laneId: LANE },
    ...over,
});

const validGrant = (over = {}) => ({
    status: "APPROVED",
    action_key: ACTION_TYPES.ENVIRONMENT_RESTORE_QA_SESSION,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    ...over,
});

/** Records whether the privileged child would have been spawned. */
function spyMint(result = { ok: true, mechanism: "single_use_magiclink" }) {
    const calls = [];
    const fn = async (...args) => { calls.push(args); return result; };
    fn.calls = calls;
    return fn;
}
const okVerify = async () => ({ ok: true, state: "restored", actual_identity: IDENTITY });

test.beforeEach(() => resetQaBootstrapsForTests());

test("the action is registered and always requires operator approval", () => {
    const def = getActionDefinition(ACTION_TYPES.ENVIRONMENT_RESTORE_QA_SESSION);
    assert.ok(def, "action must be in the registry");
    assert.equal(def.alwaysRequiresOperatorApproval, true);
    assert.equal(def.riskClass, "privileged_write");
    assert.deepEqual(def.inputSchema.required, ["laneId"]);
    const listed = listRegisteredActions().map((a) => a.actionType);
    assert.ok(listed.includes("environment.restore_qa_session"), "must appear in discovery");
});

test("a pending request executes nothing — no grant means no mint", async () => {
    const mint = spyMint();
    const r = await executeRestoreQaSession({ action: action(), grant: null, mint, verify: okVerify, getLane: laneFor() });
    assert.equal(r.ok, false);
    assert.equal(r.failure_code, "grant_missing");
    assert.equal(mint.calls.length, 0, "the privileged child must not be spawned while pending");
});

test("a denied or revoked grant prevents execution", async () => {
    for (const status of ["DENIED", "REVOKED"]) {
        const mint = spyMint();
        const r = await executeRestoreQaSession({
            action: action(), grant: validGrant({ status }), mint, verify: okVerify, getLane: laneFor(),
            grantCheck: (g) => (g.status === "APPROVED" ? { ok: true } : { ok: false, error: "grant_revoked" }),
        });
        assert.equal(r.ok, false);
        assert.equal(mint.calls.length, 0, `${status} must not mint`);
    }
});

test("expired and already-consumed grants prevent execution", async () => {
    for (const [g, code] of [
        [validGrant({ expires_at: new Date(Date.now() - 1_000).toISOString() }), "grant_expired"],
        [validGrant({ status: "CONSUMED" }), "grant_already_used"],
    ]) {
        const mint = spyMint();
        const r = await executeRestoreQaSession({
            action: action(), grant: g, mint, verify: okVerify, getLane: laneFor(),
            grantCheck: () => ({ ok: false, error: code }),
        });
        assert.equal(r.ok, false);
        assert.equal(r.failure_code, code);
        assert.equal(mint.calls.length, 0);
    }
});

test("a grant for a different action key cannot authorize a restore", async () => {
    const mint = spyMint();
    const r = await executeRestoreQaSession({
        action: action(), grant: validGrant({ action_key: ACTION_TYPES.REPOSITORY_PUSH }), mint, verify: okVerify, getLane: laneFor(),
        grantCheck: (g, a) => (g.action_key === a.actionType ? { ok: true } : { ok: false, error: "grant_action_mismatch" }),
    });
    assert.equal(r.failure_code, "grant_action_mismatch");
    assert.equal(mint.calls.length, 0);
});

test("a caller cannot supply an identity, URL, storage path, slot or port", () => {
    for (const key of FORBIDDEN_RESTORE_INPUTS) {
        const r = validateRestoreQaSessionInputs({ laneId: LANE, [key]: "anything" });
        assert.equal(r.ok, false, `${key} must be refused`);
        assert.equal(r.error, "caller_supplied_forbidden_input");
    }
});

test("operatorApproved cannot be smuggled in through the request", () => {
    const r = validateRestoreQaSessionInputs({ laneId: LANE, operatorApproved: true });
    assert.equal(r.ok, false);
    assert.equal(r.error, "unexpected_input");
});

test("the request must name a lane, and only a lane", () => {
    assert.equal(validateRestoreQaSessionInputs({}).error, "lane_id_required");
    assert.equal(validateRestoreQaSessionInputs({ laneId: "not-a-lane" }).error, "lane_id_required");
    assert.equal(validateRestoreQaSessionInputs({ laneId: LANE }).ok, true);
});

test("an unregistered lane resolves to nothing and mints nothing", async () => {
    const mint = spyMint();
    const r = await executeRestoreQaSession({
        action: action(), grant: validGrant(), mint, verify: okVerify, getLane: () => null,
    });
    assert.equal(r.ok, false);
    assert.equal(r.failure_code, "unregistered_lane");
    assert.equal(mint.calls.length, 0);
});

test("a lane with no managed slot fails closed", async () => {
    const mint = spyMint();
    const r = await executeRestoreQaSession({
        action: action(), grant: validGrant(), mint, verify: okVerify,
        getLane: laneFor({ slot: null, binding: { worktree_path: "/tmp/wt", slot: null } }),
    });
    assert.equal(r.ok, false);
    assert.equal(mint.calls.length, 0);
});

test("a registry disagreement about the worktree fails closed", async () => {
    const mint = spyMint();
    const r = await executeRestoreQaSession({
        action: action(), grant: validGrant(), mint, verify: okVerify,
        getLane: laneFor({ binding: { worktree_path: "", slot: 5 } }),
    });
    assert.equal(r.ok, false);
    assert.equal(mint.calls.length, 0);
});

test("the privileged child runs only after approval, and exactly once", async () => {
    const mint = spyMint();
    const r = await executeRestoreQaSession({
        action: action(), grant: validGrant(), mint, verify: okVerify, getLane: laneFor(),
    });
    assert.equal(mint.calls.length, 1, "an approved restore mints once");
    assert.equal(r.ok, true);
    assert.equal(r.status, "restored");
});

test("a concurrent second restore for the same slot is refused", async () => {
    const slow = async () => { await new Promise((r) => setTimeout(r, 30)); return { ok: true }; };
    const first = executeRestoreQaSession({ action: action(), grant: validGrant(), mint: slow, verify: okVerify, getLane: laneFor() });
    const second = await executeRestoreQaSession({ action: action(), grant: validGrant(), mint: spyMint(), verify: okVerify, getLane: laneFor() });
    await first;
    assert.equal(second.ok, false, "the second must be refused while the first is in flight");
});

test("a successful mint alone cannot report authenticated", async () => {
    const r = await executeRestoreQaSession({
        action: action(), grant: validGrant(), mint: spyMint(), getLane: laneFor(),
        verify: async () => ({ ok: false, state: "verification_failed", detail: "no authenticated identity was reported" }),
    });
    assert.equal(r.ok, false);
    assert.equal(r.verified, false);
    assert.equal(r.verified_at, null);
    assert.equal(r.status, "verification_failed");
});

test("verification is what sets verified:true, and it stamps a time", async () => {
    const r = await executeRestoreQaSession({
        action: action(), grant: validGrant(), mint: spyMint(), verify: okVerify, getLane: laneFor(), nowMs: 1_700_000_000_000,
    });
    assert.equal(r.verified, true);
    assert.equal(r.verified_at, new Date(1_700_000_000_000).toISOString());
});

test("the result is a RESTORE result, never a census-shaped envelope", async () => {
    const r = await executeRestoreQaSession({ action: action(), grant: validGrant(), mint: spyMint(), verify: okVerify, getLane: laneFor() });
    for (const field of ["lane_id", "slot", "registered_identity", "storage_written", "verified", "verified_at"]) {
        assert.ok(field in r, `restore result must carry ${field}`);
    }
    for (const censusField of ["org_count", "question_ids", "question_row_counts", "keys", "database"]) {
        assert.ok(!(censusField in r), `a restore result must not be census-shaped (${censusField})`);
    }
});

test("no result shape can carry secret-bearing material", async () => {
    const results = [
        await executeRestoreQaSession({ action: action(), grant: validGrant(), mint: spyMint(), verify: okVerify, getLane: laneFor() }),
        safeFailure({ code: "redeem_failed", detail: "access_token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhIn0.sig" }),
    ];
    for (const r of results) {
        const text = JSON.stringify(r);
        assert.ok(!/eyJ[A-Za-z0-9_-]{6,}\./.test(text), "no JWT may appear");
        assert.ok(!/base64-/.test(text), "no auth cookie may appear");
        for (const k of Object.keys(r)) {
            assert.ok(!/token|cookie|password|secret|service_role|magic/i.test(k), `field ${k} must not exist`);
        }
    }
});

test("a child error is reduced to a bounded code and detail, never raw text", async () => {
    const leaky = async () => ({ ok: false, error: "redeem_failed", detail: "x".repeat(5_000) });
    const r = await executeRestoreQaSession({ action: action(), grant: validGrant(), mint: leaky, verify: okVerify, getLane: laneFor() });
    assert.equal(r.ok, false);
    assert.ok(r.failure_code.length <= 64);
    assert.ok((r.failure_detail || "").length <= 120, "detail must be bounded");
});

test("POSITIVE CONTROL: restoring caller-driven approval breaks the boundary", () => {
    /*
     * The old CLI passed `operatorApproved: true` itself. If the request contract ever accepted an
     * approval-ish field again, this fails — which is the point: the refusal must live in the
     * contract, not in the discipline of whoever writes the next caller.
     */
    for (const field of ["operatorApproved", "operator_approved", "approved", "grant"]) {
        const r = validateRestoreQaSessionInputs({ laneId: LANE, [field]: true });
        assert.equal(r.ok, false, `${field} must never be accepted from a caller`);
    }
});

test("resolveRestoreTarget derives identity from the registry, not from input", () => {
    const r = resolveRestoreTarget(LANE, { getLane: laneFor() });
    if (r.ok) {
        assert.equal(r.validated.expected_identity, IDENTITY);
        assert.equal(r.validated.port, 3015);
        assert.match(r.validated.base_url, /^http:\/\/127\.0\.0\.1:3015$/);
    } else {
        // On a host without slot-5 config the resolver must still refuse rather than guess.
        assert.ok(["no_registered_qa_identity", "unregistered_lane", "lane_has_no_managed_slot"].includes(r.error), r.error);
    }
});
