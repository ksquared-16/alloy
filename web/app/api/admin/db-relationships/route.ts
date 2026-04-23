import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** GET: list customer_persons and person_relationships for current org (for DB Relationships admin page). */
export async function GET() {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    try {
        const supabase = createAdminClient();

        const [cpRes, personIdsRes, relTypesRes, roleTypesRes] = await Promise.all([
            supabase
                .from("customer_persons")
                .select("id, customer_id, person_id, role_type, created_at")
                .eq("org_id", ctx.orgId)
                .order("created_at", { ascending: false }),
            supabase.from("persons").select("id").eq("org_id", ctx.orgId),
            supabase
                .from("person_relationship_type_settings")
                .select("key, label")
                .eq("org_id", ctx.orgId)
                .eq("is_active", true),
            supabase
                .from("customer_person_role_types")
                .select("key, label")
                .eq("org_id", ctx.orgId)
                .eq("is_active", true),
        ]);

        const cpRows = cpRes.data ?? [];
        const personIds = new Set((personIdsRes.data ?? []).map((r: { id: string }) => r.id));
        const roleLabelMap = new Map((roleTypesRes.data ?? []).map((r: { key: string; label: string | null }) => [r.key, r.label ?? r.key]));
        const relTypeLabelMap = new Map((relTypesRes.data ?? []).map((r: { key: string; label: string | null }) => [r.key, r.label ?? r.key]));

        const customerIds = [...new Set(cpRows.map((r: { customer_id: string }) => r.customer_id))];
        const cpPersonIds = [...new Set(cpRows.map((r: { person_id: string }) => r.person_id))];
        const [customerRows, personRows] = await Promise.all([
            customerIds.length > 0
                ? supabase.from("customers").select("id, name").in("id", customerIds)
                : { data: [] as { id: string; name: string | null }[] },
            cpPersonIds.length > 0
                ? supabase.from("persons").select("id, first_name, last_name").in("id", cpPersonIds)
                : { data: [] as { id: string; first_name?: string | null; last_name?: string | null }[] },
        ]);
        const customerMap = new Map((customerRows.data ?? []).map((c) => [c.id, c.name ?? null]));
        const personNameMap = new Map(
            (personRows.data ?? []).map((p) => [
                p.id,
                [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null,
            ])
        );

        const customer_persons = cpRows.map((r: { id: string; customer_id: string; person_id: string; role_type?: string | null; created_at?: string }) => ({
            id: r.id,
            customer_id: r.customer_id,
            person_id: r.person_id,
            role_type: r.role_type ?? null,
            role_label: r.role_type ? (roleLabelMap.get(r.role_type) ?? r.role_type) : null,
            _customer_name: customerMap.get(r.customer_id) ?? null,
            _person_name: personNameMap.get(r.person_id) ?? null,
            created_at: r.created_at,
        }));

        if (personIds.size === 0) {
            return NextResponse.json({ customer_persons, person_relationships: [] });
        }

        const personIdList = [...personIds];
        const relRes = await supabase
            .from("person_relationships")
            .select("id, from_person_id, to_person_id, relationship_type, created_at")
            .in("from_person_id", personIdList)
            .in("to_person_id", personIdList);
        const relRows = relRes.data ?? [];
        const relPersonIds = [...new Set(relRows.flatMap((r: { from_person_id: string; to_person_id: string }) => [r.from_person_id, r.to_person_id]))];
        const { data: relPersonRows } =
            relPersonIds.length > 0
                ? await supabase.from("persons").select("id, first_name, last_name").in("id", relPersonIds)
                : { data: [] as { id: string; first_name?: string | null; last_name?: string | null }[] };
        const relPersonNameMap = new Map(
            (relPersonRows ?? []).map((p) => [
                p.id,
                [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null,
            ])
        );

        const person_relationships = relRows.map(
            (r: { id: string; from_person_id: string; to_person_id: string; relationship_type?: string | null; created_at?: string }) => ({
                id: r.id,
                from_person_id: r.from_person_id,
                to_person_id: r.to_person_id,
                relationship_type: r.relationship_type ?? null,
                _relationship_type_label: r.relationship_type ? (relTypeLabelMap.get(r.relationship_type) ?? r.relationship_type) : null,
                _from_person_name: relPersonNameMap.get(r.from_person_id) ?? null,
                _to_person_name: relPersonNameMap.get(r.to_person_id) ?? null,
                created_at: r.created_at,
            })
        );

        return NextResponse.json({ customer_persons, person_relationships });
    } catch (e) {
        console.error("[ADMIN_DB_RELATIONSHIPS]", e);
        return NextResponse.json({ error: "Failed to load relationships" }, { status: 500 });
    }
}
