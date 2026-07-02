import type { SupabaseClient } from "@supabase/supabase-js";

function trimOrNull(v: unknown): string | null {
    const s = v != null ? String(v).trim() : "";
    return s || null;
}

/** Resolve category FK from site + stable program key (active row). */
export async function resolveProgramCategoryId(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        locationId: string | null | undefined;
        programKey: string | null | undefined;
    }
): Promise<string | null> {
    const locationId = trimOrNull(args.locationId);
    const programKey = trimOrNull(args.programKey);
    if (!locationId || !programKey) return null;

    const { data, error } = await supabase
        .from("location_program_categories")
        .select("id")
        .eq("org_id", args.orgId)
        .eq("location_id", locationId)
        .eq("key", programKey)
        .eq("is_active", true)
        .maybeSingle();

    if (error || !data?.id) return null;
    return String(data.id);
}

