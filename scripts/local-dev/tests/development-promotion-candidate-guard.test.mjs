#!/usr/bin/env node
/**
 * A PROMOTION MUST CARRY ONLY THE COMMITS ITS MISSION OWNS.
 *
 * Two consecutive missions found the shared promotion worktree acquiring
 * another agent's commits between branch creation and push - five foreign
 * Access/Identity commits the first time, five again the second. Nothing unsafe
 * reached the remote, but only because a human-shaped check caught it both
 * times, and that is not a safety control.
 *
 * The guard for this ALREADY EXISTS. `evaluatePushReadiness` refuses
 * `commit_scope_expanded` when the commits between base and candidate are not
 * the ones the proposal declared. It did not fire in either incident because
 * the pushes DECLARED NOTHING: the check is skipped entirely when
 * `expected_commits` is empty, so an undeclared candidate is trusted by default.
 *
 * So this locks two things. What the guard does when a candidate IS declared -
 * because an untested refusal is a refusal nobody can rely on. And, explicitly,
 * what it does when a candidate is NOT declared, so that the current permissive
 * behaviour is a recorded decision rather than an accident, and so the day it is
 * made mandatory the change is deliberate and visible here.
 */
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluatePushReadiness, validatePushInputs } from "../lib/vacilando/trusted-host-push.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const OWNED = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const FOREIGN = "ffffffffffffffffffffffffffffffffffffffff";
const BASE = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const REMOTE = "cccccccccccccccccccccccccccccccccccccccc";
// A real directory: the guard checks the worktree exists on disk before its
// HEAD is allowed to mean anything. Git itself stays stubbed.
const WT = mkdtempSync(join(tmpdir(), "cand-"));

/** A git stub. `range` is what rev-list reports between base and candidate. */
function gitStub({ head = OWNED, branch = "runtime/mission", range = [OWNED], remote = REMOTE } = {}) {
  return (args) => {
    const a = args.join(" ");
    if (a.startsWith("ls-remote")) return { status: 0, stdout: `${remote}\trefs/heads/x`, stderr: "" };
    if (a === "rev-parse --is-inside-work-tree") return { status: 0, stdout: "true", stderr: "" };
    if (a === "rev-parse HEAD") return { status: 0, stdout: head, stderr: "" };
    if (a === "rev-parse --abbrev-ref HEAD") return { status: 0, stdout: branch, stderr: "" };
    if (a.startsWith("rev-list")) return { status: 0, stdout: range.join("\n"), stderr: "" };
    if (a.startsWith("remote get-url")) return { status: 0, stdout: "https://github.com/ksquared-16/alloy", stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
}

function rawValidate(inputs = {}) {
  return validatePushInputs({
    repository: "ksquared-16/alloy",
    branch: "runtime/mission",
    expected_head_sha: OWNED,
    worktreePath: WT,
    ...inputs,
  });
}

/**
 * Readiness for an inputs object, normalised first. Enforcement lives at the
 * pre-mutation gate rather than in input parsing, because `validatePushInputs`
 * is also called by fixtures, previews and contract checks that never push.
 */
function readiness(inputs = {}, stub = gitStub({})) {
  const v = rawValidate(inputs);
  assert.ok(v.ok, `inputs rejected before the gate: ${v.code || ""}`);
  return evaluatePushReadiness(v.normalized, { gitImpl: stub });
}

/** A declared candidate: the shape every promotion must now arrive in. */
function candidate(inputs = {}) {
  const v = rawValidate({ base_ref: BASE, expected_commits: [OWNED], ...inputs });
  assert.ok(v.ok, `inputs rejected: ${v.code || ""} ${v.detail || ""}`);
  return v.normalized;
}

test("1 — a clean owned candidate is allowed", () => {
  const r = evaluatePushReadiness(candidate({ expected_commits: [OWNED] }), { gitImpl: gitStub({ range: [OWNED] }) });
  assert.notEqual(r.code, "commit_scope_expanded");
  assert.ok(r.ok || r.code === "already_pushed", `unexpected refusal: ${r.code} ${r.detail || ""}`);
});

test("2 — a foreign commit after the baseline is REFUSED, and named", () => {
  const r = evaluatePushReadiness(
    candidate({ expected_commits: [OWNED] }),
    { gitImpl: gitStub({ range: [OWNED, FOREIGN] }) },
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "commit_scope_expanded");
  assert.ok(r.unexpected.some((c) => c.startsWith(FOREIGN.slice(0, 12))),
    "the refusal must say WHICH commit is foreign, not merely that something is");
});

test("3 — several foreign commits are all reported, not just the first", () => {
  const F2 = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  const r = evaluatePushReadiness(
    candidate({ expected_commits: [OWNED] }),
    { gitImpl: gitStub({ range: [OWNED, FOREIGN, F2] }) },
  );
  assert.equal(r.code, "commit_scope_expanded");
  assert.equal(r.unexpected.length, 2, "both foreign commits must be preserved as evidence");
});

test("4 — foreign work is REPORTED, never reset or discarded", () => {
  const r = evaluatePushReadiness(
    candidate({ expected_commits: [OWNED] }),
    { gitImpl: gitStub({ range: [OWNED, FOREIGN] }) },
  );
  // The refusal carries evidence and nothing else: no branch move, no reset, no
  // suggestion to discard. Somebody else's unpushed work is not ours to delete.
  assert.equal(r.ok, false);
  assert.ok(Array.isArray(r.unexpected));
  assert.doesNotMatch(String(r.detail || ""), /reset|discard|delete|force/i,
    "a contaminated candidate is refused, not repaired");
});

test("5 — an UNDECLARED promotion is REFUSED before anything else is checked", () => {
  /*
   * This case used to pin the opposite. The guard existed, and was skipped when
   * nothing was declared, so an undeclared candidate was trusted by default -
   * which is the branch both contaminated promotions actually took. Declaration
   * is now mandatory for promotion, and the refusal names what is missing
   * rather than degrading to a generic denial.
   */
  const v = readiness({});
  assert.equal(v.ok, false);
  assert.equal(v.code, "candidate_scope_undeclared");
  assert.deepEqual(v.missing, ["base_ref", "expected_commits"]);
  assert.equal(v.candidate, OWNED, "the refusal must name the candidate it refused");
  assert.equal(v.branch, "runtime/mission");
  assert.match(v.remedy, /rev-list/, "and must say how to satisfy it");
});

test("5a — base_ref alone is not a declaration", () => {
  const v = readiness({ base_ref: BASE });
  assert.equal(v.code, "candidate_scope_undeclared");
  assert.deepEqual(v.missing, ["expected_commits"]);
});

test("5b — expected_commits alone is not a declaration", () => {
  const v = readiness({ expected_commits: [OWNED] });
  assert.equal(v.code, "candidate_scope_undeclared");
  assert.deepEqual(v.missing, ["base_ref"]);
});

test("5c — DECLARED EMPTY is accepted and is not the same as undeclared", () => {
  // The distinction that stops the hole reopening: [] is an answer, absent is not.
  const declaredEmpty = readiness({ base_ref: BASE, expected_commits: [] }, gitStub({ range: [] }));
  assert.notEqual(declaredEmpty.code, "candidate_scope_undeclared",
    "a candidate may declare that it owns nothing");
  assert.equal(rawValidate({ base_ref: BASE, expected_commits: [] }).normalized.candidateDeclared, true);
  const undeclared = readiness({ base_ref: BASE });
  assert.equal(undeclared.ok, false, "saying nothing is still a refusal");
  assert.equal(undeclared.code, "candidate_scope_undeclared");
});

test("5d — a declared-empty candidate is still COMPARED, not waved through", () => {
  // Gating the comparison on length rather than on declaration would let an
  // empty declaration accept every commit in the range without checking.
  const r = evaluatePushReadiness(
    candidate({ expected_commits: [] }),
    { gitImpl: gitStub({ range: [FOREIGN] }) },
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "commit_scope_expanded");
});

test("5e — a NON-promotion push keeps the existing permissive behaviour", () => {
  /*
   * Deliberately narrow. This is a safety fix for promotion candidates, not a
   * repository-wide contract change, so a caller that explicitly declares
   * another governed mode is unaffected.
   */
  const v = readiness({ requested_mode: "other" });
  assert.notEqual(v.code, "candidate_scope_undeclared",
    "a non-promotion push must not be forced to declare a candidate");
  assert.equal(rawValidate({ requested_mode: "other" }).normalized.isPromotion, false);
});

test("5f — omitting the mode means PROMOTION, so the unsafe case needs the argument", () => {
  const v = readiness({});
  assert.equal(v.code, "candidate_scope_undeclared",
    "if a missing mode ever defaults to permissive again, the hole is back");
});

test("5g — a declared commit missing from the candidate is refused", () => {
  const r = evaluatePushReadiness(
    candidate({ expected_commits: [OWNED, "dddddddddddddddddddddddddddddddddddddddd"] }),
    { gitImpl: gitStub({ range: [OWNED] }) },
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "commit_scope_missing");
  assert.ok(r.missing.some((c) => c.startsWith("dddddddddddd")),
    "the reviewed thing is not the pushed thing, and it must say which commit vanished");
});

test("6 — a candidate that moved after certification is refused as head drift", () => {
  // The race: certify, someone commits, push. Refused because the approval
  // named a commit and the worktree no longer holds it.
  const r = evaluatePushReadiness(
    candidate({ expected_commits: [OWNED] }),
    { gitImpl: gitStub({ head: FOREIGN }) },
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "head_drift");
  assert.equal(r.expected, OWNED);
  assert.equal(r.actual, FOREIGN);
});

test("7 — the wrong worktree is refused before its HEAD can mean anything", () => {
  const r = evaluatePushReadiness(
    candidate({ expected_commits: [OWNED] }),
    { gitImpl: gitStub({ branch: "someone-elses-branch" }) },
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "branch_mismatch");
});

test("8 — what is pushed is the exact certified SHA, not whatever the branch becomes", () => {
  /*
   * This is what closes the validate-then-push race without a lock: the refspec
   * is <expectedHeadSha>:refs/heads/<branch>. If the branch moves between
   * certification and push, the approved commit is still what goes, or nothing.
   */
  const src = readFileSync(new URL("../lib/vacilando/trusted-host-push.mjs", import.meta.url), "utf8");
  assert.match(src, /\$\{[^}]*expectedHeadSha[^}]*\}:refs\/heads\/\$\{[^}]*branch[^}]*\}|expectedHeadSha\}:refs\/heads\//,
    "the push must name the commit, not the local branch");
});


test("9 — a declared baseline git cannot resolve is REFUSED, not skipped", () => {
  /*
   * Otherwise a typo in base_ref satisfies the declaration and verifies
   * nothing: rev-list fails, the comparison is skipped, and every commit in the
   * range is accepted. Declared-but-unverifiable is not verified.
   */
  const failingRevList = (args) => {
    const a = args.join(" ");
    if (a.startsWith("rev-list")) return { status: 128, stdout: "", stderr: "unknown revision" };
    return gitStub({})(args);
  };
  const r = evaluatePushReadiness(candidate({ base_ref: "origin/typo" }), { gitImpl: failingRevList });
  assert.equal(r.ok, false);
  assert.equal(r.code, "candidate_base_unresolvable");
  assert.equal(r.base, "origin/typo", "the refusal must name the ref that failed");
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
