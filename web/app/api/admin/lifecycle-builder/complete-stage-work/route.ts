import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { departmentIdAllowed, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { completeStageWorkWithOutcome } from "@/lib/lifecycle/completeStageWorkWithOutcome";
import type { StageOutcomeExecutionSubject } from "@/lib/lifecycle/executeStageOperatingOutcome";
import { CORRELATION_ID_HEADER, resolveCorrelationId } from "@/lib/api/correlationId";

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
    const correlationId = resolveCorrelationId(request);
    const result = await completeStageWorkWithOutcome({
        supabase,
        orgId: ctx.orgId,
        userId: ctx.userId,
        departmentId,
        stageKey,
        workId,
        outcomeKey,
        subject,
        correlationId,
        // A double-submitted outcome joins the running transaction instead of executing twice.
        idempotencyKey: `${ctx.orgId}:${workId}:${outcomeKey}`,
    });

    const headers = { [CORRELATION_ID_HEADER]: result.correlation_id ?? correlationId };

    // The rollback plan is internal machinery, not part of the operator-facing result. Its
    // closures serialize to hollow objects and only bloat the response.
    const outcomeExecution =
        result.outcome_execution ?
            (({ undo: _undo, ...rest }) => rest)(result.outcome_execution)
        :   undefined;

    if (!result.ok) {
        return NextResponse.json(
            {
                error: result.error ?? "Failed",
                outcome_execution: outcomeExecution,
                // The operator's question is "did anything change?" — answer it explicitly.
                changed: result.changed ?? false,
                integrity_breach: result.integrity_breach,
                transaction: result.transaction,
                correlation_id: result.correlation_id ?? correlationId,
            },
            // A failed rollback is not a client error: durable state is uncertain and the
            // operator must be told to verify rather than simply retry.
            { status: result.integrity_breach ? 500 : 400, headers },
        );
    }

    return NextResponse.json(
        {
            ok: true,
            outcome_execution: outcomeExecution,
            queue_refresh_opportunity_id: result.outcome_execution?.queue_refresh_opportunity_id,
            transaction: result.transaction,
            correlation_id: result.correlation_id ?? correlationId,
        },
        { headers },
    );
}
