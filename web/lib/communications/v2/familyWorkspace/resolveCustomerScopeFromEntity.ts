// UI-6 — resolve a drawer entity to its family (customer) scope. I/O thin wrapper + pure kind map.
import { createAdminClient } from "@/lib/supabaseAdmin";

type AdminSupabase = ReturnType<typeof createAdminClient>;

export type EntityScope = {
    customerId: string | null;
    focusOpportunityId: string | null;
    focusChildId: string | null;
    focusPersonId: string | null;
};

export type EntityKind = "customer" | "opportunity" | "child" | "person" | "unknown";

/** Pure: normalize a drawer entity_type string to a scope kind. */
export function entityKind(entityType: string | null | undefined): EntityKind {
    const t = (entityType ?? "").trim().toLowerCase();
    if (t === "customer" || t === "customers") return "customer";
    if (t === "opportunity" || t === "opportunities") return "opportunity";
    if (t === "child" || t === "children" || t === "customer_member" || t === "customer_members") return "child";
    if (t === "person" || t === "persons") return "person";
    return "unknown";
}

export async function resolveCustomerScopeFromEntity(
    supabase: AdminSupabase,
    orgId: string,
    entityType: string,
    entityId: string
): Promise<EntityScope> {
    const empty: EntityScope = { customerId: null, focusOpportunityId: null, focusChildId: null, focusPersonId: null };
    switch (entityKind(entityType)) {
        case "customer":
            return { ...empty, customerId: entityId };
        case "opportunity": {
            const { data } = await supabase.from("opportunities").select("customer_id").eq("org_id", orgId).eq("id", entityId).maybeSingle();
            return { ...empty, customerId: (data?.customer_id as string) ?? null, focusOpportunityId: entityId };
        }
        case "child": {
            const { data } = await supabase.from("customer_members").select("customer_id").eq("org_id", orgId).eq("id", entityId).maybeSingle();
            return { ...empty, customerId: (data?.customer_id as string) ?? null, focusChildId: entityId };
        }
        case "person": {
            const { data } = await supabase.from("customer_persons").select("customer_id").eq("org_id", orgId).eq("person_id", entityId).limit(1);
            const cid = Array.isArray(data) && data[0] ? ((data[0] as { customer_id?: string }).customer_id ?? null) : null;
            if (cid) return { ...empty, customerId: cid, focusPersonId: entityId };
            // Fallback: a person who is actually a child (linked via customer_members.person_id).
            const { data: cm } = await supabase.from("customer_members").select("id, customer_id").eq("org_id", orgId).eq("person_id", entityId).limit(1);
            const row = Array.isArray(cm) && cm[0] ? (cm[0] as { id?: string; customer_id?: string }) : null;
            if (row?.customer_id) return { ...empty, customerId: row.customer_id, focusChildId: row.id ?? null };
            return { ...empty, focusPersonId: entityId };
        }
        default:
            return empty;
    }
}
