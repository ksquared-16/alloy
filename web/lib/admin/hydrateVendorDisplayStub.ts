import { createAdminClient } from "@/lib/supabaseAdmin";
import { vendorRowToDisplayStub, type VendorRowForLabel } from "@/lib/admin/vendorOptionLabel";

type AdminSupabase = ReturnType<typeof createAdminClient>;

export async function hydrateVendorDisplayStub(
    supabase: AdminSupabase,
    vendorId: string,
    orgId: string
): Promise<{ id: string; name: string } | null> {
    const { data: row } = await supabase
        .from("vendors")
        .select("id, name, company_name, email, phone, primary_person_id")
        .eq("id", vendorId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (!row) return null;
    const r = row as VendorRowForLabel;
    let person: { first_name?: string | null; last_name?: string | null } | null = null;
    if (r.primary_person_id) {
        const { data: p } = await supabase
            .from("persons")
            .select("first_name, last_name")
            .eq("id", r.primary_person_id)
            .eq("org_id", orgId)
            .maybeSingle();
        person = p;
    }
    return vendorRowToDisplayStub(r, person);
}
