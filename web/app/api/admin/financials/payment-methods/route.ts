import { NextResponse } from "next/server";

import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { readAccountMethods } from "@/lib/financials/payments/paymentMethodService";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * GET /api/admin/financials/payment-methods?customer_id=…
 *
 * What is on file for one account, in a form safe to render: brand, last four, expiry, rail and
 * state. Never a provider reference, and there is nothing else it could return — Alloy holds no
 * credential to leak.
 *
 * READ ONLY. Adding, defaulting and removing are registered actions behind `fin.write`; SEEING what
 * is on file is an ordinary Financials read. A route that also mutated would be a second authority
 * over which card a family pays with.
 *
 * The ORGANIZATION comes from the authenticated gate and never from the query. The ACCOUNT is named
 * in the query and scoped by that organization, so naming another tenant's customer returns nothing
 * rather than their methods.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);
    const ctx = gate.access;

    const supabase = createAdminClient();
    const allowed = await assertFinancialsReadAllowed({ supabase, orgId: ctx.orgId, userId: ctx.userId });
    if (!allowed.ok) {
        return NextResponse.json(
            { error: allowed.message, required_permission: allowed.requiredPermission },
            { status: 403 },
        );
    }

    const customerId = (new URL(request.url).searchParams.get("customer_id") ?? "").trim();
    if (!customerId) {
        return NextResponse.json({ error: "An account is required." }, { status: 400 });
    }

    try {
        const methods = await readAccountMethods(supabase, { orgId: ctx.orgId, customerId });
        return NextResponse.json({
            ok: true,
            methods: methods.map((m) => ({
                id: m.id,
                rail: m.rail,
                brand: m.brand,
                last4: m.last4,
                expMonth: m.expMonth,
                expYear: m.expYear,
                verificationState: m.verificationState,
                usabilityState: m.usabilityState,
                isDefault: m.isDefault,
                revokedAt: m.revokedAt,
            })),
        });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Payment methods could not be read." },
            { status: 500 },
        );
    }
}
