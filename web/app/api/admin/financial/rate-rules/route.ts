import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    createRateRule,
    createRateRuleVersion,
    retireRateRule,
    voidScheduledRateRuleVersion,
} from "@/lib/financials/rates/rateAuthoringService";
import {
    operationalEnrollmentErrorResponse,
    parseJsonObject,
    resolveOperationalEnrollmentTodayYmd,
} from "@/lib/childcareOperational/operationalEnrollmentApi";

/**
 * Versioned authoring for childcare rate rules (Operational Configuration V1,
 * Batch 1). A rule prices one schedule basis within a plan. A single role-gated
 * POST dispatches by `action`: create | version (supersede) | retire | void.
 * Currency is inherited from the parent plan. No posting/GL/AR side effects.
 */
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
            const rule = await createRateRule(supabase, {
                orgId: ctx.orgId,
                ratePlanId: String(body.rate_plan_id ?? ""),
                scheduleBasis: String(body.schedule_basis ?? ""),
                rateBasis: String(body.rate_basis ?? ""),
                ageGroupKey: body.age_group_key != null ? String(body.age_group_key) : null,
                amountCents: Number(body.amount_cents),
                effectiveStart: String(body.effective_start ?? ""),
                effectiveEnd: body.effective_end != null ? String(body.effective_end) : null,
                sourceKey: body.source_key != null ? String(body.source_key) : null,
                metadata: parseJsonObject(body.metadata),
                actorUserId: ctx.userId,
            });
            return NextResponse.json({ rule }, { status: 201 });
        }

        if (action === "version") {
            const result = await createRateRuleVersion(supabase, {
                orgId: ctx.orgId,
                priorRuleId: String(body.prior_rule_id ?? ""),
                effectiveStart: String(body.effective_start ?? ""),
                amountCents: body.amount_cents != null ? Number(body.amount_cents) : null,
                rateBasis: body.rate_basis != null ? String(body.rate_basis) : null,
                metadata: parseJsonObject(body.metadata),
                actorUserId: ctx.userId,
            });
            return NextResponse.json(result, { status: 201 });
        }

        if (action === "retire") {
            const rule = await retireRateRule(supabase, {
                orgId: ctx.orgId,
                ruleId: String(body.rule_id ?? ""),
                effectiveEnd: String(body.effective_end ?? ""),
                actorUserId: ctx.userId,
            });
            return NextResponse.json({ rule }, { status: 200 });
        }

        if (action === "void") {
            const result = await voidScheduledRateRuleVersion(supabase, {
                orgId: ctx.orgId,
                ruleId: String(body.rule_id ?? ""),
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
