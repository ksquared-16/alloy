import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import { getAdminAuth, requireAdminOrOps, logAdminAudit } from "@/lib/adminAuth";
import { emitStatusChangedEvent } from "@/lib/admin/emitStatusChangedEvent";
import { upsertFieldValuesFromBody } from "@/lib/admin/fieldValues";
import { assertAllowedStatusKey } from "@/lib/admin/statusDefinitionsResolve";

const ALLOWED_KEYS = [
    "name",
    "job_date",
    "job_time_window",
    "status",
    "vertical_id",
    "quote_total",
    "notes",
    "status_key",
    "source",
    "assigned_to",
    "lost_reason",
    "appointment_id",
    "quote_subtotal",
    "discount_amount",
    "discount_code",
    "external_source",
    "external_id",
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
        const ctx = await getAdminContext();
        if (!ctx.ok) return adminContextFailureResponse(ctx);
        const body = (await request.json()) as Record<string, unknown>;
        const auth = await getAdminAuth();
        if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const supabase = createAdminClient();
        if (!(await assertRowOrg(supabase, "opportunities", id, ctx.orgId)).ok) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const { data: existing } = await supabase
            .from("opportunities")
            .select("org_id, status_key, customer_id, primary_contact_id")
            .eq("id", id)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        const existingRow = existing as {
            org_id?: string;
            status_key?: string | null;
            customer_id?: string | null;
            primary_contact_id?: string | null;
        } | null;
        if (!existingRow?.org_id) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        const orgId = existingRow.org_id;
        const oldStatusKey = existingRow.status_key ?? null;

        const updates: Record<string, unknown> = {};
        for (const key of ALLOWED_KEYS) {
            if (body[key] === undefined) continue;
            if (key === "notes") continue;
            let val = body[key];
            if (key === "vertical_id" && val === "") val = null;
            if (key === "quote_total" && (val === "" || val === null)) val = null;
            if (key === "quote_subtotal" && (val === "" || val === null)) val = null;
            if (key === "discount_amount" && (val === "" || val === null)) val = null;
            if (key === "status_key") {
                updates.status_key =
                    val === "" || val == null ? null : typeof val === "string" ? val.trim() || null : val;
                continue;
            }
            if (
                [
                    "name",
                    "source",
                    "assigned_to",
                    "lost_reason",
                    "appointment_id",
                    "discount_code",
                    "external_source",
                    "external_id",
                ].includes(key)
            ) {
                val = typeof val === "string" ? val.trim() || null : val;
            }
            updates[key] = val;
        }
        if (body.notes !== undefined) {
            const { data: metaRow } = await supabase
                .from("opportunities")
                .select("metadata")
                .eq("id", id)
                .eq("org_id", ctx.orgId)
                .single();
            const meta = (metaRow?.metadata as Record<string, unknown>) || {};
            updates.metadata = { ...meta, notes: body.notes === "" ? null : body.notes };
        }

        const explicitStatusKey = body.status_key !== undefined;
        if (explicitStatusKey) {
            const sk = updates.status_key as string | null;
            const chk = await assertAllowedStatusKey(supabase, orgId, "opportunities", sk);
            if (!chk.ok) {
                return NextResponse.json({ error: chk.message }, { status: 400 });
            }
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
        }

        const { data, error } = await supabase
            .from("opportunities")
            .update(updates)
            .eq("id", id)
            .eq("org_id", ctx.orgId)
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        await upsertFieldValuesFromBody(supabase, orgId, "opportunity", id, body, ALLOWED_KEYS);

        if (explicitStatusKey && orgId) {
            const newStatusKey = (data as { status_key?: string | null }).status_key ?? null;
            const metadata: Record<string, unknown> = {};
            if (existingRow.customer_id != null) metadata.customer_id = existingRow.customer_id;
            if (existingRow.primary_contact_id != null) metadata.primary_contact_id = existingRow.primary_contact_id;
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
            changed_fields: Object.keys(updates)
                .filter((k) => k !== "metadata")
                .concat(updates.metadata ? ["notes"] : []),
            actor_user_id: auth.user.id,
            role: auth.role,
        });
        return NextResponse.json(data);
    } catch (e: unknown) {
        console.error("[ADMIN_PATCH_OPPORTUNITY]", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
