import { NextRequest, NextResponse } from "next/server";
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

    const sub = data as { form_definition_version_id: string };
    const [{ data: ver }, { data: linked, error: linkErr }] = await Promise.all([
        dbGetVersion(supabase, ctx.orgId, sub.form_definition_version_id),
        dbListSubmissionLinkedDocuments(supabase, ctx.orgId, submissionId),
    ]);
    if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });

    const schema_json = ver ? (ver as { schema_json: unknown }).schema_json : null;

    const row = data as Record<string, unknown>;
    const { org_id: _orgStrip, ...submissionRest } = row;
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

    return jsonData({
        ...submissionRest,
        schema_json,
        linked_documents: linked ?? [],
        public_link_intake_debug,
    });
}
