#!/usr/bin/env node
/**
 * THE READ SURFACE MUST BE A READ SURFACE.
 *
 * The provider experiment stalled on something mundane: reading the truth
 * required hand-written scripts that imported half the control plane, and those
 * reads are indistinguishable — to a tool boundary, to a reviewer, to a future
 * operator — from code that could change something. The observation ended up as
 * privileged as the mutation it was meant to justify.
 *
 * So the property under test is not the numbers, which belong to their owners
 * and change with the host. It is that this asks and never tells, that it names
 * which owner produced each answer, and that when owners disagree it says so
 * rather than silently picking one — because the disagreement between a derived
 * ceiling of 4 and an enforced ceiling of 3 is precisely what the experiment
 * existed to surface.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { observeProviderCapacity, renderProviderObservation, PROVIDER_OBSERVE_SCHEMA } from "../lib/vacilando/capacity-provider-observe.mjs";

const SRC = readFileSync(new URL("../lib/vacilando/capacity-provider-observe.mjs", import.meta.url), "utf8");
let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

await test("1. it writes nothing, anywhere", async () => {
  // Asserted structurally as well as by contract: a read surface that grows a
  // write is the failure this exists to prevent.
  assert.doesNotMatch(SRC, /writeFileSync|appendFileSync|renameSync|mkdirSync|unlinkSync/,
    "an observation surface must not contain a writer");
  const o = await observeProviderCapacity({});
  assert.equal(o.mutates, false);
});

await test("2. every ceiling answer is attributed to the owner that produced it", async () => {
  const o = await observeProviderCapacity({});
  for (const k of ["configured", "enforced", "derived"]) {
    assert.ok(k in o.ceilings, `ceilings.${k} must be reported separately`);
  }
  assert.ok("derived_by_cores" in o.ceilings && "derived_by_memory" in o.ceilings,
    "the derivation must show both axes, not just its result");
});

await test("3. disagreement between owners is stated, not smoothed", async () => {
  // The whole reason the experiment existed: enforced 3 while the policy
  // derived 4, with nothing saying so out loud.
  const o = await observeProviderCapacity({});
  assert.ok("owners_agree" in o.ceilings);
  assert.ok("derived_exceeds_enforced" in o.ceilings);
  if (o.ceilings.configured != null && o.ceilings.enforced != null) {
    assert.equal(o.ceilings.owners_agree, o.ceilings.configured === o.ceilings.enforced);
  }
});

await test("4. residency and execution are reported as different things", async () => {
  const o = await observeProviderCapacity({});
  assert.ok("count" in o.residency, "resident providers are counted");
  assert.ok("active" in o.execution, "executing providers are counted separately");
  assert.ok("exceeds_execution" in o.residency,
    "more resident than executing is normal and must be visible rather than alarming");
});

await test("5. an unattributed provider process is surfaced, never dropped", async () => {
  const o = await observeProviderCapacity({});
  assert.equal(typeof o.residency.unattributed, "number",
    "a process nobody can place is the one most worth seeing");
});

await test("6. unreadable inputs degrade to notes, never to silence or a throw", async () => {
  assert.match(SRC, /catch \(e\) \{ out\.notes\.push/, "a failed read must be recorded");
  const o = await observeProviderCapacity({});
  assert.ok(Array.isArray(o.notes));
  assert.ok("pressure_readable" in o.host, "an unreadable pressure probe must be distinguishable from a calm host");
});

await test("7. the snapshot is coherent and self-describing", async () => {
  const o = await observeProviderCapacity({});
  assert.equal(o.schema_version, PROVIDER_OBSERVE_SCHEMA);
  assert.ok(o.observed_at, "a snapshot without a time is not a snapshot");
  for (const k of ["ceilings", "execution", "residency", "host", "queue"]) assert.ok(k in o);
});

await test("8. it renders without throwing on a partial observation", async () => {
  // Health output is read when things are broken; it must survive missing data.
  const text = renderProviderObservation({
    ceilings: {}, execution: {}, residency: {}, host: {}, queue: {}, notes: [],
  });
  assert.ok(typeof text === "string" && text.length > 0);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
