import { NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    reorderOrgAssignmentTypes,
    setOrgAssignmentTypeActive,
    updateOrgAssignmentType,
    type AssignmentTypeWriteInput,
} from "@/lib/operationalAssignments/assignmentTypeService";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";

function parseWriteInput(body: Record<string, unknown>): AssignmentTypeWriteInput {
    const subjectTypesRaw = Array.isArray(body.subjectTypes) ? body.subjectTypes : ["child"];
    const subjectTypes = subjectTypesRaw.filter(
        (s): s is "child" | "staff" => s === "child" || s === "staff",
    );
    return {
        label: String(body.label ?? "").trim(),
        iconKey: body.iconKey != null ? String(body.iconKey) : undefined,
        visualTone: body.visualTone as AssignmentTypeWriteInput["visualTone"],
        subjectTypes: subjectTypes.length ? subjectTypes : ["child"],
        billingParticipation: body.billingParticipation as AssignmentTypeWriteInput["billingParticipation"],
        attendanceParticipation: body.attendanceParticipation as AssignmentTypeWriteInput["attendanceParticipation"],
        staffingParticipation: body.staffingParticipation as AssignmentTypeWriteInput["staffingParticipation"],
        sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
        behavior:
            body.behavior && typeof body.behavior === "object"
                ? (body.behavior as AssignmentTypeWriteInput["behavior"])
                : undefined,
    };
}

type RouteParams = { params: Promise<{ id: string }> };

/** PATCH — update fields, archive/activate, or reorder sibling types. */
export async function PATCH(request: Request, { params }: RouteParams) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const supabase = createAdminClient();
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    try {
        if (body.action === "reorder" && Array.isArray(body.orderedIds)) {
            await reorderOrgAssignmentTypes(
                supabase,
                ctx.orgId,
                (body.orderedIds as unknown[]).map(String),
            );
            return NextResponse.json({ ok: true });
        }
        if (body.action === "archive") {
            const type = await setOrgAssignmentTypeActive(supabase, ctx.orgId, id, false);
            return NextResponse.json({ type });
        }
        if (body.action === "activate") {
            const type = await setOrgAssignmentTypeActive(supabase, ctx.orgId, id, true);
            return NextResponse.json({ type });
        }
        const type = await updateOrgAssignmentType(
            supabase,
            ctx.orgId,
            id,
            parseWriteInput(body),
        );
        return NextResponse.json({ type });
    } catch (err) {
        if (err instanceof OperationalEnrollmentServiceError) {
            const status = err.code === "conflict" ? 409 : err.code === "not_found" ? 404 : 422;
            return NextResponse.json({ error: err.message, code: err.code }, { status });
        }
        const message = err instanceof Error ? err.message : "Could not update Assignment Type";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
