/**
 * The Critical Invariants Pack — a small kernel of platform truths, proved by
 * the controls that already own them.
 *
 * WHAT THIS IS NOT. Not a test suite, not a second CI, not a place where
 * business rules live. It defines no rule and asserts no behaviour of its own.
 * Every invariant below names an existing authoritative control and ASKS IT to
 * prove the rule its owner already owns. If this file ever starts containing an
 * assertion, it has become the second source of truth it exists to avoid.
 *
 * WHAT MAKES SOMETHING A CRITICAL INVARIANT. Not "this feature matters". A
 * critical invariant is a truth whose violation corrupts, misroutes, duplicates
 * or destabilises work EVEN WHEN THE CHANGED FEATURE LOOKS CORRECT — the class
 * of failure that unrelated changes cause and unrelated tests do not catch.
 *
 * Three of the entries below exist because this exact thing happened:
 *
 *   RUNTIME-001  slot 8 was claimed by two ACTIVE lanes for days. Nothing was
 *                broken from any feature's point of view; one lane simply could
 *                not resolve its own bootstrap, and the message described the
 *                lane rather than the duplicate.
 *
 *   GOV-002      a second press on a governed approval minted a SECOND
 *                single-use grant — which is what defeated single-use, since the
 *                replay was not reusing the old grant but buying a new one. 111
 *                duplicate approvals and 141 extra executions were measured
 *                before anyone noticed.
 *
 *   WORKTREE-001 the retirement subsystem's own rule is that an UNMEASURED gate
 *                blocks, because a permissive unknown fails silently and
 *                irreversibly. A classifier that read the wrong field name
 *                briefly reported 21 of 31 worktrees as safe to delete.
 *
 * SMALL, OR IT FAILS. A pack that grows until people route around it has failed
 * more completely than one that was never written. Measured on 2026-09-12 the
 * whole pack is well under a minute, which is the property that lets it run at
 * every integration boundary rather than being something a lane can reasonably
 * avoid.
 */

export const PACK_VERSION = "vacilando.critical_invariants.v1";

/** Where an invariant must hold. LEVEL 2 is the READY_FOR_STAGING boundary. */
export const LEVELS = Object.freeze({
  LOCAL: 0,
  CANDIDATE: 1,
  READY_FOR_STAGING: 2,
  PROMOTION_TRAIN: 3,
  RELEASE: 4,
});

/** What a single invariant's proof concluded. */
export const OUTCOME = Object.freeze({
  PASS: "PASS",
  FAIL: "FAIL",
  /*
   * The proof could not run. NOT a pass.
   *
   * This is the whole failure law in one value. A promotion worktree has no
   * web/node_modules, so a vitest-backed proof genuinely cannot execute there —
   * and the tempting behaviour is to skip it and report green. That would mean
   * the pack silently covered half the platform at exactly the boundary it
   * exists to guard. Unmeasured fails closed, and says why.
   */
  UNMEASURED: "UNMEASURED",
});

export const SEVERITY = Object.freeze({
  /** Violation corrupts or destroys work, or crosses a security boundary. */
  CRITICAL: "critical",
  /** Violation destabilises the operating system without destroying work. */
  HIGH: "high",
});

/**
 * A runner names HOW a proof is executed, never WHAT it proves.
 *
 * `node` controls live in scripts/local-dev and need nothing installed, which
 * is why the runtime and governance invariants can be proven from any checkout.
 * `vitest` controls live in web/ and need its dependencies — a real constraint,
 * surfaced as UNMEASURED rather than hidden.
 */
export const RUNNER = Object.freeze({ NODE: "node", VITEST: "vitest" });

/**
 * THE V1 SET.
 *
 * Deliberately nine. Each one is a truth the platform actually guarantees and
 * that an existing control already proves — nothing here was invented to fill a
 * domain, because an invariant nobody's code enforces is a wish, and a pack full
 * of wishes teaches people to ignore it.
 *
 * `statement` describes the TRUTH, never the implementation. "one current slot
 * cannot have two lane owners", never "function X returns Y" — an invariant
 * phrased as an implementation detail has to be rewritten every time the
 * implementation moves, and it stops being a statement anyone can argue with.
 */
export const INVARIANTS = Object.freeze([
  // ── Lane / runtime ────────────────────────────────────────────────────────
  Object.freeze({
    id: "INV-RUNTIME-001",
    statement: "One managed Development Slot has at most one current lane owner.",
    owner: "managed-slot / lane ownership (development-lane + worktree registration)",
    rationale:
      "Two lanes claiming one slot is invisible from every feature's point of view and breaks the "
      + "claimant that loses: slot 8 was double-claimed for days and surfaced only as one lane failing "
      + "to resolve its own bootstrap, with a message about the lane rather than the duplicate.",
    severity: SEVERITY.CRITICAL,
    level: LEVELS.READY_FOR_STAGING,
    proof: { runner: RUNNER.NODE, target: "scripts/local-dev/tests/worktree-lifecycle-class.test.mjs" },
    evidence: "slot ownership conflict detection, repairable vs unarbitrated",
  }),
  Object.freeze({
    id: "INV-RUNTIME-002",
    statement: "A lane's identity is not its slot, its worktree, or its execution, and survives losing any of them.",
    owner: "development-lane",
    rationale:
      "Every reclamation, slot move and session turnover depends on this. If lane identity can be "
      + "destroyed by removing a resource, then cleaning up disk silently deletes work history.",
    severity: SEVERITY.CRITICAL,
    level: LEVELS.READY_FOR_STAGING,
    proof: { runner: RUNNER.NODE, target: "scripts/local-dev/tests/lane-bootstrap-contract.test.mjs" },
    evidence: "slotless lane valid; bootstrap implies no execution, server or browser",
  }),
  Object.freeze({
    id: "INV-RUNTIME-003",
    statement: "A recorded observation cannot become permanent authority; canonical owners win.",
    owner: "lane-knowledge / canonical fact owners",
    rationale:
      "The slot-8 duplicate persisted because a cached binding read as current truth. A written fact "
      + "that outlives what it recorded is worse than no record, because it is believed.",
    severity: SEVERITY.HIGH,
    level: LEVELS.READY_FOR_STAGING,
    proof: { runner: RUNNER.NODE, target: "scripts/local-dev/tests/lane-knowledge.test.mjs" },
    evidence: "canonical_wins on contradiction; mutable facts require revalidation",
  }),

  // ── Governed actions ──────────────────────────────────────────────────────
  Object.freeze({
    id: "INV-GOV-001",
    statement: "A governed action cannot execute without authority for that exact action, target and environment.",
    owner: "governed-action authority (director-authority + trusted-host authz)",
    rationale:
      "This is the boundary between an agent proposing and an agent acting. Everything privileged on "
      + "this host — migrations, merges, production reads — rests on it.",
    severity: SEVERITY.CRITICAL,
    level: LEVELS.READY_FOR_STAGING,
    /*
     * THE NARROW PROOF, NOT THE BROAD SUITE.
     *
     * This first named `development-governed-approval`, which proves the same
     * truth among many other things — and took 65.9 SECONDS, more than four
     * fifths of the entire pack. `development-exact-authorization` proves
     * exactly this statement (authority is bound to one action, target and
     * environment) in 70 ms.
     *
     * That is not a weakening. It is the discipline the pack lives or dies by:
     * the broad suite still runs at LEVEL 1 as affected-domain regression, where
     * its breadth is the point. Here, breadth bought nothing this invariant
     * needed and cost the property that makes the pack unavoidable.
     */
    proof: { runner: RUNNER.NODE, target: "scripts/local-dev/tests/development-exact-authorization.test.mjs" },
    evidence: "authority bound to one exact action, target and environment",
  }),
  Object.freeze({
    id: "INV-GOV-002",
    statement: "One governed decision cannot mint two grants or two executions.",
    owner: "governed-action request lifecycle",
    rationale:
      "Measured: 111 duplicate approvals and 141 executions beyond the first. A second press minted a "
      + "SECOND single-use grant, which is precisely what defeated single-use — the replay was not "
      + "reusing the spent grant, it was buying a new one.",
    severity: SEVERITY.CRITICAL,
    level: LEVELS.READY_FOR_STAGING,
    /*
     * POINTED AT THE PROOF THAT EXISTS ON THIS BASE, NOT THE BEST ONE.
     *
     * `director-approval-reliability` is the stronger control — it asserts that a
     * duplicate approval mints no second grant and executes nothing — but it
     * lives in the Governance candidate (f1089527b / 16601e54f), which is held
     * behind the same soak and is NOT in this chain. Naming it here would make
     * this invariant permanently UNMEASURED, which fails closed correctly and
     * also makes the pack unusable until an unrelated candidate lands.
     *
     * `governed-action-request` also proves dedupe, but it takes 10 s AND is
     * red on pristine staging for unrelated stale fixtures — so it would import
     * someone else's debt into this invariant's outcome and make the pack's
     * dominant cost a control that is failing for reasons this invariant does
     * not care about. `governed-action-handoff` proves the same dedupe in 1.4 s
     * and is green.
     *
     * So this names the dedupe control that is authoritative today, and
     * `stronger_proof_pending` records the upgrade rather than losing it. When
     * the Governance candidate lands, this entry points at the better proof.
     */
    proof: { runner: RUNNER.NODE, target: "scripts/local-dev/tests/governed-action-handoff.test.mjs" },
    stronger_proof_pending: {
      target: "scripts/local-dev/tests/director-approval-reliability.test.mjs",
      arrives_with: "16601e54f",
      adds: "a duplicate approval mints no second grant and executes nothing",
    },
    evidence: "duplicate governed requests dedupe to one request and one execution",
  }),

  // ── Worktree / git ────────────────────────────────────────────────────────
  Object.freeze({
    id: "INV-WORKTREE-001",
    statement: "Dirty, untracked or undurable work cannot be destroyed automatically, and an unmeasured safety gate blocks.",
    owner: "worktree retirement (fourteen required gates)",
    rationale:
      "The only irreversible operation in the fleet. A permissive unknown here fails silently and "
      + "destroys the only copy — a classifier reading one wrong field name briefly reported 21 of 31 "
      + "worktrees as safe to delete.",
    severity: SEVERITY.CRITICAL,
    level: LEVELS.READY_FOR_STAGING,
    proof: { runner: RUNNER.NODE, target: "scripts/local-dev/tests/development-worktree-retirement.test.mjs" },
    evidence: "every gate required; null blocks; durability classified from measurement",
  }),

  // ── Access / identity ─────────────────────────────────────────────────────
  Object.freeze({
    id: "INV-ACCESS-001",
    statement: "An unauthenticated or anonymous principal cannot reach privileged surfaces or data.",
    owner: "access / authority model",
    rationale:
      "The outermost security boundary. A regression here is not a degraded feature, it is exposure, "
      + "and it is exactly the kind an unrelated change causes.",
    severity: SEVERITY.CRITICAL,
    level: LEVELS.READY_FOR_STAGING,
    proof: { runner: RUNNER.VITEST, target: "tests/access/anonPrivilegeAccessControlSurface.test.ts" },
    evidence: "anonymous privilege surface enumeration",
  }),
  Object.freeze({
    id: "INV-ACCESS-002",
    statement: "The authority layers are enumerable and no surface authorizes outside them.",
    owner: "access / authority model",
    rationale:
      "Privilege expansion is rarely a new permission; it is usually a new surface that forgot to ask. "
      + "Enumerating the layers is what makes an unasked surface visible.",
    severity: SEVERITY.CRITICAL,
    level: LEVELS.READY_FOR_STAGING,
    proof: { runner: RUNNER.VITEST, target: "tests/access/authorityLayerEnumeration.test.ts" },
    evidence: "authority layer enumeration and surface coverage",
  }),

  // ── Business spine ────────────────────────────────────────────────────────
  Object.freeze({
    id: "INV-FIN-001",
    statement: "A charge cannot be posted, duplicated or corrected in a way that loses its lineage.",
    owner: "financial charge lifecycle",
    rationale:
      "Money is the one domain where a duplicate is not an inconvenience. A correction that does not "
      + "reference what it corrects is indistinguishable from a second charge.",
    severity: SEVERITY.CRITICAL,
    level: LEVELS.READY_FOR_STAGING,
    proof: { runner: RUNNER.VITEST, target: "tests/financials/chargeLifecycleService.test.ts" },
    evidence: "charge lifecycle transitions and idempotency",
  }),
  Object.freeze({
    id: "INV-ATTEND-001",
    statement: "Attendance is an append-only fact stream; a correction adds a fact and never rewrites history.",
    owner: "operational facts (attendance conformance)",
    rationale:
      "Derived state is a fold over the stream. If history can be rewritten, every downstream number "
      + "silently changes and no audit can reconstruct what was true at the time.",
    severity: SEVERITY.CRITICAL,
    level: LEVELS.READY_FOR_STAGING,
    proof: { runner: RUNNER.VITEST, target: "tests/operationalFacts/attendanceFactConformance.test.ts" },
    // This control also rejects a non-conforming stream and catches a LATER
    // migration that weakens the schema, which is what makes it an invariant
    // rather than a feature test.
    evidence: "stream conformance, harness teeth, cumulative schema-drift detection",
  }),
]);

/**
 * The measured budget.
 *
 * Timed on 2026-09-12 against the canonical checkout: the six node controls run
 * in 41-136 ms each with no dependencies at all; the four vitest controls in
 * 554-2458 ms each. The pack is therefore seconds, not a CI run.
 *
 * `max_ms` is a ceiling, not a prediction. It exists so that a proof which grows
 * into a slow one is reported as a budget breach rather than quietly making the
 * pack something a lane starts skipping.
 */
/**
 * KNOWN BASELINE DEBT, measured rather than assumed.
 *
 * `governed-action-request.test.mjs` — the proof behind INV-GOV-002 — fails on
 * PRISTINE origin/staging at 14 passed / 6 failed, verified by checking staging
 * out clean and running it. Five of those six are stale fixtures asserting
 * behaviour the runtime deliberately replaced, and they are already fixed in the
 * Governance candidate held behind the same soak.
 *
 * RECORDING IT IS NOT EXCUSING IT. The outcome stays FAIL, the row is marked
 * pre-existing, and the count of NEW failures — which is what blocks — stays
 * exact. What this prevents is the two failure modes at either end: normalising
 * known red into invisible green, and reporting long-standing debt as a fresh
 * regression until people stop reading the pack.
 *
 * Passed as `baseline` by a caller that has verified it. NOT applied
 * automatically: a baseline the pack grants itself is a pack that excuses its
 * own failures.
 */
export const MEASURED_BASELINE = Object.freeze({
  at: "2026-09-12",
  base: "origin/staging",
  entries: Object.freeze([
    Object.freeze({
      id: "INV-GOV-002 (historical)",
      proof: "scripts/local-dev/tests/governed-action-request.test.mjs",
      observed: "14 passed / 6 failed on pristine origin/staging",
      cause: "stale fixtures asserting behaviour the runtime deliberately replaced",
      resolved_by: "16601e54f (Governance + Async Ack), held behind the Host Lifecycle soak",
      note:
        "Recorded because it is real and will be met again: this WAS the proof behind INV-GOV-002 "
        + "until a faster, green control proving the same dedupe replaced it. Kept as the worked "
        + "example of baseline debt, not as an excuse the pack grants itself.",
    }),
  ]),
});

export const BUDGET = Object.freeze({
  max_ms: Number(process.env.ALLOY_INVARIANTS_MAX_MS) || 120_000,
  measured_node_ms_range: [41, 136],
  measured_vitest_ms_range: [554, 2458],
  measured_at: "2026-09-12",
});

/** Every invariant required at or below a level. */
export function invariantsForLevel(level = LEVELS.READY_FOR_STAGING) {
  return INVARIANTS.filter((i) => i.level <= level);
}

/** One canonical owner each, and stable ids — asserted by the pack's own controls. */
export function invariantById(id) {
  return INVARIANTS.find((i) => i.id === id) || null;
}

/**
 * Run the pack.
 *
 * THE EXECUTION SEAM DEVOPS 6 CONSUMES. Deterministic in, deterministic out: a
 * candidate and an environment go in, and a pack result bound to both comes out,
 * with one outcome per invariant and a verdict that is PASS only when every
 * required invariant was actually measured and actually passed.
 *
 * `runProof` is injected. This module spawns nothing itself — which is what
 * keeps it a manifest rather than a runner, lets the controls be exercised
 * without executing the platform's whole test surface, and means a caller in a
 * context that cannot run vitest gets honest UNMEASURED rows instead of a
 * crash.
 */
export async function runCriticalInvariants({
  candidate = null,
  environment = null,
  level = LEVELS.READY_FOR_STAGING,
  runProof,
  baseline = [],
  budget = BUDGET,
  nowMs = Date.now(),
} = {}) {
  const required = invariantsForLevel(level);
  const started = Date.now();
  const results = [];

  for (const inv of required) {
    let outcome = OUTCOME.UNMEASURED;
    let detail = "no runner supplied";
    let ms = null;
    if (typeof runProof === "function") {
      const t0 = Date.now();
      try {
        const out = await runProof(inv);
        ms = Date.now() - t0;
        // A runner that cannot answer must say so. Anything it does not
        // recognise is UNMEASURED, never an optimistic pass.
        outcome = out?.outcome === OUTCOME.PASS ? OUTCOME.PASS
          : out?.outcome === OUTCOME.FAIL ? OUTCOME.FAIL
            : OUTCOME.UNMEASURED;
        detail = out?.detail || null;
      } catch (e) {
        ms = Date.now() - t0;
        outcome = OUTCOME.UNMEASURED;
        detail = `proof threw: ${String(e?.message || e).slice(0, 160)}`;
      }
    }
    /*
     * PRE-EXISTING FAILURE IS NOT A PASS, AND NOT A NEW REGRESSION EITHER.
     *
     * Normalising a known-red control into green is how a pack stops meaning
     * anything; treating long-standing debt as a fresh regression is how people
     * start ignoring it. Both are recorded, and they are recorded DIFFERENTLY:
     * the outcome stays FAIL and the row is marked pre-existing, so the count of
     * NEW failures — which is what blocks — is exact.
     */
    const preExisting = outcome === OUTCOME.FAIL && baseline.includes(inv.id);
    results.push({
      id: inv.id,
      statement: inv.statement,
      owner: inv.owner,
      severity: inv.severity,
      level: inv.level,
      proof: inv.proof,
      outcome,
      pre_existing: preExisting,
      detail,
      ms,
    });
  }

  const elapsed = Date.now() - started;
  const failures = results.filter((r) => r.outcome === OUTCOME.FAIL && !r.pre_existing);
  const preExisting = results.filter((r) => r.pre_existing);
  const unmeasured = results.filter((r) => r.outcome === OUTCOME.UNMEASURED);

  /*
   * THE VERDICT, AND THERE IS NO OVERRIDE.
   *
   * A new failure blocks. An unmeasured required invariant blocks — it cannot
   * truthfully be said to hold, and "we could not check" is not "it is fine".
   * A pre-existing failure does NOT block here: whether known debt may travel is
   * a policy decision, and it belongs to whoever owns the promotion, not to a
   * pack whose job is to report truthfully. It is returned separately and
   * loudly so that decision is made deliberately rather than by omission.
   */
  const verdict = failures.length ? OUTCOME.FAIL
    : unmeasured.length ? OUTCOME.UNMEASURED
      : OUTCOME.PASS;

  return {
    schema_version: PACK_VERSION,
    pack_version: PACK_VERSION,
    // Bound to exactly what was proved. A pack result with no candidate proves
    // nothing about any candidate.
    candidate: candidate ? String(candidate) : null,
    environment,
    level,
    verdict,
    blocks_integration: verdict !== OUTCOME.PASS,
    counts: {
      total: results.length,
      passed: results.filter((r) => r.outcome === OUTCOME.PASS).length,
      failed_new: failures.length,
      failed_pre_existing: preExisting.length,
      unmeasured: unmeasured.length,
    },
    results,
    elapsed_ms: elapsed,
    budget_ms: budget.max_ms,
    within_budget: elapsed <= budget.max_ms,
    ran_at: new Date(nowMs).toISOString(),
  };
}

/**
 * The pack result, in DevOps 4's certification shape.
 *
 * Reuses `certificationRecord` rather than inventing a second evidence format,
 * and carries REFERENCES — invariant ids and outcomes — never raw test output.
 * A wall of vitest stdout in a lane's knowledge is the unbounded event log that
 * model exists to prevent.
 */
export function packCertification(result, { certificationRecord, evidenceRefs = [], nowMs = Date.now() } = {}) {
  if (typeof certificationRecord !== "function") return null;
  return certificationRecord({
    candidate: result?.candidate || null,
    environment: result?.environment || null,
    // One concise line per invariant. Enough to reproduce, nothing to scroll.
    suites: (result?.results || []).map((r) => `${r.id}: ${r.outcome}${r.pre_existing ? " (pre-existing)" : ""}`),
    passed: result?.verdict === OUTCOME.PASS,
    pre_existing_failures: (result?.results || []).filter((r) => r.pre_existing).map((r) => r.id),
    evidence_refs: evidenceRefs,
    nowMs,
  });
}

/**
 * Why this pack exists, in DevOps 4's durable-decision shape.
 *
 * A decision rather than a comment because it is exactly the kind of thing a
 * future reader re-litigates: "why is this pack so small, and why does it not
 * just run the suite?"
 */
export function packRationale({ durableDecision, nowMs = Date.now() } = {}) {
  if (typeof durableDecision !== "function") return null;
  return durableDecision({
    decision: "A small invariant kernel is mandatory at the integration boundary; the full suite is not.",
    rationale:
      "A pack that grows until people route around it has failed more completely than one never written. "
      + "These are the truths whose violation corrupts or destroys work even when the changed feature "
      + "looks correct — the class unrelated changes cause and unrelated tests miss. Measured, the whole "
      + "pack is seconds, which is what makes it unavoidable rather than optional.",
    alternatives_rejected: [
      "Run the full suite at every boundary — too slow to run often, so it would be skipped.",
      "Let each domain nominate its own critical tests — that is how a kernel becomes a suite.",
      "Skip proofs that cannot run in the current context — that reports green for an unchecked platform.",
    ],
    authority: "DevOps 5",
    candidate: PACK_VERSION,
    nowMs,
  });
}
