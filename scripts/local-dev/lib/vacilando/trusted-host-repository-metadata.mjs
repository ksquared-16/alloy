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
  const repository = String(inputs.repository || "").trim();
  if (!repository) {
    return { ok: false, code: "missing_repository", detail: "repository is required" };
  }

  const target = String(inputs.target_branch || inputs.targetBranch || "").trim();
  if (target !== REPOSITORY_METADATA_TARGET) {
    return {
      ok: false,
      code: "metadata_target_not_allowed",
      detail: `this class writes only ${REPOSITORY_METADATA_TARGET}; ordinary promotion still owns every other branch`,
      target,
    };
  }

  const candidate = normSha(inputs.candidate_sha || inputs.candidateSha || inputs.expected_head_sha);
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
  const short = (c) => normSha(c).slice(0, 12);
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
  const diff = gitImpl(["diff", "--name-only", `${normalized.target}...${normalized.candidate}`], cwd);
  if (diff.status !== 0) {
    return refuse("candidate_diff_unreadable",
      `could not diff ${normalized.target} against the candidate`);
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
    diff_against: normalized.target,
  };
}
