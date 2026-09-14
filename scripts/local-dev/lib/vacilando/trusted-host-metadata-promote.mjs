/**
 * THE ONLY WRITER OF main, AND IT WRITES ONE KIND OF FILE.
 *
 * The validator (trusted-host-repository-metadata.mjs) decides whether a
 * candidate MAY reach main. This decides how, and it is deliberately not a
 * general-purpose main writer: there is no branch parameter, no merge, no
 * rebase, no force, and no shell passthrough. It builds exactly one commit
 * whose parent is the main the operator approved and whose tree differs from
 * that main in exactly the declared files.
 *
 * WHY NOT MERGE. main and staging diverge by thousands of product commits.
 * Merging staging into main to move one workflow file would release Alloy.
 * Cherry-picking the candidate commit would carry whatever else that commit
 * touched. So the content is lifted file by file from the certified candidate
 * and laid onto main's own tree - main's history is preserved and its product
 * tree is untouched by construction, not by inspection.
 *
 * WHY COMPARE-AND-SWAP. The operator approved a promotion ONTO a specific main.
 * If main moved between approval and execution, the thing they approved is not
 * the thing that would happen, so it refuses and asks for a fresh decision
 * rather than silently recomputing against a different base.
 */

import {
  validateRepositoryMetadataInputs,
  evaluateRepositoryMetadataCandidate,
  isRepositoryMetadataPath,
  REPOSITORY_METADATA_TARGET,
} from "./trusted-host-repository-metadata.mjs";

export const METADATA_PROMOTION_FAILURES = Object.freeze({
  TARGET_HEAD_CHANGED: "metadata_target_head_changed",
  CANDIDATE_MISSING: "metadata_candidate_missing",
  REVALIDATION_FAILED: "metadata_revalidation_failed",
  TREE_BUILD_FAILED: "metadata_tree_build_failed",
  COMMIT_FAILED: "metadata_commit_failed",
  PUSH_FAILED: "metadata_push_failed",
  NOTHING_TO_DO: "metadata_already_present",
});

const normSha = (v) => String(v || "").trim().toLowerCase();
const short = (v) => normSha(v).slice(0, 12);

/**
 * Apply a validated repository-metadata candidate to main.
 *
 * `git(args, cwd)` -> { status, stdout, stderr }. Every mutation goes through
 * it, so the whole path is testable without a remote.
 */
export function promoteRepositoryMetadata(inputs = {}, { git, cwd, nowMs = Date.now() } = {}) {
  const refuse = (code, detail, extra = {}) => ({
    ok: false, code, detail,
    // Even a refusal says what main was, so a reader never has to guess whether
    // the branch moved underneath the attempt.
    main_before: extra.main_before ?? null,
    main_after: extra.main_before ?? null,
    product_files_changed: false,
    ...extra,
  });

  /*
   * REVALIDATED HERE, NOT TRUSTED FROM REQUEST TIME. An approval can sit for
   * minutes; the candidate, the declaration and main can all move in between.
   * Validation at request time proves the request was well-formed, not that
   * the mutation is still the one that was approved.
   */
  const v = validateRepositoryMetadataInputs(inputs);
  if (!v.ok) return refuse(v.code, v.detail, { missing: v.missing, offending: v.offending });
  const n = v.normalized;

  const approvedBefore = normSha(inputs.main_before || inputs.mainBefore);
  if (!approvedBefore) {
    return refuse(METADATA_PROMOTION_FAILURES.REVALIDATION_FAILED,
      "main_before is required: a promotion is approved ONTO a specific main");
  }

  const candidateExists = git(["cat-file", "-e", `${n.candidate}^{commit}`], cwd);
  if (candidateExists.status !== 0) {
    return refuse(METADATA_PROMOTION_FAILURES.CANDIDATE_MISSING,
      `the certified candidate ${short(n.candidate)} is not present in this worktree`);
  }

  const scope = evaluateRepositoryMetadataCandidate(n, { gitImpl: git, cwd });
  if (!scope.ok) {
    // Carry the scope diagnostics through WITHOUT letting the spread clobber
    // ok:false back to undefined - a refusal that does not read as a refusal is
    // worse than no diagnostics at all.
    const { ok: _refused, code: _c, detail: _d, ...diagnostics } = scope;
    return refuse(scope.code, scope.detail, diagnostics);
  }

  // COMPARE AND SWAP. Read the REMOTE, not a local tracking ref that may be stale.
  const remote = git(["ls-remote", inputs.remote || "origin", `refs/heads/${REPOSITORY_METADATA_TARGET}`], cwd);
  if (remote.status !== 0) {
    return refuse(METADATA_PROMOTION_FAILURES.REVALIDATION_FAILED,
      `could not read remote ${REPOSITORY_METADATA_TARGET}`);
  }
  const currentMain = normSha(String(remote.stdout || "").split(/\s+/)[0]);
  if (!currentMain) {
    return refuse(METADATA_PROMOTION_FAILURES.REVALIDATION_FAILED,
      `remote ${REPOSITORY_METADATA_TARGET} has no head`);
  }
  if (currentMain !== approvedBefore) {
    return refuse(METADATA_PROMOTION_FAILURES.TARGET_HEAD_CHANGED,
      `${REPOSITORY_METADATA_TARGET} moved from ${short(approvedBefore)} to ${short(currentMain)} after approval; a fresh decision is required`,
      { main_before: currentMain, approved_before: approvedBefore });
  }

  /*
   * BUILD THE TREE FROM main's OWN TREE. Start at the approved main and replace
   * exactly the declared paths with the candidate's blobs. Nothing else can
   * enter: files are named one at a time and each is re-checked against the
   * allowlist here, so even a validator regression cannot widen this step.
   */
  const idx = `${cwd}/.git/metadata-promote-index`;
  const withIndex = (args) => git(args, cwd, { env: { GIT_INDEX_FILE: idx } });
  const readTree = withIndex(["read-tree", approvedBefore]);
  if (readTree.status !== 0) {
    return refuse(METADATA_PROMOTION_FAILURES.TREE_BUILD_FAILED,
      `could not read the tree of ${short(approvedBefore)}`, { main_before: currentMain });
  }

  const applied = [];
  for (const file of n.expectedFiles) {
    if (!isRepositoryMetadataPath(file)) {
      return refuse(METADATA_PROMOTION_FAILURES.REVALIDATION_FAILED,
        `${file} is not a repository-metadata path`, { main_before: currentMain });
    }
    const blob = git(["rev-parse", `${n.candidate}:${file}`], cwd);
    if (blob.status !== 0) {
      return refuse(METADATA_PROMOTION_FAILURES.TREE_BUILD_FAILED,
        `${file} is not present in the candidate`, { main_before: currentMain });
    }
    const add = withIndex(["update-index", "--add", "--cacheinfo", `100644,${normSha(blob.stdout)},${file}`]);
    if (add.status !== 0) {
      return refuse(METADATA_PROMOTION_FAILURES.TREE_BUILD_FAILED,
        `could not stage ${file}`, { main_before: currentMain });
    }
    applied.push(file);
  }

  const tree = withIndex(["write-tree"]);
  if (tree.status !== 0) {
    return refuse(METADATA_PROMOTION_FAILURES.TREE_BUILD_FAILED, "could not write the tree",
      { main_before: currentMain });
  }
  const treeSha = normSha(tree.stdout);

  /*
   * IF THE TREE DID NOT MOVE, main ALREADY CARRIES THIS CONTENT. Saying so is
   * not a failure and must not produce an empty commit - and on a retry after a
   * lost result, this is what makes the second attempt settle truthfully
   * instead of committing twice.
   */
  const mainTree = git(["rev-parse", `${approvedBefore}^{tree}`], cwd);
  if (mainTree.status === 0 && normSha(mainTree.stdout) === treeSha) {
    return {
      ok: true,
      already_present: true,
      code: METADATA_PROMOTION_FAILURES.NOTHING_TO_DO,
      detail: `${REPOSITORY_METADATA_TARGET} already carries exactly this content; nothing was committed`,
      main_before: currentMain, main_after: currentMain,
      commit: null, files: applied, product_files_changed: false,
    };
  }

  const message = inputs.message
    || `chore(repo-ops): promote repository-operational metadata\n\n`
      + `${applied.join("\n")}\n\n`
      + `Repository-operational metadata only. No Alloy product code is released by this commit.\n`
      + `candidate: ${n.candidate}\nmain_before: ${currentMain}\n`;
  const commit = git(["commit-tree", treeSha, "-p", approvedBefore, "-m", message], cwd);
  if (commit.status !== 0) {
    return refuse(METADATA_PROMOTION_FAILURES.COMMIT_FAILED, "could not create the metadata commit",
      { main_before: currentMain });
  }
  const newCommit = normSha(commit.stdout);

  /*
   * FAST-FORWARD ONLY, BY CONSTRUCTION. The new commit's parent IS the current
   * remote main, so an ordinary push suffices and no force or lease is used -
   * there is no code path here that can rewrite main's history.
   */
  const push = git(["push", inputs.remote || "origin", `${newCommit}:refs/heads/${REPOSITORY_METADATA_TARGET}`], cwd);
  if (push.status !== 0) {
    return refuse(METADATA_PROMOTION_FAILURES.PUSH_FAILED,
      String(push.stderr || "push failed").split("\n").filter(Boolean)[0] || "push failed",
      {
        main_before: currentMain,
        // The commit exists locally and is named even though main did not move,
        // so a retry can recognise it rather than building a second one.
        built_commit: newCommit,
      });
  }

  return {
    ok: true,
    already_present: false,
    destination: REPOSITORY_METADATA_TARGET,
    main_before: currentMain,
    main_after: newCommit,
    commit: newCommit,
    candidate: n.candidate,
    expected_commits: n.expectedCommits,
    expected_files: n.expectedFiles,
    actual_files: scope.files,
    files: applied,
    product_files_changed: false,
    promotion_class: "repository_metadata",
    at: new Date(nowMs).toISOString(),
  };
}
