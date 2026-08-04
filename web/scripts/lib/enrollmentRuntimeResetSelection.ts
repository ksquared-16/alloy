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
    /** True when selection was widened to every opportunity in the org, open AND closed. */
    includeClosedOpportunities: boolean;
};

export type EnrollmentResetSelectionOptions = {
    /**
     * Widen candidate selection to every operational opportunity in THIS org, open and closed.
     *
     * Scope is still exactly one organization: the widened query keeps the same `org_id` equality
     * filter as the narrow one, and every row is re-checked against `orgId` after it comes back.
     * Golden-path exclusion, the shared-reference guard, and configuration preservation are
     * untouched — they simply run over a larger candidate set.
     */
    includeClosedOpportunities?: boolean;
};

/** PostgREST caps a single response; page explicitly so a wide selection can never truncate. */
const OPPORTUNITY_PAGE_SIZE = 1000;

const OPPORTUNITY_COLUMNS = "id, name, title, status_key, work_unit_id, org_id, metadata";

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
    orgId: string,
    options: EnrollmentResetSelectionOptions = {}
): Promise<EnrollmentResetSelection> {
    const includeClosedOpportunities = options.includeClosedOpportunities === true;
    const enrollmentWorkUnitIds = await resolveEnrollmentWorkUnitIds(supabase, orgId);
    const withMeta = new Map<string, { row: EnrollmentResetOpportunityRow; metadata: unknown }>();

    const collect = (rows: Array<Record<string, unknown>> | null, source: string) => {
        for (const r of rows ?? []) {
            // Defence in depth: the query is org-scoped, but a candidate that is not this org's
            // must never reach the delete planner. Widening status must never widen tenancy.
            const rowOrgId = r.org_id;
            if (rowOrgId != null && rowOrgId !== orgId) {
                throw new Error(
                    `[${source}] refusing out-of-org opportunity ${String(r.id)} (org_id=${String(rowOrgId)}, expected ${orgId})`
                );
            }
            const row = toRow(r);
            withMeta.set(row.id, { row, metadata: (r as { metadata?: unknown }).metadata });
        }
    };

    if (includeClosedOpportunities) {
        // WIDENED SELECTION — every operational opportunity in this org, open and closed.
        //
        // Paged rather than issued as one request: the narrow selection returns a few hundred rows
        // and fits comfortably, but the whole-org set does not. A silently truncated page here
        // would under-report the dry run, which is the number a destructive decision gets made
        // from — so it is read to exhaustion, in a stable order, or not at all.
        for (let offset = 0; ; offset += OPPORTUNITY_PAGE_SIZE) {
            const { data, error } = await supabase
                .from("opportunities")
                .select(OPPORTUNITY_COLUMNS)
                .eq("org_id", orgId)
                .order("id", { ascending: true })
                .range(offset, offset + OPPORTUNITY_PAGE_SIZE - 1);
            if (error) throw new Error(`[opportunities org-wide scope] ${error.message}`);
            const page = (data ?? []) as Array<Record<string, unknown>>;
            collect(page, "opportunities org-wide scope");
            if (page.length < OPPORTUNITY_PAGE_SIZE) break;
        }
    } else {
        const { data: byStatus, error: statusErr } = await supabase
            .from("opportunities")
            .select(OPPORTUNITY_COLUMNS)
            .eq("org_id", orgId)
            .in("status_key", [...ENROLLMENT_LEAD_STATUS_KEYS]);
        if (statusErr) throw new Error(`[opportunities enrollment status scope] ${statusErr.message}`);
        collect((byStatus ?? []) as Array<Record<string, unknown>>, "opportunities enrollment status scope");

        for (const part of chunk(enrollmentWorkUnitIds, 200)) {
            const { data, error } = await supabase
                .from("opportunities")
                .select(OPPORTUNITY_COLUMNS)
                .eq("org_id", orgId)
                .in("work_unit_id", part);
            if (error) throw new Error(`[opportunities enrollment work_unit scope] ${error.message}`);
            collect((data ?? []) as Array<Record<string, unknown>>, "opportunities enrollment work_unit scope");
        }
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
        includeClosedOpportunities,
    };
}
