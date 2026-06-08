import type { SupabaseClient } from "@supabase/supabase-js";
import type { VerticalBootstrapPreviewResult } from "@/lib/admin/verticalBootstrap/types";
import { previewVerticalBootstrap } from "@/lib/admin/verticalBootstrap/previewVerticalBootstrap";
import { parseTenantBootstrapPayload } from "@/lib/admin/tenantBootstrap/parseTenantBootstrapPayload";
import type { TenantBootstrapPreviewResult } from "@/lib/admin/tenantBootstrap/types";

function sliceForDepartment(departmentKey: string, growthKeys: Set<string>): "growth" | "scaffold" {
    return growthKeys.has(departmentKey) ? "growth" : "scaffold";
}

const EMPTY_STRUCTURAL: VerticalBootstrapPreviewResult = {
    ok: false,
    errors: [],
    warnings: [],
    onboarding_context: undefined,
    departments: [],
    status_definitions: [],
    work_units: [],
};

export async function previewTenantBootstrap(
    supabase: SupabaseClient,
    orgId: string,
    rawPayload: unknown
): Promise<TenantBootstrapPreviewResult> {
    const parsed = parseTenantBootstrapPayload(rawPayload);
    if (!parsed.ok) {
        return {
            ok: false,
            errors: parsed.errors,
            tenant: {
                org_profile: { industry_key: "", industry_label: "" },
                growth_department_keys: [],
                department_slices: [],
            },
            structural: EMPTY_STRUCTURAL,
        };
    }

    const p = parsed.payload;
    const growthSet = new Set(p.growth_department_keys);
    const department_slices = p.structural_config.departments.map((d) => ({
        department_key: d.key,
        slice: sliceForDepartment(d.key, growthSet),
    }));

    const structural = await previewVerticalBootstrap(supabase, orgId, p.structural_config);

    return {
        ok: structural.ok,
        errors: structural.errors,
        tenant: {
            org_profile: p.org_profile,
            growth_department_keys: p.growth_department_keys,
            terminology: p.terminology,
            starter_seed: p.starter_seed,
            department_slices,
        },
        structural,
    };
}
