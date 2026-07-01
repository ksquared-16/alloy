import type { SupabaseClient } from "@supabase/supabase-js";
import { LOCATION_DISPLAY_LABEL_SELECT } from "@/lib/admin/locationDisplayLabel";
import { locationLabelsFromRows, workUnitLabelsFromRows } from "@/lib/forms/outcomeConfigLabelCatalog";
import { displayLabelsFromDefinitions, fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";

export type OutcomeConfigPickerOption = { id: string; label: string };

export type OutcomeConfigPickerOptions = {
    locations: OutcomeConfigPickerOption[];
    workUnits: OutcomeConfigPickerOption[];
    departments: OutcomeConfigPickerOption[];
    verticals: OutcomeConfigPickerOption[];
    opportunityStatusKeys: OutcomeConfigPickerOption[];
};

/** Org-scoped routing pickers for outcome config editor (IC-1c). */
export async function resolveOutcomeConfigPickerOptions(
    supabase: SupabaseClient,
    orgId: string
): Promise<OutcomeConfigPickerOptions> {
    const [locRes, wuRes, deptRes, vertRes, statusDefs] = await Promise.all([
        supabase
            .from("locations")
            .select(LOCATION_DISPLAY_LABEL_SELECT)
            .eq("org_id", orgId)
            .eq("is_active", true)
            .order("label")
            .limit(200),
        supabase
            .from("work_units")
            .select("id, name, department_id")
            .eq("org_id", orgId)
            .eq("is_active", true)
            .order("name")
            .limit(200),
        supabase.from("departments").select("id, name").eq("org_id", orgId).eq("is_active", true).order("name").limit(100),
        supabase.from("verticals").select("id, name, slug").eq("is_active", true).order("name").limit(50),
        fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", { activeOnly: true }),
    ]);

    const departmentNames: Record<string, string> = {};
    for (const row of (deptRes.data ?? []) as { id: string; name?: string | null }[]) {
        const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : null;
        if (name) departmentNames[row.id] = name;
    }

    const locationMap = locationLabelsFromRows(
        (locRes.data ?? []) as {
            id: string;
            label?: string | null;
            address1?: string | null;
            city?: string | null;
            postal_code?: string | null;
        }[]
    );
    const workUnitMap = workUnitLabelsFromRows(
        (wuRes.data ?? []) as { id: string; name?: string | null; department_id?: string | null }[],
        departmentNames
    );

    const verticalMap: Record<string, string> = {};
    for (const row of (vertRes.data ?? []) as { id: string; name?: string | null; slug?: string | null }[]) {
        const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : null;
        const slug = typeof row.slug === "string" && row.slug.trim() ? row.slug.trim() : null;
        if (name) verticalMap[row.id] = name;
        else if (slug) verticalMap[row.id] = slug;
    }

    const statusLabelMap = displayLabelsFromDefinitions(statusDefs);

    const toOptions = (record: Record<string, string>): OutcomeConfigPickerOption[] =>
        Object.entries(record)
            .map(([id, label]) => ({ id, label }))
            .sort((a, b) => a.label.localeCompare(b.label));

    return {
        locations: toOptions(locationMap),
        workUnits: toOptions(workUnitMap),
        departments: toOptions(departmentNames),
        verticals: toOptions(verticalMap),
        opportunityStatusKeys: [...statusLabelMap.entries()]
            .map(([id, label]) => ({ id, label }))
            .sort((a, b) => a.label.localeCompare(b.label)),
    };
}
