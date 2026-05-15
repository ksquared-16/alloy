import type { SupabaseClient } from "@supabase/supabase-js";

import {
    accessScopeRestrictsData,
    applyRecordScopeConstraintsToQuery,
    recordReadableWithoutDeptSiteLinkage,
    resolveRecordScopeConstraints,
    type AdminAccessScopeDimensions,
} from "@/lib/admin/accessScope";
import {
    CRM_ENTITY_SEARCH_UUID_RE,
    sanitizeCrmSearchToken,
} from "@/lib/admin/forms/crmEntitySearchShared";
import type {
    TaskAssistEntitySearchCandidate,
    TaskAssistEntitySearchConfidence,
    TaskAssistEntitySearchSource,
} from "@/lib/agent/taskAssist/taskAssistEntitySearchTypes";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 20;

type OppRow = {
    id: string;
    name?: string | null;
    title?: string | null;
    customer_id?: string | null;
    work_unit_id?: string | null;
    location_id?: string | null;
    opportunity_number?: number | string | null;
};

function clampLimit(n: number | undefined): number {
    const v = Number.isFinite(n) && n! > 0 ? Math.floor(n!) : DEFAULT_LIMIT;
    return Math.min(Math.max(v, 1), MAX_LIMIT);
}

function oppLabel(o: OppRow): string {
    const t = (o.title ?? "").trim();
    const n = (o.name ?? "").trim();
    return t || n || `Opportunity ${o.id.slice(0, 8)}…`;
}

function confidenceForMatch(exactUuid: boolean, tokenLen: number, field: "name" | "customer"): TaskAssistEntitySearchConfidence {
    if (exactUuid) return "high";
    if (field === "name" && tokenLen >= 4) return "medium";
    return "low";
}

function buildCandidate(
    o: OppRow,
    source: TaskAssistEntitySearchSource,
    matched: string[],
    conf: TaskAssistEntitySearchConfidence,
    customerName: string | null
): TaskAssistEntitySearchCandidate {
    const rawNum = o.opportunity_number;
    const n = rawNum != null && rawNum !== "" ? Number(rawNum) : null;
    return {
        entity_type: "opportunities",
        entity_id: o.id,
        label: oppLabel(o),
        subtitle: customerName ? `Customer: ${customerName}` : null,
        confidence: conf,
        source,
        matched_fields: matched,
        disambiguation: {
            customer_name: customerName,
            opportunity_number: n != null && Number.isFinite(n) ? n : null,
        },
    };
}

async function fetchOpportunitiesByName(
    supabase: SupabaseClient,
    orgId: string,
    dim: AdminAccessScopeDimensions,
    pattern: string,
    limit: number
): Promise<OppRow[]> {
    const scopeCons = await resolveRecordScopeConstraints(supabase, orgId, dim);
    if (scopeCons.impossible) return [];

    let q = supabase.from("opportunities").select("id, name, title, customer_id, work_unit_id, location_id, opportunity_number").eq("org_id", orgId);
    q = applyRecordScopeConstraintsToQuery(q, scopeCons);
    const orExpr = `name.ilike.${pattern},title.ilike.${pattern}`;
    const { data, error } = await q.or(orExpr).order("created_at", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as OppRow[];
}

async function fetchOpportunityByUuid(
    supabase: SupabaseClient,
    orgId: string,
    dim: AdminAccessScopeDimensions,
    id: string
): Promise<OppRow | null> {
    const scopeCons = await resolveRecordScopeConstraints(supabase, orgId, dim);
    if (scopeCons.impossible) return null;

    let q = supabase
        .from("opportunities")
        .select("id, name, title, customer_id, work_unit_id, location_id, opportunity_number")
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
    dim: AdminAccessScopeDimensions,
    customerIds: string[],
    perCustomer: number,
    totalCap: number
): Promise<OppRow[]> {
    if (!customerIds.length) return [];
    const scopeCons = await resolveRecordScopeConstraints(supabase, orgId, dim);
    if (scopeCons.impossible) return [];

    const out: OppRow[] = [];
    for (const cid of customerIds) {
        let q = supabase
            .from("opportunities")
            .select("id, name, title, customer_id, work_unit_id, location_id, opportunity_number")
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

export type RunTaskAssistEntitySearchParams = {
    supabase: SupabaseClient;
    orgId: string;
    accessDim: AdminAccessScopeDimensions;
    rawQ: string;
    limit?: number;
    /** When true and scope is org-wide for dept+site, also match customers and map to their opportunities. */
    includeCustomers?: boolean;
};

/**
 * Org-scoped opportunity search with department/site constraints aligned to opportunities list routes.
 * Optional customer name search only when {@link recordReadableWithoutDeptSiteLinkage} — avoids
 * unscoped household reads for restricted operators.
 */
export async function runTaskAssistEntitySearch(params: RunTaskAssistEntitySearchParams): Promise<{
    q: string;
    candidates: TaskAssistEntitySearchCandidate[];
}> {
    const token = sanitizeCrmSearchToken(params.rawQ);
    const limit = clampLimit(params.limit);
    const includeCustomers = params.includeCustomers !== false;

    if (token.length < 2 && !CRM_ENTITY_SEARCH_UUID_RE.test(params.rawQ.trim())) {
        return { q: token, candidates: [] };
    }

    const byId = new Map<string, TaskAssistEntitySearchCandidate>();
    const dim = params.accessDim;

    const push = (c: TaskAssistEntitySearchCandidate) => {
        if (!byId.has(c.entity_id)) byId.set(c.entity_id, c);
    };

    if (CRM_ENTITY_SEARCH_UUID_RE.test(params.rawQ.trim())) {
        const id = params.rawQ.trim();
        const row = await fetchOpportunityByUuid(params.supabase, params.orgId, dim, id);
        if (row) {
            push(
                buildCandidate(row, "uuid_match", ["id"], "high", null),
            );
        }
        return { q: id, candidates: [...byId.values()] };
    }

    const pattern = `%${token}%`;
    const tokenLen = token.length;

    const opps = await fetchOpportunitiesByName(params.supabase, params.orgId, dim, pattern, limit);
    for (const o of opps) {
        const tl = token.toLowerCase();
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
                null,
            ),
        );
    }

    const allowCustomerBridge = includeCustomers && !accessScopeRestrictsData(dim) && recordReadableWithoutDeptSiteLinkage(dim);

    if (allowCustomerBridge && byId.size < limit) {
        const { data: custRows, error: custErr } = await params.supabase
            .from("customers")
            .select("id, name")
            .eq("org_id", params.orgId)
            .ilike("name", pattern)
            .order("created_at", { ascending: false })
            .limit(8);
        if (custErr) throw new Error(custErr.message);

        const customers = (custRows ?? []) as { id: string; name?: string | null }[];
        const custIds = customers.map((c) => c.id);
        const custNameById = new Map(customers.map((c) => [c.id, (c.name ?? "").trim() || null]));

        const remaining = limit - byId.size;
        const oppsFromCust = await fetchOpportunitiesForCustomerIds(
            params.supabase,
            params.orgId,
            dim,
            custIds,
            4,
            remaining,
        );
        for (const o of oppsFromCust) {
            if (byId.has(o.id)) continue;
            const cn = o.customer_id ? custNameById.get(o.customer_id) ?? null : null;
            push(
                buildCandidate(
                    o,
                    "customer_family",
                    ["customer.name", "opportunity.customer_id"],
                    confidenceForMatch(false, tokenLen, "customer"),
                    cn,
                ),
            );
        }
    }

    return { q: token, candidates: [...byId.values()].slice(0, limit) };
}
