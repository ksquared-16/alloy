import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    createInitialScheduleAssignment,
    listScheduleAssignments,
    supersedeScheduleAssignment,
} from "@/lib/childcareOperational/scheduleAssignmentService";
import {
    operationalEnrollmentErrorResponse,
    parseJsonObject,
    resolveOperationalEnrollmentTodayYmd,
} from "@/lib/childcareOperational/operationalEnrollmentApi";

export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return adminContextFailureResponse(ctx);
    }

    const { searchParams } = new URL(request.url);
    const enrollmentAgreementId = (searchParams.get("enrollment_agreement_id") ?? "").trim();
    const customerMemberId = (searchParams.get("customer_member_id") ?? "").trim();

    const supabase = createAdminClient();
    try {
        const assignments = await listScheduleAssignments(supabase, ctx.orgId, {
            enrollmentAgreementId: enrollmentAgreementId || undefined,
            customerMemberId: customerMemberId || undefined,
        });
        return NextResponse.json({ assignments });
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}

export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return adminContextFailureResponse(ctx);
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON", code: "invalid_input" }, { status: 400 });
    }

    const enrollmentAgreementId = String(body.enrollment_agreement_id ?? "").trim();
    const schedulePatternId = String(body.schedule_pattern_id ?? "").trim();
    const startDate = String(body.start_date ?? "").trim();
    if (!enrollmentAgreementId || !schedulePatternId || !startDate) {
        return NextResponse.json(
            {
                error: "enrollment_agreement_id, schedule_pattern_id, and start_date are required",
                code: "invalid_input",
            },
            { status: 400 }
        );
    }

    const supersede = body.supersede === true;

    const supabase = createAdminClient();
    try {
        const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
        const input = {
            orgId: ctx.orgId,
            enrollmentAgreementId,
            schedulePatternId,
            startDate,
            sourceKey: body.source_key != null ? String(body.source_key) : undefined,
            metadata: parseJsonObject(body.metadata),
            actorUserId: ctx.userId,
            todayYmd,
        };

        const assignment = supersede
            ? await supersedeScheduleAssignment(supabase, input)
            : await createInitialScheduleAssignment(supabase, input);

        return NextResponse.json({ assignment }, { status: 201 });
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}
