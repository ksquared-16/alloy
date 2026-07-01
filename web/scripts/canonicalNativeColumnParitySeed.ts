#!/usr/bin/env npx tsx
/**
 * Native column → field_definitions parity seed (Phase 4).
 *
 * Default: dry-run. Apply requires --apply and CANONICAL_PARITY_CONFIRM=APPLY_FIELD_DEFINITION_PARITY.
 *
 * Usage:
 *   DEMO_ORG_ID=<uuid> npx tsx web/scripts/canonicalNativeColumnParitySeed.ts
 *   CANONICAL_PARITY_ALL_ORGS=1 npx tsx web/scripts/canonicalNativeColumnParitySeed.ts
 *   DEMO_ORG_ID=<uuid> CANONICAL_PARITY_CONFIRM=APPLY_FIELD_DEFINITION_PARITY npx tsx web/scripts/canonicalNativeColumnParitySeed.ts --apply
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    buildParityDryRunReport,
    buildParityInsertPayload,
    formatParityApplyReport,
    formatParityDryRunReport,
    planParityApply,
    parityRowKey,
    type ExistingFieldDefinitionRow,
    type ParityApplyResult,
} from "@/lib/fields/canonicalNativeColumnParity";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const APPLY_CONFIRM = "APPLY_FIELD_DEFINITION_PARITY";

async function loadExistingFieldDefs(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string
): Promise<ExistingFieldDefinitionRow[]> {
    const { data: rows, error } = await supabase
        .from("field_definitions")
        .select("entity_type, field_key, is_active")
        .eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return (rows ?? []) as ExistingFieldDefinitionRow[];
}

async function applyForOrg(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string
): Promise<ParityApplyResult> {
    const existing = await loadExistingFieldDefs(supabase, orgId);
    const { toInsert, skipped } = planParityApply(orgId, existing);
    const result: ParityApplyResult = { orgId, added: [], skipped, failed: [] };

    for (const row of toInsert) {
        const key = parityRowKey(row.entity_type, row.field_key);
        const payload = buildParityInsertPayload(orgId, row);
        const { error: insertErr } = await supabase.from("field_definitions").insert(payload);
        if (insertErr) {
            if (insertErr.code === "23505") {
                result.skipped.push(key);
                continue;
            }
            result.failed.push({ key, error: insertErr.message });
            continue;
        }
        result.added.push(key);
    }

    return result;
}

async function resolveOrgIds(supabase: ReturnType<typeof createAdminClient>): Promise<string[]> {
    if (process.env.CANONICAL_PARITY_ALL_ORGS?.trim() === "1") {
        const { data, error } = await supabase.from("orgs").select("id").limit(500);
        if (error) throw new Error(error.message);
        return (data ?? []).map((r) => String((r as { id: string }).id));
    }
    const orgId =
        process.env.DEMO_ORG_ID?.trim() ||
        process.env.ALLOY_PUBLIC_ORG_ID?.trim() ||
        process.env.DEV_QUEUE_ORG_ID?.trim();
    if (!orgId) {
        throw new Error("Set DEMO_ORG_ID, ALLOY_PUBLIC_ORG_ID, DEV_QUEUE_ORG_ID, or CANONICAL_PARITY_ALL_ORGS=1");
    }
    return [orgId];
}

async function main() {
    const apply = process.argv.includes("--apply");

    if (apply && process.env.CANONICAL_PARITY_CONFIRM?.trim() !== APPLY_CONFIRM) {
        console.error(`Apply mode requires CANONICAL_PARITY_CONFIRM=${APPLY_CONFIRM}`);
        process.exit(1);
    }

    const supabase = createAdminClient();
    const orgIds = await resolveOrgIds(supabase);

    for (const orgId of orgIds) {
        const existing = await loadExistingFieldDefs(supabase, orgId);
        const report = buildParityDryRunReport(orgId, existing);
        console.log(formatParityDryRunReport(report));

        if (report.ownershipErrors.length) {
            console.error(`Aborting org ${orgId} — ownership validation failed.`);
            process.exit(1);
        }

        if (!apply) continue;

        const applyResult = await applyForOrg(supabase, orgId);
        console.log(formatParityApplyReport(applyResult));
        if (applyResult.failed.length) process.exit(1);
    }

    if (!apply) {
        console.log("(Dry-run only — no writes. Pass --apply with confirm env to insert missing rows.)");
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
