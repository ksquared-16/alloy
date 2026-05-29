import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import {
    CRM_ENTITY_SEARCH_UUID_RE,
    isCrmSearchEntityType,
    labelPersonRow,
    sanitizeCrmSearchToken,
} from "@/lib/admin/forms/crmEntitySearchShared";

const LIMIT = 20;

export type CrmSearchResultRow = { id: string; label: string; subtitle: string | null };

/**
 * GET /api/admin/forms/crm-entity-search?entity_type=&q=
 * Admin-only, org-scoped typeahead for linking submissions to CRM rows.
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const entityTypeRaw = request.nextUrl.searchParams.get("entity_type")?.trim() ?? "";
    if (!isCrmSearchEntityType(entityTypeRaw)) {
        return NextResponse.json(
            { error: "entity_type must be person, customer, customer_member, or opportunity" },
            { status: 400 }
        );
    }

    const rawQ = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const token = sanitizeCrmSearchToken(rawQ);
    if (token.length < 2 && !CRM_ENTITY_SEARCH_UUID_RE.test(rawQ)) {
        return NextResponse.json(
            { error: "q must be at least 2 characters, or a valid UUID for this entity type" },
            { status: 400 }
        );
    }

    const supabase = createAdminClient();
    const orgId = ctx.orgId;

    try {
        let results: CrmSearchResultRow[] = [];
        if (entityTypeRaw === "person") {
            results = await searchPersons(supabase, orgId, rawQ, token);
        } else if (entityTypeRaw === "customer") {
            results = await searchCustomers(supabase, orgId, rawQ, token);
        } else if (entityTypeRaw === "customer_member") {
            results = await searchCustomerMembers(supabase, orgId, rawQ, token);
        } else {
            results = await searchOpportunities(supabase, orgId, rawQ, token);
        }
        return NextResponse.json({ results });
    } catch (e) {
        console.error("[crm-entity-search]", e);
        return NextResponse.json({ error: e instanceof Error ? e.message : "Search failed" }, { status: 500 });
    }
}

async function searchPersons(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    rawQ: string,
    token: string
): Promise<CrmSearchResultRow[]> {
    const sel = "id, first_name, last_name, full_name, email, phone";
    if (CRM_ENTITY_SEARCH_UUID_RE.test(rawQ)) {
        const { data, error } = await supabase
            .from("persons")
            .select(sel)
            .eq("org_id", orgId)
            .eq("id", rawQ)
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return [];
        const p = data as {
            id: string;
            first_name?: string | null;
            last_name?: string | null;
            full_name?: string | null;
            email?: string | null;
            phone?: string | null;
        };
        return [
            {
                id: p.id,
                label: labelPersonRow(p),
                subtitle: [p.email?.trim(), p.phone?.trim()].filter(Boolean).join(" · ") || null,
            },
        ];
    }
    const pattern = `%${token}%`;
    const q = () => supabase.from("persons").select(sel).eq("org_id", orgId).limit(LIMIT);
    const [fn, sn, ln, em, ph] = await Promise.all([
        q().ilike("full_name", pattern),
        q().ilike("first_name", pattern),
        q().ilike("last_name", pattern),
        q().ilike("email", pattern),
        q().ilike("phone", pattern),
    ]);
    const err = fn.error ?? sn.error ?? ln.error ?? em.error ?? ph.error;
    if (err) throw new Error(err.message);

    const byId = new Map<
        string,
        {
            id: string;
            first_name?: string | null;
            last_name?: string | null;
            full_name?: string | null;
            email?: string | null;
            phone?: string | null;
        }
    >();
    for (const batch of [fn.data, sn.data, ln.data, em.data, ph.data]) {
        for (const row of (batch ?? []) as {
            id: string;
            first_name?: string | null;
            last_name?: string | null;
            full_name?: string | null;
            email?: string | null;
            phone?: string | null;
        }[]) {
            if (row?.id) byId.set(String(row.id), row);
        }
    }
    const merged = [...byId.values()].sort((a, b) => {
        const la = labelPersonRow(a).toLowerCase();
        const lb = labelPersonRow(b).toLowerCase();
        const c = la.localeCompare(lb);
        return c !== 0 ? c : String(a.id).localeCompare(String(b.id));
    });
    return merged.slice(0, LIMIT).map((p) => ({
        id: p.id,
        label: labelPersonRow(p),
        subtitle: [p.email?.trim(), p.phone?.trim()].filter(Boolean).join(" · ") || null,
    }));
}

async function searchCustomers(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    rawQ: string,
    token: string
): Promise<CrmSearchResultRow[]> {
    const sel = "id, name, customer_number";
    if (CRM_ENTITY_SEARCH_UUID_RE.test(rawQ)) {
        const { data, error } = await supabase
            .from("customers")
            .select(sel)
            .eq("org_id", orgId)
            .eq("id", rawQ)
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return [];
        const c = data as { id: string; name?: string | null; customer_number?: number | null };
        const label = (c.name && String(c.name).trim()) || `Customer ${c.id.slice(0, 8)}…`;
        const sub =
            c.customer_number != null ? `Account #${c.customer_number}` : null;
        return [{ id: c.id, label, subtitle: sub }];
    }
    const pattern = `%${token}%`;
    const { data, error } = await supabase
        .from("customers")
        .select(sel)
        .eq("org_id", orgId)
        .ilike("name", pattern)
        .order("name", { ascending: true })
        .limit(LIMIT);
    if (error) throw new Error(error.message);
    return mapCustomerRows(data ?? []);
}

function mapCustomerRows(
    rows: { id: string; name?: string | null; customer_number?: number | null }[]
): CrmSearchResultRow[] {
    return rows.map((c) => ({
        id: c.id,
        label: (c.name && String(c.name).trim()) || `Customer ${c.id.slice(0, 8)}…`,
        subtitle: c.customer_number != null ? `Account #${c.customer_number}` : null,
    }));
}

async function searchCustomerMembers(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    rawQ: string,
    token: string
): Promise<CrmSearchResultRow[]> {
    const sel = "id, customer_id, display_name, first_name, last_name, dob";
    if (CRM_ENTITY_SEARCH_UUID_RE.test(rawQ)) {
        const { data, error } = await supabase
            .from("customer_members")
            .select(sel)
            .eq("org_id", orgId)
            .eq("id", rawQ)
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return [];
        const m = data as {
            id: string;
            customer_id: string;
            display_name?: string | null;
            first_name?: string | null;
            last_name?: string | null;
            dob?: string | null;
        };
        const label =
            (m.display_name && m.display_name.trim()) ||
            [m.first_name, m.last_name].filter(Boolean).join(" ").trim() ||
            `Child ${m.id.slice(0, 8)}…`;
        const { data: cust } = await supabase
            .from("customers")
            .select("name")
            .eq("org_id", orgId)
            .eq("id", m.customer_id)
            .maybeSingle();
        const cn = (cust as { name?: string | null } | null)?.name?.trim();
        return [
            {
                id: m.id,
                label,
                subtitle: [cn ? `Customer: ${cn}` : null, m.dob ? `DOB ${m.dob}` : null].filter(Boolean).join(" · ") || null,
            },
        ];
    }
    const pattern = `%${token}%`;
    const q = () => supabase.from("customer_members").select(sel).eq("org_id", orgId).limit(LIMIT);
    const [dn, fn, ln] = await Promise.all([
        q().ilike("display_name", pattern),
        q().ilike("first_name", pattern),
        q().ilike("last_name", pattern),
    ]);
    const err = dn.error ?? fn.error ?? ln.error;
    if (err) throw new Error(err.message);

    const byId = new Map<
        string,
        {
            id: string;
            customer_id: string;
            display_name?: string | null;
            first_name?: string | null;
            last_name?: string | null;
            dob?: string | null;
        }
    >();
    for (const batch of [dn.data, fn.data, ln.data]) {
        for (const row of (batch ?? []) as {
            id: string;
            customer_id: string;
            display_name?: string | null;
            first_name?: string | null;
            last_name?: string | null;
            dob?: string | null;
        }[]) {
            if (row?.id) byId.set(String(row.id), row);
        }
    }
    const merged = [...byId.values()].slice(0, LIMIT);
    const custIds = [...new Set(merged.map((m) => m.customer_id))];
    const { data: custRows } = await supabase.from("customers").select("id, name").eq("org_id", orgId).in("id", custIds);
    const custName = new Map((custRows ?? []).map((c: { id: string; name?: string | null }) => [c.id, c.name ?? null]));

    return merged.map((m) => {
        const label =
            (m.display_name && m.display_name.trim()) ||
            [m.first_name, m.last_name].filter(Boolean).join(" ").trim() ||
            `Child ${m.id.slice(0, 8)}…`;
        const cn = custName.get(m.customer_id)?.trim();
        return {
            id: m.id,
            label,
            subtitle: [cn ? `Customer: ${cn}` : null, m.dob ? `DOB ${m.dob}` : null].filter(Boolean).join(" · ") || null,
        };
    });
}

async function searchOpportunities(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    rawQ: string,
    token: string
): Promise<CrmSearchResultRow[]> {
    const sel = "id, name, customer_id";
    if (CRM_ENTITY_SEARCH_UUID_RE.test(rawQ)) {
        const { data, error } = await supabase
            .from("opportunities")
            .select(sel)
            .eq("org_id", orgId)
            .eq("id", rawQ)
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return [];
        const o = data as { id: string; name?: string | null; customer_id?: string | null };
        const label = (o.name && o.name.trim()) || `Opportunity ${o.id.slice(0, 8)}…`;
        let subtitle: string | null = null;
        if (o.customer_id) {
            const { data: cust } = await supabase
                .from("customers")
                .select("name")
                .eq("org_id", orgId)
                .eq("id", o.customer_id)
                .maybeSingle();
            const cn = (cust as { name?: string | null } | null)?.name?.trim();
            if (cn) subtitle = `Customer: ${cn}`;
        }
        return [{ id: o.id, label, subtitle }];
    }
    const pattern = `%${token}%`;
    const { data, error } = await supabase
        .from("opportunities")
        .select(sel)
        .eq("org_id", orgId)
        .ilike("name", pattern)
        .order("created_at", { ascending: false })
        .limit(LIMIT);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { id: string; name?: string | null; customer_id?: string | null }[];
    const custIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))] as string[];
    const { data: custRows } =
        custIds.length > 0 ?
            await supabase.from("customers").select("id, name").eq("org_id", orgId).in("id", custIds)
        :   { data: [] };
    const custName = new Map((custRows ?? []).map((c: { id: string; name?: string | null }) => [c.id, c.name ?? null]));

    return rows.map((o) => {
        const label = (o.name && o.name.trim()) || `Opportunity ${o.id.slice(0, 8)}…`;
        const cn = o.customer_id ? custName.get(o.customer_id)?.trim() : null;
        return { id: o.id, label, subtitle: cn ? `Customer: ${cn}` : null };
    });
}
