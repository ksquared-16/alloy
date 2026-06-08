import type { SupabaseClient } from "@supabase/supabase-js";

import {
    applyRecordScopeConstraintsToQuery,
    resolveRecordScopeConstraints,
    type AdminAccessScopeDimensions,
} from "@/lib/admin/accessScope";
import {
    LOCATION_DISPLAY_LABEL_SELECT,
    locationDisplayLabelFromRow,
    type LocationDisplayLabelRow,
} from "@/lib/admin/locationDisplayLabel";
import { humanizeGlobalSearchStatusLabel } from "@/lib/admin/globalSearch/globalRecordSearchStatusLabel";

export type CustomerEnrollmentContext = {
    customer_id: string;
    customer_name: string | null;
    opportunity_id: string | null;
    opportunity_name: string | null;
    opportunity_status_label: string | null;
    location_id: string | null;
    location_label: string | null;
};

type OppRow = {
    id: string;
    customer_id?: string | null;
    location_id?: string | null;
    name?: string | null;
    title?: string | null;
    status_key?: string | null;
    created_at?: string | null;
};

function oppLabel(o: OppRow): string {
    const t = (o.title ?? "").trim();
    const n = (o.name ?? "").trim();
    return t || n || `Opportunity ${o.id.slice(0, 8)}…`;
}

async function fetchLocationLabelsById(
    supabase: SupabaseClient,
    orgId: string,
    locationIds: string[]
): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const ids = [...new Set(locationIds.map(String).filter(Boolean))];
    if (!ids.length) return out;
    const { data, error } = await supabase
        .from("locations")
        .select(LOCATION_DISPLAY_LABEL_SELECT)
        .eq("org_id", orgId)
        .in("id", ids as any);
    if (error) return out;
    for (const row of (data ?? []) as Array<{ id: string } & LocationDisplayLabelRow>) {
        const label = locationDisplayLabelFromRow(row);
        if (label) out.set(String(row.id), label);
    }
    return out;
}

/**
 * Resolve household + lead + campus context via:
 * customers.id → opportunities.customer_id → opportunities.location_id → locations.id
 */
export async function fetchCustomerEnrollmentContextByCustomerIds(
    supabase: SupabaseClient,
    orgId: string,
    customerIds: string[],
    accessDim: AdminAccessScopeDimensions,
    oppStatusLabels: Map<string, string>
): Promise<Map<string, CustomerEnrollmentContext>> {
    const out = new Map<string, CustomerEnrollmentContext>();
    const ids = [...new Set(customerIds.map(String).filter(Boolean))];
    if (!ids.length) return out;

    const scopeCons = await resolveRecordScopeConstraints(supabase, orgId, accessDim);
    if (scopeCons.impossible) return out;

    const [{ data: customers }, { data: opps }] = await Promise.all([
        supabase.from("customers").select("id, name").eq("org_id", orgId).in("id", ids),
        (async () => {
            let q = supabase
                .from("opportunities")
                .select("id, customer_id, location_id, name, title, status_key, created_at")
                .eq("org_id", orgId)
                .in("customer_id", ids);
            q = applyRecordScopeConstraintsToQuery(q, scopeCons);
            return q.order("created_at", { ascending: false }).limit(Math.max(ids.length * 3, 30));
        })(),
    ]);

    const customerNameById = new Map<string, string>();
    for (const c of customers ?? []) {
        const name = (c as { name?: string | null }).name?.trim();
        if (name) customerNameById.set(String((c as { id: string }).id), name);
    }

    const bestOppByCustomer = new Map<string, OppRow>();
    for (const row of (opps ?? []) as OppRow[]) {
        const cid = row.customer_id != null ? String(row.customer_id) : "";
        if (!cid || bestOppByCustomer.has(cid)) continue;
        bestOppByCustomer.set(cid, row);
    }

    const locationIds = [...bestOppByCustomer.values()]
        .map((o) => o.location_id)
        .filter(Boolean) as string[];
    const locationLabels = await fetchLocationLabelsById(supabase, orgId, locationIds);

    for (const cid of ids) {
        const opp = bestOppByCustomer.get(cid) ?? null;
        const statusKey = opp?.status_key?.trim() || null;
        const locationId = opp?.location_id != null ? String(opp.location_id) : null;
        out.set(cid, {
            customer_id: cid,
            customer_name: customerNameById.get(cid) ?? null,
            opportunity_id: opp?.id ?? null,
            opportunity_name: opp ? oppLabel(opp) : null,
            opportunity_status_label: humanizeGlobalSearchStatusLabel(statusKey, oppStatusLabels),
            location_id: locationId,
            location_label: locationId ? locationLabels.get(locationId) ?? null : null,
        });
    }

    return out;
}

/** persons.id → opportunity_persons → opportunities → locations */
export async function fetchPersonDirectOpportunityContext(
    supabase: SupabaseClient,
    orgId: string,
    personIds: string[],
    accessDim: AdminAccessScopeDimensions,
    oppStatusLabels: Map<string, string>
): Promise<Map<string, CustomerEnrollmentContext>> {
    const out = new Map<string, CustomerEnrollmentContext>();
    const ids = [...new Set(personIds.map(String).filter(Boolean))];
    if (!ids.length) return out;

    const scopeCons = await resolveRecordScopeConstraints(supabase, orgId, accessDim);
    if (scopeCons.impossible) return out;

    const { data: links, error: linkErr } = await supabase
        .from("opportunity_persons")
        .select("person_id, opportunity_id")
        .eq("org_id", orgId)
        .in("person_id", ids);
    if (linkErr) throw new Error(linkErr.message);

    const oppIds = [...new Set((links ?? []).map((l) => String((l as { opportunity_id?: string }).opportunity_id ?? "")).filter(Boolean))];
    if (!oppIds.length) return out;

    let q = supabase
        .from("opportunities")
        .select("id, customer_id, location_id, name, title, status_key, created_at")
        .eq("org_id", orgId)
        .in("id", oppIds);
    q = applyRecordScopeConstraintsToQuery(q, scopeCons);
    const { data: opps, error: oppErr } = await q.order("created_at", { ascending: false });
    if (oppErr) throw new Error(oppErr.message);

    const oppById = new Map<string, OppRow>();
    for (const row of (opps ?? []) as OppRow[]) {
        oppById.set(String(row.id), row);
    }

    const locationIds = [...oppById.values()].map((o) => o.location_id).filter(Boolean) as string[];
    const locationLabels = await fetchLocationLabelsById(supabase, orgId, locationIds);

    const customerIds = [...oppById.values()].map((o) => o.customer_id).filter(Boolean) as string[];
    const customerNames = new Map<string, string>();
    if (customerIds.length) {
        const { data: customers } = await supabase
            .from("customers")
            .select("id, name")
            .eq("org_id", orgId)
            .in("id", customerIds);
        for (const c of customers ?? []) {
            const name = (c as { name?: string | null }).name?.trim();
            if (name) customerNames.set(String((c as { id: string }).id), name);
        }
    }

    for (const link of links ?? []) {
        const pid = String((link as { person_id?: string }).person_id ?? "");
        if (!pid || out.has(pid)) continue;
        const oppId = String((link as { opportunity_id?: string }).opportunity_id ?? "");
        const opp = oppById.get(oppId);
        if (!opp) continue;
        const cid = opp.customer_id != null ? String(opp.customer_id) : "";
        const statusKey = opp.status_key?.trim() || null;
        const locationId = opp.location_id != null ? String(opp.location_id) : null;
        out.set(pid, {
            customer_id: cid,
            customer_name: cid ? customerNames.get(cid) ?? null : null,
            opportunity_id: opp.id,
            opportunity_name: oppLabel(opp),
            opportunity_status_label: humanizeGlobalSearchStatusLabel(statusKey, oppStatusLabels),
            location_id: locationId,
            location_label: locationId ? locationLabels.get(locationId) ?? null : null,
        });
    }

    return out;
}
