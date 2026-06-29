import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    createFinancialPolicy,
    createFinancialPolicyVersion,
    listFinancialPolicies,
    retireFinancialPolicy,
    voidScheduledFinancialPolicy,
} from "@/lib/financials/policies/financialPolicyService";
import {
    operationalEnrollmentErrorResponse,
    parseJsonObject,
    resolveOperationalEnrollmentTodayYmd,
} from "@/lib/childcareOperational/operationalEnrollmentApi";

/**
 * Financial Policies (Commercial Model, Slice C). Scoped, effective-dated config.
 * GET lists; role-gated POST dispatches by `action`: create | version (supersede)
 * | retire | void. Configuration only — posts nothing, writes no ledger/GL/AR.
 */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const supabase = createAdminClient();
    try {
        const policies = await listFinancialPolicies(supabase, ctx.orgId);
        return NextResponse.json({ policies });
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
            const policy = await createFinancialPolicy(supabase, {
                orgId: ctx.orgId,
                scopeType: String(body.scope_type ?? ""),
                locationId: body.location_id != null ? String(body.location_id) : null,
                serviceId: body.service_id != null ? String(body.service_id) : null,
                ratePlanId: body.rate_plan_id != null ? String(body.rate_plan_id) : null,
                policyType: String(body.policy_type ?? ""),
                label: body.label != null ? String(body.label) : null,
                description: body.description != null ? String(body.description) : null,
                value: parseJsonObject(body.value),
                effectiveStart: String(body.effective_start ?? ""),
                effectiveEnd: body.effective_end != null ? String(body.effective_end) : null,
                metadata: parseJsonObject(body.metadata),
                actorUserId: ctx.userId,
            });
            return NextResponse.json({ policy }, { status: 201 });
        }

        if (action === "version") {
            const result = await createFinancialPolicyVersion(supabase, {
                orgId: ctx.orgId,
                priorId: String(body.prior_id ?? ""),
                effectiveStart: String(body.effective_start ?? ""),
                label: body.label !== undefined ? (body.label != null ? String(body.label) : null) : undefined,
                description: body.description !== undefined ? (body.description != null ? String(body.description) : null) : undefined,
                value: body.value !== undefined ? parseJsonObject(body.value) : undefined,
                metadata: parseJsonObject(body.metadata),
                actorUserId: ctx.userId,
            });
            return NextResponse.json(result, { status: 201 });
        }

        if (action === "retire") {
            const policy = await retireFinancialPolicy(supabase, {
                orgId: ctx.orgId,
                id: String(body.id ?? ""),
                effectiveEnd: String(body.effective_end ?? ""),
                todayYmd,
                actorUserId: ctx.userId,
            });
            return NextResponse.json({ policy }, { status: 200 });
        }

        if (action === "void") {
            const result = await voidScheduledFinancialPolicy(supabase, {
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
