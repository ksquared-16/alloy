/**
 * First-paint composition of the per-child Scheduling projection — so the Scheduling
 * Focus Panel card reveals WITH the panel (like Household) instead of fetching its own
 * data on mount. Mirrors the `_inquiry_children` / operational-facts overlay pattern:
 * async DB reads happen once here, server-side, and are attached to `record` under
 * `_scheduling_projection`; the card reads it synchronously from `context.truth`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { loadSchedulingProjectionsForChildren } from "@/lib/scheduling/projection/buildSchedulingProjection";
import type { ChildScheduling } from "@/lib/scheduling/projection/schedulingProjectionTypes";
import { readLocationSchedulingConfig } from "@/lib/locations/locationSchedulingConfig";
import { loadEditorPatternsForSite, type EditorPattern } from "@/lib/scheduling/editorPatterns";
import {
    loadOrgAssignmentTypes,
    type OrgAssignmentTypeOption,
} from "@/lib/operationalAssignments/loadOrgAssignmentTypes";
import {
    loadSiteOperationalRooms,
    type SiteOperationalRoom,
} from "@/lib/operationalAssignments/loadSiteOperationalRooms";

/** Slim schedule-type option (recurrence behaviour) surfaced to the editor. */
export type SchedulingConfigScheduleType = { key: string; label: string; behavior: "continuous" | "rotating" };

export type SchedulingProjectionFirstPaint = {
    byMemberId: Record<string, ChildScheduling>;
    asOf: string;
    /**
     * The opportunity site's configured scheduling constraints (from
     * `locations.metadata.location_scheduling_v1`), resolved ONCE per opportunity so
     * the editor can limit day pills to operating days and offer schedule types with
     * no per-open fetch. `operatingDays` empty ⇒ all seven weekdays allowed.
     */
    operatingDays: number[];
    scheduleTypes: SchedulingConfigScheduleType[];
    /** The site's schedule patterns, PRELOADED so the pattern shortcut opens instantly. */
    patterns: EditorPattern[];
    /** Org Assignment Types for create / duplicate pickers. */
    assignmentTypes: OrgAssignmentTypeOption[];
    /**
     * Site operational rooms PRELOADED so Create/Edit room pickers paint instantly;
     * Purpose/Program filtering is synchronous client-side. Placement scoring may
     * revalidate in the background without blanking the list.
     */
    operationalRooms: SiteOperationalRoom[];
};

/**
 * Resolve a site's label + scheduling config ONCE (shared across all children on the
 * opportunity). The scheduling config (operating days, schedule types) lives on
 * `locations.metadata.location_scheduling_v1` and has no runtime API, so we read it
 * here and hand it to the editor via first-paint.
 *
 * EXPORTED because the durable child host composes the same bag for one child with no
 * opportunity in sight (`composeDurableChildScheduling`). The site is a site either way, and two
 * readers of `location_scheduling_v1` would be two answers to "what days does this site operate" —
 * which is exactly the kind of duplication the convergence audit forbids.
 */
export async function resolveSiteConfig(
    supabase: SupabaseClient,
    orgId: string,
    siteLocationId: string,
): Promise<{ siteName: string | null; operatingDays: number[]; scheduleTypes: SchedulingConfigScheduleType[] }> {
    const { data } = await supabase
        .from("locations")
        .select("label, metadata")
        .eq("org_id", orgId)
        .eq("id", siteLocationId)
        .maybeSingle();
    const row = data as { label?: string | null; metadata?: Record<string, unknown> | null } | null;
    const siteName = row?.label != null ? String(row.label).trim() || null : null;
    const cfg = readLocationSchedulingConfig(row?.metadata ?? null);
    const scheduleTypes = cfg.scheduleTypes
        .filter((t) => t.isActive)
        .map((t) => ({ key: t.key, label: t.label, behavior: t.behavior }));
    return { siteName, operatingDays: cfg.operatingDays, scheduleTypes };
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
        const assignmentTypes = await loadOrgAssignmentTypes(supabase, orgId, { subjectType: "child" }).catch(
            () => []
        );
        return {
            byMemberId,
            asOf,
            operatingDays: [],
            scheduleTypes: [],
            patterns: [],
            assignmentTypes,
            operationalRooms: [],
        };
    }
    const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, orgId);
    const computedAt = `${todayYmd}T00:00:00.000Z`;
    const identities = children.map(childIdentity).filter((x): x is { id: string; name: string } => x != null);
    // The site is opportunity-level — resolve its label + scheduling config + patterns
    // ONCE and reuse across children, rather than each re-querying for the same id.
    const [{ siteName, operatingDays, scheduleTypes }, patterns, assignmentTypes, operationalRooms] =
        await Promise.all([
            resolveSiteConfig(supabase, orgId, siteLocationId),
            loadEditorPatternsForSite(supabase, orgId, siteLocationId),
            loadOrgAssignmentTypes(supabase, orgId, { subjectType: "child" }).catch(() => []),
            loadSiteOperationalRooms(supabase, orgId, siteLocationId).catch(() => []),
        ]);
    // ONE canonical read of the whole child set. This used to be one loader invocation per child —
    // seventeen three-hop chains for one card, 3,116-3,903 ms of cumulative database work hidden
    // behind a 239-316 ms leg, because concurrency compresses a fan-out without paying for it.
    const projections = await loadSchedulingProjectionsForChildren(supabase, orgId, {
        children: identities.map((c) => ({ customerMemberId: c.id, subjectName: c.name })),
        siteLocationId,
        todayYmd,
        computedAt,
        siteName,
    }).catch(() => null);
    const results = identities.map((c) => projections?.get(c.id)?.children[0] ?? null);
    results.forEach((child, i) => {
        if (child) byMemberId[identities[i].id] = child;
    });
    return {
        byMemberId,
        asOf: todayYmd,
        operatingDays,
        scheduleTypes,
        patterns,
        assignmentTypes,
        operationalRooms,
    };
}
