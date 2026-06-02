#!/usr/bin/env npx tsx
/**
 * Print exact JSON body returned by GET /api/admin/lifecycle-catalog (same as buildLifecycleCatalog).
 * Uses service role + departmentScope=all (all catalog rows for org).
 *
 *   npx tsx scripts/printLifecycleCatalogApiResponse.ts
 *   ORG_ID=<uuid> npx tsx scripts/printLifecycleCatalogApiResponse.ts
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { buildLifecycleCatalog } from "@/lib/lifecycle/lifecycleCatalog";
import {
    LIFECYCLE_BUILDER_METADATA_KEY,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { traceRowFromCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogEntrySource";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

const dim: AdminAccessScopeDimensions = {
    departmentScope: "all",
    allowedDepartmentIds: null,
    siteScope: "all",
    allowedSiteLocationIds: null,
};

async function main() {
    const supabase = createAdminClient();
    let orgId = process.env.ORG_ID?.trim() ?? "";

    const { data: enrollmentDepts, error: enrErr } = await supabase
        .from("departments")
        .select("id, org_id, key, name, metadata, updated_at")
        .eq("key", "enrollment")
        .order("updated_at", { ascending: false });

    if (enrErr) {
        console.error(enrErr.message);
        process.exit(1);
    }

    if (!orgId && enrollmentDepts?.length) {
        orgId = enrollmentDepts[0]!.org_id as string;
        console.error(`(Using org_id from newest enrollment department: ${orgId})\n`);
    }

    if (!orgId) {
        const { data: anyDept } = await supabase.from("departments").select("org_id").limit(1);
        orgId = (anyDept?.[0] as { org_id?: string } | undefined)?.org_id ?? "";
    }

    if (!orgId) {
        console.error("No org_id found. Set ORG_ID=...");
        process.exit(1);
    }

    console.log("=== Enrollment department — raw lifecycle_builder_v1 in DB ===");
    const enrollmentRows = (enrollmentDepts ?? []).filter((d) => d.org_id === orgId);
    for (const d of enrollmentRows) {
        const meta =
            d.metadata !== null && typeof d.metadata === "object" && !Array.isArray(d.metadata)
                ? (d.metadata as Record<string, unknown>)
                : {};
        console.log(
            JSON.stringify(
                {
                    department_id: d.id,
                    department_key: d.key,
                    department_name: d.name,
                    metadata_path: `departments.metadata.${LIFECYCLE_BUILDER_METADATA_KEY}`,
                    lifecycle_builder_v1: meta[LIFECYCLE_BUILDER_METADATA_KEY] ?? null,
                    parsed_process_count: lifecycleBuilderFromDepartmentMetadata(meta).processes.length,
                },
                null,
                2
            )
        );
    }
    if (!enrollmentRows.length) {
        console.log(JSON.stringify({ note: "No enrollment department for this org" }, null, 2));
    }

    console.log("\n=== GET /api/admin/lifecycle-catalog — response body ===");
    console.log(`(org_id=${orgId}, departmentScope=all)\n`);

    const items = await buildLifecycleCatalog(supabase, orgId, dim);
    const body = { items };
    console.log(JSON.stringify(body, null, 2));

    if (!items.length) {
        console.log("\n→ items is []. UI must show empty state and no board.");
        return;
    }

    console.log("\n=== Per catalog item ===");
    for (const item of items) {
        const trace = traceRowFromCatalogEntry(item);
        const { data: dept } = await supabase
            .from("departments")
            .select("metadata")
            .eq("id", item.department_id)
            .maybeSingle();
        const meta =
            dept?.metadata !== null && typeof dept?.metadata === "object" && !Array.isArray(dept?.metadata)
                ? (dept.metadata as Record<string, unknown>)
                : {};
        console.log(
            JSON.stringify(
                {
                    display_name: trace.display_name,
                    department_id: trace.department_id,
                    process_id: trace.process_id,
                    source_path: trace.metadata_path,
                    config_source: trace.config_source,
                    lifecycle_builder_v1: meta[LIFECYCLE_BUILDER_METADATA_KEY] ?? null,
                },
                null,
                2
            )
        );
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
