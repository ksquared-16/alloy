import type { SupabaseClient } from "@supabase/supabase-js";
import type { FieldOption } from "@/lib/fields/fieldDefinitionConfig";

/**
 * Load select options for a reusable option set (org-scoped).
 */
export async function resolveOptionSetOptions(
    supabase: SupabaseClient,
    orgId: string,
    setKey: string
): Promise<FieldOption[]> {
    const sk = setKey.trim();
    if (!sk) return [];
    const { data: setRow, error: setErr } = await supabase
        .from("option_sets")
        .select("id")
        .eq("org_id", orgId)
        .eq("set_key", sk)
        .maybeSingle();
    if (setErr || !setRow?.id) {
        if (setErr) console.warn("[resolveOptionSetOptions] option_sets", setErr.message);
        return [];
    }
    const { data: items, error: itemErr } = await supabase
        .from("option_set_items")
        .select("item_key, label")
        .eq("option_set_id", (setRow as { id: string }).id)
        .order("sort_order", { ascending: true });
    if (itemErr) {
        console.warn("[resolveOptionSetOptions] option_set_items", itemErr.message);
        return [];
    }
    return ((items ?? []) as { item_key: string; label: string }[]).map((r) => ({
        value: String(r.item_key).trim(),
        label: (r.label && String(r.label).trim()) || String(r.item_key).trim(),
    }));
}

export type FieldOptionWithMetadata = FieldOption & { metadata?: Record<string, unknown> };

/** Like resolveOptionSetOptions, but includes option_set_items.metadata for UI classification. */
export async function resolveOptionSetOptionsWithMetadata(
    supabase: SupabaseClient,
    orgId: string,
    setKey: string
): Promise<FieldOptionWithMetadata[]> {
    const sk = setKey.trim();
    if (!sk) return [];
    const { data: setRow, error: setErr } = await supabase
        .from("option_sets")
        .select("id")
        .eq("org_id", orgId)
        .eq("set_key", sk)
        .maybeSingle();
    if (setErr || !setRow?.id) {
        if (setErr) console.warn("[resolveOptionSetOptionsWithMetadata] option_sets", setErr.message);
        return [];
    }
    const { data: items, error: itemErr } = await supabase
        .from("option_set_items")
        .select("item_key, label, metadata")
        .eq("option_set_id", (setRow as { id: string }).id)
        .order("sort_order", { ascending: true });
    if (itemErr) {
        console.warn("[resolveOptionSetOptionsWithMetadata] option_set_items", itemErr.message);
        return [];
    }
    return ((items ?? []) as { item_key: string; label: string; metadata?: Record<string, unknown> }[]).map((r) => ({
        value: String(r.item_key).trim(),
        label: (r.label && String(r.label).trim()) || String(r.item_key).trim(),
        metadata: (r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata) ? r.metadata : undefined) as
            | Record<string, unknown>
            | undefined,
    }));
}

export type OptionSetOptionsMap = Record<string, FieldOption[]>;

/** Batch-load multiple sets in a small number of queries. */
export async function resolveOptionSetsForOrg(
    supabase: SupabaseClient,
    orgId: string,
    setKeys: string[]
): Promise<OptionSetOptionsMap> {
    const keys = [...new Set(setKeys.map((k) => k.trim()).filter(Boolean))];
    const out: OptionSetOptionsMap = {};
    if (keys.length === 0) return out;
    const { data: sets, error: sErr } = await supabase.from("option_sets").select("id, set_key").eq("org_id", orgId).in("set_key", keys);
    if (sErr || !sets?.length) return out;
    const idByKey = new Map((sets as { id: string; set_key: string }[]).map((r) => [r.set_key, r.id]));
    const setIds = [...idByKey.values()];
    const { data: items, error: iErr } = await supabase
        .from("option_set_items")
        .select("option_set_id, item_key, label, sort_order")
        .in("option_set_id", setIds)
        .order("sort_order", { ascending: true });
    if (iErr || !items) return out;
    const keyBySetId = new Map([...idByKey.entries()].map(([k, v]) => [v, k]));
    for (const row of items as { option_set_id: string; item_key: string; label: string }[]) {
        const sk = keyBySetId.get(row.option_set_id);
        if (!sk) continue;
        if (!out[sk]) out[sk] = [];
        out[sk].push({
            value: String(row.item_key).trim(),
            label: (row.label && String(row.label).trim()) || String(row.item_key).trim(),
        });
    }
    return out;
}

export function optionSetKeyFromFieldConfig(config: unknown): string | null {
    if (!config || typeof config !== "object" || Array.isArray(config)) return null;
    const k = (config as Record<string, unknown>).option_set_key;
    return typeof k === "string" && k.trim() ? k.trim() : null;
}
