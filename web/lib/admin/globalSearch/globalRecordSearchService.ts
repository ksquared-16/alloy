import type { SupabaseClient } from "@supabase/supabase-js";

import {
    applyRecordScopeConstraintsToQuery,
    fetchScopedCustomerIdsForRestrictedAdmin,
    fetchScopedPersonIdsForRestrictedAdmin,
    resolveRecordScopeConstraints,
    type AdminAccessScopeDimensions,
} from "@/lib/admin/accessScope";
import { CRM_ENTITY_SEARCH_UUID_RE, labelPersonRow, sanitizeCrmSearchToken } from "@/lib/admin/forms/crmEntitySearchShared";
import {
    LOCATION_DISPLAY_LABEL_SELECT,
    locationDisplayLabelFromRow,
    type LocationDisplayLabelRow,
} from "@/lib/admin/locationDisplayLabel";
import { personDrawerCrmDisplayLabel } from "@/lib/admin/person/personDrawerChildIdentity";
import {
    globalSearchPersonSecondaryContext,
    globalSearchPersonTypeLabel,
    personRowIsChildRelationship,
} from "@/lib/admin/globalSearch/globalRecordSearchPersonPresentation";
import {
    GLOBAL_RECORD_SEARCH_DEFAULT_LIMIT,
    GLOBAL_RECORD_SEARCH_PER_TYPE_CAP,
    type GlobalRecordSearchEntityType,
    type GlobalRecordSearchHit,
} from "@/lib/admin/globalSearch/globalRecordSearchTypes";
import { displayLabelsFromDefinitions, fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";

type SearchArgs = {
    supabase: SupabaseClient;
    orgId: string;
    accessDim: AdminAccessScopeDimensions;
    rawQ: string;
    limit?: number;
};

function clampLimit(n: number | undefined): number {
    const v = Number.isFinite(n) && n! > 0 ? Math.floor(n!) : GLOBAL_RECORD_SEARCH_DEFAULT_LIMIT;
    return Math.min(Math.max(v, 1), GLOBAL_RECORD_SEARCH_DEFAULT_LIMIT);
}

function filterByAllowedIds<T extends { id: string }>(rows: T[], allowed: string[] | null): T[] {
    if (allowed === null) return rows;
    const set = new Set(allowed);
    return rows.filter((r) => set.has(r.id));
}

function oppLabel(o: { name?: string | null; title?: string | null; id: string }): string {
    const t = (o.title ?? "").trim();
    const n = (o.name ?? "").trim();
    return t || n || `Opportunity ${o.id.slice(0, 8)}…`;
}

async function fetchLocationLabels(
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

async function searchPersons(
    supabase: SupabaseClient,
    orgId: string,
    accessDim: AdminAccessScopeDimensions,
    rawQ: string,
    token: string,
    perTypeCap: number,
    personStatusLabels: Map<string, string>
): Promise<GlobalRecordSearchHit[]> {
    const scopedPersonIds = await fetchScopedPersonIdsForRestrictedAdmin(supabase, orgId, accessDim);
    const sel = "id, first_name, last_name, full_name, email, phone, status_key";
    type PersonRow = {
        id: string;
        first_name?: string | null;
        last_name?: string | null;
        full_name?: string | null;
        email?: string | null;
        phone?: string | null;
        status_key?: string | null;
    };

    let rows: PersonRow[] = [];
    if (CRM_ENTITY_SEARCH_UUID_RE.test(rawQ)) {
        const { data, error } = await supabase
            .from("persons")
            .select(sel)
            .eq("org_id", orgId)
            .eq("id", rawQ)
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (data) rows = [data as PersonRow];
    } else {
        const pattern = `%${token}%`;
        const q = () => supabase.from("persons").select(sel).eq("org_id", orgId).limit(perTypeCap * 3);
        const [fn, sn, ln, em, ph] = await Promise.all([
            q().ilike("full_name", pattern),
            q().ilike("first_name", pattern),
            q().ilike("last_name", pattern),
            q().ilike("email", pattern),
            q().ilike("phone", pattern),
        ]);
        const err = fn.error ?? sn.error ?? ln.error ?? em.error ?? ph.error;
        if (err) throw new Error(err.message);
        const byId = new Map<string, PersonRow>();
        for (const batch of [fn.data, sn.data, ln.data, em.data, ph.data]) {
            for (const row of (batch ?? []) as PersonRow[]) {
                if (row?.id) byId.set(String(row.id), row);
            }
        }
        rows = [...byId.values()].sort((a, b) =>
            labelPersonRow(a).localeCompare(labelPersonRow(b), undefined, { sensitivity: "base" })
        );
    }

    rows = filterByAllowedIds(rows, scopedPersonIds).slice(0, perTypeCap);
    if (!rows.length) return [];

    const personIds = rows.map((r) => r.id);
    const [cmRes, cpRes] = await Promise.all([
        supabase
            .from("customer_members")
            .select("person_id, customer_id, relationship, site_id, status_key, is_active")
            .eq("org_id", orgId)
            .in("person_id", personIds),
        supabase
            .from("customer_persons")
            .select("person_id, customer_id, role_type, is_primary")
            .eq("org_id", orgId)
            .in("person_id", personIds),
    ]);
    if (cmRes.error) throw new Error(cmRes.error.message);
    if (cpRes.error) throw new Error(cpRes.error.message);

    const customerIds = new Set<string>();
    for (const row of cmRes.data ?? []) {
        const cid = (row as { customer_id?: string }).customer_id;
        if (cid) customerIds.add(String(cid));
    }
    for (const row of cpRes.data ?? []) {
        const cid = (row as { customer_id?: string }).customer_id;
        if (cid) customerIds.add(String(cid));
    }

    const siteIds = new Set<string>();
    for (const row of cmRes.data ?? []) {
        const sid = (row as { site_id?: string | null }).site_id;
        if (sid) siteIds.add(String(sid));
    }

    const [customerNameById, siteLabelById] = await Promise.all([
        (async () => {
            const map = new Map<string, string>();
            const ids = [...customerIds];
            if (!ids.length) return map;
            const { data } = await supabase.from("customers").select("id, name").eq("org_id", orgId).in("id", ids);
            for (const c of data ?? []) {
                const name = (c as { name?: string | null }).name?.trim();
                if (name) map.set(String((c as { id: string }).id), name);
            }
            return map;
        })(),
        fetchLocationLabels(supabase, orgId, [...siteIds]),
    ]);

    const membersByPerson = new Map<string, Array<{ relationship?: string | null; customer_id?: string; site_id?: string | null }>>();
    for (const row of cmRes.data ?? []) {
        const pid = String((row as { person_id?: string }).person_id ?? "");
        if (!pid) continue;
        const list = membersByPerson.get(pid) ?? [];
        list.push(row as { relationship?: string | null; customer_id?: string; site_id?: string | null });
        membersByPerson.set(pid, list);
    }

    const personsByPerson = new Map<string, Array<{ role_type?: string | null; customer_id?: string; is_primary?: boolean | null }>>();
    for (const row of cpRes.data ?? []) {
        const pid = String((row as { person_id?: string }).person_id ?? "");
        if (!pid) continue;
        const list = personsByPerson.get(pid) ?? [];
        list.push(row as { role_type?: string | null; customer_id?: string; is_primary?: boolean | null });
        personsByPerson.set(pid, list);
    }

    return rows.map((p) => {
        const members = membersByPerson.get(p.id) ?? [];
        const customerPersons = personsByPerson.get(p.id) ?? [];
        const childMember =
            members.find((m) => personRowIsChildRelationship(m.relationship)) ??
            members[0] ??
            null;
        const isChild = members.some((m) => personRowIsChildRelationship(m.relationship));
        const primaryCp =
            customerPersons.find((cp) => cp.is_primary) ??
            customerPersons[0] ??
            null;
        const householdId = childMember?.customer_id ?? primaryCp?.customer_id ?? null;
        const householdName = householdId ? customerNameById.get(String(householdId)) ?? null : null;
        const siteLabel =
            childMember?.site_id != null ? siteLabelById.get(String(childMember.site_id)) ?? null : null;

        const type_label = globalSearchPersonTypeLabel({
            person_id: p.id,
            customer_members: members.map((m) => ({ relationship: m.relationship })),
            customer_persons: customerPersons.map((cp) => ({ role_type: cp.role_type })),
        });

        const statusKey = p.status_key?.trim() || null;
        const status_label = statusKey ? personStatusLabels.get(statusKey) ?? statusKey : null;

        return {
            entity_type: "persons" as const,
            entity_id: p.id,
            name: labelPersonRow(p),
            type_label,
            secondary_context: globalSearchPersonSecondaryContext({
                isChild,
                siteLabel,
                householdName,
            }),
            status_label,
        };
    });
}

async function searchOpportunities(
    supabase: SupabaseClient,
    orgId: string,
    accessDim: AdminAccessScopeDimensions,
    rawQ: string,
    token: string,
    perTypeCap: number,
    oppStatusLabels: Map<string, string>
): Promise<GlobalRecordSearchHit[]> {
    const scopeCons = await resolveRecordScopeConstraints(supabase, orgId, accessDim);
    if (scopeCons.impossible) return [];

    const sel =
        "id, name, title, customer_id, location_id, status_key, opportunity_number, created_at";
    type OppRow = {
        id: string;
        name?: string | null;
        title?: string | null;
        customer_id?: string | null;
        location_id?: string | null;
        status_key?: string | null;
    };

    let rows: OppRow[] = [];
    if (CRM_ENTITY_SEARCH_UUID_RE.test(rawQ)) {
        let q = supabase.from("opportunities").select(sel).eq("org_id", orgId).eq("id", rawQ);
        q = applyRecordScopeConstraintsToQuery(q, scopeCons);
        const { data, error } = await q.maybeSingle();
        if (error) throw new Error(error.message);
        if (data) rows = [data as OppRow];
    } else {
        const pattern = `%${token}%`;
        let q = supabase.from("opportunities").select(sel).eq("org_id", orgId);
        q = applyRecordScopeConstraintsToQuery(q, scopeCons);
        const { data, error } = await q
            .or(`name.ilike.${pattern},title.ilike.${pattern}`)
            .order("created_at", { ascending: false })
            .limit(perTypeCap);
        if (error) throw new Error(error.message);
        rows = (data ?? []) as OppRow[];
    }

    if (!rows.length) return [];

    const locationIds = rows.map((r) => r.location_id).filter(Boolean) as string[];
    const locationLabels = await fetchLocationLabels(supabase, orgId, locationIds);

    return rows.map((o) => {
        const statusKey = o.status_key?.trim() || null;
        const rawStatus = statusKey ? oppStatusLabels.get(statusKey) ?? statusKey : null;
        return {
            entity_type: "opportunities" as const,
            entity_id: o.id,
            name: personDrawerCrmDisplayLabel(oppLabel(o)) ?? oppLabel(o),
            type_label: "Lead",
            secondary_context: o.location_id ? locationLabels.get(String(o.location_id)) ?? null : null,
            status_label: rawStatus ? personDrawerCrmDisplayLabel(rawStatus) ?? rawStatus : null,
        };
    });
}

async function searchCustomers(
    supabase: SupabaseClient,
    orgId: string,
    accessDim: AdminAccessScopeDimensions,
    rawQ: string,
    token: string,
    perTypeCap: number,
    customerStatusLabels: Map<string, string>
): Promise<GlobalRecordSearchHit[]> {
    const scopedCustomerIds = await fetchScopedCustomerIdsForRestrictedAdmin(supabase, orgId, accessDim);
    const sel = "id, name, customer_number, status_key, primary_contact_id";
    type CustomerRow = {
        id: string;
        name?: string | null;
        customer_number?: number | null;
        status_key?: string | null;
        primary_contact_id?: string | null;
    };

    let rows: CustomerRow[] = [];
    if (CRM_ENTITY_SEARCH_UUID_RE.test(rawQ)) {
        const { data, error } = await supabase
            .from("customers")
            .select(sel)
            .eq("org_id", orgId)
            .eq("id", rawQ)
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (data) rows = [data as CustomerRow];
    } else {
        const pattern = `%${token}%`;
        const { data, error } = await supabase
            .from("customers")
            .select(sel)
            .eq("org_id", orgId)
            .ilike("name", pattern)
            .order("name", { ascending: true })
            .limit(perTypeCap * 2);
        if (error) throw new Error(error.message);
        rows = (data ?? []) as CustomerRow[];
    }

    rows = filterByAllowedIds(rows, scopedCustomerIds).slice(0, perTypeCap);
    if (!rows.length) return [];

    const contactIds = rows.map((r) => r.primary_contact_id).filter(Boolean) as string[];
    const contactNameById = new Map<string, string>();
    if (contactIds.length) {
        const { data: contacts } = await supabase
            .from("contacts")
            .select("id, first_name, last_name, person_id")
            .eq("org_id", orgId)
            .in("id", contactIds);
        const personIds = (contacts ?? [])
            .map((c) => (c as { person_id?: string | null }).person_id)
            .filter(Boolean) as string[];
        const personNameById = new Map<string, string>();
        if (personIds.length) {
            const { data: persons } = await supabase
                .from("persons")
                .select("id, first_name, last_name, full_name")
                .eq("org_id", orgId)
                .in("id", personIds);
            for (const p of persons ?? []) {
                personNameById.set(String((p as { id: string }).id), labelPersonRow(p as Parameters<typeof labelPersonRow>[0]));
            }
        }
        for (const c of contacts ?? []) {
            const cid = String((c as { id: string }).id);
            const pid = (c as { person_id?: string | null }).person_id;
            const fromPerson = pid ? personNameById.get(String(pid)) : null;
            const fromContact = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
            const label = fromPerson || fromContact || null;
            if (label) contactNameById.set(cid, label);
        }
    }

    return rows.map((c) => {
        const label = (c.name && String(c.name).trim()) || `Customer ${c.id.slice(0, 8)}…`;
        const statusKey = (c.status_key ?? "").trim() || null;
        return {
            entity_type: "customers" as const,
            entity_id: c.id,
            name: label,
            type_label: "Household",
            secondary_context:
                c.primary_contact_id ?
                    contactNameById.get(String(c.primary_contact_id)) ??
                    (c.customer_number != null ? `Account #${c.customer_number}` : null)
                :   c.customer_number != null ?
                    `Account #${c.customer_number}`
                :   null,
            status_label: statusKey ? customerStatusLabels.get(statusKey) ?? statusKey : null,
        };
    });
}

async function searchLocations(
    supabase: SupabaseClient,
    orgId: string,
    accessDim: AdminAccessScopeDimensions,
    rawQ: string,
    token: string,
    perTypeCap: number
): Promise<GlobalRecordSearchHit[]> {
    let allowedSiteIds: string[] | null = null;
    if (accessDim.siteScope === "restricted" && accessDim.allowedSiteLocationIds?.length) {
        allowedSiteIds = [...accessDim.allowedSiteLocationIds];
    }

    const sel = "id, label, address1, city, postal_code, location_type, is_active";
    type LocRow = {
        id: string;
        label?: string | null;
        address1?: string | null;
        city?: string | null;
        postal_code?: string | null;
        location_type?: string | null;
        is_active?: boolean | null;
    };

    let rows: LocRow[] = [];
    if (CRM_ENTITY_SEARCH_UUID_RE.test(rawQ)) {
        const { data, error } = await supabase
            .from("locations")
            .select(sel)
            .eq("org_id", orgId)
            .eq("id", rawQ)
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (data) rows = [data as LocRow];
    } else {
        const pattern = `%${token}%`;
        let q = supabase
            .from("locations")
            .select(sel)
            .eq("org_id", orgId)
            .eq("location_type", "site")
            .or("is_active.is.null,is_active.eq.true")
            .ilike("label", pattern)
            .order("label", { ascending: true })
            .limit(perTypeCap * 2);
        if (allowedSiteIds?.length) {
            q = q.in("id", allowedSiteIds);
        }
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        rows = (data ?? []) as LocRow[];
    }

    if (allowedSiteIds?.length) {
        const allow = new Set(allowedSiteIds);
        rows = rows.filter((r) => allow.has(r.id));
    }

    rows = rows.slice(0, perTypeCap);
    return rows.map((loc) => {
        const name = locationDisplayLabelFromRow(loc) ?? `Location ${loc.id.slice(0, 8)}…`;
        const city = loc.city?.trim();
        const typeLabel = loc.location_type === "site" ? "Campus" : "Location";
        return {
            entity_type: "locations" as const,
            entity_id: loc.id,
            name,
            type_label: typeLabel,
            secondary_context: city || loc.address1?.trim() || null,
            status_label: loc.is_active === false ? "Inactive" : "Active",
        };
    });
}

function mergeGlobalSearchHits(
    buckets: Record<GlobalRecordSearchEntityType, GlobalRecordSearchHit[]>,
    limit: number
): GlobalRecordSearchHit[] {
    const order: GlobalRecordSearchEntityType[] = ["persons", "opportunities", "customers", "locations"];
    const out: GlobalRecordSearchHit[] = [];
    for (const kind of order) {
        for (const hit of buckets[kind] ?? []) {
            if (out.length >= limit) return out;
            out.push(hit);
        }
    }
    return out;
}

/** Org-scoped deterministic record lookup for AdminV2 global search (Phase 1). */
export async function runGlobalRecordSearch(args: SearchArgs): Promise<{ q: string; results: GlobalRecordSearchHit[] }> {
    const rawQ = args.rawQ.trim();
    const token = sanitizeCrmSearchToken(rawQ);
    const limit = clampLimit(args.limit);
    const perTypeCap = Math.min(GLOBAL_RECORD_SEARCH_PER_TYPE_CAP, limit);

    const [personDefs, oppDefs, customerDefs] = await Promise.all([
        fetchEffectiveStatusDefinitions(args.supabase, args.orgId, "persons", { activeOnly: true }),
        fetchEffectiveStatusDefinitions(args.supabase, args.orgId, "opportunities", { activeOnly: true }),
        fetchEffectiveStatusDefinitions(args.supabase, args.orgId, "customers", { activeOnly: true }),
    ]);
    const personStatusLabels = new Map(Object.entries(displayLabelsFromDefinitions(personDefs)));
    const oppStatusLabels = new Map(Object.entries(displayLabelsFromDefinitions(oppDefs)));
    const customerStatusLabels = new Map(Object.entries(displayLabelsFromDefinitions(customerDefs)));

    const [persons, opportunities, customers, locations] = await Promise.all([
        searchPersons(args.supabase, args.orgId, args.accessDim, rawQ, token, perTypeCap, personStatusLabels),
        searchOpportunities(args.supabase, args.orgId, args.accessDim, rawQ, token, perTypeCap, oppStatusLabels),
        searchCustomers(args.supabase, args.orgId, args.accessDim, rawQ, token, perTypeCap, customerStatusLabels),
        searchLocations(args.supabase, args.orgId, args.accessDim, rawQ, token, perTypeCap),
    ]);

    const results = mergeGlobalSearchHits(
        { persons, opportunities, customers, locations },
        limit
    );

    return { q: rawQ, results };
}
