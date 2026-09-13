/**
 * THE PROMOTION TRAIN — a scheduler over the promotion authority that already
 * exists, and emphatically not a second one.
 *
 * WHAT THIS DOES NOT CONTAIN, by deliberate construction: no merge, no push, no
 * `gh`, no branch protection, no required-check logic, no deployment trigger and
 * no credential. It imports `node:child_process` nowhere — every Git read is an
 * injected function, and the set of verbs it is allowed to ask for is an
 * allowlist enforced here, so "the train pushed to staging" is not a thing that
 * can be written in this file by accident. The one staging mutation a train
 * performs is `repository.merge_pull_request`, requested through the same
 * governed action any single candidate would use.
 *
 * ── WHY, MEASURED ──────────────────────────────────────────────────────────
 *
 * origin/staging first-parent history, 7 days to 2026-09-11:
 *
 *   140 merges     20.0/day, 40 on the busiest day
 *   median spacing 20.0 minutes
 *   97 of 139 gaps under 30 minutes; 116 under an hour
 *   54 of 140 (39%) were re-merges of a branch already merged in the window —
 *     runtime/host-lifecycle-v1 four times in 45 minutes,
 *     runtime/failed-run-notification twice in 8.
 *
 * `web/vercel.json` deploys `staging` and `main` only and skips every other ref
 * through `scripts/vercel-ignored-build.sh`. So one staging merge is already
 * exactly one staging deployment: 140 merges were 140 builds, and BATCHING THE
 * MERGES IS THE WHOLE FIX. No second deployment controller is needed and none is
 * built here — the existing ignore step is left untouched.
 *
 * ── THE TRAIN IS EPHEMERAL ─────────────────────────────────────────────────
 *
 * A train is a base SHA, an ordered candidate set and a verdict. It is not a
 * branch anyone works on. The moment it lands or fails it is finished, and its
 * worktree becomes reclaimable — because a long-lived integration branch is just
 * a second staging with worse governance.
 */

import { LIFECYCLE } from "./migration-parity.mjs";

export const TRAIN_SCHEMA = "vacilando.promotion_train.v1";

/** Where a candidate is in its life. Certified is not landed. */
export const CANDIDATE_STATE = Object.freeze({
  DRAFT: "DRAFT",
  READY_FOR_STAGING: "READY_FOR_STAGING",
  IN_TRAIN: "IN_TRAIN",
  LANDED: "LANDED",
  SUPERSEDED: "SUPERSEDED",
  BLOCKED: "BLOCKED",
});

export const TRAIN_STATE = Object.freeze({
  FORMING: "FORMING",
  COMPOSING: "COMPOSING",
  VALIDATING: "VALIDATING",
  READY_TO_LAND: "READY_TO_LAND",
  BLOCKED: "BLOCKED",
  LANDED: "LANDED",
  ABANDONED: "ABANDONED",
});

/**
 * THE GATES A CANDIDATE PASSES TO BECOME READY_FOR_STAGING.
 *
 * Deliberately NOT including the Critical Invariants pack: the train owns that
 * boundary, runs it once over the composed result, and a pack run per candidate
 * would be the redundant validation churn this mission exists to reduce.
 *
 * Every gate is null-hostile. An unmeasured gate blocks exactly like a failed
 * one, which is DevOps 5's law applied one phase earlier.
 */
export const READINESS_GATES = Object.freeze([
  "implementation_complete",
  "affected_domain_validation",
  "clean_candidate_lineage",
  "certification_bound_to_sha",
  "no_unresolved_mutation",
  "lane_ownership_valid",
  "prerequisites_declared",
]);

/**
 * CADENCE, CHOSEN FROM THE MEASUREMENT ABOVE RATHER THAN FROM THE SUGGESTION.
 *
 * The brief proposed ~30 minutes with a ~60 minute ceiling. Simulated against
 * the real 7-day history, timer-based (first arrival opens the window, it
 * departs at start + cadence):
 *
 *   cadence 20m  →  84 trains from 140 merges   -40%   avg 1.67/train
 *   cadence 30m  →  70 trains                   -50%   avg 2.00
 *   cadence 45m  →  55 trains                   -61%   avg 2.55
 *   cadence 60m  →  51 trains                   -64%   avg 2.75
 *   cadence 90m  →  38 trains                   -73%   avg 3.68
 *
 * On the busiest day 30m gives -60% (40 merges → 16 trains) and 45m gives -70%.
 *
 * 30 MINUTES IS ADOPTED. Not because it was suggested — 45m halves the
 * deployments again for 15 more minutes of waiting, and on throughput alone it
 * is the better trade. It is rejected because the cost of a failed train is
 * paid in candidates, and every candidate in a failed train waits for the next
 * one. At 30m the median wait is 30 minutes and the largest observed train is
 * 5 changes; at 90m a single conflict strands 8. V1 buys the first 50–60% of the
 * reduction at the smallest blast radius, and the number is one constant to
 * argue with once there is failure data.
 *
 * THE COUNT TRIGGER IS A CEILING, NOT A DEPARTURE SIGNAL — and the measurement
 * says so: at 30m cadence the largest train in seven days held 5 candidates, so
 * a threshold of 6 fires essentially never. It exists to bound how much one
 * failed train can strand, which is a different job from deciding when to leave.
 */
export const TRAIN_POLICY = Object.freeze({
  cadence_ms: numberFromEnv("ALLOY_TRAIN_CADENCE_MS", 30 * 60 * 1000),
  max_wait_ms: numberFromEnv("ALLOY_TRAIN_MAX_WAIT_MS", 60 * 60 * 1000),
  max_candidates: numberFromEnv("ALLOY_TRAIN_MAX_CANDIDATES", 6),
  base_ref: (process.env.ALLOY_TRAIN_BASE || "origin/staging").trim(),
  invariant_level: 2,
});

function numberFromEnv(name, fallback) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

/**
 * URGENCY IS AN AUTHORITY, NOT A LABEL.
 *
 * The failure mode of every bypass lane is that it becomes the normal lane. A
 * candidate cannot declare itself urgent: the class must be one of these, and
 * the claim must carry an operator-authorized governed approval. Absent that,
 * an urgency claim is recorded and ignored, which is more useful than dropping
 * it — a lane repeatedly claiming urgency it cannot substantiate is a thing
 * somebody should see.
 */
export const URGENT_CLASSES = Object.freeze([
  "security_fix",
  "production_incident",
  "infrastructure_unblock",
  "data_integrity",
]);

export function urgencyAuthorized(candidate = {}) {
  const claim = candidate.urgency || null;
  if (!claim) return { urgent: false, reason: "no_claim" };
  if (!URGENT_CLASSES.includes(claim.class)) {
    return { urgent: false, reason: "class_not_enumerated", claimed: claim.class || null };
  }
  if (!claim.governed_approval_id) {
    return { urgent: false, reason: "self_declared", claimed: claim.class };
  }
  return { urgent: true, reason: "operator_authorized", claimed: claim.class, approval: claim.governed_approval_id };
}

/* ── Git access: injected, allowlisted, read-only ─────────────────────────── */

/**
 * THE ONLY GIT VERBS A TRAIN MAY ASK FOR.
 *
 * `merge` composes; everything else reads. There is no `push`, no `reset`, no
 * `--force`, and no way to add one without changing this list — which is what
 * makes "the train cannot write to staging" a property rather than a promise.
 */
export const ALLOWED_GIT_VERBS = Object.freeze([
  "rev-parse", "merge-base", "ls-tree", "rev-list", "status", "diff", "merge", "fetch", "log",
]);

const FORBIDDEN_GIT_TOKENS = Object.freeze(["push", "--force", "-f", "--hard", "reset", "filter-branch"]);

export function assertGitAllowed(args = []) {
  const verb = String(args[0] || "");
  if (!ALLOWED_GIT_VERBS.includes(verb)) {
    return { ok: false, reason: `git ${verb || "(none)"} is not a verb the train may use` };
  }
  for (const a of args) {
    if (FORBIDDEN_GIT_TOKENS.includes(String(a))) {
      return { ok: false, reason: `git argument ${a} is forbidden in a promotion train` };
    }
  }
  return { ok: true };
}

function guardedGit(gitImpl) {
  return (args, opts) => {
    const allowed = assertGitAllowed(args);
    if (!allowed.ok) throw new Error(allowed.reason);
    return gitImpl(args, opts);
  };
}

/* ── B: READY_FOR_STAGING, on the existing candidate record ───────────────── */

/**
 * Is this candidate certified enough to wait in the queue?
 *
 * THE SHAPE IS `promotionCheckpoint`'s, not a new one. lane-memory already
 * models a candidate as certification plus a lineage of
 * { candidate, pull_request, merge, final_staging } — a record whose `candidate`
 * is set and whose `merge` is null IS "certified but not landed". No new
 * persisted state machine is introduced; the state was always derivable and
 * nobody had named it.
 */
export function evaluateReadiness(candidate = {}) {
  const gates = {};
  const unmeasured = [];
  const failed = [];
  for (const g of READINESS_GATES) {
    const v = candidate.gates?.[g];
    gates[g] = v ?? null;
    if (v === null || v === undefined) unmeasured.push(g);
    else if (v !== true) failed.push(g);
  }
  if (!candidate.sha) failed.push("certification_bound_to_sha");
  // Certification must name the SHA it was run against. Evidence bound to a
  // branch is evidence bound to whatever that branch says tomorrow.
  if (candidate.certification && candidate.certification.candidate
      && candidate.sha && candidate.certification.candidate !== candidate.sha) {
    failed.push("certification_bound_to_sha");
  }
  const state = failed.length || unmeasured.length
    ? CANDIDATE_STATE.BLOCKED
    : CANDIDATE_STATE.READY_FOR_STAGING;
  return {
    candidate: candidate.id || candidate.sha || null,
    sha: candidate.sha || null,
    state,
    ready: state === CANDIDATE_STATE.READY_FOR_STAGING,
    gates,
    failed: [...new Set(failed)],
    unmeasured,
    reason: failed.length ? `gates failed: ${[...new Set(failed)].join(", ")}`
      : unmeasured.length ? `gates unmeasured: ${unmeasured.join(", ")}`
        : "certified and queued for the next train",
  };
}

/* ── C: ordering and ancestry ─────────────────────────────────────────────── */

/**
 * ANCESTRY IS DERIVED, NEVER DECLARED.
 *
 * `supersedes` could be a field somebody maintains. It should not be: Git
 * already knows, exactly, and a stale declaration is worse than none. Verified
 * against the real waiting candidates on 2026-09-12 —
 *
 *   52c95cfcd (DevOps 4) IS an ancestor of 3814d8073 (DevOps 5)
 *   f59c0fca5 (DevOps 3) IS an ancestor of 52c95cfcd
 *   2eb5c3f27 (DevOps 1) IS an ancestor of db0033e12 (DevOps 2)
 *   f1089527b (Governance V1) IS an ancestor of 16601e54f
 *   25c85997d (Thread 5) is an ancestor of nothing
 *
 * — so the seven certified candidates the programme is holding are really THREE
 * train members: 3814d8073, 16601e54f, 25c85997d. Merging an ancestor as
 * separate work would be a no-op commit and a second staging deployment for
 * nothing, which is precisely the churn being measured.
 *
 * Only `conflicts_with` is persisted, because it records a human judgement Git
 * cannot make.
 */
export function deriveAncestry(candidates = [], { gitImpl, cwd } = {}) {
  const git = guardedGit(gitImpl);
  const included = new Map();
  for (const a of candidates) {
    for (const b of candidates) {
      if (a === b || !a.sha || !b.sha) continue;
      let isAncestor = false;
      try {
        const r = git(["merge-base", "--is-ancestor", a.sha, b.sha], { cwd });
        isAncestor = r?.status === 0;
      } catch { isAncestor = false; }
      if (isAncestor) {
        const prev = included.get(a.sha);
        // Superseded by the newest thing that carries it.
        if (!prev || prev.sha === b.sha) included.set(a.sha, { sha: b.sha, id: b.id || b.sha });
        else included.set(a.sha, { sha: b.sha, id: b.id || b.sha });
      }
    }
  }
  return included;
}

/**
 * The ordered, deduplicated candidate set, plus what was dropped and why.
 *
 * Declared `depends_on` that is NOT satisfied blocks the dependent — it does not
 * quietly reorder around it. A dependency naming something not in the queue is
 * a candidate that cannot be composed, and saying so is the point.
 */
export function orderTrainCandidates(candidates = [], { gitImpl, cwd } = {}) {
  const ready = candidates.filter((c) => c.sha);
  const superseded = deriveAncestry(ready, { gitImpl, cwd });

  const included = [];
  const dropped = [];
  const blocked = [];

  for (const c of ready) {
    const sup = superseded.get(c.sha);
    if (sup) {
      dropped.push({ candidate: c.id || c.sha, sha: c.sha, reason: "included_in", superseded_by: sup.sha, superseded_by_id: sup.id });
      continue;
    }
    included.push(c);
  }

  const presentShas = new Set(included.map((c) => c.sha));
  const carried = new Set();
  for (const [sha, sup] of superseded) { if (presentShas.has(sup.sha)) carried.add(sha); }

  const survivors = [];
  for (const c of included) {
    const missing = (c.depends_on || []).filter((d) => !presentShas.has(d) && !carried.has(d));
    if (missing.length) {
      blocked.push({ candidate: c.id || c.sha, sha: c.sha, reason: "missing_dependency", missing });
      continue;
    }
    survivors.push(c);
  }

  const survivorShas = new Set(survivors.map((c) => c.sha));
  const conflicts = [];
  for (const c of survivors) {
    for (const other of c.conflicts_with || []) {
      if (survivorShas.has(other)) conflicts.push({ candidate: c.id || c.sha, sha: c.sha, conflicts_with: other });
    }
  }

  // Oldest first: a candidate certified earlier has been waiting longer, and
  // composing in certification order keeps the reconciliation each one faces as
  // close as possible to the base it was certified against.
  const ordered = survivors.slice().sort((a, b) => {
    const at = Date.parse(a.certified_at || "") || 0;
    const bt = Date.parse(b.certified_at || "") || 0;
    if (at !== bt) return at - bt;
    return String(a.sha).localeCompare(String(b.sha));
  });

  return { ordered, dropped, blocked, conflicts, ok: !blocked.length && !conflicts.length };
}

/* ── D: formation ─────────────────────────────────────────────────────────── */

/** Should a train leave now, and why. */
export function formTrain({
  queue = [],
  policy = TRAIN_POLICY,
  windowOpenedAtMs = null,
  nowMs = Date.now(),
} = {}) {
  const ready = queue.filter((c) => c.state === CANDIDATE_STATE.READY_FOR_STAGING || c.ready === true);
  if (!ready.length) {
    return { depart: false, reason: "empty_queue", candidates: [], next_trigger: null };
  }
  const urgent = ready.map((c) => ({ c, u: urgencyAuthorized(c) })).filter((x) => x.u.urgent);
  if (urgent.length) {
    return {
      depart: true, reason: "urgent_authorized",
      candidates: ready, urgency: urgent.map((x) => ({ candidate: x.c.id || x.c.sha, ...x.u })),
    };
  }
  const opened = windowOpenedAtMs ?? Math.min(...ready.map((c) => Date.parse(c.ready_at || "") || nowMs));
  const waited = nowMs - opened;
  if (ready.length >= policy.max_candidates) {
    return { depart: true, reason: "count_ceiling", candidates: ready, waited_ms: waited };
  }
  if (waited >= policy.cadence_ms) {
    return { depart: true, reason: "cadence_reached", candidates: ready, waited_ms: waited };
  }
  if (waited >= policy.max_wait_ms) {
    return { depart: true, reason: "max_wait_reached", candidates: ready, waited_ms: waited };
  }
  return {
    depart: false, reason: "waiting_for_cadence",
    candidates: ready, waited_ms: waited,
    next_trigger: new Date(opened + policy.cadence_ms).toISOString(),
  };
}

/* ── F: composition against current staging ───────────────────────────────── */

/**
 * COMPOSE BY MERGING, NOT BY REBASING — and the distinction is not stylistic.
 *
 * DevOps 2 reconciles a LANE by rebasing it onto staging, which is right: a lane
 * wants a clean linear history and its commits are still being written. A TRAIN
 * must do the opposite, because a rebase rewrites every candidate SHA, and the
 * candidate SHA is the thing its certification evidence is bound to. A train
 * that rebased would arrive at staging carrying proof about commits that no
 * longer exist.
 *
 * So: snapshot the base, merge each candidate in order, stop at the first
 * conflict. Each original SHA stays an ancestor of the train head, verifiably,
 * which is what lets `landed` mean anything afterwards.
 */
export function composeTrain({
  candidates = [],
  baseRef = TRAIN_POLICY.base_ref,
  cwd,
  gitImpl,
  nowMs = Date.now(),
} = {}) {
  const git = guardedGit(gitImpl);
  const out = (args) => {
    const r = git(args, { cwd });
    return r?.status === 0 ? String(r.stdout || "").trim() : null;
  };

  const baseSha = out(["rev-parse", baseRef]);
  if (!baseSha) {
    return { ok: false, state: TRAIN_STATE.BLOCKED, reason: "base_unresolvable", base_ref: baseRef };
  }

  const composed = [];
  for (const c of candidates) {
    // A dirty candidate is refused before it is touched: composing uncommitted
    // work would land something nobody certified.
    const dirty = out(["status", "--porcelain"]);
    if (dirty) {
      return {
        ok: false, state: TRAIN_STATE.BLOCKED, reason: "dirty_worktree",
        base_sha: baseSha, base_ref: baseRef, composed,
        detail: "the integration worktree has uncommitted changes", failed_candidate: c.id || c.sha,
      };
    }
    const r = git(["merge", "--no-ff", "--no-edit", c.sha], { cwd });
    if (r?.status !== 0) {
      return {
        ok: false, state: TRAIN_STATE.BLOCKED, reason: "merge_conflict",
        base_sha: baseSha, base_ref: baseRef, composed,
        failed_candidate: c.id || c.sha, failed_sha: c.sha,
        detail: String(r?.stderr || r?.stdout || "").split("\n").filter(Boolean).slice(-1)[0] || "conflict",
      };
    }
    composed.push({ candidate: c.id || c.sha, sha: c.sha });
  }

  const trainSha = out(["rev-parse", "HEAD"]);
  return {
    ok: true,
    state: TRAIN_STATE.COMPOSING,
    base_ref: baseRef,
    base_sha: baseSha,
    train_sha: trainSha,
    composed,
    composed_at: new Date(nowMs).toISOString(),
  };
}

/** Has the base moved since this train was composed? */
export function baseMoved({ trainBaseSha, baseRef = TRAIN_POLICY.base_ref, cwd, gitImpl } = {}) {
  const git = guardedGit(gitImpl);
  const r = git(["rev-parse", baseRef], { cwd });
  const now = r?.status === 0 ? String(r.stdout || "").trim() : null;
  if (!now) return { measured: false, moved: null, reason: "base_unresolvable" };
  return { measured: true, moved: now !== trainBaseSha, base_sha_at_compose: trainBaseSha, base_sha_now: now };
}

/* ── The three-phase migration ledger a train must keep separate ──────────── */

/**
 * PROMOTED, PROPOSED, AND POST-MERGE ARE THREE DIFFERENT SETS.
 *
 * Flattening them into one "expected state" is exactly the defect that made
 * every migration-bearing candidate unpromotable. The train keeps them apart in
 * its own record so that the mistake cannot be reintroduced by someone reading
 * the train's evidence instead of the gate's.
 */
export function trainMigrationLedger({ promoted = [], candidates = [], gitImpl, cwd } = {}) {
  const git = guardedGit(gitImpl);
  const at = (ref) => {
    const r = git(["ls-tree", "-r", "--name-only", ref, "supabase/migrations"], { cwd });
    if (r?.status !== 0) return null;
    const v = [];
    for (const line of String(r.stdout || "").split("\n")) {
      const m = /(\d{14})_[^/]*\.sql$/.exec(line.trim());
      if (m) v.push(m[1]);
    }
    return [...new Set(v)].sort();
  };
  const promotedSet = Array.isArray(promoted) && promoted.length ? promoted : at(TRAIN_POLICY.base_ref);
  const floor = new Set(promotedSet || []);
  const additions = [];
  for (const c of candidates) {
    const set = at(c.sha);
    if (!set) { additions.push({ candidate: c.id || c.sha, sha: c.sha, migrations: null, unreadable: true }); continue; }
    additions.push({ candidate: c.id || c.sha, sha: c.sha, migrations: set.filter((v) => !floor.has(v)) });
  }
  const candidateOnly = [...new Set(additions.flatMap((a) => a.migrations || []))].sort();
  return {
    promoted_obligations: {
      phase: LIFECYCLE.PROMOTED_STAGING,
      migrations: promotedSet,
      count: Array.isArray(promotedSet) ? promotedSet.length : null,
      due: "must already be present on the deployed primary before this train may land",
    },
    candidate_additions: {
      phase: LIFECYCLE.CANDIDATE,
      migrations: candidateOnly,
      by_candidate: additions,
      due: "not owed to any database yet; these are proposals",
    },
    post_merge_obligations: {
      phase: LIFECYCLE.POST_MERGE,
      migrations: candidateOnly,
      due: "become due on the deployed primary after this train lands, before the next train that depends on parity",
    },
  };
}

/* ── G/H: the validation boundary the train owns ──────────────────────────── */

/**
 * Can the Critical Invariants pack actually run here?
 *
 * DevOps 5 measured four invariants going UNMEASURED in a bare promotion
 * worktree because `web/node_modules` is absent, and UNMEASURED blocks. The
 * train owns closing that — once, for the composed result, rather than once per
 * candidate. The provisioner is `alloy-worktree-provision`, which already exists
 * and is guarded (one concurrency slot, memory-pressure refusal, and a refusal
 * to accept another worktree's symlinked node_modules). Nothing here installs
 * anything: it reports what is missing and names the canonical command.
 */
export function invariantEnvironmentReadiness({ worktreePath, existsImpl } = {}) {
  const has = (p) => { try { return existsImpl(p); } catch { return false; } };
  const nodeModules = `${worktreePath}/web/node_modules`;
  const ready = has(nodeModules);
  return {
    ready,
    worktree: worktreePath,
    missing: ready ? [] : ["web/node_modules"],
    provisioner: "alloy-worktree-provision",
    remedy: ready ? null : `alloy-worktree-provision <name> — the train worktree has no web dependencies, so vitest-backed invariants would be UNMEASURED and UNMEASURED blocks`,
  };
}

/**
 * The train's verdict on its own composed result.
 *
 * DevOps 5's law is applied verbatim and NOT reinterpreted: FAIL blocks,
 * UNMEASURED blocks, and there is no override parameter — a control asserts this
 * function accepts none. Aggregate changed-domain validation is additional
 * breadth over the composed diff; it answers the question no single candidate
 * can, which is whether A and B are fine apart and wrong together.
 */
export function trainIntegrationDecision({ invariants = null, aggregate = null, parity = null } = {}) {
  const blockers = [];
  if (!invariants) blockers.push({ gate: "critical_invariants", outcome: "UNMEASURED", detail: "the pack did not run" });
  else if (invariants.blocks_integration) {
    blockers.push({ gate: "critical_invariants", outcome: invariants.verdict, detail: invariants.counts ? `failed_new ${invariants.counts.failed_new}, unmeasured ${invariants.counts.unmeasured}` : null });
  }
  if (!aggregate) blockers.push({ gate: "aggregate_domain_validation", outcome: "UNMEASURED", detail: "changed-domain validation did not run" });
  else if (aggregate.ok !== true) {
    blockers.push({ gate: "aggregate_domain_validation", outcome: "FAIL", detail: (aggregate.failures || []).join(", ") || "aggregate validation failed" });
  }
  if (parity && parity.status !== "ok") {
    blockers.push({ gate: "hosted_migration_parity", outcome: parity.status.toUpperCase(), detail: parity.reason || null });
  }
  return {
    state: blockers.length ? TRAIN_STATE.BLOCKED : TRAIN_STATE.READY_TO_LAND,
    may_land: blockers.length === 0,
    blockers,
  };
}

/* ── I: the one staging mutation ──────────────────────────────────────────── */

/**
 * The governed action a landing train REQUESTS. It does not merge.
 *
 * This returns a request payload for `repository.merge_pull_request` — the same
 * action, the same validation, the same approval and the same allowlist a single
 * candidate would face. A train gets no privileged path to staging; it only
 * arranges for there to be one merge instead of six.
 */
export const STAGING_MERGE_ACTION = "repository.merge_pull_request";
export const TRAIN_PR_ACTION = "promotion.open_pr";

export function stagingMergeRequest(train = {}, { repository = "ksquared-16/alloy" } = {}) {
  if (!train.may_land) {
    return { ok: false, reason: "train_not_ready", blockers: train.blockers || [] };
  }
  if (!train.pull_request_number || !train.train_sha) {
    return { ok: false, reason: "train_has_no_pull_request", detail: "a train lands through a PR like any other candidate" };
  }
  return {
    ok: true,
    action_key: STAGING_MERGE_ACTION,
    inputs: {
      repository,
      pull_request_number: train.pull_request_number,
      expected_head_sha: train.train_sha,
      target_branch: "staging",
      merge_method: "merge",
    },
    mutations: 1,
    note: "one staging merge for the whole train; the existing gates all still apply to it",
  };
}

/* ── K: failure law ───────────────────────────────────────────────────────── */

/**
 * A FAILED TRAIN DESTROYS NOTHING.
 *
 * Candidates go back to READY_FOR_STAGING exactly as they were — they were
 * certified before the train and the train failing says nothing about them
 * individually. Only the candidate the failure can be attributed to is held
 * out, and only from the NEXT train, so a conflict does not silently re-form the
 * same broken set forever.
 *
 * No bisecting. No history rewriting. V1 names the conflict and lets a human or
 * the owning lane decide, because automatic conflict resolution is how somebody
 * else's work becomes a surprise.
 */
export function failTrain(train = {}, { reason = null } = {}) {
  const offending = train.failed_candidate || null;
  return {
    state: TRAIN_STATE.ABANDONED,
    reason: reason || train.reason || "train_failed",
    offending_candidate: offending,
    released: (train.composed || []).map((c) => c.candidate),
    candidates_returned_to: CANDIDATE_STATE.READY_FOR_STAGING,
    hold_from_next_train: offending ? [offending] : [],
    staging_mutated: false,
    detail: train.detail || null,
  };
}

/* ── L: supersession, for DevOps 3 ────────────────────────────────────────── */

/**
 * THE SIGNAL DEVOPS 3 DELIBERATELY REFUSED TO GUESS.
 *
 * `classifyWorktreeLifecycle` already accepts `supersededBy` and will classify a
 * promotion worktree SUPERSEDED once told — it just would not infer it from Git,
 * because "an ancestor of something newer" is true of far too many branches to
 * be a licence to delete. The train is the one place that knows authoritatively:
 * it is the thing that decided candidate X was carried by candidate Y, and the
 * thing that landed Y.
 *
 * Returns the map keyed by worktree name that `inventoryWorktreeLifecycle` takes
 * unchanged. No supersession state is added to the worktree subsystem.
 */
export function supersessionRecords(landedTrain = {}, { dropped = [] } = {}) {
  const records = [];
  for (const d of dropped) {
    records.push({
      candidate: d.candidate,
      sha: d.sha,
      superseded_by: d.superseded_by,
      basis: "ancestor_of_included_candidate",
      train: landedTrain.train_id || null,
      at: landedTrain.landed_at || null,
    });
  }
  for (const c of landedTrain.composed || []) {
    records.push({
      candidate: c.candidate,
      sha: c.sha,
      superseded_by: landedTrain.merge_sha || landedTrain.train_sha || null,
      basis: "landed_on_staging",
      train: landedTrain.train_id || null,
      at: landedTrain.landed_at || null,
    });
  }
  return records;
}

/** The `supersededBy` map DevOps 3's inventory consumes, keyed by worktree name. */
export function supersessionIndexForWorktrees(records = [], { worktreeByCandidate = {} } = {}) {
  const index = {};
  for (const r of records) {
    const name = worktreeByCandidate[r.candidate] || worktreeByCandidate[r.sha] || null;
    if (!name) continue;
    index[name] = r.superseded_by;
  }
  return index;
}

/** What a landed train records, and what it tells the rest of the system. */
export function landTrain(train = {}, { mergeSha = null, nowMs = Date.now(), dropped = [] } = {}) {
  const landed = {
    ...train,
    state: TRAIN_STATE.LANDED,
    merge_sha: mergeSha,
    landed_at: new Date(nowMs).toISOString(),
    staging_mutations: 1,
    deployments_triggered: 1,
  };
  return {
    train: landed,
    landed_candidates: (train.composed || []).map((c) => ({ candidate: c.candidate, sha: c.sha, state: CANDIDATE_STATE.LANDED })),
    supersession: supersessionRecords(landed, { dropped }),
    worktree_reclaimable: true,
  };
}

/* ── M: operator projection ───────────────────────────────────────────────── */

/** The compact view, for the surfaces that already exist. */
export function trainProjection({ queue = [], formation = null, lastTrain = null, policy = TRAIN_POLICY } = {}) {
  const ready = queue.filter((c) => c.ready || c.state === CANDIDATE_STATE.READY_FOR_STAGING);
  const blocked = queue.filter((c) => c.state === CANDIDATE_STATE.BLOCKED);
  return {
    ready_for_staging: ready.length,
    next_train: formation?.depart ? "departing" : (formation?.next_trigger || null),
    trigger: formation?.reason || null,
    candidates: ready.map((c) => ({ candidate: c.id || c.sha, sha: (c.sha || "").slice(0, 9), waiting_since: c.ready_at || null })),
    blocked: blocked.map((c) => ({ candidate: c.id || c.sha, reason: c.reason || null })),
    last_train: lastTrain ? {
      candidates: (lastTrain.composed || []).length,
      validation: lastTrain.state,
      base_sha: (lastTrain.base_sha || "").slice(0, 9),
      train_sha: (lastTrain.train_sha || "").slice(0, 9),
      staging_sha: (lastTrain.merge_sha || "").slice(0, 9) || null,
      landed_at: lastTrain.landed_at || null,
    } : null,
    policy: { cadence_ms: policy.cadence_ms, max_wait_ms: policy.max_wait_ms, max_candidates: policy.max_candidates },
  };
}

/* ── DevOps 7 seam ────────────────────────────────────────────────────────── */

/**
 * DRAIN BEFORE MAINTENANCE.
 *
 * Weekly maintenance must not begin while a train is mid-composition: its
 * worktree looks abandoned and its candidates look unlanded, and reclaiming
 * either would strand certified work. This answers "is it safe to start" and
 * nothing else — it stops no train and starts no maintenance.
 */
export function drainStateForMaintenance({ trains = [], queue = [] } = {}) {
  const active = trains.filter((t) => t.state && ![TRAIN_STATE.LANDED, TRAIN_STATE.ABANDONED].includes(t.state));
  const waiting = queue.filter((c) => c.ready || c.state === CANDIDATE_STATE.READY_FOR_STAGING);
  return {
    drained: active.length === 0,
    active_trains: active.map((t) => ({ train: t.train_id || null, state: t.state })),
    queued_candidates: waiting.length,
    safe_to_begin_maintenance: active.length === 0,
    reason: active.length
      ? `${active.length} train(s) still in flight; reclaiming worktrees now would strand certified candidates`
      : waiting.length
        ? `no train in flight; ${waiting.length} candidate(s) wait and will form a train after maintenance`
        : "nothing in flight and nothing queued",
  };
}
