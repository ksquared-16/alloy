import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { agentV2CommitFieldVisibilityApply } from "@/lib/agent/v2/agentV2FieldVisibilityAtomicCommit";
import {
    lockTimestampMatches,
    prepareFieldDefinitionVisibilityPatch,
} from "@/lib/agent/v2/applyFieldDefinitionVisibility";
import { getFieldDefinitionLockTimestamp } from "@/lib/agent/v2/fieldVisibilityConfigV0";

/**
 * PUT — merge visibility patch on `field_definitions` (admin). Atomic RPC + audit.
 * Body: field_definition_id, expected_updated_at, visibility_patch (strict v0).
 */
export async function PUT(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const field_definition_id = typeof body.field_definition_id === "string" ? body.field_definition_id.trim() : "";
    const expected_updated_at =
        typeof body.expected_updated_at === "string" ? body.expected_updated_at.trim() : "";

    if (!field_definition_id) {
        return NextResponse.json({ error: "field_definition_id is required" }, { status: 400 });
    }
    if (!expected_updated_at) {
        return NextResponse.json({ error: "expected_updated_at is required" }, { status: 400 });
    }
    if (body.visibility_patch === undefined) {
        return NextResponse.json({ error: "visibility_patch is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: row, error: fetchErr } = await supabase
        .from("field_definitions")
        .select("*")
        .eq("id", field_definition_id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (fetchErr) {
        return NextResponse.json({ error: fetchErr.message }, { status: 400 });
    }
    if (!row) {
        return NextResponse.json({ error: "Field definition not found" }, { status: 404 });
    }

    const r = row as Record<string, unknown>;
    if (getFieldDefinitionLockTimestamp(r) == null) {
        return NextResponse.json(
            { error: "Field definition has no lock timestamp (updated_at/created_at)" },
            { status: 400 }
        );
    }

    if (!lockTimestampMatches(r, expected_updated_at)) {
        return NextResponse.json(
            { error: "field_definitions row was modified (stale expected_updated_at)" },
            { status: 409 }
        );
    }

    const prep = prepareFieldDefinitionVisibilityPatch(r, body.visibility_patch);
    if (!prep.ok) {
        return NextResponse.json({ error: prep.error }, { status: prep.status });
    }

    const proposalId = randomUUID();
    const resultId = randomUUID();
    const requestId = randomUUID();
    const correlationId = randomUUID();

    const intentPayload = {
        source: "admin_put_field_definition_visibility",
        field_definition_id,
        visibility_patch: body.visibility_patch,
    };

    const atomic = await agentV2CommitFieldVisibilityApply(supabase, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        fieldDefinitionId: field_definition_id,
        expectedUpdatedAt: expected_updated_at,
        mergedVisibility: prep.mergedFlags,
        proposalId,
        requestId,
        correlationId,
        intentJson: intentPayload,
        resultId,
    });

    if (!atomic.ok) {
        return NextResponse.json({ error: atomic.error }, { status: atomic.status });
    }

    return NextResponse.json({
        field_definition: atomic.fieldRow,
        audit: { proposal_id: proposalId, result_id: resultId },
    });
}
