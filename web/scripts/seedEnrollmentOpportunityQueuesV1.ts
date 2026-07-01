#!/usr/bin/env npx tsx
/**
 * Dev/staging helper: assign Enrollment opportunity QueueDefinitionV1 to an existing work unit.
 *
 * Run from `web/`:
 *   DEV_QUEUE_ORG_ID=... DEV_QUEUE_WORK_UNIT_ID=... npx tsx scripts/seedEnrollmentOpportunityQueuesV1.ts
 * or:
 *   DEV_QUEUE_ORG_ID=... DEV_QUEUE_WORK_UNIT_KEY=... npx tsx scripts/seedEnrollmentOpportunityQueuesV1.ts
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { validateQueueDefinition } from "@/lib/config/queueDefinitionSchema";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const ENROLLMENT_QUEUE_DEFINITION = {
    version: 1,
    entity_type: "opportunity",
    queues: [
        {
            key: "all",
            label: "All inquiries",
            description: "All enrollment opportunities.",
            filters: [],
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: 5,
            priority: "standard",
            display: "list",
        },
        {
            key: "new_contacted",
            label: "New & contacted",
            description: "New inquiries and contacted families.",
            filters: [{ type: "status", operator: "in", values: ["new_inquiry", "contacted"] }],
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: 5,
            priority: "standard",
            display: "list",
        },
        {
            key: "tours_in_progress",
            label: "Tours in progress",
            description: "Tours scheduled or completed.",
            filters: [{ type: "status", operator: "in", values: ["tour_scheduled", "tour_completed"] }],
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: 5,
            priority: "standard",
            display: "list",
        },
        {
            key: "ready_waitlist",
            label: "Ready / waitlist",
            description: "Families ready to enroll or waitlisted.",
            filters: [{ type: "status", operator: "in", values: ["ready_to_enroll", "waitlisted"] }],
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: 5,
            priority: "attention",
            display: "list",
        },
        {
            key: "needs_attention",
            label: "Needs attention",
            description: "Enrollment records that need review.",
            filters: [{ type: "exception", operator: "exists" }],
            sort: [{ field: "updated_at", direction: "asc" }],
            limit: 5,
            priority: "critical",
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

    const validated = validateQueueDefinition(ENROLLMENT_QUEUE_DEFINITION);
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
        const { data: examples } = await supabase
            .from("work_units")
            .select("id, key, name")
            .eq("org_id", orgId)
            .order("created_at", { ascending: false })
            .limit(20);
        const rows = (examples ?? []) as Array<{ id: string; key?: string | null; name?: string | null }>;
        if (rows.length) {
            console.error("Available work units (most recent 20):");
            for (const r of rows) {
                console.error(`- ${r.key ?? "—"} (${r.id})${r.name ? ` — ${r.name}` : ""}`);
            }
        }
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

    if (updateErr) throw new Error(updateErr.message);

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
    const workUnitIdOut = (updated as any).id as string;
    const workUnitKeyOut = ((updated as any).key as string | null) ?? null;

    console.log("--- Enrollment opportunity queues applied ---");
    console.log("org_id:       ", orgId);
    console.log("work_unit_id: ", workUnitIdOut);
    console.log("work_unit_key:", workUnitKeyOut ?? "—");
    console.log("\nManual smoke test:");
    console.log(`  ${baseUrl}/api/admin/work-units/${workUnitIdOut}/queues`);
    console.log(`  ${baseUrl}/api/admin/queues/${workUnitIdOut}/all`);
    console.log(`  ${baseUrl}/api/admin/queues/${workUnitIdOut}/new_contacted`);
    console.log(`  ${baseUrl}/api/admin/queues/${workUnitIdOut}/tours_in_progress`);
    console.log(`  ${baseUrl}/api/admin/queues/${workUnitIdOut}/ready_waitlist`);
    console.log(`  ${baseUrl}/api/admin/queues/${workUnitIdOut}/needs_attention`);
}

main().catch((e) => {
    console.error(String((e as any)?.stack ?? e));
    process.exit(1);
});

