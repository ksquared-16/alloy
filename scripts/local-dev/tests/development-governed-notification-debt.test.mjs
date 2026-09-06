#!/usr/bin/env node
/**
 * AN OUTCOME THE LANE IS NEVER TOLD ABOUT IS INDISTINGUISHABLE FROM NO OUTCOME.
 *
 * THE INCIDENT. A lane reported that approved governed actions were "reaching
 * APPROVED and never executing" — a push whose remote never advanced, a deployed
 * QA restore whose storage state never changed, across roughly five filings.
 *
 * THE RECORD SAID OTHERWISE. Neither action was ever approved. Both failed
 * within seconds of being filed, on input errors, with accurate reasons:
 *
 *   repository.push          repository_not_allowlisted
 *                            "ksquared-16/Alloy" vs allowlisted "ksquared-16/alloy"
 *   restore_deployed_qa      result_validation_failed
 *                            a URL where the contract takes a registry key
 *
 * Their audit trails are `requested -> failed` and nothing else. No
 * `awaiting_operator`, no `operator_approved`, no `executing`. The
 * approval-to-execution pipeline was working the whole time; a merge on the same
 * host and the same Gateway ran the full `requested -> awaiting_operator ->
 * operator_approved -> executing -> grant_consumed -> complete` in the same hour.
 *
 * WHAT WAS ACTUALLY BROKEN. The lane was never told. Both resume paths held the
 * notification back while another action on the same lane was still pending —
 * correct, since pasting into a mid-decision lane interleaves two conversations
 * — and then returned `{ deferred: true }` having recorded nothing. The
 * notification was not deferred, it was dropped, and the redelivery drain that
 * exists for exactly this had nothing to find.
 *
 * MEASURED: 83 of 200 governed actions on this host carry no delivery record of
 * any kind. 77 of those SUCCEEDED. All 83, without a single exception, resolved
 * while another action on their lane was pending.
 *
 * So the lane's report was a faithful description of what it could see. These
 * cover both halves: the debt is now recorded, and the input error that started
 * it can no longer be caused by capitalisation.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const D = await import("../lib/vacilando/governed-notification-delivery.mjs");
const M = await import("../lib/vacilando/trusted-host-merge.mjs");
const P = await import("../lib/vacilando/trusted-host-push.mjs");

const SHA = "e73ef32dd9323ba0b2d1da7479e9264118e825c7";

/** An in-memory governed-action store, injected where the real one would be. */
function fakeStore(records = []) {
  const byId = new Map(records.map((r) => [r.request_id, r]));
  return {
    api: {
      get: (id) => byId.get(id) || null,
      list: () => [...byId.values()],
      save: (rec) => { byId.set(rec.request_id, rec); return rec; },
    },
    byId,
  };
}

function record(over = {}) {
  return {
    request_id: "gar_test01",
    lane_id: "lane_test",
    run_id: "erun_test",
    action_key: "repository.push",
    status: "failed",
    updated_at: "2026-09-06T15:19:46.755Z",
    ...over,
  };
}

/* ── The defect, and its positive control ────────────────────────────────── */

await test("POSITIVE CONTROL — a resolved action with no delivery record is invisible to the drain", async () => {
  // This is the pre-fix shape, reproduced exactly: the resume path returned
  // `{ deferred: true }` and wrote nothing. The record is terminal, the lane was
  // never told, and nothing anywhere is owed. That is the silence being fixed.
  const { api } = fakeStore([record({ status: "failed" })]);
  D.setDeliveryStoreForTests(api);
  try {
    const owed = await D.pendingNotificationDeliveries({});
    assert.equal(owed.length, 0, "nothing is owed, so nothing will ever be delivered");
  } finally { D.resetDeliveryStoreForTests(); }
});

await test("a deferral behind a pending action is a temporary delivery outcome, not a dropped one", () => {
  assert.ok(D.TEMPORARY_DELIVERY_ERRORS.includes("deferred_behind_pending_action"));
  const verdict = D.classifyDeliveryOutcome({ ok: false, error: "deferred_behind_pending_action" });
  assert.equal(verdict.state, D.DELIVERY_STATES.PENDING);
  assert.equal(verdict.temporary, true);
  assert.equal(verdict.reason, "deferred_behind_pending_action");
});

await test("both resume paths register the debt instead of returning silently", () => {
  const src = readFileSync(new URL("../lib/vacilando/governed-action-request.mjs", import.meta.url), "utf8");
  // The two deferral branches, and the fact that neither returns before owing.
  const deferrals = [...src.matchAll(/if \(pendingNext && pendingNext\.request_id !== rec\.request_id\) \{([\s\S]{0,400}?)\n  \}/g)];
  assert.equal(deferrals.length, 2, "there are exactly two deferral branches — failure and success");
  for (const [, body] of deferrals) {
    assert.match(body, /oweNotification\(/, "a deferral must record the notification it is holding back");
    assert.match(body, /notification_owed: true/);
  }
  // And the debt is recorded through the delivery owner, not a private field.
  assert.match(src, /recordDeliveryAttempt\(rec, \{ ok: false, error: "deferred_behind_pending_action" \}/);
  // The success path is covered too: an action that WORKED must not go unreported.
  assert.match(src, /kind: "governed_action_resume",\n      waitingOn: pendingNext\.request_id/);
});

await test("a recorded deferral is owed, and the drain can find it", async () => {
  const rec = record();
  D.recordDeliveryAttempt(rec, { ok: false, error: "deferred_behind_pending_action" }, {
    kind: "governed_action_failed",
    nowMs: Date.parse("2026-09-06T15:19:46.755Z"),
  });
  assert.equal(rec.notification_delivery.state, D.DELIVERY_STATES.PENDING);
  assert.equal(rec.notification_delivery.reason, "deferred_behind_pending_action");
  assert.equal(rec.notification_delivery.kind, "governed_action_failed");

  const { api } = fakeStore([rec]);
  D.setDeliveryStoreForTests(api);
  try {
    const owed = await D.pendingNotificationDeliveries({});
    assert.equal(owed.length, 1);
    assert.equal(owed[0].request_id, rec.request_id);
  } finally { D.resetDeliveryStoreForTests(); }
});

/* ── Waiting must not expire what it is waiting for ──────────────────────── */

await test("while still blocked the drain SKIPS — no send, no attempt, no expiry", async () => {
  const rec = record();
  D.recordDeliveryAttempt(rec, { ok: false, error: "deferred_behind_pending_action" }, { kind: "governed_action_failed" });
  const before = rec.notification_delivery.attempts;

  const { api } = fakeStore([rec]);
  D.setDeliveryStoreForTests(api);
  D.resetRedeliveryStateForTests();
  try {
    let sends = 0;
    // Twenty ticks — well past MAX_REDELIVERY_ATTEMPTS — while an operator
    // thinks about an approval. On this host one such wait lasted an hour and
    // three quarters; expiring it as UNDELIVERABLE would be a fresh false claim.
    for (let i = 0; i < 20; i += 1) {
      const out = await D.drainGovernedNotifications({
        send: async () => { sends += 1; return { ok: true }; },
        buildText: async () => "text",
        isBlocked: () => "gar_blocking",
      });
      assert.equal(out.skipped_blocked, 1);
    }
    assert.equal(sends, 0, "a blocked notification is never sent into a busy lane");
    assert.equal(api.get(rec.request_id).notification_delivery.attempts, before, "and never spends an attempt");
    assert.equal(api.get(rec.request_id).notification_delivery.state, D.DELIVERY_STATES.PENDING);
  } finally { D.resetDeliveryStoreForTests(); }
});

await test("once the lane clears, the debt is paid exactly once", async () => {
  const rec = record();
  D.recordDeliveryAttempt(rec, { ok: false, error: "deferred_behind_pending_action" }, { kind: "governed_action_failed" });
  const { api } = fakeStore([rec]);
  D.setDeliveryStoreForTests(api);
  D.resetRedeliveryStateForTests();
  try {
    const sent = [];
    const drain = () => D.drainGovernedNotifications({
      send: async (lane, text) => { sent.push({ lane, text }); return { ok: true }; },
      buildText: async (r) => `outcome of ${r.request_id}`,
      isBlocked: () => null,
    });
    const first = await drain();
    assert.equal(first.delivered, 1);
    assert.equal(sent.length, 1);
    assert.match(sent[0].text, /gar_test01/);
    assert.equal(api.get(rec.request_id).notification_delivery.state, D.DELIVERY_STATES.DELIVERED);

    // A second drain must not tell the lane twice.
    const second = await drain();
    assert.equal(second.considered, 0);
    assert.equal(sent.length, 1);
  } finally { D.resetDeliveryStoreForTests(); }
});

await test("the notification survives the originating turn ending and an executor restart", async () => {
  // Durability is a property of the RECORD, not of any process: the debt lives
  // in the governed-action store, so a restart re-reads it and a drain from a
  // cold process pays it.
  const rec = record();
  D.recordDeliveryAttempt(rec, { ok: false, error: "deferred_behind_pending_action" }, { kind: "governed_action_failed" });
  const serialized = JSON.stringify(rec);

  const reread = JSON.parse(serialized);          // "restart"
  const { api } = fakeStore([reread]);
  const cold = await import(`../lib/vacilando/governed-notification-delivery.mjs?restart=${Date.now()}`);
  cold.setDeliveryStoreForTests(api);
  try {
    assert.equal((await cold.pendingNotificationDeliveries({})).length, 1, "the debt survives the restart");
    const out = await cold.drainGovernedNotifications({
      send: async () => ({ ok: true }),
      buildText: async () => "text",
      isBlocked: () => null,
    });
    assert.equal(out.delivered, 1);
  } finally { cold.resetDeliveryStoreForTests(); }
});

await test("a lane that can never be told becomes UNDELIVERABLE with a reason, never silence", async () => {
  for (const [lane, expected] of [[null, "lane_not_found"], [{ status: "CLOSED" }, "lane_closed"]]) {
    const rec = record({ request_id: `gar_${expected}` });
    D.recordDeliveryAttempt(rec, { ok: false, error: "deferred_behind_pending_action" }, { kind: "governed_action_failed" });
    const { api } = fakeStore([rec]);
    D.setDeliveryStoreForTests(api);
    D.resetRedeliveryStateForTests();
    try {
      const out = await D.redeliverGovernedNotification(rec.request_id, {
        send: async () => ({ ok: true }),
        buildText: async () => "text",
        getLane: async () => lane,
        isBlocked: () => null,
      });
      assert.equal(out.terminal, true);
      assert.equal(out.error, expected);
      const state = api.get(rec.request_id).notification_delivery;
      assert.equal(state.state, D.DELIVERY_STATES.UNDELIVERABLE);
      assert.equal(state.reason, expected, "and it says why");
    } finally { D.resetDeliveryStoreForTests(); }
  }
});

await test("a genuine readiness deferral is still bounded", () => {
  // The skip must not have removed the bound that stops an unbounded retry.
  const rec = record();
  for (let i = 0; i < D.MAX_REDELIVERY_ATTEMPTS; i += 1) {
    D.recordDeliveryAttempt(rec, { ok: false, error: "provider_prompt_not_ready", prompt_readiness: { state: "busy" } }, {
      kind: "governed_action_failed",
      nowMs: Date.parse("2026-09-06T15:00:00Z") + i * 1000,
    });
  }
  assert.equal(rec.notification_delivery.state, D.DELIVERY_STATES.UNDELIVERABLE);
  assert.equal(rec.notification_delivery.reason, "max_attempts");
});

/* ── The input error that started it ─────────────────────────────────────── */

await test("repository identity is the repository, not the string", () => {
  assert.equal(M.normalizeRepositorySlug("https://github.com/KSquared-16/Alloy.git"), "ksquared-16/alloy");
  assert.equal(M.normalizeRepositorySlug("git@github.com:ksquared-16/Alloy"), "ksquared-16/alloy");
  assert.equal(M.isAllowlistedRepository("ksquared-16/Alloy"), true, "the exact input that was refused five times");
  assert.equal(M.isAllowlistedRepository("ksquared-16/alloy"), true);
  // And it must not have become permissive.
  assert.equal(M.isAllowlistedRepository("someone-else/alloy"), false);
  assert.equal(M.isAllowlistedRepository("ksquared-16/alloy-evil"), false);
  assert.equal(M.isAllowlistedRepository(""), false);
  assert.equal(M.isAllowlistedRepository(null), false);
});

await test("the push that failed five times now validates, and normalises to the allowlisted slug", () => {
  const out = P.validatePushInputs({
    repository: "ksquared-16/Alloy",
    branch: "fix/placement-truth-certification",
    expectedHeadSha: SHA,
    worktreePath: "/Users/vacilando/Code/alloy-worktrees/wt1-work-unit-grade-a",
  });
  assert.equal(out.ok, true, out.detail || out.code);
  assert.equal(out.normalized.repository, "ksquared-16/alloy");
  // A push is still non-force and single-ref only.
  assert.equal(P.validatePushInputs({ repository: "ksquared-16/alloy", force: true }).code, "force_push_rejected");
  // And an unrelated repository is still refused.
  assert.equal(
    P.validatePushInputs({ repository: "someone/else", branch: "x", expectedHeadSha: SHA }).code,
    "repository_not_allowlisted",
  );
});

await test("a refusal names the near miss it used to hide", () => {
  const detail = M.repositoryRefusalDetail("ksquared-16/ALLOY-2");
  assert.match(detail, /Allowlisted: ksquared-16\/alloy/);
  // The registry-id confusion this already covered stays covered.
  assert.match(M.repositoryRefusalDetail("repo_alloy"), /registry id/);
});

await test("the deployed-restore guard is NOT loosened — a URL is still refused", async () => {
  // The second "never executed" action failed because it passed a URL where the
  // contract takes a registry key. That refusal is the security property, not a
  // bug: no arbitrary URL, no arbitrary project, no arbitrary cookie domain. It
  // must survive this fix untouched.
  const R = await import("../lib/vacilando/deployed-qa-session-restore-action.mjs");
  const fn = R.validateRestoreDeployedQaSessionInputs;
  assert.equal(typeof fn, "function");
  const bad = fn({ deployed_target: "https://staging.workwithalloy.com" });
  assert.equal(bad.ok, false, "an arbitrary URL must never be accepted as a target");
});
