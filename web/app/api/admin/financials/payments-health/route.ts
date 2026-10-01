import { NextResponse } from "next/server";

import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { computePaymentsConfigurationHealth } from "@/lib/financials/payments/paymentsConfigurationHealth";
import { readInstallationState } from "@/lib/financials/payments/providerInstallation";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * GET /api/admin/financials/payments-health
 *
 * Can this runtime take money, and if not, what is missing? Answerable without pressing a financial
 * control — which is how every requirement in this contract was discovered until now.
 *
 * READ ONLY, and it returns no value from any credential. Presence and mode only, both derived in
 * `computePaymentsConfigurationHealth`, neither reversible. `fin.read` is the gate: knowing whether
 * the organisation can accept payments is an ordinary Financials read, and nothing here mutates.
 *
 * The merchant's readiness is included because configuration and provider readiness are different
 * failures with the same symptom — "we cannot take a card" — and an operator staring at that should
 * not have to guess which one they have.
 */
export const dynamic = "force-dynamic";

export async function GET() {
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

    try {
        const configuration = computePaymentsConfigurationHealth(process.env);
        const installation = await readInstallationState(supabase, ctx.orgId);
        return NextResponse.json({
            ok: true,
            configuration,
            merchant: {
                connected: installation.connected,
                readiness: installation.readiness,
                achReadiness: installation.achReadiness,
                cardAvailable: installation.cardAvailable,
                bankAvailable: installation.bankAvailable,
            },
        });
    } catch (e) {
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : "Payments health could not be read." },
            { status: 500 },
        );
    }
}
