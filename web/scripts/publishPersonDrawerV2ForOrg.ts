#!/usr/bin/env npx tsx
/**
 * Dev/staging-only: publish a new org `entity_layouts` version for
 * person/drawer/default using builtin `person_drawer_v2` (Patch 19 preset).
 *
 * Preserves prior versions (e.g. v1) — inserts the next version as published.
 * Does not change resolver precedence or global defaults.
 *
 * Default org: 93667019-bd28-49b5-a688-acc9bb1e0a19
 *
 * Env (from `web/.env.local`):
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
 *
 * Run from `web/`:
 *   npm run dev:layout:publish-person-drawer-v2
 *   ORG_ID=<uuid> PERSON_DRAWER_V2_RESET_CONFIRM=PERSON_DRAWER_V2_RESET \
 *     npm run dev:layout:publish-person-drawer-v2:execute
 *   npm run dev:layout:verify-person-drawer-v2
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
    DEFAULT_PERSON_DRAWER_RESET_ORG_ID,
    PERSON_DRAWER_V2_EXPECTED_SECTION_KEYS,
    PERSON_DRAWER_V2_RESET_CONFIRM,
    assertPersonDrawerV2ResetAllowed,
    loadLatestPublishedPersonDrawerLayout,
    publishPersonDrawerV2ResetForOrg,
    summarizePersonDrawerLayout,
    type PublishPersonDrawerV2ResetResult,
} from "./lib/personDrawerV2OrgReset";

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
    return parseOrgArg(argv) ?? process.env.ORG_ID?.trim() ?? DEFAULT_PERSON_DRAWER_RESET_ORG_ID;
}

function printSummary(label: string, summary: ReturnType<typeof summarizePersonDrawerLayout>): void {
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

function printVerificationHints(result: PublishPersonDrawerV2ResetResult): void {
    const published = result.published;
    console.log("\nVerify in the live Person drawer (after hard refresh):");
    console.log('  data-layout-runtime-source="org"');
    console.log('  data-layout-runtime-key="default"');
    console.log(`  data-layout-runtime-version="${published?.version ?? result.nextVersion ?? "?"}"`);
    console.log('  doc.metadata.template="person_drawer_v2"');
    console.log(`  sections: ${PERSON_DRAWER_V2_EXPECTED_SECTION_KEYS.join(", ")}`);
    console.log('  data-person-drawer-command-header-root="true"');
    console.log('  data-person-overview-composition="true"');
    console.log('  data-drawer-layout-runtime-shell-zone="summary_strip"');
    console.log("  Optional: set NEXT_PUBLIC_LAYOUT_RUNTIME_STAGING_DEBUG=1 for staging diagnostic panel.");
}

function printResult(result: PublishPersonDrawerV2ResetResult): void {
    console.log(`\n=== publishPersonDrawerV2ForOrg: ${result.action.toUpperCase()} ===`);
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

    assertPersonDrawerV2ResetAllowed({ allowProduction });

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
        const confirm = process.env.PERSON_DRAWER_V2_RESET_CONFIRM?.trim();
        if (confirm !== PERSON_DRAWER_V2_RESET_CONFIRM) {
            console.error(`Refusing --execute: set PERSON_DRAWER_V2_RESET_CONFIRM=${PERSON_DRAWER_V2_RESET_CONFIRM}`);
            process.exit(1);
        }
    }

    const supabase = createAdminClient();

    if (verifyOnly) {
        const latest = await loadLatestPublishedPersonDrawerLayout(supabase, orgId);
        printSummary("Latest published org person drawer layout", summarizePersonDrawerLayout(latest));
        console.log("\nExpected after reset:");
        console.log('  layoutSource="org" layoutKey="default" doc.metadata.template="person_drawer_v2"');
        console.log(`  sections: ${PERSON_DRAWER_V2_EXPECTED_SECTION_KEYS.join(", ")}`);
        return;
    }

    const mode = execute ? "EXECUTE" : "DRY-RUN";
    console.log(`\n=== publishPersonDrawerV2ForOrg (${mode}) ===`);
    console.log(`org_id: ${orgId}`);
    if (dryRun) {
        console.log("No DB writes. Pass --execute with PERSON_DRAWER_V2_RESET_CONFIRM to publish.\n");
    }

    const result = await publishPersonDrawerV2ResetForOrg(supabase, orgId, { dryRun, force });
    printResult(result);
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
