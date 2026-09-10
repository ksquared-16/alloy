/**
 * REGISTER WHAT IS ALREADY THERE — AND NOTHING ELSE.
 *
 * ── WHY THIS CAPABILITY EXISTS ──
 *
 * A trusted-host apply physically applied three migrations to the deployed
 * primary and did not register them in the canonical ledger, because the apply
 * runner executes psql and nothing anywhere writes
 * supabase_migrations.schema_migrations. That is G5, and it is not fixed here.
 * What it left behind is a database whose SCHEMA is ahead of its LEDGER, and no
 * sanctioned way to say so: read_census cannot write, apply_migration refuses
 * production, apply_promoted_migration takes only committed migration files and
 * rejects arbitrary SQL, and a ledger-repair MIGRATION would need registering
 * itself, which is the same problem wearing a hat.
 *
 * ── WHAT IT IS NOT ──
 *
 * Not a SQL executor, not a migration executor, not a schema mutation, not a way
 * to skip applying a migration, and above all not a way to forge history. It
 * registers a version ONLY when independent governed evidence already proves the
 * migration's effects are physically present and match the approved artifact.
 * The claim it writes is "this ran"; it must never be the thing that makes that
 * claim true.
 *
 * ── WHY THE EXECUTOR OWNS THE SQL ──
 *
 * The caller names versions. It never supplies SQL, a row shape, a name or a
 * statements body — all of those are derived here from the approved git object,
 * so a request cannot describe a ledger row that does not correspond to the
 * artifact it claims. The generated statement is one transaction that checks the
 * pre-state, inserts, re-checks the post-state, and only then commits: either
 * all three versions register or none does, enforced by the database rather than
 * by this code being careful.
 */
import { createHash, randomBytes } from "node:crypto";

export const REPAIR_LEDGER_ACTION_KEY = "database.repair_migration_ledger";

/** Exactly the production targets this capability may reconcile. */
export const LEDGER_REPAIR_TARGETS = Object.freeze(["alloy_deployed_primary"]);

/** The ledger table, named once. */
export const LEDGER_RELATION = "supabase_migrations.schema_migrations";

const norm = (v) => String(v ?? "").trim().toLowerCase();

/**
 * The canonical name an installed Supabase ledger row carries.
 *
 * MEASURED, NOT ASSUMED: the five rows adjacent to this repair
 * (20260909200000 through 240000) hold the migration filename with its version
 * prefix and `.sql` removed — `payment_provider_refunds`,
 * `financials_read_for_director_roles`. A repair whose rows do not look like
 * that is a repair a later reader cannot trust.
 */
export function canonicalLedgerName(pathRel) {
  const file = String(pathRel || "").split("/").pop() || "";
  const m = /^(\d{14})_(.+)\.sql$/.exec(file);
  return m ? m[2] : null;
}

/**
 * The eleven preconditions, every one fail-closed.
 *
 * Evidence is PASSED IN rather than gathered here, because every piece of it is
 * a governed measurement that already exists: the parity gap from the hosted
 * identity census, the physical proof from the physical-state census, the
 * pre-state from both. This function's job is to refuse unless they all agree —
 * not to become a second source of any of them.
 */
export function assertLedgerRepairPreconditions({
  normalized = null,
  parity = null,
  physical = null,
  ledgerHead = null,
  ledgerCount = null,
  expectedHead = null,
  expectedCount = null,
  expectedPostHead = null,
  expectedPostCount = null,
} = {}) {
  const refuse = (code, detail) => ({ ok: false, code, detail });

  // 1 — the target is exactly a registered production target for THIS capability.
  const target = norm(normalized?.target);
  if (!LEDGER_REPAIR_TARGETS.includes(target)) {
    return refuse("target_not_registered_for_ledger_repair",
      `${target || "(none)"} is not a target this capability may reconcile.`);
  }
  // 2 — an exact source sha.
  if (!/^[0-9a-f]{40}$/i.test(String(normalized?.expectedSha || ""))) {
    return refuse("missing_exact_source_sha", "A full 40-character source SHA is required.");
  }
  const requested = (normalized?.migrations || []).map((m) => String(m.version));
  if (!requested.length) return refuse("no_versions_requested", "A repair must name the versions it registers.");

  // 3 — each migration resolved out of the approved git object.
  for (const m of (normalized.migrations || [])) {
    if (!m.fileSha || !m.text) {
      return refuse("migration_not_in_approved_source",
        `No committed artifact resolved for ${m.version} at ${normalized.expectedSha}.`);
    }
    if (!canonicalLedgerName(m.path)) {
      return refuse("uncanonical_migration_filename", `${m.path} is not <version>_<name>.sql`);
    }
  }
  // 9/10 — strictly ascending, no duplicates.
  const sorted = [...requested].sort();
  if (sorted.join(",") !== requested.join(",")) {
    return refuse("nondeterministic_version_order", "Versions must be strictly ascending.");
  }
  if (new Set(requested).size !== requested.length) {
    return refuse("duplicate_version_requested", "A version may appear once.");
  }

  // 4 — every requested version is in the MEASURED parity gap. A version the
  // hosted measurement does not report missing has no business being registered.
  if (!parity || parity.status !== "blocked") {
    return refuse("parity_not_behind",
      `Hosted parity must report BEHIND for a ledger repair; it reports ${parity?.status || "nothing"}.`);
  }
  const missing = (parity.missing || []).map(String);
  const notInGap = requested.filter((v) => !missing.includes(v));
  if (notInGap.length) {
    return refuse("version_not_in_measured_gap",
      `Requested ${notInGap.join(", ")} which the hosted measurement does not report missing.`);
  }
  // 11 — nothing unexpected in the gap either: registering three while a fourth
  // is missing would leave a ledger that is still not the truth.
  const gapNotRequested = missing.filter((v) => !requested.includes(v));
  if (gapNotRequested.length) {
    return refuse("unexpected_missing_version",
      `The hosted gap also contains ${gapNotRequested.join(", ")}, which this repair does not cover.`);
  }

  // 5/6 — the ledger is exactly where the approval said it was.
  if (String(ledgerHead || "") !== String(expectedHead || "")) {
    return refuse("ledger_head_changed",
      `Ledger head is ${ledgerHead}; the approval was given for ${expectedHead}.`);
  }
  if (Number(ledgerCount) !== Number(expectedCount)) {
    return refuse("ledger_count_changed",
      `Ledger count is ${ledgerCount}; the approval was given for ${expectedCount}.`);
  }

  // 7/8 — physical proof, per version, and it must MATCH rather than merely exist.
  if (!physical || typeof physical !== "object") {
    return refuse("missing_physical_state_proof",
      "A governed physical-state census must prove the effects are already present.");
  }
  for (const v of requested) {
    const p = physical[v];
    if (!p) return refuse("missing_physical_state_proof", `No physical-state evidence for ${v}.`);
    if (p.classification !== "PHYSICALLY_PRESENT") {
      return refuse("physical_state_not_present",
        `${v} is ${p.classification || "unclassified"}; only a fully present migration may be registered.`);
    }
    if (Number(p.mismatches) !== 0) {
      return refuse("physical_definition_mismatch",
        `${v} has ${p.mismatches} observed definition(s) that do not match the certified migration.`);
    }
  }

  // The post-state the approval promised must be arithmetically consistent with
  // what is being written, or the approval and the action mean different things.
  if (Number(expectedPostCount) !== Number(expectedCount) + requested.length) {
    return refuse("post_state_inconsistent",
      `Expected post-count ${expectedPostCount} does not equal ${expectedCount} plus ${requested.length}.`);
  }
  if (String(expectedPostHead || "") !== sorted[sorted.length - 1]) {
    return refuse("post_state_inconsistent",
      `Expected post-head ${expectedPostHead} is not the highest registered version ${sorted[sorted.length - 1]}.`);
  }

  return { ok: true, target, versions: requested };
}

/**
 * ONE TRANSACTION THAT CHECKS, WRITES, RE-CHECKS, AND ONLY THEN COMMITS.
 *
 * The guards are inside the transaction on purpose. Checking in JavaScript and
 * then writing would leave a window in which the ledger moved between the two,
 * and this is precisely the situation where another writer's row must abort the
 * repair rather than be papered over. Postgres enforces all-or-nothing; this
 * code does not have to be careful for it.
 *
 * The file text is dollar-quoted with a random tag, and the tag is asserted
 * absent from the text first — a migration that happened to contain the tag
 * would otherwise terminate the literal early and change what executes.
 */
export function buildLedgerRepairSql({
  migrations = [],
  expectedHead = null,
  expectedCount = null,
  expectedPostHead = null,
  expectedPostCount = null,
} = {}) {
  const rows = [];
  for (const m of migrations) {
    const name = canonicalLedgerName(m.path);
    const text = String(m.text ?? "");
    let tag = `vac_${randomBytes(8).toString("hex")}`;
    // Astronomically unlikely, and checked anyway: a tag inside the body would
    // end the literal early.
    let guard = 0;
    while (text.includes(`$${tag}$`) && guard < 8) { tag = `vac_${randomBytes(8).toString("hex")}`; guard += 1; }
    if (text.includes(`$${tag}$`)) {
      return { ok: false, code: "quote_tag_collision", detail: `Could not find a safe quoting tag for ${m.version}.` };
    }
    rows.push(
      `    ('${m.version}', '${name.replace(/'/g, "''")}', ARRAY[$${tag}$${text}$${tag}$]::text[])`,
    );
  }
  const versionList = migrations.map((m) => `'${m.version}'`).join(", ");

  const sql = `-- Generated by database.repair_migration_ledger. Registers versions whose
-- physical effects were independently proven present. Applies no migration and
-- creates no schema object.
BEGIN;

DO $vacpre$
BEGIN
    IF (SELECT count(*) FROM ${LEDGER_RELATION}) <> ${Number(expectedCount)} THEN
        RAISE EXCEPTION 'ledger_count_changed: approved for ${Number(expectedCount)}, found %',
            (SELECT count(*) FROM ${LEDGER_RELATION});
    END IF;
    IF (SELECT coalesce(max(version), 'none') FROM ${LEDGER_RELATION}) <> '${expectedHead}' THEN
        RAISE EXCEPTION 'ledger_head_changed: approved for ${expectedHead}, found %',
            (SELECT coalesce(max(version), 'none') FROM ${LEDGER_RELATION});
    END IF;
    IF EXISTS (SELECT 1 FROM ${LEDGER_RELATION} WHERE version IN (${versionList})) THEN
        RAISE EXCEPTION 'version_already_registered: a target version is already present';
    END IF;
END
$vacpre$;

INSERT INTO ${LEDGER_RELATION} (version, name, statements)
VALUES
${rows.join(",\n")};

DO $vacpost$
BEGIN
    IF (SELECT count(*) FROM ${LEDGER_RELATION}) <> ${Number(expectedPostCount)} THEN
        RAISE EXCEPTION 'post_count_mismatch: expected ${Number(expectedPostCount)}, found %',
            (SELECT count(*) FROM ${LEDGER_RELATION});
    END IF;
    IF (SELECT max(version) FROM ${LEDGER_RELATION}) <> '${expectedPostHead}' THEN
        RAISE EXCEPTION 'post_head_mismatch: expected ${expectedPostHead}, found %',
            (SELECT max(version) FROM ${LEDGER_RELATION});
    END IF;
END
$vacpost$;

COMMIT;
`;
  return { ok: true, sql, sqlHash: createHash("sha256").update(sql).digest("hex") };
}

/**
 * REQUEST VALIDATION.
 *
 * Artifact resolution is delegated to the SAME core the migration apply paths
 * use — a real commit, promoted lineage, canonical paths, no duplicate
 * versions, content resolved from the git object store. Copying that would give
 * this capability a second, weaker idea of what "the approved artifact" means,
 * which is the last thing a history-writing action should have.
 *
 * What is added is this capability's own contract: exactly one registered
 * production target, and the approved pre/post ledger state, which the operator
 * is approving as much as the version list.
 */
export function validateLedgerRepairInputs(inputs = {}, { core, repoRoot = null } = {}) {
  if (inputs.sql || inputs.statement || inputs.body || inputs.database_url || inputs.databaseUrl) {
    return { ok: false, code: "arbitrary_sql_rejected", detail: "This action never accepts SQL." };
  }
  const target = norm(inputs.target || inputs.environment || "");
  if (!target) return { ok: false, code: "missing_target", detail: "target is required." };
  if (!LEDGER_REPAIR_TARGETS.includes(target)) {
    return {
      ok: false, code: "target_not_registered_for_ledger_repair",
      detail: `${REPAIR_LEDGER_ACTION_KEY} reconciles only: ${LEDGER_REPAIR_TARGETS.join(", ")}`,
    };
  }
  const expected = inputs.expectedLedger || inputs.expected_ledger || {};
  const nums = {
    head: String(expected.head ?? expected.ledgerHead ?? "").trim(),
    count: Number(expected.count ?? expected.ledgerCount),
    postHead: String(expected.postHead ?? expected.post_head ?? "").trim(),
    postCount: Number(expected.postCount ?? expected.post_count),
  };
  if (!nums.head || !Number.isFinite(nums.count) || !nums.postHead || !Number.isFinite(nums.postCount)) {
    return {
      ok: false, code: "missing_expected_ledger_state",
      detail: "expectedLedger requires head, count, postHead and postCount: the operator approves a STATE, not only a version list.",
    };
  }
  const resolved = core(inputs, {
    environment: target,
    actionType: REPAIR_LEDGER_ACTION_KEY,
    repoRoot: repoRoot || inputs.worktreePath || inputs.worktree_path,
  });
  if (!resolved.ok) return resolved;

  return {
    ok: true,
    normalized: {
      ...resolved.normalized,
      target,
      expectedLedger: nums,
      dedupeKey: `ledger-repair:${target}:${resolved.normalized.expectedSha.slice(0, 12)}:${
        resolved.normalized.migrations.map((m) => m.version).join(",")
      }`,
    },
  };
}

/** The census artifact whose rows carry physical state AND ledger truth together. */
export const PHYSICAL_STATE_ARTIFACT = "thread8c-physical-state-census.sql";

/**
 * Read the evidence this repair depends on out of governed census records.
 *
 * ── WHY ONE CENSUS, NOT TWO ──
 *
 * The physical-state census was deliberately built to return the ledger head,
 * the ledger total, the presence of each target version AND the physical checks
 * in a single result, so that "the schema has it" and "the ledger does not" can
 * never be read from two different moments. This consumes that property: a
 * repair authorised against a state must be executed against the same state,
 * and two censuses taken minutes apart are two states.
 *
 * ── AND WHY IT PARSES RATHER THAN TRUSTS ──
 *
 * Every physical row carries `object ~ expected ~ observed ~ match`. A version
 * counts as present only when it has rows and EVERY row matched; anything else
 * is partial, which this capability refuses. Rows are the census's own words —
 * nothing here re-derives what the database contains.
 */
export function ledgerRepairEvidenceFromCensus(census, { versions = [] } = {}) {
  const questions = census?.questions || {};
  const rowsOf = (id) => (questions[id]?.rows || []).map(String);

  const head = rowsOf("ledger_head")[0] || null;
  const totalRaw = rowsOf("ledger_total")[0];
  const count = Number.isFinite(Number(totalRaw)) ? Number(totalRaw) : null;
  if (!head || count == null) {
    return { ok: false, code: "census_missing_ledger_truth", detail: "The census carries no ledger head/total." };
  }

  // Which target versions the ledger still lacks — the census's own answer,
  // not a comparison assembled here.
  const missing = [];
  for (const row of rowsOf("ledger_version")) {
    const [version, , , match] = row.split(" ~ ");
    if (String(match).trim() === "false") missing.push(String(version).trim());
  }

  const physical = {};
  for (const v of versions) {
    const key = `m${String(v).slice(-6)}`;
    const rows = rowsOf(key);
    if (!rows.length) {
      physical[v] = { classification: "PHYSICALLY_ABSENT", mismatches: 0, checks: 0 };
      continue;
    }
    const mismatches = rows.filter((r) => String(r).split(" ~ ").pop().trim() !== "true").length;
    physical[v] = {
      classification: mismatches === 0 ? "PHYSICALLY_PRESENT" : "PARTIALLY_PRESENT",
      mismatches,
      checks: rows.length,
    };
  }

  return {
    ok: true,
    ledgerHead: head,
    ledgerCount: count,
    // Parity is BEHIND precisely when the ledger lacks versions the promoted
    // revision requires; the census names them.
    parity: { status: missing.length ? "blocked" : "ok", missing },
    physical,
  };
}
