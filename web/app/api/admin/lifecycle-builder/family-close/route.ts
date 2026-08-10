/**
 * Governed family close.
 *
 *   GET   the preview — who gets closed, who is skipped, what blocks it
 *   POST  execute
 *
 * Both answers come from the same planner, so the confirmation an operator reads is the
 * computation that will run.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { departmentIdAllowed, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { CORRELATION_ID_HEADER, resolveCorrelationId } from "@/lib/api/correlationId";
import { resolveParticipantDecisionContext } from "@/lib/lifecycle/resolveParticipantDecisionContext";
import {
    executeGovernedFamilyClose,
    previewGovernedFamilyClose,
    resolveFamilyCloseConfig,
} from "@/lib/lifecycle/executeGovernedFamilyClose";

export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);

    const q = request.nextUrl.searchParams;
    const opportunityId = q.get("opportunity_id")?.trim() ?? "";
    const departmentId = q.get("department_id")?.trim() ?? "";
    const stageKey = q.get("stage_key")?.trim() ?? "";
    const templateKey = q.get("template_key")?.trim() ?? "";

    if (!opportunityId) {
        return NextResponse.json({ error: "opportunity_id is required" }, { status: 400 });
    }
    if (!departmentIdAllowed(dim, departmentId)) {
        return NextResponse.json({ error: "Department not in scope" }, { status: 404 });
    }

    const supabase = createAdminClient();
    const resolved = await resolveParticipantDecisionContext({
        supabase,
        orgId: ctx.orgId,
        departmentId,
        stageKey,
        templateKey,
    });
    if (!resolved.ok) {
        return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    }

    const config = resolveFamilyCloseConfig(resolved.context.plan, resolved.context.templateKey);
    // Not configured is not an error — it is a work item that does not offer this operation.
    if (!config || config.available === false) {
        return NextResponse.json({ ok: true, configured: false });
    }

    const problem = resolved.context.assertCapabilitySelected({ action_ref: config.action_ref });
    if (problem) {
        return NextResponse.json({ ok: true, configured: false, configuration_issue: problem });
    }

    const plan = await previewGovernedFamilyClose({
        supabase,
        orgId: ctx.orgId,
        opportunityId,
    });

    return NextResponse.json({
        ok: true,
        configured: true,
        label: config.label?.trim() || "Close Family",
        child_outcome_label: config.child_outcome_label?.trim() || "closed",
        required_inputs: config.required_inputs ?? [],
        allowed: plan.allowed,
        closing: plan.closing,
        skipped: plan.skipped,
        blocks: plan.blocks,
    });
}

export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);

    let body: {
        opportunity_id?: string;
        department_id?: string;
        stage_key?: string;
        template_key?: string;
        input_values?: Record<string, unknown>;
    } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const opportunityId = body.opportunity_id?.trim() ?? "";
    const departmentId = body.department_id?.trim() ?? "";
    if (!opportunityId) {
        return NextResponse.json({ error: "opportunity_id is required" }, { status: 400 });
    }
    if (!departmentIdAllowed(dim, departmentId)) {
        return NextResponse.json({ error: "Department not in scope" }, { status: 404 });
    }

    const supabase = createAdminClient();
    const correlationId = resolveCorrelationId(request);
    const headers = { [CORRELATION_ID_HEADER]: correlationId };

    const resolved = await resolveParticipantDecisionContext({
        supabase,
        orgId: ctx.orgId,
        departmentId,
        stageKey: body.stage_key?.trim() ?? "",
        templateKey: body.template_key?.trim() ?? "",
    });
    if (!resolved.ok) {
        return NextResponse.json({ error: resolved.message }, { status: resolved.status, headers });
    }

    // Capability honesty on the write path too — configuration can change between the operator
    // opening the preview and confirming it.
    const config = resolveFamilyCloseConfig(resolved.context.plan, resolved.context.templateKey);
    if (config) {
        const problem = resolved.context.assertCapabilitySelected({ action_ref: config.action_ref });
        if (problem) {
            return NextResponse.json(
                { error: problem, code: "capability_not_selected" },
                { status: 409, headers },
            );
        }
    }

    const result = await executeGovernedFamilyClose({
        supabase,
        orgId: ctx.orgId,
        userId: ctx.userId,
        departmentId: resolved.context.departmentId,
        stageKey: resolved.context.stageKey,
        plan: resolved.context.plan,
        templateKey: resolved.context.templateKey,
        opportunityId,
        inputValues: body.input_values ?? null,
        correlationId,
    });

    if (!result.ok) {
        return NextResponse.json(
            {
                error: result.message,
                code: result.code,
                blocks: result.blocks,
                input_issues: result.input_issues,
                affected: result.affected,
                changed: result.changed ?? false,
                integrity_breach: result.integrity_breach,
                correlation_id: result.correlation_id ?? correlationId,
            },
            // A failed compensation is not a client error: durable state is uncertain and the
            // operator must verify rather than retry.
            { status: result.integrity_breach ? 500 : 400, headers },
        );
    }

    return NextResponse.json(
        {
            ok: true,
            affected: result.affected,
            closed_children: result.plan.closing,
            skipped_children: result.plan.skipped,
            degraded: result.degraded,
            correlation_id: result.correlation_id,
        },
        { headers },
    );
}
