import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    createRatePlan,
    createRatePlanVersion,
    retireRatePlan,
    voidScheduledRatePlanVersion,
} from "@/lib/financials/rates/rateAuthoringService";
import {
    operationalEnrollmentErrorResponse,
    parseJsonObject,
    resolveOperationalEnrollmentTodayYmd,
} from "@/lib/childcareOperational/operationalEnrollmentApi";

/**
 * Versioned authoring for childcare rate plans (Operational Configuration V1,
 * Batch 1). A single role-gated POST dispatches by `action`:
 *   create  — genesis plan
 *   version — supersede with a new effective-dated version (rules carried forward)
 *   retire  — close the effective window (non-destructive)
 *   void    — delete a not-yet-started version (rollback) and reopen its predecessor
 *
 * Effective-dated truth is never overwritten in place. No posting, payments,
 * subsidy, or GL writes occur here — this authors L1 rate CONFIGURATION only.
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
            const plan = await createRatePlan(supabase, {
                orgId: ctx.orgId,
                scopeType: String(body.scope_type ?? ""),
                siteLocationId: body.site_location_id != null ? String(body.site_location_id) : null,
                programCategoryId: body.program_category_id != null ? String(body.program_category_id) : null,
                roomLocationId: body.room_location_id != null ? String(body.room_location_id) : null,
                ageGroupKey: body.age_group_key != null ? String(body.age_group_key) : null,
                planKey: String(body.plan_key ?? ""),
                serviceId: body.service_id != null ? String(body.service_id) : null,
                label: body.label != null ? String(body.label) : null,
                currencyCode: body.currency_code != null ? String(body.currency_code) : null,
                billingBasis: String(body.billing_basis ?? ""),
                calculationStrategy: body.calculation_strategy != null ? String(body.calculation_strategy) : null,
                prorationMethod: body.proration_method != null ? String(body.proration_method) : null,
                billingCadence: body.billing_cadence != null ? String(body.billing_cadence) : null,
                effectiveStart: String(body.effective_start ?? ""),
                effectiveEnd: body.effective_end != null ? String(body.effective_end) : null,
                sourceKey: body.source_key != null ? String(body.source_key) : null,
                metadata: parseJsonObject(body.metadata),
                actorUserId: ctx.userId,
            });
            return NextResponse.json({ plan }, { status: 201 });
        }

        if (action === "version") {
            const result = await createRatePlanVersion(supabase, {
                orgId: ctx.orgId,
                priorPlanId: String(body.prior_plan_id ?? ""),
                effectiveStart: String(body.effective_start ?? ""),
                label: body.label !== undefined ? (body.label != null ? String(body.label) : null) : undefined,
                currencyCode: body.currency_code != null ? String(body.currency_code) : null,
                billingBasis: body.billing_basis != null ? String(body.billing_basis) : null,
                calculationStrategy: body.calculation_strategy != null ? String(body.calculation_strategy) : null,
                prorationMethod:
                    body.proration_method !== undefined
                        ? body.proration_method != null
                            ? String(body.proration_method)
                            : null
                        : undefined,
                billingCadence:
                    body.billing_cadence !== undefined
                        ? body.billing_cadence != null
                            ? String(body.billing_cadence)
                            : null
                        : undefined,
                carryForwardRules: body.carry_forward_rules !== false,
                metadata: parseJsonObject(body.metadata),
                actorUserId: ctx.userId,
            });
            return NextResponse.json(result, { status: 201 });
        }

        if (action === "retire") {
            const plan = await retireRatePlan(supabase, {
                orgId: ctx.orgId,
                planId: String(body.plan_id ?? ""),
                effectiveEnd: String(body.effective_end ?? ""),
                todayYmd,
                actorUserId: ctx.userId,
            });
            return NextResponse.json({ plan }, { status: 200 });
        }

        if (action === "void") {
            const result = await voidScheduledRatePlanVersion(supabase, {
                orgId: ctx.orgId,
                planId: String(body.plan_id ?? ""),
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
