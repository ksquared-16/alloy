import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { upsertFieldValuesFromBody } from "@/lib/admin/fieldValues";
import {
    INQUIRY_CHILD_ENTITY_TYPE,
    INQUIRY_CHILD_NATIVE_OCM_PATCH_KEYS,
    normalizeIsoDateOnly,
    partitionInquiryChildPatchBody,
} from "@/lib/fields/inquiryChildFieldRegistry";

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { native: nativeBody, custom: customBody } = partitionInquiryChildPatchBody(body);

    const updates: Record<string, unknown> = {};
    for (const k of INQUIRY_CHILD_NATIVE_OCM_PATCH_KEYS) {
        if (nativeBody[k] === undefined) continue;
        const v = nativeBody[k];
        if (k === "notes") {
            updates.notes = typeof v === "string" ? v : v == null ? null : String(v);
            continue;
        }
        if (k === "desired_start_date") {
            updates.desired_start_date =
                v === "" || v == null ? null : normalizeIsoDateOnly(typeof v === "string" ? v : String(v));
            continue;
        }
        updates[k] = v === "" || v == null ? null : typeof v === "string" ? v.trim() || null : v;
    }

    const hasNative = Object.keys(updates).length > 0;
    const hasCustom = Object.keys(customBody).length > 0;
    if (!hasNative && !hasCustom) {
        return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "opportunity_customer_members", id, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (hasCustom) {
        await upsertFieldValuesFromBody(
            supabase,
            ctx.orgId,
            INQUIRY_CHILD_ENTITY_TYPE,
            id,
            customBody,
            [...INQUIRY_CHILD_NATIVE_OCM_PATCH_KEYS]
        );
    }

    if (!hasNative) {
        return NextResponse.json({ id, updated: true });
    }

    const { data, error } = await supabase
        .from("opportunity_customer_members")
        .update(updates)
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .select(
            "id, org_id, opportunity_id, customer_member_id, desired_program_type, desired_schedule_type, desired_start_date, outcome_status_key, notes, updated_at"
        )
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!data) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(data);
}
