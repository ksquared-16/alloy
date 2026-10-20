/**
 * The closed registry of domain projections a `domain_projection` process's Work Views may name, and
 * THE one cohort reader both Work View counts and Work View rows call.
 *
 * Adding a projection is a reviewed code change here, never configuration: a tenant can only SELECT a
 * key that exists for its process's declared domain. Publication refuses anything else, and the
 * runtime refuses again (explicitly — never with Enrollment records and never as an empty list).
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import type { ProcessProjectionDomain } from "@/lib/lifecycle/processModelV1";
import { domainProjectionRowId } from "@/lib/businessProcesses/projections/domainProjectionIdentity";
import {
    ASSIGNMENT_UPCOMING_CHANGES_PROJECTION,
    ASSIGNMENTS_ENDING_SOON_PROJECTION,
    ASSIGNMENTS_PROPOSED_INCOMPLETE_PROJECTION,
    CURRENT_ASSIGNMENTS_PROJECTION,
    SCHEDULE_GAPS_PROJECTION,
} from "@/lib/businessProcesses/projections/assignmentsProjections";
import { CHARGES_NEEDING_REVIEW_PROJECTION } from "@/lib/businessProcesses/projections/chargesNeedingReviewProjection";
import type {
    DomainProjectionCohort,
    DomainProjectionDefinition,
    DomainProjectionRow,
    DomainProjectionScope,
} from "@/lib/businessProcesses/projections/domainProjectionTypes";

export const DOMAIN_PROJECTIONS: Readonly<Record<ProcessProjectionDomain, readonly DomainProjectionDefinition[]>> = {
    assignments: [
        CURRENT_ASSIGNMENTS_PROJECTION,
        ASSIGNMENTS_ENDING_SOON_PROJECTION,
        ASSIGNMENT_UPCOMING_CHANGES_PROJECTION,
        SCHEDULE_GAPS_PROJECTION,
        ASSIGNMENTS_PROPOSED_INCOMPLETE_PROJECTION,
    ],
    billing: [CHARGES_NEEDING_REVIEW_PROJECTION],
};

export function resolveDomainProjection(
    domain: ProcessProjectionDomain,
    projectionKey: string | null | undefined,
): DomainProjectionDefinition | null {
    const key = (projectionKey ?? "").trim();
    if (!key) return null;
    return DOMAIN_PROJECTIONS[domain]?.find((p) => p.key === key) ?? null;
}


/** Request-time access scope → the projection scope. Server-resolved; never from a client. */
export function domainProjectionScopeFromAccess(
    dim: AdminAccessScopeDimensions,
    /** BP V2 S3 — the `/workspace` site selection; narrows only (see `effectiveProjectionSiteIds`). */
    selectedSiteId?: string | null,
): DomainProjectionScope {
    const selected = selectedSiteId?.trim() || null;
    return dim.siteScope === "restricted"
        ? { siteScope: "restricted", allowedSiteLocationIds: [...(dim.allowedSiteLocationIds ?? [])], selectedSiteId: selected }
        : { siteScope: "all", allowedSiteLocationIds: [], selectedSiteId: selected };
}

/**
 * Canonical order: the projection's own leading key (e.g. end date), then label, grain and id — total and
 * stable, so every page slices the same list.
 */
export function compareDomainProjectionRows(a: DomainProjectionRow, b: DomainProjectionRow): number {
    return (
        (a.sortKey ?? "").localeCompare(b.sortKey ?? "")
        || a.label.localeCompare(b.label, "en", { sensitivity: "base" })
        || a.subject.type.localeCompare(b.subject.type)
        || a.subject.id.localeCompare(b.subject.id)
    );
}

/**
 * THE cohort. Counts and rows both read this, so their membership cannot diverge.
 *
 * Guarantees, checked here rather than trusted from each adapter:
 *  - one row per (grain, subject) — a duplicate is collapsed, never counted twice;
 *  - a row of a grain the projection does not declare is refused (a defect, not data);
 *  - canonical order (`compareDomainProjectionRows`);
 *  - `total === rows.length`, or null when the domain read was bounded.
 */
export async function loadDomainProjectionCohort(
    supabase: SupabaseClient,
    args: {
        domain: ProcessProjectionDomain;
        projectionKey: string | null | undefined;
        orgId: string;
        userId: string | null;
        scope: DomainProjectionScope;
    },
    registry: typeof resolveDomainProjection = resolveDomainProjection,
): Promise<DomainProjectionCohort> {
    const def = registry(args.domain, args.projectionKey);
    if (!def) {
        return {
            status: "refused",
            code: "projection_unsupported",
            message: `This Work View names no supported ${args.domain} projection.`,
        };
    }
    let loaded;
    try {
        loaded = await def.load(supabase, { orgId: args.orgId, userId: args.userId, scope: args.scope });
    } catch (e) {
        return {
            status: "refused",
            code: "projection_unavailable",
            message: e instanceof Error ? e.message : String(e),
        };
    }
    if (!loaded.ok) return { status: "refused", code: loaded.code, message: loaded.message };

    const seen = new Set<string>();
    const rows: DomainProjectionRow[] = [];
    for (const row of loaded.rows) {
        if (!def.subjectTypes.includes(row.subject.type)) {
            return {
                status: "refused",
                code: "projection_unavailable",
                message: `Projection ${def.key} produced a ${row.subject.type} row, which it does not declare.`,
            };
        }
        const id = domainProjectionRowId(row);
        if (seen.has(id)) continue;
        seen.add(id);
        rows.push(row);
    }
    rows.sort(compareDomainProjectionRows);
    return {
        status: "ok",
        domain: def.domain,
        projectionKey: def.key,
        rows,
        total: loaded.truncated ? null : rows.length,
        factTotal: loaded.truncated ? null : rows.reduce((n, r) => n + r.source.count, 0),
        truncated: loaded.truncated,
    };
}
