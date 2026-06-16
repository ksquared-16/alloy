/**
 * Opportunity selection for DEMO_CLEANUP_MODE=enrollment_runtime_reset.
 * Selects enrollment/lead queue runtime rows; excludes golden-path seeds.
 */

import type { createAdminClient } from "@/lib/supabaseAdmin";
import {
    ENROLLMENT_LEAD_STATUS_KEYS,
    chunk,
    isGoldenPathProtectedMetadata,
} from "./demoRuntimeCleanupScope";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export type EnrollmentResetOpportunityRow = {
    id: string;
    name: string | null;
    status_key: string | null;
    work_unit_id: string | null;
};

export type EnrollmentResetSelection = {
    opportunityIds: string[];
    selected: EnrollmentResetOpportunityRow[];
    excludedGoldenPath: EnrollmentResetOpportunityRow[];
    enrollmentWorkUnitIds: string[];
};

function displayName(row: {
    name?: string | null;
    title?: string | null;
}): string | null {
    const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : null;
    const title = typeof row.title === "string" && row.title.trim() ? row.title.trim() : null;
    return name ?? title;
}

function toRow(r: Record<string, unknown>): EnrollmentResetOpportunityRow {
    return {
        id: String(r.id),
        name: displayName(r as { name?: string | null; title?: string | null }),
        status_key: typeof r.status_key === "string" ? r.status_key : null,
        work_unit_id: typeof r.work_unit_id === "string" ? r.work_unit_id : null,
    };
}

/** Lead/enrollment work units for org-scoped opportunity assignment matching. */
export async function resolveEnrollmentWorkUnitIds(
    supabase: SupabaseAdmin,
    orgId: string
): Promise<string[]> {
    const { data, error } = await supabase
        .from("work_units")
        .select("id, key")
        .eq("org_id", orgId)
        .eq("is_active", true);
    if (error) throw new Error(`[work_units enrollment scope] ${error.message}`);

    const ids = new Set<string>();
    for (const r of data ?? []) {
        const key = String((r as { key?: string }).key ?? "").trim().toLowerCase();
        if (!key) continue;
        if (
            key === "enrollment_pipeline" ||
            key === "lifecycle_wu_lead" ||
            key.startsWith("lifecycle_wu_")
        ) {
            const id = (r as { id?: string }).id;
            if (id) ids.add(id);
        }
    }
    return [...ids];
}

export async function buildEnrollmentResetSelection(
    supabase: SupabaseAdmin,
    orgId: string
): Promise<EnrollmentResetSelection> {
    const enrollmentWorkUnitIds = await resolveEnrollmentWorkUnitIds(supabase, orgId);
    const withMeta = new Map<string, { row: EnrollmentResetOpportunityRow; metadata: unknown }>();

    const collect = (rows: Array<Record<string, unknown>> | null) => {
        for (const r of rows ?? []) {
            const row = toRow(r);
            withMeta.set(row.id, { row, metadata: (r as { metadata?: unknown }).metadata });
        }
    };

    const { data: byStatus, error: statusErr } = await supabase
        .from("opportunities")
        .select("id, name, title, status_key, work_unit_id, metadata")
        .eq("org_id", orgId)
        .in("status_key", [...ENROLLMENT_LEAD_STATUS_KEYS]);
    if (statusErr) throw new Error(`[opportunities enrollment status scope] ${statusErr.message}`);
    collect((byStatus ?? []) as Array<Record<string, unknown>>);

    for (const part of chunk(enrollmentWorkUnitIds, 200)) {
        const { data, error } = await supabase
            .from("opportunities")
            .select("id, name, title, status_key, work_unit_id, metadata")
            .eq("org_id", orgId)
            .in("work_unit_id", part);
        if (error) throw new Error(`[opportunities enrollment work_unit scope] ${error.message}`);
        collect((data ?? []) as Array<Record<string, unknown>>);
    }

    const selected: EnrollmentResetOpportunityRow[] = [];
    const excludedGoldenPath: EnrollmentResetOpportunityRow[] = [];

    for (const { row, metadata } of withMeta.values()) {
        if (isGoldenPathProtectedMetadata(metadata)) {
            excludedGoldenPath.push(row);
        } else {
            selected.push(row);
        }
    }

    selected.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    excludedGoldenPath.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

    return {
        opportunityIds: selected.map((r) => r.id),
        selected,
        excludedGoldenPath,
        enrollmentWorkUnitIds,
    };
}
