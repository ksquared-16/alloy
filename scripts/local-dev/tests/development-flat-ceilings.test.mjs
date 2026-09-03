#!/usr/bin/env node
/**
 * FOUR CEILINGS THAT MUST NOT DRIFT INTO FOUR OPINIONS.
 *
 * Browser sessions, validation jobs, heavy jobs and installs share a shape the
 * dev-server ladder does not have: no burst, no reclaim, no pressure
 * judgement. The risk with flat ceilings is not miscalculation, it is silent
 * overrun — a certified concurrency of two becomes decorative the moment
 * something admits a third without saying so.
 *
 * The other risk is admitting against NO ceiling. A typo in a kind, or a
 * policy missing a field, must refuse; treating "no ceiling configured" as
 * "unlimited" is the failure that looks like everything working.
 */
import assert from "node:assert/strict";
import {
  CAPACITY_POLICY_V1, FLAT_CEILINGS, flatCeilingAdmission,
  computeCapacityPolicy, hostCapability,
} from "../lib/vacilando/capacity-policy.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

test("1. browser concurrency is the certified two", () => {
  assert.equal(CAPACITY_POLICY_V1.browser_concurrency_ceiling, 2);
});

test("2. validation, heavy and installs remain at one", () => {
  assert.equal(CAPACITY_POLICY_V1.validation_job_ceiling, 1);
  assert.equal(CAPACITY_POLICY_V1.heavy_job_ceiling, 1);
  assert.equal(CAPACITY_POLICY_V1.install_ceiling, 1);
});

test("3. a second browser session is admitted; a third is queued, never run", () => {
  assert.equal(flatCeilingAdmission({ kind: "browser", active: 1 }).allow, true);
  const third = flatCeilingAdmission({ kind: "browser", active: 2 });
  assert.equal(third.allow, false);
  assert.equal(third.queue, true, "full must mean queue, not silent overrun");
  assert.equal(third.remaining, 0);
});

test("4. each serialized kind admits exactly one", () => {
  for (const kind of ["validation_job", "heavy_job", "install"]) {
    assert.equal(flatCeilingAdmission({ kind, active: 0 }).allow, true, `${kind} first`);
    assert.equal(flatCeilingAdmission({ kind, active: 1 }).allow, false, `${kind} second`);
  }
});

test("5. an unknown kind REFUSES rather than admitting against no ceiling", () => {
  const d = flatCeilingAdmission({ kind: "browsers", active: 0 });
  assert.equal(d.allow, false);
  assert.match(d.reason, /unknown capacity kind/);
});

test("6. a policy missing the field refuses too", () => {
  const d = flatCeilingAdmission({ kind: "browser", active: 0, policy: { ...CAPACITY_POLICY_V1, browser_concurrency_ceiling: undefined } });
  assert.equal(d.allow, false);
  assert.match(d.reason, /not configured/);
});

test("7. every kind in the map resolves to a real policy field", () => {
  for (const [kind, field] of Object.entries(FLAT_CEILINGS)) {
    assert.ok(Number.isInteger(CAPACITY_POLICY_V1[field]), `${kind} -> ${field} must exist in the policy`);
    assert.equal(flatCeilingAdmission({ kind, active: 0 }).ceiling, CAPACITY_POLICY_V1[field]);
  }
});

test("8. the browser pool is automated-only, and says so", async () => {
  const axes = computeCapacityPolicy(await hostCapability({})).axes;
  assert.equal(axes.browser_capacity.ceiling, 2);
  assert.equal(axes.browser_capacity.pool, "automated_only");
  assert.match(axes.browser_capacity.excludes, /human/i,
    "a person looking at a QA route must never be able to block the fleet");
});

test("9. the three serialized ceilings are exposed with why they stay at one", async () => {
  const s = computeCapacityPolicy(await hostCapability({})).axes.serialized_capacity;
  assert.equal(s.validation_jobs.ceiling, 1);
  assert.equal(s.heavy_jobs.ceiling, 1);
  assert.equal(s.installs.ceiling, 1);
  assert.match(s.why_not_raised, /not independently measured/,
    "the next person to raise these should have to argue with the evidence");
});

test("10. an absent browser count is zero in use, not full", async () => {
  const axes = computeCapacityPolicy(await hostCapability({})).axes;
  assert.equal(axes.browser_capacity.current, 0);
  assert.equal(axes.browser_capacity.remaining, 2);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
