import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { updateSchedulePattern } from "@/lib/childcareOperational/schedulePatternService";
import {
    operationalEnrollmentErrorResponse,
    parseJsonObject,
    parseWeekdays,
} from "@/lib/childcareOperational/operationalEnrollmentApi";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return adminContextFailureResponse(ctx);
    }

    const { id } = await context.params;
    const patternId = (id ?? "").trim();
    if (!patternId) {
        return NextResponse.json({ error: "id is required", code: "invalid_input" }, { status: 400 });
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON", code: "invalid_input" }, { status: 400 });
    }

    const weekdays =
        body.weekdays !== undefined ? parseWeekdays(body.weekdays) : undefined;
    if (body.weekdays !== undefined && !weekdays) {
        return NextResponse.json(
            { error: "weekdays must be a non-empty array of integers 0-6", code: "invalid_input" },
            { status: 400 }
        );
    }

    const supabase = createAdminClient();
    try {
        const pattern = await updateSchedulePattern(supabase, {
            orgId: ctx.orgId,
            patternId,
            label: body.label != null ? String(body.label) : undefined,
            scheduleTypeKey:
                body.schedule_type_key != null ? String(body.schedule_type_key) : undefined,
            weekdays: weekdays ?? undefined,
            sortOrder: body.sort_order != null ? Number(body.sort_order) : undefined,
            isActive: body.is_active != null ? Boolean(body.is_active) : undefined,
            metadata: body.metadata != null ? parseJsonObject(body.metadata) : undefined,
        });
        return NextResponse.json({ pattern });
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}
