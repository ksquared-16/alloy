/**
 * CERTIFY FREQUENTLY. PROMOTE RARELY.
 *
 * WHAT THIS IS ANSWERING, measured rather than asserted. Over fourteen days,
 * 234 merges into staging touched `scripts/local-dev`. The median gap between
 * one and the next was NINETEEN MINUTES; 65% landed within half an hour of the
 * previous one, 81% within the hour. In the two days the governed-action store
 * still covers, this lane alone filed 106 pushes, 70 pull requests, 69 merges
 * and 42 toolkit installs — each install a Gateway convergence episode.
 *
 * That is not a velocity achievement. It is one change per promotion, and every
 * promotion carries a PR, a check set, a merge, a deployment, an install and a
 * convergence. The work was fine; the ECONOMY was wrong.
 *
 * The distinction this module makes is between two things that had become the
 * same event:
 *
 *   CERTIFICATION — this change is proven. Cheap, local, should happen often.
 *   PROMOTION     — staging moves, and the fleet pays. Expensive, should be rare.
 *
 * It does not add a release system. It classifies a candidate so that "is this
 * finished?" and "must staging move now?" stop being one question, and so that
 * a lane can say `BATCH` and mean something a reviewer can check.
 *
 * NOT AN ENFORCEMENT GATE. Nothing here blocks a promotion — a policy that can
 * refuse the one urgent fix of the week gets routed around within a day, and
 * then it is worse than nothing. It produces a CLASSIFICATION and the reason
 * for it, which a mission must state and a human can disagree with.
 */

/** A promotion that is not deferrable, and why the exception exists. */
export const PROMOTE_NOW_REASONS = Object.freeze({
  consumer_blocker: "an Alloy consumer is blocked and the fix is in this candidate",
  integrity_or_security: "a security or data-integrity defect that must be active, not merely proven",
  requires_live_certification: "the change cannot be meaningfully certified until it runs on the promoted path",
  deliberate_release_point: "an explicit release or convergence point the operator asked for",
});

/**
 * Work that is finished when it is CERTIFIED, and can wait for a batch.
 *
 * Every entry here was a real promotion in the measured window.
 */
export const BATCHABLE_CLASSES = Object.freeze({
  maintenance: "routine Vacilando maintenance",
  test_repair: "repairing or hardening a test",
  observability: "measurement, reporting, ledgers, evidence",
  runtime_debt: "non-blocking runtime debt",
  wrapper_coverage: "expanding dispatch/wrapper coverage",
  tier2_burndown: "Tier 2 red burn-down",
  documentation: "documentation and governance text",
  polish: "presentation and operator-facing wording",
});

/**
 * Paths whose change cannot be certified anywhere but the promoted path.
 *
 * This is the honest form of `requires_live_certification`: not "it feels
 * risky" but "there is no local surface on which this can be proven". The
 * hosted fixture runner is the worked example — its defect (a bare `psql` on a
 * host whose client is keg-only) was invisible to every local suite and only
 * appeared when the trusted host ran it.
 */
export const LIVE_ONLY_SURFACES = Object.freeze([
  "web/scripts/seedFinancialsDemoTenant.mjs",
  "certification/fixtures/",
]);

const has = (paths, prefix) => paths.some((p) => p === prefix || p.startsWith(prefix));

/**
 * Classify a candidate.
 *
 * @param {object} candidate
 * @param {string[]} candidate.paths          files the candidate changes
 * @param {string|null} candidate.promote_now_reason  a key of PROMOTE_NOW_REASONS, if the filer claims one
 * @param {string|null} candidate.batch_class         a key of BATCHABLE_CLASSES, if the filer claims one
 * @param {boolean} candidate.runtime_bytes_change    does this change what the Gateway RUNS
 * @returns {{disposition:"PROMOTE_NOW"|"BATCH", why:string, runtime_bytes_change:boolean,
 *            requires_install:boolean, unclassified:boolean}}
 */
export function classifyCandidate({
  paths = [],
  promote_now_reason = null,
  batch_class = null,
  runtime_bytes_change = null,
} = {}) {
  const files = paths.map(String);
  /*
   * "Runtime bytes" is what the GATEWAY EXECUTES, which is narrower than "files
   * under the toolkit". A repository audit module that lives in
   * scripts/local-dev/lib but that no runtime path imports does not require an
   * install — and installing anyway costs a convergence episode for nothing.
   * The caller may state it; otherwise it is inferred conservatively.
   */
  const inferredRuntime = has(files, "scripts/local-dev/lib/")
    || has(files, "scripts/local-dev/vac")
    || files.some((p) => p.startsWith("scripts/local-dev/") && p.endsWith(".sh"));
  const runtime = runtime_bytes_change === null ? inferredRuntime : Boolean(runtime_bytes_change);

  if (promote_now_reason) {
    const why = PROMOTE_NOW_REASONS[promote_now_reason];
    if (!why) {
      return {
        disposition: "PROMOTE_NOW",
        why: `unrecognised exception "${promote_now_reason}" — stated, and therefore reviewable, but not one of the four`,
        runtime_bytes_change: runtime,
        requires_install: runtime,
        unclassified: true,
      };
    }
    return { disposition: "PROMOTE_NOW", why, runtime_bytes_change: runtime, requires_install: runtime, unclassified: false };
  }

  const liveOnly = LIVE_ONLY_SURFACES.filter((s) => has(files, s));
  if (liveOnly.length) {
    return {
      disposition: "PROMOTE_NOW",
      why: `${PROMOTE_NOW_REASONS.requires_live_certification} (${liveOnly.join(", ")})`,
      runtime_bytes_change: runtime,
      requires_install: runtime,
      unclassified: false,
    };
  }

  if (batch_class && BATCHABLE_CLASSES[batch_class]) {
    return {
      disposition: "BATCH",
      why: BATCHABLE_CLASSES[batch_class],
      runtime_bytes_change: runtime,
      requires_install: runtime,
      unclassified: false,
    };
  }

  /*
   * THE DEFAULT IS BATCH, AND THAT IS THE WHOLE POINT.
   *
   * The measured behaviour was the opposite default: anything green went to
   * staging because nothing said it should not. An unclassified candidate is
   * still reported as unclassified, so "nobody said" is visible rather than
   * silently promoted.
   */
  return {
    disposition: "BATCH",
    why: "no exception was claimed; work that is finished when certified waits for a batch",
    runtime_bytes_change: runtime,
    requires_install: runtime,
    unclassified: true,
  };
}

/**
 * The sentence a mission must be able to answer before staging moves.
 *
 * Deliberately a QUESTION and not a gate: if there is no strong answer, that is
 * the signal to keep the work in the batch.
 */
export function whyThisMustPromoteNow(candidate) {
  const c = classifyCandidate(candidate);
  return c.disposition === "PROMOTE_NOW"
    ? { promote: true, statement: `WHY_THIS_MUST_PROMOTE_NOW: ${c.why}` }
    : { promote: false, statement: `WHY_THIS_MUST_PROMOTE_NOW: no strong answer — ${c.why}` };
}

/**
 * Summarise a set of candidates as one batch.
 *
 * A batch promotes when ANY member must promote now; the rest travel with it
 * for free, which is the economy. An install is required only if some member
 * actually changes what the Gateway runs.
 */
export function summariseBatch(candidates = []) {
  const rows = candidates.map((c) => ({ ...c, classification: classifyCandidate(c) }));
  const forcing = rows.filter((r) => r.classification.disposition === "PROMOTE_NOW");
  return {
    members: rows.length,
    promote_now: forcing.length > 0,
    forced_by: forcing.map((r) => ({ name: r.name ?? null, why: r.classification.why })),
    requires_install: rows.some((r) => r.classification.requires_install),
    unclassified: rows.filter((r) => r.classification.unclassified).map((r) => r.name ?? null),
    promotions_implied: forcing.length > 0 ? 1 : 0,
  };
}
