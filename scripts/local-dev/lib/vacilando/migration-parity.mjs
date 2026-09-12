#!/usr/bin/env node
/**
 * IS THE SCHEMA THIS CODE REQUIRES POSITIVELY PROVEN PRESENT IN THAT DATABASE?
 *
 * WHY THIS EXISTS. Measured on 2026-09-09 against the deployed primary: nothing
 * in this repository applies migrations to a hosted database. No GitHub Actions
 * job runs `supabase db push`; `prebuild` runs verifications only and `build` is
 * `next build`; the governed `database.apply_migration` action has never been
 * requested once (0 of 0). The only written owner is step 7 of an ARCHIVED
 * release process — "Run pending migrations against the production project
 * (Supabase CLI, hosted runner, or controlled SQL)" — a manual step with no
 * current governance doc behind it. Application deployment can therefore
 * advance while the schema it requires has not.
 *
 * WHY COUNTS ARE NOT THE ANSWER, learned the hard way. An earlier census
 * reported 55 hosted rows against 55 required and that looked like proof. It was
 * not: the census format had consumed each migration's version as a row label,
 * so the identities were structurally unreadable and 55-vs-55 could not tell
 * "the same 55" from "55, four of them different". Equal counts are the most
 * convincing way to be wrong here, so this module refuses to accept them.
 *
 * THE THREE ANSWERS. `ok` (every required identity present, head at least the
 * required head), `blocked` (something required is missing or unexpected), and
 * `unknown` (the measurement itself did not happen). UNKNOWN IS NOT OK: a gate
 * that treats "I could not look" as "fine" is the fail-open behaviour this
 * closes.
 *
 * Pure and offline: it takes a required set and a measured set. It never opens a
 * database, never holds a credential, and never decides where the credential
 * came from — the deployed read belongs to the governed census path, and this
 * only judges what came back.
 */

/** A migration version is a 14-digit timestamp; anything else is not one. */
const VERSION_RE = /^\d{14}$/;

/**
 * Required identities, from migration filenames in the promoted tree.
 * Accepts paths or bare filenames so a caller may pass `git ls-tree` output.
 */
export function requiredVersionsFromFilenames(names = []) {
  const out = [];
  for (const raw of names) {
    const base = String(raw).split("/").pop() || "";
    if (!base.endsWith(".sql")) continue;
    const version = base.split("_")[0];
    if (VERSION_RE.test(version)) out.push(version);
  }
  return [...new Set(out)].sort();
}

/**
 * Measured identities from a governed census.
 *
 * The census returns `questions.ledger.rows` as payload values. They arrive as
 * numbers or strings depending on how psql rendered them, so they are coerced —
 * a version compared as a number against the same version as a string is a
 * false mismatch, which would block a promotion that should have passed.
 */
export function measuredVersionsFromCensus(census) {
  const rows = census?.questions?.ledger?.rows;
  if (!Array.isArray(rows)) return null;   // null means NOT MEASURED, not empty
  const out = [];
  for (const r of rows) {
    const v = String(r ?? "").trim();
    if (VERSION_RE.test(v)) out.push(v);
  }
  return [...new Set(out)].sort();
}

/** The head the census reported, or null when it did not report one. */
export function measuredHeadFromCensus(census) {
  const rows = census?.questions?.ledger_head?.rows;
  if (!Array.isArray(rows) || !rows.length) return null;
  const v = String(rows[0] ?? "").trim();
  return VERSION_RE.test(v) ? v : null;
}

/**
 * The verdict.
 *
 * `window` bounds the comparison to the identities the census actually asked
 * for. Comparing a windowed measurement against the whole repository would
 * report every pre-window migration as missing — a false block, which erodes
 * trust in the gate faster than a false pass.
 */
export function migrationParity({
  required = [],
  measured = null,
  measuredHead = null,
  window = null,
} = {}) {
  // UNKNOWN FIRST. A gate that cannot see is not a gate that approves.
  if (measured === null) {
    return {
      status: "unknown",
      promote: false,
      reason: "hosted migration identities were not measured",
      missing: [],
      unexpected: [],
    };
  }

  const req = window ? required.filter((v) => v >= window) : [...required];
  const got = window ? measured.filter((v) => v >= window) : [...measured];
  const gotSet = new Set(got);
  const reqSet = new Set(req);

  const missing = req.filter((v) => !gotSet.has(v));
  const unexpected = got.filter((v) => !reqSet.has(v));

  if (missing.length) {
    return {
      status: "blocked",
      promote: false,
      reason: `hosted is missing ${missing.length} required migration(s)`,
      missing,
      unexpected,
    };
  }
  if (unexpected.length) {
    // An identity the promoted tree does not contain means the database and the
    // repository disagree about history. It may be benign (a pre-baseline tail)
    // or it may be a migration applied from somewhere that is not this tree,
    // and this module cannot tell which — so it refuses rather than guesses.
    return {
      status: "blocked",
      promote: false,
      reason: `hosted carries ${unexpected.length} migration identity/identities absent from the promoted tree`,
      missing,
      unexpected,
    };
  }

  // Head is checked separately: equal SETS with a head behind the required head
  // would mean the window hid a newer required migration.
  const requiredHead = req.length ? req[req.length - 1] : null;
  if (requiredHead && measuredHead && measuredHead < requiredHead) {
    return {
      status: "blocked",
      promote: false,
      reason: `hosted head ${measuredHead} is behind the required head ${requiredHead}`,
      missing,
      unexpected,
    };
  }

  return {
    status: "ok",
    promote: true,
    reason: `all ${req.length} required migration identities are present on the target`,
    missing: [],
    unexpected: [],
  };
}

/**
 * THE MERGE GATE: may this promoted revision become effective on that database?
 *
 * WHY A PROVEN HEAD RATHER THAN A CENSUS PER MERGE. Reading the deployed primary
 * is a Director-owned governed action; running one inside every merge would put
 * a hosted database read on the critical path of unrelated promotions. It is
 * also unnecessary. Once a census has positively established the hosted head,
 * every promoted revision whose required head is at or below it is proven
 * without asking again. Only a revision that needs something NEWER than what was
 * last proven has an open question, and that is exactly when a fresh census is
 * worth its cost.
 *
 * WHY IT DOES NOT DEPEND ON NOTICING A MIGRATION IN THE DIFF. A promotion can
 * require schema it did not itself author — code merged today may depend on a
 * migration merged last week that nobody applied. Comparing required head to
 * proven head catches that; "did this PR touch supabase/migrations" does not,
 * and it fails in the direction that ships broken code.
 *
 * STALENESS IS UNKNOWN, NOT PASS. A proof has an age. A head proven before the
 * required migrations existed says nothing about them, so an absent or expired
 * proof is UNKNOWN and blocks, exactly as an unreadable census does.
 */
export const PROVEN_HEAD_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function migrationMergeGate({
  requiredHead = null,
  requiredCount = null,
  provenHead = null,
  provenAtMs = null,
  nowMs = Date.now(),
  maxAgeMs = PROVEN_HEAD_MAX_AGE_MS,
} = {}) {
  // "THE TREE HAS NO MIGRATIONS" AND "I COULD NOT READ THE TREE" ARE NOT THE
  // SAME ANSWER, and collapsing them fails open. Caught by this module's own
  // live check: a shell quoting slip passed an empty head, and an earlier draft
  // answered "requires no migrations · promote" — a green gate produced by a
  // failed measurement, which is precisely the shape this whole gate exists to
  // refuse. The caller must say how many migrations it actually saw; null means
  // it could not look.
  if (requiredCount === null || requiredCount === undefined) {
    return { status: "unknown", promote: false, measured: false, reason: "the promoted revision's migration set could not be read" };
  }
  if (Number(requiredCount) === 0) {
    return { status: "ok", promote: true, measured: true, reason: "the promoted revision contains no migrations" };
  }
  if (!requiredHead) {
    return { status: "unknown", promote: false, measured: false, reason: "migrations are present but the required head could not be determined" };
  }
  if (!VERSION_RE.test(String(requiredHead))) {
    return { status: "unknown", promote: false, measured: false, reason: "the required migration head could not be read from the promoted revision" };
  }
  if (!provenHead || !VERSION_RE.test(String(provenHead))) {
    return { status: "unknown", promote: false, measured: false, reason: "no census has positively established the hosted migration head" };
  }
  if (provenAtMs && Number.isFinite(provenAtMs) && (nowMs - provenAtMs) > maxAgeMs) {
    return {
      status: "unknown",
      promote: false,
      measured: false,
      reason: `the hosted migration proof is older than ${Math.round(maxAgeMs / 3600000)}h and must be re-measured`,
    };
  }
  if (String(provenHead) < String(requiredHead)) {
    return {
      status: "blocked",
      promote: false,
      measured: true,
      reason: `hosted head ${provenHead} is behind the required head ${requiredHead}`,
      required_head: String(requiredHead),
      proven_head: String(provenHead),
    };
  }
  return {
    status: "ok",
    promote: true,
    measured: true,
    reason: `hosted head ${provenHead} satisfies the required head ${requiredHead}`,
    required_head: String(requiredHead),
    proven_head: String(provenHead),
  };
}

/**
 * The most recent hosted head a governed census actually established.
 *
 * Reads the governed-action records that already exist rather than keeping a
 * second copy of the truth: the census IS the proof, so the proof is read from
 * where the census was recorded. Only completed reads of the identity census
 * count — a failed or pending one proves nothing.
 */
export function provenHostedHeadFromCensusRecords(requests = [], { artifactPath = null } = {}) {
  let best = null;
  for (const r of requests) {
    if (r?.action_key !== "database.read_census") continue;
    if (r?.status !== "complete") continue;
    const inputs = r.inputs || {};
    const path = inputs.queryArtifactPath || inputs.query_artifact_path || "";
    if (artifactPath && !String(path).includes(artifactPath)) continue;
    const head = measuredHeadFromCensus(r?.result?.census);
    if (!head) continue;
    const atMs = Date.parse(r.execution_ended_at || r.updated_at || r.created_at || "");
    if (!best || (Number.isFinite(atMs) && atMs > best.atMs)) {
      best = { head, atMs: Number.isFinite(atMs) ? atMs : 0, target: inputs.databaseTarget || null, request_id: r.request_id };
    }
  }
  return best;
}

/* ══════════════════════════════════════════════════════════════════════════
 * THE LIFECYCLE BOUNDARY, AND THE CYCLE THAT CAME FROM LOSING IT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Everything above is correct about WHAT to compare and was wrong about WHICH
 * REVISION supplies the requirement. `requiredVersionsFromFilenames` is even
 * documented as "identities from migration filenames in the PROMOTED tree", and
 * `migrationMergeGate` asks "may this PROMOTED revision become effective" — but
 * its only production caller measured the CANDIDATE head. The gate therefore
 * required a candidate's own unmerged migration to already exist on the deployed
 * primary before that candidate could merge.
 *
 * That is not a strict gate. It is an UNSATISFIABLE one, and the system already
 * knew: `trusted-host-production-migrate.mjs` documents the same cycle at length
 * and answers it with a pre-merge escape hatch in which a REFUSAL becomes the
 * authority to deploy unpromoted schema to the production primary. A denial that
 * authorises a deployment is a strong signal that the denial was wrong.
 *
 * MEASURED on the running toolkit, 2026-09-12, against the live evidence store:
 *
 *   promoted staging  413 identities, head 20260912010000
 *   hosted primary    413 identities, head 20260912010000   (census gar_9703363)
 *   PR #848 candidate 414 identities, head 20260912020000
 *
 *   promoted_staging − hosted = {}            ← nothing is owed
 *   candidate − hosted = {20260912020000}     ← and cannot be owed yet
 *
 *   gate measured against the candidate head → blocked, "hosted head
 *     20260912010000 is behind the required head 20260912020000"
 *   gate measured against promoted staging   → ok, promote
 *
 * THE LAW. Only what is ALREADY PROMOTED can be owed to the deployed primary.
 * A candidate-only migration is an obligation that begins at merge, and asking
 * for it earlier asks the candidate to have already happened.
 *
 * STRICTNESS IS UNCHANGED WHERE IT WAS REAL. Promoted staging ahead of hosted
 * still blocks — that was the first Attendance denial, and it was legitimate.
 * What changes is only the set the requirement is drawn from.
 */

/** A promotion gate's lifecycle phase. Naming it is what stops the confusion. */
export const LIFECYCLE = Object.freeze({
  PROMOTED_STAGING: "promoted_staging",
  CANDIDATE: "candidate",
  POST_MERGE: "post_merge",
  DEPLOYED_PRIMARY: "deployed_primary",
});

/** Why a parity verdict came out the way it did. `stale` is not `behind`. */
export const PARITY_STATUS = Object.freeze({
  OK: "ok",
  BLOCKED: "blocked",
  UNKNOWN: "unknown",
  STALE: "stale",
});

/**
 * Everything a hosted census established, not merely its head.
 *
 * `provenHostedHeadFromCensusRecords` kept only the head, so a denial could say
 * "behind" but never WHICH identities were missing. The Director received
 * `hosted_migration_behind` and no way to act on it. This returns the identity
 * set as well, so the gate can name the difference.
 */
export function hostedMigrationEvidence(requests = [], { artifactPath = "hosted-migration-identity-census.sql" } = {}) {
  let best = null;
  for (const r of requests) {
    if (r?.action_key !== "database.read_census") continue;
    if (r?.status !== "complete") continue;
    const inputs = r.inputs || {};
    const path = inputs.queryArtifactPath || inputs.query_artifact_path || "";
    if (artifactPath && !String(path).includes(artifactPath)) continue;
    const census = r?.result?.census;
    const head = measuredHeadFromCensus(census);
    if (!head) continue;
    const atMs = Date.parse(r.execution_ended_at || r.updated_at || r.created_at || "");
    const identities = measuredVersionsFromCensus(census);
    const totalRows = census?.questions?.ledger_total?.rows;
    if (!best || (Number.isFinite(atMs) && atMs > best.atMs)) {
      best = {
        head,
        identities,
        // The census reads a WINDOW of the ledger, not all of it: 75 identities
        // returned against a total of 413. Comparing a windowed measurement to a
        // whole tree would report every pre-window migration as missing, so the
        // window floor travels with the evidence and bounds the comparison.
        window: Array.isArray(identities) && identities.length ? identities[0] : null,
        total: Array.isArray(totalRows) && totalRows.length ? Number(totalRows[0]) : null,
        atMs: Number.isFinite(atMs) ? atMs : 0,
        target: inputs.databaseTarget || inputs.target || null,
        request_id: r.request_id || null,
      };
    }
  }
  return best;
}

/** Governed actions that can change what the hosted ledger contains. */
const HOSTED_MUTATING_ACTIONS = Object.freeze([
  "database.apply_promoted_migration",
  "database.repair_migration_ledger",
  "database.apply_migration",
]);

/**
 * IS THIS EVIDENCE STILL A DESCRIPTION OF THE DATABASE?
 *
 * An age limit alone cannot answer that. The hosted ledger was repaired twice
 * inside one hour on 2026-09-11 — 405→412 for D2, then 412→413 for W-17 — and a
 * census taken ten minutes before either repair was both WELL INSIDE the 24h
 * window and wrong. Under the age rule it would have been served as current and
 * a candidate denied "hosted is behind" on the strength of it.
 *
 * So staleness is not only time: evidence recorded BEFORE a completed hosted
 * mutation has been overtaken by a known event. Both are read from records
 * governance already writes, so this invents no new source of truth — it reads
 * the one that already says the database changed.
 *
 * A stale verdict BLOCKS, exactly as UNKNOWN does. What it must never do is
 * claim hosted is behind, because that is a statement about the database made
 * from a document that no longer describes it.
 */
export function hostedEvidenceFreshness(evidence, {
  requests = [],
  nowMs = Date.now(),
  maxAgeMs = PROVEN_HEAD_MAX_AGE_MS,
} = {}) {
  if (!evidence) {
    return { fresh: false, reason: "no_evidence", detail: "no completed hosted migration census has been recorded" };
  }
  const ageMs = Number.isFinite(evidence.atMs) && evidence.atMs > 0 ? nowMs - evidence.atMs : null;
  if (ageMs === null) {
    return { fresh: false, reason: "evidence_undated", detail: "the census record carries no usable timestamp", age_ms: null };
  }
  if (ageMs > maxAgeMs) {
    return {
      fresh: false,
      reason: "evidence_expired",
      detail: `the hosted census is ${Math.round(ageMs / 3600000)}h old and must be re-measured`,
      age_ms: ageMs,
    };
  }
  for (const r of requests) {
    if (!HOSTED_MUTATING_ACTIONS.includes(r?.action_key)) continue;
    if (r?.status !== "complete") continue;
    const at = Date.parse(r.execution_ended_at || r.updated_at || r.created_at || "");
    if (!Number.isFinite(at) || at <= evidence.atMs) continue;
    return {
      fresh: false,
      reason: "superseded_by_hosted_mutation",
      detail: `${r.action_key} completed after this census; the hosted ledger must be re-measured`,
      age_ms: ageMs,
      superseded_by: r.request_id || r.action_key,
    };
  }
  return { fresh: true, reason: "current", age_ms: ageMs };
}

/**
 * THE PRE-MERGE PARITY GATE, with its lifecycle boundary declared.
 *
 * expected  = migrations on CURRENT PROMOTED STAGING   (obligations that exist now)
 * candidate = migrations on the candidate head          (obligations that begin at merge)
 * actual    = the hosted ledger, as a census measured it
 *
 * require expected ⊆ actual. Candidate-only identities are reported, never
 * required. Hosted identities absent from promoted staging are reported and do
 * NOT block: nothing a candidate can do removes a row from a ledger, so blocking
 * on them would be a second impossible precondition wearing the opposite coat.
 */
export function promotionParityGate({
  expected = null,
  candidate = null,
  evidence = null,
  freshness = null,
  expectedRevision = null,
  nowMs = Date.now(),
} = {}) {
  const base = {
    gate: "hosted_migration_parity",
    expected_revision: expectedRevision,
    expected_revision_kind: LIFECYCLE.PROMOTED_STAGING,
    expected_migration_head: Array.isArray(expected) && expected.length ? expected[expected.length - 1] : null,
    expected_migration_count: Array.isArray(expected) ? expected.length : null,
    hosted_migration_head: evidence?.head ?? null,
    hosted_migration_count: evidence?.total ?? null,
    hosted_target: evidence?.target ?? null,
    evidence_id: evidence?.request_id ?? null,
    evidence_timestamp: evidence?.atMs ? new Date(evidence.atMs).toISOString() : null,
    evidence_age_ms: freshness?.age_ms ?? null,
    missing_on_hosted: [],
    unexpected_on_hosted: [],
    candidate_only_migrations: [],
  };

  // "I could not read the promoted tree" is not "the promoted tree is empty".
  if (!Array.isArray(expected)) {
    return { ...base, status: PARITY_STATUS.UNKNOWN, promote: false, measured: false,
      reason: "the promoted revision's migration set could not be read" };
  }
  if (Array.isArray(candidate) && Array.isArray(expected)) {
    const promoted = new Set(expected);
    base.candidate_only_migrations = candidate.filter((v) => !promoted.has(v));
  }
  if (!expected.length) {
    return { ...base, status: PARITY_STATUS.OK, promote: true, measured: true,
      reason: "promoted staging contains no migrations, so nothing is owed to the deployed primary" };
  }

  const fresh = freshness || { fresh: false, reason: "no_freshness_measured" };
  if (!fresh.fresh) {
    // STALE AND UNKNOWN BOTH BLOCK AND ARE REPORTED APART. Collapsing them is
    // how "we could not check" becomes "the database is behind" — a claim about
    // a system made from a document that stopped describing it.
    const stale = fresh.reason === "evidence_expired" || fresh.reason === "superseded_by_hosted_mutation";
    return {
      ...base,
      status: stale ? PARITY_STATUS.STALE : PARITY_STATUS.UNKNOWN,
      promote: false,
      measured: false,
      reason: fresh.detail || "hosted migration evidence is not current",
      freshness: fresh.reason,
      remedy: "re-run the hosted migration identity census",
    };
  }

  const identities = evidence?.identities;
  if (!Array.isArray(identities)) {
    return { ...base, status: PARITY_STATUS.UNKNOWN, promote: false, measured: false,
      reason: "the hosted census did not return readable migration identities" };
  }

  const window = evidence.window;
  const inWindow = (v) => !window || v >= window;
  const got = new Set(identities);
  const expectedInWindow = expected.filter(inWindow);
  base.missing_on_hosted = expectedInWindow.filter((v) => !got.has(v));
  base.unexpected_on_hosted = identities.filter((v) => !expected.includes(v));

  if (base.missing_on_hosted.length) {
    return {
      ...base,
      status: PARITY_STATUS.BLOCKED,
      promote: false,
      measured: true,
      reason: `the deployed primary is missing ${base.missing_on_hosted.length} migration(s) already promoted on staging: ${base.missing_on_hosted.join(", ")}`,
      remedy: "apply the already-promoted migrations to the deployed primary, then re-measure",
    };
  }
  return {
    ...base,
    status: PARITY_STATUS.OK,
    promote: true,
    measured: true,
    reason: base.candidate_only_migrations.length
      ? `every migration promoted on staging is present on the deployed primary; ${base.candidate_only_migrations.length} candidate-only migration(s) become due after merge`
      : `every migration promoted on staging (${expectedInWindow.length} in the measured window) is present on the deployed primary`,
  };
}
