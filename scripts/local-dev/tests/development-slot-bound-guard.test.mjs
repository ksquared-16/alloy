#!/usr/bin/env node
/**
 * A STANDING GUARD AGAINST THE SIX-SLOT DOCTRINE COMING BACK.
 *
 * The asSlot defect was one line: `n <= 6`, true on the six-slot host and
 * silently false afterwards, gating every slot in its module. It cost a
 * production correctness bug in which freeSlots() offered a slot payments was
 * using, and it was found only because a certification phase happened to
 * exercise the path.
 *
 * That was not a unique mistake — it was a CLASS. The literal six had also
 * outlived the host inside the operator headline's denominator, where it would
 * have reported eight occupied slots out of six. So this scans the control
 * plane for slot bounds that are literals rather than derivations.
 *
 * The test asserts DERIVATION, never today's number. Asserting twelve would
 * simply move the same bug one topology change into the future.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { managedSlots, isManagedSlot } from "../lib/vacilando/managed-slots.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const LIB = new URL("../lib/vacilando/", import.meta.url).pathname;
const files = readdirSync(LIB).filter((f) => f.endsWith(".mjs"));
const read = (f) => readFileSync(join(LIB, f), "utf8");

/** Comment lines are prose about the defect, not the defect. */
const codeLines = (src) => src.split("\n")
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));

test("1. no module bounds a slot with a literal ceiling", () => {
  const offenders = [];
  for (const f of files) {
    for (const line of codeLines(read(f))) {
      // The exact shape of the defect: a slot compared against a literal.
      if (/\bslot\b[^\n]*(<=|<)\s*\d+|\bn\s*(<=|<)\s*\d+\s*\?\s*n\s*:/i.test(line)) {
        if (!/isManagedSlot|managedSlots\(\)/.test(line)) offenders.push(`${f}: ${line.trim().slice(0, 90)}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `slot bounds must derive from the topology owner:\n  ${offenders.join("\n  ")}`);
});

test("2. the operator headline counts against derived topology, not a literal", () => {
  const src = read("compose.mjs");
  assert.doesNotMatch(src, /const PERMANENT_SLOTS = \d+/,
    "a literal denominator reports occupied-out-of-six on a twelve-slot host");
  assert.match(src, /managedSlots\(\)\.length/);
});

test("3. lane lifecycle bounds slots through the canonical predicate", () => {
  const src = read("lane-worktree-lifecycle.mjs");
  assert.doesNotMatch(codeLines(src).join("\n"), /n >= 1 && n <= \d+/);
  assert.match(src, /isManagedSlot\(n\)/);
});

test("4. no user-facing message hard-codes a slot count in words or digits", () => {
  const offenders = [];
  for (const f of files) {
    for (const line of codeLines(read(f))) {
      if (/All (six|seven|eight|nine|ten|eleven|twelve|\d+) managed slots/i.test(line)) offenders.push(`${f}: ${line.trim().slice(0, 80)}`);
    }
  }
  assert.deepEqual(offenders, [], "an exhaustion message must count from managedSlots()");
});

test("5. the topology owner is the only place that decides how many slots exist", () => {
  // Not that the answer is twelve — that there is exactly one answerer.
  const n = managedSlots().length;
  assert.ok(n >= 1);
  assert.equal(isManagedSlot(n), true);
  assert.equal(isManagedSlot(n + 1), false, "the bound must reject beyond the topology, whatever its size");
  assert.equal(isManagedSlot(0), false);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
