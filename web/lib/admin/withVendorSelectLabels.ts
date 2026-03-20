import type { SupabaseClient } from "@supabase/supabase-js";
import { vendorsToSelectOptions, type AdminVendorSelectOption, type VendorRowForLabel } from "./vendorOptionLabel";

/** Attach computed `label` to vendor rows for admin dropdowns (value stays `id`). */
export async function withVendorSelectLabels(
    supabase: SupabaseClient,
    rows: VendorRowForLabel[] | null | undefined
): Promise<AdminVendorSelectOption[]> {
    const list = rows ?? [];
    const personIds = [...new Set(list.map((r) => r.primary_person_id).filter(Boolean))] as string[];
    const { data: persons } =
        personIds.length > 0
            ? await supabase.from("persons").select("id, first_name, last_name").in("id", personIds)
            : { data: [] as { id: string; first_name?: string | null; last_name?: string | null }[] };
    const pmap = new Map((persons ?? []).map((p) => [p.id, p]));
    return vendorsToSelectOptions(list, pmap);
}
