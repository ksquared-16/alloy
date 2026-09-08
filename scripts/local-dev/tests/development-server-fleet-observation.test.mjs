#!/usr/bin/env node
/**
 * CAPACITY POLICY WAS FLYING WITHOUT INSTRUMENTS.
 *
 * The measured truth of this host is that a dev server's cost follows AGE and
 * USE, not existence: freshly started servers measure 390-440 MB, and one that
 * has compiled real routes for hours reaches several GB. Observed live while
 * writing these — slot 1 at 368 MB two minutes old, slot 6 at 8082 MB after six
 * hours. A capacity model that counts servers cannot tell those apart, and every
 * arbitration decision downstream depends on being able to.
 *
 * What these lock in is not the numbers but the REFUSALS. The dangerous failure
 * for a recycler is not "missed a candidate" — it is "recycled something someone
 * was using", and the most seductive route to that is treating absent evidence
 * as permission.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const O = await import("../lib/vacilando/server-fleet-observation.mjs");
const SRC = readFileSync(new URL("../lib/vacilando/server-fleet-observation.mjs", import.meta.url), "utf8");

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

test("1. it composes existing owners rather than storing its own truth", () => {
  assert.match(SRC, /from "\.\/managed-slots\.mjs"/, "slots come from the topology owner");
  assert.match(SRC, /from "\.\/dev-server-ownership\.mjs"/, "ownership comes from the ownership owner");
  assert.match(SRC, /dev-server-lifecycle\.jsonl/, "desired state comes from the lifecycle audit");
  assert.doesNotMatch(SRC, /writeFileSync|appendFileSync/, "an observer that writes is a registry");
});

test("2. a server's cost is its whole process tree, not its listener", () => {
  // The listener is a thin parent; the next-server child and its compile workers
  // hold the working set. Charging only the listener reports a 3 GB server as 40 MB.
  assert.match(SRC, /subtreeRssMb/);
  assert.match(SRC, /children\.get\(pid\)/, "descendants must be walked");
});

test("3. the worktree comes from the registry, never from whoever holds the port", () => {
  assert.match(SRC, /registeredWorktreeForSlot/);
  assert.match(SRC, /ALLOY_WORKTREE_SLOT/, "slot ownership is read from registered metadata");
});

test("4. absent evidence is never a reason to recycle", () => {
  // The first cut used `desired !== "RUNNING"`, which made a server eligible
  // precisely because nobody could say whether it was wanted — slot 4, 3.8 GB
  // and 23 hours old with desired UNKNOWN because it predates the audit.
  assert.doesNotMatch(SRC, /recycle_eligible:\s*Boolean\(pid && large && desired !== "RUNNING"\)/,
    "eligibility must not be derived from not-knowing");
  assert.match(SRC, /recycle_blocked_reason/, "a refusal must say what evidence is missing");
});

test("5. nothing is recycle-eligible while idleness is unobservable", () => {
  const f = O.observeServerFleet();
  assert.equal(f.rollup.recycle_eligible, 0,
    "no idleness signal exists yet, so no candidate may be declared safe");
  for (const s of f.servers) {
    assert.equal(s.recycle_eligible, false);
    if (s.observed_state === "RUNNING") {
      assert.ok(s.recycle_blocked_reason, `slot ${s.slot} must name why it is not eligible`);
    }
  }
});

test("6. a large WANTED server is the recycle shape, and is still refused", () => {
  // POSITIVE CONTROL for test 5. If the observer stopped seeing large servers
  // at all, "nothing eligible" would pass for the wrong reason.
  //
  // The reason is asserted as a PROPERTY, not as one fixed code. It first
  // pinned /idleness/ and then legitimately failed once active-run evidence
  // landed, because slot 6 — 6.3 GB, six hours old — turned out to be running
  // a live run and started being refused for a STRONGER reason. Pinning the
  // weakest acceptable answer would have made a real improvement look like a
  // regression.
  const f = O.observeServerFleet();
  const running = f.servers.filter((s) => s.observed_state === "RUNNING");
  assert.ok(running.length > 0, "this test is meaningless without a running fleet");
  const wanted = running.filter((s) => s.large && s.desired_state === "RUNNING");
  for (const s of wanted) {
    assert.ok(Object.values(O.RECYCLE_BLOCKED).includes(s.recycle_blocked_reason),
      `slot ${s.slot} must be refused by a canonical reason, got ${s.recycle_blocked_reason}`);
    assert.notEqual(s.recycle_blocked_reason, O.RECYCLE_BLOCKED.NOT_LARGE_ENOUGH,
      "a large server cannot be refused for being small — that would mean size decided it");
    if (!s.active_run) {
      assert.equal(s.recycle_blocked_reason, O.RECYCLE_BLOCKED.IDLENESS_NOT_OBSERVABLE,
        "with nothing else against it, the honest refusal is that idleness cannot be seen");
    }
  }
  assert.ok(running.some((s) => s.rss_mb > 0), "RSS must actually be measured");
});

test("6b. an active run outranks every other reason to take a server", () => {
  // Measured while writing this: the single most attractive target on the host
  // (6.3 GB, six hours old) was executing a run. Age and size are exactly the
  // signals that would have chosen it, and both would have been wrong.
  // Only RUNNING servers: a lane can hold an active run with no server at all
  // (observed live — payments was VALIDATING with nothing on its port), and
  // "not running" is the correct, stronger refusal for those.
  const f = O.observeServerFleet();
  for (const s of f.servers.filter((x) => x.active_run && x.observed_state === "RUNNING")) {
    assert.equal(s.recycle_blocked_reason, O.RECYCLE_BLOCKED.ACTIVE_RUN,
      `slot ${s.slot} is running ${s.active_run.state} and must be refused for THAT`);
    assert.equal(s.recycle_eligible, false);
  }
});

test("6b2. a lane can want work without holding a server, and that is refused for not running", () => {
  const f = O.observeServerFleet();
  for (const s of f.servers.filter((x) => x.active_run && x.observed_state !== "RUNNING")) {
    assert.equal(s.recycle_blocked_reason, O.RECYCLE_BLOCKED.NOT_RUNNING);
  }
});

test("6c. an unrecognised run state counts as active, not as finished", () => {
  // Terminal states are listed rather than inferred. Reading an unknown state
  // as finished is how a busy server becomes a recycle candidate.
  assert.match(SRC, /\["COMPLETE", "FAILED", "CANCELLED", "ABANDONED"\]\.includes\(state\)/,
    "the terminal set must be explicit");
});

test("6d. an orphan is proven by a missing worktree, never by silence", () => {
  const f = O.observeServerFleet();
  for (const s of f.servers) {
    if (s.orphaned_registration) {
      assert.equal(s.worktree_exists, false, "an orphan claim requires the worktree to actually be gone");
      assert.ok(s.pid, "and something must actually be running");
    }
  }
  assert.match(SRC, /orphaned_registration: Boolean\(pid && name && !worktreeExists\)/);
});

test("7. running-while-stopped is a reconcile, not a capacity decision", () => {
  assert.match(SRC, /reclaimable: Boolean\(pid && desired === "STOPPED"\)/,
    "only a server the operator asked to stop is reclaimable");
});

test("8. the rollup reports what policy needs and nothing it must not trust", () => {
  const f = O.observeServerFleet();
  for (const k of ["running", "total_rss_mb", "large", "recycle_eligible", "restart_exhausted"]) {
    assert.ok(k in f.rollup, `rollup must carry ${k}`);
  }
  assert.equal(f.schema_version, O.FLEET_OBSERVATION_SCHEMA);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
