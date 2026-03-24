import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOK_V2_ACCESS_METHOD_TO_DB_KEY, homeTypeLabelToDbKey } from "@/lib/book-v2/bookingCanonicalMaps";

export async function resolveAccessMethodIdByUiKey(
    supabase: SupabaseClient,
    uiAccessMethod: string | null | undefined
): Promise<string | null> {
    const ui = String(uiAccessMethod ?? "home").trim() || "home";
    const dbKey = BOOK_V2_ACCESS_METHOD_TO_DB_KEY[ui] ?? ui;
    const { data } = await supabase.from("access_methods").select("id").eq("key", dbKey).eq("is_active", true).maybeSingle();
    return (data as { id?: string } | null)?.id ?? null;
}

export async function resolveHomeTypeIdByLabel(supabase: SupabaseClient, label: string | null | undefined): Promise<string | null> {
    const key = homeTypeLabelToDbKey(label);
    if (key) {
        const { data } = await supabase.from("home_types").select("id").eq("key", key).eq("is_active", true).maybeSingle();
        if ((data as { id?: string } | null)?.id) return (data as { id: string }).id;
    }
    const trimmed = String(label ?? "").trim();
    if (!trimmed) return null;
    const { data: byLabel } = await supabase
        .from("home_types")
        .select("id")
        .ilike("label", trimmed)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
    return (byLabel as { id?: string } | null)?.id ?? null;
}

/** Quote square_footage bucket string → sqft_bands.id */
export async function resolveSqftBandIdByKey(supabase: SupabaseClient, bucketKey: string | null | undefined): Promise<string | null> {
    const k = String(bucketKey ?? "").trim();
    if (!k) return null;
    const { data } = await supabase.from("sqft_bands").select("id").eq("key", k).eq("is_active", true).maybeSingle();
    return (data as { id?: string } | null)?.id ?? null;
}
