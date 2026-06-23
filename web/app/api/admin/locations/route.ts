import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import {
    enrichHierarchyUnitsWithProgramCategories,
    UNIT_PROGRAM_CATEGORY_FIELD_KEYS,
} from "@/lib/admin/location/enrichHierarchyUnitProgramCategories";
import { assertAllowedStatusKey, displayLabelsFromDefinitions, fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";

/** GET: list locations for current org (dropdowns). Admin + ops. is_active only by default. */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("include_inactive") === "true";
    const hierarchy = searchParams.get("hierarchy") === "1";

    const supabase = createAdminClient();
    // Select * so environments without optional columns (e.g. status_key) still return rows; map defensively below.
    let q = supabase
        .from("locations")
        .select("*")
        .eq("org_id", ctx.orgId)
        .order("is_primary", { ascending: false })
        .order("label", { ascending: true });

    // Treat NULL is_active as active (legacy rows); only exclude explicit false.
    if (!includeInactive) {
        q = q.or("is_active.is.null,is_active.eq.true");
    }

    const { data: rows, error } = await q;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const list = (rows ?? []) as Record<string, unknown>[];
    const customerIds = [...new Set(list.map((r) => r.customer_id as string | null | undefined).filter(Boolean))] as string[];
    const { data: customersData } = customerIds.length
        ? await supabase.from("customers").select("id, name").in("id", customerIds)
        : { data: [] };
    const customerMap = new Map((customersData ?? []).map((c: { id: string; name?: string | null }) => [c.id, c.name ?? null]));

    const locDefs = await fetchEffectiveStatusDefinitions(supabase, ctx.orgId, "locations", { activeOnly: true });
    const locStatusLabels = displayLabelsFromDefinitions(locDefs);

    let locations = list.map((r) => {
        const id = String(r.id ?? "");
        const customer_id = (r.customer_id as string | null | undefined) ?? null;
        const skRaw = r.status_key;
        const sk =
            skRaw != null && String(skRaw).trim() !== "" ? String(skRaw).trim() : null;
        return {
            id,
            location_number:
                r.location_number != null && r.location_number !== ""
                    ? Number(r.location_number)
                    : null,
            label: (r.label as string | null | undefined) ?? null,
            address1: (r.address1 as string | null | undefined) ?? null,
            city: (r.city as string | null | undefined) ?? null,
            state: (r.state as string | null | undefined) ?? null,
            postal_code: (r.postal_code as string | null | undefined) ?? null,
            customer_id,
            is_primary: !!(r.is_primary as boolean | undefined),
            is_active: r.is_active !== false,
            location_type: (r.location_type as string | null | undefined) ?? null,
            parent_location_id: hierarchy
                ? ((r.parent_location_id as string | null | undefined) ?? null)
                : undefined,
            metadata: hierarchy
                ? (r.metadata != null && typeof r.metadata === "object" && !Array.isArray(r.metadata)
                    ? r.metadata
                    : {})
                : undefined,
            updated_at: (r.updated_at as string | null | undefined) ?? null,
            status_key: sk,
            _customer_name: customer_id ? (customerMap.get(customer_id) ?? null) : null,
            _status_display:
                sk != null ? (locStatusLabels.get(sk) ?? sk) : null,
        };
    });

    if (hierarchy) {
        const unitIds = locations
            .filter((row) => String(row.location_type ?? "").trim() === "unit")
            .map((row) => String(row.id));
        if (unitIds.length > 0) {
            const { data: fieldDefs } = await supabase
                .from("field_definitions")
                .select("id")
                .eq("org_id", ctx.orgId)
                .eq("entity_type", "location")
                .in("field_key", [...UNIT_PROGRAM_CATEGORY_FIELD_KEYS]);
            const defIds = (fieldDefs ?? []).map((d) => String((d as { id: string }).id)).filter(Boolean);
            if (defIds.length > 0) {
                const { data: fieldValues } = await supabase
                    .from("field_values")
                    .select("entity_id, value_text")
                    .eq("org_id", ctx.orgId)
                    .eq("entity_type", "location")
                    .in("entity_id", unitIds)
                    .in("field_definition_id", defIds);
                locations = enrichHierarchyUnitsWithProgramCategories(
                    locations,
                    (fieldValues ?? []).map((fv) => ({
                        entity_id: String((fv as { entity_id: string }).entity_id),
                        value_text: (fv as { value_text?: string | null }).value_text ?? null,
                    }))
                );
            }
        }
    }

    return NextResponse.json({ locations });
}

/** POST: create location. Admin only. Org-scoped. customer_id optional (null = org-wide). */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
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
    const access_method_key =
        typeof body.access_method_key === "string" && (body.access_method_key as string).trim()
            ? (body.access_method_key as string).trim()
            : null;
    const access_code = typeof body.access_code === "string" ? (body.access_code as string).trim() || null : null;
    const access_notes = typeof body.access_notes === "string" ? (body.access_notes as string).trim() || null : null;
    const home_type_key =
        typeof body.home_type_key === "string" && (body.home_type_key as string).trim()
            ? (body.home_type_key as string).trim()
            : null;
    const square_footage_tier_key =
        typeof body.square_footage_tier_key === "string" && (body.square_footage_tier_key as string).trim()
            ? (body.square_footage_tier_key as string).trim()
            : null;
    let beds: number | null = null;
    if (body.beds !== undefined && body.beds !== null && body.beds !== "") {
        const n = typeof body.beds === "number" ? body.beds : parseFloat(String(body.beds));
        beds = Number.isFinite(n) ? n : null;
    }
    let baths: number | null = null;
    if (body.baths !== undefined && body.baths !== null && body.baths !== "") {
        const n = typeof body.baths === "number" ? body.baths : parseFloat(String(body.baths));
        baths = Number.isFinite(n) ? n : null;
    }
    const metadata = body.metadata != null && typeof body.metadata === "object" ? body.metadata : {};

    let status_key: string | null = null;
    if (body.status_key !== undefined) {
        const v = body.status_key;
        status_key = v === "" || v == null ? null : typeof v === "string" ? v.trim() || null : null;
        const chk = await assertAllowedStatusKey(supabase, ctx.orgId, "locations", status_key);
        if (!chk.ok) return NextResponse.json({ error: chk.message }, { status: 400 });
    }

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
        access_method_id: access_method_key ? null : access_method_id ?? null,
        access_method_key: access_method_key ?? null,
        access_code,
        access_notes,
        home_type_key: home_type_key ?? null,
        square_footage_tier_key: square_footage_tier_key ?? null,
        beds: beds ?? null,
        baths: baths ?? null,
        metadata,
    };
    if (body.status_key !== undefined) {
        insert.status_key = status_key;
    }

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
