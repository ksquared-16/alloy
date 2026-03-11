import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** GET: list locations for current org (dropdowns). Admin + ops. is_active only by default. */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("include_inactive") === "true";

    const supabase = createAdminClient();
    let q = supabase
        .from("locations")
        .select("id, label, address1, city, state, postal_code, customer_id, is_primary, is_active, location_type, updated_at")
        .eq("org_id", ctx.orgId)
        .order("is_primary", { ascending: false })
        .order("label", { ascending: true });

    if (!includeInactive) {
        q = q.eq("is_active", true);
    }

    const { data: rows, error } = await q;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const list = (rows ?? []) as { id: string; label?: string | null; address1?: string | null; city?: string | null; state?: string | null; postal_code?: string | null; customer_id?: string | null; is_primary?: boolean; is_active?: boolean; location_type?: string | null; updated_at?: string | null }[];
    const customerIds = [...new Set(list.map((r) => r.customer_id).filter(Boolean))] as string[];
    const { data: customersData } = customerIds.length
        ? await supabase.from("customers").select("id, name").in("id", customerIds)
        : { data: [] };
    const customerMap = new Map((customersData ?? []).map((c: { id: string; name?: string | null }) => [c.id, c.name ?? null]));

    const locations = list.map((r) => ({
        id: r.id,
        label: r.label ?? null,
        address1: r.address1 ?? null,
        city: r.city ?? null,
        state: r.state ?? null,
        postal_code: r.postal_code ?? null,
        customer_id: r.customer_id ?? null,
        is_primary: r.is_primary ?? false,
        is_active: r.is_active !== false,
        location_type: r.location_type ?? null,
        updated_at: r.updated_at ?? null,
        _customer_name: r.customer_id ? (customerMap.get(r.customer_id) ?? null) : null,
    }));

    return NextResponse.json({ locations });
}

/** POST: create location. Admin only. Org-scoped. customer_id optional (null = org-wide). */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const customer_id: string | null =
        typeof body.customer_id === "string" && body.customer_id.trim()
            ? body.customer_id.trim()
            : null;

    const supabase = createAdminClient();

    if (customer_id) {
        const { data: cust } = await supabase
            .from("customers")
            .select("id, org_id")
            .eq("id", customer_id)
            .maybeSingle();
        if (!cust || (cust as { org_id?: string }).org_id !== ctx.orgId) {
            return NextResponse.json({ error: "Customer not found or does not belong to your org" }, { status: 400 });
        }
    }

    const label = typeof body.label === "string" ? (body.label as string).trim() || null : null;

    let location_type: string = "address";
    let location_type_id: string | null = null;
    const locationTypeIdInput =
        typeof body.location_type_id === "string" && (body.location_type_id as string).trim()
            ? (body.location_type_id as string).trim()
            : null;
    if (locationTypeIdInput) {
        const { data: typeRow } = await supabase
            .from("location_types")
            .select("id, key")
            .eq("id", locationTypeIdInput)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        if (!typeRow) {
            return NextResponse.json({ error: "Location type not found or does not belong to your org" }, { status: 400 });
        }
        location_type_id = (typeRow as { id: string }).id;
        location_type = ((typeRow as { key: string }).key ?? "address").trim() || "address";
    } else {
        const locTypeInput =
            typeof body.location_type === "string" && (body.location_type as string).trim()
                ? (body.location_type as string).trim()
                : null;
        if (locTypeInput) location_type = locTypeInput;
    }

    const is_primary = customer_id ? !!body.is_primary : false;
    const is_active = body.is_active !== false;
    const address1 = typeof body.address1 === "string" ? (body.address1 as string).trim() || null : null;
    const address2 = typeof body.address2 === "string" ? (body.address2 as string).trim() || null : null;
    const city = typeof body.city === "string" ? (body.city as string).trim() || null : null;
    const state = typeof body.state === "string" ? (body.state as string).trim() || null : null;
    const postal_code = typeof body.postal_code === "string" ? (body.postal_code as string).trim() || null : null;
    const country = typeof body.country === "string" ? (body.country as string).trim() || null : null;
    const access_method_id =
        typeof body.access_method_id === "string" && (body.access_method_id as string).trim()
            ? (body.access_method_id as string).trim()
            : null;
    const access_notes = typeof body.access_notes === "string" ? (body.access_notes as string).trim() || null : null;
    const metadata = body.metadata != null && typeof body.metadata === "object" ? body.metadata : {};

    if (customer_id && is_primary) {
        await supabase
            .from("locations")
            .update({ is_primary: false })
            .eq("customer_id", customer_id)
            .eq("org_id", ctx.orgId);
    }

    const insert: Record<string, unknown> = {
        org_id: ctx.orgId,
        customer_id: customer_id,
        vendor_id: null,
        label,
        location_type,
        location_type_id: location_type_id ?? null,
        is_primary,
        is_active,
        address1,
        address2,
        city,
        state,
        postal_code,
        country,
        access_method_id: access_method_id ?? null,
        access_notes,
        metadata,
    };

    const { data: created, error } = await supabase.from("locations").insert(insert).select().single();
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const { logAdminAudit } = await import("@/lib/adminAuth");
    logAdminAudit({
        entity: "locations",
        id: (created as { id: string }).id,
        changed_fields: ["create"],
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    return NextResponse.json(created);
}
