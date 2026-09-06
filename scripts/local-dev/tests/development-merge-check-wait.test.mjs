#!/usr/bin/env node
/**
 * A MERGE GATE MEASURED ONCE, TOO EARLY, AND NEVER AGAIN.
 *
 * THE INCIDENT. Three merges in one session escalated with
 *
 *   "Required gates did not pass: required_checks_successful,
 *    certification_suite_passed."
 *
 * and each was approved by hand. Re-measuring those same pull requests
 * afterwards, through the same function the policy already calls, returns
 * `certification_suite_passed: true`, 8/8 and 9/9 checks passing, none failing,
 * none pending. Nothing was ever wrong with the evidence.
 *
 * THE CORRECTION THIS SUITE RECORDS. It was first reported — by me — as a
 * missing producer: "certification_suite_passed is a parameter of
 * collectPromotionEvidence that no caller supplies". That was the wrong
 * function. `collectPromotionEvidence` has no callers at all; the merge path
 * uses `measureMergePullRequestGates`, which has been wired since fbbb766fd
 * precisely so merges would stop escalating.
 *
 * The real cause is timing. The gates are evaluated seconds after the pull
 * request is opened, before GitHub has registered a single check run. With no
 * checks reported, `required_checks_total` is 0 — which the predicate scores
 * FALSE, deliberately, because zero checks is not "all checks passed" — and the
 * certification filter matches nothing, which is NULL. Both answers are right.
 * Both are permanent, because `tickGovernedActions` re-processes `requested`,
 * `awaiting_director` and `awaiting_control_plane_refresh`, and never
 * `awaiting_operator`.
 *
 * So the fix is not to supply evidence, and certainly not to turn null into
 * true. It is to look again.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const G = await import("../lib/vacilando/governed-action-request.mjs");
const T = await import("../lib/vacilando/trusted-host-action-registry.mjs");

const MERGE = T.ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST;
const ESCALATION = "Required gates did not pass: required_checks_successful, certification_suite_passed.";

const rec = (over = {}) => ({
    request_id: "gar_test",
    action_key: MERGE,
    escalation_reason: ESCALATION,
    inputs: { repository: "ksquared-16/alloy", pullRequestNumber: 725 },
    ...over,
});
const decide = (r, measured) => G.checkWaitDecision(r, { measure: () => measured });

/* ── Wait only while CI has not answered ─────────────────────────────────── */

await test("no checks reported yet is a wait, not an escalation", () => {
    const out = decide(rec(), {
        required_checks_total: 0, required_checks_failing: 0,
        required_checks_pending: 0, certification_suite_passed: null,
    });
    assert.equal(out.wait, true);
    assert.match(out.detail, /no checks have been reported/);
});

await test("checks still running is a wait", () => {
    const out = decide(rec(), {
        required_checks_total: 5, required_checks_failing: 0,
        required_checks_pending: 2, certification_suite_passed: null,
    });
    assert.equal(out.wait, true);
    assert.match(out.detail, /2 check\(s\) still running/);
});

await test("checks green but no certification check yet is still a wait", () => {
    const out = decide(rec(), {
        required_checks_total: 3, required_checks_failing: 0,
        required_checks_pending: 0, certification_suite_passed: null,
    });
    assert.equal(out.wait, true);
    assert.match(out.detail, /no certification check has reported/);
});

/* ── Never wait through a real answer ────────────────────────────────────── */

await test("A RED CHECK IS NOT A SLOW ONE — a failing check escalates immediately", () => {
    const out = decide(rec(), {
        required_checks_total: 5, required_checks_failing: 1,
        required_checks_pending: 0, certification_suite_passed: false,
    });
    assert.equal(out.wait, false);
    assert.match(out.why, /1 required check\(s\) are failing/);
});

await test("a gate outside CI availability escalates, however green the checks are", () => {
    const out = decide(
        rec({ escalation_reason: "Required gates did not pass: base_is_staging, certification_suite_passed." }),
        { required_checks_total: 9, required_checks_failing: 0, required_checks_pending: 0, certification_suite_passed: true },
    );
    assert.equal(out.wait, false);
    assert.match(out.why, /outside CI availability/);
});

await test("the wait is bounded by attempts and by time", () => {
    const spent = decide(rec({ check_wait: { attempts: G.MAX_CHECK_WAIT_ATTEMPTS, started_at: new Date().toISOString() } }), {
        required_checks_total: 0,
    });
    assert.equal(spent.wait, false);
    assert.match(spent.why, /exhausted its attempts/);

    const old = decide(rec({ check_wait: { attempts: 1, started_at: new Date(Date.now() - G.MAX_CHECK_WAIT_MS - 1000).toISOString() } }), {
        required_checks_total: 0,
    });
    assert.equal(old.wait, false);
    assert.match(old.why, /exceeded its window/);
});

await test("only merges are affected; every other action escalates exactly as before", () => {
    for (const key of ["repository.push", "promotion.open_pr", "vacilando.retire_worktree"]) {
        assert.equal(G.checkWaitDecision({ action_key: key, escalation_reason: ESCALATION }).wait, false);
    }
});

await test("an escalation that names no gates is not a check wait", () => {
    assert.equal(G.checkWaitDecision(rec({ escalation_reason: "operator hold is set" })).wait, false);
    assert.equal(G.checkWaitDecision(rec({ escalation_reason: null })).wait, false);
});

await test("unreadable checks wait rather than assuming either answer", () => {
    const out = G.checkWaitDecision(rec(), { measure: () => null });
    assert.equal(out.wait, true);
    assert.match(out.detail, /could not be read/);
});

/* ── The wait must actually be looked at again ───────────────────────────── */

await test("awaiting_checks is pending, and the tick re-processes it", () => {
    assert.ok(G.PENDING_GOVERNED_STATUSES.includes("awaiting_checks"));
    assert.equal(G.isPendingGovernedStatus("awaiting_checks"), true);
    const src = readFileSync(new URL("../lib/vacilando/governed-action-request.mjs", import.meta.url), "utf8");
    const tick = src.slice(src.indexOf("export function tickGovernedActions"));
    assert.match(tick.slice(0, 1400), /r\.status === "awaiting_checks"/,
        "a status the tick never revisits is a nicer name for the same silence");
});

await test("the wait mints nothing and executes nothing", () => {
    const src = readFileSync(new URL("../lib/vacilando/governed-action-request.mjs", import.meta.url), "utf8");
    const fn = src.slice(src.indexOf("export function enterCheckWait"), src.indexOf("export function executeGovernedAction"));
    for (const forbidden of ["executeGovernedAction", "grantExactRequestAuthorization", "operator_approval"]) {
        assert.equal(fn.includes(forbidden), false, `${forbidden} must not appear in the wait`);
    }
    assert.match(fn, /rec\.status = "awaiting_checks"/);
});

/* ── The correction, asserted so it cannot be re-learned the hard way ────── */

await test("the merge policy's evidence producer IS wired — the earlier diagnosis was wrong", async () => {
    const src = readFileSync(new URL("../lib/vacilando/director-evidence.mjs", import.meta.url), "utf8");
    const block = src.slice(src.indexOf('rec?.action_key === "repository.merge_pull_request"'));
    assert.match(block.slice(0, 600), /Object\.assign\(evidence, measureMergePullRequestGates\(/,
        "the merge gates have a producer, and it is called");
    // And that producer measures certification positively, never by assumption.
    const H = readFileSync(new URL("../lib/vacilando/trusted-host-repository-housekeeping.mjs", import.meta.url), "utf8");
    assert.match(H, /ev\.certification_suite_passed = certs\.length === 0\s*\n?\s*\? null/,
        "zero certification checks is NULL, not true");
});

await test("collectPromotionEvidence is not the merge path — it has no callers", () => {
    const src = readFileSync(new URL("../lib/vacilando/director-evidence.mjs", import.meta.url), "utf8");
    assert.match(src, /certificationSuitePassed/, "the dead parameter still exists");
    // If it ever gains a caller, this fails and the diagnosis above must be revisited.
    const uses = ["governed-action-request.mjs", "trusted-host-actions.mjs"].map((f) => {
        try { return readFileSync(new URL(`../lib/vacilando/${f}`, import.meta.url), "utf8"); } catch { return ""; }
    });
    for (const u of uses) assert.equal(u.includes("collectPromotionEvidence"), false);
});
