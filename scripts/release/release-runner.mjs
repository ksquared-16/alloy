/**
 * The release procedure as code: `prepare` (candidate.identify → staging.verify → production.preflight)
 * and `execute` (owner.approval → snapshot → schema.expand → code.deploy → production.verify →
 * schema.contract → release.record, with code.rollback on a failed verification).
 *
 * Adapters supply observations and perform actions. The only adapters that ACT are the rehearsal's
 * (release-rehearsal.mjs: a throwaway database, a local bare repository, a loopback build-info
 * server). A live release uses `prepare` with the evidence-file adapter (alloy-release.mjs) and
 * performs the execute steps by the owner's hand from the printed runbook.
 */

import {
    STEPS,
    ROLLBACK_STEP,
    buildManifest,
    checkProduction,
    checkProductionBefore,
    checkStaging,
    hashRecord,
    identifyCandidate,
    planSchema,
    readBlob,
    verifyApproval,
} from "./release-lib.mjs";

const isoNow = () => new Date().toISOString();

function stop(audit, step, failures, extra = {}) {
    audit.append(step, "fail", { failures, ...extra });
    return { ok: false, step, failures, ...extra };
}

export async function prepare({ git, refs, config, environment, adapters, audit, now = isoNow }) {
    const identified = identifyCandidate({ git, ...refs });
    if (!identified.ok) return stop(audit, "candidate.identify", identified.failures);
    const { candidate, migrations } = identified;
    audit.append("candidate.identify", "pass", {
        candidate_sha: candidate.sha,
        staging_sha: candidate.staging_sha,
        production_before_sha: candidate.production_before_sha,
        commits_ahead_of_main: candidate.commits_ahead_of_main,
        migrations: migrations.length,
    });

    const sObs = await adapters.staging.observe();
    const sCheck = checkStaging({ config, candidate, migrations, buildInfo: sObs.buildInfo, checkRuns: sObs.checkRuns, ledger: sObs.ledger, orgs: sObs.orgs });
    const stagingVerification = {
        schema: "alloy.staging-verification/v1",
        candidate_sha: candidate.sha,
        staging_sha: candidate.staging_sha,
        verified_at: now(),
        ok: sCheck.ok,
        failures: sCheck.failures,
        warnings: sCheck.warnings,
        observations_sha256: hashRecord(sObs),
        fingerprint: sObs.fingerprint ?? null,
    };
    if (!sCheck.ok) return stop(audit, "staging.verify", sCheck.failures, { stagingVerification });
    audit.append("staging.verify", "pass", { verification_sha256: hashRecord(stagingVerification), warnings: sCheck.warnings });

    const pObs = await adapters.production.observe();
    const before = checkProductionBefore({ config, candidate, buildInfo: pObs.buildInfo });
    const plan = planSchema({ candidateMigrations: migrations, productionLedger: pObs.ledger, baseline: identified.baseline_migrations, sqlOf: (m) => readBlob(git, m.blob) });
    const failures = [...before.failures, ...plan.blockers];
    if (failures.length) return stop(audit, "production.preflight", failures, { plan });
    audit.append("production.preflight", "pass", { ledger_head: plan.ledger_head, pending: plan.pending.map((p) => `${p.version}:${p.class}`), warnings: plan.warnings });

    const manifest = {
        ...buildManifest({ environment, identified, plan, stagingVerification, createdAt: now() }),
        production_ledger_sha256: hashRecord([...pObs.ledger].sort()),
        expected_fingerprint: sObs.fingerprint ?? null,
        candidate_versions: migrations.map((m) => m.version).filter(Boolean),
    };
    return { ok: true, manifest, stagingVerification, plan };
}

/**
 * `sqlOf(version)` returns the candidate's SQL for a pending version (from git objects, never the worktree).
 * `waitServing` must resolve to the build-info observed once production serves the given SHA, or the last one seen.
 */
export async function execute({ manifest, approval, config, environment, adapters, audit, sqlOf, now = isoNow }) {
    const p = adapters.production;
    const gate = (step) => {
        const v = verifyApproval({ approval, manifest, config, environment, now: now(), scopeNeeded: step.scope });
        return v.ok ? null : v.failures;
    };
    const byId = Object.fromEntries(STEPS.map((s) => [s.id, s]));

    // owner.approval: nothing that touches production runs before this passes.
    const denied = gate(byId["owner.approval"]);
    if (denied) return stop(audit, "owner.approval", denied, { production_touched: false });
    audit.append("owner.approval", "pass", { approver: approval.approver.name, approval_sha256: hashRecord(approval), scope: approval.scope, expires_at: approval.expires_at });

    // production.snapshot
    let g = gate(byId["production.snapshot"]);
    if (g) return stop(audit, "production.snapshot", g, { production_touched: false });
    const snapshot = await p.snapshot();
    audit.append("production.snapshot", "pass", snapshot);

    // schema.expand — the ledger must be the one the owner approved, then apply in version order.
    g = gate(byId["schema.expand"]);
    if (g) return stop(audit, "schema.expand", g);
    const ledgerNow = (await p.observe()).ledger;
    if (hashRecord([...ledgerNow].sort()) !== manifest.production_ledger_sha256) {
        return stop(audit, "schema.expand", ["production's ledger changed since the approval; prepare and approve again"], { production_code_changed: false });
    }
    const applied = [];
    for (const version of manifest.migrations.expand) {
        const m = manifest.migrations.pending.find((x) => x.version === version);
        try {
            await p.applyMigration({ version, name: m.name, sql: sqlOf(m) });
            applied.push(version);
            audit.append("schema.expand", "applied", { version, file: m.file });
        } catch (err) {
            // Each file runs in one transaction with its ledger row, so the failing file left nothing.
            // The old build is still serving and every applied file is additive: hold, fix forward.
            return stop(audit, "schema.expand", [`${m.file}: ${String(err.message).split("\n").slice(0, 3).join(" ")}`], {
                applied,
                production_code_changed: false,
                recovery: "hold: production still serves the previous build, which tolerates the additive migrations already applied; fix forward in a new candidate, or restore the snapshot only with a new owner approval",
            });
        }
    }
    audit.append("schema.expand", "pass", { applied });

    // code.deploy — compare-and-swap main from the approved previous SHA to the candidate.
    g = gate(byId["code.deploy"]);
    if (g) return stop(audit, "code.deploy", g, { production_code_changed: false });
    try {
        await p.deploy({ from: manifest.candidate.production_before_sha, to: manifest.candidate.sha });
    } catch (err) {
        return stop(audit, "code.deploy", [String(err.message)], { production_code_changed: false });
    }
    const served = await p.waitServing(manifest.candidate.sha);
    audit.append("code.deploy", "pass", { main: manifest.candidate.sha, served: served?.gitSha ?? null });

    // production.verify
    const contract = new Set(manifest.migrations.contract);
    const verifyNow = async (expectedVersions, expectedFingerprint) => {
        const o = await p.observe();
        return checkProduction({ config, candidate: manifest.candidate, buildInfo: o.buildInfo, ledger: o.ledger, expectedVersions, fingerprint: o.fingerprint, expectedFingerprint, orgs: o.orgs });
    };
    const v = await verifyNow(manifest.candidate_versions.filter((x) => !contract.has(x)), contract.size ? null : manifest.expected_fingerprint);
    if (!v.ok) {
        audit.append("production.verify", "fail", { failures: v.failures });
        return rollback({ manifest, approval, config, environment, adapters, audit, now, reason: v.failures });
    }
    audit.append("production.verify", "pass", {});

    // schema.contract — destructive changes only once the code that no longer needs the old shape is live.
    if (contract.size) {
        g = gate(byId["schema.contract"]);
        if (g) return stop(audit, "schema.contract", g, { recovery: "release is live without its contract migrations; they ship once the owner grants schema_contract" });
        for (const version of manifest.migrations.contract) {
            const m = manifest.migrations.pending.find((x) => x.version === version);
            try {
                await p.applyMigration({ version, name: m.name, sql: sqlOf(m) });
                audit.append("schema.contract", "applied", { version, file: m.file });
            } catch (err) {
                return stop(audit, "schema.contract", [`${m.file}: ${String(err.message).split("\n")[0]}`], { recovery: "hold: the new build is live and the failing file left nothing; fix forward" });
            }
        }
        const v2 = await verifyNow(manifest.candidate_versions, manifest.expected_fingerprint);
        if (!v2.ok) return stop(audit, "schema.contract", v2.failures, { recovery: "hold and fix forward; do not roll code back across a contract migration" });
        audit.append("schema.contract", "pass", {});
    } else {
        audit.append("schema.contract", "skip", { reason: "no destructive migrations in this release" });
    }

    const record = { outcome: "released", candidate_sha: manifest.candidate.sha, manifest_sha256: hashRecord(manifest), approval_sha256: hashRecord(approval), snapshot, audit_head_before_record: audit.head };
    audit.append("release.record", "pass", { record_sha256: hashRecord(record) });
    return { ok: true, record };
}

async function rollback({ manifest, approval, config, environment, adapters, audit, now, reason }) {
    const v = verifyApproval({ approval, manifest, config, environment, now: now(), scopeNeeded: ROLLBACK_STEP.scope });
    if (!v.ok) return stop(audit, ROLLBACK_STEP.id, v.failures, { reason, recovery: "rollback needs the owner: code_rollback is not granted" });
    const to = manifest.candidate.production_before_sha;
    await adapters.production.rollbackCode(to);
    const served = await adapters.production.waitServing(to);
    const ok = served?.gitSha === to;
    audit.append(ROLLBACK_STEP.id, ok ? "pass" : "fail", { served: served?.gitSha ?? null, expected: to, schema: "additive migrations stay applied; the previous build tolerates them" });
    return { ok: false, step: "production.verify", failures: reason, rolledBack: ok };
}
