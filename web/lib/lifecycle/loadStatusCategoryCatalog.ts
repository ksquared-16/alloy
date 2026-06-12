import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { buildStatusCategoryCatalog } from "@/lib/lifecycle/statusCategoryCatalog";
import type { StatusCategoryGroup } from "@/lib/lifecycle/statusRollupV1";

/** Load org-wide status category catalog for Business Process stage rollup picker. */
export async function loadStatusCategoryCatalog(
    supabase: SupabaseClient,
    orgId: string
): Promise<StatusCategoryGroup[]> {
    const [opportunities, ocm, persons] = await Promise.all([
        fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", { activeOnly: true }),
        fetchEffectiveStatusDefinitions(supabase, orgId, "opportunity_customer_members", {
            activeOnly: true,
        }),
        fetchEffectiveStatusDefinitions(supabase, orgId, "persons", { activeOnly: true }),
    ]);
    return buildStatusCategoryCatalog([...opportunities, ...ocm, ...persons]);
}
