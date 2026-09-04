#!/usr/bin/env node
/**
 * The run store must never be emptied by a bad read.
 *
 * WHAT THIS COST. On 2026-09-04 the store went to `{"lanes": {}}` mid-turn. A run verified
 * registered at the start of a turn — status call returned EXECUTING, three occurrences in the
 * store — returned `run_not_found` minutes later, and every run on every lane went with it. The
 * `.prev` snapshot then rotated the EMPTY store into the previous-good slot, so the one recovery
 * path left held nothing either.
 *
 * The write was never the problem: atomicWrite does temp-write plus rename. The read was. It
 * treated EVERY failure as "there is nothing yet" and made no distinction between a file that is
 * ABSENT and one that is merely UNREADABLE RIGHT NOW, and the next write persisted that fabricated
 * emptiness over real state.
 *
 * These tests state the invariant from both sides, because the read fix removes the KNOWN route to
 * a fabricated empty store and cannot know about the next one.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { readExecutionRunStore, executionRunStorePath } = await import(
  "../lib/vacilando/execution-run.mjs"
);

function readFileSyncText(rel) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}


let pass = 0;
let fail = 0;

async function test(name, fn) {
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

/** A throwaway runtime root, with the store written to whatever content is given. */
function rootWith(content) {
  const root = mkdtempSync(join(tmpdir(), "vac-runstore-"));
  if (content !== undefined) {
    const path = executionRunStorePath(root);
    mkdirSync(join(root, "vacilando", "execution-runs"), { recursive: true });
    writeFileSync(path, content, "utf8");
  }
  return root;
}

const POPULATED = JSON.stringify({
  schema_version: "vacilando.execution_run.v1",
  lanes: { lane_test: { current_run_id: "erun_abc", runs: [{ run_id: "erun_abc", state: "EXECUTING" }] } },
});

// ─────────────────────────────────────────────── absence is the only legitimate empty

await test("an ABSENT store reads as empty — first boot is unaffected", () => {
  const root = rootWith(undefined);
  const store = readExecutionRunStore(root);
  assert.deepEqual(store.lanes, {});
});

await test("a PRESENT but unparseable store THROWS rather than reading as empty", () => {
  // This is the exact shape of a partial write, and it is damage, not absence. Reporting it as an
  // empty store is what let one bad read erase every run on the machine.
  const root = rootWith('{"schema_version":"vacilando.execution_run.v1","lanes":{"lane_test"');
  assert.throws(() => readExecutionRunStore(root), /present but unparseable/);
});

await test("a store that parses to a non-object THROWS", () => {
  const root = rootWith('"not a store"');
  assert.throws(() => readExecutionRunStore(root), /not an object/);
});

await test("an UNREADABLE store THROWS rather than reading as empty", () => {
  const root = rootWith(POPULATED);
  const path = executionRunStorePath(root);
  chmodSync(path, 0o000);
  try {
    // Root can read anything; skip rather than assert a false pass.
    let denied = false;
    try { readExecutionRunStore(root); } catch { denied = true; }
    if (!denied && process.getuid && process.getuid() === 0) return;
    assert.equal(denied, true, "an unreadable store was reported as empty");
  } finally {
    chmodSync(path, 0o644);
    rmSync(root, { recursive: true, force: true });
  }
});

await test("a healthy store still reads its lanes", () => {
  // POSITIVE CONTROL: the refusals above must not have made the normal path stricter.
  const root = rootWith(POPULATED);
  const store = readExecutionRunStore(root);
  assert.deepEqual(Object.keys(store.lanes), ["lane_test"]);
  assert.equal(store.lanes.lane_test.current_run_id, "erun_abc");
});

// ─────────────────────────────────────────────── the write-side outcome guard

await test("clearing a store is still allowed — the fix is on the READ, not the write", () => {
  /*
   * A write-side "never shrink to zero lanes" guard was tried here and REMOVED. It broke ten
   * durability suites, because clearing a store to empty is a legitimate operation that fixtures
   * and lifecycle resets genuinely perform. Guarding the outcome punished the honest callers and
   * left the actual defect — a READ that fabricates emptiness — untouched.
   *
   * The root cause is the read, and fixing the read is what closes the incident: emptiness can no
   * longer be INVENTED, so a write can only ever persist an emptiness a caller actually meant.
   */
  const src = readFileSyncText("../lib/vacilando/execution-run.mjs");
  assert.equal(/refusing to replace a run store holding/.test(src), false);
});

await test("the read no longer has a blanket empty fallback", () => {
  // THE MUTATION GUARD. Restoring `catch { return emptyStore(); }` is precisely what shipped the
  // incident, and it must not come back unnoticed.
  const src = readFileSyncText("../lib/vacilando/execution-run.mjs");
  const readFn = src.slice(src.indexOf("export function readExecutionRunStore"));
  const body = readFn.slice(0, readFn.indexOf("\n}\n") + 3);
  assert.equal(/catch\s*\{\s*return emptyStore\(\);?\s*\}/.test(body), false,
    "the blanket empty fallback is back in readExecutionRunStore");
  assert.match(body, /ENOENT/);
});

await test("atomicWrite still uses temp-write plus rename", () => {
  // Not the defect, and it must stay correct — a non-atomic write would create the partial file
  // the read now refuses.
  const src = readFileSyncText("../lib/vacilando/execution-run.mjs");
  assert.match(src, /const tmp = `\$\{path\}\.\$\{process\.pid\}\.tmp`/);
  assert.match(src, /renameSync\(tmp, path\)/);
});


process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
