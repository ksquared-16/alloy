import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminAuth, requireAdminOrOps, logAdminAudit } from "@/lib/adminAuth";
import { emitStatusChangedEvent } from "@/lib/admin/emitStatusChangedEvent";

const ALLOWED_KEYS = [
    "name", "job_date", "job_time_window", "status", "status_key", "vertical_id", "quote_total", "notes", "pipeline_stage_id",
    "source", "assigned_to", "lost_reason", "appointment_id",
    "quote_subtotal", "discount_amount", "discount_code",
    "external_source", "external_id",
] as const;

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
            if (key === "notes") continue; // handled below
            let val = body[key];
            if (key === "vertical_id" && val === "") val = null;
            if (key === "quote_total" && (val === "" || val === null)) val = null;
            if (key === "pipeline_stage_id" && (val === "" || val === null)) val = null;
            if (key === "quote_subtotal" && (val === "" || val === null)) val = null;
            if (key === "discount_amount" && (val === "" || val === null)) val = null;
            if (["name", "source", "assigned_to", "lost_reason", "appointment_id", "discount_code", "external_source", "external_id"].includes(key)) {
                val = typeof val === "string" ? val.trim() || null : val;
            }
            updates[key] = val;
        }
        if (body.notes !== undefined) {
            const supabase = createAdminClient();
            const { data: existing } = await supabase.from("opportunities").select("metadata").eq("id", id).single();
            const meta = (existing?.metadata as Record<string, unknown>) || {};
            updates.metadata = { ...meta, notes: body.notes === "" ? null : body.notes };
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
        }

        const supabase = createAdminClient();
        const { data: existing } = await supabase
            .from("opportunities")
            .select("org_id, status_key, customer_id, primary_contact_id")
            .eq("id", id)
            .maybeSingle();
        const existingRow = existing as { org_id?: string; status_key?: string | null; customer_id?: string | null; primary_contact_id?: string | null } | null;
        const oldStatusKey = existingRow?.status_key ?? null;
        const orgId = existingRow?.org_id;

        const { data, error } = await supabase
            .from("opportunities")
            .update(updates)
            .eq("id", id)
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        if (updates.status_key !== undefined && orgId) {
            const newStatusKey = (updates.status_key as string) ?? null;
            const metadata: Record<string, unknown> = {};
            if (existingRow?.customer_id != null) metadata.customer_id = existingRow.customer_id;
            if (existingRow?.primary_contact_id != null) metadata.primary_contact_id = existingRow.primary_contact_id;
            await emitStatusChangedEvent({
                supabase,
                orgId,
                entityType: "opportunities",
                entityId: id,
                oldStatusKey,
                newStatusKey,
                metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
            });
        }
        logAdminAudit({
            entity: "opportunities",
            id,
            changed_fields: Object.keys(updates).filter((k) => k !== "metadata").concat(updates.metadata ? ["notes"] : []),
            actor_user_id: auth.user.id,
            role: auth.role,
        });
        return NextResponse.json(data);
    } catch (e: unknown) {
        console.error("[ADMIN_PATCH_OPPORTUNITY]", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
