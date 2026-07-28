import { NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    createOrgAssignmentType,
    loadOrgAssignmentTypesAdmin,
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

/** GET — all org Assignment Types (active + archived). POST — create. */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const supabase = createAdminClient();
    try {
        const types = await loadOrgAssignmentTypesAdmin(supabase, ctx.orgId);
        return NextResponse.json({ types });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Could not load Assignment Types";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const supabase = createAdminClient();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    try {
        const created = await createOrgAssignmentType(supabase, ctx.orgId, parseWriteInput(body));
        return NextResponse.json({ type: created }, { status: 201 });
    } catch (err) {
        if (err instanceof OperationalEnrollmentServiceError) {
            return NextResponse.json({ error: err.message, code: err.code }, { status: 422 });
        }
        const message = err instanceof Error ? err.message : "Could not create Assignment Type";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
