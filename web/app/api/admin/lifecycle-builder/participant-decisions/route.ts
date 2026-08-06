/**
 * Per-participant Decision surface.
 *
 *   GET   the rows — one child, their current path, and the decisions available to them
 *   POST  execute ONE configured decision against ONE explicit child
 *
 * Replaces `/api/admin/opportunities/[id]/decision-split`, which wrote OCM lifecycle status,
 * hardcoded the stage key, and read a `split_rules` shape no tenant had configured.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { departmentIdAllowed, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { CORRELATION_ID_HEADER, resolveCorrelationId } from "@/lib/api/correlationId";
import { resolveParticipantDecisionContext } from "@/lib/lifecycle/resolveParticipantDecisionContext";
import { projectParticipantDecisionRows } from "@/lib/lifecycle/projectParticipantDecisionRows";
import { executeParticipantDecisionForChild } from "@/lib/lifecycle/executeParticipantDecisionForChild";

/** GET — render the participant decision surface for one family's work item. */
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

    const surface = await projectParticipantDecisionRows({
        supabase,
        orgId: ctx.orgId,
        opportunityId,
        plan: resolved.context.plan,
        templateKey: resolved.context.templateKey,
        resolveDecisionLabel: resolved.context.resolveDecisionLabel,
    });

    // No configured participant decisions is not an error — it is a work item that does not have
    // this surface. The client renders nothing.
    if (!surface) return NextResponse.json({ ok: true, configured: false });

    // A decision whose capability the process never selected is withheld rather than rendered as a
    // button that would be refused on click.
    const configured = resolved.context.template.participant_decisions ?? [];
    const withheld = new Map<string, string>();
    for (const decision of configured) {
        const problem = resolved.context.assertCapabilitySelected(decision);
        if (problem) withheld.set(decision.decision_key, problem);
    }

    return NextResponse.json({
        ok: true,
        configured: true,
        template_key: surface.template_key,
        progress: surface.progress,
        rows: surface.rows.map((row) => ({
            ...row,
            decisions: row.decisions.filter((d) => !withheld.has(d.decision_key)),
        })),
        ...(withheld.size ? { configuration_issues: [...withheld.values()] } : {}),
    });
}

/** POST — execute one configured decision for one explicit child. */
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
        decision_key?: string;
        customer_member_id?: string;
        process_instance_id?: string;
        opportunity_customer_member_id?: string;
        participant_label?: string;
        input_values?: Record<string, unknown>;
    } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const opportunityId = body.opportunity_id?.trim() ?? "";
    const departmentId = body.department_id?.trim() ?? "";
    const stageKey = body.stage_key?.trim() ?? "";
    const templateKey = body.template_key?.trim() ?? "";
    const decisionKey = body.decision_key?.trim() ?? "";

    if (!opportunityId || !decisionKey) {
        return NextResponse.json({ error: "opportunity_id and decision_key are required" }, { status: 400 });
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
        stageKey,
        templateKey,
    });
    if (!resolved.ok) {
        return NextResponse.json({ error: resolved.message }, { status: resolved.status, headers });
    }

    // Capability honesty is checked on the WRITE path too, not only when rendering: configuration
    // can change between the surface being drawn and the operator clicking.
    const decision = (resolved.context.template.participant_decisions ?? []).find(
        (d) => d.decision_key === decisionKey,
    );
    if (decision) {
        const problem = resolved.context.assertCapabilitySelected(decision);
        if (problem) {
            return NextResponse.json(
                { error: problem, code: "capability_not_selected" },
                { status: 409, headers },
            );
        }
    }

    const result = await executeParticipantDecisionForChild({
        supabase,
        orgId: ctx.orgId,
        userId: ctx.userId,
        departmentId: resolved.context.departmentId,
        stageKey: resolved.context.stageKey,
        plan: resolved.context.plan,
        templateKey: resolved.context.templateKey,
        decisionKey,
        opportunityId,
        childIdentity: {
            customer_member_id: body.customer_member_id ?? null,
            process_instance_id: body.process_instance_id ?? null,
            opportunity_customer_member_id: body.opportunity_customer_member_id ?? null,
        },
        participantLabel: body.participant_label ?? null,
        inputValues: body.input_values ?? null,
        correlationId,
    });

    if (!result.ok) {
        return NextResponse.json(
            {
                error: result.message,
                code: result.code,
                input_issues: result.input_issues,
                write_error: result.write_error,
                affected: result.affected,
                // The operator's question is "did anything change?" — answered explicitly.
                changed: result.changed ?? false,
                integrity_breach: result.integrity_breach,
                correlation_id: result.correlation_id ?? correlationId,
            },
            // A failed compensation is not a client error: durable state is uncertain and the
            // operator must verify rather than simply retry.
            { status: result.integrity_breach ? 500 : 400, headers },
        );
    }

    // Refresh contract: the family AND the child, always both.
    const surface = await projectParticipantDecisionRows({
        supabase,
        orgId: ctx.orgId,
        opportunityId,
        plan: resolved.context.plan,
        templateKey: resolved.context.templateKey,
        resolveDecisionLabel: resolved.context.resolveDecisionLabel,
    });

    return NextResponse.json(
        {
            ok: true,
            changed: result.changed,
            decision_key: result.decision_key,
            affected: result.affected,
            degraded: result.degraded,
            progress: surface?.progress,
            rows: surface?.rows,
            correlation_id: result.correlation_id || correlationId,
        },
        { headers },
    );
}
