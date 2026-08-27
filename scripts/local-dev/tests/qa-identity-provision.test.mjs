/**
 * Controls for `environment.provision_qa_identity`.
 *
 * This action CREATES an account, so the property that matters is that nothing is created unless an
 * operator approved exactly this request for exactly this registry-resolved identity. Every case
 * therefore drives the executor with a fake provisioner that RECORDS whether it ran: asserting only
 * on the returned status would pass just as well against an implementation that created the user
 * first and reported a refusal afterwards.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ACTION_TYPES, getActionDefinition, listRegisteredActions } from "../lib/vacilando/trusted-host-action-registry.mjs";
import {
    FORBIDDEN_PROVISION_INPUTS,
    MANAGED_QA_IDENTITY,
    executeProvisionQaIdentitySync,
    safeProvisionFailure,
    validateProvisionQaIdentityInputs,
} from "../lib/vacilando/qa-identity-provision-action.mjs";

const LANE = "lane_73a897409906";
const IDENTITY = "qa-slot5-refactor@example.com";

const laneFor = (over = {}) => () => ({
    lane_id: LANE,
    binding: { worktree_path: "/Users/Kelly/Code/alloy-worktrees/wt5-runtime-performance-ux-completion", slot: 5 },
    slot: 5,
    ...over,
});

const action = (over = {}) => ({
    actionType: ACTION_TYPES.ENVIRONMENT_PROVISION_QA_IDENTITY,
    inputs: { laneId: LANE },
    ...over,
});

const validGrant = (over = {}) => ({
    status: "APPROVED",
    action_key: ACTION_TYPES.ENVIRONMENT_PROVISION_QA_IDENTITY,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    ...over,
});

/** Records whether the account-creating child would have run. */
function spyProvision(result = { ok: true, result: "created", mutated: true, occurrences: 1, directory_entries_scanned: 12 }) {
    const calls = [];
    const fn = (...args) => { calls.push(args); return result; };
    fn.calls = calls;
    return fn;
}

test("the approval NAMES the account and slot, resolved from the registry", async () => {
    /*
     * The request carries only a lane id - deliberately - so the presentation must resolve the
     * identity itself. It previously rendered "the slot's registered QA identity", which is not an
     * informed approval: the operator could not see which account was about to be created.
     */
    const { presentationForGovernedAction } = await import("../lib/vacilando/governed-action-request.mjs");
    const p = presentationForGovernedAction({
        action_key: ACTION_TYPES.ENVIRONMENT_PROVISION_QA_IDENTITY,
        lane_id: LANE,
        inputs: { laneId: LANE },
        status: "requested",
    });
    assert.match(p.approve_label, /provision/i, "the label must say it creates an account");
    assert.ok(!/census|restore/i.test(p.approve_label), "must not borrow another action's label");
    assert.match(p.detail, /qa-slot5-refactor@example\.com/, "the account being created must be named");
    assert.match(p.detail, /Slot 5/, "the slot must be named");
    assert.match(p.detail, /no email is sent/i);
    assert.match(p.detail, /creates no browser session/i);
});

test("the action is registered, dispatchable and always requires operator approval", () => {
    const def = getActionDefinition(ACTION_TYPES.ENVIRONMENT_PROVISION_QA_IDENTITY);
    assert.ok(def, "must be in the registry");
    assert.equal(def.alwaysRequiresOperatorApproval, true);
    assert.equal(def.riskClass, "privileged_write");
    assert.deepEqual(def.inputSchema.required, ["laneId"]);
    assert.ok(listRegisteredActions().map((a) => a.actionType).includes("environment.provision_qa_identity"));
});

test("a pending request creates nothing — no grant means no provisioning child", () => {
    const provision = spyProvision();
    const r = executeProvisionQaIdentitySync({ action: action(), grant: null, provision, getLane: laneFor() });
    assert.equal(r.ok, false);
    assert.equal(r.failure_code, "grant_missing");
    assert.equal(r.mutated, false);
    assert.equal(provision.calls.length, 0, "nothing may be created while pending");
});

test("the executor is SYNCHRONOUS — a Promise would be scored a failure", () => {
    const out = executeProvisionQaIdentitySync({ action: action(), grant: null });
    assert.ok(typeof out?.then !== "function");
});

test("denied, revoked, expired and consumed grants all create nothing", () => {
    for (const code of ["grant_revoked", "grant_expired", "grant_already_used", "grant_action_mismatch"]) {
        const provision = spyProvision();
        const r = executeProvisionQaIdentitySync({
            action: action(), grant: validGrant(), provision, getLane: laneFor(),
            grantCheck: () => ({ ok: false, error: code }),
        });
        assert.equal(r.failure_code, code);
        assert.equal(provision.calls.length, 0, `${code} must not provision`);
    }
});

test("a caller cannot supply an email, project, slot or any other target field", () => {
    for (const key of FORBIDDEN_PROVISION_INPUTS) {
        const r = validateProvisionQaIdentityInputs({ laneId: LANE, [key]: "anything" });
        assert.equal(r.ok, false, `${key} must be refused`);
        assert.equal(r.error, "caller_supplied_forbidden_input");
    }
});

test("approval-shaped input cannot be smuggled through the request", () => {
    for (const f of ["operatorApproved", "approved", "grant"]) {
        assert.equal(validateProvisionQaIdentityInputs({ laneId: LANE, [f]: true }).ok, false);
    }
});

test("only a managed QA identity shape may ever be provisioned", () => {
    // The registry resolves the address, but a misconfigured registry must not be able to make this
    // action create a customer or employee account.
    for (const good of ["qa-slot5-refactor@example.com", "qa-slot1-product@staging.example.org"]) {
        assert.ok(MANAGED_QA_IDENTITY.test(good), `${good} should be accepted`);
    }
    for (const bad of [
        "kelly@kurzmancapital.com", "admin@northwind.test", "parent@family.example",
        "qa-slot7-extra@example.com", "support@customer.co", "qa-slot5-refactor",
    ]) {
        assert.ok(!MANAGED_QA_IDENTITY.test(bad), `${bad} must be refused`);
    }
});

test("a registry that resolves a non-QA identity fails closed and creates nothing", () => {
    const provision = spyProvision();
    // A lane whose slot resolves to something outside the managed shape.
    const r = executeProvisionQaIdentitySync({
        action: action(), grant: validGrant(), provision, grantCheck: () => ({ ok: true }),
        getLane: () => ({ lane_id: LANE, binding: { worktree_path: "/tmp/wt", slot: 99 }, slot: 99 }),
    });
    assert.equal(r.ok, false);
    assert.equal(provision.calls.length, 0, "a non-managed identity must never be created");
});

test("an unregistered lane or a worktree disagreement fails closed", () => {
    for (const getLane of [() => null, laneFor({ binding: { worktree_path: "", slot: 5 } })]) {
        const provision = spyProvision();
        const r = executeProvisionQaIdentitySync({
            action: action(), grant: validGrant(), provision, grantCheck: () => ({ ok: true }), getLane,
        });
        assert.equal(r.ok, false);
        assert.equal(provision.calls.length, 0);
    }
});

test("an already-present identity is idempotent and mutates nothing", () => {
    const provision = spyProvision({ ok: true, result: "already_exists", mutated: false, occurrences: 1, directory_entries_scanned: 12 });
    const r = executeProvisionQaIdentitySync({
        action: action(), grant: validGrant(), provision, grantCheck: () => ({ ok: true }), getLane: laneFor(),
    });
    assert.equal(r.ok, true);
    assert.equal(r.status, "already_exists");
    assert.equal(r.mutated, false);
    assert.equal(r.occurrences, 1);
});

test("a duplicate account is a failure, not a success", () => {
    // The child proves exactly-once by re-reading; if that post-condition breaks, the action fails.
    const provision = spyProvision({ ok: false, error: "post_condition_failed", detail: "expected exactly one account, found 2" });
    const r = executeProvisionQaIdentitySync({
        action: action(), grant: validGrant(), provision, grantCheck: () => ({ ok: true }), getLane: laneFor(),
    });
    assert.equal(r.ok, false);
    assert.equal(r.failure_code, "post_condition_failed");
});

test("provisioning never reports verification and never claims a session", () => {
    const provision = spyProvision();
    const r = executeProvisionQaIdentitySync({
        action: action(), grant: validGrant(), provision, grantCheck: () => ({ ok: true }), getLane: laneFor(),
    });
    assert.equal(r.ok, true);
    assert.equal(r.verified, false, "creating an account is not signing into one");
    assert.ok(!("verified_at" in r) || r.verified_at == null);
    assert.equal(r.email_sent, false);
    assert.equal(r.password_exposed, false);
});

test("no result shape can carry secret-bearing material", () => {
    const provision = spyProvision();
    const results = [
        executeProvisionQaIdentitySync({ action: action(), grant: validGrant(), provision, grantCheck: () => ({ ok: true }), getLane: laneFor() }),
        safeProvisionFailure({ code: "create_failed", detail: "password=hunter2 access_token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhIn0.sig" }),
    ];
    for (const r of results) {
        const text = JSON.stringify(r);
        assert.ok(!/eyJ[A-Za-z0-9_-]{6,}\./.test(text), "no JWT may appear");
        assert.ok(!/hunter2/.test(text), "no password may appear");
        for (const k of Object.keys(r)) {
            assert.ok(!/token|cookie|secret|service_role|magic/i.test(k), `field ${k} must not exist`);
        }
    }
});
