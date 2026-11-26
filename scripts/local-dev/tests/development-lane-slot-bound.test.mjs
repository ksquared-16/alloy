#!/usr/bin/env node
/**
 * THE SIX-SLOT DOCTRINE HID INSIDE A ONE-LINE BOUND.
 *
 * `asSlot` read `n <= 6`. True on the six-slot host, silently false from the
 * moment topology moved to twelve, and it gates every slot this module handles
 * — so slots 7-12 read as null in seven places at once.
 *
 * Measured live: payments held slot 7 and troubleshooting held slot 8, both
 * active and registered. freeSlots() dropped both and offered 7 as the first
 * FREE slot, so creating a lane through the Director tried to adopt a slot a
 * real lane was using. Only alloy-worktree-adopt's refusal prevented two lanes
 * on one port — a fail-closed guard in the other language catching what this
 * one got wrong.
 *
 * What these assert is not "the number is now twelve". It is that the bound is
 * DERIVED from the topology owner, so the next topology change cannot silently
 * reintroduce this.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { freeSlots, classifyRegistrations } from "../lib/vacilando/lane-worktree-lifecycle.mjs";
import { managedSlots, isManagedSlot } from "../lib/vacilando/managed-slots.mjs";

const SRC = readFileSync(new URL("../lib/vacilando/lane-worktree-lifecycle.mjs", import.meta.url), "utf8");

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const meta = (rows) => rows.map((r) => ({ worktree: r.w, slot: String(r.s), port: String(3010 + r.s), lifecycle: r.l ?? "active" }));
const cfg = { metadata_dir: "/nonexistent-so-metadata-must-be-injected" };

test("1. the slot bound is derived, never a literal", () => {
  assert.doesNotMatch(SRC, /n >= 1 && n <= 6/, "a hard-coded ceiling is the defect itself");
  assert.match(SRC, /isManagedSlot\(n\)/, "the bound must come from the topology owner");
});

test("2. a registration above the old six is recognised, not dropped", () => {
  // The exact live case: payments on 7, troubleshooting on 8. Asserted on the
  // NORMALISING surface — registrationForWorktree is a raw passthrough and
  // returns the metadata string, so testing it would prove nothing about asSlot.
  const m = meta([{ w: "payments", s: 7 }, { w: "troubleshooting", s: 8 }]);
  const rows = classifyRegistrations({ cfg, metadata: m }).registrations
    ?? classifyRegistrations({ cfg, metadata: m });
  const slotOf = (w) => (Array.isArray(rows) ? rows : Object.values(rows).flat())
    .find((r) => r && r.worktree === w)?.slot;
  assert.equal(slotOf("payments"), 7);
  assert.equal(slotOf("troubleshooting"), 8);
});

test("3. an occupied high slot is NOT offered as free", () => {
  // This is the one that mattered: offering 7 sent lane creation at a slot a
  // real lane was using.
  const m = meta([{ w: "payments", s: 7 }, { w: "troubleshooting", s: 8 }]);
  const free = freeSlots({ cfg, metadata: m });
  assert.ok(!free.includes(7), "slot 7 is held by payments");
  assert.ok(!free.includes(8), "slot 8 is held by troubleshooting");
});

test("4. genuinely free high slots are still offered", () => {
  const m = meta([{ w: "payments", s: 7 }]);
  const free = freeSlots({ cfg, metadata: m });
  const expected = managedSlots().filter((n) => n !== 7);
  assert.deepEqual(free, expected, "everything the topology owns except the one that is taken");
});

test("5. a slot outside the topology is refused rather than trusted", () => {
  const beyond = Math.max(...managedSlots()) + 1;
  assert.equal(isManagedSlot(beyond), false);
  const m = meta([{ w: "impossible", s: beyond }]);
  // A slot nobody owns must not quietly remove a legitimate slot from the
  // free list — the bound has to reject in both directions, not just admit
  // the ones that were previously dropped.
  assert.deepEqual(freeSlots({ cfg, metadata: m }), managedSlots());
});

test("6. a finished registration frees its slot; an active one does not", () => {
  const m = meta([{ w: "done", s: 9, l: "finished" }, { w: "live", s: 10, l: "active" }]);
  const free = freeSlots({ cfg, metadata: m });
  assert.ok(free.includes(9), "a finished lane releases its slot");
  assert.ok(!free.includes(10), "an active lane keeps it");
});

test("7. exhaustion is counted from the topology, not asserted as six", () => {
  assert.doesNotMatch(SRC, /All six managed slots/, "the literal outlived the six-slot host");
  assert.match(SRC, /All \$\{managedSlots\(\)\.length\} managed slots/);
  const m = meta(managedSlots().map((s) => ({ w: `w${s}`, s })));
  assert.deepEqual(freeSlots({ cfg, metadata: m }), [], "every slot taken means none free");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
