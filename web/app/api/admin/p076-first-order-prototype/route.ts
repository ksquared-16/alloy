import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { CUSTOMER_MEMBER_CONFIG_FIELD_KEYS } from "@/lib/fields/customerMemberFieldRegistry";

/**
 * P0-7.6 — FIRST-ORDER READ-DAG PROTOTYPE. DIAGNOSTIC ONLY, NOT A PRODUCT SURFACE.
 *
 * The architecture model says the operator's first authoritative frame needs ~30 scalars plus the
 * queue rows, and that two of today's reads are round-trip defects rather than slow queries:
 *
 *   · the Health profile read is THREE SERIAL round trips (customer_members, then field_definitions,
 *     then field_values) at ~399 ms, where two of the three are independent;
 *   · prepaid is resolved by building full payment views, which issue TWO QUERIES PER PAYMENT
 *     (refunded, unapplied) — an N+1 whose measured 313 ms is the FLOOR, on a specimen with no
 *     payments at all.
 *
 * A model cannot settle whether the repaired shapes are actually faster, so this measures them.
 * It creates NO maintained state: both repairs are query shapes over the same tables with the same
 * filters, so nothing here is a second semantic owner and nothing needs a freshness contract.
 *
 * Off unless ALLOY_ROUTE_TIMING=1, and it answers 404 otherwise so it cannot become a surface.
 * Authorization is the ordinary request-time admin gate — the prototype does not get a softer door
 * than the product, which is the whole point of measuring the real path.
 */
export const dynamic = "force-dynamic";

type Span = { name: string; ms: number; rows: number | null; note?: string };

export async function GET(req: NextRequest) {
    if (process.env.ALLOY_ROUTE_TIMING !== "1") {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const access = await getAdminAccessContextCached();
    if (!access.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const supabase = createAdminClient();
    const orgId = access.orgId;
    const memberId = req.nextUrl.searchParams.get("member_id");
    const customerId = req.nextUrl.searchParams.get("customer_id");

    const spans: Span[] = [];
    const t0 = performance.now();
    const time = async <T,>(name: string, run: () => PromiseLike<T>, count?: (v: T) => number): Promise<T | null> => {
        const s = performance.now();
        try {
            const v = await run();
            spans.push({ name, ms: Math.round(performance.now() - s), rows: count ? count(v) : null });
            return v;
        } catch (e) {
            spans.push({ name, ms: Math.round(performance.now() - s), rows: null, note: `failed: ${String(e).slice(0, 80)}` });
            return null;
        }
    };

    /*
     * REPAIR 1 — the Health profile read as TWO hops instead of three.
     *
     * `customer_members` and `field_definitions` do not depend on each other; only `field_values`
     * depends on the definition ids. Today all three are serial. The floor for this shape is
     * max(members, definitions) + values.
     */
    const profileRepaired = await time("health_profile_repaired_2hop", async () => {
        const [members, defs] = await Promise.all([
            supabase.from("customer_members").select("id, person_id, first_name, last_name, dob")
                .eq("org_id", orgId).in("id", memberId ? [memberId] : []),
            supabase.from("field_definitions").select("id, field_key, field_type")
                .eq("org_id", orgId).eq("entity_type", "customer_member").eq("is_active", true)
                .in("field_key", [...CUSTOMER_MEMBER_CONFIG_FIELD_KEYS]),
        ]);
        const ids = ((defs.data ?? []) as Array<{ id: string }>).map((d) => d.id);
        const values = ids.length
            ? await supabase.from("field_values").select("entity_id, field_definition_id, value_text, value_number, value_date, value_json")
                .eq("org_id", orgId).eq("entity_type", "customer_member")
                .in("entity_id", memberId ? [memberId] : []).in("field_definition_id", ids)
            : { data: [] };
        return { members: members.data?.length ?? 0, defs: ids.length, values: (values.data ?? []).length };
    });

    /*
     * REPAIR 1b — the same answer as ONE hop, by filtering field_values through an embedded
     * definition rather than resolving ids first. If this is sound, the profile read is one round
     * trip and no maintained health fact is needed at all.
     */
    await time("health_profile_repaired_1hop", () =>
        supabase.from("field_values")
            .select("entity_id, field_definition_id, value_text, value_number, value_date, value_json, field_definitions!inner(field_key, entity_type, is_active)")
            .eq("org_id", orgId).eq("entity_type", "customer_member")
            .in("entity_id", memberId ? [memberId] : [])
            .eq("field_definitions.is_active", true)
            .in("field_definitions.field_key", [...CUSTOMER_MEMBER_CONFIG_FIELD_KEYS]),
        (v) => (v.data ?? []).length);

    // The three Health reads that are already single round trips, for comparison in the same run.
    await time("health_documents", () =>
        supabase.from("documents").select("id, doc_type, title, status, created_at")
            .eq("org_id", orgId).eq("entity_type", "customer_member").eq("entity_id", memberId ?? ""),
        (v) => (v.data ?? []).length);
    await time("health_contacts", () =>
        supabase.from("person_child_relationships").select("person_id, relationship_type, priority, status")
            .eq("org_id", orgId).eq("customer_member_id", memberId ?? "").eq("status", "active"),
        (v) => (v.data ?? []).length);

    /*
     * REPAIR 2 — prepaid as ONE aggregate read instead of N+1 payment views.
     *
     * The first-order card consumes available/pending/held cents, not the view list. Payments and
     * their allocations are read once each and summed here; the current path issues two further
     * queries PER PAYMENT. Held money is read separately because it is a different authority.
     */
    await time("prepaid_aggregate_2hop", async () => {
        const pays = await supabase.from("payments").select("id, amount_cents, status")
            .eq("org_id", orgId).eq("customer_id", customerId ?? "");
        const ids = ((pays.data ?? []) as Array<{ id: string }>).map((p) => p.id);
        const allocs = ids.length
            ? await supabase.from("payment_allocations").select("payment_id, amount_cents")
                .eq("org_id", orgId).in("payment_id", ids)
            : { data: [] };
        return { payments: ids.length, allocations: (allocs.data ?? []).length };
    });

    return NextResponse.json({
        ok: true,
        orgId_present: Boolean(orgId),
        memberId_present: Boolean(memberId),
        customerId_present: Boolean(customerId),
        totalMs: Math.round(performance.now() - t0),
        spans,
        profileRepaired,
        note: "DIAGNOSTIC. Measures repaired READ SHAPES only. No maintained state is created and no product path is changed.",
    });
}
