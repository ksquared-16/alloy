/**
 * The proposal an operator reviews and corrects before approving (Processing "Edit").
 *
 * GET  — per subject: each editable field's submitted value beside its current (corrected) value.
 * POST — `{ edits: [{ subject_ref, field, value }] }`; validated, normalized, stored as corrections on
 *        the case. The submission itself is never changed; approve commits the corrected values.
 * Processing operator authority (PROCESSING_OPERATE), as for approve and reject.
 */
import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { PROCESSING_OPERATE, requireProcessingCapability } from "@/lib/access/processingAuthority";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { loadProposedValues, saveProposedValueEdits } from "@/lib/pos/processingIdentity/operator/proposedValuesService";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

async function target(params: Promise<{ caseId: string }>) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return { response: adminContextFailureResponse(ctx) };
    const caseId = parseUuidParam((await params).caseId, "caseId");
    if (caseId instanceof NextResponse) return { response: caseId };
    return { ctx, caseId };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const t = await target(params);
    if ("response" in t) return t.response;
    const denied = requireProcessingCapability(t.ctx, PROCESSING_OPERATE);
    if (denied) return denied;
    try {
        const values = await loadProposedValues(createAdminClient(), { orgId: t.ctx.orgId, caseId: t.caseId });
        if (!values) return jsonError("Not found", 404);
        return jsonData(values);
    } catch (e) {
        console.error("[proposed values] read failed", e instanceof Error ? e.message : e);
        return jsonError("The proposed values could not be read.", 500);
    }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const t = await target(params);
    if ("response" in t) return t.response;
    const denied = requireProcessingCapability(t.ctx, PROCESSING_OPERATE);
    if (denied) return denied;
    let body: { edits?: Array<{ subject_ref?: unknown; field?: unknown; value?: unknown }> };
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return jsonError("Invalid JSON body", 400);
    }
    const edits = (Array.isArray(body.edits) ? body.edits : []).map((e) => ({
        subjectRef: typeof e.subject_ref === "string" ? e.subject_ref : "",
        field: typeof e.field === "string" ? e.field : "",
        value: e.value,
    }));
    try {
        const result = await saveProposedValueEdits(createAdminClient(), { orgId: t.ctx.orgId, caseId: t.caseId, actorId: t.ctx.userId ?? null, edits });
        if (!result.ok) return jsonError(result.message, result.status, { code: result.code, field: result.field ?? null });
        return jsonData(result.values);
    } catch (e) {
        console.error("[proposed values] save failed", e instanceof Error ? e.message : e);
        return jsonError("The values could not be saved.", 500);
    }
}
