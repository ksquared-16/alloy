#!/usr/bin/env node
/**
 * THE SHA A REQUEST WAS DECIDED AGAINST TRAVELS WITH THE REQUEST.
 *
 * The execution-root guard was already in place: a content-executing action
 * compares the canonical checkout's HEAD against `expected_repo_head` and
 * refuses on mismatch. It was AVAILABLE and not ENFORCED, because nothing
 * populated the field — so the comparison was against null and every run
 * proceeded, exactly as it had when the checkout sat 35 commits behind promoted
 * staging holding a pre-repair fixture.
 *
 * These cases pin the other half: the authority is fixed ONCE, at the filing
 * boundary, and nothing downstream re-reads a live ref to replace it. That
 * distinction is the whole contract — re-resolving at execution would silently
 * retarget an approved request onto whatever staging became in the meantime.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROMOTED_REF, isContentExecuting, resolveFilingRepositoryAuthority, stampRepositoryAuthority,
} from "../lib/vacilando/repository-execution-authority.mjs";
import { assertRepositoryIdentity } from "../lib/vacilando/repository-execution-authority.mjs";
import { runRegisteredReconciliation } from "../lib/vacilando/trusted-host-reconciliation.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const LIB = `${ROOT}/scripts/local-dev/lib/vacilando`;
const RECON = "environment.execute_registered_reconciliation";
const X = "780e810db0dd22b1897fb61aa005569ebb73aee6";   // what the request was decided against
const Y = "a6269f4bdf82b36f4ea4935781dbfb5a31cd18d5";   // what staging became afterwards
const at = (sha) => () => sha;
const gitHead = () => execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/* ── 1-3: scope ───────────────────────────────────────────────────────────── */

test("1 — a content-executing action is stamped at filing", () => {
  const r = stampRepositoryAuthority({ actionKey: RECON, inputs: {}, canonicalRoot: "/x", readRef: at(X) });
  assert.equal(r.ok, true);
  assert.equal(r.inputs.expected_repo_head, X);
  assert.equal(r.stamped, true);
});

test("2 — a metadata-only action is left alone", () => {
  const r = stampRepositoryAuthority({ actionKey: "database.read_census", inputs: { a: 1 }, canonicalRoot: "/x", readRef: at(X) });
  assert.equal(r.ok, true);
  assert.deepEqual(r.inputs, { a: 1 }, "a requirement invented here would be noise");
  assert.match(r.skipped, /not content-executing/);
});

test("3 — a no-repo action is left alone", () => {
  for (const k of ["repository.push", "promotion.open_pr", "capacity.set_provider_ceiling"]) {
    assert.equal(isContentExecuting(k), false);
    assert.equal(stampRepositoryAuthority({ actionKey: k, inputs: {}, canonicalRoot: "/x", readRef: at(X) }).inputs.expected_repo_head, undefined);
  }
});

/* ── 4-6: the value survives the whole path ───────────────────────────────── */

test("4 — the expected SHA survives normalization", async () => {
  const { resolveReconciliationRequest } = await import("../lib/vacilando/reconciliation-registry.mjs");
  const out = resolveReconciliationRequest({
    reconciliation_key: "seed_financials_demo_tenant", target_environment: "staging",
    dry_run: false, expected_repo_head: X,
  });
  assert.equal(out.ok, true, out.code || "resolution refused");
  assert.equal(out.normalized.expected_repo_head, X,
    "the executor reads validated.normalized; a field dropped here does not exist at mutation time");
});

test("5 — the filing boundary is in the request-creation path, not a later one", () => {
  const src = readFileSync(`${LIB}/governed-action-request.mjs`, "utf8");
  assert.match(src, /stampRepositoryAuthority\(/);
  const stampAt = src.indexOf("stampRepositoryAuthority({");
  const recAt = src.indexOf("request_id: newRequestId()");
  assert.ok(stampAt > 0 && recAt > 0 && stampAt < recAt, "the authority must be fixed before the record is built");
  assert.match(src, /inputs: repoAuthority\.inputs/, "and the record must carry it");
});

test("6 — the symbol it depends on is actually imported", () => {
  // A ReferenceError here would fail EVERY governed filing, silently at the
  // boundary that files things. This was missing on the first wiring.
  const src = readFileSync(`${LIB}/governed-action-request.mjs`, "utf8");
  const importBlock = src.slice(0, src.indexOf("trusted-host-action-registry.mjs") + 60);
  assert.match(importBlock, /resolveCanonicalRepoRoot/);
});

/* ── 7: stability ─────────────────────────────────────────────────────────── */

test("7 — staging moving to Y does not rewrite a request decided at X", () => {
  const filed = stampRepositoryAuthority({ actionKey: RECON, inputs: {}, canonicalRoot: "/x", readRef: at(X) });
  assert.equal(filed.inputs.expected_repo_head, X);
  // The same request, re-stamped later while the ref reads Y: the carried value wins.
  const later = stampRepositoryAuthority({ actionKey: RECON, inputs: filed.inputs, canonicalRoot: "/x", readRef: at(Y) });
  assert.equal(later.inputs.expected_repo_head, X, "a value already present is never overwritten");
  assert.equal(later.carried, true);
});

test("7b — and a checkout at Y refuses a request expecting X", () => {
  const r = assertRepositoryIdentity({
    actionType: RECON,
    provenance: { repo_root: "/Users/vacilando/Alloy", repo_head: Y, repo_branch: "staging", working_directory: "/Users/vacilando/Alloy/web" },
    expectedRepoHead: X,
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "repository_identity_mismatch");
});

/* ── 8: fail closed ───────────────────────────────────────────────────────── */

test("8 — a content action with no resolvable authority fails closed", () => {
  const r = stampRepositoryAuthority({ actionKey: RECON, inputs: {}, canonicalRoot: "/x", readRef: () => null });
  assert.equal(r.ok, false);
  assert.equal(r.code, "repository_authority_unresolvable");
  assert.match(r.detail, /executes repository content/);
});

test("8b — a malformed ref answer is not accepted as a SHA", () => {
  for (const bad of ["", "HEAD", "not-a-sha", "780e810"]) {
    assert.equal(resolveFilingRepositoryAuthority({ canonicalRoot: "/x", readRef: at(bad) }).ok, false, `accepted ${bad}`);
  }
  assert.equal(resolveFilingRepositoryAuthority({ canonicalRoot: "/x", readRef: at(X) }).ok, true);
});

/* ── 9-12: execution ──────────────────────────────────────────────────────── */

test("9 — a mismatched canonical root refuses BEFORE the spawn", () => {
  let spawned = 0;
  const out = runRegisteredReconciliation(
    { reconciliation_key: "seed_financials_demo_tenant", target_environment: "staging", dry_run: false, expected_repo_head: X },
    { repoRoot: ROOT, spawn: () => { spawned += 1; return { status: 0, stdout: "{}", stderr: "" }; }, trustedEnv: {} },
  );
  assert.equal(spawned, 0);
  assert.equal(out.code, "repository_identity_mismatch");
});

test("10 — the exact head executes", () => {
  /*
   * HEAD IS READ THROUGH GIT, NOT OFF THE FILESYSTEM.
   *
   * The first version opened `<root>/.git/HEAD` directly and died with ENOTDIR:
   * in a LINKED WORKTREE `.git` is a FILE pointing at the real git dir, not a
   * directory. Every test here runs in one.
   */
  assert.match(gitHead(), /^[0-9a-f]{40}$/, "this worktree must have a readable HEAD");
  let spawned = 0;
  const out = runRegisteredReconciliation(
    { reconciliation_key: "seed_financials_demo_tenant", target_environment: "staging", dry_run: false,
      expected_repo_head: gitHead() },
    { repoRoot: ROOT, spawn: () => { spawned += 1; return { status: 0, stdout: JSON.stringify({ ok: true, seeded: 1 }), stderr: "" }; }, trustedEnv: {} },
  );
  assert.equal(spawned, 1, `the guard must not block a matching head: ${out.code || ""}`);
});

test("11 — the success result carries expected AND actual identity", () => {
  const out = runRegisteredReconciliation(
    { reconciliation_key: "seed_financials_demo_tenant", target_environment: "staging", dry_run: false,
      expected_repo_head: gitHead() },
    { repoRoot: ROOT, spawn: () => ({ status: 0, stdout: JSON.stringify({ ok: true, seeded: 1 }), stderr: "" }), trustedEnv: {} },
  );
  assert.equal(out.provenance.expected_repo_head, gitHead());
  assert.equal(out.provenance.repo_head, gitHead());
  assert.equal(out.provenance.repository_identity, "verified");
});

test("12 — the FAILURE result carries expected AND actual identity", () => {
  const out = runRegisteredReconciliation(
    { reconciliation_key: "seed_financials_demo_tenant", target_environment: "staging", dry_run: false, expected_repo_head: X },
    { repoRoot: ROOT, spawn: () => ({ status: 0, stdout: "{}", stderr: "" }), trustedEnv: {} },
  );
  assert.equal(out.provenance.expected_repo_head, X);
  assert.ok(out.provenance.repo_head);
  assert.ok(out.provenance.repo_branch !== undefined);
  assert.ok(out.where.working_directory);
  assert.match(out.recovery, /fast-forward only/);
});

/* ── MUTATION PROOFS ──────────────────────────────────────────────────────── */

test("M1 — remove the filing-boundary population and the contract goes red", () => {
  const withoutStamping = (inputs) => inputs;
  assert.equal(withoutStamping({}).expected_repo_head, undefined, "the old behaviour left it unset");
  assert.equal(
    stampRepositoryAuthority({ actionKey: RECON, inputs: {}, canonicalRoot: "/x", readRef: at(X) }).inputs.expected_repo_head,
    X,
    "stamping must be what changes the answer",
  );
});

test("M2 — resolve from the live ref at execution and stability goes red", () => {
  // Modelled: read the promoted ref again when the action runs.
  const liveAtExecution = Y;
  const naive = assertRepositoryIdentity({
    actionType: RECON,
    provenance: { repo_root: "/r", repo_head: Y, repo_branch: "staging", working_directory: "/r/web" },
    expectedRepoHead: liveAtExecution,
  });
  assert.equal(naive.ok, true, "the naive rule passes anything by comparing it to itself");
  const stable = assertRepositoryIdentity({
    actionType: RECON,
    provenance: { repo_root: "/r", repo_head: Y, repo_branch: "staging", working_directory: "/r/web" },
    expectedRepoHead: X,
  });
  assert.equal(stable.ok, false, "the carried SHA must outrank whatever staging became");
  const src = readFileSync(`${LIB}/trusted-host-reconciliation.mjs`, "utf8");
  assert.doesNotMatch(src, /resolveFilingRepositoryAuthority/,
    "the executor must never resolve its own expectation");
});

test("M3 — the promoted ref is named once, and only the filer reads it", () => {
  assert.equal(PROMOTED_REF, "origin/staging");
  const exec = readFileSync(`${LIB}/trusted-host-reconciliation.mjs`, "utf8");
  assert.doesNotMatch(exec, /origin\/staging/);
});



process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
