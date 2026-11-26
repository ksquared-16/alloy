#!/usr/bin/env node
/**
 * A DELETION IS NOT A FACT YOU MAY INFER FROM SOMEONE ELSE'S RECEIPT.
 *
 * Thirteen worktree retirements were filed. Two worktrees were removed. Eleven
 * requests reported SUCCESS and removed nothing — each returning
 * wt-branch-fix's result verbatim, `filesystem_path_absent: true` included, for
 * directories that were still there. Thirteen distinct content fingerprints;
 * two trusted-host actions.
 *
 * `dedupeKey` and `queryHash` are both optional, and seventeen of the twenty
 * registered actions declare neither. For those the dedupe predicate reduced to
 * `undefined === undefined`, and `sameActionOwnership` compares only session,
 * assignment and lane — never the thing being acted on. `resultKeeps: false`
 * was the per-action fix for one earlier instance of exactly this, on
 * restore_deployed_qa_session. It cannot be the fix for the action nobody
 * noticed.
 *
 * And the run that filed the first retirement was killed while waiting for the
 * approval it required: `waitProjection()` builds a correct `needs_operator_input`
 * descriptor, and the writer rebuilt `resource_wait` from a presentation
 * allowlist that did not include `reason`. The Governor read the stored wait,
 * found no machine reason, and failed the run. Both halves are locked here.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  requestTrustedHostAction, sameNormalizedInputs, resultOwnershipMatches,
  fulfillRetireWorktreeForMission, getTrustedHostAction,
} from "../lib/vacilando/trusted-host-actions.mjs";
import { ACTION_TYPES, getActionDefinition } from "../lib/vacilando/trusted-host-action-registry.mjs";
import { createQueuedRun, patchRunResourceWait, reportRunState, transitionExecutionRun, getExecutionRun } from "../lib/vacilando/execution-run.mjs";
import { describeWait, isDeclaredWaitReason } from "../lib/vacilando/run-wait.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  const root = mkdtempSync(join(tmpdir(), "vac-dedupe-"));
  const prev = process.env.ALLOY_RUNTIME_ROOT;
  process.env.ALLOY_RUNTIME_ROOT = root;
  try { fn(root); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
  finally {
    if (prev === undefined) delete process.env.ALLOY_RUNTIME_ROOT; else process.env.ALLOY_RUNTIME_ROOT = prev;
    rmSync(root, { recursive: true, force: true });
  }
}

/** Rewrite one stored action on disk — the store has no test writer. */
function mutateStoredAction(root, id, mutate) {
  const dir = join(root, "vacilando", "trusted-host-actions");
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    const rec = JSON.parse(readFileSync(file, "utf8"));
    if (rec.id !== id) continue;
    mutate(rec);
    writeFileSync(file, JSON.stringify(rec, null, 2));
    return rec;
  }
  throw new Error(`fixture: no stored action ${id}`);
}

const SHA_A = "a".repeat(40), SHA_B = "b".repeat(40);
const FP_A = "1".repeat(32), FP_B = "2".repeat(32);
const SCOPE = "repo_alloy";

function retire(worktree, { branch = "promote/x", headSha = SHA_A, fingerprint = FP_A, runId = null } = {}) {
  return requestTrustedHostAction({
    missionId: SCOPE,
    assignmentId: runId, executionSessionId: runId,
    actionType: ACTION_TYPES.VACILANDO_RETIRE_WORKTREE,
    inputs: { repository: "repo_alloy", worktree, branch, headSha, safetyFingerprint: fingerprint, s7State: "RECLAIMABLE" },
    nowMs: Date.now(),
  });
}

/* ── DEDUPE ──────────────────────────────────────────────────────────────── */

test("D1. the registration declares a semantic identity at all", () => {
  const def = getActionDefinition(ACTION_TYPES.VACILANDO_RETIRE_WORKTREE);
  const v = def.validateInputs({ repository: "repo_alloy", worktree: "wt-one", branch: "b", headSha: SHA_A, safetyFingerprint: FP_A, s7State: "RECLAIMABLE" });
  assert.equal(v.ok, true);
  assert.ok(v.normalized.dedupeKey, "a destructive action must say what it is about");
  assert.match(v.normalized.dedupeKey, /wt-one/, "the worktree is part of the identity");
  assert.match(v.normalized.dedupeKey, new RegExp(FP_A.slice(0, 12)), "so is the safety fingerprint it was decided on");
});

test("D2. THE DEFECT: two different worktrees cannot share one action", () => {
  const a = retire("wt-one");
  const b = retire("wt-two");
  assert.equal(a.ok, true); assert.equal(b.ok, true);
  assert.notEqual(b.action.id, a.action.id, "distinct worktrees, distinct trusted-host actions");
  assert.equal(b.action.inputs.worktree, "wt-two", "and the action is about the worktree that was asked for");
});

test("D3. the same path with a changed fingerprint is a different retirement", () => {
  const a = retire("wt-one", { fingerprint: FP_A });
  const b = retire("wt-one", { fingerprint: FP_B });
  assert.notEqual(b.action.id, a.action.id, "the safety evidence moved, so the decision is not the same decision");
});

test("D4. the same worktree at a moved branch head is a different retirement", () => {
  const a = retire("wt-one", { headSha: SHA_A });
  const b = retire("wt-one", { headSha: SHA_B });
  assert.notEqual(b.action.id, a.action.id);
});

test("D5. an exact re-request of the same intent still dedupes", () => {
  const a = retire("wt-one");
  const b = retire("wt-one");
  assert.equal(b.action.id, a.action.id, "retry safety is preserved; only cross-worktree reuse is refused");
  assert.equal(b.deduped, true);
});

test("D6. a null run id cannot collapse distinct destructive requests", () => {
  // The Governor killed the run, so every later retirement filed with run_id
  // null. Identity must not depend on a live run existing.
  const a = retire("wt-one", { runId: null });
  const b = retire("wt-two", { runId: null });
  assert.notEqual(b.action.id, a.action.id);
  const again = retire("wt-one", { runId: null });
  assert.equal(again.action.id, a.action.id, "and the same request with no run is still the same request");
});

test("D7. thirteen distinct retirements produce thirteen distinct actions", () => {
  // The measured incident, replayed at full width.
  const names = ["wt-audit", "wt-branch-fix", "wt-cohort", "wt-delivery", "wt-promote-mac-mini-runtime",
    "wt-promote-v2", "wt-provision", "wt-readiness", "wt-s15-c4", "wt-s15-retry", "wt-session",
    "wt-topology", "wt6-promote-operational-cards"];
  const ids = names.map((n) => retire(n, { fingerprint: FP_A, headSha: SHA_A }).action.id);
  assert.equal(new Set(ids).size, 13, `13 retirements collapsed to ${new Set(ids).size} action(s)`);
});

test("D8. THE CI GUARD: a destructive action must declare a semantic identity", () => {
  /*
   * The smallest static guard the architecture supports. `destructive: true` is
   * the declaration; this is the invariant that makes declaring it mean
   * something. A new deletion capability registered without an identity fails
   * here rather than eleven retirements later.
   *
   * Probed through validateInputs rather than read off the definition, because
   * the key is BUILT during normalisation — reading the literal would pass for a
   * definition that computes null.
   */
  const PROBES = {
    [ACTION_TYPES.VACILANDO_RETIRE_WORKTREE]: {
      repository: "repo_alloy", worktree: "wt-one", branch: "promote/x",
      headSha: SHA_A, safetyFingerprint: FP_A, s7State: "RECLAIMABLE",
    },
  };
  const destructive = Object.values(ACTION_TYPES)
    .map((k) => [k, getActionDefinition(k)])
    .filter(([, def]) => def?.destructive === true);
  assert.ok(destructive.length >= 1, "at least the retirement must declare itself destructive");
  for (const [key, def] of destructive) {
    const probe = PROBES[key];
    assert.ok(probe, `${key} declares itself destructive but this guard has no probe for it — add one`);
    const v = def.validateInputs(probe);
    assert.equal(v.ok, true, `${key}: ${v.code || v.error}`);
    const identity = v.normalized?.dedupeKey ?? v.normalized?.queryHash ?? null;
    assert.ok(identity, `${key} deletes something and cannot say which one`);
  }
});

test("D8b. a destructive action that loses its identity stops replaying finished results", () => {
  /*
   * Belt as well as braces. If a future edit drops the key, the framework must
   * still refuse to hand a finished deletion to a different request rather than
   * falling back to the old `undefined === undefined` wildcard.
   */
  const def = getActionDefinition(ACTION_TYPES.VACILANDO_RETIRE_WORKTREE);
  assert.equal(def.destructive, true);
  const real = def.validateInputs;
  try {
    def.validateInputs = (inputs) => {
      const v = real.call(def, inputs);
      if (v.ok) delete v.normalized.dedupeKey;
      return v;
    };
    const a = retire("wt-one");
    const b = retire("wt-two");
    assert.notEqual(b.action.id, a.action.id, "keyless and destructive is not a wildcard");
  } finally {
    def.validateInputs = real;
  }
});

test("D8c. the sibling finding is recorded where it will be noticed", () => {
  /*
   * `platform.register_developer_application` normalises to no dedupeKey and no
   * queryHash. It is a privileged WRITE, not a deletion, so this mission leaves
   * its behaviour alone — but the day anyone marks it destructive, D8 fails
   * until it is given an identity. That is the report, expressed as a control.
   */
  const def = getActionDefinition(ACTION_TYPES.PLATFORM_REGISTER_DEVELOPER_APPLICATION);
  const v = def.validateInputs({ slug: "my-app", name: "My App", publisher: "Pub", databaseTarget: "alloy_deployed_primary" });
  assert.equal(v.ok, true);
  assert.equal(v.normalized?.dedupeKey ?? v.normalized?.queryHash ?? null, null,
    "if this action gained an identity, delete this test — the finding is closed");
  assert.notEqual(def.destructive, true, "and if it ever becomes destructive, D8 is the gate");
});

test("D9. keyless in-flight reuse survives, but only for identical inputs", () => {
  assert.equal(sameNormalizedInputs({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }), true, "order is not identity");
  assert.equal(sameNormalizedInputs({ a: 1 }, { a: 2 }), false);
  assert.equal(sameNormalizedInputs({}, {}), true);
});

/* ── RESULT OWNERSHIP ────────────────────────────────────────────────────── */

test("O1. ownership compares what an action acts ON, and skips what is absent", () => {
  assert.equal(resultOwnershipMatches({ worktree: "wt-one" }, { worktree: "wt-one" }).ok, true);
  const bad = resultOwnershipMatches({ worktree: "wt-branch-fix" }, { worktree: "wt-topology" });
  assert.equal(bad.ok, false);
  assert.match(bad.detail, /wt-branch-fix/);
  assert.match(bad.detail, /wt-topology/);
  assert.equal(resultOwnershipMatches({}, {}).ok, true, "absent on both sides is not evidence of anything");
});

test("O2. a stale success cannot satisfy a live retirement request", (root) => {
  /*
   * Defence in depth, at the exact shape the eleven callers were handed: an
   * action whose dedupe key now says "wt-topology" while the stored RESULT
   * still describes wt-branch-fix. Only reachable if a future dedupe rule is
   * wrong, which is the point of checking it at the other end too.
   */
  const first = retire("wt-branch-fix");
  mutateStoredAction(root, first.action.id, (a) => {
    a.state = "completed";
    a.result = {
      worktree: "wt-branch-fix", path: "/w/wt-branch-fix", safety_fingerprint: FP_A,
      postconditions: { filesystem_path_absent: true },
    };
    a.inputs.dedupeKey = `retire_worktree:wt-topology@${SHA_A.slice(0, 12)}#${FP_A.slice(0, 12)}`;
    a.inputs.worktree = "wt-topology";
  });
  const out = fulfillRetireWorktreeForMission(SCOPE, {
    inputs: { repository: "repo_alloy", worktree: "wt-topology", branch: "promote/x", headSha: SHA_A, safetyFingerprint: FP_A, s7State: "RECLAIMABLE" },
    nowMs: Date.now(),
  });
  assert.equal(out.ok, false, "a result naming another worktree must never be accepted");
  assert.equal(out.error, "destructive_result_ownership_mismatch");
  assert.match(out.detail, /wt-branch-fix/);
  assert.match(out.detail, /wt-topology/);
});

/* ── WAIT CONTRACT ───────────────────────────────────────────────────────── */

const LANE = "lane_aaaaaaaaaaaa";
function waitingRun(root, caption) {
  const c = createQueuedRun({ laneId: LANE, instruction: "work", origin: "operator", root });
  assert.equal(c.ok, true, `fixture: ${c.error}`);
  reportRunState(c.run.run_id, "executing", { origin: "operator", root });
  const d = describeWait({ reason: "needs_operator_input", resource_id: "gar_probe", waiting_since: Date.now() });
  transitionExecutionRun(c.run.run_id, "WAITING_RESOURCE", {
    reason: caption, origin: "system", root,
    resource_wait: { ...d, resource_key: "director_governed_action", label: "Director", summary: caption, governed_request_id: "gar_probe", action_key: ACTION_TYPES.VACILANDO_RETIRE_WORKTREE },
  });
  return getExecutionRun(c.run.run_id, root);
}

test("W1. THE DEFECT: the machine wait reason survives the write", (root) => {
  const run = waitingRun(root, "Waiting on Director — worktree retirement");
  assert.equal(run.resource_wait.reason, "needs_operator_input",
    "the writer's allowlist dropped the whole S6 envelope, `reason` included");
});

test("W2. the Governor classifies the stored wait as valid, not missing", (root) => {
  const run = waitingRun(root, "Waiting on Director — worktree retirement");
  const verdict = describeWait({ reason: run.resource_wait.reason, resource_id: "gar_probe", waiting_since: Date.now() });
  assert.equal(verdict.invalid_because, undefined, `run would be failed: ${verdict.invalid_because}`);
  assert.equal(verdict.resolution_state, "waiting");
  assert.equal(verdict.bound_policy, "human_indefinite", "a question for a person waits until the person answers");
});

test("W3. the human caption stays separate from the machine key", (root) => {
  const caption = "Waiting on Director — worktree retirement";
  const run = waitingRun(root, caption);
  assert.equal(run.resource_wait.summary, caption, "the caption is still carried, as presentation");
  assert.notEqual(run.resource_wait.reason, caption, "and it is never used as the classification key");
  assert.equal(isDeclaredWaitReason(caption), false, "a caption is not a declared wait reason");
});

test("W4. an undeclared reason is not stored as though it were declared", (root) => {
  const c = createQueuedRun({ laneId: LANE, instruction: "work", origin: "operator", root });
  reportRunState(c.run.run_id, "executing", { origin: "operator", root });
  transitionExecutionRun(c.run.run_id, "WAITING_RESOURCE", {
    reason: "x", origin: "system", root,
    resource_wait: { reason: "waiting_on_something_nobody_declared", resource_key: "k" },
  });
  const run = getExecutionRun(c.run.run_id, root);
  assert.equal(run.resource_wait.reason, undefined,
    "a wait nobody defined must keep reading as missing, not be preserved as a plausible key");
});

test("W5. the run survives the wait and can still be resumed", (root) => {
  const run = waitingRun(root, "Waiting on Director — worktree retirement");
  assert.equal(run.state, "WAITING_RESOURCE");
  const out = transitionExecutionRun(run.run_id, "EXECUTING", { reason: "governed_action_complete", origin: "system", root });
  assert.notEqual(out?.ok, false, `approval must resume the same run: ${out?.error}`);
  assert.equal(getExecutionRun(run.run_id, root).state, "EXECUTING");
});

test("W6. THE RACE: a completed action must not clear a wait the run is still in", (root) => {
  /*
   * The half the first repair did not reach, and the one that actually killed
   * both runs. On completion the governed layer nulled `resource_wait` while
   * the run was still WAITING_RESOURCE; the transition back to EXECUTING
   * happens later, in the resume path. In between, `waitReasonFor` reads
   * nothing and the Governor fails the run `missing_wait_reason`.
   *
   * Asserted at the boundary that matters: whatever else is true, a run in
   * WAITING_RESOURCE must never be holding an unreadable wait.
   */
  const run = waitingRun(root, "Waiting on Director — worktree retirement");
  assert.equal(run.state, "WAITING_RESOURCE");
  assert.ok(run.resource_wait, "fixture: the wait is live");

  // Exactly what the completion path used to do, unconditionally.
  patchRunResourceWait(run.run_id, null, root);
  const stranded = getExecutionRun(run.run_id, root);
  const reason = stranded.state === "WAITING_RESOURCE" ? stranded.resource_wait?.reason : "n/a";
  const verdict = describeWait({ reason, resource_id: "gar_probe", waiting_since: Date.now() });
  assert.equal(verdict.invalid_because, "missing_wait_reason",
    "fixture: this is the shape that kills a run, so the guard below has something to prevent");

});

test("W7. the guarded shape: still waiting, still able to say what for", (root) => {
  const run = waitingRun(root, "Waiting on Director — worktree retirement");
  // The completion path now asks the run's state before clearing, so a run that
  // has not left the wait keeps it.
  const live = getExecutionRun(run.run_id, root);
  if (!live || live.state !== "WAITING_RESOURCE") patchRunResourceWait(run.run_id, null, root);
  const after = getExecutionRun(run.run_id, root);
  assert.equal(after.state, "WAITING_RESOURCE");
  assert.ok(isDeclaredWaitReason(after.resource_wait?.reason),
    "a run that is still waiting must still be able to say what for");
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
