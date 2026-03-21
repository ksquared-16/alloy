import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";
import { upsertFieldValuesFromBody } from "@/lib/admin/fieldValues";
import { assertAllowedStatusKey } from "@/lib/admin/statusDefinitionsResolve";
import { emitStatusChangedEvent } from "@/lib/admin/emitStatusChangedEvent";

const ALLOWED_KEYS = [
    "label",
    "location_type",
    "location_type_id",
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
    "status_key",
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
        .select("id, org_id, customer_id, status_key")
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
            if (updates.location_type === undefined) {
                updates[key] = typeof body[key] === "string" && (body[key] as string).trim() ? (body[key] as string).trim() : null;
            }
            continue;
        }
        if (key === "location_type_id") {
            const tid = body[key];
            if (tid === "" || tid == null) {
                updates.location_type_id = null;
                updates.location_type = null;
            } else {
                const typeId = typeof tid === "string" ? tid.trim() : null;
                if (!typeId) {
                    updates.location_type_id = null;
                    updates.location_type = null;
                } else {
                    const { data: typeRow } = await supabase
                        .from("location_types")
                        .select("id, key")
                        .eq("id", typeId)
                        .eq("org_id", ctx.orgId)
                        .maybeSingle();
                    if (!typeRow) {
                        return NextResponse.json({ error: "Location type not found or does not belong to your org" }, { status: 400 });
                    }
                    updates.location_type_id = (typeRow as { id: string }).id;
                    updates.location_type = ((typeRow as { key: string }).key ?? "").trim() || null;
                }
            }
            continue;
        }
        if (key === "is_primary" || key === "is_active") {
            updates[key] = !!body[key];
            continue;
        }
        if (key === "status_key") {
            const v = body.status_key;
            updates.status_key = v === "" || v == null ? null : typeof v === "string" ? v.trim() || null : null;
            continue;
        }
        updates[key] = body[key];
    }

    if (updates.status_key !== undefined) {
        const chk = await assertAllowedStatusKey(supabase, ctx.orgId, "locations", updates.status_key as string | null);
        if (!chk.ok) return NextResponse.json({ error: chk.message }, { status: 400 });
    }

    const systemKeys = [...ALLOWED_KEYS, "customer_id", "org_id", "vendor_id"] as const;
    const allowedSet = new Set(systemKeys as readonly string[]);
    const hasCustomFieldKeys = Object.keys(body).some(
        (k) => !allowedSet.has(k) && !k.startsWith("_")
    );

    if (Object.keys(updates).length === 0 && !hasCustomFieldKeys) {
        return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
    }

    if (Object.keys(updates).length > 0) {
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

        const oldStatusKey = (existing as { status_key?: string | null }).status_key ?? null;

        const { data: updated, error: updateErr } = await supabase
            .from("locations")
            .update(updates)
            .eq("id", id)
            .eq("org_id", ctx.orgId)
            .select()
            .single();

        if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });
        if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

        if (updates.status_key !== undefined) {
            await emitStatusChangedEvent({
                supabase,
                orgId: ctx.orgId,
                entityType: "locations",
                entityId: id,
                oldStatusKey,
                newStatusKey: (updates.status_key as string | null) ?? null,
            });
        }

        logAdminAudit({
            entity: "locations",
            id,
            changed_fields: Object.keys(updates),
            actor_user_id: ctx.userId,
            role: ctx.role,
        });
    }

    await upsertFieldValuesFromBody(supabase, ctx.orgId, "location", id, body, systemKeys);

    const { data: out } = await supabase.from("locations").select("*").eq("id", id).eq("org_id", ctx.orgId).single();
    return NextResponse.json(out);
}
