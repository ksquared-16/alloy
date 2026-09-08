#!/usr/bin/env node
/**
 * A REFUSAL NOBODY RECORDS IS A REFUSAL NOBODY CAN FIX.
 *
 * These cover the properties that make a queue a queue rather than a list:
 * that waiting is measured from the first ask and not the latest retry, that
 * retrying cannot buy a second position, that the oldest waiter is never the
 * one dropped when the cap bites, and that re-offering stops at the first
 * request it cannot serve instead of quietly serving whoever is cheapest.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEMAND_DIMENSIONS, DEMAND_STATES, MAX_QUEUED,
  readDemand, recordDemand, queuedDemand, settleDemand, reconsiderDemand,
} from "../lib/vacilando/capacity-demand.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  const root = mkdtempSync(join(tmpdir(), "vac-demand-"));
  try { fn(root); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

const QUEUED = { decision: "QUEUE", queue_reason: "burst_exhausted", reason: "10/10 servers", running: 10, normal_ceiling: 8, burst_ceiling: 10, measured_knee: 11 };
const ADMIT = { decision: "START", tier: "normal", reason: "4/8", running: 4, normal_ceiling: 8, burst_ceiling: 10, measured_knee: 11 };

test("1. a queued request records who asked, why they waited, and against what ceilings", (root) => {
  const r = recordDemand({ laneId: "lane_a", worktree: "wt9", reason: "resume sprint", decision: QUEUED, root });
  assert.equal(r.state, DEMAND_STATES.QUEUED);
  assert.equal(r.blocker, "burst_exhausted");
  assert.deepEqual(r.ceilings, { running: 10, normal: 8, burst: 10, measured_knee: 11 });
  assert.equal(r.queue_position, 1);
});

test("2. it stores demand, not ownership — no pid, no lifecycle, no working set", (root) => {
  // Recorded WITH a chosen holder, because the empty-queue case would pass this
  // trivially. A holder may be named by ADDRESS (slot/port) so the caller can
  // find it; copying its pid, RSS or lifecycle here would fork the truth that
  // dev-server-ownership and the lifecycle audit already own.
  recordDemand({
    laneId: "lane_a", worktree: "wt9", root,
    decision: { decision: "RECLAIM_THEN_START", tier: "normal", running: 8,
      reclaim: { slot: 5, port: 3015, lane_worktree: "wt5", pid: 4242, rss_mb: 2200,
        desired_state: "STOPPED", holder_class: "lifecycle_inconsistency",
        release_method: "canonical_stop", chosen_because: "running although STOP was last" } },
  });
  const raw = readFileSync(join(root, "vacilando", "capacity-demand", "demand.json"), "utf8");
  for (const forbidden of ["pid", "rss_mb", "desired_state", "observed_state", "recovery_state"]) {
    assert.ok(!raw.includes(forbidden), `a demand record must not carry ${forbidden} — that belongs to the resource owner`);
  }
  assert.ok(raw.includes("\"slot\": 5"), "but the chosen holder must still be findable");
});

test("3. asking twice does not buy a second queue position", (root) => {
  recordDemand({ laneId: "lane_a", worktree: "wt9", decision: QUEUED, root });
  const again = recordDemand({ laneId: "lane_a", worktree: "wt9", decision: QUEUED, root });
  assert.equal(queuedDemand({ root }).length, 1, "one lane wanting one server is one request");
  assert.equal(again.queue_depth, 1);
});

test("4. waiting is measured from the first ask, so retrying never resets your place", (root) => {
  const first = recordDemand({ laneId: "lane_a", decision: QUEUED, root });
  const retry = recordDemand({ laneId: "lane_a", decision: QUEUED, root });
  assert.equal(retry.requested_at, first.requested_at);
  assert.equal(retry.request_id, first.request_id);
});

test("5. position is by age — a lane that asked first is served first", (root) => {
  recordDemand({ laneId: "lane_old", decision: { ...QUEUED }, root });
  recordDemand({ laneId: "lane_new", decision: { ...QUEUED }, root });
  const q = queuedDemand({ root });
  assert.deepEqual(q.map((r) => r.lane_id), ["lane_old", "lane_new"]);
  assert.deepEqual(q.map((r) => r.queue_position), [1, 2]);
});

test("6. at the cap the NEWEST request is dropped, never the longest waiter", (root) => {
  for (let i = 0; i < MAX_QUEUED + 5; i += 1) recordDemand({ laneId: `lane_${String(i).padStart(3, "0")}`, decision: QUEUED, root });
  const q = queuedDemand({ root });
  assert.equal(q.length, MAX_QUEUED);
  assert.equal(q[0].lane_id, "lane_000", "the first lane to wait must still be first in line");
});

test("7. server and provider demand queue separately", (root) => {
  recordDemand({ dimension: DEMAND_DIMENSIONS.SERVER, laneId: "lane_a", decision: QUEUED, root });
  recordDemand({ dimension: DEMAND_DIMENSIONS.PROVIDER, laneId: "lane_a", decision: QUEUED, root });
  assert.equal(queuedDemand({ dimension: DEMAND_DIMENSIONS.SERVER, root }).length, 1);
  assert.equal(queuedDemand({ dimension: DEMAND_DIMENSIONS.PROVIDER, root }).length, 1,
    "one lane may legitimately want a server and a seat at once — they are different scarcities");
});

test("8. an admitted request is not left sitting in the queue", (root) => {
  const r = recordDemand({ laneId: "lane_a", decision: ADMIT, root });
  assert.equal(r.state, DEMAND_STATES.ADMITTED);
  assert.equal(queuedDemand({ root }).length, 0);
});

test("9. a holder chosen for release is recorded with the reason it was chosen", (root) => {
  const r = recordDemand({
    laneId: "lane_a", root,
    decision: { decision: "RECLAIM_THEN_START", tier: "normal", running: 8,
      reclaim: { slot: 5, port: 3015, lane_worktree: "wt5", holder_class: "lifecycle_inconsistency",
        release_method: "canonical_stop", chosen_because: "running although STOP was the last instruction" } },
  });
  assert.equal(r.holder_selected.slot, 5);
  assert.equal(r.holder_selected.holder_class, "lifecycle_inconsistency");
  assert.match(r.holder_selected.chosen_because, /STOP/);
});

test("10. re-offering stops at the first request it still cannot serve", (root) => {
  // Otherwise a cheap newer request would be served past an expensive older
  // one, and the queue would stop being a queue without anyone noticing.
  recordDemand({ laneId: "lane_1", decision: QUEUED, root });
  recordDemand({ laneId: "lane_2", decision: QUEUED, root });
  recordDemand({ laneId: "lane_3", decision: QUEUED, root });
  const answers = { lane_1: ADMIT, lane_2: QUEUED, lane_3: ADMIT };
  const out = reconsiderDemand({ arbitrate: (r) => answers[r.lane_id], root });
  assert.deepEqual(out.admitted.map((a) => a.lane_id), ["lane_1"]);
  assert.equal(out.still_queued, 2, "lane_3 must not be served ahead of lane_2");
});

test("11. re-offering without an arbitrator admits nothing", (root) => {
  recordDemand({ laneId: "lane_1", decision: QUEUED, root });
  const out = reconsiderDemand({ root });
  assert.equal(out.admitted.length, 0, "this module must never make a capacity decision itself");
  assert.equal(out.still_queued, 1);
});

test("12. an unreadable store is an empty queue, never a crash", (root) => {
  assert.deepEqual(readDemand(root).requests, []);
  assert.equal(queuedDemand({ root }).length, 0);
});

test("13. settling a request takes it out of the queue and keeps it explainable", (root) => {
  const r = recordDemand({ laneId: "lane_a", decision: QUEUED, root });
  settleDemand({ requestId: r.request_id, state: DEMAND_STATES.WITHDRAWN, note: "lane parked", root });
  assert.equal(queuedDemand({ root }).length, 0);
  const kept = readDemand(root).requests.find((x) => x.request_id === r.request_id);
  assert.equal(kept.state, DEMAND_STATES.WITHDRAWN);
  assert.equal(kept.blocker_detail, "lane parked");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
