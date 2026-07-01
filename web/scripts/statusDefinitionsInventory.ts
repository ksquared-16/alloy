#!/usr/bin/env npx tsx
/**
 * Read-only inventory: status_definitions vs persisted status_key values.
 *
 * Env:
 *   ORG_ID=uuid              (required, or DEV_QUEUE_ORG_ID)
 *   OUTPUT=json|summary      (default json)
 *
 * Run from repo `web/`:
 *   ORG_ID=<uuid> npx tsx --tsconfig tsconfig.json scripts/statusDefinitionsInventory.ts
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { runStatusDefinitionsInventory } from "@/lib/admin/statusDefinitionsInventory";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

async function main() {
    const orgId = (process.env.ORG_ID ?? process.env.DEV_QUEUE_ORG_ID ?? "").trim();
    if (!orgId) {
        console.error("ORG_ID or DEV_QUEUE_ORG_ID is required");
        process.exit(1);
    }

    const output = (process.env.OUTPUT ?? "json").trim().toLowerCase();
    const supabase = createAdminClient();
    const report = await runStatusDefinitionsInventory(supabase, orgId);

    if (output === "summary") {
        console.log(`Status inventory — org ${orgId}`);
        console.log(`Generated: ${report.generated_at}`);
        console.log("");
        console.log("Summary:");
        for (const [key, value] of Object.entries(report.summary)) {
            console.log(`  ${key}: ${value}`);
        }
        console.log("");
        for (const layer of report.layers) {
            console.log(`--- ${layer.entity_type} (${layer.column}) ---`);
            console.log(`  active definitions: ${layer.active_definitions.length}`);
            console.log(`  distinct persisted keys: ${layer.distinct_persisted.length}`);
            console.log(`  orphan persisted: ${layer.orphan_persisted_keys.length}`);
            console.log(`  unused definitions: ${layer.unused_definition_keys.length}`);
            if (layer.orphan_persisted_keys.length) {
                console.log("  orphan keys:");
                for (const row of layer.orphan_persisted_keys.slice(0, 15)) {
                    console.log(`    ${row.status_key} (${row.count} records)`);
                }
            }
            if (layer.entity_type === "persons") {
                console.log(
                    `  missing applies_to_profiles: ${layer.missing_applicability_metadata?.length ?? 0}`
                );
                console.log(
                    `  hidden from person drawer: ${layer.hidden_from_person_drawer?.length ?? 0}`
                );
                console.log(
                    `  hidden from child drawer: ${layer.hidden_from_child_drawer?.length ?? 0}`
                );
            }
            console.log("");
        }
        return;
    }

    console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
