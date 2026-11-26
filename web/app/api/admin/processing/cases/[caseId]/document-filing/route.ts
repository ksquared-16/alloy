import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { PROCESSING_OPERATE, requireProcessingCapability } from "@/lib/access/processingAuthority";
import { documentActorForRequest, requireDocumentRead, requireDocumentWrite } from "@/lib/documents/assertDocumentAccess";
import { buildDocumentFilingWorkspace, saveDocumentFilingProposal } from "@/lib/pos/documentFiling/documentFilingService";
import { parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/processing/cases/[caseId]/document-filing[?household_id=]
 *   The filing workspace of a document case (D5): the stored proposal, the published Studio types with their policy, the
 *   classifier's suggestion (a proposal only), the household to choose the record from, and a preview of the filing
 *   with every problem still to resolve. Needs `processing.operate` and the document access decision.
 *
 * PUT  the operator's proposal: type, record (primary owner), linked records, review, mode. Needs `processing.operate`
 *   and `documents.write`. Records are re-resolved against the household graph the operator can see. Nothing is filed
 *   here: filing is the case's approval (`POST …/approve`), which runs the Documents filing command.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const denied = requireProcessingCapability(ctx, PROCESSING_OPERATE);
    if (denied) return denied;
    const access = await getAdminAccessContextCached();
    const actor = documentActorForRequest(ctx, access);
    const readDenied = requireDocumentRead(actor);
    if (readDenied) return readDenied;
    const { caseId: raw } = await params;
    const caseId = parseUuidParam(raw, "caseId");
    if (caseId instanceof NextResponse) return caseId;
    const householdParam = new URL(request.url).searchParams.get("household_id");
    const householdId = householdParam && UUID_RE.test(householdParam) ? householdParam : null;

    const built = await buildDocumentFilingWorkspace(createAdminClient(), actor, caseId, { householdId });
    if (!built.ok) return NextResponse.json({ ok: false, error: built.message, code: built.code }, { status: built.status });
    return NextResponse.json({ ok: true, workspace: built.workspace });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const denied = requireProcessingCapability(ctx, PROCESSING_OPERATE);
    if (denied) return denied;
    const access = await getAdminAccessContextCached();
    const actor = documentActorForRequest(ctx, access);
    const writeDenied = requireDocumentWrite(actor);
    if (writeDenied) return writeDenied;
    const { caseId: raw } = await params;
    const caseId = parseUuidParam(raw, "caseId");
    if (caseId instanceof NextResponse) return caseId;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ ok: false, error: "Expected a JSON proposal.", code: "BAD_REQUEST" }, { status: 400 });

    const saved = await saveDocumentFilingProposal(createAdminClient(), actor, caseId, (body as { proposal?: unknown }).proposal ?? body);
    if (!saved.ok) return NextResponse.json({ ok: false, error: saved.message, code: saved.code }, { status: saved.status });
    return NextResponse.json({ ok: true, proposal: saved.proposal });
}
