#!/usr/bin/env npx tsx
/**
 * Dry-run: native column → field_definitions parity gaps.
 *
 * Uses canonical ownership manifests (not a new catalog). Read-only.
 *
 * Usage:
 *   DEMO_ORG_ID=<uuid> npx tsx web/scripts/canonicalNativeColumnParityDryRun.ts
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    buildParityDryRunReport,
    formatParityDryRunReport,
    type ExistingFieldDefinitionRow,
} from "@/lib/fields/canonicalNativeColumnParity";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

async function main() {
    const orgId =
        process.env.DEMO_ORG_ID?.trim() ||
        process.env.ALLOY_PUBLIC_ORG_ID?.trim() ||
        process.env.DEV_QUEUE_ORG_ID?.trim();
    if (!orgId) {
        console.error("Set DEMO_ORG_ID, ALLOY_PUBLIC_ORG_ID, or DEV_QUEUE_ORG_ID");
        process.exit(1);
    }

    const supabase = createAdminClient();
    const { data: rows, error } = await supabase
        .from("field_definitions")
        .select("entity_type, field_key, is_system, is_active")
        .eq("org_id", orgId);

    if (error) {
        console.error(error.message);
        process.exit(1);
    }

    const report = buildParityDryRunReport(orgId, (rows ?? []) as ExistingFieldDefinitionRow[]);
    console.log(formatParityDryRunReport(report));
    console.log("(Dry-run only — no writes.)");

    if (report.ownershipErrors.length) process.exit(1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
