/**
 * Non-live stand-ins for the release procedure. Nothing here reaches a real environment:
 *
 *   - databases: one throwaway `postgres:17-alpine` container, `--network none`, data on tmpfs,
 *     labelled alloy.purpose=p6-release-rehearsal; reached only by `docker exec`. Not the shared
 *     alloy-cert stack, and `supabase start` is never run.
 *   - "origin": a local bare clone. code.deploy is a compare-and-swap `update-ref` there (no push).
 *   - "Vercel": a loopback HTTP server whose production build-info follows origin's main, unless an
 *     instant rollback pins the previous build, exactly as Vercel's Instant Rollback does.
 *   - project refs are invented (`rehearsal…`); rehearsalConfigRefusal rejects the real ones.
 */

import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FINGERPRINT_SQL, FIRST_PROMOTION_CENSUS_SQL, LEDGER_IF_PRESENT_PSQL, LEDGER_SQL, ORGS_SQL, parseKeyValue, parseLedger, parseOrgs, rehearsalConfigRefusal, wrapMigrationForApply } from "./release-lib.mjs";

export const REHEARSAL_LABEL = "alloy.purpose=p6-release-rehearsal";
export const REHEARSAL_IMAGE = "postgres:17-alpine";

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024, ...opts });

export function dockerAvailable() {
    try {
        sh("docker", ["image", "inspect", REHEARSAL_IMAGE]);
        return true;
    } catch {
        return false;
    }
}

export class ThrowawayPostgres {
    constructor(name = `alloy-p6-release-rehearsal-${process.pid}-${Date.now()}`) {
        this.name = name;
    }
    start() {
        sh("docker", ["run", "-d", "--rm", "--name", this.name, "--label", REHEARSAL_LABEL, "--network", "none", "--tmpfs", "/var/lib/postgresql/data", "-e", "POSTGRES_PASSWORD=rehearsal-only", REHEARSAL_IMAGE]);
        for (let i = 0; i < 120; i++) {
            try {
                sh("docker", ["exec", this.name, "pg_isready", "-U", "postgres", "-h", "127.0.0.1"]);
                sh("docker", ["exec", this.name, "psql", "-U", "postgres", "-h", "127.0.0.1", "-Atc", "select 1"]);
                return this;
            } catch {
                execFileSync("sleep", ["0.25"]);
            }
        }
        throw new Error("throwaway postgres did not become ready");
    }
    stop() {
        try {
            sh("docker", ["rm", "-f", this.name]);
        } catch {}
    }
    psql(db, sql, { singleTransaction = false } = {}) {
        const args = ["exec", "-i", this.name, "psql", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-q", "-At", "-X"];
        if (singleTransaction) args.push("--single-transaction");
        return sh("docker", [...args, "-f", "-"], { input: sql }).trim();
    }
    /** `ledger: false` is a new project: no ledger table at all (briefing §4 item 3). */
    createDb(db, { ledger = true } = {}) {
        this.psql("postgres", `create database ${db};`);
        if (ledger) this.psql(db, "create schema supabase_migrations; create table supabase_migrations.schema_migrations (version text primary key, name text, statements text[]);");
    }
    /** As `supabase db push` does per file: the file and its ledger row in one transaction. */
    applyMigration(db, migration) {
        this.psql(db, wrapMigrationForApply(migration), { singleTransaction: true });
    }
    /** `tolerant`: a new project may have no ledger table and no orgs table yet; both read as empty. */
    observe(db, { tolerant = false } = {}) {
        const hasOrgs = () => this.psql(db, "select to_regclass('public.orgs') is not null;") === "t";
        return {
            ledger: parseLedger(this.psql(db, tolerant ? LEDGER_IF_PRESENT_PSQL : LEDGER_SQL)),
            orgs: !tolerant || hasOrgs() ? parseOrgs(this.psql(db, ORGS_SQL)) : [],
            fingerprint: parseKeyValue(this.psql(db, FINGERPRINT_SQL)),
        };
    }
    dump(db) {
        const path = `/tmp/${db}.dump`;
        sh("docker", ["exec", this.name, "pg_dump", "-U", "postgres", "-Fc", "-d", db, "-f", path]);
        const sha = sh("docker", ["exec", this.name, "sha256sum", path]).split(" ")[0];
        return { path: `container:${path}`, sha256: sha };
    }
    restore(dumpPath, db) {
        this.psql("postgres", `create database ${db};`);
        sh("docker", ["exec", this.name, "pg_restore", "-U", "postgres", "-d", db, "--no-owner", dumpPath.replace(/^container:/, "")]);
    }
}

/** Loopback "Vercel": staging serves origin's staging; production serves origin's main unless pinned. */
export async function startBuildInfoServer({ originGitDir, refs }) {
    const state = { pin: null, staleProduction: false, previousProduction: null };
    const head = (branch) => sh("git", ["--git-dir", originGitDir, "rev-parse", `refs/heads/${branch}`]).trim();
    const server = createServer((req, res) => {
        const [, env] = req.url.split("/");
        let body;
        if (env === "staging") body = { gitSha: head("staging"), gitBranch: "staging", vercelEnv: "preview", supabaseProjectRef: refs.staging };
        else if (env === "production") {
            const sha = state.pin ?? (state.staleProduction ? state.previousProduction : head("main"));
            // First promotion: the previous build stays wired to the previous project (a Vercel
            // deployment keeps the environment it was built with); the new build names the new one.
            const ref = refs.productionPrevious && sha === state.previousProduction ? refs.productionPrevious : refs.production;
            body = { gitSha: sha, gitBranch: "main", vercelEnv: "production", supabaseProjectRef: ref };
        } else {
            res.writeHead(404).end();
            return;
        }
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(body));
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address();
    state.previousProduction = head("main");
    return { state, server, url: (env) => `http://127.0.0.1:${port}/${env}/api/build-info`, close: () => new Promise((r) => server.close(r)) };
}

export async function fetchBuildInfo(url) {
    if (!/^http:\/\/127\.0\.0\.1:\d+\//.test(url)) throw new Error(`rehearsal fetch refused for non-loopback ${url}`);
    const res = await fetch(url, { cache: "no-store" });
    return res.json();
}

/**
 * The rehearsal's release config: the real policy (owners replaced, tenancy and required checks
 * unchanged) with every environment identity replaced by a loopback stand-in.
 */
export const REHEARSAL_REFS = Object.freeze({ staging: "rehearsalstagingref0", production: "rehearsalproductionrf", newProject: "rehearsalnewprojectr" });

export function rehearsalConfig(base, buildInfo, { firstPromotion = false } = {}) {
    const production = firstPromotion
        ? { supabase_project_ref: REHEARSAL_REFS.newProject, previous_supabase_project_ref: REHEARSAL_REFS.production }
        : { supabase_project_ref: REHEARSAL_REFS.production };
    const config = {
        ...base,
        owners: ["Rehearsal Owner"],
        environments: {
            staging: { ...base.environments.staging, supabase_project_ref: REHEARSAL_REFS.staging, build_info_url: buildInfo.url("staging") },
            production: { ...base.environments.production, ...production, build_info_url: buildInfo.url("production") },
        },
    };
    const refusal = rehearsalConfigRefusal(config);
    if (refusal) throw new Error(refusal);
    return config;
}

/** Adapters over the stand-ins, in the shape release-runner.mjs expects. */
export function rehearsalAdapters({ pg, stagingDb, productionDb, originGitDir, buildInfo, config, checkRuns, faults = {}, firstPromotion = false }) {
    return {
        staging: {
            observe: async () => ({ buildInfo: await fetchBuildInfo(config.environments.staging.build_info_url), checkRuns, ...pg.observe(stagingDb) }),
        },
        production: {
            observe: async () => ({ buildInfo: await fetchBuildInfo(config.environments.production.build_info_url), ...pg.observe(productionDb, { tolerant: firstPromotion }) }),
            ensureLedger: async (sql) => {
                pg.psql(productionDb, sql);
            },
            // The census query runs for real. postgres:17-alpine has no pg_cron, pg_net, supabase_vault or
            // storage schema, so those four entries are stand-ins here; the full-chain rehearsal on the
            // Supabase image observes them (environments-b2-first-promotion-evidence-2026-11-25/).
            census: async () => ({
                ...parseKeyValue(pg.psql(productionDb, FIRST_PROMOTION_CENSUS_SQL)),
                ...(faults.censusMissingExtension ? {} : { "extension:pg_cron": "present", "extension:pg_net": "present", "extension:supabase_vault": "present", "bucket:org_documents": "present" }),
            }),
            snapshot: async () => ({ ...pg.dump(productionDb), fingerprint: pg.observe(productionDb, { tolerant: firstPromotion }).fingerprint }),
            applyMigration: async (m) => {
                // A real failure inside the database, after the file's own statements ran: the single
                // transaction must take the file's DDL and its ledger row back with it.
                pg.applyMigration(productionDb, faults.failMigration === m.version ? { ...m, sql: `${m.sql}\n;\nselect 1/0; -- rehearsal fault` } : m);
            },
            deploy: async ({ from, to }) => {
                // Compare-and-swap: refuses if main is no longer the SHA the owner approved replacing.
                if (faults.moveMainBeforeDeploy) sh("git", ["--git-dir", originGitDir, "update-ref", "refs/heads/main", faults.moveMainBeforeDeploy]);
                try {
                    sh("git", ["--git-dir", originGitDir, "merge-base", "--is-ancestor", from, to]);
                } catch {
                    throw new Error("not a fast-forward");
                }
                try {
                    sh("git", ["--git-dir", originGitDir, "update-ref", "refs/heads/main", to, from]);
                } catch {
                    throw new Error(`main is no longer ${from.slice(0, 12)}; refusing to deploy over an unapproved production build`);
                }
                if (faults.deployServesStale) buildInfo.state.staleProduction = true;
            },
            waitServing: async (sha) => {
                let last = null;
                for (let i = 0; i < 20; i++) {
                    last = await fetchBuildInfo(config.environments.production.build_info_url);
                    if (last.gitSha === sha) return last;
                    await new Promise((r) => setTimeout(r, 25));
                }
                return last;
            },
            rollbackCode: async (to) => {
                buildInfo.state.pin = to; // Vercel Instant Rollback: main stays, the served build goes back.
            },
        },
    };
}

// ---------------------------------------------------------------------------------------------
// Fixture repository: main = the build production runs; staging = main + the next release.
// ---------------------------------------------------------------------------------------------

export const FIXTURE_BASE_MIGRATIONS = {
    "20270101000000_orgs.sql": "create table if not exists public.orgs (id uuid primary key, name text not null, status text not null default 'active');\nalter table public.orgs enable row level security;\n",
    "20270101000100_people.sql": "create table if not exists public.people (id uuid primary key, org_id uuid not null references public.orgs(id), full_name text);\nalter table public.people enable row level security;\n",
};

export const FIXTURE_RELEASE_MIGRATIONS = {
    "20270201000000_people_email.sql": "alter table public.people add column if not exists email text;\n",
    "20270201000100_people_email_index.sql": "create index if not exists people_email_idx on public.people (email);\n",
};

function commitFiles(dir, files, message, env) {
    for (const [path, content] of Object.entries(files)) {
        mkdirSync(join(dir, path, ".."), { recursive: true });
        writeFileSync(join(dir, path), content);
    }
    sh("git", ["-C", dir, "add", "-A"], { env });
    sh("git", ["-C", dir, "commit", "-q", "-m", message], { env });
    return sh("git", ["-C", dir, "rev-parse", "HEAD"], { env }).trim();
}

/** `release` maps migration filename → SQL for the staging-only release; `code` is extra non-migration files. */
export function buildFixtureRepo({ release = FIXTURE_RELEASE_MIGRATIONS, base = FIXTURE_BASE_MIGRATIONS, code = { "web/app/release.txt": "release N+1\n" } } = {}) {
    const root = mkdtempSync(join(tmpdir(), "alloy-p6-fixture-"));
    const dir = join(root, "work");
    const env = { ...process.env, GIT_AUTHOR_NAME: "Rehearsal Fixture", GIT_AUTHOR_EMAIL: "rehearsal@invalid", GIT_COMMITTER_NAME: "Rehearsal Fixture", GIT_COMMITTER_EMAIL: "rehearsal@invalid", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
    sh("git", ["init", "-q", "-b", "main", dir], { env });
    const mainSha = commitFiles(dir, { ...Object.fromEntries(Object.entries(base).map(([f, s]) => [`supabase/migrations/${f}`, s])), "web/app/release.txt": "release N\n" }, "release N", env);
    sh("git", ["-C", dir, "checkout", "-q", "-b", "staging"], { env });
    const stagingSha = commitFiles(dir, { ...Object.fromEntries(Object.entries(release).map(([f, s]) => [`supabase/migrations/${f}`, s])), ...code }, "release N+1", env);
    // An unapproved change someone else lands on main (used to prove the deploy's compare-and-swap).
    sh("git", ["-C", dir, "checkout", "-q", "-b", "hotfix", mainSha], { env });
    const hotfixSha = commitFiles(dir, { "web/app/hotfix.txt": "unapproved hotfix\n" }, "unapproved hotfix", env);
    sh("git", ["-C", dir, "checkout", "-q", "staging"], { env });
    const originGitDir = join(root, "origin.git");
    sh("git", ["clone", "-q", "--bare", dir, originGitDir], { env });
    return { root, dir, originGitDir, mainSha, stagingSha, hotfixSha, base, release };
}

export const ORG_ROWS = {
    firefly: "('93667019-bd28-49b5-a688-acc9bb1e0a19', 'Firefly', 'active')",
    zzQa: "('4acc9386-c485-486f-aa1f-05d83499d142', 'ZZ Alloy QA', 'active')",
    zzCross: "('ad53fee2-2570-460f-9300-f0e106c473b6', 'ZZ Alloy QA — Cross-Org', 'active')",
    productionSchool: "('0b5e0000-0000-4000-8000-000000000001', 'Production School (rehearsal stand-in)', 'active')",
};

/** Staging stand-in: the candidate's whole chain + ALY-14 tenancy. Production stand-in: main's chain + its own school. */
export function provisionStandIns(pg, fixture, { suffix, stagingOrgs = [ORG_ROWS.firefly, ORG_ROWS.zzQa, ORG_ROWS.zzCross], productionOrgs = [ORG_ROWS.productionSchool], firstPromotion = false }) {
    const stagingDb = `p6_staging_${suffix}`;
    const productionDb = `p6_production_${suffix}`;
    pg.createDb(stagingDb);
    pg.createDb(productionDb, { ledger: !firstPromotion });
    if (firstPromotion) {
        // A new project: nothing at all, not even the ledger table. Staging still runs the whole chain.
        for (const [file, sql] of Object.entries({ ...fixture.base, ...fixture.release }).sort()) {
            const [, version, name] = /^(\d{14})_(.+)\.sql$/.exec(file);
            pg.applyMigration(stagingDb, { version, name, sql });
        }
        if (stagingOrgs.length) pg.psql(stagingDb, `insert into public.orgs (id, name, status) values ${stagingOrgs.join(", ")} on conflict (id) do nothing;`);
        if (productionOrgs.length) throw new Error("a first-promotion target starts empty");
        return { stagingDb, productionDb };
    }
    const apply = (db, files) => {
        for (const [file, sql] of Object.entries(files).sort()) {
            const [, version, name] = /^(\d{14})_(.+)\.sql$/.exec(file);
            pg.applyMigration(db, { version, name, sql });
        }
    };
    apply(stagingDb, { ...fixture.base, ...fixture.release });
    apply(productionDb, fixture.base);
    if (stagingOrgs.length) pg.psql(stagingDb, `insert into public.orgs (id, name, status) values ${stagingOrgs.join(", ")};`);
    if (productionOrgs.length) pg.psql(productionDb, `insert into public.orgs (id, name, status) values ${productionOrgs.join(", ")};`);
    return { stagingDb, productionDb };
}

export const greenCheckRuns = (config, sha) => ({ check_runs: config.required_checks.map((name) => ({ name, head_sha: sha, status: "completed", conclusion: "success" })) });

// ---------------------------------------------------------------------------------------------
// One rehearsal scenario, end to end: fixture → stand-ins → prepare → owner approval → execute.
// ---------------------------------------------------------------------------------------------

/**
 * `approve(manifest, makeApprovalFor)` returns the approval to execute with (or null for none);
 * `beforeExecute(ctx)` may change the world between approval and execution (drift, a moved main).
 */
export async function runRehearsalScenario({ pg, baseConfig, outDir, name, release, base, stagingOrgs, productionOrgs, checkRuns, faults = {}, approve, beforePrepare, beforeExecute, now, firstPromotion = false, config: configOverride }) {
    const { AuditLog, gitRunner, makeApproval, readBlob, scopesFor } = await import("./release-lib.mjs");
    const { prepare, execute } = await import("./release-runner.mjs");
    const fixture = buildFixtureRepo({ ...(release ? { release } : {}), ...(base ? { base } : {}) });
    const refs = firstPromotion
        ? { staging: REHEARSAL_REFS.staging, production: REHEARSAL_REFS.newProject, productionPrevious: REHEARSAL_REFS.production }
        : { staging: REHEARSAL_REFS.staging, production: REHEARSAL_REFS.production };
    const buildInfo = await startBuildInfoServer({ originGitDir: fixture.originGitDir, refs });
    try {
        const config = configOverride ? configOverride(rehearsalConfig(baseConfig, buildInfo, { firstPromotion })) : rehearsalConfig(baseConfig, buildInfo, { firstPromotion });
        const suffix = name.replace(/[^a-z0-9]/g, "_");
        const dbs = provisionStandIns(pg, fixture, { suffix, stagingOrgs, productionOrgs: firstPromotion ? productionOrgs ?? [] : productionOrgs, firstPromotion });
        const audit = new AuditLog(join(outDir, `${name}.audit.jsonl`));
        const git = gitRunner(fixture.dir);
        if (faults.moveMainBeforeDeploy === true) faults = { ...faults, moveMainBeforeDeploy: fixture.hotfixSha };
        const adapters = rehearsalAdapters({ pg, ...dbs, originGitDir: fixture.originGitDir, buildInfo, config, checkRuns: checkRuns ? checkRuns(config, fixture.stagingSha) : greenCheckRuns(config, fixture.stagingSha), faults, firstPromotion });
        if (beforePrepare) await beforePrepare({ pg, dbs, fixture, config });
        const observeProduction = () => pg.observe(dbs.productionDb, { tolerant: firstPromotion });
        const before = { ...observeProduction(), buildInfo: await fetchBuildInfo(config.environments.production.build_info_url) };

        const prep = await prepare({ git, refs: { stagingRef: "staging", mainRef: "main" }, config, environment: "rehearsal", adapters, audit, now, firstPromotion });
        let approval = null;
        let result = null;
        if (prep.ok) {
            const defaultApproval = (overrides = {}) =>
                makeApproval({ environment: "rehearsal", approver: "Rehearsal Owner", manifest: prep.manifest, approvedAt: new Date().toISOString(), ttlHours: 4, scope: scopesFor(prep.manifest), ...overrides });
            approval = approve ? approve(prep.manifest, defaultApproval) : defaultApproval();
            if (approval) writeFileSync(join(outDir, `${name}.approval.json`), `${JSON.stringify(approval, null, 2)}\n`);
            writeFileSync(join(outDir, `${name}.manifest.json`), `${JSON.stringify(prep.manifest, null, 2)}\n`);
            if (beforeExecute) await beforeExecute({ pg, dbs, fixture, config });
            const sqlOf = (m) => readBlob(git, m.blob);
            result = await execute({ manifest: prep.manifest, approval, config, environment: "rehearsal", adapters, audit, sqlOf, now });
        }
        const after = { ...observeProduction(), buildInfo: await fetchBuildInfo(config.environments.production.build_info_url), main: sh("git", ["--git-dir", fixture.originGitDir, "rev-parse", "refs/heads/main"]).trim() };
        return { fixture, config, dbs, prep, approval, result, before, after, auditPath: audit.path };
    } finally {
        await buildInfo.close();
        rmSync(fixture.root, { recursive: true, force: true });
    }
}
