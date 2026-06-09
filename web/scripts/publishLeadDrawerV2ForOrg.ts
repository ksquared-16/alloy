#!/usr/bin/env npx tsx
/**
 * Dev/staging-only: publish a new org `entity_layouts` version for
 * opportunities/drawer/default using builtin `lead_drawer_v2` (Patch 5 preset).
 *
 * Preserves prior versions (e.g. v13) — inserts the next version as published.
 * Does not change resolver precedence or global defaults.
 *
 * Default org: 93667019-bd28-49b5-a688-acc9bb1e0a19
 *
 * Env (from `web/.env.local`):
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
 *
 * Run from `web/`:
 *   npx tsx --tsconfig tsconfig.json scripts/publishLeadDrawerV2ForOrg.ts
 *   npx tsx --tsconfig tsconfig.json scripts/publishLeadDrawerV2ForOrg.ts --execute
 *   ORG_ID=<uuid> LEAD_DRAWER_V2_RESET_CONFIRM=LEAD_DRAWER_V2_RESET \
 *     npx tsx --tsconfig tsconfig.json scripts/publishLeadDrawerV2ForOrg.ts --execute
 *
 * Flags:
 *   --dry-run          Preview only (default when --execute omitted)
 *   --execute          Insert + publish new version (requires confirm env)
 *   --verify-only      Print latest published org drawer layout summary and exit
 *   --org=<uuid>       Target org (default demo org above)
 *   --force            Publish even if latest reset target already matches v2
 *   --allow-production Explicit override for production deploy env (avoid)
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    DEFAULT_LEAD_DRAWER_RESET_ORG_ID,
    LEAD_DRAWER_V2_EXPECTED_SECTION_KEYS,
    LEAD_DRAWER_V2_RESET_CONFIRM,
    assertLeadDrawerV2ResetAllowed,
    loadLatestPublishedLeadDrawerLayout,
    publishLeadDrawerV2ResetForOrg,
    summarizeLeadDrawerLayout,
    type PublishLeadDrawerV2ResetResult,
} from "./lib/leadDrawerV2OrgReset";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseOrgArg(argv: string[]): string | null {
    const raw = argv.find((a) => a.startsWith("--org="));
    const v = raw?.slice("--org=".length).trim();
    return v && UUID_RE.test(v) ? v : null;
}

function resolveOrgId(argv: string[]): string {
    return parseOrgArg(argv) ?? process.env.ORG_ID?.trim() ?? DEFAULT_LEAD_DRAWER_RESET_ORG_ID;
}

function printSummary(label: string, summary: ReturnType<typeof summarizeLeadDrawerLayout>): void {
    console.log(`\n${label}`);
    console.log(`  found: ${summary.found}`);
    console.log(`  layoutRecordId: ${summary.layoutRecordId ?? "—"}`);
    console.log(`  version: ${summary.version ?? "—"}`);
    console.log(`  status: ${summary.status ?? "—"}`);
    console.log(`  layoutKey: ${summary.layoutKey ?? "—"}`);
    console.log(`  row.metadata.seededFrom: ${summary.rowSeededFrom ?? "—"}`);
    console.log(`  doc.metadata.template: ${summary.docTemplate ?? "—"}`);
    console.log(`  sectionKeys: ${summary.sectionKeys.length ? summary.sectionKeys.join(", ") : "—"}`);
    console.log(`  isResetTarget: ${summary.isResetTarget}`);
}

function printVerificationHints(result: PublishLeadDrawerV2ResetResult): void {
    const published = result.published;
    console.log("\nVerify in the live Lead drawer (after hard refresh):");
    console.log('  data-layout-runtime-source="org"');
    console.log('  data-layout-runtime-key="default"');
    console.log(`  data-layout-runtime-version="${published?.version ?? result.nextVersion ?? "?"}"`);
    console.log('  doc.metadata.template="lead_drawer_v2"');
    console.log(`  sections: ${LEAD_DRAWER_V2_EXPECTED_SECTION_KEYS.join(", ")}`);
    console.log("  Optional: set NEXT_PUBLIC_LAYOUT_RUNTIME_STAGING_DEBUG=1 for staging diagnostic panel.");
}

function printResult(result: PublishLeadDrawerV2ResetResult): void {
    console.log(`\n=== publishLeadDrawerV2ForOrg: ${result.action.toUpperCase()} ===`);
    console.log(`org_id: ${result.orgId}`);
    printSummary("Previous published", result.previousPublished);
    if (result.nextVersion != null) console.log(`Next version: ${result.nextVersion}`);
    if (result.published && result.action !== "dry_run") printSummary("Published", result.published);
    if (result.action === "dry_run" && result.published) printSummary("Would publish", result.published);
    console.log(`\n${result.message}`);
    printVerificationHints(result);
}

async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    const argvSet = new Set(argv);
    const execute = argvSet.has("--execute");
    const verifyOnly = argvSet.has("--verify-only");
    const force = argvSet.has("--force");
    const allowProduction = argvSet.has("--allow-production");
    const dryRun = !execute;

    assertLeadDrawerV2ResetAllowed({ allowProduction });

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
        console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
        process.exit(1);
    }

    const orgId = resolveOrgId(argv);
    if (!UUID_RE.test(orgId)) {
        console.error(`Invalid org id: ${orgId}`);
        process.exit(1);
    }

    if (execute) {
        const confirm = process.env.LEAD_DRAWER_V2_RESET_CONFIRM?.trim();
        if (confirm !== LEAD_DRAWER_V2_RESET_CONFIRM) {
            console.error(`Refusing --execute: set LEAD_DRAWER_V2_RESET_CONFIRM=${LEAD_DRAWER_V2_RESET_CONFIRM}`);
            process.exit(1);
        }
    }

    const supabase = createAdminClient();

    if (verifyOnly) {
        const latest = await loadLatestPublishedLeadDrawerLayout(supabase, orgId);
        printSummary("Latest published org drawer layout", summarizeLeadDrawerLayout(latest));
        console.log("\nExpected after reset:");
        console.log('  layoutSource="org" layoutKey="default" doc.metadata.template="lead_drawer_v2"');
        console.log(`  sections: ${LEAD_DRAWER_V2_EXPECTED_SECTION_KEYS.join(", ")}`);
        return;
    }

    const mode = execute ? "EXECUTE" : "DRY-RUN";
    console.log(`\n=== publishLeadDrawerV2ForOrg (${mode}) ===`);
    console.log(`org_id: ${orgId}`);
    if (dryRun) {
        console.log("No DB writes. Pass --execute with LEAD_DRAWER_V2_RESET_CONFIRM to publish.\n");
    }

    const result = await publishLeadDrawerV2ResetForOrg(supabase, orgId, { dryRun, force });
    printResult(result);
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
