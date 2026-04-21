import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import { getAdminAuth, requireAdminOrOps, logAdminAudit } from "@/lib/adminAuth";
import { emitStatusChangedEvent } from "@/lib/admin/emitStatusChangedEvent";
import { upsertFieldValuesFromBody } from "@/lib/admin/fieldValues";
import { assertAllowedStatusKey } from "@/lib/admin/statusDefinitionsResolve";
import {
    mergeOpportunityQuotePricing,
    opportunityQuotePipelineActive,
    type OpportunityPricingExistingRow,
} from "@/lib/admin/opportunityQuotePatch";

const ALLOWED_KEYS = [
    "name",
    "job_date",
    "job_time_window",
    "status",
    "vertical_id",
    "quote_total",
    "price_breakdown",
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
    "quote_is_overridden",
    "quote_override_total",
    "quote_override_reason",
] as const;

const PIPELINE_ONLY_KEYS = new Set([
    "quote_inputs",
    "apply_quote_discount",
    "clear_quote_discount",
    "clear_quote_override",
    "quote_discount_selection",
]);

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
            .select(
                "org_id, status_key, customer_id, primary_contact_id, vertical_id, metadata, quote_subtotal, quote_total, price_breakdown, discount_amount, discount_code, discount_code_id, discount_program_id, discount_validated_at, quote_is_overridden, quote_override_total, quote_override_reason, estimated_price_cents, monetary_value_cents"
            )
            .eq("id", id)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        const existingRow = existing as {
            org_id?: string;
            status_key?: string | null;
            customer_id?: string | null;
            primary_contact_id?: string | null;
            vertical_id?: string | null;
            metadata?: Record<string, unknown> | null;
            quote_subtotal?: number | null;
            quote_total?: number | null;
            price_breakdown?: string | null;
            discount_amount?: number | null;
            discount_code?: string | null;
            discount_code_id?: string | null;
            discount_program_id?: string | null;
            discount_validated_at?: string | null;
            quote_is_overridden?: boolean | null;
            quote_override_total?: number | null;
            quote_override_reason?: string | null;
            estimated_price_cents?: number | null;
            monetary_value_cents?: number | null;
        } | null;
        if (!existingRow?.org_id) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        const orgId = existingRow.org_id;
        const oldStatusKey = existingRow.status_key ?? null;

        const updates: Record<string, unknown> = {};
        let ownedKeys = new Set<string>();

        const metadataBase = (existingRow?.metadata as Record<string, unknown> | null) ?? {};
        const metadataUpdates: Record<string, unknown> = {};
        if (body.notes !== undefined) {
            metadataUpdates.notes = body.notes === "" ? null : body.notes;
        }

        if (opportunityQuotePipelineActive(body)) {
            const merged = await mergeOpportunityQuotePricing({
                supabase,
                orgId,
                existing: existingRow as OpportunityPricingExistingRow,
                body,
            });
            if ("error" in merged) {
                return NextResponse.json({ error: merged.error }, { status: merged.status });
            }
            Object.assign(updates, merged.updates);
            Object.assign(metadataUpdates, merged.metadataFragment);
            ownedKeys = merged.ownedKeys;
        }

        for (const key of ALLOWED_KEYS) {
            if (ownedKeys.has(key)) continue;
            if (body[key] === undefined) continue;
            if (key === "notes") continue;
            let val = body[key];
            if (key === "vertical_id" && val === "") val = null;
            if (key === "quote_total" && (val === "" || val === null)) val = null;
            if (key === "quote_subtotal" && (val === "" || val === null)) val = null;
            if (key === "discount_amount" && (val === "" || val === null)) val = null;
            if (key === "quote_override_total" && (val === "" || val === null)) val = null;
            if (key === "quote_is_overridden" && val === "") val = false;
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
                    "quote_override_reason",
                ].includes(key)
            ) {
                val = typeof val === "string" ? val.trim() || null : val;
            }
            updates[key] = val;
        }

        // Legacy quote_inputs path removed — handled exclusively by mergeOpportunityQuotePricing when present.

        if (Object.keys(metadataUpdates).length > 0) {
            updates.metadata = { ...metadataBase, ...metadataUpdates };
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
        await upsertFieldValuesFromBody(supabase, orgId, "opportunity", id, body, [
            ...ALLOWED_KEYS,
            ...Array.from(PIPELINE_ONLY_KEYS),
        ]);

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

        const auditFields = Object.keys(updates)
            .filter((k) => k !== "metadata")
            .concat(updates.metadata ? ["metadata"] : []);
        logAdminAudit({
            entity: "opportunities",
            id,
            changed_fields: auditFields,
            actor_user_id: auth.user.id,
            role: auth.role,
        });
        return NextResponse.json(data);
    } catch (e: unknown) {
        console.error("[ADMIN_PATCH_OPPORTUNITY]", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
