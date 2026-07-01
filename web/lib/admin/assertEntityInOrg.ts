import type { SupabaseClient } from "@supabase/supabase-js";

/** Verify `entity_id` exists under `org_id` for canonical `documents.entity_type` values. */
export async function assertEntityInOrg(
    supabase: SupabaseClient,
    orgId: string,
    canonicalType: string,
    entityId: string
): Promise<boolean> {
    switch (canonicalType) {
        case "customer": {
            const { data } = await supabase.from("customers").select("id").eq("id", entityId).eq("org_id", orgId).maybeSingle();
            return !!data;
        }
        case "contact": {
            const { data } = await supabase.from("contacts").select("id").eq("id", entityId).eq("org_id", orgId).maybeSingle();
            return !!data;
        }
        case "opportunity": {
            const { data } = await supabase.from("opportunities").select("id").eq("id", entityId).eq("org_id", orgId).maybeSingle();
            return !!data;
        }
        case "job": {
            const { data } = await supabase.from("jobs").select("id").eq("id", entityId).eq("org_id", orgId).maybeSingle();
            return !!data;
        }
        case "location": {
            const { data } = await supabase.from("locations").select("id").eq("id", entityId).eq("org_id", orgId).maybeSingle();
            return !!data;
        }
        case "customer_member": {
            const { data } = await supabase.from("customer_members").select("id").eq("id", entityId).eq("org_id", orgId).maybeSingle();
            return !!data;
        }
        case "vendor": {
            const { data } = await supabase.from("vendors").select("id").eq("id", entityId).eq("org_id", orgId).maybeSingle();
            return !!data;
        }
        case "person": {
            const { data } = await supabase.from("persons").select("id").eq("id", entityId).eq("org_id", orgId).maybeSingle();
            return !!data;
        }
        case "schedule": {
            const { data } = await supabase.from("schedules").select("id").eq("id", entityId).eq("org_id", orgId).maybeSingle();
            return !!data;
        }
        default:
            return false;
    }
}
