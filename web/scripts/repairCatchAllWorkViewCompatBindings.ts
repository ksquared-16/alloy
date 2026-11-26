#!/usr/bin/env npx tsx
/**
 * Persist repair: strip erroneous `compat_queue_key` from include-all Work Views.
 *
 * Predicate-only catch-all views (empty `filters_v1`) must resolve on the department
 * aggregate host + all-records lane. A stage binding (e.g. waitlist) makes badge counts
 * and selected queues disagree.
 *
 * Run from `web/`:
 *   npx tsx --tsconfig tsconfig.json scripts/repairCatchAllWorkViewCompatBindings.ts
 *
 * Dry run (default): prints planned updates only.
 *   DRY_RUN=0 npx tsx ...  — writes to departments.metadata
 *
 * Optional scope:
 *   ORG_ID=<uuid>           — limit to one org
 *   DEPARTMENT_ID=<uuid>    — limit to one department
 *   PROCESS_ID=<uuid>       — limit to one lifecycle process
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    LIFECYCLE_BUILDER_METADATA_KEY,
    lifecycleBuilderFromDepartmentMetadata,
    mergeLifecycleBuilderIntoMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    parseWorkViewsV1,
} from "@/lib/lifecycle/workViewsConfigV1";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

const DRY_RUN = process.env.DRY_RUN !== "0";
const ORG_ID = (process.env.ORG_ID ?? "").trim() || null;
const DEPARTMENT_ID = (process.env.DEPARTMENT_ID ?? "").trim() || null;
const PROCESS_ID = (process.env.PROCESS_ID ?? "").trim() || null;


function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function rawWorkViewNeedsCatchAllCompatRepair(raw: unknown): boolean {
    if (!isRecord(raw)) return false;
    const filters = raw.filters_v1;
    const hasFilters = Array.isArray(filters) && filters.length > 0;
    const compat = typeof raw.compat_queue_key === "string" ? raw.compat_queue_key.trim() : "";
    return !hasFilters && Boolean(compat);
}

function rawWorkViewsNeedCatchAllCompatRepair(rawViews: unknown): boolean {
    if (!Array.isArray(rawViews)) return false;
    return rawViews.some(rawWorkViewNeedsCatchAllCompatRepair);
}

async function main() {
    const supabase = createAdminClient();
    let query = supabase.from("departments").select("id, org_id, name, metadata");
    if (ORG_ID) query = query.eq("org_id", ORG_ID);
    if (DEPARTMENT_ID) query = query.eq("id", DEPARTMENT_ID);
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    console.log(DRY_RUN ? "\n[DRY RUN] Planned catch-all compat repairs:\n" : "\nApplying catch-all compat repairs:\n");

    let repairedDepartments = 0;
    for (const row of data ?? []) {
        const deptId = String(row.id);
        const orgId = String(row.org_id);
        const metadata = isRecord(row.metadata) ? { ...row.metadata } : null;
        if (!metadata || !isRecord(metadata[LIFECYCLE_BUILDER_METADATA_KEY])) continue;

        const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
        const builderRaw = metadata[LIFECYCLE_BUILDER_METADATA_KEY];
        const processesRaw = isRecord(builderRaw) && Array.isArray(builderRaw.processes) ? builderRaw.processes : [];
        let deptChanged = false;
        const nextProcesses = builder.processes.map((process) => {
            if (PROCESS_ID && process.id !== PROCESS_ID) return process;
            const processRaw = processesRaw.find(
                (row) => isRecord(row) && String(row.id ?? "").trim() === process.id,
            );
            const rawViews = isRecord(processRaw) ? processRaw.work_views_v1 : null;
            if (!rawWorkViewsNeedCatchAllCompatRepair(rawViews)) return process;

            const saved = parseWorkViewsV1(rawViews);
            if (!saved?.length) return process;

            deptChanged = true;
            const stripped = (Array.isArray(rawViews) ? rawViews : [])
                .filter(rawWorkViewNeedsCatchAllCompatRepair)
                .map((raw) => (isRecord(raw) ? String(raw.id ?? "").trim() : ""))
                .filter(Boolean);
            const workViews = saved;
            console.log(
                `  dept=${deptId} org=${orgId} process=${process.id} (${process.name}) → strip compat from: ${stripped.join(", ")}`,
            );
            return { ...process, work_views_v1: workViews };
        });

        if (!deptChanged) continue;
        repairedDepartments += 1;
        const nextMetadata = mergeLifecycleBuilderIntoMetadata(metadata, {
            ...builder,
            processes: nextProcesses,
        }) as Record<string, unknown>;

        if (!DRY_RUN) {
            const { error: upErr } = await supabase
                .from("departments")
                .update({ metadata: nextMetadata, updated_at: new Date().toISOString() })
                .eq("id", deptId)
                .eq("org_id", orgId);
            if (upErr) throw new Error(upErr.message);
        }
    }

    console.log(
        DRY_RUN
            ? `\n${repairedDepartments} department(s) would be updated. Set DRY_RUN=0 to persist.\n`
            : `\nDone — ${repairedDepartments} department(s) updated.\n`,
    );
}

void main();
