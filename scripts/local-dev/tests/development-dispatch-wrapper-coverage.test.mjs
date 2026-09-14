#!/usr/bin/env node
/**
 * A REGISTERED MUTATING ACTION MAY NOT SHIP WITHOUT WRAPPER COVERAGE.
 *
 * The defect family this gate exists for: an action is registered correctly, its
 * executor works when called directly, its unit tests are green, an operator
 * approves a real governed action, and live dispatch enters a wrapper nothing
 * ever ran. Recent specimens, all `repository.promote_metadata`:
 *
 *   normalizer dropped worktreePath / mainBefore   -> worktree_path_missing
 *   validator could not re-read its own output     -> metadata_target_not_allowed
 *   defaultGit env dropped by spawn options        -> wrong index used
 *   alternate index path unwritable in a worktree  -> metadata_tree_build_failed
 *   wrapper closed over an unimported defaultGit   -> metadata_promote_threw
 *
 * Four were invisible to stub tests. The fifth was invisible to everything
 * except a real approved dispatch, and cost an operator approval to find.
 *
 * This gate does not claim the uncovered actions are safe. It claims the list
 * cannot GROW: a newly registered action is uncovered by default and fails here
 * until something drives it through `executeTrustedHostAction`.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ACTION_TYPES, getActionDefinition } from "../lib/vacilando/trusted-host-action-registry.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const LIB = "scripts/local-dev/lib/vacilando";
const TESTS = "scripts/local-dev/tests";
const ACTIONS_SRC = readFileSync(join(LIB, "trusted-host-actions.mjs"), "utf8");

const testFiles = readdirSync(TESTS).filter((f) => f.endsWith(".test.mjs"));
const dispatchDriven = testFiles
  .map((f) => readFileSync(join(TESTS, f), "utf8"))
  .filter((src) => /executeTrustedHostAction\s*\(/.test(src))
  .join("\n");

const mentions = (src, key, value) =>
  src.includes(value) || new RegExp(`ACTION_TYPES\\.${key}\\b`).test(src);

/**
 * Actions with NO dispatch-wrapper coverage today.
 *
 * Pinned, not blessed. Each one can still fail live in a wrapper nothing runs -
 * that is the honest state of this inventory, not a claim of safety. The list
 * may only shrink; a new entry means a new action shipped without coverage, and
 * removing an entry means someone drove it through the real dispatcher.
 */
const UNCOVERED = Object.freeze([
  "capacity.set_provider_ceiling",
  "database.read_census",
  "database.repair_migration_ledger",
  "environment.assign_qa_identity_access",
  "environment.execute_registered_reconciliation",
  "environment.provision_qa_identity",
  "environment.restore_deployed_qa_session",
  "environment.restore_qa_session",
  "lane.dispatch_measurement_instruction",
  "platform.register_developer_application",
  "promotion.open_pr",
  "repository.close_pull_request",
  "repository.delete_remote_branch",
  "repository.push",
  "vacilando.apply_reconciliation_plan",
  "vacilando.retire_worktree",
]);

/* ── 1: every registered action is reachable from the dispatcher ──────────── */

test("1 — every registered action has a dispatch branch", () => {
  const missing = Object.entries(ACTION_TYPES)
    .filter(([k, v]) => !mentions(ACTIONS_SRC, k, v))
    .map(([, v]) => v);
  assert.deepEqual(missing, [],
    `registered, advertised and unreachable: ${missing.join(", ")}`);
});

test("1a — and a definition the registry can resolve", () => {
  const broken = Object.values(ACTION_TYPES).filter((v) => !getActionDefinition(v));
  assert.deepEqual(broken, []);
});

/* ── 2: the coverage ratchet ──────────────────────────────────────────────── */

test("2 — no NEW registered action may ship without dispatch-wrapper coverage", () => {
  const uncoveredNow = Object.entries(ACTION_TYPES)
    .filter(([k, v]) => !mentions(dispatchDriven, k, v))
    .map(([, v]) => v)
    .sort();
  const added = uncoveredNow.filter((a) => !UNCOVERED.includes(a));
  assert.deepEqual(added, [],
    `registered without a test that drives executeTrustedHostAction: ${added.join(", ")}. `
    + "Its live wrapper has never run; that is how five defects reached operator approval.");
});

test("2a — the uncovered list may only shrink", () => {
  const uncoveredNow = Object.entries(ACTION_TYPES)
    .filter(([k, v]) => !mentions(dispatchDriven, k, v))
    .map(([, v]) => v);
  const gone = UNCOVERED.filter((a) => !uncoveredNow.includes(a));
  const stale = UNCOVERED.filter((a) => !Object.values(ACTION_TYPES).includes(a));
  assert.deepEqual(stale, [], `pinned action no longer registered; trim UNCOVERED: ${stale.join(", ")}`);
  if (gone.length) process.stdout.write(`    (${gone.length} newly covered: ${gone.join(", ")} — trim UNCOVERED)\n`);
});

test("2b — the pin is a real minority, not the whole registry", () => {
  // If this ever inverts, the ratchet has stopped meaning anything.
  assert.ok(UNCOVERED.length < Object.keys(ACTION_TYPES).length,
    "every action uncovered would make this gate decorative");
});

/* ── 3: the shape that caused the live throw ──────────────────────────────── */

test("3 — a dispatch wrapper does not build its dependencies inline", () => {
  /*
   * `git: (args, wd, opts) => defaultGit(...)` written inline inside the wrapper
   * is syntactically valid whether or not `defaultGit` is imported, and a
   * ReferenceError on a free variable fires only when the closure RUNS. A named
   * factory is constructable by a test without authorizing an action, which is
   * what let case D2 in the dispatch-contract suite catch it.
   *
   * Scoped deliberately: this looks for a dependency built inline in the
   * argument list of an executor call, not for arrow functions generally.
   */
  const inline = [...ACTIONS_SRC.matchAll(/\b(git|gitImpl|runners|gh)\s*:\s*\((?:[^)]*)\)\s*=>/g)]
    .map((m) => m[0]);
  assert.deepEqual(inline, [],
    `a dependency is constructed inline in a dispatch wrapper: ${inline.join(", ")}. `
    + "Extract it as a named export so a test can construct it without an approved action.");
});

test("3a — the metadata promotion factory is exported and callable", () => {
  assert.match(ACTIONS_SRC, /export function metadataPromotionGit\(/,
    "the factory the live write depends on must be reachable from a test");
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
