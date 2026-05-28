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
import { updateOpportunityCustomerMemberLifecycleStatus } from "@/lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus";
import { validateInquiryChildPlacementPatch } from "@/lib/admin/drawer/inquiryChildPlacementScope";

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
        if (k === "location_id") {
            updates.location_id = v === "" || v == null ? null : typeof v === "string" ? v.trim() || null : null;
            continue;
        }
        if (k === "program_room_cohort_key") {
            updates.program_room_cohort_key =
                v === "" || v == null ? null : typeof v === "string" ? v.trim() || null : null;
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

    const { data: existingOcm } = await supabase
        .from("opportunity_customer_members")
        .select(
            "id, opportunity_id, outcome_status_key, location_id, program_room_cohort_key, desired_program_type"
        )
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (!existingOcm) {
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

    const existing = existingOcm as {
        location_id?: string | null;
        program_room_cohort_key?: string | null;
        desired_program_type?: string | null;
    };
    const placementValidation = validateInquiryChildPlacementPatch({
        location_id:
            "location_id" in updates ? (updates.location_id as string | null) : existing.location_id,
        program_room_cohort_key:
            "program_room_cohort_key" in updates
                ? (updates.program_room_cohort_key as string | null)
                : existing.program_room_cohort_key,
        desired_program_type:
            "desired_program_type" in updates
                ? (updates.desired_program_type as string | null)
                : existing.desired_program_type,
    });
    if (!placementValidation.ok) {
        return NextResponse.json(
            {
                error: placementValidation.issues[0]?.message ?? "Invalid child placement scope",
                placement_scope_issues: placementValidation.issues,
            },
            { status: 400 }
        );
    }

    if (Object.prototype.hasOwnProperty.call(updates, "outcome_status_key")) {
        const lifecycleOnly = Object.keys(updates).every((k) => k === "outcome_status_key");
        const lifecycleResult = await updateOpportunityCustomerMemberLifecycleStatus({
            supabase,
            orgId: ctx.orgId,
            opportunityId: String((existingOcm as { opportunity_id: string }).opportunity_id),
            opportunityCustomerMemberId: id,
            nextStatusKey:
                updates.outcome_status_key == null || updates.outcome_status_key === ""
                    ? null
                    : String(updates.outcome_status_key),
            actorUserId: ctx.userId,
            source: "api:opportunity-customer-members:patch",
        });
        if (lifecycleResult.error) {
            return NextResponse.json({ error: lifecycleResult.error.message }, { status: 400 });
        }
        if (lifecycleOnly) {
            return NextResponse.json(lifecycleResult.after);
        }
        delete updates.outcome_status_key;
        if (!Object.keys(updates).length) {
            return NextResponse.json(lifecycleResult.after);
        }
    }

    const { data, error } = await supabase
        .from("opportunity_customer_members")
        .update(updates)
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .select(
            "id, org_id, opportunity_id, customer_member_id, location_id, program_room_cohort_key, desired_program_type, desired_schedule_type, desired_start_date, outcome_status_key, notes, updated_at"
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
