import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import {
    buildBusinessProcessStatusCategoryCatalog,
    buildStatusCategoryCatalog,
} from "@/lib/lifecycle/statusCategoryCatalog";
import type { StatusCategoryGroup } from "@/lib/lifecycle/statusRollupV1";

async function loadStatusDefinitionRows(supabase: SupabaseClient, orgId: string) {
    const [opportunities, ocm, persons] = await Promise.all([
        fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", { activeOnly: true }),
        fetchEffectiveStatusDefinitions(supabase, orgId, "opportunity_customer_members", {
            activeOnly: true,
        }),
        fetchEffectiveStatusDefinitions(supabase, orgId, "persons", { activeOnly: true }),
    ]);
    return [...opportunities, ...ocm, ...persons];
}

/** Load full settings inventory (includes system category when present). */
export async function loadStatusCategoryCatalog(
    supabase: SupabaseClient,
    orgId: string
): Promise<StatusCategoryGroup[]> {
    return buildStatusCategoryCatalog(await loadStatusDefinitionRows(supabase, orgId));
}

/** Load BP picker catalog — same rows as Settings, minus Advanced/system. */
export async function loadBusinessProcessStatusCategoryCatalog(
    supabase: SupabaseClient,
    orgId: string
): Promise<StatusCategoryGroup[]> {
    return buildBusinessProcessStatusCategoryCatalog(await loadStatusDefinitionRows(supabase, orgId));
}
