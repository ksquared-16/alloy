import { NextRequest, NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { emitEvent } from "@/lib/emitEvent";
import { assertFinancialsReadAllowed, assertFinancialsWriteAllowed } from "@/lib/financials/financialsPermissions";
import {
    isOperatorPaymentMethod,
    OPERATOR_PAYMENT_METHODS,
    PAYMENT_METHOD_GL_MAPPING_KEY,
    PAYMENT_METHOD_LABELS,
    PROCESSOR_METHODS,
    readDisabledPaymentMethods,
    setPaymentMethodAccepted,
} from "@/lib/financials/payments/acceptedPaymentMethods";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * WHICH PAYMENT METHODS THIS ORGANIZATION ACCEPTS (W7-F047).
 *
 * GET lists every method staff can take or record, whether it is accepted, whether it is collected
 * through the processor, and the mapping key its destination account is configured under (the
 * destination itself is read and written through `/gl-mappings`, which keeps asset-only enforcement
 * in one place). PUT turns one method on or off. Configuration only: no payment is touched.
 */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const supabase = createAdminClient();
    const allowed = await assertFinancialsReadAllowed({ supabase, orgId: ctx.orgId, userId: ctx.userId });
    if (!allowed.ok) return NextResponse.json({ error: allowed.message, required_permission: allowed.requiredPermission }, { status: 403 });
    const disabled = await readDisabledPaymentMethods(supabase, ctx.orgId);
    return NextResponse.json({
        ok: true,
        methods: OPERATOR_PAYMENT_METHODS.map((method) => ({
            method,
            label: PAYMENT_METHOD_LABELS[method],
            accepted: !disabled.has(method),
            processor: PROCESSOR_METHODS.has(method) ? "stripe" : null,
            mappingKey: PAYMENT_METHOD_GL_MAPPING_KEY[method],
        })),
    });
}

export async function PUT(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const supabase = createAdminClient();
    const allowed = await assertFinancialsWriteAllowed({ supabase, orgId: ctx.orgId, userId: ctx.userId });
    if (!allowed.ok) return NextResponse.json({ error: allowed.message, required_permission: allowed.requiredPermission }, { status: 403 });
    const body = (await request.json().catch(() => ({}))) as { method?: unknown; accepted?: unknown };
    if (!isOperatorPaymentMethod(body.method) || typeof body.accepted !== "boolean") {
        return NextResponse.json({ error: "Name a payment method and whether it is accepted." }, { status: 400 });
    }
    try {
        const disabled = await setPaymentMethodAccepted(supabase, ctx.orgId, body.method, body.accepted);
        await emitEvent({
            org_id: ctx.orgId,
            event_type: body.accepted ? "financials.payment_method.accepted" : "financials.payment_method.turned_off",
            entity_type: "payment_method_setting",
            entity_id: body.method,
            payload: { method: body.method, accepted: body.accepted },
        }).catch(() => {});
        return NextResponse.json({ ok: true, method: body.method, accepted: !disabled.has(body.method) });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "The setting could not be saved." }, { status: 500 });
    }
}
