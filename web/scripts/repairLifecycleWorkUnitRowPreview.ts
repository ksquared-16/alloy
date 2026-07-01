#!/usr/bin/env npx tsx
/**
 * Persist canonical row_preview fields onto all lifecycle_wu_* work units.
 *
 * Run from `web/`:
 *   npx tsx --tsconfig tsconfig.json scripts/repairLifecycleWorkUnitRowPreview.ts
 *
 * Dry run (default): prints planned updates only.
 *   DRY_RUN=0 npx tsx ...  — writes to work_units.queue_definition
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    isLifecycleStageWorkUnitKey,
    mergeLifecycleStageRowPreviewIntoQueueDefinition,
    stageKeyFromLifecycleWorkUnitMetadata,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

const DRY_RUN = process.env.DRY_RUN !== "0";

async function main() {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("work_units")
        .select("id, key, metadata, queue_definition")
        .like("key", "lifecycle_wu_%")
        .eq("is_active", true);
    if (error) throw new Error(error.message);

    console.log(DRY_RUN ? "\n[DRY RUN] Planned row_preview repairs:\n" : "\nApplying row_preview repairs:\n");
    for (const row of data ?? []) {
        const key = String(row.key ?? "");
        if (!isLifecycleStageWorkUnitKey(key)) continue;
        const stageKey =
            stageKeyFromLifecycleWorkUnitMetadata(row.metadata) ?? key.slice("lifecycle_wu_".length);
        const merged = mergeLifecycleStageRowPreviewIntoQueueDefinition(row.queue_definition, stageKey);
        const fields =
            merged.ui != null && typeof merged.ui === "object" && !Array.isArray(merged.ui)
                ? (merged.ui as { row_preview?: { fields?: string[] } }).row_preview?.fields
                : [];
        console.log(`${row.id} ${key} (${stageKey}) → fields: ${JSON.stringify(fields)}`);
        if (!DRY_RUN) {
            const { error: upErr } = await supabase
                .from("work_units")
                .update({ queue_definition: merged, updated_at: new Date().toISOString() })
                .eq("id", row.id);
            if (upErr) throw new Error(upErr.message);
        }
    }
    console.log(DRY_RUN ? "\nSet DRY_RUN=0 to persist.\n" : "\nDone.\n");
}

void main();
