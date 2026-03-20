import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { isV1DocumentEntityType } from "@/lib/admin/v1DocumentEntities";

const OUT_LIMIT = 40;
const FETCH_CAP = 250;

/** GET: records to attach a document. Query: entity_type (required), q (optional substring on label). */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    const entityType = request.nextUrl.searchParams.get("entity_type")?.trim() ?? "";
    if (!entityType || !isV1DocumentEntityType(entityType)) {
        return NextResponse.json(
            { error: "entity_type must be: customer, vendor, opportunity, contact, person, job, schedule" },
            { status: 400 }
        );
    }

    const qRaw = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const qLower = qRaw.toLowerCase();

    const supabase = createAdminClient();

    try {
        switch (entityType) {
            case "customer": {
                const { data, error } = await supabase
                    .from("customers")
                    .select("id, name")
                    .eq("org_id", ctx.orgId)
                    .order("name", { ascending: true })
                    .limit(FETCH_CAP);
                if (error) throw error;
                let options = (data ?? []).map((r: { id: string; name?: string | null }) => ({
                    id: r.id,
                    label: (r.name && String(r.name).trim()) || `Customer ${r.id.slice(0, 8)}…`,
                }));
                if (qLower) options = options.filter((o) => o.label.toLowerCase().includes(qLower));
                return NextResponse.json({ options: options.slice(0, OUT_LIMIT) });
            }
            case "vendor": {
                const { data, error } = await supabase
                    .from("vendors")
                    .select("id, name")
                    .eq("org_id", ctx.orgId)
                    .order("name", { ascending: true })
                    .limit(FETCH_CAP);
                if (error) throw error;
                let options = (data ?? []).map((r: { id: string; name?: string | null }) => ({
                    id: r.id,
                    label: (r.name && String(r.name).trim()) || `Vendor ${r.id.slice(0, 8)}…`,
                }));
                if (qLower) options = options.filter((o) => o.label.toLowerCase().includes(qLower));
                return NextResponse.json({ options: options.slice(0, OUT_LIMIT) });
            }
            case "opportunity": {
                const { data, error } = await supabase
                    .from("opportunities")
                    .select("id, name")
                    .eq("org_id", ctx.orgId)
                    .order("created_at", { ascending: false })
                    .limit(FETCH_CAP);
                if (error) throw error;
                let options = (data ?? []).map((r: { id: string; name?: string | null }) => ({
                    id: r.id,
                    label: (r.name && String(r.name).trim()) || `Opportunity ${r.id.slice(0, 8)}…`,
                }));
                if (qLower) options = options.filter((o) => o.label.toLowerCase().includes(qLower));
                return NextResponse.json({ options: options.slice(0, OUT_LIMIT) });
            }
            case "contact": {
                const { data, error } = await supabase
                    .from("contacts")
                    .select("id, first_name, last_name, email")
                    .eq("org_id", ctx.orgId)
                    .order("created_at", { ascending: false })
                    .limit(FETCH_CAP);
                if (error) throw error;
                let options = (data ?? []).map((r: { id: string; first_name?: string | null; last_name?: string | null; email?: string | null }) => {
                    const nm = [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.email?.trim() || null;
                    return { id: r.id, label: nm || `Contact ${r.id.slice(0, 8)}…` };
                });
                if (qLower) options = options.filter((o) => o.label.toLowerCase().includes(qLower));
                return NextResponse.json({ options: options.slice(0, OUT_LIMIT) });
            }
            case "person": {
                const { data, error } = await supabase
                    .from("persons")
                    .select("id, first_name, last_name, email, full_name")
                    .eq("org_id", ctx.orgId)
                    .order("created_at", { ascending: false })
                    .limit(FETCH_CAP);
                if (error) throw error;
                let options = (data ?? []).map(
                    (r: {
                        id: string;
                        first_name?: string | null;
                        last_name?: string | null;
                        email?: string | null;
                        full_name?: string | null;
                    }) => {
                        const nm =
                            (r.full_name && String(r.full_name).trim()) ||
                            [r.first_name, r.last_name].filter(Boolean).join(" ").trim() ||
                            r.email?.trim() ||
                            null;
                        return { id: r.id, label: nm || `Person ${r.id.slice(0, 8)}…` };
                    }
                );
                if (qLower) options = options.filter((o) => o.label.toLowerCase().includes(qLower));
                return NextResponse.json({ options: options.slice(0, OUT_LIMIT) });
            }
            case "job": {
                const { data, error } = await supabase
                    .from("jobs")
                    .select("id, title")
                    .eq("org_id", ctx.orgId)
                    .order("created_at", { ascending: false })
                    .limit(FETCH_CAP);
                if (error) throw error;
                let options = (data ?? []).map((r: { id: string; title?: string | null }) => ({
                    id: r.id,
                    label: (r.title && String(r.title).trim()) || `Job ${r.id.slice(0, 8)}…`,
                }));
                if (qLower) options = options.filter((o) => o.label.toLowerCase().includes(qLower));
                return NextResponse.json({ options: options.slice(0, OUT_LIMIT) });
            }
            case "schedule": {
                const { data, error } = await supabase
                    .from("schedules")
                    .select("id, start_at, job_id")
                    .eq("org_id", ctx.orgId)
                    .order("start_at", { ascending: false })
                    .limit(FETCH_CAP);
                if (error) throw error;
                let options = (data ?? []).map((r: { id: string; start_at?: string | null; job_id?: string | null }) => {
                    const start = r.start_at ? new Date(r.start_at).toLocaleString() : "—";
                    return {
                        id: r.id,
                        label: `Visit ${start}${r.job_id ? ` · job ${r.job_id.slice(0, 8)}…` : ""}`,
                    };
                });
                if (qLower) options = options.filter((o) => o.label.toLowerCase().includes(qLower));
                return NextResponse.json({ options: options.slice(0, OUT_LIMIT) });
            }
            default:
                return NextResponse.json({ options: [] });
        }
    } catch (e) {
        console.error("[DOCUMENT_ENTITY_OPTIONS]", e);
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load options" }, { status: 500 });
    }
}
