/**
 * Regression controls for the two live assignment failures.
 *
 * Both attempts failed BEFORE any mutation, which is the only reason they cost nothing but an
 * approval. They failed for different reasons and the difference is the point:
 *
 *   gar_72992cc47974d1 → canonical_org_ambiguous   (derivation found several admin orgs)
 *   gar_295cec0e61cfe0 → organization_read_failed  (the query named a table that does not exist)
 *
 * The second was a typo — `organizations` for `orgs` — and a typo in a trusted child costs a real
 * operator approval to discover. So the control here is structural as well as behavioural: the
 * child must query the table the application actually owns, and the three org-resolution outcomes
 * must stay distinguishable. Collapsing them would turn a misconfigured environment into something
 * that reads like a missing table.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { executeAssignQaAccessSync } from "../lib/vacilando/qa-access-assign-action.mjs";
import { runQaAccessAssignSync } from "../lib/vacilando/qa-access-assign-runner.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = join(HERE, "..", "vac-qa-access-assign.mjs");
const childSource = readFileSync(CHILD, "utf8");

const LANE = "lane_73a897409906";
const laneFor = () => () => ({
    lane_id: LANE,
    binding: { worktree_path: "/Users/Kelly/Code/alloy-worktrees/wt5-runtime-performance-ux-completion", slot: 5 },
    slot: 5,
});
const validGrant = () => ({
    status: "APPROVED",
    action_key: "environment.assign_qa_identity_access",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
});

test("the child reads `orgs` — the table the application owns", () => {
    // `organizations` is the plural-English guess that spent an approval on organization_read_failed.
    // Every application owner — metric snapshots, tour comms context, entity labels — reads `orgs`.
    assert.ok(childSource.includes('from("orgs")'), "the configured organization must be read from `orgs`");
    assert.ok(!childSource.includes('from("organizations")'), "`organizations` is not a relation in this schema");
});

test("a missing configured organization is NOT reported as a read failure", () => {
    // These are different conditions: one means the environment points at a tenant that does not
    // exist, the other means the query itself could not run. One is operator-fixable, the other is a
    // defect, and a single code would hide which.
    assert.ok(childSource.includes("configured_org_not_found"), "an absent org must have its own code");
    assert.ok(childSource.includes("organization_read_failed"), "a failed read must keep its own code");
    const notFound = childSource.indexOf("configured_org_not_found");
    const readFailed = childSource.indexOf("organization_read_failed");
    assert.ok(readFailed < notFound, "the read error is checked before the row is inspected");
});

test("the configured organization is authoritative and derivation stays the fallback", () => {
    const configured = childSource.indexOf("DEV_QUEUE_ORG_ID");
    const ambiguous = childSource.indexOf("canonical_org_ambiguous");
    assert.ok(configured !== -1 && ambiguous !== -1);
    assert.ok(configured < ambiguous, "configuration is consulted before derivation is attempted");
});

for (const code of ["organization_read_failed", "configured_org_not_found", "canonical_org_ambiguous"]) {
    test(`a child failing with ${code} surfaces that code and mutates nothing`, () => {
        const r = executeAssignQaAccessSync({
            action: { actionType: "environment.assign_qa_identity_access", inputs: { laneId: LANE } },
            grant: validGrant(),
            grantCheck: () => ({ ok: true }),
            getLane: laneFor(),
            assign: () => ({ ok: false, error: code, detail: "reproduced from the live failure" }),
        });
        assert.equal(r.ok, false);
        assert.equal(r.failure_code, code, "the child's code must reach the operator unchanged");
        assert.equal(r.mutated, false, "a failed org resolution must leave no membership row");
        assert.equal(r.org_id, null);
        assert.equal(r.verified, false);
    });
}

test("the runner reports a non-JSON child as assign_no_result rather than success", () => {
    // A child that dies before printing must never read as an assignment.
    const r = runQaAccessAssignSync(
        { expected_identity: "qa-slot5-refactor@example.com", slot: 5 },
        { spawnSyncImpl: () => ({ ok: false, stdout: "", stderr: "Error: EISDIR", error: null }), envSource: "/dev/null" },
    );
    assert.equal(r.ok, false);
    assert.equal(r.error, "assign_no_result");
});

test("the runner passes the role through and never lets the child choose it", () => {
    const seen = [];
    runQaAccessAssignSync(
        { expected_identity: "qa-slot5-refactor@example.com", slot: 5 },
        {
            spawnSyncImpl: (_cmd, argv) => { seen.push(argv); return { ok: true, stdout: JSON.stringify({ ok: true, result: "assigned", mutated: true, user_id: "u", org_id: "o", memberships_for_user: 1, candidate_orgs_seen: 1, org_source: "configured" }) }; },
            envSource: "/dev/null",
        },
    );
    const argv = seen[0];
    assert.equal(argv[argv.indexOf("--role") + 1], "admin");
    assert.equal(argv[argv.indexOf("--identity") + 1], "qa-slot5-refactor@example.com");
});
