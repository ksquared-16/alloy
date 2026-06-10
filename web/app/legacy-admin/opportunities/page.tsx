import { createAdminClient } from "@/lib/supabaseAdmin";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { resolveOpportunityIdentityIds } from "@/lib/opportunityIdentity";
import OpportunitiesClient from "./OpportunitiesClient";

export const dynamic = 'force-dynamic';

type SearchParams = { status_key?: string };

function quoteTotalDisplay(opp: {
    quote_total?: number | null;
    estimated_price_cents?: number | null;
    monetary_value_cents?: number | null;
}): number | null {
    if (opp.quote_total != null && !Number.isNaN(Number(opp.quote_total))) return Number(opp.quote_total);
    if (opp.estimated_price_cents != null && !Number.isNaN(Number(opp.estimated_price_cents))) return Number(opp.estimated_price_cents) / 100;
    if (opp.monetary_value_cents != null && !Number.isNaN(Number(opp.monetary_value_cents))) return Number(opp.monetary_value_cents) / 100;
    return null;
}

export default async function OpportunitiesPage({ searchParams }: { searchParams: SearchParams }) {
    const supabase = createAdminClient();
    const statusKey = typeof searchParams?.status_key === "string" ? searchParams.status_key.trim() || null : null;

    const cols = "id, created_at, updated_at, opportunity_number, name, status, status_key, job_date, job_time_window, quote_total, customer_id, primary_contact_id, primary_person_id, external_id, vertical_id, source, estimated_price_cents, monetary_value_cents";
    let q = supabase
        .from("opportunities")
        .select(cols)
        .order("created_at", { ascending: false })
        .limit(1000);
    if (statusKey) q = q.eq("status_key", statusKey);
    const { data: opportunities, error } = await q;

    const verticalIds = [...new Set((opportunities ?? []).map((o) => o.vertical_id).filter(Boolean))] as string[];
    const [customersRes, contactsRes, personsRes, verticalsRes] = await Promise.all([
        (opportunities ?? []).length
            ? supabase.from("customers").select("id, name, org_id").in("id", [...new Set((opportunities ?? []).map((o) => o.customer_id).filter(Boolean))] as string[])
            : { data: [] },
        (opportunities ?? []).length
            ? supabase.from("contacts").select("id, first_name, last_name, email, phone").in("id", [...new Set((opportunities ?? []).map((o) => o.primary_contact_id).filter(Boolean))] as string[])
            : { data: [] },
        (opportunities ?? []).length
            ? supabase.from("persons").select("id, first_name, last_name").in("id", [...new Set((opportunities ?? []).map((o) => (o as { primary_person_id?: string | null }).primary_person_id).filter(Boolean))] as string[])
            : { data: [] },
        verticalIds.length ? supabase.from("verticals").select("id, name").in("id", verticalIds) : { data: [] },
    ]);

    const customerMap = new Map((customersRes.data ?? []).map((c) => [c.id, c]));
    const orgIdsForOpp = [
        ...new Set(
            (customersRes.data ?? [])
                .map((c) => (c as { org_id?: string | null }).org_id)
                .filter(Boolean)
        ),
    ] as string[];
    const oppStatusLabelByOrg = new Map<string, Map<string, string>>();
    for (const oid of orgIdsForOpp) {
        const defs = await fetchEffectiveStatusDefinitions(supabase, oid, "opportunities", { activeOnly: true });
        oppStatusLabelByOrg.set(
            oid,
            new Map(defs.map((d) => [d.status_key, (d.status_label?.trim() || d.status_key) as string]))
        );
    }
    const contactMap = new Map((contactsRes.data ?? []).map((c) => [c.id, c]));
    const personMap = new Map((personsRes.data ?? []).map((p) => [p.id, p]));
    const verticalMap = new Map((verticalsRes.data ?? []).map((v: { id: string; name?: string | null }) => [v.id, v.name ?? null]));

    const rows = (opportunities ?? []).map((o) => {
        const customer = o.customer_id ? customerMap.get(o.customer_id) : undefined;
        // Person-first display: use resolveOpportunityIdentityIds (see lib/opportunityIdentity).
        const { primary_person_id, fallback_contact_id } = resolveOpportunityIdentityIds(
            o as { primary_person_id?: string | null; primary_contact_id?: string | null }
        );
        const contact = fallback_contact_id ? contactMap.get(fallback_contact_id) : undefined;
        const contactName = contact
            ? [(contact as { first_name?: string }).first_name, (contact as { last_name?: string }).last_name].filter(Boolean).join(" ") || null
            : null;
        const person = primary_person_id ? personMap.get(primary_person_id) : undefined;
        const _primary_person_name = person
            ? [(person as { first_name?: string }).first_name, (person as { last_name?: string }).last_name].filter(Boolean).join(" ").trim() || null
            : null;
        const custOrg = (customer as { org_id?: string | null } | undefined)?.org_id ?? null;
        const oppLabels = custOrg ? oppStatusLabelByOrg.get(custOrg) : null;
        const sk = o.status_key ?? null;
        const _status_display = sk ? (oppLabels?.get(sk) ?? sk) : null;
        const _updated = (o as { updated_at?: string | null }).updated_at ?? o.created_at ?? null;
        const _quote_total_display = quoteTotalDisplay(o as { quote_total?: number | null; estimated_price_cents?: number | null; monetary_value_cents?: number | null });
        return {
            ...o,
            _vertical_name: o.vertical_id ? (verticalMap.get(o.vertical_id) ?? null) : null,
            _customer_name: (customer as { name?: string } | undefined)?.name ?? null,
            _contact_name: contactName,
            _primary_person_name: _primary_person_name ?? contactName,
            _primary_contact_name: contactName,
            _contact_email: (contact as { email?: string } | undefined)?.email ?? null,
            _contact_phone: (contact as { phone?: string } | undefined)?.phone ?? null,
            _status_display: _status_display ?? null,
            _quote_total_display: _quote_total_display,
            _updated,
        };
    });

    if (error) {
        console.error("Error fetching opportunities:", error);
        return <OpportunitiesClient initialData={[]} error={error?.message} />;
    }

    return (
        <OpportunitiesClient
            initialData={rows}
            error={undefined}
        />
    );
}

