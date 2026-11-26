import { withholdMedicalAnswersFromSubmissions } from "@/lib/health/withholdMedicalSubmissionAnswers";
import { NextRequest, NextResponse } from "next/server";
import { formsReadScope, formsSubjectInActorScope } from "@/lib/forms/formSubmissionScope";
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
    // R2: the opportunity's intake answers only for a caller whose department/site scope includes the opportunity —
    // the gate its sibling enrollment-packets route already applies.
    if (!(await formsSubjectInActorScope(supabase, ctx.orgId, await formsReadScope(), { opportunity_id: opportunityId.trim() }))) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { data: submission, error: subErr } = await supabase
        .from("form_submissions")
        .select("id, status, submitted_at, form_definition_id, form_definition_version_id, payload")
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

    const [visible] = await withholdMedicalAnswersFromSubmissions(supabase, ctx.orgId, [submission], { permissionKeys: ctx.permissionKeys });
    const vm = buildOpportunityIntakeSourceViewModel({
        submission_id: submission.id,
        form_definition_id: submission.form_definition_id,
        form_name: form?.name ?? "Form",
        submitted_at: submission.submitted_at,
        status: submission.status,
        payload: visible!.payload as typeof submission.payload,
    });

    return NextResponse.json({ data: vm });
}
