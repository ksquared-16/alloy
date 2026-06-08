import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPlatformActionDefinitionForOrg } from "@/lib/lifecycle/loadPlatformActionDefinitionForOrg";
import type { LifecycleBaseActionDefinition } from "@/lib/lifecycle/lifecycleStageBaseActions";

/** Only base actions whose platform definition exists for this org (dropdown-safe). */
export async function filterSaveableLifecycleBaseActions(
    supabase: SupabaseClient,
    orgId: string,
    actions: readonly LifecycleBaseActionDefinition[]
): Promise<LifecycleBaseActionDefinition[]> {
    const out: LifecycleBaseActionDefinition[] = [];
    for (const action of actions) {
        const row = await loadPlatformActionDefinitionForOrg(supabase, orgId, action.definition_key);
        if (row) out.push(action);
    }
    return out;
}
