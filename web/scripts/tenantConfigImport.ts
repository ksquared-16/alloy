#!/usr/bin/env npx tsx
/**
 * Import a reviewed configuration export into a named org, and check the result (briefing M8, step 16). Run from
 * `web/`:
 *
 *   ALLOY_ENVIRONMENT=production ALLOY_OPERATOR_SERVICE_ROLE_KEY=… npm run tenant:config:import -- <plan|apply|verify> \
 *     --target production --supabase-url https://<ref>.supabase.co --project-ref <ref> \
 *     --file <release-dir>/firefly-config-export.json --expect-sha256 <approved sha256> \
 *     --org-id <ORG_ID from tenant:create> --admin-user-id <the named admin> --log <release-dir>/step16-import.log
 *
 *   plan     dry run: validates the file, reads the org, prints every planned write; writes nothing
 *   apply    the same plan, a typed confirmation (the org id's first 8 characters), then the writes
 *   verify   the §5.6 item-5 checks; also takes --baseline <step-9 census-extras.txt>, --after-census <the same
 *            census taken after the import> and --release-config <file>
 *
 * The writes go through the app's own write paths (lib/tenancy/configTransfer/importer.ts) and only create what is
 * absent, so a second apply is a no-op. Targets: lib/tenancy/operatorTarget.ts. Every printed line goes to --log.
 */

import "@/lib/tenancy/nextRuntimeShim";

import { createHash } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";

import { exportCounts, validateExportFile, type ExportFile } from "@/lib/tenancy/configTransfer/exportFile";
import { applyImport, planImport } from "@/lib/tenancy/configTransfer/importer";
import { parseBaselineCounts, verifyTenantImport } from "@/lib/tenancy/configTransfer/verify";
import { describeOperatorTarget } from "@/lib/tenancy/operatorTarget";
import {
    argValue,
    confirmByTyping,
    openOperatorLog,
    operatorClient,
    resolveTargetFromArgs,
} from "@/lib/tenancy/operatorSession";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_RELEASE_CONFIG = resolve(__dirname, "../../scripts/release/release-config.json");

async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    const mode = argv[0];
    if (!["plan", "apply", "verify"].includes(mode)) {
        console.error("usage: tenant:config:import -- <plan|apply|verify> --target … --file … --org-id … --admin-user-id … --log …");
        process.exit(3);
    }
    const log = openOperatorLog(argv, `tenant:config:import ${mode}`);
    const target = resolveTargetFromArgs(argv, log);
    const orgId = (argValue(argv, "org-id") ?? "").trim().toLowerCase();
    const adminUserId = (argValue(argv, "admin-user-id") ?? "").trim().toLowerCase();
    if (!UUID.test(orgId)) log.fail("--org-id must be the new org's id (tenant:create prints ORG_ID=…)", 3);
    if (!UUID.test(adminUserId)) log.fail("--admin-user-id must be the named admin's auth.users id", 3);

    // ── the file: integrity, then the allowlist gate ───────────────────────
    const filePath = argValue(argv, "file");
    if (!filePath) log.fail("--file is required", 3);
    const text = readFileSync(filePath!, "utf8");
    const sha = createHash("sha256").update(text).digest("hex");
    log.line(`file: ${filePath}  sha256 ${sha}`);
    const expected = (argValue(argv, "expect-sha256") ?? "").trim().toLowerCase();
    if (expected && expected !== sha) log.fail(`refused (file_changed): the file's sha256 is not the approved ${expected}`, 4);
    if (!expected && (mode === "apply" || target.target === "production")) {
        log.fail("--expect-sha256 <the reviewed file's sha256> is required here", 3);
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        log.fail("the file is not JSON", 4);
    }
    const checked = validateExportFile(parsed);
    if (!checked.ok) log.fail(`refused (outside the allowlist or malformed):\n  - ${checked.errors.join("\n  - ")}`, 4);
    const file: ExportFile = (checked as { file: ExportFile }).file;
    if (target.target === "production" && file.source.seed_config_kept) {
        log.fail("refused (seed_config): this file kept the E2 seed's configuration; it is a local rehearsal file", 4);
    }
    if (file.source.org_id === orgId) log.fail("refused (same_org): the target org is the export's own source org", 4);
    log.line(`export of "${file.source.org_name}" (${file.source.environment}, ${file.source.exported_at}): ${JSON.stringify(exportCounts(file))}`);

    // ── the org and its admin ──────────────────────────────────────────────
    const supabase = operatorClient(target);
    log.line(`target: ${describeOperatorTarget(target)}`);
    const { data: org, error: orgErr } = await supabase.from("orgs").select("id, name, slug, status").eq("id", orgId).maybeSingle();
    if (orgErr) log.fail(`orgs: ${orgErr.message}`);
    if (!org) log.fail(`refused (org_not_found): no org ${orgId}`, 4);
    if (org!.status !== "active") log.fail(`refused (org_not_active): org ${orgId} is ${org!.status}`, 4);
    log.line(`org: ${org!.id}|${org!.status}|${org!.name} (${org!.slug})`);
    const { data: adminRole } = await supabase.from("user_roles").select("role").eq("org_id", orgId).eq("user_id", adminUserId).eq("role", "admin").maybeSingle();
    if (!adminRole) log.fail(`refused (admin_not_member): ${adminUserId} is not an admin of org ${orgId}`, 4);

    if (mode === "verify") {
        const baselinePath = argValue(argv, "baseline");
        const afterPath = argValue(argv, "after-census");
        if (afterPath && !baselinePath) log.fail("--after-census needs --baseline", 3);
        const configPath = argValue(argv, "release-config") ?? DEFAULT_RELEASE_CONFIG;
        const cfg = JSON.parse(readFileSync(configPath, "utf8")) as {
            tenancy?: { qa_fixture_orgs?: Array<{ id: string }>; staging_retired_orgs?: Array<{ id: string }> };
        };
        log.line(`release config: ${configPath}${baselinePath ? `; baseline: ${baselinePath}` : "; no baseline (every checked table expected empty)"}`);
        const results = await verifyTenantImport({
            supabase,
            orgId,
            adminUserId,
            file,
            baseline: baselinePath ? parseBaselineCounts(readFileSync(baselinePath, "utf8")) : null,
            after: afterPath ? parseBaselineCounts(readFileSync(afterPath, "utf8")) : null,
            policy: {
                qaFixtureOrgIds: (cfg.tenancy?.qa_fixture_orgs ?? []).map((o) => o.id),
                stagingRetiredOrgIds: (cfg.tenancy?.staging_retired_orgs ?? []).map((o) => o.id),
            },
        });
        for (const r of results) log.line(`${r.pass ? "PASS" : "FAIL"}  ${r.check.padEnd(28)} ${r.detail}`);
        const failed = results.filter((r) => !r.pass).length;
        if (failed) log.fail(`${failed} check(s) failed — step 16 fails (briefing §7)`);
        log.line(`✓ all ${results.length} checks passed`);
        return;
    }

    // ── plan ───────────────────────────────────────────────────────────────
    const steps = await planImport(supabase, orgId, file);
    log.line(`plan (${steps.length} item(s)):`);
    for (const s of steps) log.line(`  ${s.action.padEnd(15)} ${s.ref.padEnd(40)} ${s.detail}`);
    const creates = steps.filter((s) => s.action === "create" || s.action === "complete").length;
    const completes = steps.filter((s) => s.action === "complete").length;
    const differs = steps.filter((s) => s.action === "present_differs");
    const blockedCount = steps.filter((s) => s.action === "blocked").length;
    log.line(
        `summary: ${creates - completes} to create, ${completes} to complete, ${steps.length - creates - differs.length - blockedCount} already present, ` +
            `${differs.length} present but different (left unchanged)${blockedCount ? `, ${blockedCount} blocked` : ""}`,
    );
    if (mode === "plan") {
        log.line("dry run: nothing was written");
        return;
    }
    if (differs.length) log.fail("refused (present_differs): the org already holds different configuration for the items above; nothing was written", 4);
    const blocked = steps.filter((s) => s.action === "blocked");
    if (blocked.length) log.fail("refused (blocked): the items above cannot be completed in this org; nothing was written", 4);
    if (creates === 0) {
        log.line("nothing to write: every item is already present (no-op)");
        return;
    }
    await confirmByTyping(log, `Write ${creates} item(s) into "${org!.name}" on ${describeOperatorTarget(target)}?`, orgId.slice(0, 8));
    const { created } = await applyImport({ supabase, orgId, actorUserId: adminUserId, say: (l) => log.line(l) }, file, steps);
    log.line(`✓ wrote ${created} item(s); run verify next`);
}

main().catch((err) => {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
});
