#!/usr/bin/env npx tsx
/**
 * Trace one lifecycle waitlist row through QueueService enrichment.
 * Run from web/: npx tsx --tsconfig tsconfig.json scripts/traceLifecycleWaitlistRowFields.ts
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getWorkUnitQueueItems } from "@/lib/queues/QueueService";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

const ORG = process.env.ORG_ID?.trim() || "93667019-bd28-49b5-a688-acc9bb1e0a19";

async function main() {
    const supabase = createAdminClient();
    const { data: wu, error } = await supabase
        .from("work_units")
        .select("id, key, department_id, metadata, queue_definition")
        .eq("org_id", ORG)
        .eq("key", "lifecycle_wu_waitlist")
        .maybeSingle();
    if (error || !wu) throw new Error(error?.message ?? "lifecycle_wu_waitlist not found");

    const result = await getWorkUnitQueueItems({
        orgId: ORG,
        workUnitId: wu.id,
        queueKey: "lifecycle_waitlist",
        limit: 3,
        offset: 0,
        includePreviews: true,
    });

    const items = result.items ?? [];
    console.log("\n=== lifecycle waitlist row trace ===\n");
    console.log("work_unit_id:", wu.id);
    console.log("rows_returned:", items.length);
    for (const item of items.slice(0, 2)) {
        const row = item as Record<string, unknown>;
        console.log("\n--- row ---");
        console.log({
            id: row.id,
            _primary_phone: row._primary_phone ?? null,
            _primary_email: row._primary_email ?? null,
            _primary_contact_line: row._primary_contact_line ?? null,
            _child_desired_start_summary: row._child_desired_start_summary ?? null,
            _tour_queue_display: row._tour_queue_display ?? null,
        });
    }
}

void main();
