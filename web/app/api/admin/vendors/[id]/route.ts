import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminAuth, requireAdminOrOps, logAdminAudit } from "@/lib/adminAuth";
import { emitStatusChangedEvent } from "@/lib/admin/emitStatusChangedEvent";

const ALLOWED_KEYS = [
    "vendor_status_id",
    "status_key",
    "name",
    "company_name",
    "phone",
    "email",
    "address_line1",
    "city",
    "state",
    "postal_code",
    "days_available",
    "operating_hours_open",
    "operating_hours_close",
    "owns_supplies",
    "max_daily_jobs",
    "payout_percent",
    "service_area_zip_codes",
] as const;

function toNull(v: unknown): unknown {
    if (v === "" || v === undefined) return null;
    return v;
}

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    try {
        const body = await request.json();
        const auth = await getAdminAuth();
        if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const updates: Record<string, unknown> = {};
        for (const key of ALLOWED_KEYS) {
            if (body[key] === undefined) continue;
            const raw = body[key];
            if (key === "vendor_status_id") {
                updates[key] = raw === "" || raw === null ? null : raw;
            } else if (key === "status_key") {
                updates[key] = raw === "" || raw === null ? null : (typeof raw === "string" ? raw.trim() : raw);
            } else if (key === "days_available" || key === "service_area_zip_codes") {
                updates[key] = Array.isArray(raw) ? raw : null;
            } else if (key === "owns_supplies") {
                updates[key] = !!raw;
            } else if (key === "max_daily_jobs" || key === "payout_percent") {
                updates[key] = raw === "" || raw === null ? null : (typeof raw === "number" ? raw : Number(raw));
            } else {
                updates[key] = toNull(raw);
            }
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
        }

        const supabase = createAdminClient();
        const { data: existing } = await supabase
            .from("vendors")
            .select("org_id, status_key")
            .eq("id", id)
            .maybeSingle();
        const existingRow = existing as { org_id?: string; status_key?: string | null } | null;
        const oldStatusKey = existingRow?.status_key ?? null;
        const orgId = existingRow?.org_id;

        const { data, error } = await supabase
            .from("vendors")
            .update(updates)
            .eq("id", id)
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        if (updates.status_key !== undefined && orgId) {
            const newStatusKey = (updates.status_key as string) ?? null;
            await emitStatusChangedEvent({
                supabase,
                orgId,
                entityType: "vendors",
                entityId: id,
                oldStatusKey,
                newStatusKey,
            });
        }
        logAdminAudit({
            entity: "vendors",
            id,
            changed_fields: Object.keys(updates),
            actor_user_id: auth.user.id,
            role: auth.role,
        });
        return NextResponse.json(data);
    } catch (e: unknown) {
        console.error("[ADMIN_PATCH_VENDOR]", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
