#!/usr/bin/env node
/**
 * AN ADVERTISED ACTION MUST BE EXECUTABLE, IN EVERY LAYER.
 *
 * ── WHY THIS EXISTS ──
 *
 * A governed action has to be present in five places to work: the registry, the
 * mode map, input validation, the fulfil dispatch, and the trusted-host
 * executor. Miss ONE and the action is still registered, still discoverable
 * through `governed-action --list`, still proposable, still approvable — and
 * then fails at execution with an error that names the registry rather than the
 * missing branch.
 *
 * This has now happened three times, and the source carries the scars:
 *
 *   capacity.set_provider_ceiling   registered, mode-mapped, approved, and
 *                                   never dispatched. "has never been
 *                                   executable since it shipped."
 *   environment.restore_*           "a registered, mode-mapped, operator-
 *                                   APPROVED restore still failed
 *                                   action_unavailable".
 *   database.apply_promoted_migration  missing from the mode map AND both
 *                                   dispatches, so an approved production
 *                                   migration fell through to action_unavailable.
 *
 * Each was found in production, by an operator spending a decision on something
 * that could not run. The cost is not the missing branch — it is that approval
 * is the scarcest thing in this system and it was spent on nothing.
 *
 * So this is a CI-time parity check over the layers themselves, not a test of
 * any one action. A new action that reaches the registry without a dispatcher
 * fails here, in CI, rather than in front of the Director.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const LIB = new URL("../lib/vacilando/", import.meta.url);
const src = (f) => readFileSync(new URL(f, LIB), "utf8");

const registrySrc = src("trusted-host-action-registry.mjs");
const requestSrc = src("governed-action-request.mjs");
const actionsSrc = src("trusted-host-actions.mjs");

const { ACTION_TYPES, listRegisteredActions, getActionDefinition } =
  await import(new URL("trusted-host-action-registry.mjs", LIB).href);

/** ACTION_TYPES constant names that are actually registered for execution. */
const REGISTERED = listRegisteredActions().map((a) => a.actionType);

/** constant name (e.g. DATABASE_APPLY_MIGRATION) for an action key. */
const constantFor = (key) =>
  Object.entries(ACTION_TYPES).find(([, v]) => v === key)?.[0] || null;

await test("GC1 — every registered action is reachable in ACTION_TYPES", () => {
  for (const key of REGISTERED) {
    assert.ok(constantFor(key), `${key} is registered but absent from ACTION_TYPES`);
  }
  assert.ok(REGISTERED.length >= 15, "sanity: the registry should not be nearly empty");
});

await test("GC2 — every privileged action has a mode, and never inherits read_only", () => {
  // `validateAgainstRegistry` refuses a non-read risk class in read_only mode,
  // so an action with no mode is denied with `policy_denied` — which reads as
  // the operator forbidding it rather than nobody having assigned it a mode.
  const modeFn = requestSrc.slice(
    requestSrc.indexOf("function defaultModeForAction"),
    requestSrc.indexOf("function validateRequestShape"),
  );
  assert.ok(modeFn.length > 100, "defaultModeForAction must be locatable");

  const missing = [];
  for (const key of REGISTERED) {
    const def = getActionDefinition(key);
    const readish = /read/i.test(String(def?.riskClass || ""));
    if (readish) continue;                      // read actions may use the default
    const name = constantFor(key);
    if (!modeFn.includes(`ACTION_TYPES.${name}`)) missing.push(key);
  }
  assert.deepEqual(missing, [], `privileged actions with no mode mapping: ${missing.join(", ")}`);
});

await test("GC3 — every registered action can validate its inputs", () => {
  const missing = REGISTERED.filter((key) => typeof getActionDefinition(key)?.validateInputs !== "function");
  assert.deepEqual(missing, [], `registered actions with no input validation: ${missing.join(", ")}`);
});

await test("GC4 — every registered action has a fulfil dispatch branch", () => {
  // THE BRANCH THAT KEEPS GOING MISSING. Source inspection rather than
  // execution, because the failure is structural: the branch is simply absent,
  // and no amount of calling the function reveals which one.
  const missing = REGISTERED.filter((key) => {
    const name = constantFor(key);
    return !requestSrc.includes(`rec.action_key === ACTION_TYPES.${name}`);
  });
  assert.deepEqual(missing, [],
    `registered, advertised, approvable — and unreachable at execution: ${missing.join(", ")}`);
});

await test("GC5 — every registered action has a trusted-host executor branch", () => {
  // TWO SHAPES COUNT AS DISPATCHED, and only two. Most actions get a positive
  // branch; `database.read_census` is the executor's fallthrough default and is
  // guarded with `!==` before the unknown-type refusal. Accepting the negated
  // form is not a loosening — an action reached by neither is still unreachable,
  // which is exactly what this asserts. Writing it as a positive-branch-only
  // check reported census as missing when it is the one action that cannot have
  // one, which would have sent someone to "fix" working code.
  const missing = REGISTERED.filter((key) => {
    const name = constantFor(key);
    return !actionsSrc.includes(`action.actionType === ACTION_TYPES.${name}`)
      && !actionsSrc.includes(`action.actionType !== ACTION_TYPES.${name}`);
  });
  assert.deepEqual(missing, [],
    `no executor branch, so execution falls through to action_unavailable: ${missing.join(", ")}`);
});

await test("GC6 — the fallthrough still refuses, so the parity check is load-bearing", () => {
  // If the fallthrough were removed, GC4/GC5 would be decorative: an unlisted
  // action would silently do nothing instead of failing. Both must hold.
  assert.match(requestSrc, /return \{ ok: false, error: "action_unavailable" \}/);
  assert.ok(REGISTERED.every((k) => constantFor(k)), "every key maps to a constant");
});

// ── G1: a privileged read never guesses its own subject ─────────────────────

await test("GC7 — a census with no artifact does not become the Q15 census", () => {
  // THE INCIDENT. gar_a1d647be39e8b6 was filed with no artifact_refs and
  // executed q15-authority-census.json against the deployed primary — a
  // privileged read whose subject nobody chose. The fallback lived in TWO
  // places; repairing the reader left the writer, so the substitution still
  // happened and the store still recorded a query the filer never asked for.
  const build = requestSrc.slice(requestSrc.indexOf("const artifactRefs = shape.artifactRefs"));
  const decl = build.slice(0, build.indexOf(";") + 1);
  assert.equal(/Q15_CENSUS_ARTIFACT/.test(decl), false,
    "the request must not inject a default census artifact");
  assert.match(decl, /const artifactRefs = shape\.artifactRefs;/);

  // And the reader still refuses to invent one for execution.
  const reader = requestSrc.slice(requestSrc.indexOf("function artifactPathFrom"));
  assert.match(reader.slice(0, 200), /fallback = null/,
    "artifactPathFrom must default to null, not to a query");
});

// ── G2: a failure notice may not report a success ───────────────────────────

await test("GC8 — a failed action never claims a merge succeeded", async () => {
  const G = await import(new URL("governed-action-request.mjs", LIB).href);
  const text = G.continuationTextForFailedGovernedAction({
    request_id: "gar_test", action_key: "host.install_toolkit",
    target: "alloy_deployed_primary", failure_code: "result_validation_failed",
    failure_reason: "expected_staging_sha must be a git sha",
  });
  assert.match(text, /GOVERNED ACTION FAILED/);
  assert.equal(/already succeeded/.test(text), false,
    "a failure notice that asserts a success invites a lane to move on from work that did not happen");
  assert.equal(/merge into staging/.test(text), false,
    "and it must not name a merge on an action that never merged");
  assert.match(text, /did NOT complete/);
  // It still says what failed, so removing the false claim did not remove the
  // information.
  assert.match(text, /result_validation_failed/);
  assert.match(text, /expected_staging_sha must be a git sha/);
});

await test("GC9 — a success notice names the action that actually ran", () => {
  const line = requestSrc.slice(
    requestSrc.indexOf("function doNotRetryLine"),
    requestSrc.indexOf("export function continuationTextForGovernedAction"),
  );
  // The census sentence was the fallback for every unbranched action, so a
  // completed toolkit install told the lane "Do not retry the census".
  assert.match(line, /DATABASE_READ_CENSUS/, "census must be reached by its own branch");
  const tail = line.slice(line.lastIndexOf("return "));
  assert.equal(/census/i.test(tail), false, "the default must not name the census");
});
