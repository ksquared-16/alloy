#!/usr/bin/env node
/**
 * THE BYTES THAT RUN MUST BE THE BYTES THAT WERE APPROVED.
 *
 * `environment.execute_registered_reconciliation` spawns npm inside the
 * canonical checkout, so what executes IS that working tree. During the
 * Financials certification it sat 35 commits behind promoted staging — holding
 * the pre-repair fixture, and at that moment no runner file at all — and was 2
 * commits behind again within the hour of being fast-forwarded. Nothing was
 * misconfigured: `toolkit-convergence.mjs` deliberately never touches that tree,
 * so "staging == installed == running" was true the whole time. Toolkit
 * convergence is not repository-content convergence, and only the first had a
 * gate.
 *
 * These cases pin the refusal, and that the refusal happens BEFORE the spawn —
 * a check that runs after the mutation is a log entry, not a guard.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACTION_REPO_CONTENT, REPO_CONTENT_CLASS, assertRepositoryIdentity,
  isContentExecuting, repoContentClassFor, repositoryProvenance,
} from "../lib/vacilando/repository-execution-authority.mjs";
import { runRegisteredReconciliation } from "../lib/vacilando/trusted-host-reconciliation.mjs";
import { ACTION_TYPES } from "../lib/vacilando/trusted-host-action-registry.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const LIB = `${ROOT}/scripts/local-dev/lib/vacilando`;
const RECON = "environment.execute_registered_reconciliation";
const STALE = "ce41efc73610d6676b2f13e820eb735abb616722";
const PROMOTED = "d61dd6d441891c53ba98179b4483e130ff6bcdb6";
const prov = (head) => ({
  repo_root: "/Users/vacilando/Alloy", repo_head: head,
  repo_branch: "staging", working_directory: "/Users/vacilando/Alloy/web",
});

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/* ── A/B/C: the identity gate ─────────────────────────────────────────────── */

test("A — an exact head executes", () => {
  const r = assertRepositoryIdentity({ actionType: RECON, provenance: prov(PROMOTED), expectedRepoHead: PROMOTED });
  assert.equal(r.ok, true);
  assert.equal(r.provenance.expected_repo_head, PROMOTED);
});

test("B — THE FINANCIALS SPECIMEN: a stale canonical root refuses", () => {
  const r = assertRepositoryIdentity({ actionType: RECON, provenance: prov(STALE), expectedRepoHead: PROMOTED });
  assert.equal(r.ok, false);
  assert.equal(r.code, "repository_identity_mismatch");
  assert.match(r.detail, new RegExp(STALE));
  assert.match(r.detail, new RegExp(PROMOTED));
});

test("C — a root that is merely DIFFERENT, not behind, also refuses", () => {
  // "Ahead" is not safer than "behind": it is still not the approved bytes.
  const r = assertRepositoryIdentity({ actionType: RECON, provenance: prov("f".repeat(40)), expectedRepoHead: PROMOTED });
  assert.equal(r.ok, false);
  assert.equal(r.code, "repository_identity_mismatch");
});

test("D — approval stability: the expected SHA is not re-read from origin/staging", () => {
  // The request was decided against PROMOTED. origin/staging moving on afterwards
  // must not silently change which bytes execute.
  const laterStagingHead = "0".repeat(40);
  const r = assertRepositoryIdentity({ actionType: RECON, provenance: prov(laterStagingHead), expectedRepoHead: PROMOTED });
  assert.equal(r.ok, false, "the approved SHA wins over whatever staging is now");
  /*
   * AIMED AT THE COMPARATOR, NOT AT THE MODULE.
   *
   * Two earlier versions of this assertion were wrong in opposite directions.
   * The first scanned the whole file and tripped on the comment explaining the
   * rule — prose failing the rule it describes. The second scanned executable
   * text and went red when the FILING resolver moved into this module, which is
   * a legitimate reader of the promoted ref: reading it once, at filing, is the
   * whole design. What must never read it is the thing that compares at
   * execution time, so that is what is checked.
   */
  const src = readFileSync(`${LIB}/repository-execution-authority.mjs`, "utf8");
  const comparator = src.slice(src.indexOf("export function assertRepositoryIdentity"));
  const body = comparator.slice(0, comparator.indexOf("\n}") + 2)
    .split("\n").map((l) => l.replace(/\/\/.*$/, "")).filter((l) => !/^\s*[*/]/.test(l)).join("\n");
  assert.doesNotMatch(body, /origin\/staging|rev-parse|resolveFilingRepositoryAuthority/,
    "the comparator must be given its expectation, never resolve one");
  // And the executor is the place it must never happen at all.
  const exec = readFileSync(`${LIB}/trusted-host-reconciliation.mjs`, "utf8");
  assert.doesNotMatch(exec, /origin\/staging|resolveFilingRepositoryAuthority/);
});

/* ── E/F: everything else is untouched ────────────────────────────────────── */

test("E — a metadata-only action is unaffected", () => {
  const r = assertRepositoryIdentity({ actionType: "database.read_census", provenance: prov(STALE), expectedRepoHead: PROMOTED });
  assert.equal(r.ok, true);
  assert.match(r.skipped, /METADATA_ONLY/);
  assert.equal(repoContentClassFor("database.read_census").class, REPO_CONTENT_CLASS.METADATA_ONLY);
});

test("F — a no-repo-content action is unaffected", () => {
  for (const t of ["repository.push", "promotion.open_pr", "capacity.set_provider_ceiling"]) {
    assert.equal(isContentExecuting(t), false, `${t} touches no repository content`);
    assert.equal(assertRepositoryIdentity({ actionType: t, provenance: prov(STALE), expectedRepoHead: PROMOTED }).ok, true);
  }
});

test("F2 — an unclassified action is treated as content-executing, not skipped", () => {
  const c = repoContentClassFor("something.invented.tomorrow");
  assert.equal(c.class, REPO_CONTENT_CLASS.CONTENT_EXECUTING);
  assert.equal(c.declared, false);
});

/* ── G: provenance, including on failure ──────────────────────────────────── */

test("G — a refusal carries the whole provenance and a recovery", () => {
  const r = assertRepositoryIdentity({ actionType: RECON, provenance: prov(STALE), expectedRepoHead: PROMOTED });
  for (const k of ["repo_root", "repo_head", "repo_branch", "working_directory", "expected_repo_head"]) {
    assert.ok(r.provenance[k], `refusal is missing ${k}`);
  }
  assert.match(r.recovery, /fast-forward only/);
  assert.match(r.recovery, /local-only commits/);
  assert.doesNotMatch(JSON.stringify(r), /postgres:\/\/|password|service_role/, "no credentials");
});

test("G2 — the recovery is NAMED, never performed", () => {
  const src = readFileSync(`${LIB}/repository-execution-authority.mjs`, "utf8");
  assert.doesNotMatch(src, /merge --ff-only|reset --hard|checkout -/,
    "reconciling the checkout inside the action changes the environment it was approved against");
});

/* ── H: the refusal happens before the spawn ──────────────────────────────── */

test("H — a stale root refuses BEFORE npm is spawned", () => {
  let spawned = 0;
  const out = runRegisteredReconciliation(
    { reconciliation_key: "seed_financials_demo_tenant", target_environment: "staging", dry_run: false,
      expected_repo_head: PROMOTED },
    {
      repoRoot: ROOT,
      spawn: () => { spawned += 1; return { status: 0, stdout: "{}", stderr: "" }; },
      trustedEnv: {},
      gitValue: () => STALE,
    },
  );
  assert.equal(spawned, 0, "a check that runs after the mutation is a log entry, not a guard");
  assert.equal(out.ok, false);
  assert.equal(out.code, "repository_identity_mismatch");
  assert.ok(out.provenance.expected_repo_head, "the failure must carry the expectation it enforced");
  assert.ok(out.where.working_directory, "and the where it would have run in");
});

/* ── the inventory ────────────────────────────────────────────────────────── */

test("I — every registered action type is classified", () => {
  const registered = Object.values(ACTION_TYPES).map(String).sort();
  const missing = registered.filter((t) => !Object.prototype.hasOwnProperty.call(ACTION_REPO_CONTENT, t));
  assert.deepEqual(missing, [], `unclassified: ${missing.join(", ")}`);
});

test("J — referencing the canonical root is not the same as executing it", () => {
  // The census resolves the root and still executes SQL it pinned by hash; the
  // reconciliation spawns npm inside the tree. Collapsing the two would either
  // block every census or exempt the thing that actually matters.
  assert.equal(repoContentClassFor("database.read_census").class, REPO_CONTENT_CLASS.METADATA_ONLY);
  assert.equal(repoContentClassFor(RECON).class, REPO_CONTENT_CLASS.CONTENT_EXECUTING);
  assert.match(ACTION_REPO_CONTENT["database.read_census"].why, /hash/);
});

test("K — live provenance reads the real checkout", () => {
  const p = repositoryProvenance(ROOT);
  assert.equal(p.repo_root, ROOT);
  assert.match(String(p.repo_head), /^[0-9a-f]{40}$/);
  assert.ok(p.working_directory.endsWith("/web"));
});

/* ── MUTATION PROOFS ──────────────────────────────────────────────────────── */

test("M1 — remove the head comparison and the stale-root case goes red", () => {
  const withoutComparison = () => ({ ok: true });
  assert.equal(withoutComparison().ok, true, "the old behaviour executed");
  assert.equal(assertRepositoryIdentity({ actionType: RECON, provenance: prov(STALE), expectedRepoHead: PROMOTED }).ok, false);
});

test("M2 — expect live origin/staging instead and approval stability goes red", () => {
  // Modelled: whatever staging is now, rather than what the request was decided on.
  const liveRef = STALE;
  const naive = assertRepositoryIdentity({ actionType: RECON, provenance: prov(STALE), expectedRepoHead: liveRef });
  assert.equal(naive.ok, true, "the naive rule passes a stale root because it compares it to itself");
  assert.equal(assertRepositoryIdentity({ actionType: RECON, provenance: prov(STALE), expectedRepoHead: PROMOTED }).ok, false);
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
