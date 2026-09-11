import { NextResponse } from "next/server";

import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import {
    CANONICALLY_IDENTIFIED_TYPES,
    FUNDING_SOURCE_TYPES,
    FUNDING_SOURCE_TYPE_LABELS,
    readFundingAgencies,
} from "@/lib/financials/responsibility/fundingSources";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/funding-sources — what a share's funding can be expected FROM.
 *
 * Two different answers in one shape, deliberately:
 *
 *   · `types` is the capability's own closed vocabulary, quoted rather than re-listed, so this
 *     route cannot drift from what `configureExpectedFunding` will accept.
 *   · `agencies` is the canonical registry for the one type that has one — `government_subsidy`,
 *     over Thread 9's `financial_funding_agencies`. The id travels as the expectation's
 *     `funding_source_reference`, which is what keeps the expectation, the authorization, the claim
 *     and the remittance about the same agency.
 *
 * `requiresCanonicalSource` says which types must be picked rather than typed. The other four have
 * no registry in this platform, and this route says so rather than implying a choice that does not
 * exist.
 *
 * Reading where money might come from is `fin.read`. This route executes nothing and expects nothing.
 */
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
        const agencies = await readFundingAgencies(supabase, { orgId: ctx.orgId });
        return NextResponse.json({
            ok: true,
            types: FUNDING_SOURCE_TYPES.map((key) => ({
                key,
                label: FUNDING_SOURCE_TYPE_LABELS[key] ?? key,
                requiresCanonicalSource: CANONICALLY_IDENTIFIED_TYPES.includes(key),
            })),
            agencies,
        });
    } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
}
