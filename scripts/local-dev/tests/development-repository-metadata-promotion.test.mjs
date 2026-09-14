#!/usr/bin/env node
/**
 * ONE NARROW DOOR TO main, AND IT FAILS CLOSED.
 *
 * main is Alloy's release branch; staging is the development trunk; the default
 * branch stays main. None of that changes. What changes is that a workflow
 * DEFINITION can reach main without dragging product code with it, because
 * GitHub resolves scheduled workflows from the default branch only.
 *
 * The danger is obvious and these lock against it: a mixed commit must not be
 * quietly trimmed to its acceptable files, because that would move product code
 * to main as a side effect of editing a workflow.
 */
import assert from "node:assert/strict";
import {
  validateRepositoryMetadataInputs,
  evaluateRepositoryMetadataCandidate,
  isRepositoryMetadataPath,
  REPOSITORY_METADATA_ALLOWED_PREFIXES,
  REPOSITORY_METADATA_TARGET,
} from "../lib/vacilando/trusted-host-repository-metadata.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const C = "a".repeat(40);
const FOREIGN = "f".repeat(40);
const BASE = "b".repeat(40);
const WF = ".github/workflows/vacilando-tier2.yml";
const DEST = "3".repeat(40);

const inputs = (over = {}) => ({
  repository: "ksquared-16/alloy",
  target_branch: "main",
  candidate_sha: C,
  base_ref: BASE,
  expected_commits: [C],
  expected_files: [WF],
  ...over,
});

function gitStub({ range = [C], diff = [WF], rangeStatus = 0, diffStatus = 0, destStatus = 0 } = {}) {
  return (args) => {
    const a = args.join(" ");
    if (a.startsWith("rev-parse --verify")) return { status: destStatus, stdout: DEST, stderr: "" };
    if (a.startsWith("rev-list")) return { status: rangeStatus, stdout: range.join("\n"), stderr: "" };
    if (a.startsWith("diff")) return { status: diffStatus, stdout: diff.join("\n"), stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
}
const evaluate = (over = {}, stub = gitStub()) => {
  const v = validateRepositoryMetadataInputs(inputs(over));
  assert.ok(v.ok, `inputs refused: ${v.code || ""} ${v.detail || ""}`);
  return evaluateRepositoryMetadataCandidate(v.normalized, { gitImpl: stub, cwd: "/tmp" });
};

/* ── 1: the happy path, so the refusals below mean something ─────────────── */

test("1 — a workflow-only candidate is eligible", () => {
  const r = evaluate();
  assert.equal(r.ok, true, `refused: ${r.code || ""} ${r.detail || ""}`);
  assert.deepEqual(r.files, [WF]);
  assert.equal(r.diff_against, DEST, "the diff must be taken against the RESOLVED destination commit");
});

/* ── 2-3: product code fails closed ──────────────────────────────────────── */

test("2 — a candidate touching web/** is REFUSED, and named", () => {
  const r = evaluate({}, gitStub({ diff: [WF, "web/app/page.tsx"] }));
  assert.equal(r.ok, false);
  assert.equal(r.code, "candidate_contains_product_files");
  assert.ok(r.offending.includes("web/app/page.tsx"));
});

test("3 — a candidate carrying a migration is REFUSED", () => {
  const r = evaluate({}, gitStub({ diff: [WF, "supabase/migrations/20260914_x.sql"] }));
  assert.equal(r.ok, false);
  assert.equal(r.code, "candidate_contains_product_files");
});

test("3a — the mixed candidate is refused WHOLE, never trimmed to its good files", () => {
  /*
   * The failure mode this class exists to prevent. Promoting the workflow and
   * dropping the product file would move product code to main as a side effect
   * of a workflow edit - or worse, half a change.
   */
  const r = evaluate({}, gitStub({ diff: [WF, "web/lib/x.ts"] }));
  assert.equal(r.ok, false);
  assert.notEqual(r.code, undefined);
  assert.ok(!("promoted_subset" in r), "there is no partial promotion");
  assert.match(r.detail, /rebuild the candidate/i, "the remedy is a new candidate, not a filtered one");
});

/* ── 4-5: ownership, exactly as strict as a product promotion ────────────── */

test("4 — an undeclared candidate is REFUSED", () => {
  for (const drop of ["base_ref", "expected_commits", "expected_files"]) {
    const over = { ...inputs() };
    delete over[drop];
    const v = validateRepositoryMetadataInputs(over);
    assert.equal(v.ok, false, `${drop} omitted and still accepted`);
    assert.equal(v.code, "candidate_scope_undeclared");
    assert.ok(v.missing.includes(drop));
  }
});

test("5 — a foreign commit in the candidate is REFUSED, and named", () => {
  const r = evaluate({}, gitStub({ range: [C, FOREIGN] }));
  assert.equal(r.ok, false);
  assert.equal(r.code, "candidate_contains_foreign_commits");
  assert.ok(r.foreign.some((c) => c.startsWith("ffffffffffff")));
});

test("5a — a declared commit absent from the candidate is REFUSED", () => {
  const r = evaluate({ expected_commits: [C, "d".repeat(40)] }, gitStub({ range: [C] }));
  assert.equal(r.ok, false);
  assert.equal(r.code, "declared_commit_absent");
});

test("5b — an unresolvable baseline is REFUSED, not skipped", () => {
  const r = evaluate({}, gitStub({ rangeStatus: 128 }));
  assert.equal(r.ok, false);
  assert.equal(r.code, "candidate_base_unresolvable");
});

test("5c — a changed file that was not declared is REFUSED", () => {
  const r = evaluate({}, gitStub({ diff: [WF, ".github/workflows/other.yml"] }));
  assert.equal(r.ok, false);
  assert.equal(r.code, "candidate_file_set_mismatch");
  assert.ok(r.unexpected.includes(".github/workflows/other.yml"),
    "even an ALLOWED path must still be declared");
});

test("5d — a declared file the candidate does not change is REFUSED", () => {
  const r = evaluate({ expected_files: [WF, ".github/workflows/ghost.yml"] });
  assert.equal(r.ok, false);
  assert.equal(r.code, "declared_file_absent");
});

/* ── 9-11: the boundary this class must not erode ────────────────────────── */

test("9 — the default branch stays main and this class writes only main", () => {
  assert.equal(REPOSITORY_METADATA_TARGET, "main");
  for (const t of ["staging", "production", "master", "refs/heads/main", ""]) {
    const v = validateRepositoryMetadataInputs(inputs({ target_branch: t }));
    assert.equal(v.ok, false, `${t || "(empty)"} accepted as a destination`);
    assert.equal(v.code, "metadata_target_not_allowed");
  }
});

test("10 — ordinary product promotion still refuses main", async () => {
  // This class is an exception ALONGSIDE the existing rule, not a replacement
  // for it. If ALLOWED_TARGET_BRANCHES ever widens, that is a different and
  // much larger decision, and it should break here first.
  const { ALLOWED_TARGET_BRANCHES } = await import("../lib/vacilando/trusted-host-merge.mjs");
  assert.deepEqual([...ALLOWED_TARGET_BRANCHES], ["staging"],
    "normal promotion must still own staging only");
});

test("11 — the allowlist starts at exactly one prefix", () => {
  assert.deepEqual([...REPOSITORY_METADATA_ALLOWED_PREFIXES], [".github/workflows/"]);
  assert.equal(isRepositoryMetadataPath(WF), true);
  for (const p of ["web/app/page.tsx", "supabase/migrations/x.sql", "scripts/local-dev/x.mjs",
                   "package.json", ".github/dependabot.yml", "../.github/workflows/x.yml",
                   "/.github/workflows/x.yml"]) {
    assert.equal(isRepositoryMetadataPath(p), false, `${p} must not be promotable`);
  }
});

/* ── 7-8: Tier 2 must test staging, not the branch it is defined on ──────── */

test("7 — Tier 2 names the ref it tests instead of inheriting the default branch", async () => {
  const { readFileSync } = await import("node:fs");
  const wf = readFileSync(new URL("../../../.github/workflows/vacilando-tier2.yml", import.meta.url), "utf8");
  assert.match(wf, /ref:\s*\$\{\{\s*inputs\.tested_ref\s*\|\|\s*'staging'\s*\}\}/,
    "a bare checkout would test main, where scripts/local-dev/tests does not exist at all");
});

test("8 — the run records the definition SHA and the tested SHA separately", async () => {
  const { readFileSync } = await import("node:fs");
  const wf = readFileSync(new URL("../../../.github/workflows/vacilando-tier2.yml", import.meta.url), "utf8");
  assert.match(wf, /workflow_definition_sha=/);
  assert.match(wf, /tested_sha=/);
  assert.match(wf, /no scripts\/local-dev\/tests/,
    "and refuses loudly rather than silently testing the wrong tree");
});

test("12 — the destination is RESOLVED, never a bare ref that a local branch can shadow", () => {
  /*
   * Measured on this host: a stale local branch named main sat at 5111b9c02019
   * while origin/main was 80ff5bf591a8, and diffing the bare name refused a
   * clean one-file candidate as seven product files. The inverse is the real
   * hazard - a local ref already carrying product changes would diff them away
   * and ACCEPT a candidate that ships product code to the remote.
   */
  const calls = [];
  const spy = (args) => { calls.push(args.join(" ")); return gitStub()(args); };
  const v = validateRepositoryMetadataInputs(inputs());
  evaluateRepositoryMetadataCandidate(v.normalized, { gitImpl: spy, cwd: "/tmp" });
  assert.ok(calls.some((c) => c.includes("refs/remotes/origin/main")),
    "the destination must be resolved through the remote-tracking ref");
  assert.ok(!calls.some((c) => /^diff --name-only main\.\.\./.test(c)),
    "and never diffed against the bare name");
});

test("12a — an unresolvable destination REFUSES rather than falling back to a name", () => {
  const r = evaluate({}, gitStub({ destStatus: 128 }));
  assert.equal(r.ok, false);
  assert.equal(r.code, "candidate_destination_unresolvable");
});

test("12b — a verified destination SHA from the executor wins over any ref lookup", () => {
  // The executor has already compare-and-swapped against the real remote head;
  // that answer is better than re-deriving it.
  const v = validateRepositoryMetadataInputs(inputs({ main_before: DEST }));
  assert.equal(v.normalized.destinationRef, DEST);
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
