import { CANONICAL_SQFT_TIER_OPTIONS } from "@/lib/book-v2/loadCleaningPricingCatalog";
import { createAdminClient } from "@/lib/supabaseAdmin";

type AdminSupabase = ReturnType<typeof createAdminClient>;

function canonicalSqftTierLabel(tierKey: string | null | undefined): string | null {
    const k = String(tierKey ?? "").trim();
    if (!k) return null;
    return CANONICAL_SQFT_TIER_OPTIONS.find((o) => o.value === k)?.label ?? k;
}

/** Resolve option_set_items.label for org + set_key + item_key; falls back to canonical cleaning labels for sqft tier. */
export async function optionItemLabelForOrg(
    supabase: AdminSupabase,
    orgId: string,
    setKey: string,
    itemKey: string | null | undefined
): Promise<string | null> {
    const k = String(itemKey ?? "").trim();
    if (!k) return null;
    const { data: setRow } = await supabase.from("option_sets").select("id").eq("org_id", orgId).eq("set_key", setKey).maybeSingle();
    const sid = (setRow as { id?: string } | null)?.id;
    if (!sid) {
        if (setKey === "square_footage_tier") return canonicalSqftTierLabel(k) ?? k;
        return k;
    }
    const { data: it } = await supabase
        .from("option_set_items")
        .select("label")
        .eq("option_set_id", sid)
        .eq("item_key", k)
        .maybeSingle();
    const lab = (it as { label?: string } | null)?.label;
    if (lab != null && String(lab).trim() !== "") return String(lab).trim();
    return canonicalSqftTierLabel(k) ?? k;
}

function batchCacheKey(setKey: string, itemKey: string): string {
    return `${setKey}\0${itemKey}`;
}

/**
 * Batch-resolve option_set_items.label for many (set_key, item_key) pairs.
 * One `option_sets` lookup + one `option_set_items` IN query per distinct set_key.
 */
export async function batchOptionItemLabelsForOrg(
    supabase: AdminSupabase,
    orgId: string,
    pairs: ReadonlyArray<{ setKey: string; itemKey: string | null | undefined }>
): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const bySet = new Map<string, Set<string>>();
    for (const p of pairs) {
        const sk = String(p.setKey ?? "").trim();
        const ik = String(p.itemKey ?? "").trim();
        if (!sk || !ik) continue;
        let keys = bySet.get(sk);
        if (!keys) {
            keys = new Set();
            bySet.set(sk, keys);
        }
        keys.add(ik);
    }
    for (const [setKey, itemKeys] of bySet) {
        const { data: setRow } = await supabase.from("option_sets").select("id").eq("org_id", orgId).eq("set_key", setKey).maybeSingle();
        const sid = (setRow as { id?: string } | null)?.id;
        const keysArr = [...itemKeys];
        if (!sid) {
            for (const ik of keysArr) {
                const ck = batchCacheKey(setKey, ik);
                out.set(ck, setKey === "square_footage_tier" ? (canonicalSqftTierLabel(ik) ?? ik) : ik);
            }
            continue;
        }
        const { data: itemRows } = await supabase
            .from("option_set_items")
            .select("item_key, label")
            .eq("option_set_id", sid)
            .in("item_key", keysArr);
        const labelByKey = new Map(
            ((itemRows ?? []) as { item_key: string; label?: string | null }[]).map((r) => [r.item_key, r.label])
        );
        for (const ik of keysArr) {
            const ck = batchCacheKey(setKey, ik);
            const lab = labelByKey.get(ik);
            const trimmed = lab != null && String(lab).trim() !== "" ? String(lab).trim() : null;
            if (trimmed) {
                out.set(ck, trimmed);
            } else {
                out.set(ck, setKey === "square_footage_tier" ? (canonicalSqftTierLabel(ik) ?? ik) : ik);
            }
        }
    }
    return out;
}

/** Read a label from {@link batchOptionItemLabelsForOrg}'s map (same semantics as single-key resolve). */
export function optionLabelFromBatchMap(map: Map<string, string>, setKey: string, itemKey: string | null | undefined): string | null {
    const sk = String(setKey ?? "").trim();
    const ik = String(itemKey ?? "").trim();
    if (!sk || !ik) return null;
    return map.get(batchCacheKey(sk, ik)) ?? null;
}
