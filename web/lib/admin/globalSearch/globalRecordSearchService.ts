import type { SupabaseClient } from "@supabase/supabase-js";

import {
    applyRecordScopeConstraintsToQuery,
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
import {
    fetchCustomerEnrollmentContextByCustomerIds,
    fetchPersonDirectOpportunityContext,
    type CustomerEnrollmentContext,
} from "@/lib/admin/globalSearch/globalRecordSearchLocationContext";
import { applyGlobalSearchClusterDisplayLimits } from "@/lib/admin/globalSearch/globalRecordSearchClusterLimits";
import { buildGlobalSearchFamilyClusters } from "@/lib/admin/globalSearch/globalRecordSearchClustering";
import {
    expandGlobalSearchChildMemberRows,
    fetchGlobalSearchChildMembersByCustomerIds,
    globalSearchCollectHouseholdCustomerIds,
    type GlobalSearchChildMemberRow,
} from "@/lib/admin/globalSearch/globalRecordSearchHouseholdChildren";
import { assembleGlobalSearchHit } from "@/lib/admin/globalSearch/globalRecordSearchHitAssembly";
import { globalSearchAgeLabelFromDob } from "@/lib/admin/globalSearch/globalRecordSearchAgeLabel";
import { globalSearchPersonTypeLabel } from "@/lib/admin/globalSearch/globalRecordSearchPersonPresentation";
import { personRowIsChildRelationship } from "@/lib/admin/globalSearch/globalRecordSearchPersonPresentation";
import { globalSearchRecordAllowedBySiteScope } from "@/lib/admin/globalSearch/globalRecordSearchScope";
import {
    GLOBAL_RECORD_SEARCH_DEFAULT_LIMIT,
    GLOBAL_RECORD_SEARCH_GROUP_LABELS,
    GLOBAL_RECORD_SEARCH_GROUP_ORDER,
    GLOBAL_RECORD_SEARCH_PER_GROUP_CAP,
    GLOBAL_SEARCH_CHILD_MEMBER_FETCH_CAP,
    type GlobalRecordSearchCluster,
    type GlobalRecordSearchGroup,
    type GlobalRecordSearchGroupKey,
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

function memberDisplayName(m: {
    display_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    id: string;
}): string {
    const dn = (m.display_name ?? "").trim();
    if (dn) return dn;
    const parts = [m.first_name, m.last_name].filter(Boolean).join(" ").trim();
    return parts || `Child ${m.id.slice(0, 8)}…`;
}

async function resolveChildAgeLabelsByMemberId(
    supabase: SupabaseClient,
    orgId: string,
    rows: GlobalSearchChildMemberRow[]
): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    const personIds = [...new Set(rows.map((r) => String(r.person_id ?? "").trim()).filter(Boolean))];
    const personDobById = new Map<string, string | null>();

    if (personIds.length) {
        const { data, error } = await supabase
            .from("persons")
            .select("id, date_of_birth")
            .eq("org_id", orgId)
            .in("id", personIds);
        if (error) throw new Error(error.message);
        for (const row of data ?? []) {
            const id = String((row as { id?: string }).id ?? "");
            const dob = (row as { date_of_birth?: string | null }).date_of_birth ?? null;
            if (id) personDobById.set(id, dob != null ? String(dob) : null);
        }
    }

    for (const m of rows) {
        const personId = String(m.person_id ?? "").trim();
        const dob = personId ? personDobById.get(personId) ?? m.dob ?? null : m.dob ?? null;
        out.set(String(m.id), globalSearchAgeLabelFromDob(dob));
    }
    return out;
}

async function resolveChildPersonStatusKeyByPersonId(
    supabase: SupabaseClient,
    orgId: string,
    rows: GlobalSearchChildMemberRow[]
): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    const personIds = [...new Set(rows.map((r) => String(r.person_id ?? "").trim()).filter(Boolean))];
    if (!personIds.length) return out;

    const { data, error } = await supabase
        .from("persons")
        .select("id, status_key")
        .eq("org_id", orgId)
        .in("id", personIds);
    if (error) throw new Error(error.message);

    for (const row of data ?? []) {
        const id = String((row as { id?: string }).id ?? "");
        const sk = (row as { status_key?: string | null }).status_key ?? null;
        if (id) {
            out.set(id, sk != null && String(sk).trim() ? String(sk).trim() : null);
        }
    }
    return out;
}

async function buildChildHitsFromMemberRows(
    supabase: SupabaseClient,
    orgId: string,
    accessDim: AdminAccessScopeDimensions,
    rows: GlobalSearchChildMemberRow[],
    personStatusLabels: Map<string, string>,
    oppStatusLabels: Map<string, string>
): Promise<GlobalRecordSearchHit[]> {
    if (!rows.length) return [];

    const customerIds = rows.map((r) => r.customer_id);
    const [contextByCustomer, ageByMemberId, statusKeyByPersonId] = await Promise.all([
        fetchCustomerEnrollmentContextByCustomerIds(
            supabase,
            orgId,
            customerIds,
            accessDim,
            oppStatusLabels
        ),
        resolveChildAgeLabelsByMemberId(supabase, orgId, rows),
        resolveChildPersonStatusKeyByPersonId(supabase, orgId, rows),
    ]);

    const hits: GlobalRecordSearchHit[] = [];
    for (const m of rows) {
        const ctx = contextByCustomer.get(String(m.customer_id)) ?? null;
        const personId = m.person_id?.trim() || null;
        const statusKey = personId ? statusKeyByPersonId.get(personId) ?? null : null;
        const assembled = assembleGlobalSearchHit({
            entity_type: "customer_members",
            entity_id: m.id,
            group: "children",
            name: memberDisplayName(m),
            type_label: "Child",
            household_name: ctx?.customer_name ?? null,
            opportunity_name: ctx?.opportunity_name ?? null,
            status_key: statusKey,
            status_labels: personStatusLabels,
            location_label: ctx?.location_label ?? null,
            person_id: m.person_id ?? null,
            customer_id: String(m.customer_id),
            opportunity_id: ctx?.opportunity_id ?? null,
            age_label: ageByMemberId.get(String(m.id)) ?? null,
        });
        const hit = applySiteScopeToHit(assembled, accessDim, ctx?.location_id);
        if (hit) hits.push(hit);
    }
    return hits.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

async function searchChildrenDirectMemberRows(
    supabase: SupabaseClient,
    orgId: string,
    rawQ: string,
    token: string,
    fetchCap: number
): Promise<GlobalSearchChildMemberRow[]> {
    type MemberRow = GlobalSearchChildMemberRow;

    if (CRM_ENTITY_SEARCH_UUID_RE.test(rawQ)) {
        const { data, error } = await supabase
            .from("customer_members")
            .select("id, customer_id, person_id, display_name, first_name, last_name, relationship, dob")
            .eq("org_id", orgId)
            .eq("id", rawQ)
            .maybeSingle();
        if (error) throw new Error(error.message);
        return data && personRowIsChildRelationship((data as MemberRow).relationship) ? [data as MemberRow] : [];
    }

    const pattern = `%${token}%`;
    const q = () =>
        supabase
            .from("customer_members")
            .select("id, customer_id, person_id, display_name, first_name, last_name, relationship, dob")
            .eq("org_id", orgId)
            .limit(fetchCap);
    const [dn, fn, ln] = await Promise.all([
        q().ilike("display_name", pattern),
        q().ilike("first_name", pattern),
        q().ilike("last_name", pattern),
    ]);
    const err = dn.error ?? fn.error ?? ln.error;
    if (err) throw new Error(err.message);

    const byId = new Map<string, MemberRow>();
    for (const batch of [dn.data, fn.data, ln.data]) {
        for (const row of (batch ?? []) as MemberRow[]) {
            if (row?.id && personRowIsChildRelationship(row.relationship)) {
                byId.set(String(row.id), row);
            }
        }
    }
    return [...byId.values()];
}

function mergeContext(
    primary: CustomerEnrollmentContext | null | undefined,
    fallback: CustomerEnrollmentContext | null | undefined
): CustomerEnrollmentContext | null {
    if (primary?.location_id || primary?.opportunity_id) return primary ?? null;
    return fallback ?? primary ?? null;
}

function applySiteScopeToHit(
    hit: GlobalRecordSearchHit,
    accessDim: AdminAccessScopeDimensions,
    locationId: string | null | undefined
): GlobalRecordSearchHit | null {
    if (!globalSearchRecordAllowedBySiteScope(locationId, accessDim)) return null;
    return hit;
}

async function searchChildren(
    supabase: SupabaseClient,
    orgId: string,
    accessDim: AdminAccessScopeDimensions,
    rawQ: string,
    token: string,
    perGroupCap: number,
    personStatusLabels: Map<string, string>,
    oppStatusLabels: Map<string, string>,
    _seedCustomerIds: string[] = []
): Promise<GlobalRecordSearchHit[]> {
    const directRows = await searchChildrenDirectMemberRows(
        supabase,
        orgId,
        rawQ,
        token,
        GLOBAL_SEARCH_CHILD_MEMBER_FETCH_CAP
    );
    const expandedRows = await expandGlobalSearchChildMemberRows({
        supabase,
        orgId,
        token,
        directMatches: directRows,
        seedCustomerIds: _seedCustomerIds,
    });

    return buildChildHitsFromMemberRows(
        supabase,
        orgId,
        accessDim,
        expandedRows.slice(0, GLOBAL_SEARCH_CHILD_MEMBER_FETCH_CAP),
        personStatusLabels,
        oppStatusLabels
    );
}

async function supplementChildrenFromHouseholdSeeds(
    supabase: SupabaseClient,
    orgId: string,
    accessDim: AdminAccessScopeDimensions,
    existingChildren: GlobalRecordSearchHit[],
    seedHits: GlobalRecordSearchHit[],
    perGroupCap: number,
    personStatusLabels: Map<string, string>,
    oppStatusLabels: Map<string, string>
): Promise<GlobalRecordSearchHit[]> {
    const existingIds = new Set(existingChildren.map((h) => h.entity_id));
    const householdIds = globalSearchCollectHouseholdCustomerIds(seedHits);
    if (!householdIds.length) return existingChildren;

    const memberRows = await fetchGlobalSearchChildMembersByCustomerIds(supabase, orgId, householdIds);
    const missingRows = memberRows.filter((row) => !existingIds.has(String(row.id)));
    if (!missingRows.length) return existingChildren;

    const supplementalHits = await buildChildHitsFromMemberRows(
        supabase,
        orgId,
        accessDim,
        missingRows,
        personStatusLabels,
        oppStatusLabels
    );

    const merged = [...existingChildren, ...supplementalHits].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
    return merged.slice(0, GLOBAL_SEARCH_CHILD_MEMBER_FETCH_CAP);
}

async function searchParents(
    supabase: SupabaseClient,
    orgId: string,
    accessDim: AdminAccessScopeDimensions,
    rawQ: string,
    token: string,
    perGroupCap: number,
    personStatusLabels: Map<string, string>,
    oppStatusLabels: Map<string, string>
): Promise<GlobalRecordSearchHit[]> {
    const scopedPersonIds = await fetchScopedPersonIdsForRestrictedAdmin(supabase, orgId, accessDim);
    const sel = "id, first_name, last_name, full_name, email, phone, status_key";
    type PersonRow = {
        id: string;
        first_name?: string | null;
        last_name?: string | null;
        full_name?: string | null;
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
        const q = () => supabase.from("persons").select(sel).eq("org_id", orgId).limit(perGroupCap * 4);
        const [fn, sn, ln] = await Promise.all([
            q().ilike("full_name", pattern),
            q().ilike("first_name", pattern),
            q().ilike("last_name", pattern),
        ]);
        const err = fn.error ?? sn.error ?? ln.error;
        if (err) throw new Error(err.message);
        const byId = new Map<string, PersonRow>();
        for (const batch of [fn.data, sn.data, ln.data]) {
            for (const row of (batch ?? []) as PersonRow[]) {
                if (row?.id) byId.set(String(row.id), row);
            }
        }
        rows = [...byId.values()].sort((a, b) =>
            labelPersonRow(a).localeCompare(labelPersonRow(b), undefined, { sensitivity: "base" })
        );
    }

    rows = filterByAllowedIds(rows, scopedPersonIds).slice(0, perGroupCap);
    if (!rows.length) return [];

    const personIds = rows.map((r) => r.id);
    const [cpRes, cmChildRes] = await Promise.all([
        supabase
            .from("customer_persons")
            .select("person_id, customer_id, role_type, is_primary")
            .eq("org_id", orgId)
            .in("person_id", personIds),
        supabase
            .from("customer_members")
            .select("person_id, relationship")
            .eq("org_id", orgId)
            .in("person_id", personIds),
    ]);
    if (cpRes.error) throw new Error(cpRes.error.message);
    if (cmChildRes.error) throw new Error(cmChildRes.error.message);

    const childOnlyPersonIds = new Set<string>();
    const adultPersonIds = new Set<string>();
    for (const row of cmChildRes.data ?? []) {
        const pid = String((row as { person_id?: string }).person_id ?? "");
        if (!pid) continue;
        if (personRowIsChildRelationship((row as { relationship?: string }).relationship)) {
            childOnlyPersonIds.add(pid);
        }
    }
    for (const row of cpRes.data ?? []) {
        const pid = String((row as { person_id?: string }).person_id ?? "");
        if (pid) adultPersonIds.add(pid);
    }

    rows = rows.filter((p) => adultPersonIds.has(p.id) || !childOnlyPersonIds.has(p.id));
    if (!rows.length) return [];

    const customerIds = [...new Set((cpRes.data ?? []).map((r) => String((r as { customer_id?: string }).customer_id ?? "")).filter(Boolean))];
    const [contextByCustomer, contextByPerson] = await Promise.all([
        fetchCustomerEnrollmentContextByCustomerIds(supabase, orgId, customerIds, accessDim, oppStatusLabels),
        fetchPersonDirectOpportunityContext(supabase, orgId, personIds, accessDim, oppStatusLabels),
    ]);

    const cpByPerson = new Map<string, Array<{ customer_id?: string; role_type?: string | null }>>();
    for (const row of cpRes.data ?? []) {
        const pid = String((row as { person_id?: string }).person_id ?? "");
        if (!pid) continue;
        const list = cpByPerson.get(pid) ?? [];
        list.push(row as { customer_id?: string; role_type?: string | null });
        cpByPerson.set(pid, list);
    }

    const hits: GlobalRecordSearchHit[] = [];
    for (const p of rows.slice(0, perGroupCap)) {
        const customerPersons = cpByPerson.get(p.id) ?? [];
        const primaryCp = customerPersons.find((cp) => (cp as { is_primary?: boolean }).is_primary) ?? customerPersons[0];
        const customerId = primaryCp?.customer_id != null ? String(primaryCp.customer_id) : null;
        const ctx = mergeContext(
            customerId ? contextByCustomer.get(customerId) : null,
            contextByPerson.get(p.id)
        );
        const type_label = globalSearchPersonTypeLabel({
            person_id: p.id,
            customer_persons: customerPersons.map((cp) => ({ role_type: cp.role_type })),
        });
        const statusKey = p.status_key?.trim() || null;
        const assembled = assembleGlobalSearchHit({
            entity_type: "persons",
            entity_id: p.id,
            group: "parents",
            name: labelPersonRow(p),
            type_label,
            household_name: ctx?.customer_name ?? null,
            opportunity_name: ctx?.opportunity_name ?? null,
            status_key: statusKey,
            status_labels: personStatusLabels,
            fallback_status_label: ctx?.opportunity_status_label ?? null,
            location_label: ctx?.location_label ?? null,
            person_id: p.id,
            customer_id: customerId,
            opportunity_id: ctx?.opportunity_id ?? null,
        });
        const hit = applySiteScopeToHit(assembled, accessDim, ctx?.location_id);
        if (hit) hits.push(hit);
    }
    return hits;
}

async function searchLeads(
    supabase: SupabaseClient,
    orgId: string,
    accessDim: AdminAccessScopeDimensions,
    rawQ: string,
    token: string,
    perGroupCap: number,
    oppStatusLabels: Map<string, string>
): Promise<GlobalRecordSearchHit[]> {
    const scopeCons = await resolveRecordScopeConstraints(supabase, orgId, accessDim);
    if (scopeCons.impossible) return [];

    const sel = "id, name, title, customer_id, location_id, status_key, created_at";
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
            .limit(perGroupCap);
        if (error) throw new Error(error.message);
        rows = (data ?? []) as OppRow[];
    }

    if (!rows.length) return [];

    const customerIds = rows.map((r) => r.customer_id).filter(Boolean) as string[];
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

    const locationIds = rows.map((r) => r.location_id).filter(Boolean) as string[];
    const locationLabels = new Map<string, string>();
    if (locationIds.length) {
        const { data: locs } = await supabase
            .from("locations")
            .select(LOCATION_DISPLAY_LABEL_SELECT)
            .eq("org_id", orgId)
            .in("id", locationIds);
        for (const row of (locs ?? []) as Array<{ id: string } & LocationDisplayLabelRow>) {
            const label = locationDisplayLabelFromRow(row);
            if (label) locationLabels.set(String(row.id), label);
        }
    }

    const hits: GlobalRecordSearchHit[] = [];
    for (const o of rows) {
        const t = (o.title ?? "").trim();
        const n = (o.name ?? "").trim();
        const label = t || n || `Opportunity ${o.id.slice(0, 8)}…`;
        const statusKey = o.status_key?.trim() || null;
        const locationId = o.location_id != null ? String(o.location_id) : null;
        const cid = o.customer_id != null ? String(o.customer_id) : null;
        const assembled = assembleGlobalSearchHit({
            entity_type: "opportunities",
            entity_id: o.id,
            group: "leads",
            name: label,
            type_label: "Lead",
            household_name: cid ? customerNames.get(cid) ?? null : null,
            opportunity_name: label,
            status_key: statusKey,
            status_labels: oppStatusLabels,
            location_label: locationId ? locationLabels.get(locationId) ?? null : null,
            customer_id: cid,
            opportunity_id: o.id,
        });
        const hit = applySiteScopeToHit(assembled, accessDim, locationId);
        if (hit) hits.push(hit);
    }
    return hits;
}

async function searchLocations(
    supabase: SupabaseClient,
    orgId: string,
    accessDim: AdminAccessScopeDimensions,
    rawQ: string,
    token: string,
    perGroupCap: number
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
            .limit(perGroupCap * 2);
        if (allowedSiteIds?.length) q = q.in("id", allowedSiteIds);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        rows = (data ?? []) as LocRow[];
    }

    if (allowedSiteIds?.length) {
        const allow = new Set(allowedSiteIds);
        rows = rows.filter((r) => allow.has(r.id));
    }

    return rows.slice(0, perGroupCap).map((loc) => {
        const locLabel = locationDisplayLabelFromRow(loc) ?? `Location ${loc.id.slice(0, 8)}…`;
        return assembleGlobalSearchHit({
            entity_type: "locations",
            entity_id: loc.id,
            group: "locations",
            name: locLabel,
            type_label: "Campus",
            location_label: locLabel,
            status_key: loc.is_active === false ? "inactive" : "active",
            status_labels: new Map([
                ["active", "Active"],
                ["inactive", "Inactive"],
            ]),
        });
    });
}

function buildGroups(buckets: Record<GlobalRecordSearchGroupKey, GlobalRecordSearchHit[]>, limit: number): GlobalRecordSearchGroup[] {
    const groups: GlobalRecordSearchGroup[] = [];
    let remaining = limit;
    for (const key of GLOBAL_RECORD_SEARCH_GROUP_ORDER) {
        if (remaining <= 0) break;
        const hits = (buckets[key] ?? []).slice(0, remaining);
        if (!hits.length) continue;
        groups.push({ key, label: GLOBAL_RECORD_SEARCH_GROUP_LABELS[key], hits });
        remaining -= hits.length;
    }
    return groups;
}

/** Org-scoped deterministic record lookup for AdminV2 global search (Phase 1). */
export async function runGlobalRecordSearch(args: SearchArgs): Promise<{
    q: string;
    groups: GlobalRecordSearchGroup[];
    clusters: GlobalRecordSearchCluster[];
    results: GlobalRecordSearchHit[];
}> {
    const rawQ = args.rawQ.trim();
    const token = sanitizeCrmSearchToken(rawQ);
    const limit = clampLimit(args.limit);
    const perGroupCap = Math.min(GLOBAL_RECORD_SEARCH_PER_GROUP_CAP, limit);

    const [personDefs, oppDefs] = await Promise.all([
        fetchEffectiveStatusDefinitions(args.supabase, args.orgId, "persons", { activeOnly: true }),
        fetchEffectiveStatusDefinitions(args.supabase, args.orgId, "opportunities", { activeOnly: true }),
    ]);
    const personStatusLabels = new Map(Object.entries(displayLabelsFromDefinitions(personDefs)));
    const oppStatusLabels = new Map(Object.entries(displayLabelsFromDefinitions(oppDefs)));

    const [childrenRaw, parents, leads, locations] = await Promise.all([
        searchChildren(args.supabase, args.orgId, args.accessDim, rawQ, token, perGroupCap, personStatusLabels, oppStatusLabels),
        searchParents(args.supabase, args.orgId, args.accessDim, rawQ, token, perGroupCap, personStatusLabels, oppStatusLabels),
        searchLeads(args.supabase, args.orgId, args.accessDim, rawQ, token, perGroupCap, oppStatusLabels),
        searchLocations(args.supabase, args.orgId, args.accessDim, rawQ, token, perGroupCap),
    ]);

    let children = await supplementChildrenFromHouseholdSeeds(
        args.supabase,
        args.orgId,
        args.accessDim,
        childrenRaw,
        [...parents, ...leads],
        perGroupCap,
        personStatusLabels,
        oppStatusLabels
    );

    const allHits = [...children, ...parents, ...leads, ...locations];
    const clusters = applyGlobalSearchClusterDisplayLimits(buildGlobalSearchFamilyClusters(allHits));
    const groups = buildGroups({ children, parents, leads, locations }, limit);
    const clusterHits = clusters.flatMap((c) => [...c.anchors, ...c.children, ...c.parents]);
    const results = [...clusterHits, ...locations];

    return { q: rawQ, groups, clusters, results };
}
