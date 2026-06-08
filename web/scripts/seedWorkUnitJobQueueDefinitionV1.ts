#!/usr/bin/env npx tsx
/**
 * Dev/staging helper: assign a real QueueDefinitionV1 (job) to an existing work unit.
 *
 * Run from `web/`:
 *   DEV_QUEUE_ORG_ID=... DEV_QUEUE_WORK_UNIT_ID=... npx tsx scripts/seedWorkUnitJobQueueDefinitionV1.ts
 * or:
 *   DEV_QUEUE_ORG_ID=... DEV_QUEUE_WORK_UNIT_KEY=... npx tsx scripts/seedWorkUnitJobQueueDefinitionV1.ts
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { validateQueueDefinition } from "@/lib/config/queueDefinitionSchema";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const QUEUE_DEFINITION_V1_JOB = {
    version: 1,
    entity_type: "job",
    queues: [
        {
            key: "all",
            label: "All Jobs",
            description: "All jobs in this work unit.",
            filters: [],
            sort: [{ field: "created_at", direction: "desc" }],
            limit: 5,
            priority: "standard",
            display: "list",
        },
        {
            key: "unassigned",
            label: "Unassigned",
            description: "Jobs without an assigned vendor.",
            filters: [{ type: "assignment", operator: "is_null" }],
            sort: [{ field: "created_at", direction: "desc" }],
            limit: 5,
            priority: "attention",
            display: "list",
        },
    ],
} as const;

async function main() {
    const orgId = process.env.DEV_QUEUE_ORG_ID?.trim() || "";
    if (!orgId) {
        console.error("Set DEV_QUEUE_ORG_ID to the target org UUID.");
        process.exit(1);
    }

    const workUnitId = process.env.DEV_QUEUE_WORK_UNIT_ID?.trim() || "";
    const workUnitKey = process.env.DEV_QUEUE_WORK_UNIT_KEY?.trim() || "";
    if (!workUnitId && !workUnitKey) {
        console.error("Set DEV_QUEUE_WORK_UNIT_ID or DEV_QUEUE_WORK_UNIT_KEY to select a work unit.");
        process.exit(1);
    }

    const validated = validateQueueDefinition(QUEUE_DEFINITION_V1_JOB);

    const supabase = createAdminClient();

    let wu: { id: string; key: string | null } | null = null;
    if (workUnitId) {
        const { data, error } = await supabase
            .from("work_units")
            .select("id, key")
            .eq("id", workUnitId)
            .eq("org_id", orgId)
            .maybeSingle();
        if (error) throw new Error(error.message);
        wu = data ? ({ id: (data as any).id, key: (data as any).key ?? null } as any) : null;
    } else {
        const { data, error } = await supabase
            .from("work_units")
            .select("id, key")
            .eq("org_id", orgId)
            .eq("key", workUnitKey)
            .maybeSingle();
        if (error) throw new Error(error.message);
        wu = data ? ({ id: (data as any).id, key: (data as any).key ?? null } as any) : null;
    }

    if (!wu) {
        console.error("Work unit not found for given org + selector.");
        process.exit(1);
    }

    const { data: updated, error: updateErr } = await supabase
        .from("work_units")
        .update({
            queue_definition: validated,
            updated_at: new Date().toISOString(),
        })
        .eq("id", wu.id)
        .eq("org_id", orgId)
        .select("id, key, queue_definition")
        .single();

    if (updateErr) {
        throw new Error(updateErr.message);
    }

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
    const workUnitIdOut = (updated as any).id as string;
    const workUnitKeyOut = ((updated as any).key as string | null) ?? null;

    console.log("--- QueueDefinition seed applied ---");
    console.log("org_id:      ", orgId);
    console.log("work_unit_id:", workUnitIdOut);
    console.log("work_unit_key:", workUnitKeyOut ?? "—");
    console.log("queue_definition:", JSON.stringify((updated as any).queue_definition, null, 2));
    console.log("\nManual smoke test:");
    console.log(`  ${baseUrl}/api/admin/work-units/${workUnitIdOut}/queues`);
    console.log(`  ${baseUrl}/api/admin/queues/${workUnitIdOut}/all`);
    console.log(`  ${baseUrl}/api/admin/queues/${workUnitIdOut}/unassigned`);
}

main().catch((e) => {
    console.error(String((e as any)?.stack ?? e));
    process.exit(1);
});

