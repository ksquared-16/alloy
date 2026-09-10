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
