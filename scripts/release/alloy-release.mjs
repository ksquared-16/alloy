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
 *   approve           the owner's approval, bound to the manifest hash (owner, at a terminal)
 *   emit-apply        one approved migration wrapped with its ledger row, for psql --single-transaction
 *   check-ledger      production's ledger still equals the one the approval was given against
 *   check-production  production.verify over evidence files
 *   record            append a step outcome to the audit chain (production steps need a valid approval)
 *   runbook           the ordered owner checklist for a manifest, with its commands
 *   verify-audit      re-hash an audit chain
 *   rehearse          run the non-live rehearsal (Docker, local only) and keep its evidence
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
    AuditLog,
    FINGERPRINT_SQL,
    LEDGER_SQL,
    ORGS_SQL,
    STEPS,
    ROLLBACK_STEP,
    checkProduction,
    gitRunner,
    hashRecord,
    identifyCandidate,
    makeApproval,
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
        const plan = planSchema({ candidateMigrations: r.migrations, productionLedger, baseline: r.baseline_migrations, sqlOf: (m) => readBlob(git, m.blob) });
        print({ identify_failures: r.failures, production_ledger: ledgerArg, status: plan.status, blockers: plan.blockers, warnings_count: plan.warnings.length, ledger_head: plan.ledger_head, pending_count: plan.pending.length, expand: plan.expand?.length, contract: plan.contract, contract_files: plan.pending.filter((p) => p.class === "contract").map((p) => `${p.file}: ${p.destructive.join(", ")}`) });
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
        const r = await prepare({ git: gitRunner(a.repo ?? ROOT), refs: refsOf(a), config, environment: a.environment ?? "production", adapters: { staging: fileAdapter("staging"), production: fileAdapter("production") }, audit });
        if (r.stagingVerification) writeFileSync(join(outDir, "staging-verification.json"), `${JSON.stringify(r.stagingVerification, null, 2)}\n`);
        if (r.ok) writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(r.manifest, null, 2)}\n`);
        print(r.ok ? { ok: true, manifest_sha256: hashRecord(r.manifest), pending: r.manifest.migrations.pending.map((p) => `${p.version}:${p.class}`) } : { ok: false, step: r.step, failures: r.failures });
        return r.ok ? 0 : 1;
    },

    approve(a) {
        const config = loadConfig(a);
        const manifest = readJson(a.manifest);
        const environment = a.environment ?? manifest.environment;
        const refusal = approvalRefusal({ environment, isTTY: Boolean(process.stdin.isTTY), env: process.env });
        if (refusal) throw new Error(refusal);
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
        const now = hashRecord([...parseLedger(readText(a.ledger))].sort());
        const ok = now === manifest.production_ledger_sha256;
        print({ ok, failures: ok ? [] : ["production's ledger changed since the approval; prepare and approve again"] });
        return ok ? 0 : 1;
    },

    "check-production"(a) {
        const config = loadConfig(a);
        const manifest = readJson(a.manifest);
        const final = (a.stage ?? "final") === "final";
        const contract = new Set(manifest.migrations.contract);
        const r = checkProduction({
            config,
            candidate: manifest.candidate,
            buildInfo: readJson(a["build-info"]),
            ledger: parseLedger(readText(a.ledger)),
            expectedVersions: final ? manifest.candidate_versions : manifest.candidate_versions.filter((v) => !contract.has(v)),
            fingerprint: parseKeyValue(readText(a.fingerprint)),
            expectedFingerprint: final || !contract.size ? manifest.expected_fingerprint : null,
            orgs: parseOrgs(readText(a.orgs)),
        });
        print(r);
        return r.ok ? 0 : 1;
    },

    record(a) {
        const config = loadConfig(a);
        const manifest = readJson(a.manifest);
        const step = [...STEPS, ROLLBACK_STEP].find((s) => s.id === a.step);
        if (!step) throw new Error(`unknown step ${a.step}`);
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
        process.stdout.write(renderRunbook(readJson(a.manifest), loadConfig(a)));
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

if (import.meta.url === `file://${process.argv[1]}`) {
    const a = parseArgs(process.argv.slice(2));
    const cmd = COMMANDS[a._[0]];
    if (!cmd) {
        console.error(`usage: alloy-release <${Object.keys(COMMANDS).join("|")}> [options]`);
        process.exit(2);
    }
    Promise.resolve()
        .then(() => cmd(a))
        .then((code) => process.exit(code ?? 0))
        .catch((err) => {
            console.error(`alloy-release: ${err.message}`);
            process.exit(1);
        });
}
