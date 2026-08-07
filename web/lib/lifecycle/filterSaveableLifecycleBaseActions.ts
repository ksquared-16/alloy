import type { SupabaseClient } from "@supabase/supabase-js";
import type { LifecycleBaseActionDefinition } from "@/lib/lifecycle/lifecycleStageBaseActions";

type DefRow = {
    id: string;
    key: string;
    label: string;
    org_id: string | null;
};

/** Only base actions whose platform definition exists for this org (dropdown-safe). */
export async function filterSaveableLifecycleBaseActions(
    supabase: SupabaseClient,
    orgId: string,
    actions: readonly LifecycleBaseActionDefinition[]
): Promise<LifecycleBaseActionDefinition[]> {
    if (!actions.length) return [];

    const keys = [...new Set(actions.map((a) => a.definition_key.trim()).filter(Boolean))];
    if (!keys.length) return [];

    // One round-trip for the whole matrix — per-key loads made Process Actions saves hang.
    const { data, error } = await supabase
        .from("action_definitions")
        .select("id, key, label, org_id")
        .in("key", keys)
        .eq("is_active", true)
        .or(`org_id.is.null,org_id.eq.${orgId}`);

    if (error) throw new Error(error.message);
    const rows = (data ?? []) as DefRow[];
    const present = new Set<string>();
    for (const key of keys) {
        const forKey = rows.filter((r) => r.key === key);
        const hit = forKey.find((r) => r.org_id === orgId) ?? forKey.find((r) => r.org_id == null);
        if (hit) present.add(key);
    }

    return actions.filter((action) => present.has(action.definition_key.trim()));
}
