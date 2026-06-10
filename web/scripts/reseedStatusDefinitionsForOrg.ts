#!/usr/bin/env npx tsx
/**
 * Reseed MVP status definitions for a single org (dev/demo).
 *
 * Env:
 *   ORG_ID=uuid                 (required, or DEV_QUEUE_ORG_ID)
 *   EXECUTE=1                   (required for writes; default dry-run)
 *   BACKFILL=1                  (backfill dummy opportunity/person keys; requires EXECUTE=1)
 *   DEACTIVATE_LEGACY=1         (default 1 — deactivate legacy opportunity/person defs)
 *
 * Run from repo `web/`:
 *   ORG_ID=<uuid> npx tsx --tsconfig tsconfig.json scripts/reseedStatusDefinitionsForOrg.ts
 *   ORG_ID=<uuid> EXECUTE=1 BACKFILL=1 npx tsx --tsconfig tsconfig.json scripts/reseedStatusDefinitionsForOrg.ts
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    runStatusDefinitionsReseed,
    summarizeEffectiveStatusKeys,
} from "@/lib/admin/statusReseed/runStatusDefinitionsReseed";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

function flag(name: string, defaultValue = false): boolean {
    const raw = (process.env[name] ?? "").trim().toLowerCase();
    if (!raw) return defaultValue;
    return raw === "1" || raw === "true" || raw === "yes";
}

async function main() {
    const orgId = (process.env.ORG_ID ?? process.env.DEV_QUEUE_ORG_ID ?? "").trim();
    if (!orgId) {
        console.error("ORG_ID or DEV_QUEUE_ORG_ID is required");
        process.exit(1);
    }

    const execute = flag("EXECUTE");
    const backfill = flag("BACKFILL");
    const deactivateLegacy = flag("DEACTIVATE_LEGACY", true);

    if (backfill && !execute) {
        console.error("BACKFILL=1 requires EXECUTE=1");
        process.exit(1);
    }

    const supabase = createAdminClient();

    console.log("=".repeat(80));
    console.log(`Status MVP reseed — org ${orgId}`);
    console.log({ execute, backfill, deactivateLegacy, mode: execute ? "EXECUTE" : "DRY RUN" });
    console.log("=".repeat(80));

    const effectiveBefore = {
        opportunities: await summarizeEffectiveStatusKeys(supabase, orgId, "opportunities"),
        persons: await summarizeEffectiveStatusKeys(supabase, orgId, "persons"),
        ocm: await summarizeEffectiveStatusKeys(supabase, orgId, "opportunity_customer_members"),
    };
    console.log("\nEffective active keys BEFORE:");
    console.log(JSON.stringify(effectiveBefore, null, 2));

    const result = await runStatusDefinitionsReseed(supabase, {
        orgId,
        execute,
        backfill,
        deactivateLegacy,
    });

    console.log("\nLayer results:");
    for (const layer of result.layers) {
        console.log(
            `  ${layer.entity_type}: upserted=${layer.upserted} inserted=${layer.inserted} updated=${layer.updated} deactivated=${layer.deactivated}`
        );
    }

    if (result.backfill) {
        console.log("\nBackfill:");
        console.log(`  opportunities → open: ${result.backfill.opportunities}`);
        console.log(`  persons → pre_enrolled: ${result.backfill.persons}`);
    }

    if (result.inventory_before) {
        console.log("\nInventory summary BEFORE:");
        console.log(JSON.stringify(result.inventory_before.summary, null, 2));
    }
    if (execute && result.inventory_after) {
        console.log("\nInventory summary AFTER:");
        console.log(JSON.stringify(result.inventory_after.summary, null, 2));
        for (const layer of result.inventory_after.layers) {
            if (layer.orphan_persisted_keys.length) {
                console.log(`  orphan ${layer.entity_type}:`, layer.orphan_persisted_keys);
            }
        }
    }

    const effectiveAfter = {
        opportunities: await summarizeEffectiveStatusKeys(supabase, orgId, "opportunities"),
        persons: await summarizeEffectiveStatusKeys(supabase, orgId, "persons"),
        ocm: await summarizeEffectiveStatusKeys(supabase, orgId, "opportunity_customer_members"),
    };
    console.log("\nEffective active keys AFTER:");
    console.log(JSON.stringify(effectiveAfter, null, 2));

    if (!execute) {
        console.log("\nDry run complete. Re-run with EXECUTE=1 to apply.");
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
