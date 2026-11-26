#!/usr/bin/env node
/**
 * A CAPABILITY THAT MOVES ONE NUMBER, AND REFUSES EVERYTHING ELSE.
 *
 * The provider experiment needed to change one line of host config and change
 * it back. The only tool for that was general file mutation — which reaches
 * every other setting on the machine, records nothing about why the number
 * moved, and leaves no statement of what it should return to.
 *
 * These tests are almost entirely about REFUSALS, because the value of this
 * capability is what it will not do. The one that matters most is
 * compare-and-set: an experiment that has lost track of the live ceiling is
 * exactly the one that must not write, and a blind write is how an interrupted
 * run leaves 10 behind while its report claims 4.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MANAGED_KEY, MIN_CEILING, MAX_CEILING,
  readCeiling, setExperimentalProviderCeiling,
} from "../lib/vacilando/capacity-experiment-ceiling.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  const dir = mkdtempSync(join(tmpdir(), "vac-ceil-"));
  const cfg = join(dir, "config");
  writeFileSync(cfg, [
    "# host config fixture",
    'ALLOY_MAX_RUNNING_SERVERS="8"',
    `${MANAGED_KEY}="4"`,
    'ALLOY_MAX_CONCURRENT_INSTALLS="1"',
    "",
  ].join("\n"));
  try { fn(cfg); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
const call = (cfg, o) => setExperimentalProviderCeiling({ configPath: cfg, experimentId: "t", ...o });

test("1. it moves the managed key inside the authorised window", (cfg) => {
  const out = call(cfg, { expected: 4, requested: 6, rollbackTo: 4 });
  assert.equal(out.ok, true, out.detail);
  assert.equal(readCeiling({ configPath: cfg }), 6);
  assert.equal(out.rollback_to, 4, "the value to return to is recorded with the change");
});

test("2. it refuses when the live value is not what the caller expected", (cfg) => {
  // THE CENTRAL GUARD. An experiment that has lost track of the ceiling is the
  // one that must not write.
  const out = call(cfg, { expected: 7, requested: 6, rollbackTo: 4 });
  assert.equal(out.ok, false);
  assert.equal(out.error, "unexpected_current_value");
  assert.equal(readCeiling({ configPath: cfg }), 4, "the file must be untouched by a refused write");
});

test("3. it refuses outside the authorised experimental range", (cfg) => {
  for (const requested of [MIN_CEILING - 1, MAX_CEILING + 1, 12, 0]) {
    const out = call(cfg, { expected: 4, requested, rollbackTo: 4 });
    assert.equal(out.ok, false, `${requested} must be refused`);
    assert.equal(out.error, "outside_experimental_range");
  }
  assert.equal(readCeiling({ configPath: cfg }), 4);
});

test("4. a rollback value is required, and must itself be in range", (cfg) => {
  // The failure guarded against is not a bad write — it is a good write nobody
  // undid.
  assert.equal(call(cfg, { expected: 4, requested: 6 }).error, "rollback_required");
  assert.equal(call(cfg, { expected: 4, requested: 6, rollbackTo: 99 }).error, "rollback_required");
  assert.equal(readCeiling({ configPath: cfg }), 4);
});

test("5. no other setting in the file may change", (cfg) => {
  const before = readFileSync(cfg, "utf8").split("\n");
  call(cfg, { expected: 4, requested: 8, rollbackTo: 4 });
  const after = readFileSync(cfg, "utf8").split("\n");
  assert.equal(before.length, after.length);
  const differing = before.map((l, i) => (l === after[i] ? null : i)).filter((i) => i !== null);
  assert.equal(differing.length, 1, "exactly one line may differ");
  assert.match(after[differing[0]], new RegExp(`^${MANAGED_KEY}=`));
  assert.equal(after.find((l) => l.startsWith("ALLOY_MAX_RUNNING_SERVERS")), 'ALLOY_MAX_RUNNING_SERVERS="8"');
  assert.equal(after.find((l) => l.startsWith("ALLOY_MAX_CONCURRENT_INSTALLS")), 'ALLOY_MAX_CONCURRENT_INSTALLS="1"');
});

test("6. a missing managed key is refused, never created", (cfg) => {
  writeFileSync(cfg, 'ALLOY_MAX_RUNNING_SERVERS="8"\n');
  const out = call(cfg, { expected: 4, requested: 6, rollbackTo: 4 });
  assert.equal(out.error, "key_absent");
  assert.equal(readFileSync(cfg, "utf8"), 'ALLOY_MAX_RUNNING_SERVERS="8"\n', "it must not invent the key");
});

test("7. a non-integer request is refused before anything is read", (cfg) => {
  for (const requested of [null, undefined, "6", 6.5, NaN]) {
    assert.equal(call(cfg, { expected: 4, requested, rollbackTo: 4 }).ok, false);
  }
  assert.equal(readCeiling({ configPath: cfg }), 4);
});

test("8. the write is verified by reading back, not assumed", (cfg) => {
  // A previous run could not prove which ceiling was live. That uncertainty is
  // the thing being engineered away.
  const out = call(cfg, { expected: 4, requested: 5, rollbackTo: 4 });
  assert.equal(out.ok, true);
  assert.equal(out.to, 5);
  assert.equal(readCeiling({ configPath: cfg }), 5, "the reported value must match the file");
});

test("9. a round trip returns the file to its exact prior state", (cfg) => {
  const before = readFileSync(cfg, "utf8");
  call(cfg, { expected: 4, requested: 8, rollbackTo: 4 });
  call(cfg, { expected: 8, requested: 4, rollbackTo: 4 });
  assert.equal(readFileSync(cfg, "utf8"), before, "up and back must be a no-op overall");
});

test("10. the managed key is a constant, not a caller-supplied parameter", () => {
  // If the key were an input, this would be a general config writer wearing a
  // narrow name.
  assert.equal(MANAGED_KEY, "ALLOY_MAX_ACTIVE_PROVIDERS");
  assert.equal(MIN_CEILING, 4);
  assert.equal(MAX_CEILING, 8);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
