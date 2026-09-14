#!/usr/bin/env node
/**
 * THE EXECUTOR THAT WRITES main, AND THE FOUR WAYS IT MUST REFUSE.
 *
 * main is Alloy's release branch. This is the only path that writes it, it
 * writes one class of file, and it must be impossible to talk it into anything
 * else - including by a validator regression upstream, which is why the
 * allowlist is re-checked per file at mutation time.
 *
 * The compare-and-swap matters as much as the allowlist: an operator approves a
 * promotion ONTO a specific main. If main moved, the approved thing and the
 * actual thing differ, and the only honest move is to refuse and ask again.
 */
import assert from "node:assert/strict";
import {
  promoteRepositoryMetadata,
  METADATA_PROMOTION_FAILURES,
} from "../lib/vacilando/trusted-host-metadata-promote.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const MAIN = "1".repeat(40);
const CAND = "a".repeat(40);
const BASE = "b".repeat(40);
const NEW = "9".repeat(40);
const BLOB = "7".repeat(40);
const OLDTREE = "e".repeat(40);
const NEWTREE = "d".repeat(40);
const WF = ".github/workflows/vacilando-tier2.yml";

const inputs = (over = {}) => ({
  repository: "ksquared-16/alloy",
  target_branch: "main",
  candidate_sha: CAND,
  base_ref: BASE,
  expected_commits: [CAND],
  expected_files: [WF],
  main_before: MAIN,
  ...over,
});

/** A git that records what it was asked to do. */
function gitStub(over = {}) {
  const calls = [];
  const impl = (args) => {
    calls.push(args.join(" "));
    const a = args.join(" ");
    if (a.startsWith("cat-file -e")) return { status: over.candidateMissing ? 1 : 0, stdout: "", stderr: "" };
    if (a.startsWith("ls-remote")) return { status: over.remoteStatus ?? 0, stdout: `${over.remoteMain ?? MAIN}\trefs/heads/main`, stderr: "" };
    if (a.startsWith("rev-list")) return { status: 0, stdout: (over.range ?? [CAND]).join("\n"), stderr: "" };
    if (a.startsWith("diff")) return { status: 0, stdout: (over.diff ?? [WF]).join("\n"), stderr: "" };
    if (a.startsWith("read-tree")) return { status: 0, stdout: "", stderr: "" };
    if (a.startsWith("rev-parse") && a.includes("^{tree}")) return { status: 0, stdout: over.mainTree ?? OLDTREE, stderr: "" };
    if (a.startsWith("rev-parse")) return { status: over.blobMissing ? 1 : 0, stdout: BLOB, stderr: "" };
    if (a.startsWith("update-index")) return { status: 0, stdout: "", stderr: "" };
    if (a.startsWith("write-tree")) return { status: 0, stdout: over.writtenTree ?? NEWTREE, stderr: "" };
    if (a.startsWith("commit-tree")) return { status: 0, stdout: NEW, stderr: "" };
    if (a.startsWith("push")) return { status: over.pushStatus ?? 0, stdout: "", stderr: over.pushErr ?? "" };
    return { status: 0, stdout: "", stderr: "" };
  };
  impl.calls = calls;
  return impl;
}
const run = (over = {}, stub = gitStub()) =>
  ({ r: promoteRepositoryMetadata(inputs(over), { git: stub, cwd: "/tmp/wt" }), calls: stub.calls });

/* ── 1, 8, 9, 10: the happy path is real and minimal ─────────────────────── */

test("1/8 — a validated workflow-only candidate with main unmoved proceeds", () => {
  const { r } = run();
  assert.equal(r.ok, true, `refused: ${r.code || ""} ${r.detail || ""}`);
  assert.equal(r.main_before, MAIN);
  assert.equal(r.main_after, NEW);
  assert.deepEqual(r.files, [WF]);
  assert.equal(r.product_files_changed, false);
});

test("9 — exactly ONE commit is created, parented on the approved main", () => {
  const { calls } = run();
  const commits = calls.filter((c) => c.startsWith("commit-tree"));
  assert.equal(commits.length, 1, "one metadata commit, never a series");
  assert.match(commits[0], new RegExp(`-p ${MAIN}`), "parented on the main the operator approved");
});

test("9a — it never merges, rebases, resets or forces", () => {
  const { calls } = run();
  for (const forbidden of ["merge", "rebase", "reset", "--force", "cherry-pick", "filter-branch"]) {
    assert.ok(!calls.some((c) => c.includes(forbidden)), `${forbidden} must never be used to write main`);
  }
});

test("10 — only the declared files are staged onto main's own tree", () => {
  const { calls } = run();
  const staged = calls.filter((c) => c.startsWith("update-index"));
  assert.equal(staged.length, 1);
  assert.ok(staged[0].endsWith(WF));
  assert.ok(calls.some((c) => c === `read-tree ${MAIN}`),
    "the tree must start from main, so main's product tree is untouched by construction");
});

/* ── 2-6: content and declaration refusals, re-checked at mutation ────────── */

test("2 — a candidate touching web/** is refused at mutation time", () => {
  const { r } = run({}, gitStub({ diff: [WF, "web/app/page.tsx"] }));
  assert.equal(r.ok, false);
  assert.equal(r.code, "candidate_contains_product_files");
});

test("3 — a candidate carrying a migration is refused", () => {
  const { r } = run({}, gitStub({ diff: [WF, "supabase/migrations/x.sql"] }));
  assert.equal(r.ok, false);
  assert.equal(r.code, "candidate_contains_product_files");
});

test("4 — a mixed candidate is refused WHOLE and nothing is pushed", () => {
  const { r, calls } = run({}, gitStub({ diff: [WF, "web/lib/x.ts"] }));
  assert.equal(r.ok, false);
  assert.ok(!calls.some((c) => c.startsWith("push")), "a refusal must not reach the remote");
  assert.ok(!calls.some((c) => c.startsWith("commit-tree")), "nor build a commit");
});

test("5 — a missing ownership declaration is refused", () => {
  for (const drop of ["base_ref", "expected_commits", "expected_files"]) {
    const over = inputs(); delete over[drop];
    const r = promoteRepositoryMetadata(over, { git: gitStub(), cwd: "/tmp/wt" });
    assert.equal(r.ok, false, `${drop} omitted and still accepted`);
  }
});

test("5a — a missing main_before is refused: approval is ONTO a specific main", () => {
  const over = inputs(); delete over.main_before;
  const r = promoteRepositoryMetadata(over, { git: gitStub(), cwd: "/tmp/wt" });
  assert.equal(r.ok, false);
  assert.equal(r.code, METADATA_PROMOTION_FAILURES.REVALIDATION_FAILED);
});

test("6 — a changed file that was not declared is refused", () => {
  const { r } = run({}, gitStub({ diff: [WF, ".github/workflows/other.yml"] }));
  assert.equal(r.ok, false);
  assert.equal(r.code, "candidate_file_set_mismatch");
});

/* ── 7: compare-and-swap ─────────────────────────────────────────────────── */

test("7 — main moving after approval REFUSES and names both heads", () => {
  const moved = "c".repeat(40);
  const { r, calls } = run({}, gitStub({ remoteMain: moved }));
  assert.equal(r.ok, false);
  assert.equal(r.code, METADATA_PROMOTION_FAILURES.TARGET_HEAD_CHANGED);
  assert.equal(r.approved_before, MAIN);
  assert.equal(r.main_before, moved, "the refusal reports what main actually is now");
  assert.ok(!calls.some((c) => c.startsWith("push")), "and nothing is pushed");
});

test("7a — the CAS reads the REMOTE, not a local tracking ref", () => {
  const { calls } = run();
  assert.ok(calls.some((c) => c.startsWith("ls-remote")),
    "a stale local ref would defeat the compare-and-swap");
});

/* ── 11-12: the boundary stays closed ────────────────────────────────────── */

test("11/12 — the executor cannot target staging or any branch but main", () => {
  for (const t of ["staging", "production", "master", ""]) {
    const r = promoteRepositoryMetadata(inputs({ target_branch: t }), { git: gitStub(), cwd: "/tmp/wt" });
    assert.equal(r.ok, false, `${t || "(empty)"} accepted`);
    assert.equal(r.code, "metadata_target_not_allowed");
  }
});

test("11a — ordinary product promotion still refuses main", async () => {
  const { ALLOWED_TARGET_BRANCHES } = await import("../lib/vacilando/trusted-host-merge.mjs");
  assert.deepEqual([...ALLOWED_TARGET_BRANCHES], ["staging"]);
});

/* ── 13-14: provenance and the interruption windows ──────────────────────── */

test("13 — the result carries main_before, main_after, candidate and files", () => {
  const { r } = run();
  for (const k of ["main_before", "main_after", "candidate", "expected_commits", "expected_files", "actual_files", "promotion_class"]) {
    assert.ok(r[k] !== undefined, `result must carry ${k}`);
  }
  assert.equal(r.promotion_class, "repository_metadata");
});

test("14 — a push failure reports no false success AND names the built commit", () => {
  /*
   * Window B/D: the commit exists locally, main did not move. Naming it is what
   * lets a retry recognise its own work instead of building a second commit.
   */
  const { r } = run({}, gitStub({ pushStatus: 1, pushErr: "remote rejected" }));
  assert.equal(r.ok, false);
  assert.equal(r.code, METADATA_PROMOTION_FAILURES.PUSH_FAILED);
  assert.equal(r.main_after, MAIN, "main did not move");
  assert.equal(r.built_commit, NEW);
});

test("14a — a retry after a LOST RESULT settles truthfully instead of committing twice", () => {
  // Window E: the remote already carries this content, so the rebuilt tree
  // equals main's tree. That must be a truthful no-op, not an empty commit.
  const { r, calls } = run({}, gitStub({ remoteMain: MAIN, mainTree: NEWTREE, writtenTree: NEWTREE }));
  assert.equal(r.ok, true);
  assert.equal(r.already_present, true);
  assert.equal(r.main_after, MAIN);
  assert.equal(r.commit, null);
  assert.ok(!calls.some((c) => c.startsWith("commit-tree")), "no empty commit");
  assert.ok(!calls.some((c) => c.startsWith("push")), "and nothing pushed");
});

test("A — a missing candidate refuses before anything is built", () => {
  const { r, calls } = run({}, gitStub({ candidateMissing: true }));
  assert.equal(r.ok, false);
  assert.equal(r.code, METADATA_PROMOTION_FAILURES.CANDIDATE_MISSING);
  assert.ok(!calls.some((c) => c.startsWith("commit-tree")));
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
