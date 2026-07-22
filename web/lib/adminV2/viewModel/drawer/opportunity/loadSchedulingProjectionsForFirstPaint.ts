/**
 * First-paint composition of the per-child Scheduling projection — so the Scheduling
 * Focus Panel card reveals WITH the panel (like Household) instead of fetching its own
 * data on mount. Mirrors the `_inquiry_children` / operational-facts overlay pattern:
 * async DB reads happen once here, server-side, and are attached to `record` under
 * `_scheduling_projection`; the card reads it synchronously from `context.truth`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { loadSchedulingProjectionForChild } from "@/lib/scheduling/projection/buildSchedulingProjection";
import type { ChildScheduling } from "@/lib/scheduling/projection/schedulingProjectionTypes";

export type SchedulingProjectionFirstPaint = {
    byMemberId: Record<string, ChildScheduling>;
    asOf: string;
};

/** Resolve the opportunity site's display label once (shared across all children). */
async function resolveSiteLabel(supabase: SupabaseClient, orgId: string, siteLocationId: string): Promise<string | null> {
    const { data } = await supabase
        .from("locations")
        .select("label")
        .eq("org_id", orgId)
        .eq("id", siteLocationId)
        .maybeSingle();
    const label = (data as { label?: string | null } | null)?.label;
    return label != null ? String(label).trim() || null : null;
}

function childIdentity(row: Record<string, unknown>): { id: string; name: string } | null {
    const id =
        (typeof row.customer_member_id === "string" && row.customer_member_id.trim()) ||
        (typeof row.id === "string" && row.id.trim()) ||
        "";
    if (!id) return null;
    const display = typeof row.display_name === "string" ? row.display_name.trim() : "";
    const first = typeof row.first_name === "string" ? row.first_name.trim() : "";
    const last = typeof row.last_name === "string" ? row.last_name.trim() : "";
    const name = display || [first, last].filter(Boolean).join(" ").trim() || "Child";
    return { id, name };
}

/**
 * Build the scheduling projection for every inquiry child on the opportunity, from
 * `record._inquiry_children` + the opportunity site (`record.location_id`). Never throws
 * — a child that fails to resolve is simply omitted (the card still reveals).
 */
export async function loadSchedulingProjectionsForFirstPaint(
    supabase: SupabaseClient,
    orgId: string,
    record: Record<string, unknown>
): Promise<SchedulingProjectionFirstPaint> {
    const children = Array.isArray(record._inquiry_children) ? (record._inquiry_children as Record<string, unknown>[]) : [];
    const siteLocationId = typeof record.location_id === "string" ? record.location_id.trim() : "";
    const byMemberId: Record<string, ChildScheduling> = {};
    if (children.length === 0 || !siteLocationId) {
        const asOf = await resolveOperationalEnrollmentTodayYmd(supabase, orgId).catch(() => "");
        return { byMemberId, asOf };
    }
    const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, orgId);
    const computedAt = `${todayYmd}T00:00:00.000Z`;
    const identities = children.map(childIdentity).filter((x): x is { id: string; name: string } => x != null);
    // The site is opportunity-level — resolve its label ONCE and pass it to every
    // child projection, rather than each re-querying `locations` for the same id.
    const siteName = await resolveSiteLabel(supabase, orgId, siteLocationId);
    const results = await Promise.all(
        identities.map((c) =>
            loadSchedulingProjectionForChild(supabase, orgId, {
                customerMemberId: c.id,
                siteLocationId,
                todayYmd,
                computedAt,
                subjectName: c.name,
                siteName,
            })
                .then((p) => p.children[0] ?? null)
                .catch(() => null)
        )
    );
    results.forEach((child, i) => {
        if (child) byMemberId[identities[i].id] = child;
    });
    return { byMemberId, asOf: todayYmd };
}
