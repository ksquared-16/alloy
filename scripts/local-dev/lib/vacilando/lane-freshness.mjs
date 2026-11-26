/**
 * Lane freshness — can this lane safely start new implementation against
 * current staging?
 *
 * WHAT THIS IS NOT. It is not a lifecycle, a registry, a poller or a second
 * recovery system. Freshness is a DECISION, derived on demand from facts other
 * modules already own:
 *
 *   lane identity and bootstrap contract → lane-bootstrap.mjs (DevOps 1)
 *   worktree, branch, slot binding       → lane-worktree-lifecycle.mjs
 *   git truth and divergence             → worktree-retirement-observe.mjs
 *   shared branch / other references     → branch-reference.mjs
 *   run and activity history             → execution-run.mjs
 *   per-slot QA capability               → browser-auth.mjs
 *
 * Nothing here persists a freshness state, because a persisted verdict is a
 * verdict that can be wrong: staging moves, worktrees change, and a cached
 * "current" is worse than no answer. Everything is recomputed.
 *
 * THE FAILURE THIS EXISTS TO PREVENT, measured rather than imagined. A
 * Governance implementation lane was found to be 654 commits behind staging —
 * and it was found AT PROMOTION TIME, after the work was done. Re-measured on
 * 2026-09-12 the live fleet still carried lanes 207, 390, 719 and 915 commits
 * behind. That should be a fact a lane knows before it starts, not a discovery
 * it makes at the end.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not rebase everything on sight. Most
 * of the fleet is fine, and a policy that reconciles on every resume would be
 * both expensive and dangerous. It also never deletes a worktree: DevOps 3 owns
 * that, and this only supplies the ownership facts it will need.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

import { getDurableLane, listDurableLanes } from "./development-lane.mjs";
import { resolveLaneBootstrap, laneBootstrapIsStale } from "./lane-bootstrap.mjs";
import { measureWorktreeGit } from "./worktree-retirement-observe.mjs";
import { qaCapabilityForSlot } from "./browser-auth.mjs";

/**
 * THE VERDICTS. Derived, never stored.
 *
 * Two of them mean "go", one means "go, after this", and the rest name a
 * specific reason not to touch the worktree. Naming the reason is the whole
 * design: a generic "needs approval" would be a prompt that approval cannot make
 * safe, because no operator decision makes rebasing a dirty worktree correct.
 */
export const FRESHNESS = Object.freeze({
  CURRENT: "CURRENT",
  RECONCILED: "RECONCILED",
  STALE_SAFE_TO_RECONCILE: "STALE_SAFE_TO_RECONCILE",
  BLOCKED_DIRTY: "BLOCKED_DIRTY",
  BLOCKED_SHARED: "BLOCKED_SHARED",
  BLOCKED_CERTIFICATION: "BLOCKED_CERTIFICATION",
  BLOCKED_CONFLICT: "BLOCKED_CONFLICT",
  UNRESOLVED_BOOTSTRAP: "UNRESOLVED_BOOTSTRAP",
  UNKNOWN: "UNKNOWN",
});

/**
 * THE THRESHOLDS, IN ONE PLACE, CHOSEN FROM MEASURED BEHAVIOUR.
 *
 * The mission's example values (2h/12h/24h) were deliberately not adopted as
 * given. The live fleet on 2026-09-12 was measured instead:
 *
 *   INACTIVITY. Nine lanes had acted within 6 hours; the next three sat at 27,
 *   77 and 108 hours. Nothing at all occupied the range between. So 12h is the
 *   recent boundary — it contains the whole active cluster with room for an
 *   overnight pause, and excludes every member of the stale one. 72h is the
 *   long-inactive boundary: it is the "came back after a weekend" line, and it
 *   captures the 77h and 108h lanes without catching the 27h one.
 *
 *   DIVERGENCE. Healthy active lanes carried 0, 12 and 20 commits behind
 *   staging. The diverged ones carried 112, 207, 390, 719 and 915. Nothing sat
 *   between 20 and 112. The default of 50 is placed in that empty gap — above
 *   anything a working lane accumulates in a day, and far below the floor of the
 *   cluster that actually caused the problem.
 *
 * These are defaults, not laws. Each is overridable, and they live together
 * rather than as literals scattered through the policy, so the numbers can be
 * argued with in one place.
 */
export const FRESHNESS_POLICY = Object.freeze({
  recent_hours: numberFromEnv("ALLOY_LANE_FRESH_RECENT_HOURS", 12),
  long_inactive_hours: numberFromEnv("ALLOY_LANE_FRESH_LONG_INACTIVE_HOURS", 72),
  material_behind: numberFromEnv("ALLOY_LANE_FRESH_MATERIAL_BEHIND", 50),
  canonical_base: (process.env.ALLOY_LANE_FRESH_BASE || "origin/staging").trim(),
});

function numberFromEnv(name, fallback) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function git(args, cwd) {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8", timeout: 20_000, maxBuffer: 4 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** Commits the branch is behind and ahead of the canonical base. */
export function measureDivergence(worktreePath, { base = FRESHNESS_POLICY.canonical_base, gitImpl = git } = {}) {
  if (!worktreePath || !existsSync(worktreePath)) return { readable: false, behind: null, ahead: null, base };
  const counts = gitImpl(["rev-list", "--left-right", "--count", `${base}...HEAD`], worktreePath);
  if (!counts) return { readable: false, behind: null, ahead: null, base };
  const [behind, ahead] = counts.split(/\s+/).map((n) => Number(n));
  if (!Number.isFinite(behind) || !Number.isFinite(ahead)) {
    return { readable: false, behind: null, ahead: null, base };
  }
  return { readable: true, behind, ahead, base };
}

/**
 * When did this lane last do anything that counts?
 *
 * Derived from records that already exist — the lane's own `updated_at` and the
 * timestamps on its runs — rather than from a new "last active" field. A stored
 * activity marker is another thing to write, another thing to get wrong, and
 * another thing that disagrees with the runs it is supposed to summarise.
 */
export function lastMeaningfulActivityMs(rec, runs = []) {
  let last = Date.parse(rec?.updated_at || "") || 0;
  for (const r of runs || []) {
    for (const key of ["updated_at", "ended_at", "created_at"]) {
      const t = Date.parse(r?.[key] || "") || 0;
      if (t > last) last = t;
    }
  }
  return last || null;
}

/**
 * Is this commit something a promotion is already resting on?
 *
 * A certification or promotion candidate is a CONTENT IDENTITY: evidence was
 * gathered against one exact SHA, and moving the branch invalidates it silently.
 * Rebasing a candidate does not corrupt a file — it makes a green certification
 * describe a commit that no longer exists, which is worse, because nothing looks
 * wrong afterwards.
 *
 * There is no canonical candidate registry yet; DevOps 6 (Promotion Train) owns
 * that. So the default is derived from conventions this repository already
 * keeps — a `promote/*` branch, or a worktree under the promotions root — and it
 * is deliberately BROAD. The cost of a false positive is refusing to rebase a
 * branch automatically, which an operator can do by hand in a moment. The cost
 * of a false negative is a certified candidate quietly becoming uncertified. A
 * refusal is the cheap mistake.
 *
 * Injectable, so DevOps 6 replaces the convention with the registry without this
 * module changing.
 */
export function defaultCertificationCandidate({ branch = null, worktreePath = null } = {}) {
  const b = String(branch || "");
  const p = String(worktreePath || "");
  if (/^promote\//.test(b)) {
    return { active: true, reason: "promotion_branch", detail: `${b} is a promotion candidate branch.` };
  }
  if (/\/alloy-promotions\//.test(p)) {
    return { active: true, reason: "promotion_worktree", detail: `${p} is a promotion candidate worktree.` };
  }
  return { active: false };
}

/**
 * Evaluate one lane. READ ONLY, and it acquires nothing.
 *
 * No Development Slot is claimed, no dev server started, no browser launched, no
 * QA session minted and no provider woken. A freshness check that consumed the
 * scarce resources it reports on would be unusable on exactly the loaded host
 * where the answer matters, so the cost of asking is a few git reads.
 *
 * ORDER IS THE POLICY. Refusals are evaluated before staleness, because a dirty
 * or shared worktree must be refused whether or not it is behind — reporting it
 * as "safe to reconcile" and letting the mutation discover the problem is how
 * work gets destroyed.
 */
export function evaluateLaneFreshness(laneId, {
  root = undefined,
  nowMs = Date.now(),
  policy = FRESHNESS_POLICY,
  getLane = getDurableLane,
  bootstrap = resolveLaneBootstrap,
  gitFacts = measureWorktreeGit,
  divergence = measureDivergence,
  runsForLane = null,
  branchReferences = null,
  certificationCandidate = defaultCertificationCandidate,
  qaCapability = qaCapabilityForSlot,
  // Set by reconcileLaneFreshness after it fetches, so the re-evaluation knows
  // the divergence it is reading was computed against a base verified just now.
  baseFreshlyVerified = false,
} = {}) {
  const rec = root === undefined ? getLane(laneId) : getLane(laneId, root);
  if (!rec) return { ok: false, error: "lane_not_found", lane_id: laneId || null };

  const boot = bootstrap(rec.lane_id, root === undefined ? {} : { root });
  const worktreePath = boot?.ok ? boot.baseline.worktree.path : (rec.binding?.worktree_path || null);
  const slot = boot?.ok ? boot.baseline.development_slot.slot : (rec.binding?.slot ?? null);

  const activityMs = lastMeaningfulActivityMs(rec, runsForLane ? runsForLane(rec.lane_id) : []);
  const idleHours = activityMs ? (nowMs - activityMs) / 3_600_000 : null;
  const recent = idleHours != null && idleHours <= policy.recent_hours;
  const longInactive = idleHours == null || idleHours >= policy.long_inactive_hours;

  // Capability, never consumption. A slotless lane is valid and needs nothing.
  const qa = slot == null
    ? { slot: null, capable: true, reason: "slotless_lane_needs_no_active_qa" }
    : qaCapability(slot);

  const facts = { lane_id: rec.lane_id, name: rec.name || null, slot, worktree_path: worktreePath,
    idle_hours: idleHours == null ? null : Number(idleHours.toFixed(2)),
    recent, long_inactive: longInactive, qa_capability: qa, policy: { ...policy } };

  if (!worktreePath || !boot?.ok || !boot.baseline.worktree.resolvable) {
    return verdict(FRESHNESS.UNRESOLVED_BOOTSTRAP, facts, {
      reason: boot?.ok ? (boot.baseline.worktree.code || "worktree_unresolvable") : "bootstrap_unresolvable",
      detail: "The lane's baseline cannot be resolved, so nothing can be concluded about its freshness.",
    });
  }

  const g = gitFacts(worktreePath, { canonicalBase: policy.canonical_base });
  const div = divergence(worktreePath, { base: policy.canonical_base });
  Object.assign(facts, {
    branch: g?.branch || null,
    head_sha: g?.head_sha || null,
    behind: div.behind,
    ahead: div.ahead,
    dirty_paths: Array.isArray(g?.dirty_paths) ? g.dirty_paths.length : null,
    untracked: Array.isArray(g?.untracked) ? g.untracked.length : null,
  });

  if (!g?.readable || !div.readable) {
    return verdict(FRESHNESS.UNRESOLVED_BOOTSTRAP, facts, {
      reason: "git_unreadable",
      detail: "The worktree's git state could not be read, so reconciliation cannot be proven safe.",
    });
  }

  // ── Refusals first. None of these is made safe by an approval. ────────────

  if ((g.dirty_paths?.length || 0) > 0 || (g.untracked?.length || 0) > 0) {
    return verdict(FRESHNESS.BLOCKED_DIRTY, facts, {
      reason: "worktree_dirty",
      detail: `${g.dirty_paths.length} modified and ${g.untracked.length} untracked path(s). `
        + "Reconciling would move HEAD under uncommitted work, and no approval makes that safe.",
    });
  }

  const refs = branchReferences ? branchReferences({ branch: g.branch, laneId: rec.lane_id, worktreePath }) : null;
  if (refs?.shared) {
    return verdict(FRESHNESS.BLOCKED_SHARED, facts, {
      reason: "branch_or_worktree_shared",
      detail: refs.detail || "Another lane or worktree references this branch; ownership is ambiguous.",
      references: refs.references || [],
    });
  }

  const cert = certificationCandidate
    ? certificationCandidate({ laneId: rec.lane_id, branch: g.branch, headSha: g.head_sha, worktreePath })
    : null;
  if (cert?.active) {
    return verdict(FRESHNESS.BLOCKED_CERTIFICATION, facts, {
      reason: cert.reason || "certification_or_promotion_candidate",
      detail: cert.detail
        || "This exact commit is a certification or promotion candidate. Moving it would invalidate evidence already gathered against it.",
    });
  }

  // ── Bootstrap contract. Revalidate, never rubber-stamp. ───────────────────

  if (boot.unresolved.length) {
    return verdict(FRESHNESS.UNRESOLVED_BOOTSTRAP, facts, {
      reason: "bootstrap_unresolved",
      detail: `The lane does not satisfy the current bootstrap contract: ${boot.unresolved.join(", ")}.`,
      unresolved: boot.unresolved,
    });
  }
  if (!qa.capable) {
    // An assigned managed slot that cannot resolve QA is configuration drift
    // against the uniform baseline, not an optional resource that happens to be
    // absent. Slot assignment must never decide what a lane is capable of.
    return verdict(FRESHNESS.UNRESOLVED_BOOTSTRAP, facts, {
      reason: qa.reason || "qa_capability_missing",
      detail: `Slot ${slot} cannot resolve a QA identity, so this lane is less capable than the same lane on another slot.`
        + (qa.declare ? ` Declare ${qa.declare}.` : ""),
    });
  }
  const bootstrapStale = laneBootstrapIsStale(rec);

  // ── Freshness proper ─────────────────────────────────────────────────────

  /*
   * INACTIVITY AND DIVERGENCE, NOT WALL CLOCK ALONE.
   *
   * The first version of this required RECENCY for a lane to be CURRENT, which
   * made idleness on its own sufficient to declare staleness — the exact thing
   * the policy is supposed to avoid. A lane idle for thirty hours with zero
   * divergence and a current bootstrap has nothing whatsoever to reconcile, and
   * sending it to a rebase that would be a no-op is how a freshness gate becomes
   * something people route around.
   *
   * So divergence and the bootstrap contract decide staleness. Inactivity decides
   * only whether the BASE can still be trusted, which is a different question.
   */
  const material = Number(div.behind) >= policy.material_behind;

  /*
   * WHAT LONG INACTIVITY ACTUALLY INVALIDATES: THE BASE, NOT THE LANE.
   *
   * `behind` is measured against the LOCAL `origin/staging` ref, and that ref is
   * only as current as the last fetch. For a lane nobody has touched in days,
   * "0 commits behind" may mean "identical to a staging from last Tuesday" — a
   * reassuring number computed from a stale input, which is worse than no number.
   *
   * That is the honest content of mandatory base revalidation: not that the lane
   * must be rebased, but that its base must be re-fetched before any divergence
   * figure from it is worth acting on. Reconciliation fetches first, so routing a
   * long-inactive lane through it is what revalidates the base.
   */
  const baseTrusted = !longInactive || Boolean(baseFreshlyVerified);
  if (!material && !bootstrapStale && baseTrusted) {
    return verdict(FRESHNESS.CURRENT, facts, {
      reason: recent ? "recent_and_current" : "current_against_verified_base",
      detail: `${div.behind} commit(s) behind ${div.base}`
        + (idleHours == null ? "" : `, idle ${idleHours.toFixed(1)}h`)
        + ". Nothing to reconcile.",
      base_trusted: true,
    });
  }

  return verdict(FRESHNESS.STALE_SAFE_TO_RECONCILE, facts, {
    reason: material ? "materially_behind"
      : bootstrapStale ? "bootstrap_contract_stale"
        : "base_revalidation_required",
    detail: `${div.behind} commit(s) behind ${div.base}`
      + (idleHours == null ? ", activity unknown" : `, idle ${idleHours.toFixed(1)}h`)
      + (bootstrapStale ? ", bootstrap contract stale" : "")
      + (!baseTrusted ? ", and the base has not been verified since the lane went quiet" : "")
      + ". Clean and exclusively owned, so reconciliation is safe.",
    bootstrap_stale: bootstrapStale,
    base_trusted: baseTrusted,
    // Long inactivity makes revalidation mandatory rather than optional: the
    // number this verdict rests on cannot be trusted until the base is re-fetched.
    mandatory: longInactive && !baseFreshlyVerified,
  });
}

function verdict(state, facts, extra = {}) {
  return {
    ok: true,
    state,
    safe_to_start_new_work: state === FRESHNESS.CURRENT || state === FRESHNESS.RECONCILED,
    ...facts,
    ...extra,
  };
}

/**
 * Reconcile a lane with current staging.
 *
 * REFUSES UNLESS THE EVALUATION SAID SO. The verdict is recomputed here rather
 * than trusted from the caller: between an evaluation and a mutation a worktree
 * can become dirty, a branch can be claimed, and a commit can become a
 * certification candidate. Acting on a stale verdict is the whole class of bug
 * this function must not have.
 *
 * NO NEW GIT STRATEGY. The repository's own doctrine already decides how a
 * branch meets staging, and this mission was told not to invent one. What
 * happens here is a fetch and a REBASE of the lane's own commits onto current
 * staging — the operation the promotion path already assumes, since every
 * candidate in this programme is created as a fresh branch off current staging
 * and merged forward. A merge would leave the lane's history entangled with
 * staging's in a way `git merge-tree` checks against staging would then have to
 * unpick.
 *
 * IT CANNOT SILENTLY DISCARD WORK. The pre-image SHA is captured first and
 * returned in every outcome, success or failure; a rebase that hits a conflict
 * is ABORTED and the original HEAD restored, with the conflict reported rather
 * than resolved. Nothing here uses --force, --hard or any operation that drops
 * commits.
 */
export function reconcileLaneFreshness(laneId, {
  root = undefined,
  policy = FRESHNESS_POLICY,
  evaluate = evaluateLaneFreshness,
  gitImpl = git,
  ...evalOpts
} = {}) {
  const before = evaluate(laneId, { root, policy, ...evalOpts });
  if (!before.ok) return before;
  if (before.state === FRESHNESS.CURRENT) {
    // Idempotent by construction: a second call on a reconciled lane does
    // nothing and says so, rather than rebasing onto the same commit again.
    return { ...before, reconciled: false, noop: true, reason: "already_current" };
  }
  if (before.state !== FRESHNESS.STALE_SAFE_TO_RECONCILE) {
    return { ...before, reconciled: false, refused: true };
  }

  const cwd = before.worktree_path;
  const preImage = gitImpl(["rev-parse", "HEAD"], cwd);
  if (!preImage) {
    return { ...before, reconciled: false, refused: true, reason: "head_unreadable" };
  }

  if (gitImpl(["fetch", "origin", policy.canonical_base.replace(/^origin\//, "")], cwd) === null) {
    return { ...before, reconciled: false, refused: true, reason: "fetch_failed", pre_image_sha: preImage };
  }

  const rebased = gitImpl(["rebase", policy.canonical_base], cwd);
  if (rebased === null) {
    // CONFLICT. Abort restores the pre-image, and the evidence is reported
    // rather than guessed at: a conflict is a content decision, and resolving it
    // automatically is how somebody's work becomes a surprise.
    gitImpl(["rebase", "--abort"], cwd);
    const after = gitImpl(["rev-parse", "HEAD"], cwd);
    return {
      ...before,
      state: FRESHNESS.BLOCKED_CONFLICT,
      reconciled: false,
      refused: true,
      reason: "rebase_conflict",
      detail: "Rebase onto current staging conflicts. The rebase was aborted and the branch restored.",
      pre_image_sha: preImage,
      head_sha: after || preImage,
      restored: after === preImage,
      safe_to_start_new_work: false,
    };
  }

  const postImage = gitImpl(["rev-parse", "HEAD"], cwd);
  const after = evaluate(laneId, { root, policy, ...evalOpts, baseFreshlyVerified: true });
  return {
    ...after,
    state: after.state === FRESHNESS.CURRENT ? FRESHNESS.RECONCILED : after.state,
    safe_to_start_new_work: after.state === FRESHNESS.CURRENT,
    reconciled: true,
    pre_image_sha: preImage,
    head_sha: postImage || null,
  };
}

/**
 * The fleet, classified read-only.
 *
 * The input DevOps 3 inherits: every lane's verdict, its worktree, its branch,
 * its divergence and whether anything currently owns it. This deletes nothing
 * and reclaims nothing — worktree lifecycle is DevOps 3's, and it needs these
 * facts before it can decide anything about retention.
 */
export function inventoryLaneFreshness({ root = undefined, lanes = null, evaluate = evaluateLaneFreshness, ...opts } = {}) {
  const recs = lanes || (root === undefined ? listDurableLanes() : listDurableLanes(root));
  const rows = [];
  for (const rec of recs) {
    if (!rec?.lane_id) continue;
    try {
      const r = evaluate(rec.lane_id, { root, ...opts });
      rows.push(r.ok ? r : { lane_id: rec.lane_id, name: rec.name || null, state: FRESHNESS.UNKNOWN, reason: r.error });
    } catch (e) {
      rows.push({
        lane_id: rec.lane_id, name: rec.name || null,
        state: FRESHNESS.UNKNOWN, reason: `evaluate_failed:${String(e?.message || e).slice(0, 80)}`,
      });
    }
  }
  const byState = {};
  for (const r of rows) byState[r.state] = (byState[r.state] || 0) + 1;
  return {
    policy: { ...FRESHNESS_POLICY },
    lanes: rows.length,
    by_state: byState,
    blocked: rows.filter((r) => String(r.state).startsWith("BLOCKED")).length,
    stale: rows.filter((r) => r.state === FRESHNESS.STALE_SAFE_TO_RECONCILE).length,
    rows,
  };
}
