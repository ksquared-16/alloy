import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { departmentIdAllowed, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { completeStageWorkWithOutcome } from "@/lib/lifecycle/completeStageWorkWithOutcome";
import type { StageOutcomeExecutionSubject } from "@/lib/lifecycle/executeStageOperatingOutcome";

/** POST — complete stage work and execute configured outcome rules. */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);

    let body: {
        department_id?: string;
        stage_key?: string;
        work_id?: string;
        outcome_key?: string;
        subject?: StageOutcomeExecutionSubject;
    } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const departmentId = body.department_id?.trim() ?? "";
    const stageKey = body.stage_key?.trim() ?? "";
    const workId = body.work_id?.trim() ?? "";
    const outcomeKey = body.outcome_key?.trim() ?? "";
    const subject = body.subject;

    if (!departmentId || !stageKey || !workId || !outcomeKey || !subject?.opportunity_id?.trim()) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!departmentIdAllowed(dim, departmentId)) {
        return NextResponse.json({ error: "Department not in scope" }, { status: 404 });
    }

    const supabase = createAdminClient();
    const result = await completeStageWorkWithOutcome({
        supabase,
        orgId: ctx.orgId,
        userId: ctx.userId,
        departmentId,
        stageKey,
        workId,
        outcomeKey,
        subject,
    });

    if (!result.ok) {
        return NextResponse.json({ error: result.error ?? "Failed", outcome_execution: result.outcome_execution }, { status: 400 });
    }

    return NextResponse.json({
        ok: true,
        outcome_execution: result.outcome_execution,
        queue_refresh_opportunity_id: result.outcome_execution?.queue_refresh_opportunity_id,
    });
}
