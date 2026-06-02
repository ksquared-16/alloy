import type { SupabaseClient } from "@supabase/supabase-js";

type DefRow = {
    id: string;
    key: string;
    label: string;
    org_id: string | null;
};

/** Platform or org override row for an action_definitions.key. */
export async function loadPlatformActionDefinitionForOrg(
    supabase: SupabaseClient,
    orgId: string,
    definitionKey: string
): Promise<DefRow | null> {
    const key = definitionKey.trim();
    if (!key) return null;

    const { data, error } = await supabase
        .from("action_definitions")
        .select("id, key, label, org_id")
        .eq("key", key)
        .eq("is_active", true)
        .or(`org_id.is.null,org_id.eq.${orgId}`);

    if (error) throw new Error(error.message);
    const rows = (data ?? []) as DefRow[];
    return rows.find((r) => r.org_id === orgId) ?? rows.find((r) => r.org_id == null) ?? null;
}
