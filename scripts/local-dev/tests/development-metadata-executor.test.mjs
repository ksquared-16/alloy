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


/* ── THE SEAM: what the executor actually receives ───────────────────────────
 *
 * Every case above hands promoteRepositoryMetadata the RAW request inputs. The
 * live path does not. requestTrustedHostAction stores `validated.normalized`
 * as the action's inputs, and the executor reads `action.inputs` at mutation
 * time - so the executor never sees a field the normalizer did not carry.
 *
 * That gap is not hypothetical. The first live promotion refused with
 * `worktree_path_missing` having been filed WITH a worktree path, and would
 * have refused next on `main_before is required` having been filed WITH
 * main_before. Eighteen green cases above, and the one boundary between them
 * was the thing that was broken.
 *
 * These cases run the real chain: definition.validateInputs -> normalized ->
 * executor.
 * ──────────────────────────────────────────────────────────────────────────*/

const { getActionDefinition, ACTION_TYPES } = await import(
  "../lib/vacilando/trusted-host-action-registry.mjs"
);
const promoteDef = getActionDefinition(ACTION_TYPES.REPOSITORY_PROMOTE_METADATA);
const WT = "/tmp/wt";
const normalize = (over = {}) =>
  promoteDef.validateInputs(inputs({ worktree_path: WT, ...over }));

test("S1 - normalized inputs still reach the executor's happy path", () => {
  const v = normalize();
  assert.equal(v.ok, true, `validation refused: ${v.code || ""} ${v.detail || ""}`);
  const stub = gitStub();
  // EXACTLY what the trusted host does: the normalized object IS action.inputs.
  const r = promoteRepositoryMetadata(v.normalized, { git: stub, cwd: WT });
  assert.equal(r.ok, true, `refused after normalization: ${r.code || ""} ${r.detail || ""}`);
  assert.equal(r.main_after, NEW);
  assert.deepEqual(r.files, [WF]);
});

test("S2 - normalized carries the worktree the executor resolves the candidate in", () => {
  const v = normalize();
  assert.equal(v.normalized.worktreePath, WT,
    "dropped here and the executor refuses worktree_path_missing after an operator has approved");
});

test("S3 - normalized carries the main it was approved onto", () => {
  const v = normalize();
  assert.equal(v.normalized.mainBefore, MAIN);
  // And the executor must accept it from that field, not only from raw input.
  const r = promoteRepositoryMetadata(v.normalized, { git: gitStub(), cwd: WT });
  assert.notEqual(r.code, METADATA_PROMOTION_FAILURES.REVALIDATION_FAILED);
});

test("S4 - a filer that omits the worktree is refused at request time", () => {
  const v = promoteDef.validateInputs(inputs());
  assert.equal(v.ok, false);
  assert.equal(v.code, "missing_worktree_path",
    "the refusal must reach the filer, not the operator who already approved");
});

test("S5 - the write declares what it acted on, so it cannot inherit a stranger's result", () => {
  const a = normalize().normalized.dedupeKey;
  const b = normalize({ candidate_sha: "c".repeat(40) }).normalized.dedupeKey;
  const c = normalize({ main_before: "2".repeat(40) }).normalized.dedupeKey;
  assert.ok(a, "a keyless privileged write can adopt any completed action of its type");
  assert.notEqual(a, b, "a different candidate is a different promotion");
  assert.notEqual(a, c, "the same candidate onto a different main is a different promotion");
  assert.equal(a, normalize().normalized.dedupeKey, "and the same promotion is stable");
});

test("S6 - main_after is not a copy of main_before", () => {
  // Two fields that cannot disagree are one field wearing two names, and prove
  // nothing to a reader trying to establish whether the branch moved.
  const { r } = run({}, gitStub({ pushStatus: 1, pushErr: "rejected" }));
  assert.equal(r.ok, false);
  assert.equal(r.main_before, MAIN);
  assert.equal(r.main_after, MAIN, "a refused push leaves main where it was");
  const ok = run().r;
  assert.notEqual(ok.main_after, ok.main_before, "a successful write moves it");
});

/* ── I: the tree is built somewhere else ─────────────────────────────────── */

const { defaultGit } = await import("../lib/vacilando/trusted-host-push.mjs");
const { mkdtempSync, writeFileSync, existsSync, rmSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");

test("I1 - the real git honours GIT_INDEX_FILE, so the build never touches the named worktree", () => {
  /*
   * The executor builds its tree through
   * `git(args, cwd, { env: { GIT_INDEX_FILE: <temp> } })` so it never disturbs
   * the index of the worktree it was pointed at. `defaultGit` destructured only
   * `timeout` and passed `process.env` verbatim, so that intent was dropped and
   * read-tree/update-index/write-tree ran against the operator-named worktree's
   * REAL index - discarding whatever was staged there.
   *
   * A git stub cannot catch this: the loss is in the real implementation. So
   * this case uses a throwaway repository and measures the actual files.
   */
  const repo = mkdtempSync(join(tmpdir(), "metapromote-repo-"));
  const idxDir = mkdtempSync(join(tmpdir(), "metapromote-idx-"));
  const idx = join(idxDir, "index");
  try {
    const g = (...a) => defaultGit(a, repo);
    g("init", "-q");
    g("config", "user.email", "t@example.com");
    g("config", "user.name", "t");
    writeFileSync(join(repo, "a.txt"), "one\n");
    g("add", "a.txt");
    g("commit", "-qm", "first");

    // Something is staged in the worktree, as it would be for a real operator.
    writeFileSync(join(repo, "b.txt"), "staged work\n");
    g("add", "b.txt");
    const stagedBefore = defaultGit(["diff", "--cached", "--name-only"], repo).stdout.trim();
    assert.equal(stagedBefore, "b.txt", "precondition: b.txt is staged");

    const r = defaultGit(["read-tree", "HEAD"], repo, { env: { GIT_INDEX_FILE: idx } });
    assert.equal(r.status, 0, r.stderr || "");
    assert.ok(existsSync(idx), "the alternate index must actually be used");

    const stagedAfter = defaultGit(["diff", "--cached", "--name-only"], repo).stdout.trim();
    assert.equal(stagedAfter, "b.txt",
      "a governed build must not discard what the named worktree had staged");
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(idxDir, { recursive: true, force: true });
  }
});

test("I2 - an env override does not strip the ambient environment git needs", () => {
  // Replacing process.env outright would leave git without PATH or HOME.
  const repo = mkdtempSync(join(tmpdir(), "metapromote-env-"));
  try {
    defaultGit(["init", "-q"], repo);
    const r = defaultGit(["rev-parse", "--git-dir"], repo, { env: { GIT_INDEX_FILE: join(repo, "x") } });
    assert.equal(r.status, 0, `git could not run with an env override: ${r.stderr || ""}`);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("I3 - the build works in a LINKED WORKTREE, which is where every candidate lives", () => {
  /*
   * `.git` is a directory only in a main checkout. Every lane, and every
   * promotion candidate, lives in a linked worktree where `.git` is a FILE -
   * so `<cwd>/.git/metadata-promote-index` is a path inside a regular file and
   * cannot be created. The promotion then refuses metadata_tree_build_failed,
   * for every candidate, always.
   *
   * It was invisible twice over: a git stub returns 0 for read-tree whatever the
   * index path is, and while the env override was being dropped the build
   * silently used the worktree's own index and appeared to work. The mask and
   * the fault sat in the same two lines.
   */
  const root = mkdtempSync(join(tmpdir(), "metapromote-main-"));
  const wtDir = mkdtempSync(join(tmpdir(), "metapromote-linked-"));
  const linked = join(wtDir, "wt");
  try {
    const g = (...a) => defaultGit(a, root);
    g("init", "-q", "-b", "main");
    g("config", "user.email", "t@example.com");
    g("config", "user.name", "t");
    writeFileSync(join(root, "a.txt"), "one\n");
    g("add", "a.txt");
    g("commit", "-qm", "first");
    const add = defaultGit(["worktree", "add", "-q", "--detach", linked, "HEAD"], root);
    assert.equal(add.status, 0, add.stderr || "");
    assert.ok(!existsSync(join(linked, ".git", "config")),
      "precondition: .git in a linked worktree is a file, not a directory");

    // What the executor computes, now that it asks git instead of guessing.
    const resolved = defaultGit(["rev-parse", "--absolute-git-dir"], linked);
    assert.equal(resolved.status, 0, resolved.stderr || "");
    const idx = `${resolved.stdout.trim()}/metadata-promote-index`;

    const rt = defaultGit(["read-tree", "HEAD"], linked, { env: { GIT_INDEX_FILE: idx } });
    assert.equal(rt.status, 0, `read-tree failed in a linked worktree: ${rt.stderr || ""}`);
    assert.ok(existsSync(idx), "the alternate index must be creatable from a linked worktree");

    // And the naive path is genuinely unusable, which is what made this a defect.
    const naive = defaultGit(["read-tree", "HEAD"], linked,
      { env: { GIT_INDEX_FILE: join(linked, ".git", "metadata-promote-index") } });
    assert.notEqual(naive.status, 0, "<cwd>/.git/<file> must fail here, or this test proves nothing");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(wtDir, { recursive: true, force: true });
  }
});

/* ── W: the wrapper's own git, which no test had ever constructed ────────── */

const { metadataPromotionGit } = await import("../lib/vacilando/trusted-host-actions.mjs");

test("W1 - the git the promotion runs on actually resolves", () => {
  /*
   * It was an inline arrow closing over `defaultGit`, which that module never
   * imported. Nothing fails at import time - a ReferenceError on a free
   * variable fires when the closure RUNS, and the only thing that ran it was a
   * real dispatch of an operator-approved action. So every case here stayed
   * green and the live write threw
   * `metadata_promote_threw: defaultGit is not defined` AFTER approval.
   *
   * Calling it once is the whole lock.
   */
  const repo = mkdtempSync(join(tmpdir(), "metapromote-wrapper-"));
  try {
    const g = metadataPromotionGit(repo);
    assert.equal(typeof g, "function");
    const init = g(["init", "-q"]);
    assert.equal(init.status, 0, `the wrapper's git could not run: ${init.stderr || ""}`);
    const r = g(["rev-parse", "--absolute-git-dir"]);
    assert.equal(r.status, 0, r.stderr || "");
    assert.ok(r.stdout.trim().length > 0);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("W2 - it keeps a caller's own directory and forwards the index env", () => {
  // The two things the inline arrow did that a naive replacement would lose.
  const a = mkdtempSync(join(tmpdir(), "metapromote-a-"));
  const b = mkdtempSync(join(tmpdir(), "metapromote-b-"));
  try {
    const g = metadataPromotionGit(a);
    g(["init", "-q"]);
    defaultGit(["init", "-q"], b);
    const inB = g(["rev-parse", "--absolute-git-dir"], b);
    assert.equal(inB.status, 0, inB.stderr || "");
    assert.ok(inB.stdout.includes(b.split("/").pop()),
      "an inner call naming its own directory must keep it");

    defaultGit(["config", "user.email", "t@example.com"], a);
    defaultGit(["config", "user.name", "t"], a);
    writeFileSync(join(a, "f.txt"), "x\n");
    defaultGit(["add", "f.txt"], a);
    defaultGit(["commit", "-qm", "c"], a);
    const idx = join(a, "alt-index");
    const rt = g(["read-tree", "HEAD"], null, { env: { GIT_INDEX_FILE: idx } });
    assert.equal(rt.status, 0, rt.stderr || "");
    assert.ok(existsSync(idx), "opts must be forwarded, or the index isolation is gone again");
  } finally {
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
