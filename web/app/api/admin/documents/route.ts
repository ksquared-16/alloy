import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { normalizeDocumentRow } from "@/lib/admin/normalizeDocumentRow";
import { isV1DocumentEntityType } from "@/lib/admin/v1DocumentEntities";
import { displayLabelsFromDefinitions, fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

type DocRow = {
    id: string;
    entity_type: string | null;
    entity_id: string | null;
    title: string | null;
    original_filename: string | null;
    doc_type: string | null;
    status: string | null;
    created_at: string | null;
};

function labelKey(entityType: string, entityId: string): string {
    return `${entityType}:${entityId}`;
}

/**
 * Best-effort labels for related records (batched by type).
 */
async function attachRelatedLabels(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    rows: DocRow[]
): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const buckets: Record<string, Set<string>> = {};
    for (const r of rows) {
        const t = r.entity_type?.trim();
        const id = r.entity_id?.trim();
        if (!t || !id) continue;
        buckets[t] ??= new Set();
        buckets[t].add(id);
    }

    const ids = (s?: Set<string>) => (s ? [...s] : []);

    if (buckets.customer?.size) {
        const { data } = await supabase.from("customers").select("id, name").eq("org_id", orgId).in("id", ids(buckets.customer));
        for (const r of data ?? []) {
            const nm = (r as { name?: string | null }).name?.trim();
            out.set(labelKey("customer", (r as { id: string }).id), nm || `Customer ${String((r as { id: string }).id).slice(0, 8)}…`);
        }
    }
    if (buckets.vendor?.size) {
        const { data } = await supabase.from("vendors").select("id, name").eq("org_id", orgId).in("id", ids(buckets.vendor));
        for (const r of data ?? []) {
            const nm = (r as { name?: string | null }).name?.trim();
            out.set(labelKey("vendor", (r as { id: string }).id), nm || `Vendor ${String((r as { id: string }).id).slice(0, 8)}…`);
        }
    }
    if (buckets.opportunity?.size) {
        const { data } = await supabase.from("opportunities").select("id, name").eq("org_id", orgId).in("id", ids(buckets.opportunity));
        for (const r of data ?? []) {
            const nm = (r as { name?: string | null }).name?.trim();
            out.set(labelKey("opportunity", (r as { id: string }).id), nm || `Opportunity ${String((r as { id: string }).id).slice(0, 8)}…`);
        }
    }
    if (buckets.contact?.size) {
        const { data } = await supabase
            .from("contacts")
            .select("id, first_name, last_name, email")
            .eq("org_id", orgId)
            .in("id", ids(buckets.contact));
        for (const r of data ?? []) {
            const row = r as { id: string; first_name?: string | null; last_name?: string | null; email?: string | null };
            const nm = [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.email?.trim() || null;
            out.set(labelKey("contact", row.id), nm || `Contact ${row.id.slice(0, 8)}…`);
        }
    }
    if (buckets.person?.size) {
        const { data } = await supabase
            .from("persons")
            .select("id, first_name, last_name, email, full_name")
            .eq("org_id", orgId)
            .in("id", ids(buckets.person));
        for (const r of data ?? []) {
            const row = r as {
                id: string;
                first_name?: string | null;
                last_name?: string | null;
                email?: string | null;
                full_name?: string | null;
            };
            const nm =
                (row.full_name && String(row.full_name).trim()) ||
                [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
                row.email?.trim() ||
                null;
            out.set(labelKey("person", row.id), nm || `Person ${row.id.slice(0, 8)}…`);
        }
    }
    if (buckets.job?.size) {
        const { data } = await supabase.from("jobs").select("id, title").eq("org_id", orgId).in("id", ids(buckets.job));
        for (const r of data ?? []) {
            const row = r as { id: string; title?: string | null };
            const nm = row.title?.trim();
            out.set(labelKey("job", row.id), nm || `Job ${row.id.slice(0, 8)}…`);
        }
    }
    if (buckets.schedule?.size) {
        const { data } = await supabase
            .from("schedules")
            .select("id, start_at, job_id")
            .eq("org_id", orgId)
            .in("id", ids(buckets.schedule));
        for (const r of data ?? []) {
            const row = r as { id: string; start_at?: string | null; job_id?: string | null };
            const start = row.start_at ? new Date(row.start_at).toLocaleString() : null;
            out.set(
                labelKey("schedule", row.id),
                start ? `Visit ${start}` : row.job_id ? `Schedule · job ${row.job_id.slice(0, 8)}…` : `Schedule ${row.id.slice(0, 8)}…`
            );
        }
    }

    return out;
}

/** GET: list documents for current org (admin + ops). */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    const { searchParams } = new URL(request.url);
    const entityTypeFilter = searchParams.get("entity_type")?.trim() || null;
    if (entityTypeFilter && !isV1DocumentEntityType(entityTypeFilter)) {
        return NextResponse.json({ error: "Invalid entity_type filter" }, { status: 400 });
    }

    let limit = Number(searchParams.get("limit") ?? DEFAULT_LIMIT);
    if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
    limit = Math.min(limit, MAX_LIMIT);

    const supabase = createAdminClient();
    let q = supabase
        .from("documents")
        .select("id, entity_type, entity_id, title, original_filename, doc_type, status, status_key, created_at")
        .eq("org_id", ctx.orgId)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (entityTypeFilter) {
        q = q.eq("entity_type", entityTypeFilter);
    }

    const { data: rawRows, error } = await q;
    if (error) {
        console.error("[ADMIN_DOCUMENTS_LIST]", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (rawRows ?? []) as DocRow[];
    const labelMap = await attachRelatedLabels(supabase, ctx.orgId, rows);
    const docDefs = await fetchEffectiveStatusDefinitions(supabase, ctx.orgId, "documents", { activeOnly: true });
    const docStatusLabels = displayLabelsFromDefinitions(docDefs);

    const documents = rows.map((src) => {
        const n = normalizeDocumentRow(src as unknown as Record<string, unknown>);
        const t = src.entity_type?.trim() ?? null;
        const eid = src.entity_id?.trim() ?? null;
        const related_label = t && eid ? labelMap.get(labelKey(t, eid)) ?? null : null;
        const sk = (src as { status_key?: string | null }).status_key ?? null;
        const _status_display =
            sk != null && String(sk).trim() !== ""
                ? (docStatusLabels.get(String(sk).trim()) ?? String(sk).trim())
                : null;
        return {
            ...n,
            status_key: sk,
            _status_display,
            entity_type: t,
            entity_id: eid,
            related_label,
        };
    });

    return NextResponse.json({ documents });
}
