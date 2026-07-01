import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    previewTemplateCharge,
    writeTemplateDraftCharge,
    type SimulateArgs,
} from "@/lib/financials/chargeLifecycle/chargeLifecycleService";
import {
    operationalEnrollmentErrorResponse,
    resolveOperationalEnrollmentTodayYmd,
} from "@/lib/childcareOperational/operationalEnrollmentApi";

/**
 * Charge Template Simulator (Commercial Model, Slice D). Resolves a configured
 * Charge Template into a draft/scheduled Charge intent. Role-gated POST:
 *   action=preview — resolve only (writes nothing).
 *   action=draft   — idempotently write a status='draft' charge (requires an
 *                    enrollment agreement). Never posts; never mutates posted.
 * No invoices/ledger/payments/AR.
 */
function argsFrom(body: Record<string, unknown>, today: string): SimulateArgs {
    return {
        templateId: String(body.template_id ?? ""),
        agreementId: body.agreement_id != null ? String(body.agreement_id) : null,
        eventDate: body.event_date != null ? String(body.event_date) : null,
        servicePeriodStart: body.service_period_start != null ? String(body.service_period_start) : null,
        quantity: body.quantity != null ? Number(body.quantity) : null,
        unitAmountCents: body.unit_amount_cents != null ? Number(body.unit_amount_cents) : null,
        today,
    };
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

    const action = String(body.action ?? "preview").trim();
    const supabase = createAdminClient();
    try {
        const today = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
        const args = argsFrom(body, today);
        if (!args.templateId) {
            return NextResponse.json({ error: "template_id is required", code: "invalid_input" }, { status: 400 });
        }

        if (action === "preview") {
            const result = await previewTemplateCharge(supabase, ctx.orgId, args);
            return NextResponse.json(result, { status: 200 });
        }
        if (action === "draft") {
            const result = await writeTemplateDraftCharge(supabase, ctx.orgId, { ...args, actorUserId: ctx.userId });
            return NextResponse.json(result, { status: 200 });
        }
        return NextResponse.json({ error: `Unknown action: ${action}`, code: "invalid_input" }, { status: 400 });
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}
