/**
 * Staging-to-production release — the pure half.
 *
 * Every control in the release procedure (docs/platform/governance/production-release-procedure.md)
 * is a function here over OBSERVATIONS: a build-info body, a CI check list, a ledger listing, an org
 * listing, a schema fingerprint. Nothing in this file opens a connection. That split is the point:
 *
 *   - the non-live rehearsal (release-rehearsal.mjs) gathers observations from local stand-ins and
 *     feeds them through these functions, so the rehearsal exercises the real checks, not copies;
 *   - a live release gathers the same observations with the owner's read-only commands (the runbook
 *     prints them) and feeds the files to `alloy-release.mjs check-*`, which calls the same functions.
 *
 * The tool never holds a production credential and never connects to production itself.
 */

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { checkMigrationRepo } from "../migration-preflight.mjs";

// ---------------------------------------------------------------------------------------------
// The ordered procedure. The rehearsal runner and the printed runbook both walk this list, so the
// order cannot drift between the two. `production: true` steps touch production (or its stand-in);
// none of them may run before `owner.approval` has passed.
// ---------------------------------------------------------------------------------------------

export const STEPS = Object.freeze([
    { id: "candidate.identify", phase: "prepare", production: false, title: "Identify the candidate commit and its migration set" },
    { id: "staging.verify", phase: "prepare", production: false, title: "Verify staging serves the candidate, CI is green, ledger and tenancy match" },
    { id: "production.preflight", phase: "prepare", production: false, readOnly: true, title: "Read production's ledger and build-info (read-only) and plan the schema change" },
    { id: "owner.approval", phase: "execute", production: false, title: "Verify the owner's approval is bound to this manifest" },
    { id: "production.snapshot", phase: "execute", production: true, scope: "snapshot", title: "Take the rollback point (backup + fingerprint)" },
    { id: "schema.expand", phase: "execute", production: true, scope: "schema_expand", title: "Apply pending additive migrations in version order" },
    { id: "code.deploy", phase: "execute", production: true, scope: "code_deploy", title: "Fast-forward main to the candidate and wait until production serves it" },
    { id: "production.verify", phase: "execute", production: true, readOnly: true, title: "Check build identity, ledger, schema fingerprint, RLS and tenant isolation" },
    { id: "schema.contract", phase: "execute", production: true, scope: "schema_contract", title: "Apply destructive migrations, after the new code is live" },
    { id: "release.record", phase: "execute", production: false, title: "Close the audit chain and write the release record" },
]);

export const ROLLBACK_STEP = Object.freeze({ id: "code.rollback", production: true, scope: "code_rollback", title: "Serve the previous production build again" });

// Scopes the owner grants in an approval. `code_rollback` is granted with the release so a failed
// post-deploy check can be undone at once; restoring a database snapshot is never pre-granted.
export const RELEASE_SCOPES = Object.freeze(["snapshot", "schema_expand", "code_deploy", "code_rollback"]);
export const CONTRACT_SCOPE = "schema_contract";

// The first promotion (briefing D2, D9): production moves to a NEW, empty Supabase project, built by
// applying the candidate's whole chain in version order. Opt-in only (`--first-promotion`); a
// manifest without `mode` is a routine release and every function below treats it exactly as before.
export const FIRST_PROMOTION = "first_promotion";
export const isFirstPromotion = (manifest) => manifest?.mode === FIRST_PROMOTION;

// ---------------------------------------------------------------------------------------------
// Hashing and canonical form
// ---------------------------------------------------------------------------------------------

export function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
    }
    return JSON.stringify(value);
}

export const sha256 = (text) => createHash("sha256").update(text).digest("hex");
export const hashRecord = (record) => sha256(canonicalJson(record));

// ---------------------------------------------------------------------------------------------
// Git (read-only: rev-parse, ls-tree, cat-file, merge-base, diff-tree, archive)
// ---------------------------------------------------------------------------------------------

export function gitRunner(repoDir) {
    const git = (args, opts = {}) =>
        execFileSync("git", ["-C", repoDir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024, ...opts }).trimEnd();
    git.repoDir = repoDir;
    return git;
}

function revParse(git, ref) {
    try {
        return git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    } catch {
        return null;
    }
}

function isAncestor(git, a, b) {
    try {
        git(["merge-base", "--is-ancestor", a, b]);
        return true;
    } catch {
        return false;
    }
}

/** `supabase/migrations/*.sql` at a ref: version, name, path and blob id. */
export function migrationListing(git, ref) {
    const out = git(["ls-tree", "-r", ref, "--", "supabase/migrations"]);
    const rows = [];
    for (const line of out.split("\n").filter(Boolean)) {
        const [meta, path] = line.split("\t");
        const blob = meta.split(" ")[2];
        const file = path.slice("supabase/migrations/".length);
        if (file.includes("/") || !file.endsWith(".sql")) continue;
        const m = /^(\d{14})_(.+)\.sql$/.exec(file);
        rows.push({ version: m ? m[1] : null, name: m ? m[2] : file, file, blob });
    }
    return rows.sort((a, b) => a.file.localeCompare(b.file));
}

export const readBlob = (git, blob) => git(["cat-file", "blob", blob]);

/** Run the repository's own migration preflight (C1) over the candidate's tree, not the worktree's. */
export function candidatePreflight(git, ref) {
    const dir = mkdtempSync(join(tmpdir(), "alloy-release-preflight-"));
    try {
        const tar = execFileSync("git", ["-C", git.repoDir, "archive", ref, "supabase/migrations"], { maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
        execFileSync("tar", ["-x", "-C", dir], { input: tar });
        const scanned = join(dir, "supabase", "migrations");
        return existsSync(scanned) ? checkMigrationRepo(scanned) : { files: [], versions: [], failures: [] };
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * Candidate identification (step candidate.identify).
 *
 * The routine candidate is staging's head itself: `main` must be an ancestor of it, so `main`
 * fast-forwards and production receives exactly the tree staging verified. A non-routine candidate
 * (P4's integration merge) is accepted only when staging is its ancestor and its tree differs from
 * staging's in nothing but the paths the caller names — every other byte is what staging ran.
 */
export function identifyCandidate({ git, stagingRef, mainRef, candidateRef = stagingRef, allowTreeDiff = [] }) {
    const failures = [];
    const staging = revParse(git, stagingRef);
    const main = revParse(git, mainRef);
    const candidate = revParse(git, candidateRef);
    if (!staging) failures.push(`staging ref ${stagingRef} does not resolve`);
    if (!main) failures.push(`main ref ${mainRef} does not resolve`);
    if (!candidate) failures.push(`candidate ref ${candidateRef} does not resolve`);
    if (failures.length) return { ok: false, failures };

    if (!isAncestor(git, main, candidate)) {
        const extra = git(["rev-list", "--count", `${candidate}..${main}`]);
        failures.push(`main does not fast-forward to the candidate: main has ${extra} commit(s) the candidate lacks — integrate them first (P4 procedure)`);
    }
    if (!isAncestor(git, staging, candidate)) failures.push("staging's head is not contained in the candidate");

    const treeDiff = git(["diff-tree", "-r", "--name-only", "--no-commit-id", staging, candidate]).split("\n").filter(Boolean);
    const unexpected = treeDiff.filter((p) => !allowTreeDiff.includes(p));
    if (unexpected.length) failures.push(`candidate tree differs from staging's outside the allowed paths: ${unexpected.slice(0, 10).join(", ")}${unexpected.length > 10 ? ` (+${unexpected.length - 10})` : ""}`);
    if (treeDiff.some((p) => p.startsWith("supabase/migrations/"))) failures.push("candidate's migrations differ from staging's: production may only receive migrations staging applied");

    const preflight = candidatePreflight(git, candidate);
    for (const f of preflight.failures) failures.push(`migration preflight (C1): ${f}`);

    return {
        ok: failures.length === 0,
        failures,
        candidate: {
            sha: candidate,
            tree: git(["rev-parse", `${candidate}^{tree}`]),
            staging_sha: staging,
            production_before_sha: main,
            fast_forward: isAncestor(git, main, candidate),
            commits_ahead_of_main: Number(git(["rev-list", "--count", `${main}..${candidate}`])),
            tree_diff_from_staging: treeDiff,
        },
        migrations: migrationListing(git, candidate),
        baseline_migrations: migrationListing(git, main),
    };
}

// ---------------------------------------------------------------------------------------------
// Migration classification (expand / contract) and the ordered schema plan
// ---------------------------------------------------------------------------------------------

const DOLLAR_QUOTE = /\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/y;
const CREATES_ROUTINE = /\bcreate\s+(?:or\s+replace\s+)?(?:function|procedure)\b/;

/**
 * One left-to-right pass over the SQL. Comments go. A dollar-quoted body that belongs to
 * CREATE FUNCTION/PROCEDURE is stripped: a DELETE in a trigger body is code, not a migration-time
 * delete. Any other dollar-quoted body (a DO block) runs at migration time, so it is scanned like
 * the statement around it — recursively, so a function created inside a DO block is still code.
 * Inside such a body string literals are kept as their contents, because `execute 'drop table …'`
 * is how DO blocks drop things; at the top level they are blanked.
 *
 * `full` is what the migration does when it runs (destructive checks); `top` also blanks DO bodies,
 * because a statement inside one is normally behind its own existence guard (idempotency checks).
 */
function scanMigrationSql(sql, inBody = false) {
    let full = "";
    let top = "";
    let stmt = "";
    const emit = (s) => { full += s; top += s; stmt += s; };
    let i = 0;
    while (i < sql.length) {
        const ch = sql[i];
        if (ch === "-" && sql[i + 1] === "-") {
            const nl = sql.indexOf("\n", i);
            i = nl < 0 ? sql.length : nl;
            emit(" ");
        } else if (ch === "/" && sql[i + 1] === "*") {
            const end = sql.indexOf("*/", i + 2);
            i = end < 0 ? sql.length : end + 2;
            emit(" ");
        } else if (ch === "'") {
            let j = i + 1;
            let content = "";
            while (j < sql.length) {
                if (sql[j] === "'") {
                    if (sql[j + 1] !== "'") break;
                    content += "'";
                    j += 2;
                } else content += sql[j++];
            }
            i = j + 1;
            emit(inBody ? ` ${content} ` : "''");
        } else if (ch === "$" && (DOLLAR_QUOTE.lastIndex = i, DOLLAR_QUOTE.test(sql))) {
            const tag = sql.slice(i, DOLLAR_QUOTE.lastIndex);
            const end = sql.indexOf(tag, i + tag.length);
            const body = sql.slice(i + tag.length, end < 0 ? sql.length : end);
            i = end < 0 ? sql.length : end + tag.length;
            if (CREATES_ROUTINE.test(stmt.toLowerCase())) {
                emit(" $$body$$ ");
            } else {
                full += ` ${scanMigrationSql(body, true).full} `;
                top += " $$body$$ ";
                stmt += " $$body$$ ";
            }
        } else {
            emit(ch);
            if (ch === ";") stmt = "";
            i += 1;
        }
    }
    return { full: full.toLowerCase(), top: top.toLowerCase() };
}

/** What a migration does when it runs: comments, top-level strings and routine bodies stripped; DO-block bodies kept. */
export function migrationStatementText(sql) {
    return scanMigrationSql(sql).full;
}

const DESTRUCTIVE = [
    ["drop table", /\bdrop\s+table\b/],
    ["drop column", /\bdrop\s+column\b/],
    ["drop schema", /\bdrop\s+schema\b/],
    ["drop type", /\bdrop\s+type\b/],
    // Not the privilege name: `revoke delete, truncate on …`, `privilege_type in (…, 'TRUNCATE')`.
    ["truncate", /(?<![,(]\s*)\btruncate\b(?!\s*(?:,|\)|\bon\b))/],
    ["delete rows", /\bdelete\s+from\b/],
    ["rename", /\brename\s+(?:column\s+)?(?:\w+\s+)?to\b/],
    ["column type change", /\balter\s+column\s+\w+\s+(?:set\s+data\s+)?type\b/],
    ["set not null", /\bset\s+not\s+null\b/],
];

const NOT_IDEMPOTENT = [
    ["create table without IF NOT EXISTS", /\bcreate\s+table\s+(?!if\s+not\s+exists)/],
    ["create index without IF NOT EXISTS", /\bcreate\s+(?:unique\s+)?index\s+(?!if\s+not\s+exists|concurrently\s+if\s+not\s+exists)/],
    ["drop without IF EXISTS", /\bdrop\s+(?:table|view|function|index|trigger|policy|type)\s+(?!if\s+exists)/],
    ["unguarded add constraint", /\badd\s+constraint\b/],
];

/**
 * Heuristic, and deliberately biased toward `contract`: a false `contract` costs one extra approval
 * scope; a false `expand` would run a destructive change while the old code is still serving.
 */
export function classifyMigrationSql(sql) {
    const { full, top } = scanMigrationSql(sql);
    const destructive = DESTRUCTIVE.filter(([, re]) => re.test(full)).map(([label]) => label);
    const idempotency = NOT_IDEMPOTENT.filter(([, re]) => re.test(top)).map(([label]) => label);
    return { class: destructive.length ? "contract" : "expand", destructive, idempotency_warnings: idempotency };
}

/**
 * The ordered schema plan (step production.preflight, re-checked at schema.expand).
 *
 * `productionLedger` is the list of versions production has recorded, or null when nobody has read
 * it — which blocks, because "what will run" is unknowable without it (P4: production's ledger was
 * never read). `baseline` is main's listing: what production's code was built from.
 */
export function planSchema({ candidateMigrations, productionLedger, baseline = [], sqlOf, firstPromotion = false }) {
    const blockers = [];
    const warnings = [];
    if (!Array.isArray(productionLedger)) {
        return { status: "blocked", blockers: ["production_ledger_unknown: read production's supabase_migrations.schema_migrations first (read-only)"], warnings, pending: [], ledger_head: null };
    }
    if (firstPromotion) {
        // The one waiver this mode makes (contract_not_last) is safe only because nothing reads the
        // target yet. A target that records anything is not a new project: refuse outright.
        if (productionLedger.length) {
            const head = [...productionLedger].sort().at(-1);
            return { status: "blocked", blockers: [`first_promotion_ledger_not_empty: the target records ${productionLedger.length} version(s) (head ${head}); first-promotion mode runs only against a new project with an empty ledger`], warnings, pending: [], ledger_head: head, mode: FIRST_PROMOTION };
        }
        const unversioned = candidateMigrations.filter((m) => !m.version).map((m) => m.file);
        if (unversioned.length) blockers.push(`unversioned_file: ${unversioned.join(", ")} has no 14-digit version, so the chain cannot record it`);
    }
    const ledger = new Set(productionLedger);
    const ledgerHead = [...ledger].sort().at(-1) ?? null;
    const byVersion = new Map(candidateMigrations.filter((m) => m.version).map((m) => [m.version, m]));
    const baselineByVersion = new Map();
    for (const m of baseline.filter((x) => x.version)) baselineByVersion.set(m.version, [...(baselineByVersion.get(m.version) ?? []), m]);
    const baselineByBlob = new Map(baseline.map((m) => [m.blob, m]));

    const orphans = [...ledger].filter((v) => !byVersion.has(v)).sort();
    if (orphans.length) blockers.push(`ledger_orphan: production records version(s) with no candidate file: ${orphans.join(", ")} (C1 — reconcile before any push)`);

    for (const m of candidateMigrations) {
        if (!m.version || !ledger.has(m.version)) continue;
        const was = baselineByVersion.get(m.version) ?? [];
        if (was.length > 1) {
            // P4: main holds three version collisions. The ledger keys on version, so which of the files ran is unknown.
            blockers.push(`baseline_collision: main holds ${was.length} files at ${m.version} (${was.map((w) => w.file).join(", ")}); read production's ledger statements to learn which ran`);
        } else if (was.length === 1 && was[0].blob !== m.blob) {
            blockers.push(`changed_in_place: ${m.file} differs from the copy production applied; db push will not re-run it, so production's schema would silently differ from staging's`);
        }
    }

    const pending = [];
    for (const m of candidateMigrations) {
        if (!m.version || ledger.has(m.version)) continue;
        const dup = baselineByBlob.get(m.blob);
        if (dup && dup.version !== m.version && ledger.has(dup.version)) {
            const certain = (baselineByVersion.get(dup.version) ?? []).length === 1;
            blockers.push(`renumbered_duplicate: ${m.file} is byte-identical to ${dup.file}, ${certain ? "already applied" : "possibly applied (version collision)"} as ${dup.version}; it would run twice`);
        }
        if (ledgerHead && m.version < ledgerHead) blockers.push(`out_of_order: ${m.file} is older than production's ledger head ${ledgerHead}`);
        const c = classifyMigrationSql(sqlOf(m));
        pending.push({ version: m.version, name: m.name, file: m.file, blob: m.blob, class: c.class, destructive: c.destructive, idempotency_warnings: c.idempotency_warnings });
        for (const w of c.idempotency_warnings) warnings.push(`C4 ${m.file}: ${w}`);
    }
    pending.sort((a, b) => a.version.localeCompare(b.version));

    if (firstPromotion) {
        // Briefing §4 item 5: the new project serves nothing until code.deploy, so the whole chain runs
        // in version order before it, as P4 rehearsed. `expand` is "applied at schema.expand, before the
        // deploy" (every file); `contract` is "after the deploy" (none). Each file keeps its class, and
        // the destructive ones are listed so the approval must grant schema_contract for them.
        return {
            status: blockers.length ? "blocked" : pending.length ? "ready" : "noop",
            blockers,
            warnings,
            ledger_head: null,
            pending,
            expand: pending.map((p) => p.version),
            contract: [],
            destructive_in_chain: pending.filter((p) => p.class === "contract").map((p) => p.version),
            mode: FIRST_PROMOTION,
        };
    }

    // Destructive changes run after the new code is live. Versions are applied in order, so that is
    // only possible when every contract migration comes after every expand migration.
    const firstContract = pending.findIndex((p) => p.class === "contract");
    if (firstContract >= 0 && pending.slice(firstContract).some((p) => p.class === "expand")) {
        blockers.push(`contract_not_last: ${pending[firstContract].file} (${pending[firstContract].destructive.join(", ")}) precedes additive migrations; split the release so destructive changes ship after the code that stops needing the old shape`);
    }

    return {
        status: blockers.length ? "blocked" : pending.length ? "ready" : "noop",
        blockers,
        warnings,
        ledger_head: ledgerHead,
        pending,
        expand: pending.filter((p) => p.class === "expand").map((p) => p.version),
        contract: pending.filter((p) => p.class === "contract").map((p) => p.version),
    };
}

// ---------------------------------------------------------------------------------------------
// Observation parsers (the formats the owner's read-only commands produce)
// ---------------------------------------------------------------------------------------------

export const LEDGER_SQL = "select version from supabase_migrations.schema_migrations order by version;";

// A new project may not have the ledger table yet (briefing §4 item 3). This psql script (stdin,
// read-only) prints the ledger when the table exists and nothing when it does not: both mean "the
// versions this project records", so the same parser and the same ledger hash apply.
export const LEDGER_IF_PRESENT_PSQL = `select to_regclass('supabase_migrations.schema_migrations') is not null as alloy_has_ledger \\gset
\\if :alloy_has_ledger
${LEDGER_SQL}
\\endif
`;

// The ledger table as P4 step 4 created it, for a project that has none. Idempotent; written only
// inside schema.expand, after the approval.
export const LEDGER_TABLE_SQL = `create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key);
alter table supabase_migrations.schema_migrations add column if not exists statements text[];
alter table supabase_migrations.schema_migrations add column if not exists name text;
`;
export const ORGS_SQL = "select o.id::text || '|' || coalesce(to_jsonb(o)->>'status','') || '|' || coalesce(to_jsonb(o)->>'name','') from public.orgs o order by o.id;";

// The P2/P4 fingerprint (environments-p2-evidence-2026-11-25/schema-fingerprint.sql), so values
// compare with those records, plus the RLS counts the production check needs.
export const FINGERPRINT_SQL = `select 'columns_md5|' || md5(coalesce(string_agg(table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,''), ',' order by table_name, ordinal_position),'')) from information_schema.columns where table_schema='public'
union all select 'policies_md5|' || md5(coalesce(string_agg(tablename||'.'||policyname||':'||cmd||':'||array_to_string(roles,'+')||':'||coalesce(qual,'')||':'||coalesce(with_check,''), ',' order by tablename, policyname),'')) from pg_policies where schemaname='public'
union all select 'functions_md5|' || md5(coalesce(string_agg(p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', ',' order by p.proname, pg_get_function_identity_arguments(p.oid)),'')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
union all select 'indexes_md5|' || md5(coalesce(string_agg(indexdef, ',' order by indexname),'')) from pg_indexes where schemaname='public'
union all select 'tables|' || count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'
union all select 'rls_disabled|' || count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;`;

// Briefing §4 item 6, beyond the fingerprint: the required extensions (checklist C.1), the bucket,
// the deliberate P4 F8 row, and every non-empty public table's row count (step 16's baseline).
// Read-only; one `key|value` per line, like the fingerprint.
export const FIRST_PROMOTION_REQUIRED_EXTENSIONS = Object.freeze(["btree_gist", "pg_cron", "pg_net", "pgcrypto", "supabase_vault", "uuid-ossp"]);
export const FIRST_PROMOTION_CENSUS_SQL = `select 'extension:' || x.name || '|' || case when e.extname is null then 'missing' else 'present' end from unnest(array[${FIRST_PROMOTION_REQUIRED_EXTENSIONS.map((e) => `'${e}'`).join(",")}]) as x(name) left join pg_extension e on e.extname = x.name
union all select 'bucket:org_documents|' || case when to_regclass('storage.buckets') is null then 'no storage schema' when (xpath('/row/c/text()', query_to_xml('select count(*) as c from storage.buckets where id = ''org_documents''', false, true, '')))[1]::text <> '0' then 'present' else 'missing' end
union all select 'scheduled_work:clock_activation_certification|' || case when to_regclass('public.scheduled_work') is null then 'no table' else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.scheduled_work where label = ''clock_activation_certification''', false, true, '')))[1]::text end
union all select 'rows:' || t || '|' || n from (select table_name::text as t, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text as n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE') r where n <> '0';`;

/** The census's pass/fail half: every required extension and the bucket present. Row counts are recorded, not judged. */
export function checkFirstPromotionCensus(census) {
    const f = [];
    for (const e of FIRST_PROMOTION_REQUIRED_EXTENSIONS) if (census[`extension:${e}`] !== "present") f.push(`census: extension ${e} is ${census[`extension:${e}`] ?? "not observed"}`);
    if (census["bucket:org_documents"] !== "present") f.push(`census: bucket org_documents is ${census["bucket:org_documents"] ?? "not observed"}`);
    return f;
}

/**
 * One migration file plus its ledger row, for `psql -v ON_ERROR_STOP=1 --single-transaction -f -`:
 * what `supabase db push` does per file, but for exactly the versions the owner approved. The
 * rehearsal applies this same text, so the rehearsal exercises the live apply path.
 */
export function wrapMigrationForApply({ version, name, sql }) {
    const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
    return `${sql}\n;\ninsert into supabase_migrations.schema_migrations (version, name, statements) values (${q(version)}, ${q(name)}, array[${q(sql)}]);\n`;
}

const lines = (text) => String(text ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
export const parseLedger = (text) => lines(text);
export const parseKeyValue = (text) => Object.fromEntries(lines(text).map((l) => [l.slice(0, l.indexOf("|")), l.slice(l.indexOf("|") + 1)]));
export const parseOrgs = (text) => lines(text).map((l) => { const [id, status, ...name] = l.split("|"); return { id, status, name: name.join("|") }; });

/** gh's check-runs body (`gh api repos/<r>/commits/<sha>/check-runs`) or a bare array of runs. */
export const parseCheckRuns = (body) => (Array.isArray(body) ? body : body?.check_runs ?? []);

// ---------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------

function checkBuildInfo(prefix, env, buildInfo, expectSha) {
    const f = [];
    if (!buildInfo) return [`${prefix}: no build-info observation`];
    if (buildInfo.gitSha !== expectSha) f.push(`${prefix}: serves ${buildInfo.gitSha ?? "unknown"}, expected ${expectSha}`);
    if (buildInfo.gitBranch !== env.branch) f.push(`${prefix}: branch ${buildInfo.gitBranch ?? "unknown"}, expected ${env.branch}`);
    if (buildInfo.vercelEnv !== env.vercel_env) f.push(`${prefix}: vercelEnv ${buildInfo.vercelEnv ?? "unknown"}, expected ${env.vercel_env}`);
    if (buildInfo.supabaseProjectRef !== env.supabase_project_ref) f.push(`${prefix}: wired to Supabase project ${buildInfo.supabaseProjectRef ?? "unknown"}, expected ${env.supabase_project_ref}`);
    return f;
}

function compareLedger(prefix, ledger, expectedVersions) {
    if (!Array.isArray(ledger)) return [`${prefix}: ledger not observed`];
    const have = new Set(ledger);
    const want = new Set(expectedVersions);
    const missing = [...want].filter((v) => !have.has(v)).sort();
    const extra = [...have].filter((v) => !want.has(v)).sort();
    const f = [];
    if (missing.length) f.push(`${prefix}: ledger lacks ${missing.length} candidate migration(s): ${missing.slice(0, 8).join(", ")}`);
    if (extra.length) f.push(`${prefix}: ledger records ${extra.length} version(s) the candidate lacks: ${extra.slice(0, 8).join(", ")}`);
    return f;
}

/** ALY-14: Firefly is the only staging school; ZZ Alloy QA exists only for the cross-org and permission fixtures. */
export function checkStagingTenancy(tenancy, orgs) {
    const failures = [];
    const warnings = [];
    if (!Array.isArray(orgs)) return { failures: ["staging tenancy: org listing not observed"], warnings };
    const qa = new Set(tenancy.qa_fixture_orgs.map((o) => o.id));
    const firefly = orgs.find((o) => o.id === tenancy.staging_school.id);
    if (!firefly) failures.push(`staging tenancy: the staging school ${tenancy.staging_school.name} (${tenancy.staging_school.id}) is absent`);
    else if (firefly.status === "retired") failures.push(`staging tenancy: ${tenancy.staging_school.name} is retired`);
    for (const o of orgs) {
        if (o.id === tenancy.staging_school.id || qa.has(o.id)) continue;
        if (o.name.startsWith(tenancy.selftest_org_name_prefix)) {
            if (o.status !== "retired") warnings.push(`staging tenancy: self-test org ${o.name} is ${o.status || "unretired"} (P4 F3, owner decision O3)`);
            continue;
        }
        failures.push(`staging tenancy: org ${o.name} (${o.id}) is neither ${tenancy.staging_school.name} nor a ZZ Alloy QA fixture`);
    }
    return { failures, warnings };
}

/** Nothing that exists only for staging may appear in production. */
export function checkProductionTenantIsolation(tenancy, orgs) {
    const failures = [];
    if (!Array.isArray(orgs)) return ["production tenancy: org listing not observed"];
    const qa = new Map(tenancy.qa_fixture_orgs.map((o) => [o.id, o.name]));
    for (const o of orgs) {
        if (qa.has(o.id)) failures.push(`production tenancy: QA fixture org ${qa.get(o.id)} (${o.id}) is present`);
        if (o.id.startsWith(tenancy.staging_seed_id_prefix)) failures.push(`production tenancy: staging-seed namespace org ${o.id} is present`);
        if (o.name.startsWith(tenancy.selftest_org_name_prefix) && o.status !== "retired") failures.push(`production tenancy: self-test org ${o.name} is ${o.status || "unretired"}`);
    }
    return failures;
}

/** Step staging.verify. */
export function checkStaging({ config, candidate, migrations, buildInfo, checkRuns, ledger, orgs }) {
    const failures = [];
    failures.push(...checkBuildInfo("staging", config.environments.staging, buildInfo, candidate.staging_sha));
    const runs = parseCheckRuns(checkRuns);
    for (const name of config.required_checks) {
        const run = runs.find((r) => r.name === name && r.head_sha === candidate.sha);
        if (!run) failures.push(`CI: required check ${name} has no run on the candidate ${candidate.sha.slice(0, 12)}`);
        else if (run.status !== "completed" || run.conclusion !== "success") failures.push(`CI: required check ${name} is ${run.status}/${run.conclusion ?? "none"}`);
    }
    failures.push(...compareLedger("staging", ledger, migrations.map((m) => m.version)));
    const tenancy = checkStagingTenancy(config.tenancy, orgs);
    failures.push(...tenancy.failures);
    return { ok: failures.length === 0, failures, warnings: tenancy.warnings };
}

/**
 * Step production.preflight: production still serves the build the manifest says it does. In a
 * first promotion that build is still wired to the PREVIOUS project (the config copy names it), and
 * the new project's public schema must be empty when a fingerprint was observed.
 */
export function checkProductionBefore({ config, candidate, buildInfo, firstPromotion = false, fingerprint }) {
    const env = config.environments.production;
    if (!firstPromotion) {
        const failures = checkBuildInfo("production (before)", env, buildInfo, candidate.production_before_sha);
        return { ok: failures.length === 0, failures };
    }
    const failures = firstPromotionConfigRefusal(config);
    if (failures.length) return { ok: false, failures };
    failures.push(...checkBuildInfo("production (before)", { ...env, supabase_project_ref: env.previous_supabase_project_ref }, buildInfo, candidate.production_before_sha));
    if (fingerprint && fingerprint.tables !== "0") failures.push(`first promotion: the new project's public schema already holds ${fingerprint.tables ?? "unknown"} table(s); it must be empty`);
    return { ok: failures.length === 0, failures };
}

const SUPABASE_REF = /^[a-z]{20}$/;

/**
 * The config a first promotion runs with: a release-directory copy (alloy-release
 * first-promotion-config) whose production names the NEW project and records the previous one.
 * Returns failures (empty when usable).
 */
export function firstPromotionConfigRefusal(config) {
    const p = config?.environments?.production ?? {};
    const s = config?.environments?.staging ?? {};
    const f = [];
    if (!p.previous_supabase_project_ref) f.push("first promotion: the config names no production.previous_supabase_project_ref; use the release-directory copy (alloy-release first-promotion-config)");
    if (!SUPABASE_REF.test(p.supabase_project_ref ?? "")) f.push(`first promotion: production.supabase_project_ref ${p.supabase_project_ref ?? "(none)"} is not a Supabase project ref`);
    if (p.supabase_project_ref && p.supabase_project_ref === p.previous_supabase_project_ref) f.push("first promotion: the config's production project is the previous project, not a new one");
    if (p.supabase_project_ref && p.supabase_project_ref === s.supabase_project_ref) f.push("first promotion: the config's production project is staging's project");
    return f;
}

/** A first-promotion manifest binds its project refs; a config naming others cannot check or record it. */
export function manifestConfigMismatch(manifest, config) {
    if (!isFirstPromotion(manifest)) return [];
    const p = config.environments.production;
    const fp = manifest.first_promotion;
    const f = [];
    if (p.supabase_project_ref !== fp.new_supabase_project_ref) f.push(`config: production names ${p.supabase_project_ref}, the manifest's new project is ${fp.new_supabase_project_ref}`);
    if (p.previous_supabase_project_ref !== fp.previous_supabase_project_ref) f.push(`config: previous project ${p.previous_supabase_project_ref ?? "(none)"}, the manifest's is ${fp.previous_supabase_project_ref}`);
    return f;
}

/** The release-directory config copy for a first promotion: the committed policy, production on the new ref. */
export function firstPromotionConfig(base, newRef) {
    const prev = base.environments.production.supabase_project_ref;
    const config = {
        ...base,
        environments: {
            ...base.environments,
            production: { ...base.environments.production, supabase_project_ref: newRef, previous_supabase_project_ref: prev },
        },
        derived_from_sha256: hashRecord(base),
    };
    const refusal = firstPromotionConfigRefusal(config);
    if (refusal.length) throw new Error(refusal.join("; "));
    return config;
}

/** D3: in a first promotion no tenant exists until step 16; the only org a migration creates is the retired self-test org. */
export function checkNoTenantYet(tenancy, orgs) {
    if (!Array.isArray(orgs)) return ["first promotion: org listing not observed"];
    return orgs
        .filter((o) => !(o.name.startsWith(tenancy.selftest_org_name_prefix) && o.status === "retired"))
        .map((o) => `first promotion: org ${o.name} (${o.id}) exists before tenant creation; only the retired ${tenancy.selftest_org_name_prefix} org may`);
}

/** Step production.verify (and again after schema.contract). */
export function checkProduction({ config, candidate, buildInfo, ledger, expectedVersions, fingerprint, expectedFingerprint, orgs, firstPromotion = false }) {
    const failures = checkBuildInfo("production", config.environments.production, buildInfo, candidate.sha);
    failures.push(...checkTargetSchema({ config, ledger, expectedVersions, fingerprint, expectedFingerprint, orgs, firstPromotion }).failures);
    return { ok: failures.length === 0, failures };
}

/** production.verify without the build identity: the schema census a first promotion runs before code.deploy (briefing §4 item 6). */
export function checkTargetSchema({ config, ledger, expectedVersions, fingerprint, expectedFingerprint, orgs, firstPromotion = false }) {
    const failures = [];
    failures.push(...compareLedger("production", ledger, expectedVersions));
    if (!fingerprint) failures.push("production: schema fingerprint not observed");
    else {
        if (fingerprint.rls_disabled !== "0") failures.push(`production: ${fingerprint.rls_disabled} public table(s) without RLS`);
        if (expectedFingerprint) {
            for (const k of Object.keys(expectedFingerprint)) {
                if (fingerprint[k] !== expectedFingerprint[k]) failures.push(`production: schema fingerprint ${k} is ${fingerprint[k]}, staging's is ${expectedFingerprint[k]}`);
            }
        }
    }
    failures.push(...checkProductionTenantIsolation(config.tenancy, orgs));
    if (firstPromotion) failures.push(...checkNoTenantYet(config.tenancy, orgs));
    return { ok: failures.length === 0, failures };
}

// ---------------------------------------------------------------------------------------------
// Manifest and owner approval
// ---------------------------------------------------------------------------------------------

export function buildManifest({ environment, identified, plan, stagingVerification, createdAt, config }) {
    const manifest = {
        schema: "alloy.release-manifest/v1",
        environment,
        created_at: createdAt,
        candidate: identified.candidate,
        migrations: {
            candidate_count: identified.migrations.length,
            candidate_head: identified.migrations.map((m) => m.version).filter(Boolean).sort().at(-1) ?? null,
            production_ledger_head: plan.ledger_head,
            pending: plan.pending,
            expand: plan.expand,
            contract: plan.contract,
            warnings: plan.warnings,
        },
        staging_verification_sha256: hashRecord(stagingVerification),
        staging_verified_at: stagingVerification.verified_at,
    };
    if (plan.mode !== FIRST_PROMOTION) return manifest;
    const p = config.environments.production;
    manifest.mode = FIRST_PROMOTION;
    manifest.migrations.destructive_in_chain = plan.destructive_in_chain;
    manifest.first_promotion = { new_supabase_project_ref: p.supabase_project_ref, previous_supabase_project_ref: p.previous_supabase_project_ref, config_sha256: hashRecord(config) };
    return manifest;
}

export function scopesFor(manifest) {
    const destructive = manifest.migrations.contract.length || manifest.migrations.destructive_in_chain?.length;
    return destructive ? [...RELEASE_SCOPES, CONTRACT_SCOPE] : [...RELEASE_SCOPES];
}

export function makeApproval({ environment, approver, manifest, approvedAt, ttlHours, scope = scopesFor(manifest), statement }) {
    const approved = new Date(approvedAt);
    return {
        schema: "alloy.release-approval/v1",
        environment,
        approver: { name: approver, role: "owner" },
        candidate_sha: manifest.candidate.sha,
        production_before_sha: manifest.candidate.production_before_sha,
        manifest_sha256: hashRecord(manifest),
        staging_verification_sha256: manifest.staging_verification_sha256,
        pending_migrations: manifest.migrations.pending.map((p) => p.version),
        scope,
        approved_at: approved.toISOString(),
        expires_at: new Date(approved.getTime() + ttlHours * 3600_000).toISOString(),
        statement: statement ?? (isFirstPromotion(manifest)
            ? `I approve the first promotion of ${manifest.candidate.sha} to ${environment} on the new project ${manifest.first_promotion.new_supabase_project_ref}, replacing ${manifest.candidate.production_before_sha} on ${manifest.first_promotion.previous_supabase_project_ref} (left untouched), with the full chain of ${manifest.migrations.pending.length} migration(s) applied in version order.`
            : `I approve releasing ${manifest.candidate.sha} to ${environment}, replacing ${manifest.candidate.production_before_sha}, with ${manifest.migrations.pending.length} migration(s).`),
    };
}

/** Step owner.approval, re-run before every production step. */
export function verifyApproval({ approval, manifest, config, environment, now, scopeNeeded }) {
    const f = [];
    if (!approval) return { ok: false, failures: ["no owner approval recorded"] };
    if (approval.schema !== "alloy.release-approval/v1") f.push("approval: unknown schema");
    if (approval.environment !== environment) f.push(`approval: given for ${approval.environment}, this release targets ${environment}`);
    if (!config.owners.includes(approval.approver?.name) || approval.approver?.role !== "owner") f.push(`approval: ${approval.approver?.name ?? "nobody"} is not a configured owner`);
    if (approval.manifest_sha256 !== hashRecord(manifest)) f.push("approval: bound to a different manifest (candidate, plan or staging verification changed since approval)");
    if (approval.candidate_sha !== manifest.candidate.sha) f.push("approval: names a different candidate");
    if (approval.staging_verification_sha256 !== manifest.staging_verification_sha256) f.push("approval: bound to a different staging verification");
    const at = Date.parse(approval.approved_at);
    const exp = Date.parse(approval.expires_at);
    const t = Date.parse(now);
    if (!(at >= Date.parse(manifest.staging_verified_at))) f.push("approval: predates the staging verification it relies on");
    if (!(t >= at)) f.push("approval: dated in the future");
    if (!(t < exp)) f.push(`approval: expired at ${approval.expires_at}`);
    if (!(exp - at <= config.approval_max_ttl_hours * 3600_000)) f.push(`approval: validity exceeds ${config.approval_max_ttl_hours}h`);
    if (scopeNeeded && !approval.scope?.includes(scopeNeeded)) f.push(`approval: does not grant ${scopeNeeded}`);
    return { ok: f.length === 0, failures: f };
}

// ---------------------------------------------------------------------------------------------
// Audit evidence: an append-only, hash-chained JSONL log
// ---------------------------------------------------------------------------------------------

export class AuditLog {
    constructor(path) {
        this.path = path;
        this.entries = existsSync(path) ? lines(readFileSync(path, "utf8")).map((l) => JSON.parse(l)) : [];
    }
    get head() {
        return this.entries.at(-1)?.entry_sha256 ?? null;
    }
    append(step, status, detail = {}, at = new Date().toISOString()) {
        const body = { seq: this.entries.length + 1, at, step, status, detail, prev_sha256: this.head };
        const entry = { ...body, entry_sha256: hashRecord(body) };
        appendFileSync(this.path, `${JSON.stringify(entry)}\n`);
        this.entries.push(entry);
        return entry;
    }
}

export function verifyAuditChain(text) {
    const failures = [];
    const entries = lines(text).map((l) => JSON.parse(l));
    let prev = null;
    entries.forEach((e, i) => {
        const { entry_sha256, ...body } = e;
        if (body.seq !== i + 1) failures.push(`entry ${i + 1}: seq ${body.seq}`);
        if (body.prev_sha256 !== prev) failures.push(`entry ${i + 1}: chain broken (prev ${body.prev_sha256}, expected ${prev})`);
        if (hashRecord(body) !== entry_sha256) failures.push(`entry ${i + 1}: content does not match its hash`);
        prev = entry_sha256;
    });
    return { ok: failures.length === 0, failures, entries: entries.length, head: prev };
}

// ---------------------------------------------------------------------------------------------
// Rehearsal fence
// ---------------------------------------------------------------------------------------------

const REAL_PROJECT_REFS = ["vslwnntzzgpnmrpjipat", "ikaxilmwmrmbagoidedu"];
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** A rehearsal may name no real project and reach nothing but loopback. Returns a refusal or null. */
export function rehearsalConfigRefusal(config) {
    for (const [name, env] of Object.entries(config.environments)) {
        if (REAL_PROJECT_REFS.includes(env.supabase_project_ref)) return `rehearsal ${name} names a real Supabase project (${env.supabase_project_ref})`;
        let url;
        try {
            url = new URL(env.build_info_url);
        } catch {
            return `rehearsal ${name} build_info_url does not parse`;
        }
        if (!LOOPBACK.has(url.hostname)) return `rehearsal ${name} build_info_url is not loopback (${url.hostname})`;
    }
    return null;
}
