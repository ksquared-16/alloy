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
