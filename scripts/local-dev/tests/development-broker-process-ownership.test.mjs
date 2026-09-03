#!/usr/bin/env node
/**
 * THE GUARD KILLED ITS OWN BROKER'S BUILD.
 *
 * THE INCIDENT. A legitimately brokered `vac run build` died rc=143
 * class=cancelled about six seconds after START. findUnbrokeredHeavyProcesses()
 * had returned pid 64288 `npm exec next build` as an unbrokered bypass and the
 * watchdog SIGTERMed it. The host was idle at the time — brokered budget 0/9, no
 * competing heavy validation, ~9.9 GB free against a 4.8 GB reserve. Nothing was
 * under pressure. The guard simply could not tell that the broker owned the job.
 *
 * WHY. Ownership was inferred by reading a descendant's environment for
 * ALLOY_VALIDATE_EXECUTING=1 through `ps eww`. For `npm exec next build` and the
 * node processes Next spawns beneath it, that environment is not reliably
 * observable, so the lookup returned false and broker-owned work was classified
 * as a bypass. An exemption that depends on a descendant advertising itself is
 * an exemption that fails exactly when the process tree gets deep — which is to
 * say, on every real build.
 *
 * THE MODEL THESE LOCK IN. The broker already recorded what it admitted: the
 * claim carries the pid holding it. Descendants of a LIVE claim are broker-owned
 * by construction. Environment inspection is retained only as a free secondary
 * signal that is no longer load-bearing.
 *
 * Every case below injects both the process table and the claim set, because a
 * guard that can only be exercised against whatever happens to be running on the
 * host is a guard nobody can prove.
 */
import assert from "node:assert/strict";

const G = await import("../lib/vacilando/heavy-validation-guard.mjs");

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/** ps -ax -o pid=,pgid=,command= */
const ps = (rows) => rows.map(([pid, pgid, cmd]) => `${pid} ${pgid} ${cmd}`).join("\n");
/** ps -ax -o pid=,ppid=,pgid= */
const tree = (rows) => rows.map(([pid, ppid, pgid]) => ({ pid, ppid, pgid }));
const claims = (list) => () => list;

// The real shape: alloy-validate holds the claim, npm sits under it, and Next
// spawns compiler workers two and three levels down.
const BROKER_ROOT = 900;
const BUILD_TREE = tree([
  [1, 0, 1],
  [BROKER_ROOT, 1, BROKER_ROOT],       // alloy-validate — holds the claim
  [901, BROKER_ROOT, BROKER_ROOT],     // npm exec next build
  [902, 901, BROKER_ROOT],             // next build
  [903, 902, BROKER_ROOT],             // Next-spawned TypeScript worker
]);
const LIVE_CLAIM = claims([{ pid: BROKER_ROOT, kind: "build" }]);

test("1. a brokered heavy process at the claim root is exempt", () => {
  const hits = G.findUnbrokeredHeavyProcesses({
    psOut: ps([[BROKER_ROOT, BROKER_ROOT, "next build"]]),
    procTable: BUILD_TREE, readClaims: LIVE_CLAIM,
  });
  assert.deepEqual(hits, []);
});

test("2. a brokered CHILD is exempt", () => {
  const hits = G.findUnbrokeredHeavyProcesses({
    psOut: ps([[901, BROKER_ROOT, "npm exec next build"]]),
    procTable: BUILD_TREE, readClaims: LIVE_CLAIM,
  });
  assert.deepEqual(hits, [], "the incident's own process shape");
});

test("3. a brokered GRANDCHILD is exempt", () => {
  const hits = G.findUnbrokeredHeavyProcesses({
    psOut: ps([[902, BROKER_ROOT, "next build"]]),
    procTable: BUILD_TREE, readClaims: LIVE_CLAIM,
  });
  assert.deepEqual(hits, []);
});

test("4/5. npm exec next build and its TypeScript worker are both exempt", () => {
  const hits = G.findUnbrokeredHeavyProcesses({
    psOut: ps([
      [901, BROKER_ROOT, "npm exec next build"],
      [903, BROKER_ROOT, "node /w/node_modules/typescript/bin/tsc --noEmit"],
    ]),
    procTable: BUILD_TREE, readClaims: LIVE_CLAIM,
  });
  assert.deepEqual(hits, [], "the whole brokered tree survives, not just its root");
});

test("6. ownership resolves with NO environment available at all", () => {
  // The decisive case. Nothing here exposes ALLOY_VALIDATE_EXECUTING, and the
  // real ps eww lookup would find nothing for these synthetic pids either — yet
  // the claim still proves ownership.
  const hits = G.findUnbrokeredHeavyProcesses({
    psOut: ps([[903, BROKER_ROOT, "next build"]]),
    procTable: BUILD_TREE, readClaims: LIVE_CLAIM,
  });
  assert.deepEqual(hits, [], "the claim is the proof, not the environment");
});

test("7. a genuinely unbrokered tsc is still detected", () => {
  const hits = G.findUnbrokeredHeavyProcesses({
    psOut: ps([[500, 500, "node /w/node_modules/typescript/bin/tsc --noEmit"]]),
    procTable: tree([[1, 0, 1], [500, 1, 500]]), readClaims: claims([]),
  });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].pid, 500);
});

test("8. a genuinely unbrokered next build is still detected", () => {
  const hits = G.findUnbrokeredHeavyProcesses({
    psOut: ps([[501, 501, "npx next build"]]),
    procTable: tree([[1, 0, 1], [501, 1, 501]]), readClaims: claims([]),
  });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].pid, 501);
});

test("9. an unbrokered background/redirection job is still accounted for", () => {
  // PreToolUse honestly refuses to rewrite compound shell, so this is the layer
  // that has to notice it. Detection must not depend on the shell text.
  const hits = G.findUnbrokeredHeavyProcesses({
    psOut: ps([[502, 502, "node /w/node_modules/typescript/bin/tsc --noEmit > log 2>&1"]]),
    procTable: tree([[1, 0, 1], [502, 1, 502]]), readClaims: claims([]),
  });
  assert.equal(hits.length, 1, "backgrounding must not buy an exemption");
});

test("10. a stale claim cannot exempt a later unrelated pid", () => {
  // The claim store reaps dead holders on read; this asserts the guard's own
  // behaviour when no live claim covers the pid, which is what PID reuse looks
  // like from here.
  const hits = G.findUnbrokeredHeavyProcesses({
    psOut: ps([[903, 903, "next build"]]),
    // 903 now has a different parent and no live claim covers it.
    procTable: tree([[1, 0, 1], [903, 1, 903]]), readClaims: claims([]),
  });
  assert.equal(hits.length, 1, "a finished job must not leave a standing exemption");
});

test("11. concurrent broker claims stay isolated", () => {
  const table = tree([
    [1, 0, 1],
    [900, 1, 900], [901, 900, 900],   // claim A
    [800, 1, 800], [801, 800, 800],   // claim B
    [700, 1, 700],                    // nobody's
  ]);
  const hits = G.findUnbrokeredHeavyProcesses({
    psOut: ps([
      [901, 900, "npm exec next build"],
      [801, 800, "npx tsc"],
      [700, 700, "next build"],
    ]),
    procTable: table,
    readClaims: claims([{ pid: 900 }, { pid: 800 }]),
  });
  assert.equal(hits.length, 1, "only the unclaimed process is a hit");
  assert.equal(hits[0].pid, 700);
});

test("12. a process that vanishes mid-classification is handled safely", () => {
  // Present in the command listing, absent from the process table — exactly the
  // race a scan hits when a build finishes while it runs. It must not throw, and
  // an unclaimed vanished process is still reported rather than silently lost.
  const hits = G.findUnbrokeredHeavyProcesses({
    psOut: ps([[999, 999, "next build"]]),
    procTable: tree([[1, 0, 1], [900, 1, 900]]),
    readClaims: claims([{ pid: 900 }]),
  });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].pid, 999);
});

test("an empty claim set changes nothing about detection", () => {
  // POSITIVE CONTROL: without this, a bug that made every scan return [] would
  // pass every exemption test above and look like a fix.
  const hits = G.findUnbrokeredHeavyProcesses({
    psOut: ps([[601, 601, "npx tsc"], [602, 602, "next build"]]),
    procTable: tree([[1, 0, 1], [601, 1, 601], [602, 1, 602]]),
    readClaims: claims([]),
  });
  assert.equal(hits.length, 2, "the guard must still guard");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
