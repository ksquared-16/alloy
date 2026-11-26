#!/usr/bin/env node
/**
 * AN EXPLICIT OVERRIDE MUST ACTUALLY OVERRIDE.
 *
 * THE DEFECT. The documented way to raise a ceiling for a capacity experiment
 * was to export ALLOY_MAX_RUNNING_SERVERS. It never worked once. alloy_load_config
 * sources alloy-config.example and then ~/.config/alloy-dev/config, both of
 * which assign that name unconditionally, so the export was overwritten before
 * sprint-ops' `${VAR:-3}` could ever see it. The 3->4->5 staircase set the
 * variable, read 3 back, and had no way to tell an ineffective override from a
 * host that was refusing on merits.
 *
 * Four call sites answered "what is the ceiling" four different ways — shell
 * config-after-env, a config-file regex that ignored the environment, an
 * env-only read that ignored the config file, and a hardware-derived policy that
 * nothing compared against any of them. All returned 3 on this host, so the
 * numbers agreed by coincidence while the reasoning did not.
 *
 * These assert the precedence contract itself: derived -> host config ->
 * explicit scoped override, with a bare ALLOY_MAX_* export winning NOTHING. That
 * last one is deliberate and is tested as hard as the rest: an ambient export
 * that silently raised a production ceiling would be worse than an override that
 * does nothing, because it would be invisible instead of merely ineffective.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = mkdtempSync(join(tmpdir(), "vac-capacity-"));
const CONFIG = join(DIR, "config");
writeFileSync(CONFIG, [
  '# host config',
  'ALLOY_MAX_ACTIVE_PROVIDERS="3"',
  'ALLOY_MAX_RUNNING_SERVERS="3"',
  'ALLOY_MAX_CONCURRENT_INSTALLS="1"',
  'ALLOY_MAX_CONCURRENT_HEAVY_JOBS="1"',
  "",
].join("\n"), "utf8");
const EMPTY_CONFIG = join(DIR, "empty-config");
writeFileSync(EMPTY_CONFIG, "# says nothing about capacity\n", "utf8");

const C = await import("../lib/vacilando/capacity-precedence.mjs");
const P = await import("../lib/vacilando/capacity-policy.mjs");

const SERVERS = "ALLOY_MAX_RUNNING_SERVERS";
const PROVIDERS = "ALLOY_MAX_ACTIVE_PROVIDERS";
const base = { ALLOY_CONFIG_FILE: CONFIG };

/** A derived policy for a host big enough that hardware is not the constraint. */
const derived = P.computeCapacityPolicy({ logical_cores: 12, memory_total_gb: 48 });

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

test("no override: the normal config value, and it says where it came from", () => {
  const r = C.resolveCapacity(SERVERS, { env: base });
  assert.equal(r.value, 3);
  assert.equal(r.source, "host-config");
  assert.equal(r.tiers.override, null);
  assert.equal(r.reason, null);
});

test("no config and no override: the built-in default, not zero and not unlimited", () => {
  const r = C.resolveCapacity(SERVERS, { env: { ALLOY_CONFIG_FILE: EMPTY_CONFIG } });
  assert.equal(r.value, 3);
  assert.equal(r.source, "default");
});

test("derived capacity is the base tier, and host config still outranks it", () => {
  // This host derives 8 dev servers from 48 GB; the operator has chosen 3.
  //
  // It derived 6 until 2026-09-03, from an assumed 8 GB per dev server. That was
  // a worst case mistaken for a cost: fresh servers measure 390-440 MB and eight
  // under real load totalled 11-14 GB, and the host ran eight with zero swap.
  // The precedence contract below is unchanged; only the derived number moved,
  // and it moved because it is now measured rather than assumed.
  const withoutConfig = C.resolveCapacity(SERVERS, { env: { ALLOY_CONFIG_FILE: EMPTY_CONFIG }, derived });
  assert.equal(withoutConfig.value, 8, "with nothing configured, the measured host answers");
  assert.equal(withoutConfig.source, "derived");

  const withConfig = C.resolveCapacity(SERVERS, { env: base, derived });
  assert.equal(withConfig.value, 3, "the operator's choice for this host wins over the derivation");
  assert.equal(withConfig.source, "host-config");
  // And the gap is REPORTED rather than quietly closed.
  assert.equal(withConfig.derived_exceeds_enforced, 8);
});

test("an explicit scoped override wins — the whole point", () => {
  const r = C.resolveCapacity(SERVERS, {
    env: { ...base, ALLOY_CAPACITY_OVERRIDE: `${SERVERS}=5`, ALLOY_CAPACITY_OVERRIDE_REASON: "capacity certification phase 2" },
    derived,
  });
  assert.equal(r.value, 5, "the override must actually override");
  assert.equal(r.source, "override");
  assert.equal(r.reason, "capacity certification phase 2");
});

test("a bare ALLOY_MAX_* export wins nothing", () => {
  // The ambient-export path stays dead ON PURPOSE. An inherited environment must
  // never move a production ceiling by accident.
  const r = C.resolveCapacity(SERVERS, { env: { ...base, ALLOY_MAX_RUNNING_SERVERS: "5" } });
  assert.equal(r.value, 3);
  assert.equal(r.source, "host-config");
});

test("an override without a reason is refused", () => {
  const env = { ...base, ALLOY_CAPACITY_OVERRIDE: `${SERVERS}=5` };
  const r = C.resolveCapacity(SERVERS, { env });
  assert.equal(r.value, 3, "an unexplained ceiling change is not a ceiling change");
  assert.equal(r.source, "host-config");
  assert.deepEqual(C.parseCapacityOverride(env).refusals, [{ entry: `${SERVERS}=5`, error: "reason_required" }]);
});

test("malformed overrides fail SAFELY — refused, explained, ceiling unmoved", () => {
  const cases = [
    [`${SERVERS}`, "expected_name_equals_value"],
    [`${SERVERS}=`, "not_a_positive_integer"],
    [`${SERVERS}=abc`, "not_a_positive_integer"],
    [`${SERVERS}=0`, "not_a_positive_integer"],
    [`${SERVERS}=-2`, "not_a_positive_integer"],
    [`${SERVERS}=5.5`, "not_a_positive_integer"],
    [`${SERVERS}=99`, "above_hard_ceiling"],
    ["ALLOY_MAX_AGENTS=9", "not_a_capacity_name"],
    ["PATH=/tmp", "not_a_capacity_name"],
  ];
  for (const [spec, expected] of cases) {
    const env = { ...base, ALLOY_CAPACITY_OVERRIDE: spec, ALLOY_CAPACITY_OVERRIDE_REASON: "test" };
    const parsed = C.parseCapacityOverride(env);
    assert.equal(parsed.active, false, `${spec} must not activate`);
    assert.equal(parsed.refusals[0]?.error, expected, spec);
    // The safe direction is always the value already in force.
    assert.equal(C.resolveCapacity(SERVERS, { env }).value, 3, spec);
  }
});

test("one malformed entry does not discard a valid one", () => {
  const env = {
    ...base,
    ALLOY_CAPACITY_OVERRIDE: `${SERVERS}=5,ALLOY_MAX_AGENTS=9,${PROVIDERS}=4`,
    ALLOY_CAPACITY_OVERRIDE_REASON: "phase 2",
  };
  assert.equal(C.resolveCapacity(SERVERS, { env }).value, 5);
  assert.equal(C.resolveCapacity(PROVIDERS, { env }).value, 4);
  assert.equal(C.parseCapacityOverride(env).refusals.length, 1);
});

test("an override cannot exceed the managed slot count", () => {
  // Six slots exist. A seventh server has nowhere to run, so no override may
  // ask for one however explicit and well-reasoned it is.
  const env = { ...base, ALLOY_CAPACITY_OVERRIDE: `${SERVERS}=7`, ALLOY_CAPACITY_OVERRIDE_REASON: "certification" };
  assert.equal(C.resolveCapacity(SERVERS, { env }).value, 3);
  assert.equal(C.parseCapacityOverride(env).refusals[0].max, 6);
});

test("an override cannot leak into a later session", () => {
  // Scope is the environment of one process. Nothing is persisted, so an
  // override cannot be inherited by tomorrow's session — which is the failure
  // mode a config-file override would have had.
  const experiment = { ...base, ALLOY_CAPACITY_OVERRIDE: `${SERVERS}=5`, ALLOY_CAPACITY_OVERRIDE_REASON: "phase 2" };
  assert.equal(C.resolveCapacity(SERVERS, { env: experiment }).value, 5);

  const later = { ...base };
  assert.equal(C.resolveCapacity(SERVERS, { env: later }).value, 3, "a later session sees the configured value");
  assert.equal(C.capacityStatus({ env: later }).override_active, false);

  // And the host config on disk was not touched by the experiment.
  assert.ok(!readFileSync(CONFIG, "utf8").includes("CAPACITY_OVERRIDE"),
    "an override must never be written to the host config");
  assert.match(readFileSync(CONFIG, "utf8"), /ALLOY_MAX_RUNNING_SERVERS="3"/);
});

test("health can report that an override is active, and why", () => {
  const env = {
    ...base,
    ALLOY_CAPACITY_OVERRIDE: `${SERVERS}=5`,
    ALLOY_CAPACITY_OVERRIDE_REASON: "capacity certification phase 2",
  };
  const st = C.capacityStatus({ env, derived });
  assert.equal(st.override_active, true);
  assert.equal(st.override_reason, "capacity certification phase 2");
  assert.deepEqual(st.override_applied, { [SERVERS]: 5 });
  assert.equal(st.limits[SERVERS].value, 5);
  assert.equal(st.limits[SERVERS].source, "override");

  const quiet = C.capacityStatus({ env: base, derived });
  assert.equal(quiet.override_active, false);
  assert.equal(quiet.override_reason, null);
  // And health can see that the measured host would allow more than is enforced.
  assert.deepEqual(quiet.derived_exceeds_enforced[SERVERS], { enforced: 3, derived: 8 });
});

test("every call site reads the one resolver", () => {
  // The three duplicate implementations are what made the override ineffective
  // in one place and invisible in another. Structural, because a fourth copy is
  // the failure this closes.
  const registry = readFileSync(new URL("../lib/vacilando/commands/registry.mjs", import.meta.url), "utf8");
  assert.match(registry, /capacityValue\("ALLOY_MAX_RUNNING_SERVERS"\)/);
  assert.ok(!/ALLOY_MAX_RUNNING_SERVERS=\["'\]/.test(registry), "no private config regex");

  const provider = readFileSync(new URL("../lib/vacilando/provider-capacity.mjs", import.meta.url), "utf8");
  assert.match(provider, /capacityValue\("ALLOY_MAX_ACTIVE_PROVIDERS"/);
  assert.ok(!/env\.ALLOY_MAX_ACTIVE_PROVIDERS/.test(provider), "no private env read");

  const sprintOps = readFileSync(new URL("../lib/sprint-ops.sh", import.meta.url), "utf8");
  assert.match(sprintOps, /alloy_apply_capacity_overrides/, "the shell honours the same override");
  assert.match(sprintOps, /alloy_capacity_status/, "and can report it");
});

try { rmSync(DIR, { recursive: true, force: true }); } catch { /* best effort */ }
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
