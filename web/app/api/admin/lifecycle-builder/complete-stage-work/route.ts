import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { departmentIdAllowed, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { completeStageWorkWithOutcome } from "@/lib/lifecycle/completeStageWorkWithOutcome";
import type { StageOutcomeExecutionSubject } from "@/lib/lifecycle/executeStageOperatingOutcome";
import { CORRELATION_ID_HEADER, resolveCorrelationId } from "@/lib/api/correlationId";
import { WORK_OPERATE, requireWorkCapability } from "@/lib/access/workAuthority";

/** POST — complete stage work and execute configured outcome rules. */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);
    /*
     * WORK AUTHORITY — completes a stage work item for one subject.
     *
     * Authority here was PORTAL ADMISSION, which decided nothing about
     * whether this principal may do this job. `work.operate` is the authority now, held by
     * grant and by nothing else.
     */
    const capDenied = requireWorkCapability(access, WORK_OPERATE);
    if (capDenied) return capDenied;

    let body: {
        department_id?: string;
        stage_key?: string;
        work_id?: string;
        outcome_key?: string;
        subject?: StageOutcomeExecutionSubject;
        /** The operator confirmed closing a Tour that is still ahead. */
        confirm_close_scheduled_tour?: boolean;
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
        confirmCloseScheduledTour: body.confirm_close_scheduled_tour === true,
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

    // Not a failure: the outcome would close a Tour that is still ahead, and nothing was written. The
    // caller asks the operator and resubmits with `confirm_close_scheduled_tour: true`.
    if (!result.ok && result.confirmation_required) {
        return NextResponse.json(
            {
                error: result.confirmation_required.message,
                code: result.confirmation_required.kind,
                confirmation_required: result.confirmation_required,
                changed: false,
                correlation_id: result.correlation_id ?? correlationId,
            },
            { status: 409, headers },
        );
    }

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
            scheduled_tour_closed: result.scheduled_tour_closed ?? null,
            transaction: result.transaction,
            correlation_id: result.correlation_id ?? correlationId,
        },
        { headers },
    );
}
