import { withholdMedicalAnswersFromSubmissions } from "@/lib/health/withholdMedicalSubmissionAnswers";
import { NextRequest, NextResponse } from "next/server";
import { formSubmissionReadableById } from "@/lib/forms/formSubmissionScope";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import {
    dbGetPublicLinkById,
    dbGetSubmission,
    dbGetVersion,
    dbListSubmissionLinkedDocuments,
} from "@/lib/admin/forms/formsAdminDb";
import { buildPublicLinkIntakeDebug, type PublicLinkIntakeDebug } from "@/lib/forms/submissionOutcomeSummary";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { disclosableDocumentIds, UNDISCLOSED_DOCUMENT_LABEL } from "@/lib/documents/documentMetadataDisclosure";

/** GET /api/admin/forms/submissions/[submissionId] */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ submissionId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { submissionId: raw } = await params;
    const submissionId = parseUuidParam(raw, "submissionId");
    if (submissionId instanceof NextResponse) return submissionId;

    const supabase = createAdminClient();
    const { data, error } = await dbGetSubmission(supabase, ctx.orgId, submissionId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return jsonError("Not found", 404);
    // R2: the same 404 for a submission outside the caller's department/site scope as for one that does not exist.
    if (!(await formSubmissionReadableById(supabase, ctx.orgId, submissionId))) return jsonError("Not found", 404);

    const sub = data as { form_definition_version_id: string };
    const [{ data: ver }, { data: linked, error: linkErr }] = await Promise.all([
        dbGetVersion(supabase, ctx.orgId, sub.form_definition_version_id),
        dbListSubmissionLinkedDocuments(supabase, ctx.orgId, submissionId),
    ]);
    if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });

    const schema_json = ver ? (ver as { schema_json: unknown }).schema_json : null;

    // A child's medical answers only for a caller with Medical access (FI-01 visibility).
    const [row] = (await withholdMedicalAnswersFromSubmissions(supabase, ctx.orgId, [data as Record<string, unknown> & { form_definition_version_id?: string | null }], { permissionKeys: ctx.permissionKeys })) as Record<string, unknown>[];
    const { org_id: _orgStrip, ...submissionRest } = row!;
    void _orgStrip;

    const linkId = typeof submissionRest.created_via_public_link_id === "string" ? submissionRest.created_via_public_link_id : null;
    let public_link_intake_debug: PublicLinkIntakeDebug | null = null;
    if (linkId) {
        const { data: linkRow } = await dbGetPublicLinkById(supabase, ctx.orgId, linkId);
        const meta =
            linkRow && typeof (linkRow as { metadata?: unknown }).metadata === "object" && (linkRow as { metadata?: unknown }).metadata
                ? ((linkRow as { metadata: Record<string, unknown> }).metadata ?? {})
                : {};
        public_link_intake_debug = buildPublicLinkIntakeDebug(meta, linkId);
    }

    // EN-FI-01: a linked document (a completed-form PDF, an upload, a signed artifact) is named only to a reader who
    // may read it — documents admission, subject scope, sensitivity clearance (a medical form's PDF needs health.view).
    const access = await getAdminAccessContextCached();
    const documentActor = access.ok
        ? { roleKeys: access.roleKeys, permissionKeys: access.permissionKeys, scope: scopeDimensionsFromAccess(access) }
        : null;
    const disclosable = await disclosableDocumentIds(supabase, ctx.orgId, documentActor, (linked ?? []).map((l) => l.document.id));
    const linked_documents = (linked ?? []).map((l) =>
        disclosable.has(l.document.id)
            ? l
            : { ...l, document: { ...l.document, name: UNDISCLOSED_DOCUMENT_LABEL, original_filename: null, document_type: null } },
    );

    return jsonData({
        ...submissionRest,
        schema_json,
        linked_documents,
        public_link_intake_debug,
    });
}
