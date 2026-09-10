/**
 * THE PRODUCTION MIGRATION APPLY OWNER.
 *
 * ── WHY THIS EXISTS AS A SEPARATE ACTION ──
 *
 * The parity gate can now say, correctly, that the deployed primary is BEHIND
 * the revision being promoted. Until this module there was no governed way to
 * answer that: `database.apply_migration` refuses production by design, so the
 * only recorded owner of a production migration was step 7 of an ARCHIVED
 * release process — a human, a laptop and a CLI. A gate that detects a problem
 * nobody is authorized to fix does not close a loop; it just stops the line.
 *
 * The fix is NOT to let the staging executor accept production. That action's
 * refusal is its most important property, an operator reading an approval card
 * must be able to tell the two apart, and an approval minted for a staging
 * apply must never be spendable on the production database. So this is a
 * distinct action key with distinct authority, composing the shared artifact
 * discipline rather than copying it.
 *
 * PRODUCTION CLASSIFICATION IS NOT RELAXED HERE. `alloy_deployed_primary`
 * remains in BLOCKED_ENVIRONMENTS and OPERATOR_ONLY_ENVIRONMENTS. What changes
 * is that Vacilando gains a governed capability to operate it, under explicit
 * Director authorization, with no path by which that authorization becomes
 * automatic.
 */
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  assertNoArbitrarySql,
  assertShaReachableFromStaging,
  validateMigrationRequestCore,
} from "./trusted-host-migrate.mjs";

/** The action key. Deliberately NOT `database.apply_migration`. */
export const PRODUCTION_APPLY_ACTION_KEY = "database.apply_promoted_migration";

/**
 * The registered production-class targets, by exact name.
 *
 * An allowlist of exact names rather than a pattern or a class flag: "looks
 * like production" is the kind of inference that eventually points a mutation
 * at the wrong database. If Alloy later needs a hosted staging database it gets
 * its OWN explicit target rather than a reinterpretation of this one.
 */
export const PRODUCTION_APPLY_TARGETS = Object.freeze(["alloy_deployed_primary"]);

/** Authority: never delegable, never satisfied by a policy gate. */
export const PRODUCTION_APPLY_AUTHORITY = Object.freeze({
  action_key: PRODUCTION_APPLY_ACTION_KEY,
  operator_only: true,
  director_approval_required: true,
  delegable: false,
  consequence_class: "production_database_mutation",
});

const norm = (v) => String(v ?? "").trim().toLowerCase();

/**
 * The governed-action store path, resolved LOCALLY.
 *
 * Deliberately not imported from `governed-action-request.mjs`: that module
 * imports the action registry, which imports this file, and closing that cycle
 * makes `ACTION_TYPES` unreachable before initialisation — a TDZ error that
 * surfaces as an unrelated promotion test failing to load. `trusted-host-merge`
 * resolves the same path the same way, for the same reason.
 */
function governedActionRequestsPath() {
  const root = process.env.ALLOY_RUNTIME_ROOT?.trim()
    || join(homedir(), ".local", "state", "alloy-dev");
  return join(root, "vacilando", "governed-actions", "requests.json");
}

/** Governed-action records, or an empty list when the store cannot be read. */
function readGovernedActionRecords() {
  try {
    const store = governedActionRequestsPath();
    if (!existsSync(store)) return [];
    const parsed = JSON.parse(readFileSync(store, "utf8"));
    return Array.isArray(parsed) ? parsed : (parsed?.requests || []);
  } catch {
    // Unreadable proof is NO proof, never assumed proof.
    return [];
  }
}

/**
 * ── THE PRE-MERGE CANDIDATE PATH, AND WHY IT HAD TO EXIST ──
 *
 * The promotion state machine had an unsatisfiable cycle, and Thread 5 was the
 * first migration-bearing promotion to drive the whole loop and find it:
 *
 *   the MERGE gate refuses to promote a candidate until hosted carries the
 *   schema that candidate requires — measured against the CANDIDATE head;
 *
 *   this action refused to give hosted that schema until the candidate had
 *   merged to staging.
 *
 * Neither control is wrong. Together they could not both be satisfied, so any
 * PR carrying a migration was unpromotable. Thread 4 promoted cleanly only
 * because it added no migrations.
 *
 * The repair is NOT to let production accept `refs/remotes/origin/agent/**`.
 * Branch membership is not authority: a branch is mutable, shared, and says
 * nothing about whether anyone approved promoting what is on it. What authorizes
 * a pre-merge production migration is a GOVERNED PROMOTION CANDIDATE — an
 * approved merge of an exact head that the parity gate itself refused for
 * exactly this reason.
 *
 * That evidence already exists and is written by the Gateway, not by the lane
 * asking: the refused `repository.merge_pull_request` record names the PR, the
 * exact head, the approval, and the refusal reason. So no second promotion
 * registry is created here; the proof is read from where governance already
 * recorded it.
 *
 * The chain a caller must satisfy is therefore:
 *
 *   an approved governed merge exists      (somebody with authority said promote this)
 *   for THIS repository                    (not another project's candidate)
 *   naming THIS exact 40-character head    (not a branch, not its latest tip)
 *   which the parity gate refused          (there is a real gap to close)
 *   because hosted was BEHIND              (and that is the gap, not some other failure)
 *   recently                               (an old refusal is not standing authority)
 *
 * A branch that advances past the approved head loses this authority
 * immediately, because the new head is a different SHA and no governed merge
 * names it.
 */
export const PROMOTION_CANDIDATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** The refusal that means "hosted needs this candidate's schema". */
const PARITY_REFUSAL = "hosted_migration_behind";

const full40 = (v) => String(v ?? "").trim().toLowerCase();

/**
 * Is this exact SHA a governed promotion candidate awaiting hosted parity?
 *
 * Pure: it is handed the governed-action records rather than reading them, so a
 * test can state the world precisely and this cannot pass by finding something
 * incidental on the host.
 */
export function governedPromotionCandidateFor(sha, {
  requests = [],
  repository = null,
  nowMs = Date.now(),
  maxAgeMs = PROMOTION_CANDIDATE_MAX_AGE_MS,
} = {}) {
  const wanted = full40(sha);
  if (!/^[a-f0-9]{40}$/.test(wanted)) {
    // Deliberately strict where the rest of the module accepts a short sha:
    // authority attaches to an immutable object, and a 7-character prefix is a
    // lookup convenience, not an identity.
    return { ok: false, code: "candidate_sha_not_exact", detail: "A pre-merge production migration must name the full 40-character candidate head." };
  }

  let sawSha = false;
  for (const r of Array.isArray(requests) ? requests : []) {
    if (r?.action_key !== "repository.merge_pull_request") continue;
    const inputs = r.inputs || {};
    if (full40(inputs.expectedHeadSha || inputs.expected_head_sha) !== wanted) continue;

    // Repository first, and BEFORE this counts as "a record about our sha":
    // another project's candidate is not weak authority here, it is no
    // authority here, and saying so keeps the two refusals distinguishable.
    const repo = String(inputs.repository || "").trim();
    if (repository && repo && repo !== String(repository).trim()) continue;
    sawSha = true;

    // The promotion must have been AUTHORIZED. A merge request that was never
    // approved proves only that somebody asked.
    const decision = String(r.policy_decision || "").trim().toLowerCase();
    if (!decision || !/approved/.test(decision)) continue;

    // And it must have been refused for THIS reason. A merge that failed on a
    // malformed request, or one still pending, establishes no hosted gap.
    const why = `${r.failure_code || ""} ${r.failure_reason || ""}`.toLowerCase();
    if (!why.includes(PARITY_REFUSAL)) continue;

    const at = Date.parse(r.updated_at || r.created_at || "");
    if (Number.isFinite(at) && maxAgeMs > 0 && nowMs - at > maxAgeMs) {
      return {
        ok: false,
        code: "candidate_authority_stale",
        detail: `The governed promotion candidate for ${wanted.slice(0, 12)} was refused more than ${Math.round(maxAgeMs / 3600000)}h ago and must be re-established.`,
      };
    }

    return {
      ok: true,
      candidate: {
        requestId: r.request_id || null,
        repository: repo || null,
        pullRequestNumber: inputs.pullRequestNumber ?? inputs.pull_request_number ?? null,
        headSha: wanted,
        refusedAt: r.updated_at || r.created_at || null,
      },
    };
  }

  return {
    ok: false,
    code: sawSha ? "candidate_authority_insufficient" : "no_governed_promotion_candidate",
    detail: sawSha
      ? `A governed merge names ${wanted.slice(0, 12)}, but it was not an approved promotion refused for ${PARITY_REFUSAL}.`
      : `No approved governed promotion names ${wanted.slice(0, 12)} as its exact head.`,
  };
}

/** Migration versions present in a tree, by exact ref. */
function migrationVersionsAt(ref, { cwd, git = null } = {}) {
  try {
    const run = git
      ? git(["ls-tree", "-r", "--name-only", ref, "supabase/migrations"], { cwd })
      : { status: 0, stdout: execFileSync("git", ["ls-tree", "-r", "--name-only", ref, "supabase/migrations"], { cwd, encoding: "utf8" }) };
    if (run.status !== 0 && run.status !== undefined) return null;
    const out = String(run.stdout || "");
    const versions = [];
    for (const line of out.split("\n")) {
      const m = /(\d{14})_[^/]*\.sql$/.exec(line.trim());
      if (m) versions.push(m[1]);
    }
    return versions;
  } catch {
    return null;
  }
}

/**
 * The migrations this candidate legitimately introduces.
 *
 * Bounds a pre-merge apply to the candidate's OWN delta over the promoted floor,
 * so this path can never be used to replay an already-promoted migration or to
 * reach a file that arrived from some other lineage.
 */
export function candidateMigrationDelta(expectedSha, { cwd, git = null, stagingRef = "origin/staging" } = {}) {
  const candidate = migrationVersionsAt(expectedSha, { cwd, git });
  const floor = migrationVersionsAt(stagingRef, { cwd, git });
  if (!candidate || !floor) return null;
  const promoted = new Set(floor);
  return candidate.filter((v) => !promoted.has(v));
}

/**
 * Inputs for a production apply.
 *
 * Everything the staging path proves about the ARTIFACT is proven here by the
 * same code: a real commit, reachable from promoted staging, canonical
 * migration paths, no duplicate versions, content read from the git object
 * store. What this adds is the target rule — exactly one registered production
 * database, named in full.
 */
export function validateProductionMigrationInputs(inputs = {}, {
  repoRoot = null,
  git = null,
  fetchIfMissing = true,
  stagingRef = "origin/staging",
  /** Governed-action records. Injected by tests; read from the store otherwise. */
  promotionRequests = null,
  nowMs = Date.now(),
} = {}) {
  const noSql = assertNoArbitrarySql(inputs);
  if (!noSql.ok) return noSql;

  const target = norm(inputs.target || inputs.environment || "");
  if (!target) {
    return { ok: false, code: "missing_target", detail: "target is required and must name a registered production database." };
  }
  if (!PRODUCTION_APPLY_TARGETS.includes(target)) {
    // A NON-PRODUCTION TARGET IS REFUSED HERE TOO, in the other direction.
    // If this action accepted staging it would become a way to apply a staging
    // migration under production authority, which is the same boundary failure
    // wearing the opposite coat.
    return {
      ok: false,
      code: "target_not_registered_production",
      detail: `${PRODUCTION_APPLY_ACTION_KEY} targets only: ${PRODUCTION_APPLY_TARGETS.join(", ")}`,
    };
  }

  /*
   * The records governance already wrote. Read lazily and only to answer this
   * one question, so a host with no store simply has no candidate authority
   * rather than failing the ordinary staging-ancestry path.
   */
  const records = Array.isArray(promotionRequests) ? promotionRequests : readGovernedActionRecords();
  const candidateProof = ({ fullSha }) => governedPromotionCandidateFor(fullSha, {
    requests: records,
    repository: inputs.repository || inputs.repo || null,
    nowMs,
  });

  const core = validateMigrationRequestCore(inputs, {
    environment: target,
    actionType: PRODUCTION_APPLY_ACTION_KEY,
    repoRoot,
    // `git` omitted when not injected, so the core keeps its own default
    // facade rather than receiving an explicit null.
    ...(git ? { git } : {}),
    fetchIfMissing,
    stagingRef,
    candidateProof,
  });
  if (!core.ok) return core;

  /*
   * BOUND A PRE-MERGE APPLY TO THE CANDIDATE'S OWN DELTA.
   *
   * Only when staging ancestry does NOT hold — an already-promoted migration is
   * legitimately inside the floor, and applying that bound to the ordinary path
   * would refuse every normal production apply.
   */
  const cwd = core.normalized.gitCwd || repoRoot || inputs.worktreePath || inputs.worktree_path || process.cwd();
  const ancestry = assertShaReachableFromStaging(core.normalized.expectedSha, {
    ...(git ? { git } : {}),
    cwd,
    stagingRef,
    fetchIfMissing: false,
  });
  let candidate = null;
  if (!ancestry.ok) {
    /*
     * The REQUEST must name the full head, not merely resolve to it. A prefix
     * is a lookup convenience; production migration authority attaches to an
     * immutable object, and an approval card that shows twelve characters is an
     * approval somebody has to take on trust.
     */
    const requested = String(inputs.expectedSha || inputs.expected_sha || "").trim().toLowerCase();
    if (!/^[a-f0-9]{40}$/.test(requested)) {
      return {
        ok: false,
        code: "candidate_sha_not_exact",
        detail: "A pre-merge production migration must name the full 40-character candidate head.",
      };
    }
    const proof = candidateProof({ fullSha: core.normalized.expectedSha });
    if (!proof.ok) return { ok: false, code: proof.code, detail: proof.detail };
    candidate = proof.candidate;

    const delta = candidateMigrationDelta(core.normalized.expectedSha, { cwd, ...(git ? { git } : {}), stagingRef });
    if (!delta) {
      return { ok: false, code: "candidate_delta_unreadable", detail: "Could not read the candidate's migration delta over the promoted floor. UNKNOWN refuses." };
    }
    const outside = core.normalized.migrations.map((m) => String(m.version)).filter((v) => !delta.includes(v));
    if (outside.length) {
      return {
        ok: false,
        code: "migration_outside_candidate_delta",
        detail: `A pre-merge apply may only carry the candidate's own new migrations; ${outside.join(", ")} is not in its delta over ${stagingRef}.`,
      };
    }
  }

  return {
    ok: true,
    normalized: {
      ...core.normalized,
      target,
      candidate,
      sourceRelation: ancestry.ok ? "staging_ancestry" : "governed_promotion_candidate",
      dedupeKey: `apply-promoted:${target}:${core.normalized.expectedSha.slice(0, 12)}:${
        core.normalized.migrations.map((m) => m.version).join(",")
      }`,
    },
  };
}

/**
 * THE SEVEN PROOFS REQUIRED BEFORE MUTATING A PRODUCTION DATABASE.
 *
 * Every one of them refuses on UNKNOWN. "I could not establish it" is not
 * evidence of safety — that is the fail-open this whole effort exists to close,
 * and it is most tempting precisely here, where refusing means stopping a
 * promotion someone is waiting on.
 */
export function assertProductionApplyPreconditions({
  normalized = null,
  parity = null,
  approval = null,
  registeredTarget = null,
  executorRuntime = null,
} = {}) {
  const refuse = (code, detail) => ({ ok: false, code, detail });

  if (!normalized || normalized.actionType !== PRODUCTION_APPLY_ACTION_KEY) {
    return refuse("unvalidated_request", "Production apply requires a validated request of its own action type.");
  }
  const requested = normalized.migrations.map((m) => m.version);
  if (!requested.length) return refuse("no_migrations_requested", "A production apply must name the migrations it applies.");

  // 1 — the migrations exist in the exact promoted revision. Proven by
  // validateMigrationRequestCore, which resolves each entry out of the git
  // object store at expectedSha and refuses if it is not there. Asserted, not
  // assumed, because "the validator probably did that" is how a control ends up
  // never running.
  for (const m of normalized.migrations) {
    if (!m.fileSha) return refuse("migration_not_in_promoted_revision", `No committed artifact for ${m.version} at ${normalized.expectedSha}.`);
  }

  // 2 — the target is exactly the registered deployed primary.
  const target = norm(normalized.target);
  if (!PRODUCTION_APPLY_TARGETS.includes(target)) {
    return refuse("target_not_registered_production", `${target || "(none)"} is not a registered production target.`);
  }
  if (registeredTarget && norm(registeredTarget.name || registeredTarget) !== target) {
    return refuse("target_identity_mismatch", "Resolved database identity does not match the requested target.");
  }

  // 3 — parity currently reports BEHIND, by exactly these migrations.
  //
  // A production mutation is authorized to CLOSE a measured gap. If parity is
  // ok there is nothing to apply, and applying anyway would be a mutation with
  // no governing measurement behind it.
  if (!parity) return refuse("parity_unmeasured", "Hosted parity was not measured. Refusing to mutate production on an unmeasured gap.");
  if (parity.status === "unknown") return refuse("parity_unknown", parity.reason || "Hosted parity is UNKNOWN. UNKNOWN refuses.");
  if (parity.status === "ok") return refuse("parity_not_behind", "Hosted parity already reports PASS; there is no gap for this mutation to close.");
  if (parity.status !== "blocked") return refuse("parity_unknown", `Unrecognised parity status ${parity.status}.`);

  const missing = (parity.missing || []).map(String);
  if (!missing.length) return refuse("parity_gap_unidentified", "Parity reports BEHIND without naming the missing identities.");
  const notMissing = requested.filter((v) => !missing.includes(v));
  if (notMissing.length) {
    return refuse("migration_not_in_measured_gap", `Requested ${notMissing.join(", ")} which the hosted measurement does not report missing.`);
  }

  // 4 — no unexpected identity discrepancy making the situation ambiguous.
  //
  // Hosted rows the repository does not know about mean the two are not simply
  // "behind"; they have diverged, and applying more migrations into a database
  // whose history is not understood is how a recoverable gap becomes an
  // unrecoverable one.
  if ((parity.unexpected || []).length) {
    return refuse("hosted_identity_ambiguous", `Hosted database reports ${parity.unexpected.length} identity(ies) absent from the promoted revision.`);
  }

  // 5 — explicit Director approval, bound to THIS content.
  if (norm(approval?.decision) !== "approved") {
    return refuse("director_approval_required", "A production database mutation requires an explicit Director approval.");
  }
  if (norm(approval?.decision_actor) === "policy" || approval?.delegated === true) {
    return refuse("delegated_approval_rejected", "Production mutation cannot be satisfied by a delegated or policy approval.");
  }
  if (approval.content_fingerprint && normalized.contentFingerprint
      && approval.content_fingerprint !== normalized.contentFingerprint) {
    return refuse("approval_content_drift", "The approval was given for different content.");
  }
  const approvedVersions = (approval.approved_versions || []).map(String);
  if (approvedVersions.length) {
    const unapproved = requested.filter((v) => !approvedVersions.includes(v));
    if (unapproved.length) return refuse("migration_not_approved", `Not covered by the approval: ${unapproved.join(", ")}`);
  }

  // 6 — the executor is running with sanctioned production credentials.
  if (!executorRuntime || executorRuntime.sanctioned !== true) {
    return refuse("executor_not_sanctioned", "Production apply must run on the sanctioned trusted-host runtime.");
  }
  if (executorRuntime.target && norm(executorRuntime.target) !== target) {
    return refuse("executor_target_mismatch", "Executor credentials do not resolve to the requested target.");
  }

  // 7 — deterministic order. Applying migrations out of order is a schema
  // corruption that reports success.
  const ordered = [...requested].sort();
  if (ordered.join(",") !== requested.join(",")) {
    return refuse("nondeterministic_migration_order", "Migrations must be applied in ascending version order.");
  }

  return { ok: true, target, versions: requested, order: ordered };
}

/**
 * POST-APPLY: A SUCCESSFUL EXECUTOR EXIT IS NOT A PASS.
 *
 * The executor knows it ran a file. It does not know the deployed database now
 * satisfies the revision — only a governed census can establish that. So the
 * promotion is released by the RE-MEASUREMENT, never by the apply.
 *
 * This is structural rather than a rule to remember: parity reads the proven
 * head from census records, and applying writes no census, so an apply alone
 * cannot move the proven head. There is no path by which "we applied it"
 * becomes "it is proven".
 */
export function evaluateProductionApplyOutcome({
  applyResult = null,
  censusResult = null,
  parityAfter = null,
  requestedVersions = [],
} = {}) {
  const state = (s, extra = {}) => ({ ...extra, state: s, promotion_released: s === "promotion_released" });

  if (!applyResult) return state("blocked_apply_not_run", { detail: "No apply result to evaluate." });
  if (applyResult.ok !== true) {
    return state("blocked_apply_failed", {
      detail: applyResult.detail || "Production migration apply failed.",
      failure: classifyApplyFailure({ applyResult }),
    });
  }

  // Apply succeeded. The promotion is STILL blocked until re-measured.
  if (!censusResult) {
    return state("blocked_recensus_required", {
      detail: "Migration applied. A governed census must re-measure hosted identities before promotion resumes.",
      required_action: "database.read_census",
    });
  }
  if (censusResult.ok !== true) {
    return state("blocked_recensus_failed", {
      detail: censusResult.detail || "Post-apply census did not complete. Parity is UNKNOWN and UNKNOWN blocks.",
      required_action: "database.read_census",
    });
  }
  if (!parityAfter || parityAfter.status === "unknown") {
    return state("blocked_parity_unknown", {
      detail: parityAfter?.reason || "Post-apply parity is UNKNOWN. UNKNOWN blocks.",
    });
  }

  // The migration ran and the census completed, but the identity the migration
  // was supposed to create is still not there. That is not a retry case — it is
  // a contradiction between two measurements, and it needs a person.
  if (parityAfter.status === "blocked") {
    const stillMissing = (parityAfter.missing || []).map(String).filter((v) => requestedVersions.includes(v));
    if (stillMissing.length) {
      return state("attention_ledger_identity_absent", {
        attention: true,
        stuck: true,
        detail: `Applied ${stillMissing.join(", ")} but the hosted ledger still does not report those identities.`,
        evidence: { requested: requestedVersions, still_missing: stillMissing },
      });
    }
    return state("blocked_further_migrations_required", {
      detail: `Hosted database is still behind: ${(parityAfter.missing || []).join(", ")}`,
    });
  }

  if (parityAfter.status === "ok") {
    return state("promotion_released", {
      detail: "Hosted identity parity re-measured PASS. Promotion may resume.",
      proven_head: parityAfter.measuredHead || parityAfter.proven_head || null,
    });
  }
  return state("blocked_parity_unknown", { detail: `Unrecognised parity status ${parityAfter.status}.` });
}

/**
 * AMBIGUOUS EXECUTION MUST NOT BE REPLAYED.
 *
 * A migration that may have partially executed is the one case where the
 * helpful reflex — try again — is the dangerous one. A non-idempotent migration
 * replayed over its own partial effect can fail in a way that is much harder to
 * unwind than the original stall. So ambiguity escalates with its evidence and
 * stops; only a failure proven to have had NO effect is safe to retry.
 */
export function classifyApplyFailure({ applyResult = null } = {}) {
  const results = applyResult?.results || [];
  const failed = results.find((r) => r.ok === false) || null;
  const code = failed?.code || applyResult?.code || "apply_failed";

  // Failures that happen BEFORE any statement reaches the database. These are
  // the only ones a retry cannot make worse.
  const PRE_EXECUTION = new Set([
    "arbitrary_sql_rejected", "production_database_rejected", "target_not_registered_production",
    "migration_not_in_promoted_revision", "artifact_hash_mismatch", "apply_runner_missing",
    "source_sha_unavailable", "migration_not_in_measured_gap", "director_approval_required",
    "executor_not_sanctioned", "nondeterministic_migration_order", "preflight_failed",
    // A refusal to COMPOSE the database runners happens before any connection
    // is opened. Leaving these out of the set would have them classified as
    // ambiguous — reported as "the statement may have run" for a path that
    // provably never reached a database, which is the opposite of the truth and
    // would escalate a safe refusal as a suspected partial migration.
    "production_runners_not_composed", "production_runners_partially_injected",
    "production_runners_refused_in_test_context",
  ]);
  if (PRE_EXECUTION.has(code)) {
    return {
      classification: "no_effect",
      safe_to_retry: true,
      auto_retry: false,
      code,
      detail: failed?.detail || applyResult?.detail || "Refused before execution; the database was not touched.",
    };
  }

  // The ledger disagreeing with the schema is a KNOWN-inconsistent state, not
  // an unknown one — and it is still not a retry.
  if (code === "ledger_mismatch") {
    return {
      classification: "inconsistent_known",
      safe_to_retry: false,
      auto_retry: false,
      code,
      detail: failed?.detail || "Ledger reports applied while schema evidence disagrees.",
      escalate: true,
    };
  }

  // Everything else: the statement may have run. Includes network loss after
  // mutation and a census that cannot be reached to find out.
  return {
    classification: "ambiguous",
    safe_to_retry: false,
    auto_retry: false,
    code,
    detail: failed?.detail || applyResult?.detail || "Execution outcome is not established.",
    escalate: true,
    required_next: "governed census to establish actual hosted state before any further action",
  };
}

/**
 * What Vacilando tells the Director when a promotion is blocked on schema.
 *
 * Named files, not a count and not a status word: the whole point of the
 * measurement is that the answer is specific.
 */
export function describeMissingMigrations(parity = null) {
  const missing = (parity?.missing || []).map(String);
  if (!missing.length) return null;
  const files = missing.map((v) => (parity.paths?.[v] ? parity.paths[v] : `${v}_*.sql`));
  return {
    headline: `Hosted database is missing:\n${files.join("\n")}`,
    versions: missing,
    files,
    action_required: PRODUCTION_APPLY_ACTION_KEY,
  };
}
