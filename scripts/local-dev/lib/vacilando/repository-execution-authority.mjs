/**
 * A PRIVILEGED ACTION MAY NOT EXECUTE BYTES OTHER THAN THE ONES IT CLAIMS.
 *
 * MEASURED, twice in one afternoon. `environment.execute_registered_reconciliation`
 * runs repository content from the canonical checkout — `ALLOY_CANONICAL_ROOT`,
 * with `cwd` at `<root>/web`. During the Financials certification that checkout
 * sat 35 commits behind promoted staging, holding the PRE-REPAIR fixture and,
 * at that moment, no runner file at all. It was fast-forwarded, a second
 * promotion landed, and within the hour it was 2 behind again.
 *
 * Nothing was misconfigured. `toolkit-convergence.mjs` DELIBERATELY never
 * touches that working tree — "the canonical checkout is shared, and a safety
 * gate has no business rearranging it" — so "staging == installed == running"
 * can be true while the file a governed action executes is months old.
 * Convergence is about the toolkit; repository content had no gate at all.
 *
 * REFUSE, DO NOT RECONCILE. The tempting fix is to fast-forward the checkout
 * inside the action. That couples two mutations: the approved action, and a
 * silent change to the environment it was approved against. A refusal that
 * names both SHAs leaves the operator with a decision; a silent fast-forward
 * leaves them with a different execution than the one they authorised.
 *
 * The identity is compared to what the REQUEST was decided on, never to
 * whatever `origin/staging` happens to be at execution time — otherwise an
 * approval granted against X silently executes Y.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { ALLOY_REPOSITORY_ID, promotionPolicyFor } from "./repository-registry.mjs";
import { join } from "node:path";

/** What a registered action does with repository content. */
export const REPO_CONTENT_CLASS = Object.freeze({
  CONTENT_EXECUTING: "CONTENT_EXECUTING",
  METADATA_ONLY: "METADATA_ONLY",
  NO_REPO_CONTENT: "NO_REPO_CONTENT",
});

/**
 * The inventory, with the distinction that matters spelled out.
 *
 * Referencing the canonical root is NOT the same as executing its content.
 * `database.read_census` resolves the root to find a query artifact and to load
 * a credential, but the bytes it runs are SQL it hashed and pinned; a stale
 * checkout cannot change what it executes. The reconciliation spawns npm inside
 * that tree, and a stale checkout changes everything about what runs.
 */
export const ACTION_REPO_CONTENT = Object.freeze({
  "environment.execute_registered_reconciliation": {
    class: "CONTENT_EXECUTING",
    module: "trusted-host-reconciliation.mjs",
    cwd: "<canonical>/web",
    consumes: "package.json script, the runner .mjs, and the frozen fixture it reads",
    mutates: true,
    why: "spawns npm inside the checkout — the bytes that run ARE the checkout",
  },
  "vacilando.apply_reconciliation_plan": {
    class: "CONTENT_EXECUTING", module: "trusted-host-reconciliation.mjs", cwd: "<canonical>/web",
    consumes: "a registered runner script", mutates: true, why: "same spawn path",
  },
  "database.apply_migration": {
    class: "CONTENT_EXECUTING", module: "trusted-host-apply-migration.sh", cwd: "<canonical>",
    consumes: "migration SQL files read from the checkout", mutates: true,
    why: "the SQL applied is whatever the checkout holds at that path",
  },
  "database.apply_promoted_migration": {
    class: "CONTENT_EXECUTING", module: "trusted-host-migrate.mjs", cwd: "<canonical>",
    consumes: "promoted migration files", mutates: true, why: "as apply_migration",
  },
  "database.repair_migration_ledger": {
    class: "CONTENT_EXECUTING", module: "trusted-host-migrate.mjs", cwd: "<canonical>",
    consumes: "ledger repair definitions from the checkout", mutates: true, why: "as apply_migration",
  },
  "database.read_census": {
    class: "METADATA_ONLY", module: "trusted-host-run-sql.sh", cwd: "<canonical>",
    consumes: "a query artifact, hashed and compared before execution", mutates: false,
    why: "resolves the root, but executes SQL pinned by hash — a stale checkout cannot change what runs",
  },
  "host.install_toolkit": {
    class: "METADATA_ONLY", module: "toolkit-convergence.mjs", cwd: "<canonical>", consumes: "git refs only",
    mutates: false, why: "reads refs and never the working tree, deliberately",
  },
  "repository.promote_metadata": {
    class: "METADATA_ONLY", module: "trusted-host-repository-metadata.mjs", cwd: "a linked worktree",
    consumes: "declared metadata files", mutates: true,
    why: "operates on a worktree it creates at a declared SHA, not on the shared checkout",
  },
  "repository.push": { class: "NO_REPO_CONTENT", why: "acts on refs from the lane's own worktree" },
  "promotion.open_pr": { class: "NO_REPO_CONTENT", why: "GitHub API" },
  "repository.merge_pull_request": { class: "NO_REPO_CONTENT", why: "GitHub API" },
  "repository.close_pull_request": { class: "NO_REPO_CONTENT", why: "GitHub API" },
  "repository.delete_remote_branch": { class: "NO_REPO_CONTENT", why: "GitHub API" },
  "environment.restore_qa_session": { class: "NO_REPO_CONTENT", why: "browser session state" },
  "environment.restore_deployed_qa_session": { class: "NO_REPO_CONTENT", why: "browser session state" },
  "environment.provision_qa_identity": { class: "NO_REPO_CONTENT", why: "database identity" },
  "environment.assign_qa_identity_access": { class: "NO_REPO_CONTENT", why: "database identity" },
  "platform.register_developer_application": { class: "NO_REPO_CONTENT", why: "database row" },
  "capacity.set_provider_ceiling": { class: "NO_REPO_CONTENT", why: "control-plane setting" },
  "vacilando.retire_worktree": { class: "NO_REPO_CONTENT", why: "acts on a worktree's own directory, not on canonical content" },
  "lane.dispatch_measurement_instruction": { class: "NO_REPO_CONTENT", why: "delivers an instruction" },
});

export function repoContentClassFor(actionType) {
  const row = ACTION_REPO_CONTENT[String(actionType)];
  // Unknown is treated as content-executing: the cautious direction is to
  // demand an identity, not to skip the check for something nobody classified.
  if (!row) return { class: REPO_CONTENT_CLASS.CONTENT_EXECUTING, why: "unclassified action; identity is required rather than assumed", declared: false };
  return { ...row, declared: true };
}

export function isContentExecuting(actionType) {
  return repoContentClassFor(actionType).class === REPO_CONTENT_CLASS.CONTENT_EXECUTING;
}

const git = (root, args) => {
  try { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim(); }
  catch { return null; }
};

/**
 * What the checkout actually is, right now.
 *
 * Reported on success AND on refusal. A refusal that does not say which bytes
 * it found is a refusal nobody can act on.
 */
export function repositoryProvenance(repoRoot, { workingSubdir = "web" } = {}) {
  const root = String(repoRoot || "");
  return {
    repo_root: root || null,
    repo_head: existsSync(join(root, ".git")) ? git(root, ["rev-parse", "HEAD"]) : null,
    repo_branch: existsSync(join(root, ".git")) ? git(root, ["rev-parse", "--abbrev-ref", "HEAD"]) : null,
    working_directory: root ? join(root, workingSubdir) : null,
  };
}

/**
 * May this action execute the content it is pointed at?
 *
 * @returns {{ok:true, provenance:object} | {ok:false, code:string, detail:string, provenance:object, recovery:string}}
 */
export function assertRepositoryIdentity({ actionType, provenance, expectedRepoHead = null } = {}) {
  const cls = repoContentClassFor(actionType);
  const prov = { ...provenance, expected_repo_head: expectedRepoHead || null };

  if (cls.class !== REPO_CONTENT_CLASS.CONTENT_EXECUTING) {
    return { ok: true, provenance: prov, skipped: `not content-executing (${cls.class})` };
  }
  if (!expectedRepoHead) {
    /*
     * No declared authority is not a licence to run anything. It is reported
     * rather than refused, because every existing content-executing flow
     * predates this contract and refusing them all at once would be an outage,
     * not a safety improvement. The provenance is still carried, so a run
     * against unknown bytes is visible instead of invisible.
     */
    return { ok: true, provenance: prov, unenforced: "no expected_repo_head was declared for this request" };
  }
  if (!prov.repo_head) {
    return {
      ok: false, code: "repository_identity_unreadable",
      detail: `cannot read HEAD at ${prov.repo_root}`,
      provenance: prov,
      recovery: "confirm the canonical checkout exists and is a git repository",
    };
  }
  if (prov.repo_head !== expectedRepoHead) {
    return {
      ok: false,
      code: "repository_identity_mismatch",
      detail: `expected ${expectedRepoHead} at ${prov.repo_root}, found ${prov.repo_head} on ${prov.repo_branch}`,
      provenance: prov,
      // Named, not performed. Reconciling the checkout inside this action would
      // change the environment the action was approved against.
      recovery: `advance ${prov.repo_root} to ${expectedRepoHead} (fast-forward only, after checking for local-only commits), then file the action again`,
    };
  }
  return { ok: true, provenance: prov };
}

/**
 * The promoted ref this host treats as release truth.
 *
 * Alloy's, and it now says so. As a bare module constant every repository
 * inherited it; `promotedRefFor` resolves it per project, and a repository whose
 * profile declares no promotion gets NULL rather than Alloy's trunk.
 */
export const PROMOTED_REF = promotionPolicyFor({ profile: "alloy", repository_id: ALLOY_REPOSITORY_ID }).promoted_ref;

export function promotedRefFor(repositoryRecord) {
  return promotionPolicyFor(repositoryRecord || { profile: "alloy", repository_id: ALLOY_REPOSITORY_ID }).promoted_ref;
}

/**
 * The repository SHA a request is being DECIDED AGAINST, read once at filing.
 *
 * A REF READ, NOT A FETCH AND NOT A WORKING-TREE READ. Filing must not reach the
 * network, and it must not ask the canonical checkout what it currently holds —
 * that checkout is the thing being guarded, so believing it would make the guard
 * agree with whatever it found.
 *
 * If nobody has fetched recently this is what the host BELIEVED promoted truth
 * was at filing time, which is the honest answer to "what was this decided
 * against". A later divergence surfaces at execution as a refusal rather than as
 * a silent retarget.
 */
export function resolveFilingRepositoryAuthority({ canonicalRoot, ref = PROMOTED_REF, readRef = null } = {}) {
  const read = readRef || ((root, r) => git(root, ["rev-parse", "--verify", `${r}^{commit}`]));
  const sha = read(canonicalRoot, ref);
  if (!sha || !/^[0-9a-f]{40}$/i.test(String(sha).trim())) {
    return { ok: false, code: "repository_authority_unresolvable", detail: `cannot resolve ${ref} in ${canonicalRoot}` };
  }
  return { ok: true, expected_repo_head: String(sha).trim(), ref };
}

/**
 * Stamp the authority onto a request at the filing boundary.
 *
 * Content-executing actions FAIL CLOSED when no authority can be resolved:
 * "we could not tell which bytes this was decided against" is not a licence to
 * run whatever is on disk. Metadata-only and no-repo actions are left entirely
 * alone — a requirement invented for them would be noise that teaches people to
 * work around the field.
 *
 * A value already present is never overwritten. That is what makes the
 * stability contract hold: the SHA travels with the request, and nothing later
 * re-reads a live ref to replace it.
 */
export function stampRepositoryAuthority({ actionKey, inputs = {}, canonicalRoot, readRef = null } = {}) {
  if (!isContentExecuting(actionKey)) return { ok: true, inputs, skipped: "not content-executing" };
  const existing = inputs.expected_repo_head || inputs.expectedRepoHead;
  if (existing) return { ok: true, inputs: { ...inputs, expected_repo_head: existing }, carried: true };
  const resolved = resolveFilingRepositoryAuthority({ canonicalRoot, readRef });
  if (!resolved.ok) {
    return {
      ok: false,
      code: "repository_authority_unresolvable",
      detail: `${actionKey} executes repository content and no promoted authority could be resolved: ${resolved.detail}`,
    };
  }
  return { ok: true, inputs: { ...inputs, expected_repo_head: resolved.expected_repo_head }, stamped: true };
}
