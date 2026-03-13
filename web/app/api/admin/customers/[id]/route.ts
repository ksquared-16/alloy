import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminAuth, requireAdminOrOps, logAdminAudit } from "@/lib/adminAuth";
import { emitStatusChangedEvent } from "@/lib/admin/emitStatusChangedEvent";
import { upsertFieldValuesFromBody } from "@/lib/admin/fieldValues";

const ALLOWED_KEYS = ["name", "status", "status_key", "customer_type", "external_source", "external_id"] as const;

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
            if (body[key] !== undefined) updates[key] = body[key];
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
        }

        const supabase = createAdminClient();
        const { data: existing } = await supabase
            .from("customers")
            .select("org_id, status_key, primary_contact_id")
            .eq("id", id)
            .maybeSingle();
        const existingRow = existing as { org_id?: string; status_key?: string | null; primary_contact_id?: string | null } | null;
        const oldStatusKey = existingRow?.status_key ?? null;
        const orgId = existingRow?.org_id;

        const { data, error } = await supabase
            .from("customers")
            .update(updates)
            .eq("id", id)
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        if (orgId) {
            await upsertFieldValuesFromBody(supabase, orgId, "customer", id, body, ALLOWED_KEYS);
        }
        if (updates.status_key !== undefined && orgId) {
            const newStatusKey = (updates.status_key as string) ?? null;
            const metadata: Record<string, unknown> = {};
            if (existingRow?.primary_contact_id != null) metadata.primary_contact_id = existingRow.primary_contact_id;
            await emitStatusChangedEvent({
                supabase,
                orgId,
                entityType: "customers",
                entityId: id,
                oldStatusKey,
                newStatusKey,
                metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
            });
        }
        logAdminAudit({
            entity: "customers",
            id,
            changed_fields: Object.keys(updates),
            actor_user_id: auth.user.id,
            role: auth.role,
        });
        return NextResponse.json(data);
    } catch (e: unknown) {
        console.error("[ADMIN_PATCH_CUSTOMER]", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
