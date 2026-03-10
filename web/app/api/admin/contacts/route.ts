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
    const selectCols = "id, created_at, updated_at, first_name, last_name, email, phone, company_name, status, status_key, contact_type, notes, customer_id, vendor_id, vendor_contact_role, archived_at, archived_by";
    let q = supabase
        .from("contacts")
        .select(selectCols, { count: "exact" })
        .eq("org_id", orgId)
        .order("updated_at", { ascending: false, nullsFirst: false })
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

    const list = (rows ?? []) as { id: string; created_at: string | null; updated_at: string | null; first_name: string | null; last_name: string | null; customer_id: string | null; vendor_id: string | null; contact_type?: string | null; [k: string]: unknown }[];
    const customerIds = [...new Set(list.map((r) => r.customer_id).filter(Boolean))] as string[];
    const vendorIds = [...new Set(list.map((r) => r.vendor_id).filter(Boolean))] as string[];

    // Linked: display names for contacts.customer_id / contacts.vendor_id (who this contact is linked to).
    let customerNames: Record<string, string> = {};
    let vendorNames: Record<string, string> = {};
    if (customerIds.length > 0) {
        const { data: custRows } = await supabase.from("customers").select("id, name").in("id", customerIds);
        (custRows ?? []).forEach((c: { id: string; name: string | null }) => {
            customerNames[c.id] = c.name ?? "—";
        });
    }
    if (vendorIds.length > 0) {
        const { data: vendRows } = await supabase.from("vendors").select("id, name").in("id", vendorIds);
        (vendRows ?? []).forEach((v: { id: string; name: string | null }) => {
            vendorNames[v.id] = v.name ?? "—";
        });
    }

    // Primary contact for: derived from customers.primary_contact_id / vendors.primary_contact_id (is this contact the primary for any customer/vendor?).
    let primaryForCustomer: Set<string> = new Set();
    let primaryForVendor: Set<string> = new Set();
    if (list.length > 0) {
        const contactIds = list.map((r) => r.id);
        const [custPrimary, vendPrimary] = await Promise.all([
            supabase.from("customers").select("primary_contact_id").in("primary_contact_id", contactIds),
            supabase.from("vendors").select("primary_contact_id").in("primary_contact_id", contactIds),
        ]);
        (custPrimary.data ?? []).forEach((c: { primary_contact_id: string | null }) => {
            if (c.primary_contact_id) primaryForCustomer.add(c.primary_contact_id);
        });
        (vendPrimary.data ?? []).forEach((v: { primary_contact_id: string | null }) => {
            if (v.primary_contact_id) primaryForVendor.add(v.primary_contact_id);
        });
    }

    const contacts = list.map((r) => {
        const _name = [r.first_name, r.last_name].filter(Boolean).join(" ") || "—";
        const linked: string[] = [];
        if (r.customer_id && customerNames[r.customer_id]) linked.push(customerNames[r.customer_id]);
        if (r.vendor_id && vendorNames[r.vendor_id]) linked.push(vendorNames[r.vendor_id]);
        const _linked_to = linked.length > 0 ? linked.join(", ") : "—";
        const pc: string[] = [];
        if (primaryForCustomer.has(r.id)) pc.push("Customer");
        if (primaryForVendor.has(r.id)) pc.push("Vendor");
        const _primary_contact_for = pc.length > 0 ? pc.join(", ") : "—";
        const _updated = r.updated_at ?? r.created_at ?? "";
        return { ...r, _name, _linked_to, _primary_contact_for, _updated };
    });

    return NextResponse.json({
        contacts,
        total: count ?? contacts.length,
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
