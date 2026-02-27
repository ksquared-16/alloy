import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { normalizeEmail, normalizePhone } from "@/lib/contactNormalize";

const CREATE_ALLOWED: readonly string[] = [
    "first_name",
    "last_name",
    "email",
    "phone",
    "company_name",
    "notes",
    "status",
    "status_key",
    "customer_id",
    "vendor_id",
    "vendor_contact_role",
    "metadata",
];

/** GET: list contacts for current org. Scoped by org from getAdminContext. */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const { orgId } = ctx;

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") ?? "").trim();
    const includeArchived = searchParams.get("include_archived") === "true";
    const statusKey = (searchParams.get("status_key") ?? "").trim();
    const limit = Math.min(Number(searchParams.get("limit")) || 200, 200);

    const supabase = createAdminClient();
    let q = supabase
        .from("contacts")
        .select("id, created_at, updated_at, first_name, last_name, email, phone, company_name, status, status_key, notes, customer_id, vendor_id, vendor_contact_role, archived_at, archived_by", { count: "exact" })
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (!includeArchived) {
        q = q.is("archived_at", null);
    }
    if (statusKey) {
        q = q.eq("status_key", statusKey);
    }

    if (search) {
        const safe = search.replace(/,/g, " ").trim();
        const term = `%${safe}%`;
        q = q.or(
            `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},phone.ilike.${term},company_name.ilike.${term}`
        );
    }

    const { data: rows, error, count } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
        contacts: rows ?? [],
        total: count ?? (rows ?? []).length,
    });
}

/** POST: create contact. Server sets org_id from context. */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const { orgId } = ctx;

    try {
        const body = (await request.json()) as Record<string, unknown>;
        const row: Record<string, unknown> = { org_id: orgId };

        for (const key of CREATE_ALLOWED) {
            if (body[key] === undefined) continue;
            if (key === "email") {
                row[key] = normalizeEmail(body[key] as string);
                continue;
            }
            if (key === "phone") {
                row[key] = normalizePhone(body[key] as string);
                continue;
            }
            row[key] = body[key];
        }

        const supabase = createAdminClient();
        const { data, error } = await supabase.from("contacts").insert(row).select().single();
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json(data);
    } catch (e) {
        console.error("[ADMIN_POST_CONTACT]", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
