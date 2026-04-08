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
