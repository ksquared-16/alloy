#!/usr/bin/env npx tsx
/**
 * Audit lifecycle_wu_* work units: stored queue_definition row_preview vs canonical fields.
 *
 * Run from `web/`:
 *   npx tsx --tsconfig tsconfig.json scripts/auditLifecycleWorkUnitRowPreview.ts
 *
 * Optional env:
 *   ORG_ID — filter org
 *   DEPARTMENT_ID — filter department
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { lifecycleStageQueueRowPreviewFields } from "@/lib/lifecycle/lifecycleStageQueuePresentation";
import {
    isLifecycleStageWorkUnitKey,
    stageKeyFromLifecycleWorkUnitMetadata,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const ORG_ID = process.env.ORG_ID?.trim();
const DEPARTMENT_ID = process.env.DEPARTMENT_ID?.trim();

type RowPreviewFields = string[];

function readStoredFields(queueDefinition: unknown): RowPreviewFields {
    if (queueDefinition == null || typeof queueDefinition !== "object" || Array.isArray(queueDefinition)) {
        return [];
    }
    const ui = (queueDefinition as { ui?: { row_preview?: { fields?: unknown } } }).ui;
    const fields = ui?.row_preview?.fields;
    return Array.isArray(fields) ? fields.map(String) : [];
}

function fieldGaps(expected: RowPreviewFields, stored: RowPreviewFields): string[] {
    const storedSet = new Set(stored);
    return expected.filter((f) => !storedSet.has(f));
}

async function main() {
    const supabase = createAdminClient();
    let q = supabase
        .from("work_units")
        .select("id, org_id, department_id, key, name, metadata, queue_definition, is_active")
        .like("key", "lifecycle_wu_%")
        .eq("is_active", true);
    if (ORG_ID) q = q.eq("org_id", ORG_ID);
    if (DEPARTMENT_ID) q = q.eq("department_id", DEPARTMENT_ID);
    const { data, error } = await q.order("key");
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    console.log(`\n=== Lifecycle work unit row_preview audit (${rows.length} rows) ===\n`);
    console.log(
        [
            "work_unit_id",
            "key",
            "name",
            "lifecycle_stage_key",
            "stored_variant",
            "stored_fields",
            "expected_fields",
            "missing_in_stored",
            "renderer",
        ].join("\t")
    );

    for (const row of rows) {
        const key = String(row.key ?? "");
        if (!isLifecycleStageWorkUnitKey(key)) continue;
        const stageKey = stageKeyFromLifecycleWorkUnitMetadata(row.metadata) ?? key.slice("lifecycle_wu_".length);
        const stored = readStoredFields(row.queue_definition);
        const expected = lifecycleStageQueueRowPreviewFields(stageKey) as string[];
        const missing = fieldGaps(expected, stored);
        const variant =
            row.queue_definition != null &&
            typeof row.queue_definition === "object" &&
            !Array.isArray(row.queue_definition)
                ? String(
                      (row.queue_definition as { ui?: { row_preview?: { variant?: string } } }).ui?.row_preview
                          ?.variant ?? ""
                  )
                : "";
        const renderer =
            variant === "crm_compact"
                ? "QueueBlock.tsx + page.tsx semanticCrmCompact (crmQueueRowPreviewPresentation)"
                : "page.tsx basic subtitle path";
        console.log(
            [
                row.id,
                key,
                JSON.stringify(row.name ?? ""),
                stageKey,
                variant || "(none)",
                JSON.stringify(stored),
                JSON.stringify(expected),
                JSON.stringify(missing),
                renderer,
            ].join("\t")
        );
    }

    console.log("\nAPI enrichment uses QueueService.resolveWorkUnitRowListUi (lifecycle overlay).");
    console.log("Client VM uses work-unit page applyLifecycleWorkUnitQueueUiOverlay.\n");
}

void main();
