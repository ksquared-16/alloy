import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { buildOpportunityIntakeSourceViewModel } from "@/lib/forms/opportunityIntakeSourcePresentation";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";

/** GET — latest form intake submission linked to this opportunity (for drawer continuity). */
export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id: opportunityId } = await context.params;
    if (!opportunityId?.trim()) {
        return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: submission, error: subErr } = await supabase
        .from("form_submissions")
        .select("id, status, submitted_at, form_definition_id, payload")
        .eq("org_id", ctx.orgId)
        .eq("opportunity_id", opportunityId)
        .eq("status", "submitted")
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 });
    if (!submission?.id) {
        return NextResponse.json({ data: null });
    }

    const { data: form } = await supabase
        .from("form_definitions")
        .select("id, name")
        .eq("org_id", ctx.orgId)
        .eq("id", submission.form_definition_id)
        .maybeSingle();

    const vm = buildOpportunityIntakeSourceViewModel({
        submission_id: submission.id,
        form_definition_id: submission.form_definition_id,
        form_name: form?.name ?? "Form",
        submitted_at: submission.submitted_at,
        status: submission.status,
        payload: submission.payload,
    });

    return NextResponse.json({ data: vm });
}
