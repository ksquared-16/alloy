import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";

const ALLOWED_KEYS = [
    "label",
    "location_type",
    "is_primary",
    "is_active",
    "address1",
    "address2",
    "city",
    "state",
    "postal_code",
    "country",
    "access_method_id",
    "access_notes",
    "metadata",
] as const;

/** PATCH: update location. Admin only. Org-scoped. No customer_id or org_id change. */
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
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

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: existing, error: fetchErr } = await supabase
        .from("locations")
        .select("id, org_id, customer_id")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (fetchErr || !existing) {
        return NextResponse.json({ error: "Location not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};

    for (const key of ALLOWED_KEYS) {
        if (body[key] === undefined) continue;
        if (key === "metadata") {
            updates[key] = body.metadata != null && typeof body.metadata === "object" ? body.metadata : {};
            continue;
        }
        if (key === "access_method_id" || key === "access_notes") {
            updates[key] = body[key] === "" || body[key] == null ? null : body[key];
            continue;
        }
        if (
            key === "label" ||
            key === "address1" ||
            key === "address2" ||
            key === "city" ||
            key === "state" ||
            key === "postal_code" ||
            key === "country"
        ) {
            const v = body[key];
            updates[key] = typeof v === "string" ? v.trim() || null : null;
            continue;
        }
        if (key === "location_type") {
            updates[key] = typeof body[key] === "string" && (body[key] as string).trim() ? (body[key] as string).trim() : null;
            continue;
        }
        if (key === "is_primary" || key === "is_active") {
            updates[key] = !!body[key];
            continue;
        }
        updates[key] = body[key];
    }

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
    }

    const customerId = (existing as { customer_id?: string | null }).customer_id ?? null;
    const settingPrimary = updates.is_primary === true;

    if (customerId && settingPrimary) {
        const { error: unsetErr } = await supabase
            .from("locations")
            .update({ is_primary: false })
            .eq("customer_id", customerId)
            .eq("org_id", ctx.orgId)
            .neq("id", id);
        if (unsetErr) {
            console.error("[ADMIN_PATCH_LOCATION] unset other primary", unsetErr);
        }
    }

    const { data: updated, error: updateErr } = await supabase
        .from("locations")
        .update(updates)
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .select()
        .single();

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

    logAdminAudit({
        entity: "locations",
        id,
        changed_fields: Object.keys(updates),
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    return NextResponse.json(updated);
}
