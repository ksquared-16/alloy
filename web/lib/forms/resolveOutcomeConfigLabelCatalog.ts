import type { SupabaseClient } from "@supabase/supabase-js";
import { LOCATION_DISPLAY_LABEL_SELECT } from "@/lib/admin/locationDisplayLabel";
import {
    collectOutcomeRoutingUuidSets,
    emptyOutcomeRoutingLabelCatalog,
    locationLabelsFromRows,
    type OutcomeRoutingLabelCatalog,
    workUnitLabelsFromRows,
} from "@/lib/forms/outcomeConfigLabelCatalog";
import type { DistributionLinkRow } from "@/lib/forms/distributionPresentation";
import { displayLabelsFromDefinitions, fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";

/**
 * Batch-resolve routing UUIDs for outcome panel display (IC-1b).
 * Server-only — org-scoped reads; no runtime side effects.
 */
export async function resolveOutcomeConfigLabelCatalog(
    supabase: SupabaseClient,
    orgId: string,
    params: {
        formMetadata: Record<string, unknown> | null | undefined;
        links: DistributionLinkRow[];
    }
): Promise<OutcomeRoutingLabelCatalog> {
    const sets = collectOutcomeRoutingUuidSets(params);
    const hasAny =
        sets.locationIds.length > 0 ||
        sets.workUnitIds.length > 0 ||
        sets.departmentIds.length > 0 ||
        sets.verticalIds.length > 0 ||
        sets.statusKeys.length > 0;

    if (!hasAny) return emptyOutcomeRoutingLabelCatalog();

    const deptIdsFromWorkUnits = new Set<string>(sets.departmentIds);

    const [locRes, wuRes, deptRes, vertRes, statusDefs] = await Promise.all([
        sets.locationIds.length > 0 ?
            supabase
                .from("locations")
                .select(LOCATION_DISPLAY_LABEL_SELECT)
                .eq("org_id", orgId)
                .in("id", sets.locationIds)
        :   Promise.resolve({ data: [], error: null }),
        sets.workUnitIds.length > 0 ?
            supabase.from("work_units").select("id, name, department_id").eq("org_id", orgId).in("id", sets.workUnitIds)
        :   Promise.resolve({ data: [], error: null }),
        sets.departmentIds.length > 0 ?
            supabase.from("departments").select("id, name").eq("org_id", orgId).in("id", sets.departmentIds)
        :   Promise.resolve({ data: [], error: null }),
        sets.verticalIds.length > 0 ?
            supabase.from("verticals").select("id, name, slug").in("id", sets.verticalIds)
        :   Promise.resolve({ data: [], error: null }),
        sets.statusKeys.length > 0 ?
            fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", { activeOnly: true })
        :   Promise.resolve([]),
    ]);

    for (const wu of (wuRes.data ?? []) as { department_id?: string | null }[]) {
        if (typeof wu.department_id === "string" && wu.department_id.trim()) {
            deptIdsFromWorkUnits.add(wu.department_id.trim());
        }
    }

    let extraDeptRows: { id: string; name?: string | null }[] = [];
    const missingDeptIds = [...deptIdsFromWorkUnits].filter(
        (id) => !(deptRes.data ?? []).some((d: { id: string }) => d.id === id)
    );
    if (missingDeptIds.length > 0) {
        const { data } = await supabase
            .from("departments")
            .select("id, name")
            .eq("org_id", orgId)
            .in("id", missingDeptIds);
        extraDeptRows = (data ?? []) as { id: string; name?: string | null }[];
    }

    const departmentNames: Record<string, string> = {};
    for (const row of [...((deptRes.data ?? []) as { id: string; name?: string | null }[]), ...extraDeptRows]) {
        const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : null;
        if (name) departmentNames[row.id] = name;
    }

    const verticals: Record<string, string> = {};
    for (const row of (vertRes.data ?? []) as { id: string; name?: string | null; slug?: string | null }[]) {
        const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : null;
        const slug = typeof row.slug === "string" && row.slug.trim() ? row.slug.trim() : null;
        if (name) verticals[row.id] = name;
        else if (slug) verticals[row.id] = slug;
    }

    const statusLabelMap = displayLabelsFromDefinitions(statusDefs);

    return {
        locations: locationLabelsFromRows(
            (locRes.data ?? []) as {
                id: string;
                label?: string | null;
                address1?: string | null;
                city?: string | null;
                postal_code?: string | null;
            }[]
        ),
        workUnits: workUnitLabelsFromRows(
            (wuRes.data ?? []) as { id: string; name?: string | null; department_id?: string | null }[],
            departmentNames
        ),
        departments: departmentNames,
        verticals,
        opportunityStatusKeys: Object.fromEntries(statusLabelMap.entries()),
    };
}
