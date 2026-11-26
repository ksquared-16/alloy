/**
 * REPOSITORY OPERATIONS ARE NOT A PRODUCT RELEASE.
 *
 * Alloy's branch model is staging -> certified -> main -> production. main is
 * released truth and is EXPECTED to lag staging heavily while Alloy is still
 * pre-production; that is doctrine, not branch-health debt, and nothing here
 * exists to "catch main up".
 *
 * But GitHub resolves scheduled workflows and workflow_dispatch availability
 * from the DEFAULT branch only. So a workflow whose whole job is to watch the
 * development trunk cannot run at all unless its DEFINITION reaches main -
 * while the code it tests must stay on staging. Those are two different things
 * moving at two different speeds, and the ordinary promotion path correctly
 * refuses to move either of them to main.
 *
 * This is the narrow exception, and it is deliberately hostile to scope creep:
 *
 *   - one destination: main, and only through this path
 *   - one allowed path prefix to begin with: .github/workflows/
 *   - candidate ownership is mandatory, exactly as for a product promotion
 *   - a candidate containing ANY non-allowlisted file is refused whole, never
 *     trimmed down to the acceptable subset
 *
 * The last rule matters most. Silently dropping product files out of a mixed
 * commit would let a product change reach main as a side effect of a workflow
 * edit, which is precisely the boundary the branch model exists to hold.
 */

/**
 * Paths whose FUNCTION depends on being present on the GitHub default branch.
 *
 * Start at one. Everything else under .github was checked and does not need
 * default-branch presence to work: the other nine Alloy workflows are all
 * pull_request/push triggered and resolve from the PR head, so promoting them
 * would activate nothing and risk something.
 */
export const REPOSITORY_METADATA_ALLOWED_PREFIXES = Object.freeze([
  ".github/workflows/",
]);

/** The only branch this class may ever write. */
export const REPOSITORY_METADATA_TARGET = "main";

const SHA_RE = /^[a-f0-9]{7,40}$/;
const normSha = (v) => String(v || "").trim().toLowerCase();
const shortSha = (v) => normSha(v).slice(0, 12);

export function isRepositoryMetadataPath(path) {
  const p = String(path || "").trim();
  if (!p || p.startsWith("/") || p.includes("..")) return false;
  return REPOSITORY_METADATA_ALLOWED_PREFIXES.some((prefix) => p.startsWith(prefix));
}

/**
 * Validate a repository-metadata promotion request.
 *
 * Fails closed on every axis: destination, declaration, and path scope.
 */
export function validateRepositoryMetadataInputs(inputs = {}) {
  /*
   * READS ITS OWN OUTPUT.
   *
   * This validator runs TWICE on the live path: once at request time, and again
   * inside the executor at mutation time - and the second time its input is the
   * `normalized` object the first run produced, because that object IS the
   * action's stored inputs. So every read below accepts the normalized spelling
   * (`target`, `candidate`) alongside the request spelling (`target_branch`,
   * `candidate_sha`). Without that, revalidation refuses its own well-formed
   * output: measured as `metadata_target_not_allowed` on a candidate that had
   * just validated cleanly.
   *
   * Idempotency is not a nicety here. Revalidating at mutation time is the whole
   * safety argument for this class - an approval can sit for minutes while the
   * candidate, the declaration and main all move. A revalidation that cannot
   * parse what it is given does not fail open, but it does make the one path
   * that writes main unreachable, which is how a safety check becomes an outage.
   */
  const repository = String(inputs.repository || "").trim();
  if (!repository) {
    return { ok: false, code: "missing_repository", detail: "repository is required" };
  }

  const target = String(inputs.target_branch || inputs.targetBranch || inputs.target || "").trim();
  if (target !== REPOSITORY_METADATA_TARGET) {
    return {
      ok: false,
      code: "metadata_target_not_allowed",
      detail: `this class writes only ${REPOSITORY_METADATA_TARGET}; ordinary promotion still owns every other branch`,
      target,
    };
  }

  const candidate = normSha(inputs.candidate_sha || inputs.candidateSha || inputs.expected_head_sha || inputs.candidate);
  if (!SHA_RE.test(candidate)) {
    return { ok: false, code: "missing_candidate_sha", detail: "an exact candidate SHA is required; HEAD is not a candidate" };
  }

  /*
   * OWNERSHIP IS NOT RELAXED BECAUSE "IT IS ONLY WORKFLOWS".
   * A workflow is executable repository automation. If anything, it deserves
   * the stricter reading, so this reuses the same declaration contract that
   * promotion-mode pushes now require.
   */
  const baseRef = String(inputs.base_ref || inputs.baseRef || "").trim();
  const rawCommits = inputs.expected_commits ?? inputs.expectedCommits;
  const commitsDeclared = Array.isArray(rawCommits);
  const rawFiles = inputs.expected_files ?? inputs.expectedFiles;
  const filesDeclared = Array.isArray(rawFiles);

  const missing = [];
  if (!baseRef) missing.push("base_ref");
  if (!commitsDeclared) missing.push("expected_commits");
  if (!filesDeclared) missing.push("expected_files");
  if (missing.length) {
    return {
      ok: false,
      code: "candidate_scope_undeclared",
      detail: `a repository-metadata candidate must declare what it owns; missing ${missing.join(", ")}`,
      missing,
      required: ["base_ref", "expected_commits", "expected_files"],
    };
  }

  const expectedCommits = rawCommits.map(normSha).filter((c) => SHA_RE.test(c));
  if (!expectedCommits.length) {
    return {
      ok: false,
      code: "candidate_declares_no_commits",
      detail: "a metadata promotion must carry at least one commit; an empty declaration promotes nothing",
    };
  }

  const expectedFiles = rawFiles.map((f) => String(f || "").trim()).filter(Boolean);
  if (!expectedFiles.length) {
    return { ok: false, code: "candidate_declares_no_files", detail: "a metadata promotion must name the files it carries" };
  }

  /*
   * PATH SCOPE, CHECKED ON THE DECLARATION ITSELF. The diff is checked too, in
   * evaluateRepositoryMetadataCandidate - both, because a declaration that
   * lies and a diff that drifts are different failures.
   */
  const offending = expectedFiles.filter((f) => !isRepositoryMetadataPath(f));
  if (offending.length) {
    return {
      ok: false,
      code: "non_metadata_path_declared",
      detail: `only ${REPOSITORY_METADATA_ALLOWED_PREFIXES.join(", ")} may reach ${REPOSITORY_METADATA_TARGET} through this class`,
      offending: offending.slice(0, 20),
      allowed_prefixes: [...REPOSITORY_METADATA_ALLOWED_PREFIXES],
    };
  }

  return {
    ok: true,
    normalized: {
      repository,
      target,
      candidate,
      baseRef,
      expectedCommits,
      expectedFiles,
      reason: String(inputs.reason || "").trim() || null,
      // An explicitly verified destination wins over any ref lookup: the
      // executor has already compare-and-swapped against the real remote head.
      destinationRef: String(inputs.destination_ref || inputs.destinationRef || inputs.main_before || inputs.mainBefore || "").trim() || null,
      remote: String(inputs.remote || "origin").trim(),
      /*
       * CARRIED BECAUSE THE EXECUTOR READS THEM FROM HERE.
       *
       * `normalized` IS the action's inputs - requestTrustedHostAction stores
       * `validated.normalized` and the executor later reads `action.inputs`.
       * So a field this object does not carry does not exist by the time the
       * promotion runs, no matter how carefully the filer supplied it.
       *
       * Measured: the first live promotion request refused with
       * `worktree_path_missing` having been filed WITH a worktree path, and
       * would have refused next on `main_before is required` having been filed
       * WITH main_before. Both were dropped right here. The executor's own
       * eighteen cases all passed because every one of them called
       * promoteRepositoryMetadata with RAW inputs - the seam between the
       * validator and the executor was the one place nothing looked.
       *
       * This is the defect class this action was written to police, found in
       * the action itself: produced correctly, dropped at an intermediate
       * boundary, consumed as though it never existed.
       */
      worktreePath: String(inputs.worktree_path || inputs.worktreePath || "").trim() || null,
      mainBefore: String(inputs.main_before || inputs.mainBefore || "").trim() || null,
      /*
       * A PRIVILEGED WRITE MUST SAY WHAT IT ACTED ON.
       *
       * Dedupe reads `normalized.dedupeKey || normalized.queryHash || null`, and
       * an action declaring neither is keyless: `undefined === undefined`, so any
       * completed action of this type could satisfy a later request in the same
       * scope. That is how eleven worktree retirements returned a twelfth's
       * result. A write to the release branch is the last place to inherit it,
       * so the key names both halves of the decision - which candidate, onto
       * which main. Two different promotions can never collide; the same
       * promotion re-requested is the same promotion.
       */
      dedupeKey: `repository_promote_metadata:${target}:${shortSha(candidate)}:${shortSha(
        inputs.main_before || inputs.mainBefore || "",
      )}`,
    },
  };
}

/**
 * Compare the declaration against what the candidate actually contains.
 *
 * `gitImpl(args, cwd)` returns { status, stdout, stderr } like spawnSync.
 */
export function evaluateRepositoryMetadataCandidate(normalized, { gitImpl, cwd } = {}) {
  const refuse = (code, detail, extra = {}) => ({ ok: false, code, detail, ...extra });

  const range = gitImpl(["rev-list", `${normalized.baseRef}..${normalized.candidate}`], cwd);
  if (range.status !== 0) {
    return refuse("candidate_base_unresolvable",
      `the declared baseline ${normalized.baseRef} could not be resolved`,
      { base: normalized.baseRef });
  }
  const short = shortSha;
  const actualCommits = String(range.stdout || "").split("\n").map(normSha).filter(Boolean);
  const want = new Set(normalized.expectedCommits.map(short));
  const have = new Set(actualCommits.map(short));

  const foreign = actualCommits.filter((c) => !want.has(short(c)));
  if (foreign.length) {
    return refuse("candidate_contains_foreign_commits",
      `${foreign.length} commit(s) in the candidate were not declared`,
      { foreign: foreign.slice(0, 10) });
  }
  const absent = normalized.expectedCommits.filter((c) => !have.has(short(c)));
  if (absent.length) {
    return refuse("declared_commit_absent",
      `${absent.length} declared commit(s) are not in the candidate`,
      { missing: absent.slice(0, 10) });
  }

  /*
   * THE DIFF IS TAKEN AGAINST THE DESTINATION, not against the candidate's own
   * baseline. What matters is what would land on main, and main and staging
   * have diverged by thousands of commits - a file unchanged since the branch
   * point is still a change TO MAIN.
   */
  /*
   * DIFF AGAINST THE DESTINATION THAT WILL ACTUALLY BE WRITTEN, NOT A LOCAL REF
   * THAT MERELY SHARES ITS NAME.
   *
   * This diffed the bare ref `main`, and a worktree can carry a stale local
   * branch called main that is nothing like the remote. Measured on this host:
   * local main was 5111b9c02019 while origin/main was 80ff5bf591a8, and a
   * candidate whose only change is one workflow file was refused as containing
   * seven product files.
   *
   * The false refusal is the harmless direction. The dangerous one is the
   * inverse: if the local ref already contained product changes that the remote
   * does not, those files would diff away to nothing and a candidate carrying
   * product code would be ACCEPTED. A safety check comparing against the wrong
   * tree is worse than no check, because it reads as a check.
   *
   * So the destination is resolved explicitly - the caller's verified
   * destination SHA if it supplied one, otherwise the remote-tracking ref - and
   * an unresolvable destination refuses rather than falling back to a name.
   */
  const destinationRef = String(normalized.destinationRef || "").trim()
    || `refs/remotes/${normalized.remote || "origin"}/${normalized.target}`;
  const resolved = gitImpl(["rev-parse", "--verify", `${destinationRef}^{commit}`], cwd);
  if (resolved.status !== 0) {
    return refuse("candidate_destination_unresolvable",
      `could not resolve the destination ${destinationRef}; refusing rather than diffing against a local ref that merely shares the name`,
      { destination_ref: destinationRef });
  }
  const destinationSha = normSha(resolved.stdout);

  const diff = gitImpl(["diff", "--name-only", `${destinationSha}...${normalized.candidate}`], cwd);
  if (diff.status !== 0) {
    return refuse("candidate_diff_unreadable",
      `could not diff ${destinationRef} against the candidate`, { destination_ref: destinationRef });
  }
  const changed = String(diff.stdout || "").split("\n").map((l) => l.trim()).filter(Boolean);

  const productFiles = changed.filter((f) => !isRepositoryMetadataPath(f));
  if (productFiles.length) {
    /*
     * REFUSED WHOLE. The tempting behaviour here is to promote the workflow
     * files and skip the rest; that would move product code to main as a side
     * effect of a workflow edit, which is the exact boundary this class exists
     * to hold. The candidate has to BE metadata-only.
     */
    return refuse("candidate_contains_product_files",
      `${productFiles.length} non-metadata file(s) would reach ${normalized.target}; rebuild the candidate with metadata only`,
      { offending: productFiles.slice(0, 20), allowed_prefixes: [...REPOSITORY_METADATA_ALLOWED_PREFIXES] });
  }

  const declared = new Set(normalized.expectedFiles);
  const undeclaredChanges = changed.filter((f) => !declared.has(f));
  if (undeclaredChanges.length) {
    return refuse("candidate_file_set_mismatch",
      `${undeclaredChanges.length} changed file(s) were not declared`,
      { unexpected: undeclaredChanges.slice(0, 20) });
  }
  const missingChanges = normalized.expectedFiles.filter((f) => !changed.includes(f));
  if (missingChanges.length) {
    return refuse("declared_file_absent",
      `${missingChanges.length} declared file(s) are not changed by this candidate`,
      { missing: missingChanges.slice(0, 20) });
  }

  return {
    ok: true,
    target: normalized.target,
    candidate: normalized.candidate,
    commits: actualCommits,
    files: changed,
    diff_against: destinationSha,
    destination_ref: destinationRef,
  };
}
