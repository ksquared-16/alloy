#!/usr/bin/env node
/**
 * alloy-release — the staging-to-production release procedure
 * (docs/platform/governance/production-release-procedure.md).
 *
 * This command never connects to staging or production and never holds a credential. Every live
 * observation is a file the owner produced with a read-only command the runbook prints; every live
 * action is performed by the owner. The command identifies, plans, checks, binds the approval and
 * keeps the audit chain.
 *
 *   identify          read-only git: candidate, fast-forward, migration set
 *   plan              ordered schema plan against a production ledger file (or `unknown`)
 *   prepare           identify + staging.verify + production.preflight from evidence files → manifest
 *
 *   --first-promotion (plan, prepare) is the opt-in first-promotion mode (briefing D9): the target
 *   is a NEW project whose ledger must be empty, the whole chain runs in version order, and the
 *   config is the release-directory copy from `first-promotion-config`. Without the flag every
 *   command behaves as it always has.
 *
 *   first-promotion-config  write the release-directory config copy naming the new project ref
 *   apply-order       the versions schema.expand (or --stage contract) applies, one per line
 *   emit-sql          print one of the read-only observation queries, or the ledger-table DDL
 *   approve           the owner's approval, bound to the manifest hash (owner, at a terminal)
 *   emit-apply        one approved migration wrapped with its ledger row, for psql --single-transaction
 *   check-ledger      production's ledger still equals the one the approval was given against
 *   check-production  production.verify over evidence files
 *   record            append a step outcome to the audit chain (production steps need a valid approval)
 *   runbook           the ordered owner checklist for a manifest, with its commands
 *   verify-audit      re-hash an audit chain
 *   rehearse          run the non-live rehearsal (Docker, local only) and keep its evidence
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
    AuditLog,
    FINGERPRINT_SQL,
    FIRST_PROMOTION_CENSUS_SQL,
    LEDGER_IF_PRESENT_PSQL,
    LEDGER_SQL,
    LEDGER_TABLE_SQL,
    ORGS_SQL,
    STEPS,
    ROLLBACK_STEP,
    checkFirstPromotionCensus,
    checkProduction,
    checkTargetSchema,
    firstPromotionConfig,
    gitRunner,
    hashRecord,
    identifyCandidate,
    isFirstPromotion,
    makeApproval,
    manifestConfigMismatch,
    parseKeyValue,
    parseLedger,
    parseOrgs,
    planSchema,
    readBlob,
    verifyApproval,
    verifyAuditChain,
    wrapMigrationForApply,
} from "./release-lib.mjs";
import { prepare } from "./release-runner.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");

export function parseArgs(argv) {
    const out = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith("--")) {
            out._.push(a);
            continue;
        }
        const key = a.slice(2);
        const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
        if (key in out) out[key] = [].concat(out[key], val);
        else out[key] = val;
    }
    return out;
}

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const readText = (p) => readFileSync(p, "utf8");
const list = (v) => (v === undefined ? [] : [].concat(v));
const loadConfig = (a) => readJson(a.config ?? join(HERE, "release-config.json"));
const refsOf = (a) => ({ stagingRef: a.staging ?? "origin/staging", mainRef: a.main ?? "origin/main", candidateRef: a.candidate ?? a.staging ?? "origin/staging", allowTreeDiff: list(a["allow-tree-diff"]) });
const print = (o) => process.stdout.write(`${JSON.stringify(o, null, 2)}\n`);
const firstPromotionFlag = (a) => a["first-promotion"] === true;

/** A first-promotion manifest only checks, approves and records against the config copy it was prepared with. */
function assertConfigMatches(manifest, config) {
    const f = manifestConfigMismatch(manifest, config);
    if (f.length) throw new Error(`${f.join("; ")} — pass --config <release-dir>/release-config.json`);
}

export const EMITTABLE_SQL = Object.freeze({
    ledger: `${LEDGER_SQL}\n`,
    census: `${FIRST_PROMOTION_CENSUS_SQL}\n`,
    "ledger-if-present": LEDGER_IF_PRESENT_PSQL,
    "ledger-table": LEDGER_TABLE_SQL,
    fingerprint: `${FINGERPRINT_SQL}\n`,
    orgs: `${ORGS_SQL}\n`,
});

/** A production approval is an owner's act at a terminal. An agent session has neither. */
export function approvalRefusal({ environment, isTTY, env }) {
    if (environment !== "production") return null;
    if (env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT) return "a production approval cannot be recorded from an agent session";
    if (!isTTY) return "a production approval must be recorded interactively, at a terminal";
    return null;
}

const COMMANDS = {
    identify(a) {
        const git = gitRunner(a.repo ?? ROOT);
        const r = identifyCandidate({ git, ...refsOf(a) });
        print({ ok: r.ok, failures: r.failures, candidate: r.candidate, migrations: r.migrations?.length, baseline_migrations: r.baseline_migrations?.length });
        return r.ok ? 0 : 1;
    },

    plan(a) {
        const git = gitRunner(a.repo ?? ROOT);
        const r = identifyCandidate({ git, ...refsOf(a) });
        if (!r.candidate) {
            print({ ok: false, failures: r.failures });
            return 1;
        }
        const ledgerArg = a["production-ledger"] ?? "unknown";
        const productionLedger = ledgerArg === "unknown" ? null : ledgerArg === "baseline" ? r.baseline_migrations.map((m) => m.version) : parseLedger(readText(ledgerArg));
        const firstPromotion = firstPromotionFlag(a);
        const plan = planSchema({ candidateMigrations: r.migrations, productionLedger, baseline: r.baseline_migrations, sqlOf: (m) => readBlob(git, m.blob), firstPromotion });
        print({ ...(firstPromotion ? { mode: plan.mode } : {}), identify_failures: r.failures, production_ledger: ledgerArg, status: plan.status, blockers: plan.blockers, warnings_count: plan.warnings.length, ledger_head: plan.ledger_head, pending_count: plan.pending.length, expand: plan.expand?.length, contract: plan.contract, ...(firstPromotion ? { destructive_in_chain: plan.destructive_in_chain?.length ?? 0, first_version: plan.expand?.[0] ?? null, last_version: plan.expand?.at(-1) ?? null } : {}), contract_files: plan.pending.filter((p) => p.class === "contract").map((p) => `${p.file}: ${p.destructive.join(", ")}`) });
        return plan.status === "blocked" || !r.ok ? 1 : 0;
    },

    async prepare(a) {
        const config = loadConfig(a);
        const outDir = a["out-dir"];
        if (!outDir) throw new Error("--out-dir is required");
        mkdirSync(outDir, { recursive: true });
        const fileAdapter = (prefix) => ({
            observe: async () => ({
                buildInfo: readJson(a[`${prefix}-build-info`]),
                ledger: parseLedger(readText(a[`${prefix}-ledger`])),
                orgs: a[`${prefix}-orgs`] ? parseOrgs(readText(a[`${prefix}-orgs`])) : undefined,
                fingerprint: a[`${prefix}-fingerprint`] ? parseKeyValue(readText(a[`${prefix}-fingerprint`])) : undefined,
                ...(prefix === "staging" ? { checkRuns: readJson(a["check-runs"]) } : {}),
            }),
        });
        const audit = new AuditLog(join(outDir, "audit.jsonl"));
        const firstPromotion = firstPromotionFlag(a);
        const r = await prepare({ git: gitRunner(a.repo ?? ROOT), refs: refsOf(a), config, environment: a.environment ?? "production", adapters: { staging: fileAdapter("staging"), production: fileAdapter("production") }, audit, firstPromotion });
        if (r.stagingVerification) writeFileSync(join(outDir, "staging-verification.json"), `${JSON.stringify(r.stagingVerification, null, 2)}\n`);
        if (r.ok) writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(r.manifest, null, 2)}\n`);
        const summary = firstPromotion && r.ok
            ? { mode: r.manifest.mode, new_supabase_project_ref: r.manifest.first_promotion.new_supabase_project_ref, chain: r.manifest.migrations.expand.length, first_version: r.manifest.migrations.expand[0] ?? null, last_version: r.manifest.migrations.expand.at(-1) ?? null, destructive_in_chain: r.manifest.migrations.destructive_in_chain.length }
            : { pending: r.manifest?.migrations.pending.map((p) => `${p.version}:${p.class}`) };
        print(r.ok ? { ok: true, manifest_sha256: hashRecord(r.manifest), ...summary } : { ok: false, step: r.step, failures: r.failures });
        return r.ok ? 0 : 1;
    },

    approve(a) {
        const config = loadConfig(a);
        const manifest = readJson(a.manifest);
        const environment = a.environment ?? manifest.environment;
        const refusal = approvalRefusal({ environment, isTTY: Boolean(process.stdin.isTTY), env: process.env });
        if (refusal) throw new Error(refusal);
        assertConfigMatches(manifest, config);
        if (!config.owners.includes(a.approver)) throw new Error(`${a.approver} is not a configured owner`);
        const sha = hashRecord(manifest);
        if (a.confirm !== sha.slice(0, 12)) throw new Error("--confirm must be the first 12 characters of the manifest hash (alloy-release runbook prints it)");
        const approval = makeApproval({ environment, approver: a.approver, manifest, approvedAt: new Date().toISOString(), ttlHours: Number(a["ttl-hours"] ?? 4), scope: a.scope ? list(a.scope) : undefined });
        const v = verifyApproval({ approval, manifest, config, environment, now: new Date().toISOString() });
        if (!v.ok) throw new Error(v.failures.join("; "));
        writeFileSync(a.out ?? join(dirname(a.manifest), "approval.json"), `${JSON.stringify(approval, null, 2)}\n`);
        print({ ok: true, approval_sha256: hashRecord(approval), scope: approval.scope, expires_at: approval.expires_at });
        return 0;
    },

    "emit-apply"(a) {
        const manifest = readJson(a.manifest);
        const m = manifest.migrations.pending.find((p) => p.version === a.version);
        if (!m) throw new Error(`${a.version} is not a pending migration of this manifest`);
        const sql = readBlob(gitRunner(a.repo ?? ROOT), m.blob);
        process.stdout.write(wrapMigrationForApply({ version: m.version, name: m.name, sql }));
        return 0;
    },

    "check-ledger"(a) {
        const manifest = readJson(a.manifest);
        const ledger = parseLedger(readText(a.ledger));
        const now = hashRecord([...ledger].sort());
        const failures = [];
        if (isFirstPromotion(manifest) && ledger.length) failures.push(`first promotion: the target's ledger is no longer empty (${ledger.length} version(s)); refusing the chain`);
        if (now !== manifest.production_ledger_sha256) failures.push("production's ledger changed since the approval; prepare and approve again");
        print({ ok: !failures.length, failures });
        return failures.length ? 1 : 0;
    },

    "first-promotion-config"(a) {
        if (!a["new-ref"] || a["new-ref"] === true) throw new Error("--new-ref <the new Supabase project ref> is required");
        const base = readJson(a.base ?? join(HERE, "release-config.json"));
        const config = firstPromotionConfig(base, a["new-ref"]);
        const body = `${JSON.stringify(config, null, 2)}\n`;
        if (a.out) {
            mkdirSync(dirname(a.out), { recursive: true });
            if (existsSync(a.out) && readText(a.out) !== body) throw new Error(`${a.out} exists with different content; refusing to overwrite`);
            writeFileSync(a.out, body);
            print({ ok: true, out: a.out, config_sha256: hashRecord(config), production: config.environments.production });
        } else process.stdout.write(body);
        return 0;
    },

    "apply-order"(a) {
        const manifest = readJson(a.manifest);
        const stage = a.stage ?? "expand";
        if (!["expand", "contract"].includes(stage)) throw new Error("--stage is expand or contract");
        for (const v of manifest.migrations[stage]) process.stdout.write(`${v}\n`);
        return 0;
    },

    "emit-sql"(a) {
        const name = a._[1];
        if (!(name in EMITTABLE_SQL)) throw new Error(`emit-sql <${Object.keys(EMITTABLE_SQL).join("|")}>`);
        process.stdout.write(EMITTABLE_SQL[name]);
        return 0;
    },

    "check-production"(a) {
        const config = loadConfig(a);
        const manifest = readJson(a.manifest);
        assertConfigMatches(manifest, config);
        const stage = a.stage ?? "final";
        const first = isFirstPromotion(manifest);
        if (stage === "schema" && !first) throw new Error("--stage schema is the first promotion's pre-deploy census; a routine release checks --stage expand|final");
        const final = stage === "final" || stage === "schema";
        const contract = new Set(manifest.migrations.contract);
        const observed = {
            config,
            ledger: parseLedger(readText(a.ledger)),
            expectedVersions: final ? manifest.candidate_versions : manifest.candidate_versions.filter((v) => !contract.has(v)),
            fingerprint: parseKeyValue(readText(a.fingerprint)),
            expectedFingerprint: final || !contract.size ? manifest.expected_fingerprint : null,
            orgs: parseOrgs(readText(a.orgs)),
            ...(first ? { firstPromotion: true } : {}),
        };
        let r;
        if (stage === "schema") {
            if (!a.census) throw new Error("--census <file> (emit-sql census) is required at --stage schema");
            const failures = [...checkTargetSchema(observed).failures, ...checkFirstPromotionCensus(parseKeyValue(readText(a.census)))];
            r = { ok: !failures.length, failures };
        } else r = checkProduction({ ...observed, candidate: manifest.candidate, buildInfo: readJson(a["build-info"]) });
        print(r);
        return r.ok ? 0 : 1;
    },

    record(a) {
        const config = loadConfig(a);
        const manifest = readJson(a.manifest);
        const step = [...STEPS, ROLLBACK_STEP].find((s) => s.id === a.step);
        if (!step) throw new Error(`unknown step ${a.step}`);
        assertConfigMatches(manifest, config);
        if (step.production || step.id === "owner.approval") {
            const approval = a.approval && existsSync(a.approval) ? readJson(a.approval) : null;
            const v = verifyApproval({ approval, manifest, config, environment: manifest.environment, now: new Date().toISOString(), scopeNeeded: step.scope });
            if (!v.ok) throw new Error(`refusing to record ${step.id}: ${v.failures.join("; ")}`);
        }
        const entry = new AuditLog(a.audit).append(step.id, a.status, a.detail ? JSON.parse(a.detail) : {});
        print(entry);
        return 0;
    },

    runbook(a) {
        const manifest = readJson(a.manifest);
        const config = loadConfig(a);
        if (isFirstPromotion(manifest)) {
            assertConfigMatches(manifest, config);
            process.stdout.write(renderFirstPromotionRunbook(manifest, config));
        } else process.stdout.write(renderRunbook(manifest, config));
        return 0;
    },

    "verify-audit"(a) {
        const r = verifyAuditChain(readText(a._[1] ?? a.audit));
        print(r);
        return r.ok ? 0 : 1;
    },

    rehearse(a) {
        const out = resolve(a["out-dir"] ?? join(ROOT, "tmp", "release-rehearsal"));
        mkdirSync(out, { recursive: true });
        try {
            execFileSync("node", ["--test", join(HERE, "tests", "release-rehearsal.test.mjs")], { stdio: "inherit", env: { ...process.env, ALLOY_RELEASE_REHEARSAL_OUT: out } });
            return 0;
        } catch (e) {
            return e.status ?? 1;
        }
    },
};

export function renderRunbook(manifest, config) {
    const c = manifest.candidate;
    const sha = hashRecord(manifest);
    const p = config.environments.production;
    const m = manifest.migrations;
    const rel = "node scripts/release/alloy-release.mjs";
    const dir = "<release-dir>";
    const q = (s) => s.replace(/\n/g, " ");
    const apply = (v) => `${rel} emit-apply --manifest ${dir}/manifest.json --version ${v} | psql "$PRODUCTION_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -X -q -f -`;
    const observe = (stage) => [
        `curl -fsS ${p.build_info_url} > ${dir}/${stage}-build-info.json`,
        `psql "$PRODUCTION_DB_URL_READONLY" -At -X -c "${q(LEDGER_SQL)}" > ${dir}/${stage}-ledger.txt`,
        `psql "$PRODUCTION_DB_URL_READONLY" -At -X -c "${q(FINGERPRINT_SQL)}" > ${dir}/${stage}-fingerprint.txt`,
        `psql "$PRODUCTION_DB_URL_READONLY" -At -X -c "${q(ORGS_SQL)}" > ${dir}/${stage}-orgs.txt`,
    ];
    const rec = (step, status = "pass", detail = "{}") => `${rel} record --audit ${dir}/audit.jsonl --manifest ${dir}/manifest.json --approval ${dir}/approval.json --step ${step} --status ${status} --detail '${detail}'`;
    const L = [];
    L.push(`# Release runbook — ${c.sha.slice(0, 12)} → ${manifest.environment}`, "");
    L.push(`Manifest sha256: \`${sha}\` (confirm code \`${sha.slice(0, 12)}\`)`);
    L.push(`Replaces main \`${c.production_before_sha}\`; ${c.commits_ahead_of_main} commit(s); ${m.pending.length} migration(s): ${m.expand.length} expand, ${m.contract.length} contract.`);
    L.push(`Production ledger head at preflight: \`${m.production_ledger_head}\`.`, "");
    L.push("Every command below is the owner's. `$PRODUCTION_DB_URL` is the session pooler (5432), never the transaction pooler (6543); the release tool never sees it.", "");
    L.push("## 4. owner.approval", "", "```bash", `${rel} approve --manifest ${dir}/manifest.json --approver <owner> --confirm ${sha.slice(0, 12)} --ttl-hours 4`, rec("owner.approval"), "```", "");
    L.push("## 5. production.snapshot", "", "Confirm in the Supabase dashboard that a backup / PITR point newer than now exists, then:", "", "```bash",
        `pg_dump "$PRODUCTION_DB_URL" -Fc --no-owner -f ${dir}/pre-release-${c.sha.slice(0, 12)}.dump && shasum -a 256 ${dir}/pre-release-${c.sha.slice(0, 12)}.dump`,
        ...observe("before"), rec("production.snapshot", "pass", '{"dump_sha256":"<sha256>"}'), "```", "");
    L.push("## 6. schema.expand", "", "Re-read the ledger first; it must equal the preflight read (any change → prepare and approve again).", "", "```bash", observe("pre-expand")[1], `${rel} check-ledger --manifest ${dir}/manifest.json --ledger ${dir}/pre-expand-ledger.txt`);
    for (const v of m.expand) L.push(apply(v), rec("schema.expand", "applied", `{"version":"${v}"}`));
    if (!m.expand.length) L.push("# no additive migrations");
    L.push("```", "", "Any failure: stop. The failing file left nothing (one transaction); the previous build still serves and tolerates what was applied. Fix forward.", "");
    L.push("## 7. code.deploy", "", "```bash", `test "$(git ls-remote origin refs/heads/main | cut -f1)" = "${c.production_before_sha}"   # main is still what was approved`,
        `git push origin ${c.sha}:refs/heads/main   # fast-forward only; never --force`,
        `until curl -fsS ${p.build_info_url} | grep -q '"gitSha":"${c.sha}"'; do sleep 30; done`, rec("code.deploy"), "```", "");
    L.push("## 8. production.verify", "", "```bash", ...observe("after"),
        `${rel} check-production --manifest ${dir}/manifest.json --build-info ${dir}/after-build-info.json --ledger ${dir}/after-ledger.txt --fingerprint ${dir}/after-fingerprint.txt --orgs ${dir}/after-orgs.txt --stage ${m.contract.length ? "expand" : "final"}`,
        rec("production.verify"), "```", "",
        "On failure — **code.rollback** (granted with this approval): Vercel → Deployments → the production deployment of",
        `\`${c.production_before_sha.slice(0, 12)}\` → Instant Rollback. Wait until build-info serves it, then \`${rec("code.rollback")}\`. Migrations stay: they are additive. Restoring the snapshot needs a new owner approval.`, "");
    L.push("## 9. schema.contract", "");
    if (m.contract.length) {
        L.push("Needs `schema_contract` in the approval. Only after step 8 passed.", "", "```bash");
        for (const v of m.contract) L.push(apply(v), rec("schema.contract", "applied", `{"version":"${v}"}`));
        L.push(...observe("final"), `${rel} check-production --manifest ${dir}/manifest.json --build-info ${dir}/final-build-info.json --ledger ${dir}/final-ledger.txt --fingerprint ${dir}/final-fingerprint.txt --orgs ${dir}/final-orgs.txt --stage final`, "```", "", "Do not roll code back across an applied contract migration; fix forward.", "");
    } else L.push("None in this release.", "");
    L.push("## 10. release.record", "", "```bash", rec("release.record"), `${rel} verify-audit ${dir}/audit.jsonl`, "```", "", "Commit the release directory (manifest, staging verification, approval, observations, audit) as the release's evidence.", "");
    return `${L.join("\n")}\n`;
}

/**
 * The first promotion's runbook (briefing §3 steps 8–9, 11, 15, 17; §4). Same steps, approval and
 * audit as a routine release; differences: every command carries the config copy, every write is
 * guarded to name the NEW project and never the previous one, the whole chain runs at schema.expand,
 * and the census passes before code.deploy.
 */
export function renderFirstPromotionRunbook(manifest, config) {
    const c = manifest.candidate;
    const fp = manifest.first_promotion;
    const sha = hashRecord(manifest);
    const p = config.environments.production;
    const m = manifest.migrations;
    const dir = "<release-dir>";
    const cfg = `${dir}/release-config.json`;
    const rel = "node scripts/release/alloy-release.mjs";
    const relc = (cmd) => `${rel} ${cmd} --config ${cfg}`;
    const mf = `--manifest ${dir}/manifest.json`;
    const ro = '"$PRODUCTION_DB_URL_READONLY"';
    const rec = (step, status = "pass", detail = "'{}'") => `${relc("record")} --audit ${dir}/audit.jsonl ${mf} --approval ${dir}/approval.json --step ${step} --status ${status} --detail ${detail}`;
    const observe = (stage, { ledgerIfPresent = false, buildInfo = true } = {}) => [
        ...(buildInfo ? [`curl -fsS ${p.build_info_url} > ${dir}/${stage}-build-info.json`] : []),
        ledgerIfPresent
            ? `${rel} emit-sql ledger-if-present | psql ${ro} -At -X -q -f - > ${dir}/${stage}-ledger.txt`
            : `${rel} emit-sql ledger | psql ${ro} -At -X -f - > ${dir}/${stage}-ledger.txt`,
        `${rel} emit-sql fingerprint | psql ${ro} -At -X -f - > ${dir}/${stage}-fingerprint.txt`,
        `${rel} emit-sql orgs | psql ${ro} -At -X -f - > ${dir}/${stage}-orgs.txt`,
    ];
    const L = [];
    L.push(`# First-promotion runbook — ${c.sha.slice(0, 12)} → ${manifest.environment} on the new project \`${fp.new_supabase_project_ref}\``, "");
    L.push(`Manifest sha256: \`${sha}\` (confirm code \`${sha.slice(0, 12)}\`)`);
    L.push(`Replaces main \`${c.production_before_sha}\` on \`${fp.previous_supabase_project_ref}\`, which is **not touched** and is the rollback target. ${c.commits_ahead_of_main} commit(s).`);
    L.push(`The whole chain: ${m.expand.length} migration(s), \`${m.expand[0] ?? "-"}\` … \`${m.expand.at(-1) ?? "-"}\`, in version order, ${m.destructive_in_chain.length} of them destructive by classification (they run on a project that serves nothing).`, "");
    L.push("Every command is the owner's (or the operator session's with the owner present). `$PRODUCTION_DB_URL` is the **new** project as `postgres`, on port **5432** (direct connection or session pooler, never the transaction pooler 6543); `$PRODUCTION_DB_URL_READONLY` is its read-only role. The release tool never sees either. Every write first runs this guard:", "");
    L.push("```bash", `fp_target() { case "$1" in *:6543*) echo "refused: transaction pooler (6543)"; return 1;; esac; case "$1" in *${fp.previous_supabase_project_ref}*) echo "refused: names the previous project"; return 1;; *${fp.new_supabase_project_ref}*) return 0;; esac; echo "refused: does not name the new project ${fp.new_supabase_project_ref}"; return 1; }`, `fp_target "$PRODUCTION_DB_URL" && fp_target "$PRODUCTION_DB_URL_READONLY"`, "```", "");
    L.push("## 4. owner.approval", "", "```bash", `${relc("approve")} ${mf} --approver <owner> --confirm ${sha.slice(0, 12)} --ttl-hours 4`, rec("owner.approval"), "```", "");
    L.push("## 5. production.snapshot", "", `The rollback point is the untouched previous project \`${fp.previous_supabase_project_ref}\`. Record the new project's empty state:`, "", "```bash",
        `fp_target "$PRODUCTION_DB_URL" && pg_dump "$PRODUCTION_DB_URL" -Fc --no-owner -f ${dir}/pre-chain-empty.dump && shasum -a 256 ${dir}/pre-chain-empty.dump`,
        ...observe("before", { ledgerIfPresent: true }), rec("production.snapshot", "pass", `'{"dump_sha256":"<sha256>","rollback_target":"${fp.previous_supabase_project_ref}"}'`), "```", "");
    L.push("## 6. schema.expand — the whole chain (briefing §4 items 2–6)", "",
        "Platform schemas (`auth`, `storage`) are the hosted project's own; never run migrators against it. Re-read the ledger: it must still be empty.", "", "```bash",
        observe("pre-chain", { ledgerIfPresent: true, buildInfo: false })[0],
        `${relc("check-ledger")} ${mf} --ledger ${dir}/pre-chain-ledger.txt`,
        `fp_target "$PRODUCTION_DB_URL" && ${rel} emit-sql ledger-table | psql "$PRODUCTION_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -X -q -f -`,
        `for v in $(${rel} apply-order ${mf}); do`,
        `  ( set -o pipefail; fp_target "$PRODUCTION_DB_URL" && ${rel} emit-apply ${mf} --version "$v" | psql "$PRODUCTION_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -X -q -f - ) || { echo "STOPPED at $v"; break; }`,
        `  ${rec("schema.expand", "applied", `"{\\"version\\":\\"$v\\"}"`)} > /dev/null || break`,
        "done",
        "```", "",
        "Any failure: stop. The failing file left nothing (one transaction). Nothing serves from this project yet: hold, then fix forward with a new candidate or delete and recreate the project.", "",
        "Census (briefing §4 item 6), before any code points here:", "", "```bash",
        ...observe("census", { buildInfo: false }),
        `${rel} emit-sql census | psql ${ro} -At -X -f - > ${dir}/census-extras.txt`,
        `${relc("check-production")} ${mf} --stage schema --ledger ${dir}/census-ledger.txt --fingerprint ${dir}/census-fingerprint.txt --orgs ${dir}/census-orgs.txt --census ${dir}/census-extras.txt`,
        rec("schema.expand"), "```", "",
        "`--stage schema` compares the fingerprint with staging's from the manifest; take staging's again in the same window (`emit-sql fingerprint` against staging's read-only role) and `diff` it with the manifest's `expected_fingerprint` if staging was observed earlier than the window.", "");
    L.push("## 7. code.deploy", "", "Only after the platform settings name the new project (briefing step 10; `NEXT_PUBLIC_*` before the build).", "", "```bash",
        `test "$(git ls-remote origin refs/heads/main | cut -f1)" = "${c.production_before_sha}"   # main is still what was approved`,
        `git push origin ${c.sha}:refs/heads/main   # fast-forward only; never --force`,
        `until b=$(curl -fsS ${p.build_info_url}) && echo "$b" | grep -q '"gitSha":"${c.sha}"' && echo "$b" | grep -q '"supabaseProjectRef":"${fp.new_supabase_project_ref}"'; do sleep 30; done`,
        rec("code.deploy"), "```", "");
    L.push("## 8. production.verify", "", "```bash", ...observe("after"),
        `${relc("check-production")} ${mf} --build-info ${dir}/after-build-info.json --ledger ${dir}/after-ledger.txt --fingerprint ${dir}/after-fingerprint.txt --orgs ${dir}/after-orgs.txt --stage final`,
        rec("production.verify"), "```", "",
        "On failure — **code.rollback** (granted with this approval): Vercel → Deployments → the production deployment of",
        `\`${c.production_before_sha.slice(0, 12)}\` → Instant Rollback. It is wired to \`${fp.previous_supabase_project_ref}\`, which nothing changed. Wait until build-info serves it on that ref, then \`${rec("code.rollback")}\`. Render goes back the same way (briefing §7).`, "");
    L.push("## 9. schema.contract", "", "Nothing after the deploy: the chain ran in version order at step 6.", "", "```bash",
        rec("schema.contract", "skip", `'{"reason":"first promotion: destructive files ran in version order at schema.expand","destructive_in_chain":${m.destructive_in_chain.length}}'`), "```", "");
    L.push("## 10. release.record", "", "```bash", rec("release.record"), `${rel} verify-audit ${dir}/audit.jsonl`, "```", "",
        "Commit the release directory (config copy, manifest, staging verification, approval, observations, census, audit) as the release's evidence.", "");
    return `${L.join("\n")}\n`;
}

// Compare real paths: started through a symlinked directory (macOS /tmp is /private/tmp), argv[1] is the link
// path while import.meta.url is resolved, and a plain string compare would skip every command and exit 0 silently.
const isMain = () => {
    try {
        return Boolean(process.argv[1]) && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
    } catch {
        return false;
    }
};

if (isMain()) {
    const a = parseArgs(process.argv.slice(2));
    const cmd = COMMANDS[a._[0]];
    if (!cmd) {
        console.error(`usage: alloy-release <${Object.keys(COMMANDS).join("|")}> [options]`);
        process.exit(2);
    }
    // process.exitCode, never process.exit(): on macOS a pipe is asynchronous, and exiting drops what
    // is still buffered. `emit-apply | psql` then received only the first 64 KiB of a migration — a
    // syntax error at best, a partial file committed without its ledger row at a statement boundary.
    Promise.resolve()
        .then(() => cmd(a))
        .then((code) => {
            process.exitCode = code ?? 0;
        })
        .catch((err) => {
            console.error(`alloy-release: ${err.message}`);
            process.exitCode = 1;
        });
}
