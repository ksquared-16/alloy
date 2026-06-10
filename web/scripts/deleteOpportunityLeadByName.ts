#!/usr/bin/env npx tsx
/**
 * Developer helper: find opportunity by name and run delete preview/execute.
 *
 * Env: DEV_QUEUE_ORG_ID or DEMO_RESET_ORG_ID, SUPABASE_SERVICE_ROLE_KEY
 *
 * Flags:
 *   --name=<substring>   Case-insensitive name match (required)
 *   --execute            Perform delete (default: preview only)
 *
 * Run from `web/`:
 *   npx tsx scripts/deleteOpportunityLeadByName.ts --name="Jimmy Patter"
 *   npx tsx scripts/deleteOpportunityLeadByName.ts --name="Jimmy Patter" --execute
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    executeDeleteOpportunityLead,
    previewOpportunityLeadDeletion,
    verifyOpportunityLeadDeletionOrphans,
} from "@/lib/admin/opportunity/deleteOpportunityLead";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

function requireOrgId(): string {
    const v = process.env.DEMO_RESET_ORG_ID?.trim() || process.env.DEV_QUEUE_ORG_ID?.trim();
    if (!v) {
        console.error("Missing required env: DEMO_RESET_ORG_ID or DEV_QUEUE_ORG_ID");
        process.exit(1);
    }
    return v;
}

function parseArgs(): { name: string; execute: boolean } {
    const argv = process.argv.slice(2);
    let name = "";
    let execute = false;
    for (const arg of argv) {
        if (arg === "--execute") execute = true;
        else if (arg.startsWith("--name=")) name = arg.slice("--name=".length).trim();
    }
    if (!name) {
        console.error("Provide --name=<substring>");
        process.exit(1);
    }
    return { name, execute };
}

async function main(): Promise<void> {
    const { name, execute } = parseArgs();
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
        console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
        process.exit(1);
    }

    const orgId = requireOrgId();
    const supabase = createAdminClient();

    const { data, error } = await supabase
        .from("opportunities")
        .select("id, name")
        .eq("org_id", orgId)
        .ilike("name", `%${name}%`);
    if (error) throw new Error(error.message);

    const matches = (data ?? []).map((r) => ({
        id: String((r as { id: string }).id),
        name: String((r as { name?: string }).name ?? "").trim(),
    }));

    console.log(`\n=== deleteOpportunityLeadByName: ${execute ? "EXECUTE" : "PREVIEW"} ===\n`);
    console.log(`org_id: ${orgId}`);
    console.log(`name filter: ${name}`);
    console.log(`matches: ${matches.length}\n`);

    if (!matches.length) {
        console.log("No opportunities matched.\n");
        return;
    }

    for (const match of matches) {
        console.log(`--- ${match.name} (${match.id}) ---`);
        const preview = await previewOpportunityLeadDeletion(supabase, orgId, match.id);
        if (!preview) {
            console.log("Preview unavailable.\n");
            continue;
        }
        console.log(JSON.stringify(preview, null, 2));

        if (!execute) continue;

        if (preview.blocked) {
            console.error(`Blocked: ${preview.block_reason}`);
            process.exit(1);
        }

        const result = await executeDeleteOpportunityLead({
            supabase,
            orgId,
            opportunityId: match.id,
            actorUserId: "script:deleteOpportunityLeadByName",
            actorRole: "admin",
        });
        console.log("Deleted:", result.deleted);
        const orphans = await verifyOpportunityLeadDeletionOrphans(supabase, orgId, match.id);
        console.log("Orphans:", orphans);
        const orphanTotal = Object.values(orphans).reduce((s, n) => s + n, 0);
        if (orphanTotal > 0) {
            console.error("Orphan rows remain.");
            process.exit(1);
        }
        console.log("Delete complete.\n");
    }

    if (!execute) {
        console.log("\nDry-run complete. Pass --execute to delete.\n");
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
