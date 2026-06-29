import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    createChargeTemplate,
    createChargeTemplateVersion,
    listChargeTemplates,
    retireChargeTemplate,
    voidScheduledChargeTemplate,
    type ChargeTemplateValueInput,
} from "@/lib/financials/chargeTemplates/chargeTemplateAuthoringService";
import {
    operationalEnrollmentErrorResponse,
    parseJsonObject,
    resolveOperationalEnrollmentTodayYmd,
} from "@/lib/childcareOperational/operationalEnrollmentApi";

/**
 * Charge Templates (Commercial Model, Slice B). GET lists; role-gated POST
 * dispatches by `action`: create | version (supersede) | retire | void.
 * Effective-dated configuration only — posts nothing, writes no ledger/GL/AR.
 */
function valueInput(body: Record<string, unknown>): ChargeTemplateValueInput {
    return {
        serviceId: body.service_id != null ? String(body.service_id) : null,
        label: String(body.label ?? ""),
        description: body.description != null ? String(body.description) : null,
        chargeCategory: String(body.charge_category ?? ""),
        triggerType: String(body.trigger_type ?? ""),
        triggerKey: body.trigger_key != null ? String(body.trigger_key) : null,
        amountStrategy: String(body.amount_strategy ?? ""),
        amountCents: body.amount_cents != null ? Number(body.amount_cents) : null,
        currencyCode: body.currency_code != null ? String(body.currency_code) : null,
        occursOnStrategy: body.occurs_on_strategy != null ? String(body.occurs_on_strategy) : null,
        billableOnStrategy: body.billable_on_strategy != null ? String(body.billable_on_strategy) : null,
        billableOffsetDays: body.billable_offset_days != null ? Number(body.billable_offset_days) : null,
        defaultGlMappingKey: body.default_gl_mapping_key != null ? String(body.default_gl_mapping_key) : null,
        defaultResponsibilityKey: body.default_responsibility_key != null ? String(body.default_responsibility_key) : null,
        reviewRequired: body.review_required === true,
    };
}

export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const supabase = createAdminClient();
    try {
        const templates = await listChargeTemplates(supabase, ctx.orgId);
        return NextResponse.json({ templates });
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}

export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON", code: "invalid_input" }, { status: 400 });
    }

    const action = String(body.action ?? "").trim();
    const supabase = createAdminClient();
    try {
        const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);

        if (action === "create") {
            const template = await createChargeTemplate(supabase, {
                orgId: ctx.orgId,
                templateKey: String(body.template_key ?? ""),
                effectiveStart: String(body.effective_start ?? ""),
                effectiveEnd: body.effective_end != null ? String(body.effective_end) : null,
                metadata: parseJsonObject(body.metadata),
                actorUserId: ctx.userId,
                ...valueInput(body),
            });
            return NextResponse.json({ template }, { status: 201 });
        }

        if (action === "version") {
            const result = await createChargeTemplateVersion(supabase, {
                orgId: ctx.orgId,
                priorId: String(body.prior_id ?? ""),
                effectiveStart: String(body.effective_start ?? ""),
                metadata: parseJsonObject(body.metadata),
                actorUserId: ctx.userId,
                ...valueInput(body),
            });
            return NextResponse.json(result, { status: 201 });
        }

        if (action === "retire") {
            const template = await retireChargeTemplate(supabase, {
                orgId: ctx.orgId,
                id: String(body.id ?? ""),
                effectiveEnd: String(body.effective_end ?? ""),
                todayYmd,
                actorUserId: ctx.userId,
            });
            return NextResponse.json({ template }, { status: 200 });
        }

        if (action === "void") {
            const result = await voidScheduledChargeTemplate(supabase, {
                orgId: ctx.orgId,
                id: String(body.id ?? ""),
                todayYmd,
                actorUserId: ctx.userId,
            });
            return NextResponse.json(result, { status: 200 });
        }

        return NextResponse.json(
            { error: `Unknown action: ${action || "(missing)"}`, code: "invalid_input" },
            { status: 400 },
        );
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}
