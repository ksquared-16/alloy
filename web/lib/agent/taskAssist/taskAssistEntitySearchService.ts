import type { SupabaseClient } from "@supabase/supabase-js";

import {
    accessScopeRestrictsData,
    applyRecordScopeConstraintsToQuery,
    recordReadableWithoutDeptSiteLinkage,
    resolveRecordScopeConstraints,
    type AdminAccessScopeDimensions,
    type RecordScopeConstraints,
} from "@/lib/admin/accessScope";
import {
    LOCATION_DISPLAY_LABEL_SELECT,
    locationDisplayLabelFromRow,
    type LocationDisplayLabelRow,
} from "@/lib/admin/locationDisplayLabel";
import { resolveQueueRecordScopeConstraints } from "@/lib/admin/resolveQueueRecordScopeConstraints";
import {
    CRM_ENTITY_SEARCH_UUID_RE,
    sanitizeCrmSearchToken,
} from "@/lib/admin/forms/crmEntitySearchShared";
import {
    dedupeTaskAssistEntitySearchCandidates,
    mergeTaskAssistEntitySearchCandidates,
} from "@/lib/agent/taskAssist/taskAssistEntitySearchDedupe";
import {
    buildTaskAssistEntitySearchVariants,
    primaryTaskAssistEntitySearchToken,
} from "@/lib/agent/taskAssist/taskAssistEntitySearchVariants";
import type {
    TaskAssistEntitySearchCandidate,
    TaskAssistEntitySearchConfidence,
    TaskAssistEntitySearchSource,
} from "@/lib/agent/taskAssist/taskAssistEntitySearchTypes";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 20;
const MAX_VARIANTS = 6;

type OppRow = {
    id: string;
    name?: string | null;
    title?: string | null;
    customer_id?: string | null;
    work_unit_id?: string | null;
    location_id?: string | null;
    opportunity_number?: number | string | null;
    primary_person_id?: string | null;
    primary_contact_id?: string | null;
};

const OPP_SELECT =
    "id, name, title, customer_id, work_unit_id, location_id, opportunity_number, primary_person_id, primary_contact_id";

function clampLimit(n: number | undefined): number {
    const v = Number.isFinite(n) && n! > 0 ? Math.floor(n!) : DEFAULT_LIMIT;
    return Math.min(Math.max(v, 1), MAX_LIMIT);
}

function oppLabel(o: OppRow): string {
    const t = (o.title ?? "").trim();
    const n = (o.name ?? "").trim();
    return t || n || `Opportunity ${o.id.slice(0, 8)}…`;
}

function ilikePattern(token: string): string {
    return `%${token}%`;
}

function confidenceForMatch(exactUuid: boolean, tokenLen: number, field: "name" | "customer" | "person"): TaskAssistEntitySearchConfidence {
    if (exactUuid) return "high";
    if (field === "name" && tokenLen >= 4) return "medium";
    if (field === "person" && tokenLen >= 3) return "medium";
    return "low";
}

function buildCandidate(
    o: OppRow,
    source: TaskAssistEntitySearchSource,
    matched: string[],
    conf: TaskAssistEntitySearchConfidence,
    customerName: string | null,
    subtitleExtra?: string | null,
    locationName?: string | null
): TaskAssistEntitySearchCandidate {
    const rawNum = o.opportunity_number;
    const n = rawNum != null && rawNum !== "" ? Number(rawNum) : null;
    const subtitleParts = [
        locationName ? `Location: ${locationName}` : null,
        customerName ? `Customer: ${customerName}` : null,
        subtitleExtra,
    ].filter(Boolean);
    return {
        entity_type: "opportunities",
        entity_id: o.id,
        label: oppLabel(o),
        subtitle: subtitleParts.length ? subtitleParts.join(" · ") : null,
        confidence: conf,
        source,
        matched_fields: matched,
        disambiguation: {
            customer_name: customerName,
            opportunity_number: n != null && Number.isFinite(n) ? n : null,
            location_name: locationName ?? null,
        },
    };
}

async function resolveEntitySearchScope(
    supabase: SupabaseClient,
    orgId: string,
    dim: AdminAccessScopeDimensions,
    workspaceSiteId: string | null | undefined
): Promise<{ impossible: boolean; constraints: RecordScopeConstraints | null }> {
    const siteId = workspaceSiteId?.trim() || null;
    if (siteId) {
        const scoped = await resolveQueueRecordScopeConstraints(supabase, orgId, dim, siteId);
        return { impossible: scoped.recordScopeImpossible, constraints: scoped.recordScopeConstraints };
    }
    const c = await resolveRecordScopeConstraints(supabase, orgId, dim);
    if (c.impossible) return { impossible: true, constraints: null };
    return { impossible: false, constraints: c };
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

async function fetchOpportunitiesByNamePattern(
    supabase: SupabaseClient,
    orgId: string,
    scopeCons: RecordScopeConstraints,
    pattern: string,
    limit: number
): Promise<OppRow[]> {
    let q = supabase.from("opportunities").select(OPP_SELECT).eq("org_id", orgId);
    q = applyRecordScopeConstraintsToQuery(q, scopeCons);
    const orExpr = `name.ilike.${pattern},title.ilike.${pattern}`;
    const { data, error } = await q.or(orExpr).order("created_at", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as OppRow[];
}

async function fetchOpportunityByUuid(
    supabase: SupabaseClient,
    orgId: string,
    scopeCons: RecordScopeConstraints,
    id: string
): Promise<OppRow | null> {
    let q = supabase
        .from("opportunities")
        .select(OPP_SELECT)
        .eq("org_id", orgId)
        .eq("id", id);
    q = applyRecordScopeConstraintsToQuery(q, scopeCons);
    const { data, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    return (data as OppRow | null) ?? null;
}

async function fetchOpportunitiesForCustomerIds(
    supabase: SupabaseClient,
    orgId: string,
    scopeCons: RecordScopeConstraints,
    customerIds: string[],
    perCustomer: number,
    totalCap: number
): Promise<OppRow[]> {
    if (!customerIds.length) return [];

    const out: OppRow[] = [];
    for (const cid of customerIds) {
        let q = supabase
            .from("opportunities")
            .select(OPP_SELECT)
            .eq("org_id", orgId)
            .eq("customer_id", cid);
        q = applyRecordScopeConstraintsToQuery(q, scopeCons);
        const { data, error } = await q.order("created_at", { ascending: false }).limit(perCustomer);
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as OppRow[]) {
            out.push(row);
            if (out.length >= totalCap) return out;
        }
    }
    return out;
}

async function fetchOpportunitiesByPrimaryPersonIds(
    supabase: SupabaseClient,
    orgId: string,
    scopeCons: RecordScopeConstraints,
    personIds: string[],
    limit: number
): Promise<OppRow[]> {
    if (!personIds.length) return [];

    let q = supabase
        .from("opportunities")
        .select(OPP_SELECT)
        .eq("org_id", orgId)
        .in("primary_person_id", personIds);
    q = applyRecordScopeConstraintsToQuery(q, scopeCons);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as OppRow[];
}

async function fetchOpportunitiesByPrimaryContactIds(
    supabase: SupabaseClient,
    orgId: string,
    scopeCons: RecordScopeConstraints,
    contactIds: string[],
    limit: number
): Promise<OppRow[]> {
    if (!contactIds.length) return [];

    let q = supabase
        .from("opportunities")
        .select(OPP_SELECT)
        .eq("org_id", orgId)
        .in("primary_contact_id", contactIds);
    q = applyRecordScopeConstraintsToQuery(q, scopeCons);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as OppRow[];
}

async function fetchCustomerIdsByNamePatterns(
    supabase: SupabaseClient,
    orgId: string,
    variants: string[]
): Promise<Map<string, string | null>> {
    const byId = new Map<string, string | null>();
    for (const v of variants.slice(0, MAX_VARIANTS)) {
        const pattern = ilikePattern(v);
        const { data, error } = await supabase
            .from("customers")
            .select("id, name")
            .eq("org_id", orgId)
            .ilike("name", pattern)
            .order("created_at", { ascending: false })
            .limit(8);
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as { id: string; name?: string | null }[]) {
            if (!byId.has(row.id)) byId.set(row.id, (row.name ?? "").trim() || null);
        }
        if (byId.size >= 8) break;
    }
    return byId;
}

async function fetchPersonIdsByNamePatterns(
    supabase: SupabaseClient,
    orgId: string,
    variants: string[]
): Promise<Map<string, string>> {
    const byId = new Map<string, string>();
    for (const v of variants.slice(0, MAX_VARIANTS)) {
        const pattern = ilikePattern(v);
        const sel = "id, first_name, last_name, full_name";
        const q = () => supabase.from("persons").select(sel).eq("org_id", orgId).limit(8);
        const [fn, ln, full] = await Promise.all([
            q().ilike("first_name", pattern),
            q().ilike("last_name", pattern),
            q().ilike("full_name", pattern),
        ]);
        const err = fn.error ?? ln.error ?? full.error;
        if (err) throw new Error(err.message);
        for (const batch of [fn.data, ln.data, full.data]) {
            for (const row of (batch ?? []) as { id: string; first_name?: string | null; last_name?: string | null; full_name?: string | null }[]) {
                if (!row?.id || byId.has(row.id)) continue;
                const label =
                    (row.full_name ?? "").trim() ||
                    [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
                    row.id.slice(0, 8);
                byId.set(row.id, label);
            }
        }
        if (byId.size >= 8) break;
    }
    return byId;
}

async function fetchContactIdsByNamePatterns(
    supabase: SupabaseClient,
    orgId: string,
    variants: string[]
): Promise<Map<string, string>> {
    const byId = new Map<string, string>();
    for (const v of variants.slice(0, MAX_VARIANTS)) {
        const pattern = ilikePattern(v);
        const sel = "id, first_name, last_name";
        const q = () => supabase.from("contacts").select(sel).eq("org_id", orgId).limit(8);
        const [fn, ln] = await Promise.all([q().ilike("first_name", pattern), q().ilike("last_name", pattern)]);
        const err = fn.error ?? ln.error;
        if (err) throw new Error(err.message);
        for (const batch of [fn.data, ln.data]) {
            for (const row of (batch ?? []) as { id: string; first_name?: string | null; last_name?: string | null }[]) {
                if (!row?.id || byId.has(row.id)) continue;
                const label = [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.id.slice(0, 8);
                byId.set(row.id, label);
            }
        }
        if (byId.size >= 8) break;
    }
    return byId;
}

async function fetchCustomerIdsByMemberNamePatterns(
    supabase: SupabaseClient,
    orgId: string,
    variants: string[]
): Promise<Map<string, string>> {
    const byCustomer = new Map<string, string>();
    for (const v of variants.slice(0, MAX_VARIANTS)) {
        const pattern = ilikePattern(v);
        const sel = "customer_id, display_name, first_name, last_name";
        const q = () => supabase.from("customer_members").select(sel).eq("org_id", orgId).eq("is_active", true).limit(8);
        const [dn, fn, ln] = await Promise.all([
            q().ilike("display_name", pattern),
            q().ilike("first_name", pattern),
            q().ilike("last_name", pattern),
        ]);
        const err = dn.error ?? fn.error ?? ln.error;
        if (err) throw new Error(err.message);
        for (const batch of [dn.data, fn.data, ln.data]) {
            for (const row of (batch ?? []) as {
                customer_id: string;
                display_name?: string | null;
                first_name?: string | null;
                last_name?: string | null;
            }[]) {
                if (!row?.customer_id || byCustomer.has(row.customer_id)) continue;
                const label =
                    (row.display_name ?? "").trim() ||
                    [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
                    "household member";
                byCustomer.set(row.customer_id, label);
            }
        }
        if (byCustomer.size >= 8) break;
    }
    return byCustomer;
}

export type RunTaskAssistEntitySearchParams = {
    supabase: SupabaseClient;
    orgId: string;
    accessDim: AdminAccessScopeDimensions;
    rawQ: string;
    limit?: number;
    /** When true and scope is org-wide for dept+site, also match customers and map to their opportunities. */
    includeCustomers?: boolean;
    /** Header view-site filter — intersected with permission scope (same as queue APIs). */
    workspaceSiteId?: string | null;
};

export type RunTaskAssistEntitySearchResult = {
    q: string;
    /** Tokens attempted (for tests / diagnostics). */
    variants: string[];
    candidates: TaskAssistEntitySearchCandidate[];
};

/**
 * Org-scoped opportunity search with department/site constraints aligned to opportunities list routes.
 * Uses multi-variant matching so "Mitchell family" also finds "Mitchell household" and surname matches.
 */
export async function runTaskAssistEntitySearch(params: RunTaskAssistEntitySearchParams): Promise<RunTaskAssistEntitySearchResult> {
    const variants = buildTaskAssistEntitySearchVariants(params.rawQ);
    const primaryToken = primaryTaskAssistEntitySearchToken(params.rawQ);
    const limit = clampLimit(params.limit);
    const includeCustomers = params.includeCustomers !== false;
    const dim = params.accessDim;

    const scopeResolved = await resolveEntitySearchScope(
        params.supabase,
        params.orgId,
        dim,
        params.workspaceSiteId
    );
    if (scopeResolved.impossible || !scopeResolved.constraints) {
        return { q: primaryToken, variants, candidates: [] };
    }
    const scopeCons = scopeResolved.constraints;

    if (variants.length === 0 && !CRM_ENTITY_SEARCH_UUID_RE.test(params.rawQ.trim())) {
        return { q: sanitizeCrmSearchToken(params.rawQ), variants: [], candidates: [] };
    }

    const byId = new Map<string, TaskAssistEntitySearchCandidate>();
    const oppRowsById = new Map<string, OppRow>();

    const push = (c: TaskAssistEntitySearchCandidate, row?: OppRow) => {
        const id = String(c.entity_id).trim();
        if (!id) return;
        const prev = byId.get(id);
        byId.set(id, prev ? mergeTaskAssistEntitySearchCandidates(prev, c) : c);
        if (row) oppRowsById.set(id, row);
    };

    const remaining = () => Math.max(0, limit - byId.size);

    if (CRM_ENTITY_SEARCH_UUID_RE.test(params.rawQ.trim())) {
        const id = params.rawQ.trim();
        const row = await fetchOpportunityByUuid(params.supabase, params.orgId, scopeCons, id);
        if (row) {
            push(buildCandidate(row, "uuid_match", ["id"], "high", null), row);
        }
        const locationIds = [...oppRowsById.values()].map((o) => o.location_id).filter(Boolean) as string[];
        const locLabels = await fetchLocationLabelsById(params.supabase, params.orgId, locationIds);
        const candidates = dedupeTaskAssistEntitySearchCandidates(
            [...byId.values()].map((c) => {
                const opp = oppRowsById.get(c.entity_id);
                const loc = opp?.location_id ? locLabels.get(String(opp.location_id)) ?? null : null;
                if (!loc) return c;
                return buildCandidate(
                    opp!,
                    c.source,
                    c.matched_fields,
                    c.confidence,
                    c.disambiguation?.customer_name ?? null,
                    null,
                    loc
                );
            })
        );
        return { q: id, variants: [id], candidates };
    }

    for (const variant of variants) {
        if (remaining() <= 0) break;
        const pattern = ilikePattern(variant);
        const tokenLen = variant.length;
        const opps = await fetchOpportunitiesByNamePattern(params.supabase, params.orgId, scopeCons, pattern, remaining());
        for (const o of opps) {
            const tl = variant.toLowerCase();
            const matched: string[] = [];
            if ((o.title ?? "").toLowerCase().includes(tl)) matched.push("title");
            if ((o.name ?? "").toLowerCase().includes(tl)) matched.push("name");
            if (!matched.length) matched.push("name");
            push(
                buildCandidate(
                    o,
                    "opportunity_name",
                    matched,
                    confidenceForMatch(false, tokenLen, "name"),
                    null
                ),
                o
            );
        }
    }

    const allowCustomerBridge = includeCustomers && !accessScopeRestrictsData(dim) && recordReadableWithoutDeptSiteLinkage(dim);

    if (allowCustomerBridge) {
        if (remaining() > 0) {
            const custMap = await fetchCustomerIdsByNamePatterns(params.supabase, params.orgId, variants);
            if (custMap.size) {
                const oppsFromCust = await fetchOpportunitiesForCustomerIds(
                    params.supabase,
                    params.orgId,
                    scopeCons,
                    [...custMap.keys()],
                    4,
                    remaining()
                );
                for (const o of oppsFromCust) {
                    const cn = o.customer_id ? custMap.get(o.customer_id) ?? null : null;
                    push(
                        buildCandidate(
                            o,
                            "customer_family",
                            ["customer.name", "opportunity.customer_id"],
                            confidenceForMatch(false, primaryToken.length, "customer"),
                            cn
                        ),
                        o
                    );
                }
            }
        }

        if (remaining() > 0) {
            const memberByCustomer = await fetchCustomerIdsByMemberNamePatterns(params.supabase, params.orgId, variants);
            if (memberByCustomer.size) {
                const oppsFromMembers = await fetchOpportunitiesForCustomerIds(
                    params.supabase,
                    params.orgId,
                    scopeCons,
                    [...memberByCustomer.keys()],
                    4,
                    remaining()
                );
                for (const o of oppsFromMembers) {
                    const memberLabel = o.customer_id ? memberByCustomer.get(o.customer_id) ?? null : null;
                    push(
                        buildCandidate(
                            o,
                            "customer_member",
                            ["customer_members.name"],
                            confidenceForMatch(false, primaryToken.length, "person"),
                            null,
                            memberLabel ? `Matched member: ${memberLabel}` : null
                        ),
                        o
                    );
                }
            }
        }
    }

    if (remaining() > 0) {
        const personMap = await fetchPersonIdsByNamePatterns(params.supabase, params.orgId, variants);
        if (personMap.size) {
            const oppsFromPerson = await fetchOpportunitiesByPrimaryPersonIds(
                params.supabase,
                params.orgId,
                scopeCons,
                [...personMap.keys()],
                remaining()
            );
            for (const o of oppsFromPerson) {
                const pid = o.primary_person_id?.trim() ?? "";
                const personLabel = pid ? personMap.get(pid) : undefined;
                push(
                    buildCandidate(
                        o,
                        "primary_person",
                        ["primary_person_id", "persons.last_name"],
                        confidenceForMatch(false, primaryToken.length, "person"),
                        null,
                        personLabel ? `Matched contact: ${personLabel}` : "Matched primary contact"
                    ),
                    o
                );
            }
        }
    }

    if (remaining() > 0) {
        const contactMap = await fetchContactIdsByNamePatterns(params.supabase, params.orgId, variants);
        if (contactMap.size) {
            const oppsFromContact = await fetchOpportunitiesByPrimaryContactIds(
                params.supabase,
                params.orgId,
                scopeCons,
                [...contactMap.keys()],
                remaining()
            );
            for (const o of oppsFromContact) {
                const cid = o.primary_contact_id?.trim() ?? "";
                const contactLabel = cid ? contactMap.get(cid) : undefined;
                push(
                    buildCandidate(
                        o,
                        "primary_contact",
                        ["primary_contact_id", "contacts.last_name"],
                        confidenceForMatch(false, primaryToken.length, "person"),
                        null,
                        contactLabel ? `Matched contact: ${contactLabel}` : "Matched primary contact"
                    ),
                    o
                );
            }
        }
    }

    const locationIds = [...oppRowsById.values()].map((o) => o.location_id).filter(Boolean) as string[];
    const locLabels = await fetchLocationLabelsById(params.supabase, params.orgId, locationIds);
    const withLocation = [...byId.values()].map((c) => {
        const opp = oppRowsById.get(c.entity_id);
        const loc = opp?.location_id ? locLabels.get(String(opp.location_id)) ?? null : null;
        if (!loc) return c;
        const subtitleExtra =
            c.subtitle
                ?.split(" · ")
                .filter((p) => !p.startsWith("Location:") && !p.startsWith("Customer:"))
                .join(" · ")
                .trim() || null;
        return buildCandidate(
            opp!,
            c.source,
            c.matched_fields,
            c.confidence,
            c.disambiguation?.customer_name ?? null,
            subtitleExtra,
            loc
        );
    });

    const candidates = dedupeTaskAssistEntitySearchCandidates(withLocation).slice(0, limit);

    return {
        q: primaryToken,
        variants,
        candidates,
    };
}
