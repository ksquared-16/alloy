#!/usr/bin/env node
/**
 * A QA IDENTITY MUST EXIST FOR EVERY SLOT THE HOST ACTUALLY HAS.
 *
 * THE DEFECT. `MANAGED_QA_IDENTITY` read `qa-slot[1-6]`. The host has run twelve
 * slots since ALLOY_MAX_AGENTS moved, and `managed-slots.mjs` exists precisely
 * because that number had been re-encoded as a literal in ten files — "a Gateway
 * that will not allocate slot 7, a census that skips it, a lane that cannot bind
 * it". Three copies were consolidated onto the topology owner. This was the
 * fourth, and it was missed.
 *
 * MEASURED ON THE LIVE HOST, which is how it surfaced: slots 1-6 reported an
 * expected identity; slots 7, 8, 9, 11 and 12 reported `expected_identity_missing`,
 * so `vac browser-auth status` and `restore` were blocked for every lane above
 * six — including slot 12, which was holding up an unrelated certification.
 *
 * THE CONFIG WAS SHORT TOO, and that part is the operator's to extend. What made
 * it unfixable from configuration alone is that this pattern REJECTED the
 * extension: `qa-slot7-…` and `qa-slot12-…` both failed it, so a correctly
 * configured slot 7 could still never be provisioned or access-assigned.
 *
 * These controls hold the bound to the topology owner and keep the refusal that
 * matters — anything that is not a managed alias for a slot that exists.
 */
import assert from "node:assert/strict";

const { readFileSync } = await import("node:fs");
const readSource = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const P = await import("../lib/vacilando/qa-identity-provision-action.mjs");
const { managedSlots } = await import("../lib/vacilando/managed-slots.mjs");

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

test("T1. every slot the host has can hold a managed QA identity", () => {
  // The defect, stated as the invariant it broke: a slot that EXISTS must be
  // able to have the identity that browser-auth restore requires.
  const env = { ALLOY_MAX_AGENTS: "12" };
  for (const slot of managedSlots(env)) {
    assert.equal(P.isManagedQaIdentity(`qa-slot${slot}-role@example.com`, env), true,
      `slot ${slot} exists on this topology but its QA alias is rejected`);
  }
});

test("T2. the bound follows the topology owner, in both directions", () => {
  assert.equal(P.isManagedQaIdentity("qa-slot12-x@example.com", { ALLOY_MAX_AGENTS: "12" }), true);
  assert.equal(P.isManagedQaIdentity("qa-slot12-x@example.com", { ALLOY_MAX_AGENTS: "6" }), false,
    "a slot the host does not have must not be accepted either");
  assert.equal(P.isManagedQaIdentity("qa-slot7-x@example.com", { ALLOY_MAX_AGENTS: "6" }), false);
});

test("T3. a slot ABOVE the topology is still refused", () => {
  const env = { ALLOY_MAX_AGENTS: "12" };
  assert.equal(P.isManagedQaIdentity("qa-slot13-x@example.com", env), false);
  assert.equal(P.isManagedQaIdentity("qa-slot99-x@example.com", env), false);
});

test("T4. the refusal that matters is unchanged: only managed aliases pass", () => {
  // This check is the line that keeps the action from ever touching a customer
  // or employee account. Widening the slot range must not widen that.
  const env = { ALLOY_MAX_AGENTS: "12" };
  for (const id of [
    "someone@customer.com", "admin@alloy.com", "qa@example.com",
    "qa-slot@example.com", "qa-slotX-role@example.com", "notqa-slot5-role@example.com",
    "qa-slot5-role@example.com ", "", null, undefined,
  ]) {
    assert.equal(P.isManagedQaIdentity(id, env), false, `must refuse ${JSON.stringify(id)}`);
  }
});

test("T5. no literal slot ceiling survives in the identity owner", () => {
  // THE CLASS, not the instance. This file re-encoded the slot count as
  // `[1-6]`; the same mistake anywhere in it would fail here.
  // Comments stripped first: this file EXPLAINS the `qa-slot[1-6]` defect it
  // closes, and matching that sentence would fail the check for describing the
  // very thing it prevents. Same trap as the route-scope control.
  const src = stripComments(readSource("../lib/vacilando/qa-identity-provision-action.mjs"));
  assert.ok(!/qa-slot\[[0-9]-[0-9]\]/.test(src), "the slot range must not be a literal character class");
  assert.match(src, /managedSlots\(/, "it must read the topology owner");
});

test("T6. both governed actions share one identity check", () => {
  // The provision action and the access-assign action each validate the
  // identity. Two copies of the rule is how one of them ends up stale — which
  // is the shape of the original defect one layer up.
  const assign = stripComments(readSource("../lib/vacilando/qa-access-assign-action.mjs"));
  assert.match(assign, /isManagedQaIdentity/, "assign must use the shared check");
  assert.ok(!/qa-slot\[/.test(assign), "and must not carry its own pattern");
});

test("T7. the exported pattern still matches the live check", () => {
  // MANAGED_QA_IDENTITY is a snapshot for callers that want the regex; it must
  // not drift from the function the validators actually call.
  for (const slot of managedSlots()) {
    const id = `qa-slot${slot}-role@example.com`;
    assert.equal(P.MANAGED_QA_IDENTITY.test(id), P.isManagedQaIdentity(id),
      `snapshot and live check disagree for slot ${slot}`);
  }
});

/*
 * THE FIFTH AND SIXTH COPIES, AND THEY COST A DIRECTOR APPROVAL.
 *
 * The tests above certify the GUARD MODULE. They cannot see the trusted children
 * — `vac-qa-identity-provision.mjs` and `vac-qa-access-assign.mjs` — which are
 * separate files, spawned as separate processes, each carrying its own copy of
 * the identity check by design. Two checks is the design. Two DIFFERENT ANSWERS
 * to "how many slots exist" is the bug, and that is exactly what shipped: the
 * module said `managedSlots()` while both children still said `[1-6]`.
 *
 * How it surfaced: slot 12's identity was configured, `vac browser-auth status`
 * resolved it correctly, the Director APPROVED `environment.provision_qa_identity`
 * — and execution failed `identity_not_managed_qa_shape` inside the child. A
 * spent approval was the only thing that could have caught it, because no test
 * of the library module ever loads these files.
 */
const CHILDREN = [
  ["vac-qa-identity-provision.mjs", "provisioned"],
  ["vac-qa-access-assign.mjs", "assigned access"],
];

/** Source with comments stripped — a control must never match its own rationale. */
function codeOf(file) {
  const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("T8. no trusted child hardcodes a slot range", () => {
  for (const [file] of CHILDREN) {
    const code = codeOf(file);
    assert.ok(!/qa-slot\[[0-9]/.test(code), `${file} still carries a slot-range literal`);
    assert.match(code, /managedSlots\(\)/, `${file} must take its bound from the topology owner`);
  }
});

test("T9. every child still refuses a non-managed identity", () => {
  for (const [file] of CHILDREN) {
    const code = codeOf(file);
    assert.match(code, /identity_not_managed_qa_shape/, `${file} dropped the refusal entirely`);
  }
});

test("T10. the child's own pattern tracks the topology, both directions", () => {
  // The REAL expression, lifted from the REAL file and evaluated against a stub
  // topology. Asserting on the source text alone would pass on a pattern that
  // never matches anything.
  for (const [file] of CHILDREN) {
    const line = codeOf(file).split("\n").find((l) => l.includes("new RegExp("));
    assert.ok(line, `${file}: no constructed pattern found`);
    const build = (slots) => {
      const managedSlots = () => slots;
      // eslint-disable-next-line no-eval
      return eval(line.replace(/^\s*const\s+\w+\s*=\s*/, "").replace(/;\s*$/, ""));
    };
    const twelve = build([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    assert.ok(twelve.test("qa-slot12-work-items@example.com"), `${file}: slot 12 refused at a 12-slot host`);
    assert.ok(twelve.test("qa-slot1-product@example.com"), `${file}: slot 1 refused`);
    assert.ok(!twelve.test("customer@acme.com"), `${file}: a customer account was accepted`);
    assert.ok(!twelve.test("qa-slot99-x@example.com"), `${file}: a slot the host lacks was accepted`);
    // And it must genuinely narrow when the host is smaller — proving the bound
    // is read, not merely widened to a new literal.
    assert.ok(!build([1, 2, 3, 4, 5, 6]).test("qa-slot12-work-items@example.com"),
      `${file}: slot 12 accepted on a 6-slot host`);
  }
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
